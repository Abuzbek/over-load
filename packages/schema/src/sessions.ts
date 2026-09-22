import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { exercises } from './exercises';
import { SET_TYPES, workouts } from './workouts';
import { syncColumns } from './sync';

/**
 * A session is a workout you actually performed. The plan it came from is a
 * `workout`; this is the log of doing it.
 */
export const sessions = sqliteTable(
  'sessions',
  {
    ...syncColumns,
    /** Null for a session started without a workout to follow. */
    workoutId: text('workout_id').references(() => workouts.id),
    name: text('name').notNull(),
    startedAt: integer('started_at').notNull(),
    /** Null means in progress. On launch, such a session is offered for resume. */
    endedAt: integer('ended_at'),
    notes: text('notes'),
  },
  (table) => ({
    startedIdx: index('sessions_started_idx').on(table.startedAt),
  }),
);

export const sessionExercises = sqliteTable(
  'session_exercises',
  {
    ...syncColumns,
    sessionId: text('session_id').notNull().references(() => sessions.id),
    exerciseId: text('exercise_id').notNull().references(() => exercises.id),
    orderIndex: integer('order_index').notNull(),
    notes: text('notes'),
    restSeconds: integer('rest_seconds'),
    supersetGroup: integer('superset_group'),
  },
  (table) => ({
    sessionIdx: index('session_exercises_session_idx').on(table.sessionId),
    exerciseIdx: index('session_exercises_exercise_idx').on(table.exerciseId),
  }),
);

export const sessionSets = sqliteTable(
  'session_sets',
  {
    ...syncColumns,
    sessionExerciseId: text('session_exercise_id').notNull().references(() => sessionExercises.id),
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
    parentIdx: index('session_sets_parent_idx').on(table.sessionExerciseId),
    completedIdx: index('session_sets_completed_idx').on(table.completedAt),
  }),
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type SessionExercise = typeof sessionExercises.$inferSelect;
export type NewSessionExercise = typeof sessionExercises.$inferInsert;
export type SessionSet = typeof sessionSets.$inferSelect;
export type NewSessionSet = typeof sessionSets.$inferInsert;
