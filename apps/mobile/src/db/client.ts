import * as schema from '@workouts/schema';
import type { Db } from '@workouts/schema';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

export const DB_NAME = 'workouts.db';

/** enableChangeListener powers useLiveQuery, so screens re-render on write. */
export const expoDb = openDatabaseSync(DB_NAME, { enableChangeListener: true });

export const db: Db = drizzle(expoDb, { schema });
