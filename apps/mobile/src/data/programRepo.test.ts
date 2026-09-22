import { appSettings, newId, now, programDays, programs, workouts } from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { and, eq, gt } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createWorkout } from './workoutRepo';
import {
  activateProgram,
  advanceCycleIfComplete,
  createProgram,
  ensureDefaultProgram,
  getActiveProgram,
  addProgramDay,
  getProgramDays,
  markDayDoneForWorkout,
  removeProgramDay,
  setProgramDayCompleted,
  MAX_DAY_COUNT,
  listPrograms,
  setProgramDay,
} from './programRepo';

let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestDb());
});

afterEach(() => close());

function insertWorkout(name: string) {
  const id = newId();
  db.insert(workouts).values({ id, name }).run();
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

  it('creates seven rest days in the same transaction', () => {
    const program = createProgram(db, { name: 'A' }, now());
    const days = db.select().from(programDays).where(eq(programDays.programId, program.id)).all();
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.dayIndex).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(days.every((d) => d.workoutId === null)).toBe(true);
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

  it('counts only days with a live workout toward trainingDays', () => {
    const program = createProgram(db, { name: 'A' }, now());
    const r1 = insertWorkout('R1');
    setProgramDay(db, program.id, 0, r1, now());
    setProgramDay(db, program.id, 2, r1, now());

    expect(listPrograms(db).find((s) => s.program.id === program.id)!.trainingDays).toBe(2);
  });

  it('does not count a tombstoned workout toward trainingDays', () => {
    const program = createProgram(db, { name: 'A' }, now());
    const r1 = insertWorkout('R1');
    setProgramDay(db, program.id, 0, r1, now());
    db.update(workouts).set({ deletedAt: now() }).where(eq(workouts.id, r1)).run();

    expect(listPrograms(db).find((s) => s.program.id === program.id)!.trainingDays).toBe(0);
  });

  it('level 1: excludes a tombstoned program', () => {
    const program = createProgram(db, { name: 'A' }, now());
    db.update(programs).set({ deletedAt: now() }).where(eq(programs.id, program.id)).run();
    expect(listPrograms(db)).toHaveLength(0);
  });
});

