import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { routines } from './routines';
import { syncColumns } from './sync';

export const programs = sqliteTable('programs', {
  ...syncColumns,
  name: text('name').notNull(),
  icon: text('icon'),
  iconColor: text('icon_color'),
  orderIndex: integer('order_index').notNull().default(0),
});

/**
 * A program is a cycle of days, not a calendar week: one row per day, ordered
 * by `dayIndex` (0-based, rendered as "Day 1"). Seven days are created with a
 * new program but the cycle can grow — see addProgramDay in programRepo.ts.
 * A null routineId means rest; rest is always an update to null, never a
 * delete.
 */
export const programDays = sqliteTable(
  'program_days',
  {
    ...syncColumns,
    programId: text('program_id').notNull().references(() => programs.id),
    dayIndex: integer('day_index').notNull(),
    routineId: text('routine_id').references(() => routines.id),
  },
  (table) => ({
    programIdx: index('program_days_program_idx').on(table.programId),
  }),
);

export type Program = typeof programs.$inferSelect;
export type NewProgram = typeof programs.$inferInsert;
export type ProgramDayRow = typeof programDays.$inferSelect;
export type NewProgramDayRow = typeof programDays.$inferInsert;
