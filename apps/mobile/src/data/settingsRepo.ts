import type { DistanceUnit, Unit } from '@overload/domain';
import {
  appSettings,
  newId,
  now,
  type Db,
  type HeightUnit,
  type NewAppSettings,
} from '@overload/schema';
import { eq, isNull } from 'drizzle-orm';

/**
 * `app_settings` is a single-row table, created empty by its migration, so the
 * very first read on every existing install hits an absent row.
 */
function currentRow(db: Db) {
  return db.select().from(appSettings).where(isNull(appSettings.deletedAt)).get();
}

/**
 * Writes `patch` to the single row, creating it from the column defaults if it
 * is not there yet. One upsert rather than a near-identical pair of functions
 * per setting — there are three settings now and each copy was a place to
 * forget the missing-row case.
 */
function upsertSettings(db: Db, patch: Partial<NewAppSettings>, at: number): void {
  const row = currentRow(db);
  if (row) {
    db.update(appSettings).set({ ...patch, updatedAt: at }).where(eq(appSettings.id, row.id)).run();
    return;
  }
  db.insert(appSettings).values({ id: newId(), createdAt: at, updatedAt: at, ...patch }).run();
}

export function getWeightUnit(db: Db): Unit {
  const row = currentRow(db);
  if (row) return row.weightUnit as Unit;
  upsertSettings(db, {}, now());
  return 'kg';
}

export function setWeightUnit(db: Db, unit: Unit, at: number): void {
  upsertSettings(db, { weightUnit: unit }, at);
}

export function getDistanceUnit(db: Db): DistanceUnit {
  const row = currentRow(db);
  if (row) return row.distanceUnit as DistanceUnit;
  upsertSettings(db, {}, now());
  return 'km';
}

export function setDistanceUnit(db: Db, unit: DistanceUnit, at: number): void {
  upsertSettings(db, { distanceUnit: unit }, at);
}

/**
 * Display only, like the other two. Nothing stores a height yet — the profile
 * fields are still placeholders — so this currently changes no reading; it is
 * the preference those fields will be shown in.
 */
export function getHeightUnit(db: Db): HeightUnit {
  const row = currentRow(db);
  if (row) return row.heightUnit;
  upsertSettings(db, {}, now());
  return 'cm';
}

export function setHeightUnit(db: Db, unit: HeightUnit, at: number): void {
  upsertSettings(db, { heightUnit: unit }, at);
}
