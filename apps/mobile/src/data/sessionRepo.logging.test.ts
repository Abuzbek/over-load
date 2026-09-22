import {
  exercises,
  newId,
  now,
  sessionSets,
  sessionExercises,
  sessions,
  type Exercise,
} from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startBareSession } from './sessionTestFixtures';
import {
  addExerciseToSession,
  addSet,
  completeSet,
  completedSetsForExercise,
  finishSession,
  getSessionDetail,
  lastPerformance,
  listAllPersonalRecords,
  listPersonalRecords,
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
  const sessionId = startBareSession(db, 'Session', at);
  const we = addExerciseToSession(db, sessionId, bench.id, at);
  const set = addSet(db, we.id, at);
  completeSet(db, set.id, { weightKg, reps }, at);
  finishSession(db, sessionId, at + 1000);
  return sessionId;
}

describe('completeSet', () => {
  it('stamps completedAt and stores the logged values', () => {
    const sessionId = startBareSession(db, 'Session', AT);
    const we = addExerciseToSession(db, sessionId, bench.id, AT);
    const set = addSet(db, we.id, AT);

    completeSet(db, set.id, { weightKg: 100, reps: 5 }, AT + 60_000);

    const stored = getSessionDetail(db, sessionId)!.exercises[0]!.sessionSets[0]!;
    expect(stored.completedAt).toBe(AT + 60_000);
    expect(stored.weightKg).toBe(100);
    expect(stored.reps).toBe(5);
  });

  it('leaves values untouched when they are omitted', () => {
    const sessionId = startBareSession(db, 'Session', AT);
    const we = addExerciseToSession(db, sessionId, bench.id, AT);
    const set = addSet(db, we.id, AT);

    completeSet(db, set.id, { weightKg: 100, reps: 5 }, AT);
    completeSet(db, set.id, { reps: 6 }, AT + 1000);

    const stored = getSessionDetail(db, sessionId)!.exercises[0]!.sessionSets[0]!;
    expect(stored.weightKg).toBe(100);
    expect(stored.reps).toBe(6);
  });
});

describe('uncompleteSet', () => {
  it('clears completedAt but keeps the entered values', () => {
    const sessionId = startBareSession(db, 'Session', AT);
    const we = addExerciseToSession(db, sessionId, bench.id, AT);
    const set = addSet(db, we.id, AT);
    completeSet(db, set.id, { weightKg: 100, reps: 5 }, AT);

    uncompleteSet(db, set.id);

    const stored = getSessionDetail(db, sessionId)!.exercises[0]!.sessionSets[0]!;
    expect(stored.completedAt).toBeNull();
    expect(stored.weightKg).toBe(100);
  });
});

describe('addSet', () => {
  it('appends with the next order index', () => {
    const sessionId = startBareSession(db, 'Session', AT);
    const we = addExerciseToSession(db, sessionId, bench.id, AT);
    addSet(db, we.id, AT);
    addSet(db, we.id, AT);

    const stored = getSessionDetail(db, sessionId)!.exercises[0]!.sessionSets;
    expect(stored.map((s) => s.orderIndex)).toEqual([0, 1]);
  });

  it('starts the first set with no load', () => {
    const sessionId = startBareSession(db, 'Session', AT);
    const we = addExerciseToSession(db, sessionId, bench.id, AT);

    const first = addSet(db, we.id, AT);
    expect(first.weightKg).toBeNull();
    expect(first.reps).toBeNull();
  });

  // Deliberate: the next set almost always uses the same load, so typing it
  // again is friction. Untested until now, which meant a refactor could have
  // dropped it silently — it is only visible by adding a second set in the app.
  it("carries the previous set's load forward", () => {
    const sessionId = startBareSession(db, 'Session', AT);
    const we = addExerciseToSession(db, sessionId, bench.id, AT);
    const first = addSet(db, we.id, AT);
    completeSet(db, first.id, { weightKg: 100, reps: 5 }, AT);

    const second = addSet(db, we.id, AT);
    expect(second.weightKg).toBe(100);
    expect(second.reps).toBe(5);
  });

  // Duration and distance are NOT carried: a plank's hold time is the thing you
  // are trying to beat, not repeat.
  it('does not carry duration or distance forward', () => {
    const sessionId = startBareSession(db, 'Session', AT);
    const we = addExerciseToSession(db, sessionId, bench.id, AT);
    const first = addSet(db, we.id, AT);
    completeSet(db, first.id, { durationSeconds: 130, distanceM: 400 }, AT);

    const second = addSet(db, we.id, AT);
    expect(second.durationSeconds).toBeNull();
    expect(second.distanceM).toBeNull();
  });
});

