import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { exercises } from './exercises';

/**
 * Derived cache — deliberately WITHOUT sync columns. Fully recomputable from
 * `sets`, so each device rebuilds its own and nothing is ever synced.
 */
export const personalRecords = sqliteTable(
  'personal_records',
  {
    id: text('id').primaryKey(),
    exerciseId: text('exercise_id').notNull().references(() => exercises.id),
    type: text('type').notNull(),
    value: real('value').notNull(),
    setId: text('set_id').notNull(),
    achievedAt: integer('achieved_at').notNull(),
  },
  (table) => ({
    exerciseIdx: index('personal_records_exercise_idx').on(table.exerciseId),
  }),
);

export type PersonalRecordRow = typeof personalRecords.$inferSelect;
