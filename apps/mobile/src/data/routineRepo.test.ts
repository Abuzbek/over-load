import { exercises, newId, now, routineExercises, routineSets, type Exercise } from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addExerciseToRoutine,
  addRoutineSet,
  createRoutine,
  getRoutineDetail,
  listRoutines,
  softDeleteRoutine,
} from './routineRepo';

let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;
let bench: Exercise;
let squat: Exercise;

beforeEach(() => {
  ({ db, close } = createTestDb());
  const rows = [
    { id: newId(), name: 'Bench Press', trackingType: 'weight_reps' as const, primaryMuscle: 'chest', secondaryMuscles: [], equipment: 'barbell' },
    { id: newId(), name: 'Back Squat', trackingType: 'weight_reps' as const, primaryMuscle: 'quads', secondaryMuscles: [], equipment: 'barbell' },
  ];
  db.insert(exercises).values(rows).run();
  [bench, squat] = rows as unknown as [Exercise, Exercise];
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