describe('lastPerformance', () => {
  it('returns nothing when the exercise has never been logged', () => {
    const sessionId = startBareSession(db, 'Session', AT);
    expect(lastPerformance(db, bench.id, sessionId)).toEqual([]);
  });

  it('returns completed sessionSets from the most recent other workout', () => {
    loggedWorkout(90, 5, AT - 200_000);
    loggedWorkout(100, 5, AT - 100_000);
    const current = startBareSession(db, 'Today', AT);

    const previous = lastPerformance(db, bench.id, current);
    expect(previous).toHaveLength(1);
    expect(previous[0]?.weightKg).toBe(100);
  });

  it('never returns sessionSets from the current workout', () => {
    const sessionId = startBareSession(db, 'Today', AT);
    const we = addExerciseToSession(db, sessionId, bench.id, AT);
    const set = addSet(db, we.id, AT);
    completeSet(db, set.id, { weightKg: 120, reps: 3 }, AT);

    expect(lastPerformance(db, bench.id, sessionId)).toEqual([]);
  });

  it('ignores sessionSets that were never completed', () => {
    const sessionId = startBareSession(db, 'Older', AT - 100_000);
    const we = addExerciseToSession(db, sessionId, bench.id, AT - 100_000);
    addSet(db, we.id, AT - 100_000);
    finishSession(db, sessionId, AT - 90_000);

    const current = startBareSession(db, 'Today', AT);
    expect(lastPerformance(db, bench.id, current)).toEqual([]);
  });

  it('ignores sessionSets whose workout_exercises row is tombstoned', () => {
    const sessionId = startBareSession(db, 'Older', AT - 100_000);
    const we = addExerciseToSession(db, sessionId, bench.id, AT - 100_000);
    const set = addSet(db, we.id, AT - 100_000);
    completeSet(db, set.id, { weightKg: 100, reps: 5 }, AT - 100_000);
    finishSession(db, sessionId, AT - 90_000);

    // No repository function soft-deletes a workout_exercises row yet, so we
    // reach in directly — same pattern the workout tests and Task 8's R13
    // test use to exercise tombstone filtering that has no writer function.
    db
      .update(sessionExercises)
      .set({ deletedAt: AT - 80_000 })
      .where(eq(sessionExercises.id, we.id))
      .run();

    const current = startBareSession(db, 'Today', AT);
    expect(lastPerformance(db, bench.id, current)).toEqual([]);
  });

  it('ignores sets whose exercise is tombstoned', () => {
    const sessionId = startBareSession(db, 'Older', AT - 100_000);
    const we = addExerciseToSession(db, sessionId, bench.id, AT - 100_000);
    const set = addSet(db, we.id, AT - 100_000);
    completeSet(db, set.id, { weightKg: 100, reps: 5 }, AT - 100_000);
    finishSession(db, sessionId, AT - 90_000);

    const current = startBareSession(db, 'Today', AT);
    expect(lastPerformance(db, bench.id, current)).toHaveLength(1);

    db.update(exercises).set({ deletedAt: now() }).where(eq(exercises.id, bench.id)).run();

    expect(lastPerformance(db, bench.id, current)).toEqual([]);
  });
});

describe('finishSession', () => {
  it('stamps endedAt', () => {
    const sessionId = startBareSession(db, 'Session', AT);
    finishSession(db, sessionId, AT + 3_600_000);

    const stored = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
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

describe('getSessionDetail tombstone filtering (write-path coverage)', () => {
  it('excludes a soft-deleted workout', () => {
    const sessionId = startBareSession(db, 'Session', AT);
    db.update(sessions).set({ deletedAt: AT + 1 }).where(eq(sessions.id, sessionId)).run();

    expect(getSessionDetail(db, sessionId)).toBeUndefined();
  });

  it('excludes a soft-deleted set from the returned exercise', () => {
    const sessionId = startBareSession(db, 'Session', AT);
    const we = addExerciseToSession(db, sessionId, bench.id, AT);
    const keep = addSet(db, we.id, AT);
    const removed = addSet(db, we.id, AT);

    db.update(sessionSets).set({ deletedAt: AT + 1 }).where(eq(sessionSets.id, removed.id)).run();

    const stored = getSessionDetail(db, sessionId)!.exercises[0]!.sessionSets;
    expect(stored.map((s) => s.id)).toEqual([keep.id]);
  });
});

describe('tracking type on completed sets', () => {
  it('carries the exercise tracking type onto completed sets', () => {
    // plankId is a 'duration' exercise seeded in beforeEach
    const sessionId = startBareSession(db, 'Test', now());
    const we = addExerciseToSession(db, sessionId, plankId, now());
    const row = addSet(db, we.id, now());
    completeSet(db, row.id, { durationSeconds: 60 }, now());

    const sessionSets = completedSetsForExercise(db, plankId);
    expect(sessionSets[0]!.trackingType).toBe('duration');
    expect(sessionSets[0]!.durationSeconds).toBe(60);
  });

  it('writes distanceM through completeSet', () => {
    const sessionId = startBareSession(db, 'Test', now());
    const we = addExerciseToSession(db, sessionId, runId, now());
    const row = addSet(db, we.id, now());
    completeSet(db, row.id, { distanceM: 5000, durationSeconds: 1500 }, now());

    const stored = db.select().from(sessionSets).where(eq(sessionSets.id, row.id)).get();
    expect(stored!.distanceM).toBe(5000);
  });

  it('excludes sets whose exercise is tombstoned', () => {
    const sessionId = startBareSession(db, 'Test', now());
    const we = addExerciseToSession(db, sessionId, plankId, now());
    const row = addSet(db, we.id, now());
    completeSet(db, row.id, { durationSeconds: 60 }, now());

    db.update(exercises).set({ deletedAt: now() }).where(eq(exercises.id, plankId)).run();

    expect(completedSetsForExercise(db, plankId)).toEqual([]);
  });
});
