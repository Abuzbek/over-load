import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { syncColumns } from './sync';

/**
 * A logged bodyweight: the weight trend reads these, and the newest one is the
 * profile's bodyweight. Several a day are allowed; the trend averages them.
 * A scale that reads body fat logs it alongside.
 */
export const weighIns = sqliteTable(
  'weigh_ins',
  {
    ...syncColumns,
    weightKg: real('weight_kg').notNull(),
    bodyFatPercent: real('body_fat_percent'),
    measuredAt: integer('measured_at').notNull(),
  },
  (table) => ({ measuredIdx: index('weigh_ins_measured_idx').on(table.measuredAt) }),
);

export type WeighIn = typeof weighIns.$inferSelect;

/** Body measurements, by key; lengths in centimetres, whatever the display unit. */
export const MEASURES = [
  'neck', 'shoulders', 'bust', 'chest', 'waist', 'hips',
  'leftBicep', 'rightBicep', 'leftForearm', 'rightForearm', 'leftWrist', 'rightWrist',
  'leftThigh', 'rightThigh', 'leftCalf', 'rightCalf', 'leftAnkle', 'rightAnkle',
] as const;
export type Measure = (typeof MEASURES)[number];
export type MeasureValues = Partial<Record<Measure, number>> & { visualBodyFatPercent?: number };

/**
 * A day's tape measurements and visual body-fat estimate: one row per day,
 * the values as JSON so a measure added later needs no migration.
 */
export const measurements = sqliteTable(
  'measurements',
  {
    ...syncColumns,
    measuredAt: integer('measured_at').notNull(),
    values: text('values', { mode: 'json' }).$type<MeasureValues>().notNull(),
  },
  (table) => ({ measuredIdx: index('measurements_measured_idx').on(table.measuredAt) }),
);

export type Measurement = typeof measurements.$inferSelect;

export const PHOTO_POSES = ['front', 'side', 'back'] as const;
export type PhotoPose = (typeof PHOTO_POSES)[number];

/**
 * A progress photo: one per pose per day. `uri` is the image on this phone
 * (the app's documents folder); the row syncs, the image itself does not yet.
 */
export const progressPhotos = sqliteTable(
  'progress_photos',
  {
    ...syncColumns,
    takenAt: integer('taken_at').notNull(),
    pose: text('pose', { enum: PHOTO_POSES }).notNull(),
    uri: text('uri').notNull(),
  },
  (table) => ({ takenIdx: index('progress_photos_taken_idx').on(table.takenAt) }),
);

export type ProgressPhoto = typeof progressPhotos.$inferSelect;
