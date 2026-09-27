import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { workoutExercises, workouts } from './workouts';
import { syncColumns } from './sync';

export const DELOAD_PLACES = ['none', 'first', 'last'] as const;
export type DeloadPlace = (typeof DELOAD_PLACES)[number];
/** A working set as a cycle plan holds it: repsMax null is "to failure". */
export type CyclePlanSet = { repsMin: number; repsMax: number | null; rir: number; setType: 'normal' | 'drop' | 'myo' | 'failure' };

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
  /** How many cycles make a block before it repeats (1–52). */
  cycleCount: integer('cycle_count').notNull().default(7),
  /** A lighter cycle at the start or end of each block, or none. */
  deload: text('deload', { enum: DELOAD_PLACES }).notNull().default('last'),
  /**
   * The plan changes cycle to cycle (packages/domain/src/periodization.ts).
   * On for a generated program, off for one built by hand unless turned on.
   */
  periodized: integer('periodized', { mode: 'boolean' }).notNull().default(false),
  /** The goal periodization follows; null falls back to the training preferences. */
  goal: text('goal', { enum: ['hypertrophy', 'strength', 'both'] }),
  /** Put away: out of the library until restored. Not a delete. */
  archivedAt: integer('archived_at'),
});

/**
 * One exercise's sets for one cycle of the block, as the user edited them —
 * in place of what periodization would plan. `cycle` is the position in the
 * block (1 to the program's cycle count); `sets` is the list of working sets.
 */
export const cyclePlans = sqliteTable(
  'cycle_plans',
  {
    ...syncColumns,
    workoutExerciseId: text('workout_exercise_id').notNull().references(() => workoutExercises.id),
    cycle: integer('cycle').notNull(),
    sets: text('sets', { mode: 'json' }).$type<CyclePlanSet[]>().notNull(),
  },
  (table) => ({
    exerciseIdx: index('cycle_plans_exercise_idx').on(table.workoutExerciseId),
  }),
);

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
export type CyclePlan = typeof cyclePlans.$inferSelect;
export type NewProgram = typeof programs.$inferInsert;
export type ProgramDayRow = typeof programDays.$inferSelect;
export type NewProgramDayRow = typeof programDays.$inferInsert;
