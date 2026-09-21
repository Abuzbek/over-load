import { exercises, newId, now, routineSets, workouts, type Exercise } from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addExerciseToRoutine, addRoutineSet, createRoutine } from './routineRepo';
import {
  discardWorkout,
  finishWorkout,
  getActiveWorkout,
  getActiveWorkoutId,
  getWorkoutDetail,
  startEmptyWorkout,
  startWorkoutFromRoutine,
} from './sessionRepo';

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

function pushDay() {
  const routine = createRoutine(db, 'Push Day');
  const re = addExerciseToRoutine(db, routine.id, bench.id);
  addRoutineSet(db, re.id, { targetReps: 8, targetWeightKg: 80 });
  addRoutineSet(db, re.id, { targetReps: 6, targetWeightKg: 90 });
  return routine;
}

describe('startWorkoutFromRoutine', () => {
  it('names the workout after the routine and records the start time', () => {
    const routine = pushDay();
    const detail = getWorkoutDetail(db, startWorkoutFromRoutine(db, routine.id, AT));

    expect(detail?.workout.name).toBe('Push Day');
    expect(detail?.workout.startedAt).toBe(AT);
    expect(detail?.workout.endedAt).toBeNull();
    expect(detail?.workout.routineId).toBe(routine.id);
  });

  it('copies planned sets with targets pre-filled and completedAt null', () => {
    const routine = pushDay();
    const detail = getWorkoutDetail(db, startWorkoutFromRoutine(db, routine.id, AT));
    const sets = detail!.exercises[0]!.sets;

    expect(sets.map((s) => s.reps)).toEqual([8, 6]);
    expect(sets.map((s) => s.weightKg)).toEqual([80, 90]);
    expect(sets.every((s) => s.completedAt === null)).toBe(true);
  });

  it('is a copy: editing the routine afterwards does not change the workout', () => {
    const routine = pushDay();
    const workoutId = startWorkoutFromRoutine(db, routine.id, AT);

    db.update(routineSets).set({ targetReps: 99 }).where(eq(routineSets.targetReps, 8)).run();

    const sets = getWorkoutDetail(db, workoutId)!.exercises[0]!.sets;
    expect(sets.map((s) => s.reps)).toEqual([8, 6]);
  });

  it('throws for an unknown routine', () => {
    expect(() => startWorkoutFromRoutine(db, newId(), AT)).toThrow(/routine not found/i);
  });

  it('excludes an exercise from the detail once its definition is soft-deleted', () => {
    const routine = pushDay();
    const workoutId = startWorkoutFromRoutine(db, routine.id, AT);

    db.update(exercises).set({ deletedAt: now() }).where(eq(exercises.id, bench.id)).run();

    const detail = getWorkoutDetail(db, workoutId);
    expect(detail?.exercises).toEqual([]);
  });
});

describe('startEmptyWorkout', () => {
  it('creates a workout with no routine and no exercises', () => {
    const detail = getWorkoutDetail(db, startEmptyWorkout(db, 'Freestyle', AT));
    expect(detail?.workout.routineId).toBeNull();
    expect(detail?.exercises).toEqual([]);
  });
});

describe('getActiveWorkoutId', () => {
  it('returns undefined when nothing is in progress', () => {
    expect(getActiveWorkoutId(db)).toBeUndefined();
  });

  it('returns the workout that has no endedAt', () => {
    const workoutId = startEmptyWorkout(db, 'Freestyle', AT);
    expect(getActiveWorkoutId(db)).toBe(workoutId);
  });

  it('returns the most recently started one if several are unfinished', () => {
    startEmptyWorkout(db, 'Older', AT);
    const newer = startEmptyWorkout(db, 'Newer', AT + 1000);
    expect(getActiveWorkoutId(db)).toBe(newer);
  });
});

describe('discardWorkout', () => {
  it('tombstones the workout so it is no longer the active one', () => {
    const workoutId = startEmptyWorkout(db, 'Abandoned', AT);
    expect(getActiveWorkoutId(db)).toBe(workoutId);

    discardWorkout(db, workoutId, AT + 5000);

    expect(getActiveWorkoutId(db)).toBeUndefined();
    expect(getWorkoutDetail(db, workoutId)).toBeUndefined();
  });

  it('records the tombstone and the update time rather than deleting the row', () => {
    const workoutId = startEmptyWorkout(db, 'Abandoned', AT);

    discardWorkout(db, workoutId, AT + 5000);

    const row = db.select().from(workouts).where(eq(workouts.id, workoutId)).get();
    expect(row).toMatchObject({ deletedAt: AT + 5000, updatedAt: AT + 5000, endedAt: null });
  });

  it('leaves an older unfinished workout resumable once the newer one is discarded', () => {
    const older = startEmptyWorkout(db, 'Older', AT);
    const newer = startEmptyWorkout(db, 'Newer', AT + 1000);

    discardWorkout(db, newer, AT + 2000);

    expect(getActiveWorkoutId(db)).toBe(older);
  });
});

describe('getActiveWorkout', () => {
  it('returns undefined when nothing is in progress', () => {
    expect(getActiveWorkout(db)).toBeUndefined();
  });

  it('returns the unfinished workout with its name and start time', () => {
    const at = now();
    const id = startEmptyWorkout(db, 'Empty workout', at);
    const active = getActiveWorkout(db);
    expect(active?.id).toBe(id);
    expect(active?.name).toBe('Empty workout');
    expect(active?.startedAt).toBe(at);
  });

  it('returns undefined once the workout is finished', () => {
    const id = startEmptyWorkout(db, 'Empty workout', now());
    finishWorkout(db, id, now());
    expect(getActiveWorkout(db)).toBeUndefined();
  });

  it('returns undefined for a discarded workout', () => {
    const id = startEmptyWorkout(db, 'Empty workout', now());
    discardWorkout(db, id, now());
    expect(getActiveWorkout(db)).toBeUndefined();
  });

  // Matches getActiveWorkoutId: newest wins, which is what the resume banner
  // and the stranded-workout guard both already assume.
  it('returns the newest unfinished workout when several exist', () => {
    startEmptyWorkout(db, 'Older', now() - 10_000);
    const newer = startEmptyWorkout(db, 'Newer', now());
    expect(getActiveWorkout(db)?.id).toBe(newer);
  });
});
