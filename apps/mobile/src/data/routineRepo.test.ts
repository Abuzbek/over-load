import { exercises, newId, now, routineExercises, routineSets, type Exercise } from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addExerciseToRoutine,
  addRoutineSet,
  createRoutine,
  getRoutineDetail,
  listRoutines,
  reorderRoutineExercises,
  softDeleteRoutine,
} from './routineRepo';

let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;
let bench: Exercise;
let squat: Exercise;
let row: Exercise;

beforeEach(() => {
  ({ db, close } = createTestDb());
  const rows = [
    { id: newId(), name: 'Bench Press', trackingType: 'weight_reps' as const, primaryMuscle: 'chest', secondaryMuscles: [], equipment: 'barbell' },
    { id: newId(), name: 'Back Squat', trackingType: 'weight_reps' as const, primaryMuscle: 'quads', secondaryMuscles: [], equipment: 'barbell' },
    { id: newId(), name: 'Barbell Row', trackingType: 'weight_reps' as const, primaryMuscle: 'back', secondaryMuscles: [], equipment: 'barbell' },
  ];
  db.insert(exercises).values(rows).run();
  [bench, squat, row] = rows as unknown as [Exercise, Exercise, Exercise];
});

afterEach(() => close());

describe('createRoutine and listRoutines', () => {
  it('creates a routine and lists it', () => {
    createRoutine(db, 'Push Day');
    expect(listRoutines(db).map((r) => r.name)).toEqual(['Push Day']);
  });

  it('excludes tombstoned routines', () => {
    const routine = createRoutine(db, 'Push Day');
    softDeleteRoutine(db, routine.id);
    expect(listRoutines(db)).toHaveLength(0);
  });
});

describe('getRoutineDetail', () => {
  it('returns undefined for an unknown routine', () => {
    expect(getRoutineDetail(db, newId())).toBeUndefined();
  });

  it('assigns sequential order indexes as exercises are added', () => {
    const routine = createRoutine(db, 'Push Day');
    addExerciseToRoutine(db, routine.id, bench.id);
    addExerciseToRoutine(db, routine.id, squat.id);

    const detail = getRoutineDetail(db, routine.id);
    expect(detail?.exercises.map((e) => e.routineExercise.orderIndex)).toEqual([0, 1]);
    expect(detail?.exercises.map((e) => e.exercise.name)).toEqual(['Bench Press', 'Back Squat']);
  });

  it('nests target sets under their exercise in order', () => {
    const routine = createRoutine(db, 'Push Day');
    const re = addExerciseToRoutine(db, routine.id, bench.id);
    addRoutineSet(db, re.id, { targetReps: 8, targetWeightKg: 80 });
    addRoutineSet(db, re.id, { targetReps: 6, targetWeightKg: 90 });

    const detail = getRoutineDetail(db, routine.id);
    expect(detail?.exercises[0]?.sets.map((s) => s.targetReps)).toEqual([8, 6]);
    expect(detail?.exercises[0]?.sets.map((s) => s.orderIndex)).toEqual([0, 1]);
  });

  it('returns a routine with no exercises as an empty list, not undefined', () => {
    const routine = createRoutine(db, 'Empty');
    expect(getRoutineDetail(db, routine.id)?.exercises).toEqual([]);
  });
});

