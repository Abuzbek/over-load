import { appSettings, newId, programDays, programs, workouts, type Db, type Program, type Workout } from '@overload/schema';
import { and, eq, inArray, isNull, max, sql } from 'drizzle-orm';
import { SETTINGS_ID } from './settingsRepo';

export type ProgramSummary = { program: Program; trainingDays: number; isActive: boolean };

export type ProgramDay = { dayIndex: number; workout: Workout | null; completedAt: number | null };

/** A new program starts as a week's worth of days; the cycle is not fixed to it. */
export const DEFAULT_DAY_COUNT = 7;
/** A guard rail, not a product rule. Cycles this long are not a real use case. */
export const MAX_DAY_COUNT = 100;

function getSettingsRow(db: Db) {
  return db.select().from(appSettings).where(isNull(appSettings.deletedAt)).get();
}

/**
 * `app_settings` is a single-row table (see settingsRepo.ts). Writing
 * activeProgramId is the only place "exactly one active program" is
 * enforced: it is one column on one row, so activating B necessarily
 * overwrites A there is never a moment with both or neither set.
 */
export function activateProgram(db: Db, programId: string, at: number): void {
  const row = getSettingsRow(db);
  if (row) {
    db.update(appSettings).set({ activeProgramId: programId, updatedAt: at }).where(eq(appSettings.id, row.id)).run();
    return;
  }
  db.insert(appSettings).values({ id: SETTINGS_ID, activeProgramId: programId, createdAt: at, updatedAt: at }).run();
}

export function getActiveProgram(db: Db): Program | undefined {
  const activeId = getSettingsRow(db)?.activeProgramId;
  if (!activeId) return undefined;
  return db.select().from(programs).where(and(eq(programs.id, activeId), isNull(programs.deletedAt))).get();
}

/**
 * A new program starts with DEFAULT_DAY_COUNT day rows, created here in the
 * same transaction as the program itself. Rest is represented by a null
 * workoutId on a row that exists, never by a missing row — see
 * setProgramDay.
 */
export function createProgram(
  db: Db,
  values: { name: string; icon?: string; iconColor?: string; generated?: boolean },
  at: number,
  /** Days in the new cycle: seven, or one for a program built from scratch, which grows it. */
  dayCount = DEFAULT_DAY_COUNT,
): Program {
  const highest = db.select({ maxIndex: max(programs.orderIndex) }).from(programs).get();
  const row = {
    id: newId(),
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    name: values.name,
    icon: values.icon ?? null,
    iconColor: values.iconColor ?? null,
    orderIndex: (highest?.maxIndex ?? -1) + 1,
    cycleNumber: 1,
    generated: values.generated ?? false,
  };

  db.transaction((tx) => {
    tx.insert(programs).values(row).run();
    tx.insert(programDays)
      .values(
        Array.from({ length: dayCount }, (_, dayIndex) => ({
          id: newId(),
          createdAt: at,
          updatedAt: at,
          deletedAt: null,
          programId: row.id,
          dayIndex,
          workoutId: null,
        })),
      )
      .run();
  });

  return row;
}

/**
 * Assigns (or clears, with workoutId null) the workout for one day of a
 * program's cycle. Always an update to the existing row — day rows created
 * by createProgram or addProgramDay are never deleted.
 */
export function setProgramDay(db: Db, programId: string, dayIndex: number, workoutId: string | null, at: number): void {
  // Upsert, not update. createProgram writes its days up front, but programs
  // created before program_days existed have none — and a bare UPDATE against
  // a missing row silently does nothing, so the day would never change and
  // nothing would report an error. Found exactly that way: on a device, tapping
  // a day did nothing at all.
  const existing = db
    .select({ id: programDays.id })
    .from(programDays)
    .where(
      and(
        eq(programDays.programId, programId),
        eq(programDays.dayIndex, dayIndex),
        isNull(programDays.deletedAt),
      ),
    )
    .get();

  if (existing) {
    db.update(programDays).set({ workoutId, updatedAt: at }).where(eq(programDays.id, existing.id)).run();
    return;
  }

  db.insert(programDays)
    .values({ id: newId(), createdAt: at, updatedAt: at, deletedAt: null, programId, dayIndex, workoutId })
    .run();
}

