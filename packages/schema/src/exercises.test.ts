import { eq, isNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exercises, type NewExercise } from './exercises';
import { newId, now } from './sync';
import { createTestDb, type TestDb } from './testing/memoryDb';

let db: TestDb;
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestDb());
});

afterEach(() => close());

function benchPress() {
  return {
    name: 'Barbell Bench Press',
    trackingType: 'weight_reps' as const,
    primaryMuscle: 'chest',
    equipment: 'barbell',
    instructions: 'Lower to the chest, press to lockout.',
  };
}

describe('exercises table', () => {
  it('round-trips a row with defaulted sync columns', () => {
    db.insert(exercises).values(benchPress()).run();
    const [row] = db.select().from(exercises).all();

    expect(row?.name).toBe('Barbell Bench Press');
    expect(row?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row?.createdAt).toBeGreaterThan(0);
    expect(row?.updatedAt).toBeGreaterThan(0);
    expect(row?.deletedAt).toBeNull();
    expect(row?.isCustom).toBe(false);
  });

  it('soft-deletes via a tombstone rather than removing the row', () => {
    const id = newId();
    db.insert(exercises).values({ ...benchPress(), id }).run();
    db.update(exercises).set({ deletedAt: now() }).where(eq(exercises.id, id)).run();

    const all = db.select().from(exercises).all();
    const live = db.select().from(exercises).where(isNull(exercises.deletedAt)).all();

    expect(all).toHaveLength(1);
    expect(live).toHaveLength(0);
  });

  it('rejects an unknown tracking type at the type level', () => {
    // @ts-expect-error 'cardio' is not a TrackingType
    const invalid: NewExercise = { ...benchPress(), trackingType: 'cardio' };
    expect(invalid.trackingType).toBe('cardio');
  });
});
