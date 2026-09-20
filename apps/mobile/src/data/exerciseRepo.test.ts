import { exercises, newId, now } from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCustomExercise, getExercise, listExercises } from './exerciseRepo';

let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestDb());
  db.insert(exercises).values([
    { id: newId(), name: 'Barbell Bench Press', trackingType: 'weight_reps', primaryMuscle: 'chest', secondaryMuscles: [], equipment: 'barbell' },
    { id: newId(), name: 'Incline Dumbbell Press', trackingType: 'weight_reps', primaryMuscle: 'chest', secondaryMuscles: [], equipment: 'dumbbell' },
    { id: newId(), name: 'Back Squat', trackingType: 'weight_reps', primaryMuscle: 'quads', secondaryMuscles: [], equipment: 'barbell' },
  ]).run();
});

afterEach(() => close());

describe('listExercises', () => {
  it('returns every live exercise sorted by name', () => {
    const names = listExercises(db).map((e) => e.name);
    expect(names).toEqual(['Back Squat', 'Barbell Bench Press', 'Incline Dumbbell Press']);
  });

  it('filters by a case-insensitive substring search', () => {
    expect(listExercises(db, { search: 'press' }).map((e) => e.name)).toEqual([
      'Barbell Bench Press',
      'Incline Dumbbell Press',
    ]);
  });

  it('respects the limit', () => {
    expect(listExercises(db, { limit: 2 })).toHaveLength(2);
  });

  it('excludes tombstoned rows', () => {
    const [first] = listExercises(db);
    db.update(exercises).set({ deletedAt: now() }).where(eq(exercises.id, first!.id)).run();
    expect(listExercises(db).map((e) => e.name)).not.toContain(first!.name);
  });
});

describe('getExercise', () => {
  it('returns the exercise by id', () => {
    const [first] = listExercises(db);
    expect(getExercise(db, first!.id)?.name).toBe(first!.name);
  });

  it('returns undefined for an unknown id', () => {
    expect(getExercise(db, newId())).toBeUndefined();
  });

  it('returns undefined for a tombstoned exercise', () => {
    const [first] = listExercises(db);
    db.update(exercises).set({ deletedAt: now() }).where(eq(exercises.id, first!.id)).run();
    expect(getExercise(db, first!.id)).toBeUndefined();
  });
});

describe('createCustomExercise', () => {
  it('inserts a custom exercise and returns it', () => {
    const created = createCustomExercise(db, {
      name: 'Reverse Nordic Curl',
      trackingType: 'reps',
      primaryMuscle: 'quads',
      equipment: 'body only',
    });

    expect(created.isCustom).toBe(true);
    expect(created.id).toBeTruthy();
    expect(getExercise(db, created.id)?.name).toBe('Reverse Nordic Curl');
  });
});
