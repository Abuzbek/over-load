import { appSettings, newId, now, programDays, programs, routines } from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoutine } from './routineRepo';
import {
  activateProgram,
  createProgram,
  ensureDefaultProgram,
  getActiveProgram,
  getProgramWeek,
  listPrograms,
  setProgramDay,
} from './programRepo';

let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestDb());
});

afterEach(() => close());

function insertRoutine(name: string) {
  const id = newId();
  db.insert(routines).values({ id, name }).run();
  return id;
}

describe('createProgram', () => {
  it('creates a program with the given fields', () => {
    const program = createProgram(db, { name: 'Push Pull Legs', icon: 'dumbbell', iconColor: '#fff' }, now());
    expect(program.name).toBe('Push Pull Legs');
    expect(program.icon).toBe('dumbbell');
    expect(program.iconColor).toBe('#fff');
  });

  it('leaves icon and iconColor null when omitted', () => {
    const program = createProgram(db, { name: 'Bare' }, now());
    expect(program.icon).toBeNull();
    expect(program.iconColor).toBeNull();
  });

  it('orders by max(orderIndex) + 1 over all rows, including tombstoned', () => {
    const a = createProgram(db, { name: 'A' }, now());
    const b = createProgram(db, { name: 'B' }, now());
    db.update(programs).set({ deletedAt: now() }).where(eq(programs.id, b.id)).run();
    const c = createProgram(db, { name: 'C' }, now());

    expect(a.orderIndex).toBe(0);
    expect(b.orderIndex).toBe(1);
    expect(c.orderIndex).toBe(2);
  });

  it('creates all seven days as rest in the same transaction', () => {
    const program = createProgram(db, { name: 'A' }, now());
    const days = db.select().from(programDays).where(eq(programDays.programId, program.id)).all();
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.weekday).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(days.every((d) => d.routineId === null)).toBe(true);
  });
});

describe('activateProgram', () => {
  it('activates exactly one program at a time: activating B deactivates A', () => {
    const a = createProgram(db, { name: 'A' }, now());
    const b = createProgram(db, { name: 'B' }, now());

    activateProgram(db, a.id, now());
    activateProgram(db, b.id, now());

    const summaries = listPrograms(db);
    const active = summaries.filter((s) => s.isActive);
    expect(active).toHaveLength(1);
    expect(active[0]!.program.id).toBe(b.id);
    expect(summaries.find((s) => s.program.id === a.id)!.isActive).toBe(false);
  });

  it('is reflected by getActiveProgram', () => {
    const a = createProgram(db, { name: 'A' }, now());
    activateProgram(db, a.id, now());
    expect(getActiveProgram(db)?.id).toBe(a.id);
  });
});

describe('listPrograms', () => {
  it('lists active program first, then the rest by orderIndex', () => {
    const a = createProgram(db, { name: 'A' }, now());
    const b = createProgram(db, { name: 'B' }, now());
    const c = createProgram(db, { name: 'C' }, now());
    activateProgram(db, c.id, now());

    expect(listPrograms(db).map((s) => s.program.id)).toEqual([c.id, a.id, b.id]);
  });

  it('counts only weekdays with a live workout toward trainingDays', () => {
    const program = createProgram(db, { name: 'A' }, now());
    const r1 = insertRoutine('R1');
    setProgramDay(db, program.id, 0, r1, now());
    setProgramDay(db, program.id, 2, r1, now());

    expect(listPrograms(db).find((s) => s.program.id === program.id)!.trainingDays).toBe(2);
  });

  it('does not count a tombstoned workout toward trainingDays', () => {
    const program = createProgram(db, { name: 'A' }, now());
    const r1 = insertRoutine('R1');
    setProgramDay(db, program.id, 0, r1, now());
    db.update(routines).set({ deletedAt: now() }).where(eq(routines.id, r1)).run();

    expect(listPrograms(db).find((s) => s.program.id === program.id)!.trainingDays).toBe(0);
  });

  it('level 1: excludes a tombstoned program', () => {
    const program = createProgram(db, { name: 'A' }, now());
    db.update(programs).set({ deletedAt: now() }).where(eq(programs.id, program.id)).run();
    expect(listPrograms(db)).toHaveLength(0);
  });
});

