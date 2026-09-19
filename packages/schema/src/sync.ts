import { integer, text } from 'drizzle-orm/sqlite-core';
import { uuidv7 } from 'uuidv7';

/**
 * UUIDv7 is time-ordered, so client-generated ids still cluster well in a
 * B-tree index. Offline rows are globally unique the moment they are created.
 */
export function newId(): string {
  return uuidv7();
}

/** Epoch milliseconds. The only time representation used anywhere. */
export function now(): number {
  return Date.now();
}

/**
 * Spread into every synced table, including join tables. `personal_records`
 * is the sole exemption — it is a derived cache that never syncs.
 * Deletes are tombstones: set `deletedAt`, never issue DELETE.
 */
export const syncColumns = {
  id: text('id').primaryKey().$defaultFn(newId),
  createdAt: integer('created_at').notNull().$defaultFn(now),
  updatedAt: integer('updated_at').notNull().$defaultFn(now),
  deletedAt: integer('deleted_at'),
};
