import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { exercises } from './exercises';
import { routines, SET_TYPES } from './routines';
import { syncColumns } from './sync';

export const workouts = sqliteTable(
  'workouts',
  {
    ...syncColumns,
    /** Null for a freestyle workout started without a routine. */
    routineId: text('routine_id').references(() => routines.id),
    name: text('name').notNull(),
    startedAt: integer('started_at').notNull(),
    /** Null means in progress. On launch, such a workout is offered for resume. */
    endedAt: integer('ended_at'),
    notes: text('notes'),
  },
  (table) => ({
    startedIdx: index('workouts_started_idx').on(table.startedAt),
  }),
);

export const workoutExercises = sqliteTable(
  'workout_exercises',
  {
    ...syncColumns,
    workoutId: text('workout_id').notNull().references(() => workouts.id),
    exerciseId: text('exercise_id').notNull().references(() => exercises.id),
    orderIndex: integer('order_index').notNull(),
    notes: text('notes'),
    restSeconds: integer('rest_seconds'),
    supersetGroup: integer('superset_group'),
  },
  (table) => ({
    workoutIdx: index('workout_exercises_workout_idx').on(table.workoutId),
    exerciseIdx: index('workout_exercises_exercise_idx').on(table.exerciseId),
  }),
);

export const sets = sqliteTable(
  'sets',
  {
    ...syncColumns,
    workoutExerciseId: text('workout_exercise_id').notNull().references(() => workoutExercises.id),
    orderIndex: integer('order_index').notNull(),
    setType: text('set_type', { enum: SET_TYPES }).notNull().default('normal'),
    weightKg: real('weight_kg'),
    reps: integer('reps'),
    durationSeconds: integer('duration_seconds'),
    distanceM: real('distance_m'),
    rpe: real('rpe'),
    rir: integer('rir'),
    /** Null means planned but not yet performed. This is what makes crash recovery work. */
    completedAt: integer('completed_at'),
  },
  (table) => ({
    parentIdx: index('sets_parent_idx').on(table.workoutExerciseId),
    completedIdx: index('sets_completed_idx').on(table.completedAt),
  }),
);

export type Workout = typeof workouts.$inferSelect;
export type NewWorkout = typeof workouts.$inferInsert;
export type WorkoutExercise = typeof workoutExercises.$inferSelect;
export type NewWorkoutExercise = typeof workoutExercises.$inferInsert;
export type WorkoutSet = typeof sets.$inferSelect;
export type NewWorkoutSet = typeof sets.$inferInsert;
