import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { exercises } from './exercises';
import { syncColumns } from './sync';

export const SET_TYPES = ['normal', 'warmup', 'drop', 'failure'] as const;
export type SetType = (typeof SET_TYPES)[number];

export const routines = sqliteTable('routines', {
  ...syncColumns,
  name: text('name').notNull(),
  notes: text('notes'),
  orderIndex: integer('order_index').notNull().default(0),
});

export const routineExercises = sqliteTable(
  'routine_exercises',
  {
    ...syncColumns,
    routineId: text('routine_id').notNull().references(() => routines.id),
    exerciseId: text('exercise_id').notNull().references(() => exercises.id),
    orderIndex: integer('order_index').notNull(),
    notes: text('notes'),
    restSeconds: integer('rest_seconds'),
    /** Same number within one routine means the same superset. Null means none. */
    supersetGroup: integer('superset_group'),
  },
  (table) => ({
    routineIdx: index('routine_exercises_routine_idx').on(table.routineId),
  }),
);

export const routineSets = sqliteTable(
  'routine_sets',
  {
    ...syncColumns,
    routineExerciseId: text('routine_exercise_id').notNull().references(() => routineExercises.id),
    orderIndex: integer('order_index').notNull(),
    setType: text('set_type', { enum: SET_TYPES }).notNull().default('normal'),
    targetReps: integer('target_reps'),
    targetWeightKg: real('target_weight_kg'),
    targetRpe: real('target_rpe'),
  },
  (table) => ({
    parentIdx: index('routine_sets_parent_idx').on(table.routineExerciseId),
  }),
);

export type Routine = typeof routines.$inferSelect;
export type NewRoutine = typeof routines.$inferInsert;
export type RoutineExercise = typeof routineExercises.$inferSelect;
export type NewRoutineExercise = typeof routineExercises.$inferInsert;
export type RoutineSet = typeof routineSets.$inferSelect;
export type NewRoutineSet = typeof routineSets.$inferInsert;
