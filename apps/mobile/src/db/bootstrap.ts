import { now } from '@overload/schema';
import migrations from '@overload/schema/migrations';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import equipmentSeed from '../../../../tools/seed-equipment/equipment.json';
import curated from '../../../../tools/seed-exercises/curated.json';
import { ensureDefaultGym } from '../data/gymRepo';
import { ensureDefaultProgram } from '../data/programRepo';
import { rebuildAllPersonalRecords } from '../data/sessionRepo';
import {
  syncEquipmentCatalogue,
  seedExercisesIfEmpty,
  type SeedEquipment,
  type SeedExercise,
} from '../data/seedRepo';
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
  // Before ensureDefaultGym, which gives the first gym every catalogue item.
  syncEquipmentCatalogue(db, equipmentSeed.items as SeedEquipment[]);
  ensureDefaultProgram(db, now());
  ensureDefaultGym(db, now());

  // Rebuilds the derived personal-record cache once migrations and seeding have
  // landed, so installs written before metrics were gated by tracking type drop
  // the records the new rules would never produce (e.g. an est_1rm on a duration
  // exercise).
  //
  // Must never throw past this point: the backup was already discarded above,
  // so a throw here would reject initializeDatabase with no backup left to
  // restore from, and _layout.tsx's terminal error screen would repeat forever
  // on every relaunch (this same rebuild runs again on the next launch and
  // fails again). personal_records is a fully recomputable cache — losing this
  // launch's rebuild costs stale records until the next successful one, not
  // data loss — so swallow rather than rethrow.
  try {
    rebuildAllPersonalRecords(db);
  } catch (error) {
    console.error('rebuildAllPersonalRecords failed during bootstrap; continuing launch', error);
  }
}
