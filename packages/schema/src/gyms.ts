import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { syncColumns } from './sync';

/**
 * A place you train. What is in it lives in `gym_equipment`, one row per owned
 * item, carrying the weights that gym actually has.
 */
export const gyms = sqliteTable('gyms', {
  ...syncColumns,
  name: text('name').notNull(),
  /**
   * Dead since the real catalogue landed: superseded by the `gym_equipment`
   * table. NOT dropped — dropping a column rebuilds the table, and `gyms` is
   * referenced by `gym_equipment` and `app_settings`, which is exactly the
   * rebuild that failed on a device at migration 0005.
   */
  equipment: text('equipment', { mode: 'json' }).$type<string[]>().notNull(),
  orderIndex: integer('order_index').notNull().default(0),
});

export type Gym = typeof gyms.$inferSelect;
export type NewGym = typeof gyms.$inferInsert;
