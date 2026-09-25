import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { exercises } from './exercises';
import { programs } from './programs';
import { syncColumns } from './sync';

export const SET_TYPES = ['normal', 'warmup', 'drop', 'myo', 'failure'] as const;
export type SetType = (typeof SET_TYPES)[number];

/**
 * A workout is a named plan — the thing that sits on a program day and that a
 * session is started from. Performing one produces a `session`.
 */
export const workouts = sqliteTable('workouts', {
  ...syncColumns,
  name: text('name').notNull(),
  notes: text('notes'),
  orderIndex: integer('order_index').notNull().default(0),
  /**
   * Unused, and deliberately NOT dropped.
   *
   * A program does not own its workouts: the same workout is assigned to
   * several days through `program_days`, which is what makes
   * "Day 1/3/5 = Full body" one workout rather than three.
   *
   * Dropping a column in SQLite means rebuilding the table, and this table is
   * referenced by `sessions`, `workout_exercises` and `program_days`. Drizzle
   * wraps the rebuild in `PRAGMA foreign_keys=OFF`, but that pragma is a NO-OP
   * inside a transaction and the migrator runs in one — so the DROP fails
   * against any database that actually holds data. It did, on a device; only
   * the backup-and-restore path saved it. Tests missed it because their
   * databases are empty at that migration, so nothing referenced the table.
   *
   * A dead nullable column costs nothing. Leave it.
   */
  programId: text('program_id').references(() => programs.id),
});

export const workoutExercises = sqliteTable(
  'workout_exercises',
  {
    ...syncColumns,
    workoutId: text('workout_id').notNull().references(() => workouts.id),
    exerciseId: text('exercise_id').notNull().references(() => exercises.id),
    orderIndex: integer('order_index').notNull(),
    notes: text('notes'),
    restSeconds: integer('rest_seconds'),
    /** Same number within one workout means the same superset. Null means none. */
    supersetGroup: integer('superset_group'),
  },
  (table) => ({
    workoutIdx: index('workout_exercises_workout_idx').on(table.workoutId),
  }),
);

export const workoutSets = sqliteTable(
  'workout_sets',
  {
    ...syncColumns,
    workoutExerciseId: text('workout_exercise_id').notNull().references(() => workoutExercises.id),
    orderIndex: integer('order_index').notNull(),
    setType: text('set_type', { enum: SET_TYPES }).notNull().default('normal'),
    /** The rep target — or, with `targetRepsMax`, the bottom of a rep range ("7–9 reps"). */
    targetReps: integer('target_reps'),
    targetRepsMax: integer('target_reps_max'),
    targetWeightKg: real('target_weight_kg'),
    targetRpe: real('target_rpe'),
    /** Reps to leave in reserve: 0 is to failure. */
    targetRir: integer('target_rir'),
  },
  (table) => ({
    parentIdx: index('workout_sets_parent_idx').on(table.workoutExerciseId),
  }),
);

export type Workout = typeof workouts.$inferSelect;
export type NewWorkout = typeof workouts.$inferInsert;
export type WorkoutExercise = typeof workoutExercises.$inferSelect;
export type NewWorkoutExercise = typeof workoutExercises.$inferInsert;
export type WorkoutSet = typeof workoutSets.$inferSelect;
export type NewWorkoutSet = typeof workoutSets.$inferInsert;
