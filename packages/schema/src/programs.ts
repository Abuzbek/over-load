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
 * A program is a week: one row per weekday (0 = Monday … 6 = Sunday). A null
 * routineId means rest. All seven rows are created with the program and rest
 * is always an update to null, never a delete — see programRepo.ts.
 */
export const programDays = sqliteTable(
  'program_days',
  {
    ...syncColumns,
    programId: text('program_id').notNull().references(() => programs.id),
    weekday: integer('weekday').notNull(),
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