describe('getRoutineDetail tombstone filtering', () => {
  it('returns undefined for a soft-deleted routine', () => {
    const routine = createRoutine(db, 'Push Day');
    softDeleteRoutine(db, routine.id);
    expect(getRoutineDetail(db, routine.id)).toBeUndefined();
  });

  it('excludes a soft-deleted routine exercise', () => {
    const routine = createRoutine(db, 'Push Day');
    const re = addExerciseToRoutine(db, routine.id, bench.id);
    db.update(routineExercises).set({ deletedAt: now() }).where(eq(routineExercises.id, re.id)).run();

    expect(getRoutineDetail(db, routine.id)?.exercises).toEqual([]);
  });

  it('excludes a soft-deleted routine set from its exercise', () => {
    const routine = createRoutine(db, 'Push Day');
    const re = addExerciseToRoutine(db, routine.id, bench.id);
    const set = addRoutineSet(db, re.id, { targetReps: 8, targetWeightKg: 80 });
    db.update(routineSets).set({ deletedAt: now() }).where(eq(routineSets.id, set.id)).run();

    expect(getRoutineDetail(db, routine.id)?.exercises[0]?.sets).toEqual([]);
  });

  it('excludes a routine exercise whose underlying exercise row is soft-deleted', () => {
    const routine = createRoutine(db, 'Push Day');
    addExerciseToRoutine(db, routine.id, bench.id);
    db.update(exercises).set({ deletedAt: now() }).where(eq(exercises.id, bench.id)).run();

    expect(getRoutineDetail(db, routine.id)?.exercises).toEqual([]);
  });
});

describe('orderIndex after a soft delete', () => {
  it('does not collide across live and tombstoned routines', () => {
    const a = createRoutine(db, 'A');
    const b = createRoutine(db, 'B');
    softDeleteRoutine(db, a.id);
    const c = createRoutine(db, 'C');

    expect(new Set([a.orderIndex, b.orderIndex, c.orderIndex]).size).toBe(3);
  });
});

describe('addRoutineSet with targetWeightKg', () => {
  it('stores a target weight when one is given', () => {
    const routine = createRoutine(db, 'Push');
    const re = addExerciseToRoutine(db, routine.id, bench.id);
    const set = addRoutineSet(db, re.id, { targetReps: 5, targetWeightKg: 60 });

    const stored = db.select().from(routineSets).where(eq(routineSets.id, set.id)).get();
    expect(stored!.targetWeightKg).toBe(60);
    expect(stored!.targetReps).toBe(5);
  });

  it('leaves the target weight null when none is given', () => {
    const routine = createRoutine(db, 'Push');
    const re = addExerciseToRoutine(db, routine.id, bench.id);
    const set = addRoutineSet(db, re.id, { targetReps: 5 });

    const stored = db.select().from(routineSets).where(eq(routineSets.id, set.id)).get();
    expect(stored!.targetWeightKg).toBeNull();
  });
});

describe('reorderRoutineExercises', () => {
  it('reorders live exercises without colliding with a tombstoned sibling', () => {
    const routine = createRoutine(db, 'Push');
    const a = addExerciseToRoutine(db, routine.id, bench.id);
    const b = addExerciseToRoutine(db, routine.id, squat.id);
    const c = addExerciseToRoutine(db, routine.id, row.id);

    // Tombstone the middle one; its orderIndex 1 stays on disk.
    db.update(routineExercises).set({ deletedAt: now() }).where(eq(routineExercises.id, b.id)).run();

    // The global max BEFORE reordering, tombstones included (a=0, b=1, c=2).
    // A correct renumber must place every live row strictly above this — a
    // renumber-from-0 would not, even though it happens to preserve display
    // order, because `addExerciseToRoutine` computes its own next index over
    // all rows independently and would mask the bug for that assertion alone.
    const beforeMax = Math.max(
      ...db.select().from(routineExercises).where(eq(routineExercises.routineId, routine.id)).all().map((r) => r.orderIndex),
    );

    reorderRoutineExercises(db, routine.id, [c.id, a.id], now());

    const live = db
      .select()
      .from(routineExercises)
      .where(and(eq(routineExercises.routineId, routine.id), isNull(routineExercises.deletedAt)))
      .orderBy(asc(routineExercises.orderIndex))
      .all();
    expect(live.map((r) => r.id)).toEqual([c.id, a.id]);
    expect(live.every((r) => r.orderIndex > beforeMax)).toBe(true);

    // The next insert must still land after everything, tombstones included.
    const d = addExerciseToRoutine(db, routine.id, bench.id);
    const all = db.select().from(routineExercises).all();
    expect(d.orderIndex).toBe(Math.max(...all.filter((r) => r.id !== d.id).map((r) => r.orderIndex)) + 1);
  });
});
