import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { syncColumns } from './sync';

/**
 * Every equipment value the catalogue uses. `body only` and `none` are not
 * listed: they mean "no equipment", so they are available at every gym and are
 * never something you tick on or off — see gymRepo.canDoAtGym.
 */
export const EQUIPMENT = [
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'kettlebells',
  'bands',
  'medicine ball',
  'exercise ball',
  'e-z curl bar',
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

/**
 * A place you train, and what is in it. The exercise catalogue is filtered to
 * the active gym so a home lifter is not scrolling past 170 barbell movements.
 *
 * Equipment is a JSON array rather than a join table: it is at most nine values
 * that are always read as a set and never queried the other way round, and the
 * catalogue already stores `secondary_muscles` the same way.
 */
export const gyms = sqliteTable('gyms', {
  ...syncColumns,
  name: text('name').notNull(),
  equipment: text('equipment', { mode: 'json' }).$type<string[]>().notNull(),
  orderIndex: integer('order_index').notNull().default(0),
});

export type Gym = typeof gyms.$inferSelect;
export type NewGym = typeof gyms.$inferInsert;
