import { exercises, newId, now, workoutExercises, workoutSets, sessions, type Exercise } from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addExerciseToWorkout,
  addWorkoutSet,
  createWorkout,
  getWorkoutDetail,
  listWorkoutSummaries,
  listWorkouts,
  reorderWorkoutExercises,
  softDeleteWorkout,
} from './workoutRepo';

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

describe('createWorkout and listWorkouts', () => {
  it('creates a workout and lists it', () => {
    createWorkout(db, 'Push Day');
    expect(listWorkouts(db).map((r) => r.name)).toEqual(['Push Day']);
  });

  it('excludes tombstoned workouts', () => {
    const workout = createWorkout(db, 'Push Day');
    softDeleteWorkout(db, workout.id);
    expect(listWorkouts(db)).toHaveLength(0);
  });
});

describe('getWorkoutDetail', () => {
  it('returns undefined for an unknown workout', () => {
    expect(getWorkoutDetail(db, newId())).toBeUndefined();
  });

  it('assigns sequential order indexes as exercises are added', () => {
    const workout = createWorkout(db, 'Push Day');
    addExerciseToWorkout(db, workout.id, bench.id);
    addExerciseToWorkout(db, workout.id, squat.id);

    const detail = getWorkoutDetail(db, workout.id);
    expect(detail?.exercises.map((e) => e.workoutExercise.orderIndex)).toEqual([0, 1]);
    expect(detail?.exercises.map((e) => e.exercise.name)).toEqual(['Bench Press', 'Back Squat']);
  });

  it('nests target sets under their exercise in order', () => {
    const workout = createWorkout(db, 'Push Day');
    const re = addExerciseToWorkout(db, workout.id, bench.id);
    addWorkoutSet(db, re.id, { targetReps: 8, targetWeightKg: 80 });
    addWorkoutSet(db, re.id, { targetReps: 6, targetWeightKg: 90 });

    const detail = getWorkoutDetail(db, workout.id);
    expect(detail?.exercises[0]?.sessionSets.map((s) => s.targetReps)).toEqual([8, 6]);
    expect(detail?.exercises[0]?.sessionSets.map((s) => s.orderIndex)).toEqual([0, 1]);
  });

  it('returns a workout with no exercises as an empty list, not undefined', () => {
    const workout = createWorkout(db, 'Empty');
    expect(getWorkoutDetail(db, workout.id)?.exercises).toEqual([]);
  });
});

describe('getWorkoutDetail tombstone filtering', () => {
  it('returns undefined for a soft-deleted workout', () => {
    const workout = createWorkout(db, 'Push Day');
    softDeleteWorkout(db, workout.id);
    expect(getWorkoutDetail(db, workout.id)).toBeUndefined();
  });

  it('excludes a soft-deleted workout exercise', () => {
    const workout = createWorkout(db, 'Push Day');
    const re = addExerciseToWorkout(db, workout.id, bench.id);
    db.update(workoutExercises).set({ deletedAt: now() }).where(eq(workoutExercises.id, re.id)).run();

    expect(getWorkoutDetail(db, workout.id)?.exercises).toEqual([]);
  });

  it('excludes a soft-deleted workout set from its exercise', () => {
    const workout = createWorkout(db, 'Push Day');
    const re = addExerciseToWorkout(db, workout.id, bench.id);
    const set = addWorkoutSet(db, re.id, { targetReps: 8, targetWeightKg: 80 });
    db.update(workoutSets).set({ deletedAt: now() }).where(eq(workoutSets.id, set.id)).run();

    expect(getWorkoutDetail(db, workout.id)?.exercises[0]?.sessionSets).toEqual([]);
  });

  it('excludes a workout exercise whose underlying exercise row is soft-deleted', () => {
    const workout = createWorkout(db, 'Push Day');
    addExerciseToWorkout(db, workout.id, bench.id);
    db.update(exercises).set({ deletedAt: now() }).where(eq(exercises.id, bench.id)).run();

    expect(getWorkoutDetail(db, workout.id)?.exercises).toEqual([]);
  });
});

describe('orderIndex after a soft delete', () => {
  it('does not collide across live and tombstoned workouts', () => {
    const a = createWorkout(db, 'A');
    const b = createWorkout(db, 'B');
    softDeleteWorkout(db, a.id);
    const c = createWorkout(db, 'C');

    expect(new Set([a.orderIndex, b.orderIndex, c.orderIndex]).size).toBe(3);
  });
});

describe('addWorkoutSet with targetWeightKg', () => {
  it('stores a target weight when one is given', () => {
    const workout = createWorkout(db, 'Push');
    const re = addExerciseToWorkout(db, workout.id, bench.id);
    const set = addWorkoutSet(db, re.id, { targetReps: 5, targetWeightKg: 60 });

    const stored = db.select().from(workoutSets).where(eq(workoutSets.id, set.id)).get();
    expect(stored!.targetWeightKg).toBe(60);
    expect(stored!.targetReps).toBe(5);
  });

  it('leaves the target weight null when none is given', () => {
    const workout = createWorkout(db, 'Push');
    const re = addExerciseToWorkout(db, workout.id, bench.id);
    const set = addWorkoutSet(db, re.id, { targetReps: 5 });

    const stored = db.select().from(workoutSets).where(eq(workoutSets.id, set.id)).get();
    expect(stored!.targetWeightKg).toBeNull();
  });
});

