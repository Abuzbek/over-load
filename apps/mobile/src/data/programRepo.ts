import { blockPosition, estimatedOneRepMax, retuneRange } from '@overload/domain';
import { appSettings, newId, programDays, programs, sessionExercises, sessionSets, sessions, workoutExercises, workoutSets, workouts, type Db, type DeloadPlace, type Program, type Workout } from '@overload/schema';
import { duplicateWorkout } from './workoutRepo';
import { and, desc, eq, inArray, isNotNull, isNull, max, ne, sql } from 'drizzle-orm';
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
  values: {
    name: string;
    icon?: string;
    iconColor?: string;
    generated?: boolean;
    /** What periodization follows; a generated program is periodized from the start. */
    goal?: 'hypertrophy' | 'strength' | 'both' | null;
    deload?: DeloadPlace;
  },
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
    cycleCount: 7,
    deload: values.deload ?? (values.generated ? ('last' as const) : ('none' as const)),
    periodized: values.generated ?? false,
    goal: values.goal ?? null,
    archivedAt: null,
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
  const program = getProgram(db, programId);
  if (program?.periodized && blockPosition(program.cycleNumber, program.cycleCount) === 1) retuneAfterBlock(db, programId, at);
  return true;
}

/**
 * After a block of a periodized program: each exercise that stalled over it
 * moves to a fresh rep range (retuneRange), written to its plan so the next
 * block's cycles build on it. Progress is its best estimated one-rep max over
 * the block's last two sessions against its first; fewer than three sessions
 * of it in the block, and it is left alone.
 */
export function retuneAfterBlock(db: Db, programId: string, at: number): void {
  const program = getProgram(db, programId);
  if (!program) return;
  const days = getProgramDays(db, programId);
  const workoutIds = [...new Set(days.flatMap((d) => (d.workout ? [d.workout.id] : [])))];
  for (const workoutId of workoutIds) {
    // ponytail: the block's sessions are taken as the workout's last (cycles × days it is on);
    // store a block start on the program if skipped or extra sessions skew this.
    const window = program.cycleCount * days.filter((d) => d.workout?.id === workoutId).length;
    const recent = db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.workoutId, workoutId), isNotNull(sessions.endedAt), isNull(sessions.deletedAt)))
      .orderBy(desc(sessions.startedAt))
      .limit(window)
      .all()
      .map((r) => r.id)
      .reverse();
    if (recent.length < 3) continue;
    const planned = db
      .select()
      .from(workoutExercises)
      .where(and(eq(workoutExercises.workoutId, workoutId), isNull(workoutExercises.deletedAt)))
      .all();
    for (const we of planned) {
      const best = new Map<string, number>();
      const rows = db
        .select({ sessionId: sessionExercises.sessionId, weightKg: sessionSets.weightKg, reps: sessionSets.reps, rir: sessionSets.rir, targetRir: sessionSets.targetRir })
        .from(sessionSets)
        .innerJoin(sessionExercises, eq(sessionExercises.id, sessionSets.sessionExerciseId))
        .where(
          and(
            inArray(sessionExercises.sessionId, recent),
            eq(sessionExercises.exerciseId, we.exerciseId),
            ne(sessionSets.setType, 'warmup'),
            isNotNull(sessionSets.completedAt),
            isNull(sessionSets.deletedAt),
            isNull(sessionExercises.deletedAt),
          ),
        )
        .all();
      for (const r of rows) {
        if (!r.weightKg || !r.reps) continue;
        const e1rm = estimatedOneRepMax(r.weightKg, r.reps + (r.rir ?? r.targetRir ?? 2));
        best.set(r.sessionId, Math.max(best.get(r.sessionId) ?? 0, e1rm));
      }
      const trained = recent.filter((id) => best.has(id)).map((id) => best.get(id)!);
      if (trained.length < 3) continue;
      const progress = Math.max(...trained.slice(-2)) / trained[0]! - 1;
      const sets = db
        .select()
        .from(workoutSets)
        .where(and(eq(workoutSets.workoutExerciseId, we.id), ne(workoutSets.setType, 'warmup'), isNull(workoutSets.deletedAt)))
        .all();
      const first = sets[0];
      if (!first?.targetReps) continue;
      const range = retuneRange(first.targetReps, first.targetRepsMax ?? first.targetReps, progress);
      if (!range) continue;
      db.update(workoutSets)
        .set({ targetReps: range.repsMin, targetRepsMax: range.repsMax, updatedAt: at })
        .where(inArray(workoutSets.id, sets.map((s) => s.id)))
        .run();
    }
  }
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

  // An archived program is out of the library; listArchivedPrograms has it.
  const live = db.select().from(programs).where(and(isNull(programs.deletedAt), isNull(programs.archivedAt))).all();

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

