import migrations from '@overload/schema/migrations';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import curated from '../../../../tools/seed-exercises/curated.json';
import { rebuildAllPersonalRecords } from '../data/sessionRepo';
import { seedExercisesIfEmpty, type SeedExercise } from '../data/seedRepo';
import { backupDatabase, discardBackup, restoreDatabase } from './backup';
import { db } from './client';

/**
 * Backup, migrate, seed. A failed migration restores the pre-migration file and
 * rethrows, so a bad migration costs a restart rather than training history.
 * The rethrown error carries `restored`, so the UI can tell a first-launch
 * failure (nothing to restore) from a real restore.
 */
export async function initializeDatabase(): Promise<void> {
  await backupDatabase();

  try {
    await migrate(db, migrations);
  } catch (error) {
    const restored = await restoreDatabase();
    const toThrow = error instanceof Error ? error : new Error(String(error));
    throw Object.assign(toThrow, { restored });
  }

  await discardBackup();
  seedExercisesIfEmpty(db, curated as SeedExercise[]);

  // Rebuilds the derived personal-record cache once migrations and seeding have
  // landed, so installs written before metrics were gated by tracking type drop
  // the records the new rules would never produce (e.g. an est_1rm on a duration
  // exercise). Safe every launch: personal_records is fully recomputable from `sets`.
  rebuildAllPersonalRecords(db);
}
