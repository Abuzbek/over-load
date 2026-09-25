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

export const TRAINING_GOALS = ['hypertrophy', 'strength', 'both'] as const;
export type TrainingGoal = (typeof TRAINING_GOALS)[number];

export const TRAINING_SPLITS = ['full_body', 'upper_lower'] as const;
export type TrainingSplit = (typeof TRAINING_SPLITS)[number];

/**
 * What onboarding asked about training, kept so a program can be generated
 * again later. Muscles are feature-muscle-group lookup ids.
 */
export type TrainingPreferences = {
  goal: TrainingGoal;
  /** Extra focus, muscle id → 1–2 points (5 points in all). */
  focus: Record<string, number>;
  deprioritized: string[];
  daysPerWeek: number;
  /** Upper bound of the chosen session length: 20, 40, 60, 90 or 120. */
  sessionMinutes: number;
  split: TrainingSplit;
  deload: boolean;
  /** Which of the "can you do…" checks were ticked (their keys). */
  skills: string[];
  smartProgression: boolean;
  warmups: boolean;
  /** The warm-up scheme the user edited, as % of the working weight × reps. Absent: the default. */
  warmupScheme?: { percent: number; reps: number }[];
};

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
  /** A visual estimate: the middle of the range picked, e.g. 20 for 18–23%. */
  bodyFatPercent: real('body_fat_percent'),

  /** When this account finished onboarding; synced, so a new phone skips it. */
  onboardedAt: integer('onboarded_at'),
  trainingPreferences: text('training_preferences', { mode: 'json' }).$type<TrainingPreferences>(),
});

export type AppSettings = typeof appSettings.$inferSelect;
export type NewAppSettings = typeof appSettings.$inferInsert;

/**
 * The profile as the app passes it around — the profile columns, named for
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
  bodyFatPercent: number | null;
};
