import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { equipment } from './equipment';
import { exercises } from './exercises';

/**
 * The exercise catalogue, seeded from apps/mobile/assets/app_file.json and
 * keyed by that file's own ids, so a new version of the file reconciles by id
 * and history keeps pointing at the right rows.
 *
 * These tables carry NO sync columns and NO tombstones, like personal_records:
 * they are derived from the seed and the exercise definition, rebuilt wholesale
 * when the file changes, and only ever read through a live (tombstone-filtered)
 * `exercises` row. That is also what keeps the joins over them cheap.
 */

/**
 * Every entry of the file's `uuidIndex`: muscles, joint actions, laterality,
 * rom, stability, movement patterns, groups, metrics, notes, alternative names,
 * equipment and equipment groups. `data` holds the entry's remaining fields
 * verbatim, so nothing in the file is lost even where no column reads it yet.
 */
export const lookups = sqliteTable(
  'lookups',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    name: text('name').notNull(),
    data: text('data', { mode: 'json' }).$type<Record<string, unknown>>(),
  },
  (table) => ({
    typeIdx: index('lookups_type_idx').on(table.type),
  }),
);

/**
 * Every list-valued field of an exercise, one row per value: `role` is the
 * field's name in the file (`movementPattern`, `primaryJointAction`,
 * `laterality`, …) and `position` its order there.
 *
 * The (role, lookup_id) index is what makes "every exercise with this movement
 * pattern" an index lookup rather than a scan.
 */
export const exerciseLinks = sqliteTable(
  'exercise_links',
  {
    exerciseId: text('exercise_id').notNull().references(() => exercises.id),
    role: text('role').notNull(),
    position: integer('position').notNull(),
    lookupId: text('lookup_id').notNull().references(() => lookups.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.exerciseId, table.role, table.position] }),
    byValue: index('exercise_links_value_idx').on(table.role, table.lookupId, table.exerciseId),
  }),
);

/**
 * The feature-muscle groups an exercise trains, with the weight one set gives
 * each: 1 for a primary, 0.5 for a secondary. Derived from exercise_links at
 * seed time — deduplicated, a muscle listed as both keeps the larger weight —
 * so the heatmap's aggregate is a plain join and SUM, not a per-row rethink.
 */
export const exerciseMuscles = sqliteTable(
  'exercise_muscles',
  {
    exerciseId: text('exercise_id').notNull().references(() => exercises.id),
    muscleId: text('muscle_id').notNull().references(() => lookups.id),
    weight: real('weight').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.exerciseId, table.muscleId] }),
  }),
);

export const EQUIPMENT_NEEDS = ['resistance', 'support'] as const;
export type EquipmentNeed = (typeof EQUIPMENT_NEEDS)[number];

/**
 * What an exercise needs, flattened to owned-catalogue items. For each `need`,
 * the options are alternatives (any one will do) and the items within one
 * option are all required together: "Barbell and weight plates" is one option
 * of two items. Singular items ("Dumbbell") are stored as the catalogue item a
 * gym actually owns ("Dumbbells"), and "Bodyweight only" is never stored — a
 * need with a bodyweight option is no need at all.
 */
export const exerciseEquipment = sqliteTable(
  'exercise_equipment',
  {
    exerciseId: text('exercise_id').notNull().references(() => exercises.id),
    need: text('need', { enum: EQUIPMENT_NEEDS }).notNull(),
    option: integer('option').notNull(),
    equipmentId: text('equipment_id').notNull().references(() => equipment.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.exerciseId, table.need, table.option, table.equipmentId] }),
  }),
);

/** Which version of the file is seeded, so launch can skip parsing it. */
export const catalogueMeta = sqliteTable('catalogue_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type Lookup = typeof lookups.$inferSelect;
export type ExerciseLink = typeof exerciseLinks.$inferSelect;