/**
 * The program's day cycle in order — however many days it has, which is not
 * fixed at seven. An unknown or tombstoned program reads as no days at all.
 *
 * Three joined levels, each with its own tombstone filter: programs ->
 * program_days -> workouts. A tombstoned program, day row, or workout all
 * read as rest rather than as a dangling reference.
 */
export function getProgramDays(db: Db, programId: string): ProgramDay[] {
  const program = db
    .select()
    .from(programs)
    .where(and(eq(programs.id, programId), isNull(programs.deletedAt)))
    .get();
  if (!program) return [];

  const days = db
    .select()
    .from(programDays)
    .where(and(eq(programDays.programId, programId), isNull(programDays.deletedAt)))
    .orderBy(programDays.dayIndex)
    .all();

  const workoutIds = days.map((d) => d.workoutId).filter((id): id is string => id !== null);
  const liveWorkouts = workoutIds.length
    ? db.select().from(workouts).where(and(inArray(workouts.id, workoutIds), isNull(workouts.deletedAt))).all()
    : [];
  const workoutById = new Map(liveWorkouts.map((r) => [r.id, r]));

  return days.map((day) => ({
    dayIndex: day.dayIndex,
    workout: day.workoutId ? (workoutById.get(day.workoutId) ?? null) : null,
    completedAt: day.completedAt,
  }));
}

/**
 * Rolls the cycle over once every day has been ticked off: clears the ticks and
 * advances the cycle number, so day one is outstanding again.
 *
 * Called after anything that completes a day. Returns whether it rolled.
 *
 * Two deliberate edges:
 *
 * - A program with no days never rolls. `every` on an empty list is true, which
 *   would advance the cycle on every call, forever.
 * - Unticking a day after a roll does NOT roll back. You land in the new cycle
 *   with a day outstanding, which is what "I marked that by mistake" should
 *   mean. Rolling backwards would have to guess which cycle the untick belonged
 *   to, and it would undo a real cycle's worth of history to fix a mis-tap.
 */
export function advanceCycleIfComplete(db: Db, programId: string, at: number): boolean {
  const days = db
    .select({ completedAt: programDays.completedAt })
    .from(programDays)
    .where(and(eq(programDays.programId, programId), isNull(programDays.deletedAt)))
    .all();

  if (days.length === 0) return false;
  if (!days.every((d) => d.completedAt !== null)) return false;

  db.transaction((tx) => {
    tx.update(programDays)
      .set({ completedAt: null, updatedAt: at })
      .where(and(eq(programDays.programId, programId), isNull(programDays.deletedAt)))
      .run();
    tx.update(programs)
      .set({ cycleNumber: sql`${programs.cycleNumber} + 1`, updatedAt: at })
      .where(eq(programs.id, programId))
      .run();
  });
  return true;
}

/**
 * Ticks a day off, or clears it.
 *
 * Nothing resets these when the cycle comes round again — there is no concept
 * of a cycle iteration in the schema yet, so a finished cycle stays ticked
 * until the user unticks it.
 */
export function setProgramDayCompleted(
  db: Db,
  programId: string,
  dayIndex: number,
  completed: boolean,
  at: number,
): void {
  db.update(programDays)
    .set({ completedAt: completed ? at : null, updatedAt: at })
    .where(
      and(
        eq(programDays.programId, programId),
        eq(programDays.dayIndex, dayIndex),
        isNull(programDays.deletedAt),
      ),
    )
    .run();

  if (completed) advanceCycleIfComplete(db, programId, at);
}

/**
 * Called when a workout is finished: ticks off the first day of the active
 * program that still needs this workout.
 *
 * The first, not all of them — the same workout sits on several days of a
 * cycle, and finishing it once completes one of those days, not the lot.
 */
