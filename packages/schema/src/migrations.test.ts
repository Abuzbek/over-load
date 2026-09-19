import { describe, expect, it } from 'vitest';
import { exercises } from './exercises';
import { newId } from './sync';
import { applyFullMigrations, createDbAtMigration } from './testing/partialMigrate';

describe('migrations', () => {
  it('running the migrations after the first for real preserves a row inserted under the earlier schema', () => {
    // Only 0000 applied — the schema as it existed before 0001 ever ran.
    const { db, close } = createDbAtMigration(0);

    const id = newId();
    db.insert(exercises).values({
      id,
      name: 'Bench Press',
      trackingType: 'weight_reps',
      primaryMuscle: 'chest',
      secondaryMuscles: [],
      equipment: 'barbell',
    }).run();

    // Applies the real drizzle/ folder. Because this db has only 0000
    // recorded, 0001 actually executes here — it is not skipped as already
    // applied, unlike migrating a db built via createTestDb().
    applyFullMigrations(db);

    const rows = db.select().from(exercises).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id,
      name: 'Bench Press',
      trackingType: 'weight_reps',
      primaryMuscle: 'chest',
      secondaryMuscles: [],
      equipment: 'barbell',
    });

    close();
  });

  // Add one test per future migration: createDbAtMigration(<index of the
  // migration immediately before the new one>), insert a row exercising the
  // schema at that point, applyFullMigrations, then assert it survived.
});
