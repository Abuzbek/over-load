import {
  equipment,
  gymEquipment,
  type EquipmentCategory,
  type EquipmentConfig,
  type WeightKind,
  type WeightValue, exercises, newId, now, type Db, type NewExercise } from '@overload/schema';
import { eq } from 'drizzle-orm';

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
 * Reconciles the equipment catalogue against the seed, by name.
 *
 * Not seed-once-if-empty like the exercise library: the catalogue is reference
 * data that gets corrected — an item moves group, a default weight changes — and
 * every install has to pick that up, not just fresh ones.
 *
 * Matching is by name because the seed has no stable id; the ids are generated
 * here, which is what lets `gym_equipment` keep pointing at the same row while
 * its category and weights change underneath.
 *
 * Returns how many rows it added, changed and retired.
 */
export function syncEquipmentCatalogue(db: Db, seed: SeedEquipment[]) {
  const timestamp = now();
  const existing = db.select().from(equipment).all();
  const byName = new Map(existing.map((row) => [row.name, row]));
  const seedNames = new Set(seed.map((row) => row.name));

  let added = 0;
  let changed = 0;

  for (const row of seed) {
    const defaults = configFromSeed(row);
    const current = byName.get(row.name);

    if (!current) {
      db.insert(equipment).values({
        id: newId(), createdAt: timestamp, updatedAt: timestamp, deletedAt: null,
        name: row.name, category: row.category, kind: row.kind,
        defaults, satisfies: row.satisfies,
      }).run();
      added += 1;
      continue;
    }

    const same =
      current.category === row.category &&
      current.kind === row.kind &&
      current.deletedAt === null &&
      JSON.stringify(current.defaults) === JSON.stringify(defaults) &&
      JSON.stringify(current.satisfies) === JSON.stringify(row.satisfies);
    if (same) continue;

    db.update(equipment)
      .set({
        category: row.category, kind: row.kind, defaults,
        satisfies: row.satisfies, deletedAt: null, updatedAt: timestamp,
      })
      .where(eq(equipment.id, current.id))
      .run();
    changed += 1;

    // A gym's saved weights are shaped by the kind. When an item changes group
    // its kind can change with it, and a stale config would render the wrong
    // editor — or crash it. Reset just those back to the new defaults.
    if (current.kind !== row.kind) {
      db.update(gymEquipment)
        .set({ config: defaults, updatedAt: timestamp })
        .where(eq(gymEquipment.equipmentId, current.id))
        .run();
    }
  }

  // Retired from the catalogue: tombstone rather than delete, so a gym that
  // owns it keeps its row and gets it back if the item returns.
  const retired = existing.filter((row) => !seedNames.has(row.name) && row.deletedAt === null);
  for (const row of retired) {
    db.update(equipment)
      .set({ deletedAt: timestamp, updatedAt: timestamp })
      .where(eq(equipment.id, row.id))
      .run();
  }

  return { added, changed, retired: retired.length };
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
