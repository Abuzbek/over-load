import {
  equipment,
  type EquipmentCategory,
  type EquipmentConfig,
  type WeightKind,
  type WeightValue, exercises, newId, now, type Db, type NewExercise } from '@overload/schema';

export type SeedExercise = Omit<NewExercise, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

/**
 * Runs once, on first launch. Guarded on the table being empty rather than a
 * flag, so a user who deletes every exercise is not re-seeded behind their back.
 */
export function seedExercisesIfEmpty(db: Db, seed: SeedExercise[]): number {
  const existing = db.select({ id: exercises.id }).from(exercises).limit(1).all();
  if (existing.length > 0) return 0;
  if (seed.length === 0) return 0;

  const timestamp = now();
  db.insert(exercises).values(
    seed.map((row) => ({
      ...row,
      id: newId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    })),
  ).run();

  return seed.length;
}

export type SeedEquipment = {
  name: string;
  category: EquipmentCategory;
  kind: WeightKind;
  satisfies: string[];
} & Record<string, unknown>;

/**
 * The equipment catalogue, seeded like the exercise library: once, on an empty
 * table. The JSON carries the weight shape inline (values / baseKg / minKg…),
 * which is split out here into the `defaults` config the gym screen edits.
 */
export function seedEquipmentIfEmpty(db: Db, seed: SeedEquipment[]): number {
  const existing = db.select({ id: equipment.id }).from(equipment).limit(1).all();
  if (existing.length > 0) return 0;
  if (seed.length === 0) return 0;

  const timestamp = now();
  db.insert(equipment).values(
    seed.map((row) => ({
      id: newId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      name: row.name,
      category: row.category,
      kind: row.kind,
      defaults: configFromSeed(row),
      satisfies: row.satisfies,
    })),
  ).run();

  return seed.length;
}

function configFromSeed(row: SeedEquipment): EquipmentConfig {
  switch (row.kind) {
    case 'list':
      return { kind: 'list', values: (row.values as WeightValue[]) ?? [] };
    case 'base':
      return { kind: 'base', baseKg: (row.baseKg as number) ?? 0 };
    case 'range':
      return {
        kind: 'range',
        minKg: (row.minKg as number) ?? 0,
        maxKg: (row.maxKg as number) ?? 0,
        incrementKg: (row.incrementKg as number) ?? 1,
      };
    case 'labels':
      return { kind: 'labels', labels: (row.labels as string[]) ?? [] };
    default:
      return { kind: 'none' };
  }
}
