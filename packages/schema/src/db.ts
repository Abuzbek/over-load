import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from './index';

/**
 * Both the Expo driver and better-sqlite3 produce a synchronous SQLite
 * database. Typing repositories against the base means the same code runs
 * on device and in Node tests.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the driver's
// run-result type differs per driver; repositories never touch it.
export type Db = BaseSQLiteDatabase<'sync', any, typeof schema>;
