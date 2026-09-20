import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { syncColumns } from './sync';

export const WEIGHT_UNITS = ['kg', 'lb'] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

/**
 * A single row. Weight is stored in kilograms everywhere; this records how to
 * display it, which is why it does not violate the no-stored-units rule.
 */
export const appSettings = sqliteTable('app_settings', {
  ...syncColumns,
  weightUnit: text('weight_unit', { enum: WEIGHT_UNITS }).notNull().default('kg'),
});

export type AppSettings = typeof appSettings.$inferSelect;
