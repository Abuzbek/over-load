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

  // The test that was missing. An earlier attempt at 0005 dropped
  // routines.program_id, which SQLite can only do by rebuilding the table.
  // Drizzle wraps that in PRAGMA foreign_keys=OFF, but the pragma is a NO-OP
  // inside a transaction and the migrator runs in one — so DROP TABLE
  // `routines` failed on any database with rows pointing at it. Every existing
  // migration test inserted into ONE table, so nothing ever referenced the
  // table being rebuilt and they all passed while the app died on launch.
  //
  // This one inserts a referencing row on purpose.
  it('preserves routines that other tables point at, across the program_days migration', () => {
    // 4 == through 0004, i.e. programs exist but program_days does not.
    const { db, close } = createDbAtMigration(4);

    const routineId = newId();
    const workoutId = newId();
    db.run(sql`insert into routines (id, created_at, updated_at, name, order_index) values (${routineId}, 1, 1, 'Full body', 0)`);
    // A logged workout pointing at that routine. This is the reference that
    // makes a table rebuild fail under foreign keys.
    db.run(sql`insert into workouts (id, created_at, updated_at, routine_id, name, started_at) values (${workoutId}, 1, 1, ${routineId}, 'Full body', 1)`);

    applyFullMigrations(db);

    const kept = db.run(sql`select count(*) from routines where id = ${routineId}`);
    expect(kept).toBeDefined();
    const rows = db.all<{ id: string; name: string }>(sql`select id, name from routines where id = ${routineId}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('Full body');

    const linked = db.all<{ routine_id: string }>(sql`select routine_id from workouts where id = ${workoutId}`);
    expect(linked[0]!.routine_id).toBe(routineId);

    close();
  });

  // 0006 renames program_days.weekday -> day_index. A RENAME COLUMN preserves
  // the values; an ADD + DROP (what drizzle-kit generates unprompted) would
  // have thrown them away, and `ADD day_index integer NOT NULL` would have
  // failed outright on a table with rows.
  it('carries day assignments across the weekday -> day_index rename', () => {
    // 5 == through 0005, i.e. program_days exists with a `weekday` column.
    const { db, close } = createDbAtMigration(5);

    const programId = newId();
    const routineId = newId();
    const dayId = newId();
    db.run(sql`insert into routines (id, created_at, updated_at, name, order_index) values (${routineId}, 1, 1, 'Leg Day', 0)`);
    db.run(sql`insert into programs (id, created_at, updated_at, name, order_index) values (${programId}, 1, 1, 'My Program', 0)`);
    db.run(sql`insert into program_days (id, created_at, updated_at, program_id, weekday, routine_id) values (${dayId}, 1, 1, ${programId}, 2, ${routineId})`);

    applyFullMigrations(db);

    const rows = db.all<{ day_index: number; routine_id: string }>(
      sql`select day_index, routine_id from program_days where id = ${dayId}`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.day_index).toBe(2);
    expect(rows[0]!.routine_id).toBe(routineId);

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
