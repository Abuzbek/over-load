import * as schema from '@overload/schema';
import type { Db } from '@overload/schema';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

export const DB_NAME = 'overload.db';

/** enableChangeListener powers useLiveQuery, so screens re-render on write. */
export const expoDb = openDatabaseSync(DB_NAME, { enableChangeListener: true });

// SQLite defaults foreign key enforcement to OFF, per connection. The test
// harness (memoryDb.ts, partialMigrate.ts) turns it on, so without this the
// suite is systematically stricter than the device.
expoDb.execSync('PRAGMA foreign_keys = ON;');

export const db: Db = drizzle(expoDb, { schema });