export type ProgramSettings = Pick<Program, 'cycleCount' | 'deload' | 'periodized' | 'goal'>;

/** Changes how the program's blocks run. Cycles are kept between 1 and 52. */
export function updateProgramSettings(db: Db, programId: string, patch: Partial<ProgramSettings>, at: number): void {
  const values: Partial<ProgramSettings> & { updatedAt: number } = { ...patch, updatedAt: at };
  if (patch.cycleCount !== undefined) values.cycleCount = Math.min(Math.max(Math.round(patch.cycleCount), 1), 52);
  db.update(programs).set(values).where(eq(programs.id, programId)).run();
}

export function getProgram(db: Db, programId: string): Program | undefined {
  return db.select().from(programs).where(and(eq(programs.id, programId), isNull(programs.deletedAt))).get();
}

/**
 * A copy to change without touching the original: its settings, its days, and
 * a copy of each workout on them (a workout on two days is copied once). Not
 * activated; the cycle starts at 1.
 */
export function duplicateProgram(db: Db, programId: string, name: string, at: number): Program | undefined {
  const source = getProgram(db, programId);
  if (!source) return undefined;
  const days = getProgramDays(db, programId);
  const copy = createProgram(db, { name, icon: source.icon ?? undefined, iconColor: source.iconColor ?? undefined, generated: source.generated, goal: source.goal, deload: source.deload }, at, days.length);
  updateProgramSettings(db, copy.id, { cycleCount: source.cycleCount, periodized: source.periodized }, at);
  const copies = new Map<string, string>();
  days.forEach((day, position) => {
    if (!day.workout) return;
    if (!copies.has(day.workout.id)) copies.set(day.workout.id, duplicateWorkout(db, day.workout.id, day.workout.name, at)!.id);
    setProgramDay(db, copy.id, position, copies.get(day.workout.id)!, at);
  });
  return getProgram(db, copy.id);
}

/** Out of the library, kept: no longer the active program if it was. */
export function archiveProgram(db: Db, programId: string, at: number): void {
  db.update(programs).set({ archivedAt: at, updatedAt: at }).where(eq(programs.id, programId)).run();
  if (getSettingsRow(db)?.activeProgramId === programId) {
    db.update(appSettings).set({ activeProgramId: null, updatedAt: at }).where(eq(appSettings.id, SETTINGS_ID)).run();
  }
}

export function restoreProgram(db: Db, programId: string, at: number): void {
  db.update(programs).set({ archivedAt: null, updatedAt: at }).where(eq(programs.id, programId)).run();
}

export function listArchivedPrograms(db: Db): Program[] {
  return db
    .select()
    .from(programs)
    .where(and(isNull(programs.deletedAt), isNotNull(programs.archivedAt)))
    .orderBy(programs.orderIndex)
    .all();
}

/**
 * Deletes a program: its days, and the workouts only it used — a workout
 * another program also schedules stays. History is kept; sessions stand alone.
 */
export function deleteProgram(db: Db, programId: string, at: number): void {
  const mine = new Set(getProgramDays(db, programId).flatMap((d) => (d.workout ? [d.workout.id] : [])));
  const elsewhere = new Set(
    db
      .select({ workoutId: programDays.workoutId })
      .from(programDays)
      .innerJoin(programs, eq(programs.id, programDays.programId))
      .where(and(isNull(programDays.deletedAt), isNull(programs.deletedAt), sql`${programDays.programId} <> ${programId}`))
      .all()
      .map((r) => r.workoutId),
  );
  db.transaction((tx) => {
    tx.update(programs).set({ deletedAt: at, updatedAt: at }).where(eq(programs.id, programId)).run();
    tx.update(programDays).set({ deletedAt: at, updatedAt: at }).where(and(eq(programDays.programId, programId), isNull(programDays.deletedAt))).run();
    const only = [...mine].filter((id) => !elsewhere.has(id));
    if (only.length > 0) tx.update(workouts).set({ deletedAt: at, updatedAt: at }).where(inArray(workouts.id, only)).run();
    if (getSettingsRow(db)?.activeProgramId === programId) {
      tx.update(appSettings).set({ activeProgramId: null, updatedAt: at }).where(eq(appSettings.id, SETTINGS_ID)).run();
    }
  });
}