export function markDayDoneForWorkout(db: Db, workoutId: string, at: number): void {
  const program = getActiveProgram(db);
  if (!program) return;

  const day = db
    .select({ id: programDays.id })
    .from(programDays)
    .where(
      and(
        eq(programDays.programId, program.id),
        eq(programDays.workoutId, workoutId),
        isNull(programDays.completedAt),
        isNull(programDays.deletedAt),
      ),
    )
    .orderBy(programDays.dayIndex)
    .get();
  if (!day) return;

  db.update(programDays).set({ completedAt: at, updatedAt: at }).where(eq(programDays.id, day.id)).run();
  advanceCycleIfComplete(db, program.id, at);
}

/** A generated program's cycle is fixed at its seven days (see programs.generated). */
export function isGenerated(db: Db, programId: string): boolean {
  return db.select({ generated: programs.generated }).from(programs).where(eq(programs.id, programId)).get()?.generated ?? false;
}

/**
 * Tombstones a day. A generated program's never are. Day numbers are positional, so removing day 2 renumbers
 * everything after it — the stored dayIndex values keep their gaps, which is
 * what stops addProgramDay reusing an index.
 */
export function removeProgramDay(db: Db, programId: string, dayIndex: number, at: number): void {
  if (isGenerated(db, programId)) return;
  db.update(programDays)
    .set({ deletedAt: at, updatedAt: at })
    .where(
      and(
        eq(programDays.programId, programId),
        eq(programDays.dayIndex, dayIndex),
        isNull(programDays.deletedAt),
      ),
    )
    .run();
}

/**
 * Appends one rest day to the end of the cycle and returns its index; null at
 * the limit or for a generated program.
 *
 * The index is max(dayIndex) + 1 over ALL rows including tombstoned ones, per
 * the ordering invariant: a count of live rows collides with a soft-deleted
 * day that still holds the index.
 */
export function addProgramDay(db: Db, programId: string, at: number): number | null {
  if (isGenerated(db, programId)) return null;
  const rows = db
    .select({ maxIndex: max(programDays.dayIndex) })
    .from(programDays)
    .where(eq(programDays.programId, programId))
    .get();
  const dayIndex = (rows?.maxIndex ?? -1) + 1;
  if (dayIndex >= MAX_DAY_COUNT) return null;

  db.insert(programDays)
    .values({ id: newId(), createdAt: at, updatedAt: at, deletedAt: null, programId, dayIndex, workoutId: null })
    .run();
  return dayIndex;
}

/**
 * Three joined levels: programs -> program_days -> workouts. Each carries
 * its own tombstone filter, and the inner join against workouts drops rest
 * days (null workoutId) for free.
 */
export function listPrograms(db: Db): ProgramSummary[] {
  const activeId = getSettingsRow(db)?.activeProgramId ?? null;

  const live = db.select().from(programs).where(isNull(programs.deletedAt)).all();

  const dayRows = db
    .select({ programId: programDays.programId })
    .from(programDays)
    .innerJoin(workouts, eq(workouts.id, programDays.workoutId))
    .where(and(isNull(programDays.deletedAt), isNull(workouts.deletedAt)))
    .all();

  const trainingDaysByProgram = new Map<string, number>();
  for (const { programId } of dayRows) {
    trainingDaysByProgram.set(programId, (trainingDaysByProgram.get(programId) ?? 0) + 1);
  }

  const summaries: ProgramSummary[] = live.map((program) => ({
    program,
    trainingDays: trainingDaysByProgram.get(program.id) ?? 0,
    isActive: program.id === activeId,
  }));

  return summaries.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.program.orderIndex - b.program.orderIndex;
  });
}

/**
 * For users with no program yet. Idempotent: any live program already
 * existing means this changes nothing. Otherwise it creates and activates
 * a program with an empty week — workouts are standalone and live in the
 * workout library; this no longer adopts them.
 */
export function ensureDefaultProgram(db: Db, at: number): Program {
  const existing = db.select().from(programs).where(isNull(programs.deletedAt)).orderBy(programs.orderIndex).all();
  if (existing.length > 0) {
    const active = getActiveProgram(db);
    return active ?? existing[0]!;
  }

  const program = createProgram(db, { name: 'My Program' }, at);
  activateProgram(db, program.id, at);
  return program;
}
