import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { syncColumns } from './sync';

export const TRACKING_TYPES = ['weight_reps', 'reps', 'duration', 'distance_duration'] as const;
export type TrackingType = (typeof TRACKING_TYPES)[number];

/**
 * One row per exercise, seeded or custom. A seeded row's id is its id in
 * app_file.json. Single-valued fields live here; list-valued ones in
 * `exercise_links`, muscles in `exercise_muscles`, equipment needs in
 * `exercise_equipment` (see catalogue.ts).
 *
 * Lookup-valued columns (`exercise_type_id`, `region_id`) are not declared as
 * foreign keys: a custom exercise has none, and a lookup is never deleted.
 */
export const exercises = sqliteTable(
  'exercises',
  {
    ...syncColumns,
    name: text('name').notNull(),
    /** Drives which inputs the session screen renders; derived from the metrics. */
    trackingType: text('tracking_type', { enum: TRACKING_TYPES }).notNull(),
    /** Display only: the first primary muscle group's name, so a list row needs no join. */
    primaryMuscle: text('primary_muscle').notNull(),
    /** Display only: the first resistance option's name ("Barbell and weight plates"). */
    equipment: text('equipment').notNull(),
    instructions: text('instructions'),
    isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),

    exerciseTypeId: text('exercise_type_id'),
    regionId: text('region_id'),
    /** 1–5: how far the movement travels. Stored as the number, for range filters. */
    rom: integer('rom'),
    /** 1–5: how stable the setup is (5 = most stable). */
    stability: integer('stability'),
    /** Fraction of body mass moved by the lift itself, 0–1. */
    bodyweight: real('bodyweight'),
    recommendationStrength: real('recommendation_strength'),
    recommendationHypertrophy: real('recommendation_hypertrophy'),
    searchBoost: real('search_boost').notNull().default(0),
    /** Lower-cased name and alternative names, matched by LIKE. */
    searchText: text('search_text').notNull().default(''),
  },
  (table) => ({
    nameIdx: index('exercises_name_idx').on(table.name),
  }),
);

export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;
