import { and, eq, isNotNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exercises } from './exercises';
import { newId } from './sync';
import { createTestDb, type TestDb } from './testing/memoryDb';
import { sets, workoutExercises, workouts } from './workouts';

let db: TestDb;
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestDb());
});

afterEach(() => close());

function seedWorkoutExercise() {
  const exerciseId = newId();
  const workoutId = newId();
  const workoutExerciseId = newId();

  db.insert(exercises).values({
    id: exerciseId,
    name: 'Back Squat',
    trackingType: 'weight_reps',
    primaryMuscle: 'quads',
    secondaryMuscles: ['glutes'],
    equipment: 'barbell',
  }).run();

  db.insert(workouts).values({
    id: workoutId,
    name: 'Leg Day',
    startedAt: 1_700_000_000_000,
  }).run();

  db.insert(workoutExercises).values({
    id: workoutExerciseId,
    workoutId,
    exerciseId,
    orderIndex: 0,
  }).run();

  return { exerciseId, workoutId, workoutExerciseId };
}

describe('workouts tree', () => {
  it('treats a workout with no endedAt as in progress', () => {
    const { workoutId } = seedWorkoutExercise();
    const [row] = db.select().from(workouts).where(eq(workouts.id, workoutId)).all();
    expect(row?.endedAt).toBeNull();
  });

  it('stores planned sets with a null completedAt', () => {
    const { workoutExerciseId } = seedWorkoutExercise();
    db.insert(sets).values({
      workoutExerciseId,
      orderIndex: 0,
      setType: 'normal',
      weightKg: 100,
      reps: 5,
    }).run();

    const [row] = db.select().from(sets).all();
    expect(row?.completedAt).toBeNull();
    expect(row?.weightKg).toBe(100);
  });

  it('distinguishes completed from planned sets', () => {
    const { workoutExerciseId } = seedWorkoutExercise();
    db.insert(sets).values([
      { id: newId(), workoutExerciseId, orderIndex: 0, weightKg: 100, reps: 5, completedAt: 1_700_000_001_000 },
      { id: newId(), workoutExerciseId, orderIndex: 1, weightKg: 100, reps: 5 },
    ]).run();

    const completed = db.select().from(sets).where(isNotNull(sets.completedAt)).all();
    expect(completed).toHaveLength(1);
    expect(completed[0]?.orderIndex).toBe(0);
  });

  it('groups supersets by a shared integer on workout_exercises', () => {
    const { workoutId, exerciseId } = seedWorkoutExercise();
    db.insert(workoutExercises).values([
      { id: newId(), workoutId, exerciseId, orderIndex: 1, supersetGroup: 1 },
      { id: newId(), workoutId, exerciseId, orderIndex: 2, supersetGroup: 1 },
    ]).run();

    const superset = db
      .select()
      .from(workoutExercises)
      .where(and(eq(workoutExercises.workoutId, workoutId), eq(workoutExercises.supersetGroup, 1)))
      .all();

    expect(superset).toHaveLength(2);
  });

  it('rejects a set whose parent workout_exercise does not exist', () => {
    expect(() =>
      db.insert(sets).values({ workoutExerciseId: newId(), orderIndex: 0 }).run(),
    ).toThrow(/FOREIGN KEY/i);
  });
});
