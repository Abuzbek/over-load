import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createTestDb } from './testing/memoryDb';

// The history was squashed into one migration when the catalogue moved to
// app_file.json. Migration-over-data tests start again from the next
// migration; partialMigrate.ts is still the tool for them.
describe('migrations', () => {
  it('builds every table from an empty database', () => {
    const { db, close } = createTestDb();
    const tables = db
      .all<{ name: string }>(sql`select name from sqlite_master where type = 'table'`)
      .map((r) => r.name)
      .filter((n) => !n.startsWith('__') && n !== 'sqlite_sequence')
      .sort();
    close();
    expect(tables).toEqual([
      'app_settings', 'catalogue_meta', 'equipment', 'exercise_equipment', 'exercise_links',
      'exercise_muscles', 'exercises', 'gym_equipment', 'gyms', 'lookups', 'personal_records',
      'program_days', 'programs', 'session_exercises', 'session_sets', 'sessions',
      'workout_exercises', 'workout_sets', 'workouts',
    ]);
  });
});
