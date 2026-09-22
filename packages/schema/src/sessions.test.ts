import { and, eq, isNotNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exercises } from './exercises';
import { newId } from './sync';
import { createTestDb, type TestDb } from './testing/memoryDb';
import { sessionSets, sessionExercises, sessions } from './sessions';

let db: TestDb;
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestDb());
});

afterEach(() => close());

function seedWorkoutExercise() {
  const exerciseId = newId();
  const sessionId = newId();
  const sessionExerciseId = newId();

  db.insert(exercises).values({
    id: exerciseId,
    name: 'Back Squat',
    trackingType: 'weight_reps',
    primaryMuscle: 'quads',
    secondaryMuscles: ['glutes'],
    equipment: 'barbell',
  }).run();

  db.insert(sessions).values({
    id: sessionId,
    name: 'Leg Day',
    startedAt: 1_700_000_000_000,
  }).run();

  db.insert(sessionExercises).values({
    id: sessionExerciseId,
    sessionId,
    exerciseId,
    orderIndex: 0,
  }).run();

  return { exerciseId, sessionId, sessionExerciseId };
}

describe('workouts tree', () => {
  it('treats a workout with no endedAt as in progress', () => {
    const { sessionId } = seedWorkoutExercise();
    const [row] = db.select().from(sessions).where(eq(sessions.id, sessionId)).all();
    expect(row?.endedAt).toBeNull();
  });

  it('stores planned sets with a null completedAt', () => {
    const { sessionExerciseId } = seedWorkoutExercise();
    db.insert(sessionSets).values({
      sessionExerciseId,
      orderIndex: 0,
      setType: 'normal',
      weightKg: 100,
      reps: 5,
    }).run();

    const [row] = db.select().from(sessionSets).all();
    expect(row?.completedAt).toBeNull();
    expect(row?.weightKg).toBe(100);
  });

  it('distinguishes completed from planned sets', () => {
    const { sessionExerciseId } = seedWorkoutExercise();
    db.insert(sessionSets).values([
      { id: newId(), sessionExerciseId, orderIndex: 0, weightKg: 100, reps: 5, completedAt: 1_700_000_001_000 },
      { id: newId(), sessionExerciseId, orderIndex: 1, weightKg: 100, reps: 5 },
    ]).run();

    const completed = db.select().from(sessionSets).where(isNotNull(sessionSets.completedAt)).all();
    expect(completed).toHaveLength(1);
    expect(completed[0]?.orderIndex).toBe(0);
  });

  it('groups supersets by a shared integer on workout_exercises', () => {
    const { sessionId, exerciseId } = seedWorkoutExercise();
    db.insert(sessionExercises).values([
      { id: newId(), sessionId, exerciseId, orderIndex: 1, supersetGroup: 1 },
      { id: newId(), sessionId, exerciseId, orderIndex: 2, supersetGroup: 1 },
    ]).run();

    const superset = db
      .select()
      .from(sessionExercises)
      .where(and(eq(sessionExercises.sessionId, sessionId), eq(sessionExercises.supersetGroup, 1)))
      .all();

    expect(superset).toHaveLength(2);
  });

  it('rejects a set whose parent workout_exercise does not exist', () => {
    expect(() =>
      db.insert(sessionSets).values({ sessionExerciseId: newId(), orderIndex: 0 }).run(),
    ).toThrow(/FOREIGN KEY/i);
  });
});
