import { exercises, newId, now, sets, workoutExercises, workouts, type Exercise } from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listFinishedWorkouts, periodTotals } from './historyRepo';
import { addExerciseToWorkout, addSet, completeSet, finishWorkout, startEmptyWorkout } from './sessionRepo';

const AT = 1_700_000_000_000;

let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;
let bench: Exercise;
let plank: Exercise;

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

  // A non-weight exercise, seeded alongside bench so a stub that hardcoded
  // trackingType: 'weight_reps' in place of the joined column would still
  // pass every other test in this file.
  const plankRow = {
    id: newId(),
    name: 'Plank',
    trackingType: 'duration' as const,
    primaryMuscle: 'core',
    secondaryMuscles: [],
    equipment: 'bodyweight',
  };
  db.insert(exercises).values(plankRow).run();
  plank = plankRow as unknown as Exercise;
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

  it('counts a set on a non-weight exercise toward setCount but not volumeKg, even with a stray weightKg/reps', () => {
    const workoutId = startEmptyWorkout(db, 'Core', AT);
    const we = addExerciseToWorkout(db, workoutId, plank.id, AT);
    const set = addSet(db, we.id, AT);
    // The stray weightKg/reps are the kind of junk a duration set can carry
    // (e.g. left over from switching an exercise's tracking type); they must
    // not be counted as volume just because the columns are populated.
    completeSet(db, set.id, { weightKg: 17, reps: 8, durationSeconds: 60 }, AT);
    finishWorkout(db, workoutId, AT + 1000);

    const [summary] = listFinishedWorkouts(db);
    expect(summary?.workout.id).toBe(workoutId);
    expect(summary?.setCount).toBe(1);
    expect(summary?.volumeKg).toBe(0);
  });

  it('respects the limit, keeping the newest workouts rather than an arbitrary two', () => {
    logWorkout('A', AT - 200_000, [[100, 5]]);
    logWorkout('B', AT - 100_000, [[100, 5]]);
    logWorkout('C', AT, [[100, 5]]);

    // Asserting the names, not just the length: a limit applied before the
    // ordering would still return two rows, just the wrong two.
    expect(listFinishedWorkouts(db, 2).map((s) => s.workout.name)).toEqual(['C', 'B']);
  });

  it('ignores sets whose exercise definition has been tombstoned, as the detail read does', () => {
    const workoutId = logWorkout('Push', AT, [[100, 5], [100, 3]]);
    expect(listFinishedWorkouts(db)[0]).toMatchObject({ setCount: 2, volumeKg: 800 });

    db.update(exercises).set({ deletedAt: now() }).where(eq(exercises.id, bench.id)).run();

    const [summary] = listFinishedWorkouts(db);
    expect(summary?.workout.id).toBe(workoutId);
    expect(summary?.setCount).toBe(0);
    expect(summary?.volumeKg).toBe(0);
  });
});

