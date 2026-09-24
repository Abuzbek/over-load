import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { syncColumns } from './sync';

/**
 * A place you train. What is in it lives in `gym_equipment`, one row per owned
 * item, carrying the weights that gym actually has.
 */
export const gyms = sqliteTable('gyms', {
  ...syncColumns,
  name: text('name').notNull(),
  /** A lucide icon name, chosen when the gym is created. */
  icon: text('icon').notNull().default('dumbbell'),
  orderIndex: integer('order_index').notNull().default(0),
});

export type Gym = typeof gyms.$inferSelect;
export type NewGym = typeof gyms.$inferInsert;
