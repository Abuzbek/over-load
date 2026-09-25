import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { workouts } from './workouts';
import { syncColumns } from './sync';

export const programs = sqliteTable('programs', {
  ...syncColumns,
  name: text('name').notNull(),
  icon: text('icon'),
  iconColor: text('icon_color'),
  orderIndex: integer('order_index').notNull().default(0),
  /**
   * Which time through the cycle you are on. Starts at 1 and advances when
   * every day has been ticked off — see advanceCycleIfComplete in programRepo.
   */
  cycleNumber: integer('cycle_number').notNull().default(1),
  /**
   * Made by the program generator: its workouts are laid out across a week, so
   * the cycle stays at seven days — days can be changed, not added or removed.
   */
  generated: integer('generated', { mode: 'boolean' }).notNull().default(false),
});

/**
 * A program is a cycle of days, not a calendar week: one row per day, ordered
 * by `dayIndex` (0-based, rendered as "Day 1"). Seven days are created with a
 * new program but the cycle can grow — see addProgramDay in programRepo.ts.
 * A null workoutId means rest; rest is always an update to null, never a
 * delete.
 */
export const programDays = sqliteTable(
  'program_days',
  {
    ...syncColumns,
    programId: text('program_id').notNull().references(() => programs.id),
    dayIndex: integer('day_index').notNull(),
    workoutId: text('workout_id').references(() => workouts.id),
    /**
     * When this day was last ticked off. Set by finishing its workout or by
     * ticking the box by hand, cleared by unticking. Nothing resets it when the
     * cycle comes round again — see the note in programRepo.
     */
    completedAt: integer('completed_at'),
  },
  (table) => ({
    programIdx: index('program_days_program_idx').on(table.programId),
  }),
);

export type Program = typeof programs.$inferSelect;
export type NewProgram = typeof programs.$inferInsert;
export type ProgramDayRow = typeof programDays.$inferSelect;
export type NewProgramDayRow = typeof programDays.$inferInsert;
