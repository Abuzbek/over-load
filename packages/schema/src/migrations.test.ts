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

  // NOTE: raw SQL in these tests is frozen at the migration point it runs at.
  // Before 0008 the tables are `routines` and `workouts`; after it they are
  // `workouts` and `sessions`. Inserts use the old names, assertions the new.
  //
  // The test that was missing. An earlier attempt at 0005 dropped
  // workouts.program_id, which SQLite can only do by rebuilding the table.
  // Drizzle wraps that in PRAGMA foreign_keys=OFF, but the pragma is a NO-OP
  // inside a transaction and the migrator runs in one — so DROP TABLE
  // `workouts` failed on any database with rows pointing at it. Every existing
  // migration test inserted into ONE table, so nothing ever referenced the
  // table being rebuilt and they all passed while the app died on launch.
  //
  // This one inserts a referencing row on purpose.
  it('preserves workouts that other tables point at, across the program_days migration', () => {
    // 4 == through 0004, i.e. programs exist but program_days does not.
    const { db, close } = createDbAtMigration(4);

    const workoutId = newId();
    const sessionId = newId();
    db.run(sql`insert into routines (id, created_at, updated_at, name, order_index) values (${workoutId}, 1, 1, 'Full body', 0)`);
    // A logged workout pointing at that workout. This is the reference that
    // makes a table rebuild fail under foreign keys.
    db.run(sql`insert into workouts (id, created_at, updated_at, routine_id, name, started_at) values (${sessionId}, 1, 1, ${workoutId}, 'Full body', 1)`);

    applyFullMigrations(db);

    const rows = db.all<{ id: string; name: string }>(sql`select id, name from workouts where id = ${workoutId}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('Full body');

    const linked = db.all<{ workout_id: string }>(sql`select workout_id from sessions where id = ${sessionId}`);
    expect(linked[0]!.workout_id).toBe(workoutId);

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
    const workoutId = newId();
    const dayId = newId();
    db.run(sql`insert into routines (id, created_at, updated_at, name, order_index) values (${workoutId}, 1, 1, 'Leg Day', 0)`);
    db.run(sql`insert into programs (id, created_at, updated_at, name, order_index) values (${programId}, 1, 1, 'My Program', 0)`);
    db.run(sql`insert into program_days (id, created_at, updated_at, program_id, weekday, routine_id) values (${dayId}, 1, 1, ${programId}, 2, ${workoutId})`);

    applyFullMigrations(db);

    const rows = db.all<{ day_index: number; workout_id: string }>(
      sql`select day_index, workout_id from program_days where id = ${dayId}`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.day_index).toBe(2);
    expect(rows[0]!.workout_id).toBe(workoutId);

    close();
  });

  // 0008 renames six tables and six columns at once. RENAME TO / RENAME COLUMN
  // do not rebuild a table, so the foreign-key hazard that broke 0005 does not
  // apply — but a rename in the wrong ORDER would collide (`routines` cannot
  // become `workouts` until the old `workouts` has become `sessions`). This
  // test puts a row in every renamed table, linked end to end, and reads it
  // back through the new names.
  it('carries every table through the workout/session rename, with links intact', () => {
    // 7 == through 0007, i.e. the last migration under the old vocabulary.
    const { db, close } = createDbAtMigration(7);

    const workoutId = newId();
    const exerciseId = newId();
    const workoutExerciseId = newId();
    const workoutSetId = newId();
    const sessionId = newId();
    const sessionExerciseId = newId();
    const setId = newId();
    const programId = newId();
    const dayId = newId();

    db.run(sql`insert into exercises (id, created_at, updated_at, name, tracking_type, primary_muscle, secondary_muscles, equipment) values (${exerciseId}, 1, 1, 'Squat', 'weight_reps', 'quadriceps', '[]', 'barbell')`);
    db.run(sql`insert into routines (id, created_at, updated_at, name, order_index) values (${workoutId}, 1, 1, 'Leg Day', 0)`);
    db.run(sql`insert into routine_exercises (id, created_at, updated_at, routine_id, exercise_id, order_index) values (${workoutExerciseId}, 1, 1, ${workoutId}, ${exerciseId}, 0)`);
    db.run(sql`insert into routine_sets (id, created_at, updated_at, routine_exercise_id, order_index, target_reps) values (${workoutSetId}, 1, 1, ${workoutExerciseId}, 0, 5)`);
    db.run(sql`insert into workouts (id, created_at, updated_at, routine_id, name, started_at) values (${sessionId}, 1, 1, ${workoutId}, 'Leg Day', 10)`);
    db.run(sql`insert into workout_exercises (id, created_at, updated_at, workout_id, exercise_id, order_index) values (${sessionExerciseId}, 1, 1, ${sessionId}, ${exerciseId}, 0)`);
    db.run(sql`insert into sets (id, created_at, updated_at, workout_exercise_id, order_index, reps, completed_at) values (${setId}, 1, 1, ${sessionExerciseId}, 0, 5, 20)`);
    db.run(sql`insert into programs (id, created_at, updated_at, name, order_index) values (${programId}, 1, 1, 'P', 0)`);
    db.run(sql`insert into program_days (id, created_at, updated_at, program_id, day_index, routine_id) values (${dayId}, 1, 1, ${programId}, 0, ${workoutId})`);

    applyFullMigrations(db);

    // The plan side, under its new names.
    expect(db.all<{ name: string }>(sql`select name from workouts where id = ${workoutId}`)[0]!.name).toBe('Leg Day');
    expect(db.all<{ workout_id: string }>(sql`select workout_id from workout_exercises where id = ${workoutExerciseId}`)[0]!.workout_id).toBe(workoutId);
    expect(db.all<{ workout_exercise_id: string }>(sql`select workout_exercise_id from workout_sets where id = ${workoutSetId}`)[0]!.workout_exercise_id).toBe(workoutExerciseId);

    // The performed side.
    expect(db.all<{ workout_id: string }>(sql`select workout_id from sessions where id = ${sessionId}`)[0]!.workout_id).toBe(workoutId);
    expect(db.all<{ session_id: string }>(sql`select session_id from session_exercises where id = ${sessionExerciseId}`)[0]!.session_id).toBe(sessionId);
    expect(db.all<{ session_exercise_id: string; reps: number }>(sql`select session_exercise_id, reps from session_sets where id = ${setId}`)[0]!.session_exercise_id).toBe(sessionExerciseId);

    // And the program day still points at the plan.
    expect(db.all<{ workout_id: string }>(sql`select workout_id from program_days where id = ${dayId}`)[0]!.workout_id).toBe(workoutId);

    // No dangling references anywhere after six table renames.
    expect(db.all(sql`pragma foreign_key_check`)).toEqual([]);

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