describe('periodTotals', () => {
  it('returns zeros for an empty window, never null', () => {
    expect(periodTotals(db, 0, AT)).toEqual({ sets: 0, exercises: 0, muscles: 0 });
  });

  it('counts completed sets, distinct exercises and distinct primary muscles', () => {
    const workoutId = startEmptyWorkout(db, 'Push', AT);
    const we = addExerciseToWorkout(db, workoutId, bench.id, AT);
    for (const [weightKg, reps] of [[100, 5], [100, 5], [100, 3]] as Array<[number, number]>) {
      const set = addSet(db, we.id, AT);
      completeSet(db, set.id, { weightKg, reps }, AT);
    }

    expect(periodTotals(db, AT - 1000, AT + 1000)).toEqual({ sets: 3, exercises: 1, muscles: 1 });
  });

  it('excludes a planned-but-not-performed set (completedAt IS NULL)', () => {
    const workoutId = startEmptyWorkout(db, 'Push', AT);
    const we = addExerciseToWorkout(db, workoutId, bench.id, AT);
    addSet(db, we.id, AT); // never completed

    expect(periodTotals(db, AT - 1000, AT + 1000)).toEqual({ sets: 0, exercises: 0, muscles: 0 });
  });

  it('counts the same exercise across two workouts once, distinctly', () => {
    const w1 = startEmptyWorkout(db, 'A', AT);
    const we1 = addExerciseToWorkout(db, w1, bench.id, AT);
    const s1 = addSet(db, we1.id, AT);
    completeSet(db, s1.id, { weightKg: 100, reps: 5 }, AT);

    const w2 = startEmptyWorkout(db, 'B', AT + 500);
    const we2 = addExerciseToWorkout(db, w2, bench.id, AT + 500);
    const s2 = addSet(db, we2.id, AT + 500);
    completeSet(db, s2.id, { weightKg: 100, reps: 5 }, AT + 500);

    expect(periodTotals(db, AT - 1000, AT + 1000)).toEqual({ sets: 2, exercises: 1, muscles: 1 });
  });

  it('includes a set exactly at sinceMs and one exactly at untilMs; excludes one a millisecond outside either edge', () => {
    const workoutId = startEmptyWorkout(db, 'Push', AT);
    const we = addExerciseToWorkout(db, workoutId, bench.id, AT);

    const atSince = addSet(db, we.id, AT);
    completeSet(db, atSince.id, { weightKg: 100, reps: 5 }, AT);

    const atUntil = addSet(db, we.id, AT);
    completeSet(db, atUntil.id, { weightKg: 100, reps: 5 }, AT + 1000);

    const beforeSince = addSet(db, we.id, AT);
    completeSet(db, beforeSince.id, { weightKg: 100, reps: 5 }, AT - 1);

    const afterUntil = addSet(db, we.id, AT);
    completeSet(db, afterUntil.id, { weightKg: 100, reps: 5 }, AT + 1001);

    expect(periodTotals(db, AT, AT + 1000)).toEqual({ sets: 2, exercises: 1, muscles: 1 });
  });
});

describe('periodTotals tombstone filtering', () => {
  function loggedSet() {
    const workoutId = startEmptyWorkout(db, 'Push', AT);
    const we = addExerciseToWorkout(db, workoutId, bench.id, AT);
    const set = addSet(db, we.id, AT);
    completeSet(db, set.id, { weightKg: 100, reps: 5 }, AT);
    return { workoutId, workoutExerciseId: we.id, setId: set.id };
  }

  it('excludes a soft-deleted set', () => {
    const { setId } = loggedSet();
    db.update(sets).set({ deletedAt: now() }).where(eq(sets.id, setId)).run();

    expect(periodTotals(db, AT - 1000, AT + 1000)).toEqual({ sets: 0, exercises: 0, muscles: 0 });
  });

  it('excludes a set whose workout_exercise is soft-deleted', () => {
    const { workoutExerciseId } = loggedSet();
    db.update(workoutExercises).set({ deletedAt: now() }).where(eq(workoutExercises.id, workoutExerciseId)).run();

    expect(periodTotals(db, AT - 1000, AT + 1000)).toEqual({ sets: 0, exercises: 0, muscles: 0 });
  });

  it('excludes a set whose exercise definition is soft-deleted', () => {
    loggedSet();
    db.update(exercises).set({ deletedAt: now() }).where(eq(exercises.id, bench.id)).run();

    expect(periodTotals(db, AT - 1000, AT + 1000)).toEqual({ sets: 0, exercises: 0, muscles: 0 });
  });

  it('excludes a set whose workout is soft-deleted', () => {
    const { workoutId } = loggedSet();
    db.update(workouts).set({ deletedAt: now() }).where(eq(workouts.id, workoutId)).run();

    expect(periodTotals(db, AT - 1000, AT + 1000)).toEqual({ sets: 0, exercises: 0, muscles: 0 });
  });
});
