import { startOfDay } from '@overload/domain';
import {
  measurements,
  newId,
  progressPhotos,
  weighIns,
  type Db,
  type MeasureValues,
  type Measurement,
  type PhotoPose,
  type ProgressPhoto,
  type WeighIn,
} from '@overload/schema';
import { and, desc, eq, gte, isNull, lt } from 'drizzle-orm';
import { setProfile } from './settingsRepo';

/**
 * Body tracking by day — the shortcuts' Weight, Metrics and Photos sheets each
 * edit one day's entry: saving replaces it, the bin removes it. A day is the
 * local midnight it starts at; an entry for today keeps the time it was made,
 * one for an earlier day is stamped at noon.
 */

const DAY_MS = 86_400_000;
const stamp = (day: number, at: number) => (day === startOfDay(at) ? at : day + DAY_MS / 2);

/** The newest weigh-in of the day, if any. */
export function weighInOn(db: Db, day: number): WeighIn | undefined {
  return db
    .select()
    .from(weighIns)
    .where(and(gte(weighIns.measuredAt, day), lt(weighIns.measuredAt, day + DAY_MS), isNull(weighIns.deletedAt)))
    .orderBy(desc(weighIns.measuredAt))
    .get();
}

/** Keeps the profile's bodyweight on the newest weigh-in: smart progression reads it. */
function syncProfileWeight(db: Db, at: number): void {
  const newest = db.select().from(weighIns).where(isNull(weighIns.deletedAt)).orderBy(desc(weighIns.measuredAt)).get();
  if (newest) setProfile(db, { bodyweightKg: newest.weightKg, ...(newest.bodyFatPercent !== null ? { bodyFatPercent: newest.bodyFatPercent } : {}) }, at);
}

/** Sets the day's weigh-in: updates the one there is, or logs one. */
export function saveWeighIn(db: Db, day: number, weightKg: number, bodyFatPercent: number | null, at: number): void {
  const existing = weighInOn(db, day);
  if (existing) {
    db.update(weighIns).set({ weightKg, bodyFatPercent, updatedAt: at }).where(eq(weighIns.id, existing.id)).run();
  } else {
    db.insert(weighIns).values({ id: newId(), weightKg, bodyFatPercent, measuredAt: stamp(day, at), createdAt: at, updatedAt: at }).run();
  }
  syncProfileWeight(db, at);
}

/** Removes every weigh-in of the day. */
export function deleteWeighInsOn(db: Db, day: number, at: number): void {
  db.update(weighIns)
    .set({ deletedAt: at, updatedAt: at })
    .where(and(gte(weighIns.measuredAt, day), lt(weighIns.measuredAt, day + DAY_MS), isNull(weighIns.deletedAt)))
    .run();
  syncProfileWeight(db, at);
}

export function measurementOn(db: Db, day: number): Measurement | undefined {
  return db
    .select()
    .from(measurements)
    .where(and(gte(measurements.measuredAt, day), lt(measurements.measuredAt, day + DAY_MS), isNull(measurements.deletedAt)))
    .get();
}

/** Sets the day's measurements; with every value cleared, the day has none. */
export function saveMeasurement(db: Db, day: number, values: MeasureValues, at: number): void {
  const existing = measurementOn(db, day);
  if (Object.keys(values).length === 0) {
    if (existing) deleteMeasurementOn(db, day, at);
    return;
  }
  if (existing) db.update(measurements).set({ values, updatedAt: at }).where(eq(measurements.id, existing.id)).run();
  else db.insert(measurements).values({ id: newId(), measuredAt: stamp(day, at), values, createdAt: at, updatedAt: at }).run();
}

export function deleteMeasurementOn(db: Db, day: number, at: number): void {
  db.update(measurements)
    .set({ deletedAt: at, updatedAt: at })
    .where(and(gte(measurements.measuredAt, day), lt(measurements.measuredAt, day + DAY_MS), isNull(measurements.deletedAt)))
    .run();
}

/** The day's photos, by pose. */
export function photosOn(db: Db, day: number): Partial<Record<PhotoPose, ProgressPhoto>> {
  const rows = db
    .select()
    .from(progressPhotos)
    .where(and(gte(progressPhotos.takenAt, day), lt(progressPhotos.takenAt, day + DAY_MS), isNull(progressPhotos.deletedAt)))
    .all();
  return Object.fromEntries(rows.map((r) => [r.pose, r]));
}

/** Sets the day's photos: a pose given a uri is replaced, one given null removed, one left out kept. */
export function savePhotos(db: Db, day: number, poses: Partial<Record<PhotoPose, string | null>>, at: number): void {
  const current = photosOn(db, day);
  for (const [pose, uri] of Object.entries(poses) as [PhotoPose, string | null][]) {
    const row = current[pose];
    if (uri === null) {
      if (row) db.update(progressPhotos).set({ deletedAt: at, updatedAt: at }).where(eq(progressPhotos.id, row.id)).run();
    } else if (row) {
      if (row.uri !== uri) db.update(progressPhotos).set({ uri, updatedAt: at }).where(eq(progressPhotos.id, row.id)).run();
    } else {
      db.insert(progressPhotos).values({ id: newId(), takenAt: stamp(day, at), pose, uri, createdAt: at, updatedAt: at }).run();
    }
  }
}

export function deletePhotosOn(db: Db, day: number, at: number): void {
  savePhotos(db, day, { front: null, side: null, back: null }, at);
}
