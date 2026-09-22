import { appSettings, newId, programs, routines, type Db, type Program } from '@overload/schema';
import { and, count, eq, isNull, max } from 'drizzle-orm';

export type ProgramSummary = { program: Program; workoutCount: number; isActive: boolean };

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
  db.insert(programs).values(row).run();
  return row;
}

/**
 * Two joined levels: programs -> routines. Each carries its own tombstone
 * filter — dropping either silently changes the numbers here rather than
 * throwing.
 */
export function listPrograms(db: Db): ProgramSummary[] {
  const activeId = getSettingsRow(db)?.activeProgramId ?? null;

  const live = db.select().from(programs).where(isNull(programs.deletedAt)).all();

  const counts = db
    .select({ programId: routines.programId, workoutCount: count() })
    .from(routines)
    .where(isNull(routines.deletedAt))
    .groupBy(routines.programId)
    .all();
  const countByProgram = new Map(counts.map((c) => [c.programId, c.workoutCount]));

  const summaries: ProgramSummary[] = live.map((program) => ({
    program,
    workoutCount: countByProgram.get(program.id) ?? 0,
    isActive: program.id === activeId,
  }));

  return summaries.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.program.orderIndex - b.program.orderIndex;
  });
}

/**
 * For existing users who have routines but no program. Idempotent: any live
 * program already existing means this changes nothing. Otherwise it creates
 * and activates "My Program" and adopts every routine with a null programId.
 */
export function ensureDefaultProgram(db: Db, at: number): Program {
  const existing = db.select().from(programs).where(isNull(programs.deletedAt)).orderBy(programs.orderIndex).all();
  if (existing.length > 0) {
    const active = getActiveProgram(db);
    return active ?? existing[0]!;
  }

  const program = createProgram(db, { name: 'My Program' }, at);
  activateProgram(db, program.id, at);
  db.update(routines).set({ programId: program.id, updatedAt: at }).where(isNull(routines.programId)).run();
  return program;
}
