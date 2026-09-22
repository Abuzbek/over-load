import { equipment } from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import equipmentSeed from '../../../../tools/seed-equipment/equipment.json';
import curated from '../../../../tools/seed-exercises/curated.json';
import { listExercises } from './exerciseRepo';
import {
  seedEquipmentIfEmpty,
  seedExercisesIfEmpty,
  type SeedEquipment,
  type SeedExercise,
} from './seedRepo';

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

describe('seedExercisesIfEmpty with the real curated exercise library', () => {
  // Only a 2-row fixture is covered above; first launch runs all 743 real
  // rows through this function, which the fixture can't exercise.
  const realSeed = curated as SeedExercise[];

  it('inserts every row of curated.json into an empty library', () => {
    expect(seedExercisesIfEmpty(db, realSeed)).toBe(743);
    expect(listExercises(db)).toHaveLength(743);
  });

  it('is a no-op on a second call', () => {
    seedExercisesIfEmpty(db, realSeed);
    expect(seedExercisesIfEmpty(db, realSeed)).toBe(0);
    expect(listExercises(db)).toHaveLength(743);
  });
});

describe('seedEquipmentIfEmpty with the real catalogue', () => {
  let db: ReturnType<typeof createTestDb>['db'];
  let close: () => void;
  const realSeed = equipmentSeed.items as SeedEquipment[];

  beforeEach(() => { ({ db, close } = createTestDb()); });
  afterEach(() => close());

  it('seeds every row from equipments.csv', () => {
    expect(seedEquipmentIfEmpty(db, realSeed)).toBe(realSeed.length);
    expect(db.select().from(equipment).all()).toHaveLength(realSeed.length);
  });

  // The invariant the build script asserts, re-checked against what actually
  // lands in the database: the weight editor is chosen by category alone.
  it('gives every item the weight kind its category implies', () => {
    seedEquipmentIfEmpty(db, realSeed);
    const rows = db.select().from(equipment).all();
    const kindByCategory = new Map<string, string>();
    for (const row of rows) {
      const seen = kindByCategory.get(row.category);
      if (seen) expect(row.kind).toBe(seen);
      else kindByCategory.set(row.category, row.kind);
      expect(row.defaults.kind).toBe(row.kind);
    }
    expect(kindByCategory.size).toBe(13);
  });

  it('only unlocks exercise equipment the catalogue actually uses', () => {
    seedEquipmentIfEmpty(db, realSeed);
    const unlocked = new Set(db.select().from(equipment).all().flatMap((r) => r.satisfies));
    // Anything outside this set would filter to zero exercises forever.
    expect([...unlocked].sort()).toEqual([
      'bands', 'barbell', 'body only', 'cable', 'dumbbell', 'e-z curl bar',
      'exercise ball', 'kettlebells', 'machine', 'medicine ball', 'none',
    ]);
  });
});
