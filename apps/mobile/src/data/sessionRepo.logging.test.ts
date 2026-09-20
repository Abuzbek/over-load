import {
  exercises,
  newId,
  now,
  sets,
  workoutExercises,
  workouts,
  type Exercise,
} from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addExerciseToWorkout,
  addSet,
  completeSet,
  completedSetsForExercise,
  finishWorkout,
  getWorkoutDetail,
  lastPerformance,
  listAllPersonalRecords,
  listPersonalRecords,
  startEmptyWorkout,
  uncompleteSet,
} from './sessionRepo';

const AT = 1_700_000_000_000;

let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;
let bench: Exercise;
let plankId: string;
let runId: string;

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

  const plank = {
    id: newId(),
    name: 'Plank',
    trackingType: 'duration' as const,
    primaryMuscle: 'core',
    secondaryMuscles: [],
    equipment: 'bodyweight',
  };
  db.insert(exercises).values(plank).run();
  plankId = plank.id;

  const run = {
    id: newId(),
    name: 'Run',
    trackingType: 'distance_duration' as const,
    primaryMuscle: 'legs',
    secondaryMuscles: [],
    equipment: 'none',
  };
  db.insert(exercises).values(run).run();
  runId = run.id;
});

afterEach(() => close());

/** Logs one finished workout of `weightKg` x `reps` and returns its id. */
function loggedWorkout(weightKg: number, reps: number, at: number): string {
  const workoutId = startEmptyWorkout(db, 'Session', at);
  const we = addExerciseToWorkout(db, workoutId, bench.id, at);
  const set = addSet(db, we.id, at);
  completeSet(db, set.id, { weightKg, reps }, at);
  finishWorkout(db, workoutId, at + 1000);
  return workoutId;
}

describe('completeSet', () => {
  it('stamps completedAt and stores the logged values', () => {
    const workoutId = startEmptyWorkout(db, 'Session', AT);
    const we = addExerciseToWorkout(db, workoutId, bench.id, AT);
    const set = addSet(db, we.id, AT);

    completeSet(db, set.id, { weightKg: 100, reps: 5 }, AT + 60_000);

    const stored = getWorkoutDetail(db, workoutId)!.exercises[0]!.sets[0]!;
    expect(stored.completedAt).toBe(AT + 60_000);
    expect(stored.weightKg).toBe(100);
    expect(stored.reps).toBe(5);
  });

  it('leaves values untouched when they are omitted', () => {
    const workoutId = startEmptyWorkout(db, 'Session', AT);
    const we = addExerciseToWorkout(db, workoutId, bench.id, AT);
    const set = addSet(db, we.id, AT);

    completeSet(db, set.id, { weightKg: 100, reps: 5 }, AT);
    completeSet(db, set.id, { reps: 6 }, AT + 1000);

    const stored = getWorkoutDetail(db, workoutId)!.exercises[0]!.sets[0]!;
    expect(stored.weightKg).toBe(100);
    expect(stored.reps).toBe(6);
  });
});

describe('uncompleteSet', () => {
  it('clears completedAt but keeps the entered values', () => {
    const workoutId = startEmptyWorkout(db, 'Session', AT);
    const we = addExerciseToWorkout(db, workoutId, bench.id, AT);
    const set = addSet(db, we.id, AT);
    completeSet(db, set.id, { weightKg: 100, reps: 5 }, AT);

    uncompleteSet(db, set.id);

    const stored = getWorkoutDetail(db, workoutId)!.exercises[0]!.sets[0]!;
    expect(stored.completedAt).toBeNull();
    expect(stored.weightKg).toBe(100);
  });
});

describe('addSet', () => {
  it('appends with the next order index', () => {
    const workoutId = startEmptyWorkout(db, 'Session', AT);
    const we = addExerciseToWorkout(db, workoutId, bench.id, AT);
    addSet(db, we.id, AT);
    addSet(db, we.id, AT);

    const stored = getWorkoutDetail(db, workoutId)!.exercises[0]!.sets;
    expect(stored.map((s) => s.orderIndex)).toEqual([0, 1]);
  });
});

describe('lastPerformance', () => {
  it('returns nothing when the exercise has never been logged', () => {
    const workoutId = startEmptyWorkout(db, 'Session', AT);
    expect(lastPerformance(db, bench.id, workoutId)).toEqual([]);
  });

  it('returns completed sets from the most recent other workout', () => {
    loggedWorkout(90, 5, AT - 200_000);
    loggedWorkout(100, 5, AT - 100_000);
    const current = startEmptyWorkout(db, 'Today', AT);

    const previous = lastPerformance(db, bench.id, current);
    expect(previous).toHaveLength(1);
    expect(previous[0]?.weightKg).toBe(100);
  });

  it('never returns sets from the current workout', () => {
    const workoutId = startEmptyWorkout(db, 'Today', AT);
    const we = addExerciseToWorkout(db, workoutId, bench.id, AT);
    const set = addSet(db, we.id, AT);
    completeSet(db, set.id, { weightKg: 120, reps: 3 }, AT);

    expect(lastPerformance(db, bench.id, workoutId)).toEqual([]);
  });

  it('ignores sets that were never completed', () => {
    const workoutId = startEmptyWorkout(db, 'Older', AT - 100_000);
    const we = addExerciseToWorkout(db, workoutId, bench.id, AT - 100_000);
    addSet(db, we.id, AT - 100_000);
    finishWorkout(db, workoutId, AT - 90_000);

    const current = startEmptyWorkout(db, 'Today', AT);
    expect(lastPerformance(db, bench.id, current)).toEqual([]);
  });

  it('ignores sets whose workout_exercises row is tombstoned', () => {
    const workoutId = startEmptyWorkout(db, 'Older', AT - 100_000);
    const we = addExerciseToWorkout(db, workoutId, bench.id, AT - 100_000);
    const set = addSet(db, we.id, AT - 100_000);
    completeSet(db, set.id, { weightKg: 100, reps: 5 }, AT - 100_000);
    finishWorkout(db, workoutId, AT - 90_000);

    // No repository function soft-deletes a workout_exercises row yet, so we
    // reach in directly — same pattern the routine tests and Task 8's R13
    // test use to exercise tombstone filtering that has no writer function.
    db
      .update(workoutExercises)
      .set({ deletedAt: AT - 80_000 })
      .where(eq(workoutExercises.id, we.id))
      .run();

    const current = startEmptyWorkout(db, 'Today', AT);
    expect(lastPerformance(db, bench.id, current)).toEqual([]);
  });

  it('ignores sets whose exercise is tombstoned', () => {
    const workoutId = startEmptyWorkout(db, 'Older', AT - 100_000);
    const we = addExerciseToWorkout(db, workoutId, bench.id, AT - 100_000);
    const set = addSet(db, we.id, AT - 100_000);
    completeSet(db, set.id, { weightKg: 100, reps: 5 }, AT - 100_000);
    finishWorkout(db, workoutId, AT - 90_000);

    const current = startEmptyWorkout(db, 'Today', AT);
    expect(lastPerformance(db, bench.id, current)).toHaveLength(1);

    db.update(exercises).set({ deletedAt: now() }).where(eq(exercises.id, bench.id)).run();

    expect(lastPerformance(db, bench.id, current)).toEqual([]);
  });
});

