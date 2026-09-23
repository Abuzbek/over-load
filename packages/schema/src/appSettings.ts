import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { gyms } from './gyms';
import { programs } from './programs';
import { syncColumns } from './sync';

export const WEIGHT_UNITS = ['kg', 'lb'] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

export const DISTANCE_UNITS = ['km', 'mi'] as const;
export type DistanceUnit = (typeof DISTANCE_UNITS)[number];

/** 'ft' means feet and inches together — 5'11", never 5.9 feet. */
export const HEIGHT_UNITS = ['cm', 'ft'] as const;
export type HeightUnit = (typeof HEIGHT_UNITS)[number];

export const GENDERS = ['male', 'female'] as const;
export type Gender = (typeof GENDERS)[number];

export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

/**
 * A single row. Weight is stored in kilograms, distance in metres and height
 * in centimetres everywhere; this records how to display them, which is why it
 * does not violate the no-stored-units rule.
 *
 * The profile lives here rather than in a `users` table because the app is
 * offline and single-user: there is exactly one person per install, and their
 * details are per-install data like every other column here. Every field is
 * nullable — nothing in the app requires a profile to work.
 */
export const appSettings = sqliteTable('app_settings', {
  ...syncColumns,
  weightUnit: text('weight_unit', { enum: WEIGHT_UNITS }).notNull().default('kg'),
  distanceUnit: text('distance_unit', { enum: DISTANCE_UNITS }).notNull().default('km'),
  heightUnit: text('height_unit', { enum: HEIGHT_UNITS }).notNull().default('cm'),
  activeProgramId: text('active_program_id').references(() => programs.id),
  activeGymId: text('active_gym_id').references(() => gyms.id),

  profileName: text('profile_name'),
  /** Epoch milliseconds at UTC midnight — a date, stored as the one time type. */
  birthDate: integer('birth_date'),
  gender: text('gender', { enum: GENDERS }),
  bodyweightKg: real('bodyweight_kg'),
  heightCm: real('height_cm'),
  liftingExperience: text('lifting_experience', { enum: EXPERIENCE_LEVELS }),
  cardioExperience: text('cardio_experience', { enum: EXPERIENCE_LEVELS }),
});

export type AppSettings = typeof appSettings.$inferSelect;
export type NewAppSettings = typeof appSettings.$inferInsert;

/**
 * The profile as the app passes it around — the same seven columns, named for
 * the person rather than for the settings row they happen to live in.
 */
export type Profile = {
  name: string | null;
  birthDate: number | null;
  gender: Gender | null;
  bodyweightKg: number | null;
  heightCm: number | null;
  liftingExperience: ExperienceLevel | null;
  cardioExperience: ExperienceLevel | null;
};
