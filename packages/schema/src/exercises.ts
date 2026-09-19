import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { syncColumns } from './sync';

export const TRACKING_TYPES = ['weight_reps', 'reps', 'duration', 'distance_duration'] as const;
export type TrackingType = (typeof TRACKING_TYPES)[number];

export const exercises = sqliteTable(
  'exercises',
  {
    ...syncColumns,
    name: text('name').notNull(),
    /** Drives which inputs the session screen renders for this exercise. */
    trackingType: text('tracking_type', { enum: TRACKING_TYPES }).notNull(),
    primaryMuscle: text('primary_muscle').notNull(),
    secondaryMuscles: text('secondary_muscles', { mode: 'json' }).$type<string[]>().notNull(),
    equipment: text('equipment').notNull(),
    instructions: text('instructions'),
    isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => ({
    nameIdx: index('exercises_name_idx').on(table.name),
  }),
);

export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;
