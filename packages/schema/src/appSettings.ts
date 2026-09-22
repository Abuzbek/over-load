import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
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

/**
 * A single row. Weight is stored in kilograms, distance in metres and height
 * in centimetres everywhere; this records how to display them, which is why it
 * does not violate the no-stored-units rule.
 */
export const appSettings = sqliteTable('app_settings', {
  ...syncColumns,
  weightUnit: text('weight_unit', { enum: WEIGHT_UNITS }).notNull().default('kg'),
  distanceUnit: text('distance_unit', { enum: DISTANCE_UNITS }).notNull().default('km'),
  heightUnit: text('height_unit', { enum: HEIGHT_UNITS }).notNull().default('cm'),
  activeProgramId: text('active_program_id').references(() => programs.id),
  activeGymId: text('active_gym_id').references(() => gyms.id),
});

export type AppSettings = typeof appSettings.$inferSelect;
export type NewAppSettings = typeof appSettings.$inferInsert;