describe('getProgramWeek', () => {
  it('always returns exactly 7 entries in weekday order', () => {
    const program = createProgram(db, { name: 'A' }, now());
    const week = getProgramWeek(db, program.id);
    expect(week).toHaveLength(7);
    expect(week.map((d) => d.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(week.every((d) => d.routine === null)).toBe(true);
  });

  it('returns exactly 7 entries even if a day row is missing', () => {
    const program = createProgram(db, { name: 'A' }, now());
    db.delete(programDays).where(eq(programDays.weekday, 3)).run();
    const week = getProgramWeek(db, program.id);
    expect(week).toHaveLength(7);
    expect(week.map((d) => d.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(week.find((d) => d.weekday === 3)!.routine).toBeNull();
  });

  it('reflects an assigned workout on its weekday', () => {
    const program = createProgram(db, { name: 'A' }, now());
    const r1 = insertRoutine('Full body');
    setProgramDay(db, program.id, 1, r1, now());

    const week = getProgramWeek(db, program.id);
    expect(week.find((d) => d.weekday === 1)!.routine?.id).toBe(r1);
  });

  it('the same workout can be assigned to three different weekdays (reuse)', () => {
    const program = createProgram(db, { name: 'A' }, now());
    const r1 = insertRoutine('Full body');
    setProgramDay(db, program.id, 0, r1, now());
    setProgramDay(db, program.id, 2, r1, now());
    setProgramDay(db, program.id, 4, r1, now());

    const week = getProgramWeek(db, program.id);
    expect(week.find((d) => d.weekday === 0)!.routine?.id).toBe(r1);
    expect(week.find((d) => d.weekday === 2)!.routine?.id).toBe(r1);
    expect(week.find((d) => d.weekday === 4)!.routine?.id).toBe(r1);
    expect(week.find((d) => d.weekday === 1)!.routine).toBeNull();
  });

  it('setting a day to null returns it to rest without deleting the row', () => {
    const program = createProgram(db, { name: 'A' }, now());
    const r1 = insertRoutine('Full body');
    setProgramDay(db, program.id, 0, r1, now());
    setProgramDay(db, program.id, 0, null, now());

    const week = getProgramWeek(db, program.id);
    expect(week.find((d) => d.weekday === 0)!.routine).toBeNull();
    const rows = db.select().from(programDays).where(eq(programDays.programId, program.id)).all();
    expect(rows).toHaveLength(7);
  });

  // --- one tombstone test per joined level: programs -> program_days -> routines ---

  it('level 1: a tombstoned program reads as an empty week', () => {
    const program = createProgram(db, { name: 'A' }, now());
    const r1 = insertRoutine('Full body');
    setProgramDay(db, program.id, 0, r1, now());
    db.update(programs).set({ deletedAt: now() }).where(eq(programs.id, program.id)).run();

    const week = getProgramWeek(db, program.id);
    expect(week).toHaveLength(7);
    expect(week.every((d) => d.routine === null)).toBe(true);
  });

  it('level 2: a tombstoned program_day row reads as rest', () => {
    const program = createProgram(db, { name: 'A' }, now());
    const r1 = insertRoutine('Full body');
    setProgramDay(db, program.id, 0, r1, now());
    db.update(programDays)
      .set({ deletedAt: now() })
      .where(eq(programDays.programId, program.id))
      .run();

    const week = getProgramWeek(db, program.id);
    // Every underlying row is tombstoned, so every weekday falls back to rest.
    expect(week).toHaveLength(7);
    expect(week.every((d) => d.routine === null)).toBe(true);
  });

  it('level 3: a tombstoned workout assigned to a day reads as rest, not a dangling reference', () => {
    const program = createProgram(db, { name: 'A' }, now());
    const r1 = insertRoutine('Full body');
    setProgramDay(db, program.id, 0, r1, now());
    db.update(routines).set({ deletedAt: now() }).where(eq(routines.id, r1)).run();

    const week = getProgramWeek(db, program.id);
    expect(week.find((d) => d.weekday === 0)!.routine).toBeNull();
  });
});

describe('ensureDefaultProgram', () => {
  it('creates and activates a program with an empty week, and does not adopt routines', () => {
    const r1 = { id: newId(), name: 'R1' };
    const r2 = { id: newId(), name: 'R2' };
    db.insert(routines).values([r1, r2]).run();

    const created = ensureDefaultProgram(db, now());

    expect(getActiveProgram(db)?.id).toBe(created.id);
    const week = getProgramWeek(db, created.id);
    expect(week).toHaveLength(7);
    expect(week.every((d) => d.routine === null)).toBe(true);
  });

  it('is idempotent: calling it twice creates only one program', () => {
    ensureDefaultProgram(db, now());
    ensureDefaultProgram(db, now());

    expect(db.select().from(programs).all()).toHaveLength(1);
  });

  it('does nothing when a live program already exists', () => {
    createProgram(db, { name: 'Existing' }, now());

    ensureDefaultProgram(db, now());

    expect(db.select().from(programs).all()).toHaveLength(1);
  });
});

describe('appSettings has no row yet', () => {
  it('getActiveProgram returns undefined', () => {
    expect(getActiveProgram(db)).toBeUndefined();
  });

  it('does not insert a settings row on a plain read', () => {
    getActiveProgram(db);
    expect(db.select().from(appSettings).all()).toHaveLength(0);
  });

});

describe('setProgramDay on a program with no day rows', () => {
  // Regression. createProgram writes all seven days, but a program created
  // before program_days existed has none, and a bare UPDATE against a missing
  // row silently does nothing. On a device this looked like tapping a day
  // having no effect at all, with no error anywhere.
  it('inserts the day rather than silently doing nothing', () => {
    const program = createProgram(db, { name: 'Legacy' }, now());
    // Simulate the pre-migration shape.
    db.delete(programDays).where(eq(programDays.programId, program.id)).run();
    expect(db.select().from(programDays).where(eq(programDays.programId, program.id)).all()).toHaveLength(0);

    const workout = createRoutine(db, 'Full body');
    setProgramDay(db, program.id, 0, workout.id, now());

    const week = getProgramWeek(db, program.id);
    expect(week[0]!.routine?.id).toBe(workout.id);
    expect(week.filter((d) => d.routine !== null)).toHaveLength(1);
  });
});
