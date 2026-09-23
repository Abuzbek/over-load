import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * The tables whose rows are the user's own and sync to their account, parents
 * before children — the order a pull applies them in. `exercises` syncs only
 * its custom rows; the seeded catalogue, `equipment`, the catalogue tables and
 * `personal_records` never leave the device (the catalogue ships in the app,
 * personal records are rebuilt from the sets).
 *
 * The triggers in drizzle/0002_sync_outbox.sql are written per table from this
 * list; a table added here needs its pair of triggers added there.
 */
export const SYNCED_TABLES = [
  'gyms',
  'gym_equipment',
  'exercises',
  'programs',
  'workouts',
  'program_days',
  'workout_exercises',
  'workout_sets',
  'sessions',
  'session_exercises',
  'session_sets',
  'app_settings',
] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

/**
 * Rows changed on this device and not yet pushed, one per row. Filled by
 * triggers on every insert and update, so no repository has to remember to.
 * `seq` is re-issued on every change: a push removes only entries up to the
 * seq it read, so an edit that lands mid-push is kept for the next one.
 */
export const syncOutbox = sqliteTable(
  'sync_outbox',
  {
    tableName: text('table_name').notNull(),
    rowId: text('row_id').notNull(),
    seq: integer('seq').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.tableName, table.rowId] }),
    seqIdx: index('sync_outbox_seq_idx').on(table.seq),
  }),
);

/**
 * One row. `applying` is 1 while a pull writes remote rows, which the
 * triggers read so that applying a change from the server does not queue it
 * to be sent straight back.
 */
export const syncFlags = sqliteTable('sync_flags', {
  id: integer('id').primaryKey(),
  applying: integer('applying').notNull().default(0),
});

/** Per table, how far this device has pulled: the server's own timestamp, ms. */
export const syncCursors = sqliteTable('sync_cursors', {
  tableName: text('table_name').primaryKey(),
  cursor: integer('cursor').notNull(),
  /** Which account the cursor is for; a different sign-in starts over. */
  uid: text('uid').notNull(),
});
