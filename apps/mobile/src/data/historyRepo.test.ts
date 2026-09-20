import { exercises, newId, type Exercise } from '@workouts/schema';
import { createTestDb } from '@workouts/schema/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listFinishedWorkouts } from './historyRepo';
import { addExerciseToWorkout, addSet, completeSet, finishWorkout, startEmptyWorkout } from './sessionRepo';

const AT = 1_700_000_000_000;

let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;
let bench: Exercise;

beforeEach(() => {
  ({ db, close } = createTestDb());
  const row = {
    id: newId(),
    name: 'Bench Press',
    trackingType: 'weight_reps' as const,
    primaryMuscle: 'chest',
    secondaryMuscles: [],
    equipment: 'barbell',
  };
  db.insert(exercises).values(row).run();
  bench = row as unknown as Exercise;
});

afterEach(() => close());

function logWorkout(name: string, at: number, sets: Array<[number, number]>, finish = true) {
  const workoutId = startEmptyWorkout(db, name, at);
  const we = addExerciseToWorkout(db, workoutId, bench.id, at);
  for (const [weightKg, reps] of sets) {
    const set = addSet(db, we.id, at);
    completeSet(db, set.id, { weightKg, reps }, at);
  }
  if (finish) finishWorkout(db, workoutId, at + 1000);
  return workoutId;
}

describe('listFinishedWorkouts', () => {
  it('returns nothing when there is no history', () => {
    expect(listFinishedWorkouts(db)).toEqual([]);
  });

  it('excludes workouts that are still in progress', () => {
    logWorkout('In progress', AT, [[100, 5]], false);
    expect(listFinishedWorkouts(db)).toEqual([]);
  });

  it('returns finished workouts newest first', () => {
    logWorkout('Older', AT - 100_000, [[100, 5]]);
    logWorkout('Newer', AT, [[100, 5]]);
    expect(listFinishedWorkouts(db).map((s) => s.workout.name)).toEqual(['Newer', 'Older']);
  });

  it('summarises completed set count and total volume', () => {
    logWorkout('Push', AT, [[100, 5], [100, 3]]);
    const [summary] = listFinishedWorkouts(db);
    expect(summary?.setCount).toBe(2);
    expect(summary?.volumeKg).toBe(800);
  });

  it('respects the limit', () => {
    logWorkout('A', AT - 200_000, [[100, 5]]);
    logWorkout('B', AT - 100_000, [[100, 5]]);
    logWorkout('C', AT, [[100, 5]]);
    expect(listFinishedWorkouts(db, 2)).toHaveLength(2);
  });
});
