import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { appSettings } from './appSettings';
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

  it('preserves exercise data across the app_settings migration', () => {
    // 1 == through 0001_sturdy_demogoblin, i.e. everything before app_settings.
    const { db, close } = createDbAtMigration(1);
    const id = newId();
    db.insert(exercises).values({
      id, name: 'Bench', trackingType: 'weight_reps',
      primaryMuscle: 'chest', secondaryMuscles: [], equipment: 'barbell',
    }).run();

    applyFullMigrations(db);

    expect(db.select().from(exercises).where(eq(exercises.id, id)).get()).toBeDefined();
    close();
  });

  it('preserves an existing settings row across the distance_unit migration', () => {
    // 2 == through 0002_ancient_human_robot, i.e. app_settings with only
    // weight_unit, before distance_unit existed. Inserted via raw SQL
    // (rather than the drizzle query builder) because the builder's schema
    // object already knows about distance_unit and would try to write it
    // into a table that, at this frozen migration point, doesn't have it yet.
    const { db, close } = createDbAtMigration(2);
    const id = newId();
    db.run(sql`insert into app_settings (id, created_at, updated_at, weight_unit) values (${id}, 1, 1, 'lb')`);

    applyFullMigrations(db);

    const row = db.select().from(appSettings).where(eq(appSettings.id, id)).get();
    expect(row).toBeDefined();
    expect(row!.weightUnit).toBe('lb');
    expect(row!.distanceUnit).toBe('km');
    close();
  });
});
