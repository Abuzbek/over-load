import { appSettings, newId } from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { eq, isNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getDistanceUnit,
  getProfile,
  setProfile,
  getHeightUnit,
  getWeightUnit,
  setDistanceUnit,
  setHeightUnit,
  setWeightUnit,
} from './settingsRepo';

let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestDb());
});

afterEach(() => close());

describe('getWeightUnit', () => {
  it('defaults to kg when no row exists yet', () => {
    expect(getWeightUnit(db)).toBe('kg');
  });

  it('inserts a default row on first read, so the row now exists', () => {
    getWeightUnit(db);
    const rows = db.select().from(appSettings).where(isNull(appSettings.deletedAt)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.weightUnit).toBe('kg');
  });

  it('is safe to call repeatedly without creating duplicate rows', () => {
    getWeightUnit(db);
    getWeightUnit(db);
    getWeightUnit(db);
    const rows = db.select().from(appSettings).all();
    expect(rows).toHaveLength(1);
  });

  it('reads back a previously stored preference', () => {
    setWeightUnit(db, 'lb', 1000);
    expect(getWeightUnit(db)).toBe('lb');
  });

  it('does not return a tombstoned settings row', () => {
    db.insert(appSettings)
      .values({ id: newId(), weightUnit: 'lb', createdAt: 1, updatedAt: 1, deletedAt: 2 })
      .run();

    expect(getWeightUnit(db)).toBe('kg');
  });
});

describe('setWeightUnit', () => {
  it('creates the row when none exists', () => {
    setWeightUnit(db, 'lb', 1000);
    const rows = db.select().from(appSettings).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.weightUnit).toBe('lb');
    expect(rows[0]!.updatedAt).toBe(1000);
  });

  it('updates the existing row in place rather than inserting a second one', () => {
    setWeightUnit(db, 'kg', 1000);
    setWeightUnit(db, 'lb', 2000);
    const rows = db.select().from(appSettings).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.weightUnit).toBe('lb');
  });

  it('bumps updatedAt so sync can find the change', () => {
    setWeightUnit(db, 'kg', 1000);
    setWeightUnit(db, 'lb', 5000);
    const row = db.select().from(appSettings).where(eq(appSettings.weightUnit, 'lb')).get();
    expect(row!.updatedAt).toBe(5000);
  });
});

describe('getDistanceUnit', () => {
  it('defaults to km when no row exists yet', () => {
    expect(getDistanceUnit(db)).toBe('km');
  });

  it('inserts a default row on first read, so the row now exists', () => {
    getDistanceUnit(db);
    const rows = db.select().from(appSettings).where(isNull(appSettings.deletedAt)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.distanceUnit).toBe('km');
  });

  it('is safe to call repeatedly without creating duplicate rows', () => {
    getDistanceUnit(db);
    getDistanceUnit(db);
    getDistanceUnit(db);
    const rows = db.select().from(appSettings).all();
    expect(rows).toHaveLength(1);
  });

  it('reads back a previously stored preference', () => {
    setDistanceUnit(db, 'mi', 1000);
    expect(getDistanceUnit(db)).toBe('mi');
  });

  it('does not return a tombstoned settings row', () => {
    db.insert(appSettings)
      .values({ id: newId(), distanceUnit: 'mi', createdAt: 1, updatedAt: 1, deletedAt: 2 })
      .run();

    expect(getDistanceUnit(db)).toBe('km');
  });
});

describe('setDistanceUnit', () => {
  it('creates the row when none exists', () => {
    setDistanceUnit(db, 'mi', 1000);
    const rows = db.select().from(appSettings).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.distanceUnit).toBe('mi');
    expect(rows[0]!.updatedAt).toBe(1000);
  });

  it('updates the existing row in place rather than inserting a second one', () => {
    setDistanceUnit(db, 'km', 1000);
    setDistanceUnit(db, 'mi', 2000);
    const rows = db.select().from(appSettings).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.distanceUnit).toBe('mi');
  });

  it('bumps updatedAt so sync can find the change', () => {
    setDistanceUnit(db, 'km', 1000);
    setDistanceUnit(db, 'mi', 5000);
    const row = db.select().from(appSettings).where(eq(appSettings.distanceUnit, 'mi')).get();
    expect(row!.updatedAt).toBe(5000);
  });
});

describe('height unit', () => {
  it('defaults to cm when no row exists yet', () => {
    expect(getHeightUnit(db)).toBe('cm');
  });

  it('reads back a previously stored preference', () => {
    setHeightUnit(db, 'ft', 1000);
    expect(getHeightUnit(db)).toBe('ft');
  });

  it('creates the row when none exists rather than silently doing nothing', () => {
    setHeightUnit(db, 'ft', 1000);
    expect(db.select().from(appSettings).all()).toHaveLength(1);
    expect(getHeightUnit(db)).toBe('ft');
  });

  // The three settings share one row, so a write to any of them must not reset
  // the others — the failure mode of a per-setting insert that omits the rest.
  it('leaves the weight and distance preferences untouched', () => {
    setWeightUnit(db, 'lb', 1000);
    setDistanceUnit(db, 'mi', 1000);

    setHeightUnit(db, 'ft', 2000);

    expect(getWeightUnit(db)).toBe('lb');
    expect(getDistanceUnit(db)).toBe('mi');
    expect(db.select().from(appSettings).all()).toHaveLength(1);
  });
});

describe('profile', () => {
  it('starts empty', () => {
    expect(getProfile(db)).toEqual({
      name: null, birthDate: null, gender: null, bodyweightKg: null,
      heightCm: null, liftingExperience: null, cardioExperience: null, bodyFatPercent: null,
    });
  });

  it('reads back what was written', () => {
    setProfile(db, { name: 'Sam', birthDate: 764121600000, gender: 'female' }, 1000);
    const profile = getProfile(db);
    expect(profile.name).toBe('Sam');
    expect(profile.birthDate).toBe(764121600000);
    expect(profile.gender).toBe('female');
  });

  // The profile shares its row with the unit preferences, and a patch writes
  // only the keys it carries — a whole-object write here would blank the rest.
  it('leaves the fields a patch does not name alone', () => {
    setProfile(db, { name: 'Sam', heightCm: 180, liftingExperience: 'advanced' }, 1000);

    setProfile(db, { bodyweightKg: 82.5 }, 2000);

    expect(getProfile(db)).toMatchObject({
      name: 'Sam', heightCm: 180, liftingExperience: 'advanced', bodyweightKg: 82.5,
    });
    expect(db.select().from(appSettings).all()).toHaveLength(1);
  });

  it('clears a field asked to be null, rather than skipping it', () => {
    setProfile(db, { name: 'Sam' }, 1000);
    setProfile(db, { name: null }, 2000);
    expect(getProfile(db).name).toBeNull();
  });

  it('does not disturb the unit preferences', () => {
    setWeightUnit(db, 'lb', 1000);
    setProfile(db, { bodyweightKg: 82.5 }, 2000);
    expect(getWeightUnit(db)).toBe('lb');
  });
});
