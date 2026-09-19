import { createTestDb } from '@workouts/schema/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listExercises } from './exerciseRepo';
import { seedExercisesIfEmpty } from './seedRepo';

const SEED = [
  { name: 'Bench Press', trackingType: 'weight_reps' as const, primaryMuscle: 'chest', secondaryMuscles: ['triceps'], equipment: 'barbell', instructions: 'Press.', isCustom: false },
  { name: 'Plank', trackingType: 'duration' as const, primaryMuscle: 'abdominals', secondaryMuscles: [], equipment: 'body only', instructions: 'Hold.', isCustom: false },
];

let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestDb());
});

afterEach(() => close());

describe('seedExercisesIfEmpty', () => {
  it('inserts every seed row into an empty library', () => {
    expect(seedExercisesIfEmpty(db, SEED)).toBe(2);
    expect(listExercises(db).map((e) => e.name)).toEqual(['Bench Press', 'Plank']);
  });

  it('is a no-op when the library already has rows', () => {
    seedExercisesIfEmpty(db, SEED);
    expect(seedExercisesIfEmpty(db, SEED)).toBe(0);
    expect(listExercises(db)).toHaveLength(2);
  });

  it('preserves the tracking type from the seed data', () => {
    seedExercisesIfEmpty(db, SEED);
    const plank = listExercises(db).find((e) => e.name === 'Plank');
    expect(plank?.trackingType).toBe('duration');
  });
});
