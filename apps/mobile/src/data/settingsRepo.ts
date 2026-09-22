import type { DistanceUnit, Unit } from '@overload/domain';
import { appSettings, newId, now, type Db } from '@overload/schema';
import { eq, isNull } from 'drizzle-orm';

/**
 * `app_settings` is a single-row table, created empty by its migration. The
 * very first read on every existing install hits an absent row, so this
 * inserts a default `'kg'` row on that first read rather than pushing the
 * "no row yet" case onto every caller. Safe to call repeatedly: once the row
 * exists, later calls just read it.
 */
export function getWeightUnit(db: Db): Unit {
  const row = db
    .select()
    .from(appSettings)
    .where(isNull(appSettings.deletedAt))
    .get();

  if (row) return row.weightUnit as Unit;

  const timestamp = now();
  db.insert(appSettings)
    .values({ id: newId(), weightUnit: 'kg', createdAt: timestamp, updatedAt: timestamp })
    .run();
  return 'kg';
}

export function setWeightUnit(db: Db, unit: Unit, at: number): void {
  const row = db
    .select()
    .from(appSettings)
    .where(isNull(appSettings.deletedAt))
    .get();

  if (row) {
    db.update(appSettings)
      .set({ weightUnit: unit, updatedAt: at })
      .where(eq(appSettings.id, row.id))
      .run();
    return;
  }

  db.insert(appSettings)
    .values({ id: newId(), weightUnit: unit, createdAt: at, updatedAt: at })
    .run();
}

export function getDistanceUnit(db: Db): DistanceUnit {
  const row = db
    .select()
    .from(appSettings)
    .where(isNull(appSettings.deletedAt))
    .get();

  if (row) return row.distanceUnit as DistanceUnit;

  const timestamp = now();
  db.insert(appSettings)
    .values({ id: newId(), distanceUnit: 'km', createdAt: timestamp, updatedAt: timestamp })
    .run();
  return 'km';
}

export function setDistanceUnit(db: Db, unit: DistanceUnit, at: number): void {
  const row = db
    .select()
    .from(appSettings)
    .where(isNull(appSettings.deletedAt))
    .get();

  if (row) {
    db.update(appSettings)
      .set({ distanceUnit: unit, updatedAt: at })
      .where(eq(appSettings.id, row.id))
      .run();
    return;
  }

  db.insert(appSettings)
    .values({ id: newId(), distanceUnit: unit, createdAt: at, updatedAt: at })
    .run();
}