describe('finishWorkout', () => {
  it('stamps endedAt', () => {
    const workoutId = startEmptyWorkout(db, 'Session', AT);
    finishWorkout(db, workoutId, AT + 3_600_000);

    const stored = db.select().from(workouts).where(eq(workouts.id, workoutId)).get();
    expect(stored?.endedAt).toBe(AT + 3_600_000);
  });

  it('recomputes personal records across all history', () => {
    loggedWorkout(100, 5, AT - 100_000);
    loggedWorkout(110, 5, AT);

    const records = listPersonalRecords(db, bench.id);
    const maxWeight = records.find((r) => r.type === 'max_weight');
    expect(maxWeight?.value).toBe(110);
  });

  it('replaces stale records rather than accumulating duplicates', () => {
    loggedWorkout(100, 5, AT - 100_000);
    const firstCount = listPersonalRecords(db, bench.id).length;

    loggedWorkout(110, 5, AT);
    expect(listPersonalRecords(db, bench.id)).toHaveLength(firstCount);
  });
});

describe('listAllPersonalRecords', () => {
  it('lists records for every exercise with the exercise name', () => {
    loggedWorkout(100, 5, AT);

    const records = listAllPersonalRecords(db);
    expect(records.some((r) => r.exerciseName === 'Bench Press')).toBe(true);
  });

  it('omits records whose exercise is tombstoned', () => {
    loggedWorkout(100, 5, AT);
    db.update(exercises).set({ deletedAt: AT + 1 }).where(eq(exercises.id, bench.id)).run();

    expect(listAllPersonalRecords(db).some((r) => r.exerciseName === 'Bench Press')).toBe(false);
  });
});

describe('getWorkoutDetail tombstone filtering (write-path coverage)', () => {
  it('excludes a soft-deleted workout', () => {
    const workoutId = startEmptyWorkout(db, 'Session', AT);
    db.update(workouts).set({ deletedAt: AT + 1 }).where(eq(workouts.id, workoutId)).run();

    expect(getWorkoutDetail(db, workoutId)).toBeUndefined();
  });

  it('excludes a soft-deleted set from the returned exercise', () => {
    const workoutId = startEmptyWorkout(db, 'Session', AT);
    const we = addExerciseToWorkout(db, workoutId, bench.id, AT);
    const keep = addSet(db, we.id, AT);
    const removed = addSet(db, we.id, AT);

    db.update(sets).set({ deletedAt: AT + 1 }).where(eq(sets.id, removed.id)).run();

    const stored = getWorkoutDetail(db, workoutId)!.exercises[0]!.sets;
    expect(stored.map((s) => s.id)).toEqual([keep.id]);
  });
});

describe('tracking type on completed sets', () => {
  it('carries the exercise tracking type onto completed sets', () => {
    // plankId is a 'duration' exercise seeded in beforeEach
    const workoutId = startEmptyWorkout(db, 'Test', now());
    const we = addExerciseToWorkout(db, workoutId, plankId, now());
    const row = addSet(db, we.id, now());
    completeSet(db, row.id, { durationSeconds: 60 }, now());

    const sets = completedSetsForExercise(db, plankId);
    expect(sets[0]!.trackingType).toBe('duration');
    expect(sets[0]!.durationSeconds).toBe(60);
  });

  it('writes distanceM through completeSet', () => {
    const workoutId = startEmptyWorkout(db, 'Test', now());
    const we = addExerciseToWorkout(db, workoutId, runId, now());
    const row = addSet(db, we.id, now());
    completeSet(db, row.id, { distanceM: 5000, durationSeconds: 1500 }, now());

    const stored = db.select().from(sets).where(eq(sets.id, row.id)).get();
    expect(stored!.distanceM).toBe(5000);
  });

  it('excludes sets whose exercise is tombstoned', () => {
    const workoutId = startEmptyWorkout(db, 'Test', now());
    const we = addExerciseToWorkout(db, workoutId, plankId, now());
    const row = addSet(db, we.id, now());
    completeSet(db, row.id, { durationSeconds: 60 }, now());

    db.update(exercises).set({ deletedAt: now() }).where(eq(exercises.id, plankId)).run();

    expect(completedSetsForExercise(db, plankId)).toEqual([]);
  });
});
