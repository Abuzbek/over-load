import { appSettings, newId, programDays, programs, routines, type Db, type Program, type Routine } from '@overload/schema';
import { and, eq, inArray, isNull, max } from 'drizzle-orm';

export type ProgramSummary = { program: Program; trainingDays: number; isActive: boolean };

export type ProgramDay = { weekday: number; routine: Routine | null };

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

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
  db.insert(appSettings).values({ id: newId(), activeProgramId: programId, createdAt: at, updatedAt: at }).run();
}

export function getActiveProgram(db: Db): Program | undefined {
  const activeId = getSettingsRow(db)?.activeProgramId;
  if (!activeId) return undefined;
  return db.select().from(programs).where(and(eq(programs.id, activeId), isNull(programs.deletedAt))).get();
}

/**
 * A program's week always has exactly seven day rows, created here in the
 * same transaction as the program itself. Rest is represented by a null
 * routineId on a row that exists, never by a missing row — see
 * setProgramDay.
 */
export function createProgram(
  db: Db,
  values: { name: string; icon?: string; iconColor?: string },
  at: number,
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
  };

  db.transaction((tx) => {
    tx.insert(programs).values(row).run();
    tx.insert(programDays)
      .values(
        WEEKDAYS.map((weekday) => ({
          id: newId(),
          createdAt: at,
          updatedAt: at,
          deletedAt: null,
          programId: row.id,
          weekday,
          routineId: null,
        })),
      )
      .run();
  });

  return row;
}

/**
 * Assigns (or clears, with routineId null) the workout for one weekday of a
 * program's week. Always an update to the existing row — the seven rows
 * created in createProgram are never deleted.
 */
export function setProgramDay(db: Db, programId: string, weekday: number, routineId: string | null, at: number): void {
  db.update(programDays)
    .set({ routineId, updatedAt: at })
    .where(and(eq(programDays.programId, programId), eq(programDays.weekday, weekday)))
    .run();
}

/**
 * Always returns exactly 7 entries in weekday order (0 = Monday … 6 =
 * Sunday), even if a day row is missing or the program itself is
 * tombstoned — callers rendering a week must never get a short array.
 *
 * Three joined levels, each with its own tombstone filter: programs ->
 * program_days -> routines. A tombstoned program, day row, or workout all
 * read as rest rather than as a dangling reference.
 */
export function getProgramWeek(db: Db, programId: string): ProgramDay[] {
  const program = db
    .select()
    .from(programs)
    .where(and(eq(programs.id, programId), isNull(programs.deletedAt)))
    .get();
  if (!program) return WEEKDAYS.map((weekday) => ({ weekday, routine: null }));

  const days = db
    .select()
    .from(programDays)
    .where(and(eq(programDays.programId, programId), isNull(programDays.deletedAt)))
    .all();

  const routineIds = days.map((d) => d.routineId).filter((id): id is string => id !== null);
  const liveRoutines = routineIds.length
    ? db.select().from(routines).where(and(inArray(routines.id, routineIds), isNull(routines.deletedAt))).all()
    : [];
  const routineById = new Map(liveRoutines.map((r) => [r.id, r]));

  const dayByWeekday = new Map(days.map((d) => [d.weekday, d]));

  return WEEKDAYS.map((weekday) => {
    const day = dayByWeekday.get(weekday);
    const routine = day?.routineId ? (routineById.get(day.routineId) ?? null) : null;
    return { weekday, routine };
  });
}

/**
 * Three joined levels: programs -> program_days -> routines. Each carries
 * its own tombstone filter, and the inner join against routines drops rest
 * days (null routineId) for free.
 */
export function listPrograms(db: Db): ProgramSummary[] {
  const activeId = getSettingsRow(db)?.activeProgramId ?? null;

  const live = db.select().from(programs).where(isNull(programs.deletedAt)).all();

  const dayRows = db
    .select({ programId: programDays.programId })
    .from(programDays)
    .innerJoin(routines, eq(routines.id, programDays.routineId))
    .where(and(isNull(programDays.deletedAt), isNull(routines.deletedAt)))
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