describe('reorderWorkoutExercises', () => {
  it('reorders live exercises without colliding with a tombstoned sibling', () => {
    const workout = createWorkout(db, 'Push');
    const a = addExerciseToWorkout(db, workout.id, bench.id);
    const b = addExerciseToWorkout(db, workout.id, squat.id);
    const c = addExerciseToWorkout(db, workout.id, row.id);

    // Tombstone the middle one; its orderIndex 1 stays on disk.
    db.update(workoutExercises).set({ deletedAt: now() }).where(eq(workoutExercises.id, b.id)).run();

    // The global max BEFORE reordering, tombstones included (a=0, b=1, c=2).
    // A correct renumber must place every live row strictly above this — a
    // renumber-from-0 would not, even though it happens to preserve display
    // order, because `addExerciseToWorkout` computes its own next index over
    // all rows independently and would mask the bug for that assertion alone.
    const beforeMax = Math.max(
      ...db.select().from(workoutExercises).where(eq(workoutExercises.workoutId, workout.id)).all().map((r) => r.orderIndex),
    );

    reorderWorkoutExercises(db, workout.id, [c.id, a.id], now());

    const live = db
      .select()
      .from(workoutExercises)
      .where(and(eq(workoutExercises.workoutId, workout.id), isNull(workoutExercises.deletedAt)))
      .orderBy(asc(workoutExercises.orderIndex))
      .all();
    expect(live.map((r) => r.id)).toEqual([c.id, a.id]);
    expect(live.every((r) => r.orderIndex > beforeMax)).toBe(true);

    // The next insert must still land after everything, tombstones included.
    const d = addExerciseToWorkout(db, workout.id, bench.id);
    const all = db.select().from(workoutExercises).all();
    expect(d.orderIndex).toBe(Math.max(...all.filter((r) => r.id !== d.id).map((r) => r.orderIndex)) + 1);
  });
});

describe('listWorkoutSummaries', () => {
  it('counts live exercises and lists their primary muscles in order', () => {
    const workout = createWorkout(db, 'Push Day');
    addExerciseToWorkout(db, workout.id, bench.id);
    addExerciseToWorkout(db, workout.id, squat.id);

    const [summary] = listWorkoutSummaries(db);
    expect(summary!.exerciseCount).toBe(2);
    expect(summary!.primaryMuscles).toEqual(['chest', 'quads']);
    expect(summary!.lastTrainedAt).toBeNull();
  });

  it('reports the most recent finished workout as lastTrainedAt', () => {
    const workout = createWorkout(db, 'Push Day');
    const ts = now();
    db.insert(sessions).values([
      { id: newId(), workoutId: workout.id, name: 'Push Day', startedAt: ts - 5000, endedAt: ts - 4000 },
      { id: newId(), workoutId: workout.id, name: 'Push Day', startedAt: ts - 1000, endedAt: ts },
    ]).run();

    expect(listWorkoutSummaries(db)[0]!.lastTrainedAt).toBe(ts - 1000);
  });

  it('ignores a workout that is still in progress', () => {
    const workout = createWorkout(db, 'Push Day');
    db.insert(sessions).values({
      id: newId(), workoutId: workout.id, name: 'Push Day', startedAt: now(), endedAt: null,
    }).run();

    expect(listWorkoutSummaries(db)[0]!.lastTrainedAt).toBeNull();
  });

  // --- one tombstone test per joined level ---

  it('level 1: excludes a tombstoned workout', () => {
    const workout = createWorkout(db, 'Push Day');
    softDeleteWorkout(db, workout.id);
    expect(listWorkoutSummaries(db)).toHaveLength(0);
  });

  it('level 2: does not count a tombstoned workout_exercise', () => {
    const workout = createWorkout(db, 'Push Day');
    const entry = addExerciseToWorkout(db, workout.id, bench.id);
    addExerciseToWorkout(db, workout.id, squat.id);
    db.update(workoutExercises).set({ deletedAt: now() }).where(eq(workoutExercises.id, entry.id)).run();

    const [summary] = listWorkoutSummaries(db);
    expect(summary!.exerciseCount).toBe(1);
    expect(summary!.primaryMuscles).toEqual(['quads']);
  });

  it('level 3: does not count an entry whose exercise is tombstoned', () => {
    const workout = createWorkout(db, 'Push Day');
    addExerciseToWorkout(db, workout.id, bench.id);
    addExerciseToWorkout(db, workout.id, squat.id);
    db.update(exercises).set({ deletedAt: now() }).where(eq(exercises.id, bench.id)).run();

    const [summary] = listWorkoutSummaries(db);
    expect(summary!.exerciseCount).toBe(1);
    expect(summary!.primaryMuscles).toEqual(['quads']);
  });

  it('level 4: ignores a tombstoned workout when computing lastTrainedAt', () => {
    const workout = createWorkout(db, 'Push Day');
    const ts = now();
    const kept = newId();
    const dropped = newId();
    db.insert(sessions).values([
      { id: kept, workoutId: workout.id, name: 'Push Day', startedAt: ts - 5000, endedAt: ts - 4000 },
      { id: dropped, workoutId: workout.id, name: 'Push Day', startedAt: ts - 1000, endedAt: ts },
    ]).run();
    db.update(sessions).set({ deletedAt: ts }).where(eq(sessions.id, dropped)).run();

    expect(listWorkoutSummaries(db)[0]!.lastTrainedAt).toBe(ts - 5000);
  });
});
