import migrations from '@workouts/schema/migrations';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import curated from '../../../../tools/seed-exercises/curated.json';
import { seedExercisesIfEmpty, type SeedExercise } from '../data/seedRepo';
import { backupDatabase, discardBackup, restoreDatabase } from './backup';
import { db } from './client';

/**
 * Backup, migrate, seed. A failed migration restores the pre-migration file and
 * rethrows, so a bad migration costs a restart rather than training history.
 */
export async function initializeDatabase(): Promise<void> {
  await backupDatabase();

  try {
    await migrate(db, migrations);
  } catch (error) {
    await restoreDatabase();
    throw error;
  }

  await discardBackup();
  seedExercisesIfEmpty(db, curated as SeedExercise[]);
}