describe('getProgramDays', () => {
  it('returns the seven days a new program starts with, in order', () => {
    const program = createProgram(db, { name: 'A' }, now());
    const week = getProgramDays(db, program.id);
    expect(week).toHaveLength(7);
    expect(week.map((d) => d.dayIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(week.every((d) => d.workout === null)).toBe(true);
  });

  it('returns only the days that exist — the cycle length is not fixed', () => {
    const program = createProgram(db, { name: 'A' }, now());
    db.delete(programDays).where(eq(programDays.dayIndex, 3)).run();
    const week = getProgramDays(db, program.id);
    expect(week).toHaveLength(6);
    expect(week.map((d) => d.dayIndex)).toEqual([0, 1, 2, 4, 5, 6]);
  });

  it('reflects an assigned workout on its day', () => {
    const program = createProgram(db, { name: 'A' }, now());
    const r1 = insertWorkout('Full body');
    setProgramDay(db, program.id, 1, r1, now());

    const week = getProgramDays(db, program.id);
    expect(week.find((d) => d.dayIndex === 1)!.workout?.id).toBe(r1);
  });

  it('the same workout can be assigned to three different days (reuse)', () => {
    const program = createProgram(db, { name: 'A' }, now());
    const r1 = insertWorkout('Full body');
    setProgramDay(db, program.id, 0, r1, now());
    setProgramDay(db, program.id, 2, r1, now());
    setProgramDay(db, program.id, 4, r1, now());

    const week = getProgramDays(db, program.id);
    expect(week.find((d) => d.dayIndex === 0)!.workout?.id).toBe(r1);
    expect(week.find((d) => d.dayIndex === 2)!.workout?.id).toBe(r1);
    expect(week.find((d) => d.dayIndex === 4)!.workout?.id).toBe(r1);
    expect(week.find((d) => d.dayIndex === 1)!.workout).toBeNull();
  });

  it('setting a day to null returns it to rest without deleting the row', () => {
    const program = createProgram(db, { name: 'A' }, now());
    const r1 = insertWorkout('Full body');
    setProgramDay(db, program.id, 0, r1, now());
    setProgramDay(db, program.id, 0, null, now());

    const week = getProgramDays(db, program.id);
    expect(week.find((d) => d.dayIndex === 0)!.workout).toBeNull();
    const rows = db.select().from(programDays).where(eq(programDays.programId, program.id)).all();
    expect(rows).toHaveLength(7);
  });

  // --- one tombstone test per joined level: programs -> program_days -> workouts ---

  it('level 1: a tombstoned program reads as no days at all', () => {
    const program = createProgram(db, { name: 'A' }, now());
    const r1 = insertWorkout('Full body');
    setProgramDay(db, program.id, 0, r1, now());
    db.update(programs).set({ deletedAt: now() }).where(eq(programs.id, program.id)).run();

    expect(getProgramDays(db, program.id)).toEqual([]);
  });

  it('level 2: tombstoned program_day rows drop out of the cycle', () => {
    const program = createProgram(db, { name: 'A' }, now());
    const r1 = insertWorkout('Full body');
    setProgramDay(db, program.id, 0, r1, now());
    db.update(programDays)
      .set({ deletedAt: now() })
      .where(eq(programDays.programId, program.id))
      .run();

    // Every day row is tombstoned, so the cycle reads as empty — including
    // the one that had a workout on it.
    expect(getProgramDays(db, program.id)).toEqual([]);
  });

  it('level 3: a tombstoned workout assigned to a day reads as rest, not a dangling reference', () => {
    const program = createProgram(db, { name: 'A' }, now());
    const r1 = insertWorkout('Full body');
    setProgramDay(db, program.id, 0, r1, now());
    db.update(workouts).set({ deletedAt: now() }).where(eq(workouts.id, r1)).run();

    const week = getProgramDays(db, program.id);
    expect(week.find((d) => d.dayIndex === 0)!.workout).toBeNull();
  });
});

describe('ensureDefaultProgram', () => {
  it('creates and activates a program with an empty cycle, and does not adopt workouts', () => {
    const r1 = { id: newId(), name: 'R1' };
    const r2 = { id: newId(), name: 'R2' };
    db.insert(workouts).values([r1, r2]).run();

    const created = ensureDefaultProgram(db, now());

    expect(getActiveProgram(db)?.id).toBe(created.id);
    const week = getProgramDays(db, created.id);
    expect(week).toHaveLength(7);
    expect(week.every((d) => d.workout === null)).toBe(true);
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

    const workout = createWorkout(db, 'Full body');
    setProgramDay(db, program.id, 0, workout.id, now());

    const week = getProgramDays(db, program.id);
    expect(week[0]!.workout?.id).toBe(workout.id);
    expect(week.filter((d) => d.workout !== null)).toHaveLength(1);
  });
});

describe('addProgramDay', () => {
  it('appends one rest day past the end of the cycle', () => {
    const program = createProgram(db, { name: 'A' }, now());
    expect(addProgramDay(db, program.id, now())).toBe(7);

    const days = getProgramDays(db, program.id);
    expect(days).toHaveLength(8);
    expect(days.map((d) => d.dayIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(days[7]!.workout).toBeNull();
  });

  // The ordering invariant: max(dayIndex) + 1 over ALL rows, tombstoned
  // included. A count of live rows would return 7 here and collide with the
  // tombstoned day that still holds index 7.
  it('does not reuse the index of a tombstoned day', () => {
    const program = createProgram(db, { name: 'A' }, now());
    addProgramDay(db, program.id, now());
    db.update(programDays)
      .set({ deletedAt: now() })
      .where(and(eq(programDays.programId, program.id), eq(programDays.dayIndex, 7)))
      .run();

    expect(addProgramDay(db, program.id, now())).toBe(8);
    expect(getProgramDays(db, program.id).map((d) => d.dayIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 8]);
  });

  it('refuses to grow the cycle past the cap', () => {
    const program = createProgram(db, { name: 'A' }, now());
    db.update(programDays)
      .set({ dayIndex: MAX_DAY_COUNT - 1 })
      .where(and(eq(programDays.programId, program.id), eq(programDays.dayIndex, 6)))
      .run();

    expect(addProgramDay(db, program.id, now())).toBeNull();
    expect(getProgramDays(db, program.id)).toHaveLength(7);
  });

  it('a day added past the first seven takes a workout like any other', () => {
    const program = createProgram(db, { name: 'A' }, now());
    const dayIndex = addProgramDay(db, program.id, now())!;
    const workout = createWorkout(db, 'Day 8 work');
    setProgramDay(db, program.id, dayIndex, workout.id, now());

    expect(getProgramDays(db, program.id)[7]!.workout?.id).toBe(workout.id);
  });
});

describe('day completion', () => {
  it('starts unticked, ticks and unticks', () => {
    const program = createProgram(db, { name: 'A' }, now());
    const workout = createWorkout(db, 'Push');
    setProgramDay(db, program.id, 0, workout.id, now());
    expect(getProgramDays(db, program.id)[0]!.completedAt).toBeNull();

    setProgramDayCompleted(db, program.id, 0, true, 111);
    expect(getProgramDays(db, program.id)[0]!.completedAt).toBe(111);

    setProgramDayCompleted(db, program.id, 0, false, 222);
    expect(getProgramDays(db, program.id)[0]!.completedAt).toBeNull();
  });

  // The rule that matters: one finished session ticks ONE day, not every day
  // the workout sits on. A 3-day-a-week workout would otherwise complete the
  // whole cycle the first time it was performed.
  it('ticks only the first outstanding day when a workout repeats in the cycle', () => {
    const program = createProgram(db, { name: 'A' }, now());
    activateProgram(db, program.id, now());
    const workout = createWorkout(db, 'Full body');
    setProgramDay(db, program.id, 0, workout.id, now());
    setProgramDay(db, program.id, 2, workout.id, now());
    setProgramDay(db, program.id, 4, workout.id, now());

    markDayDoneForWorkout(db, workout.id, 500);

    const days = getProgramDays(db, program.id);
    expect(days.find((d) => d.dayIndex === 0)!.completedAt).toBe(500);
    expect(days.find((d) => d.dayIndex === 2)!.completedAt).toBeNull();
    expect(days.find((d) => d.dayIndex === 4)!.completedAt).toBeNull();

    markDayDoneForWorkout(db, workout.id, 600);
    expect(getProgramDays(db, program.id).find((d) => d.dayIndex === 2)!.completedAt).toBe(600);
  });

  it('ticks nothing when the program holding the workout is not the active one', () => {
    const program = createProgram(db, { name: 'Archived' }, now());
    const workout = createWorkout(db, 'Push');
    setProgramDay(db, program.id, 0, workout.id, now());
    // Never activated.

    markDayDoneForWorkout(db, workout.id, 500);

    expect(getProgramDays(db, program.id)[0]!.completedAt).toBeNull();
  });
});

describe('removeProgramDay', () => {
  it('tombstones the day rather than deleting the row', () => {
    const program = createProgram(db, { name: 'A' }, now());
    removeProgramDay(db, program.id, 3, 999);

    const days = getProgramDays(db, program.id);
    expect(days.map((d) => d.dayIndex)).toEqual([0, 1, 2, 4, 5, 6]);

    const row = db
      .select()
      .from(programDays)
      .where(and(eq(programDays.programId, program.id), eq(programDays.dayIndex, 3)))
      .get();
    expect(row?.deletedAt).toBe(999);
  });

  // The ordering invariant again: the removed index is still taken, so a new
  // day must go past it rather than reusing it.
  it('does not free the removed index for reuse', () => {
    const program = createProgram(db, { name: 'A' }, now());
    removeProgramDay(db, program.id, 6, now());
    expect(addProgramDay(db, program.id, now())).toBe(7);
  });
});

describe('cycle rollover', () => {
  function programWithTwoDays() {
    const program = createProgram(db, { name: 'A' }, now());
    // createProgram makes seven; trim to two so the test is readable.
    db.update(programDays)
      .set({ deletedAt: now() })
      .where(and(eq(programDays.programId, program.id), gt(programDays.dayIndex, 1)))
      .run();
    return program;
  }

  function cycleOf(programId: string) {
    return db.select().from(programs).where(eq(programs.id, programId)).get()!.cycleNumber;
  }

  it('starts at cycle 1', () => {
    expect(cycleOf(createProgram(db, { name: 'A' }, now()).id)).toBe(1);
  });

  it('does not roll while a day is still outstanding', () => {
    const program = programWithTwoDays();
    setProgramDayCompleted(db, program.id, 0, true, now());

    expect(cycleOf(program.id)).toBe(1);
    expect(getProgramDays(db, program.id)[0]!.completedAt).not.toBeNull();
  });

  // The whole point: ticking the last day clears the board and moves you on.
  it('rolls when the last day is ticked, clearing every tick', () => {
    const program = programWithTwoDays();
    setProgramDayCompleted(db, program.id, 0, true, now());
    setProgramDayCompleted(db, program.id, 1, true, now());

    expect(cycleOf(program.id)).toBe(2);
    expect(getProgramDays(db, program.id).every((d) => d.completedAt === null)).toBe(true);
  });

  it('rolls again on the next time through', () => {
    const program = programWithTwoDays();
    for (const pass of [1, 2, 3]) {
      setProgramDayCompleted(db, program.id, 0, true, now());
      setProgramDayCompleted(db, program.id, 1, true, now());
      expect(cycleOf(program.id)).toBe(pass + 1);
    }
  });

  // `every` on an empty list is true, so a program with no days would advance
  // its cycle on every call, forever.
  it('never rolls a program with no days', () => {
    const program = createProgram(db, { name: 'A' }, now());
    db.update(programDays).set({ deletedAt: now() }).where(eq(programDays.programId, program.id)).run();

    expect(advanceCycleIfComplete(db, program.id, now())).toBe(false);
    expect(cycleOf(program.id)).toBe(1);
  });

  it('finishing the last workout of the cycle rolls it too', () => {
    const program = programWithTwoDays();
    activateProgram(db, program.id, now());
    const workout = createWorkout(db, 'Push');
    setProgramDay(db, program.id, 0, workout.id, now());
    setProgramDay(db, program.id, 1, workout.id, now());

    markDayDoneForWorkout(db, workout.id, now());
    expect(cycleOf(program.id)).toBe(1);

    markDayDoneForWorkout(db, workout.id, now());
    expect(cycleOf(program.id)).toBe(2);
  });

  // Documents the deliberate edge: a mis-tap after a roll leaves you in the new
  // cycle with a day outstanding rather than undoing a cycle of history.
  it('unticking after a roll does not roll back', () => {
    const program = programWithTwoDays();
    setProgramDayCompleted(db, program.id, 0, true, now());
    setProgramDayCompleted(db, program.id, 1, true, now());

    setProgramDayCompleted(db, program.id, 1, false, now());

    expect(cycleOf(program.id)).toBe(2);
  });
});
