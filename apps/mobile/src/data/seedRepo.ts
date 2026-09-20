import { exercises, newId, now, type Db, type NewExercise } from '@overload/schema';

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
