import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, expect, it } from 'vitest';
import { exercises } from './exercises';
import { newId } from './sync';
import { createTestDb } from './testing/memoryDb';

const MIGRATIONS_FOLDER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../drizzle',
);

describe('migrations', () => {
  it('re-running every migration preserves existing rows', () => {
    const { db, close } = createTestDb();

    db.insert(exercises).values({
      id: newId(),
      name: 'Bench Press',
      trackingType: 'weight_reps',
      primaryMuscle: 'chest',
      secondaryMuscles: [],
      equipment: 'barbell',
    }).run();

    // Applying the same folder again must be a no-op, never destructive.
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    expect(db.select().from(exercises).all()).toHaveLength(1);
    close();
  });
});
