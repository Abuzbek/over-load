import { startOfDay } from '@overload/domain';
import { createTestDb } from '@overload/schema/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteWeighInsOn, measurementOn, photosOn, saveMeasurement, savePhotos, saveWeighIn, weighInOn } from './bodyRepo';
import { getProfile } from './settingsRepo';

const NOW = new Date(2026, 8, 27, 9).getTime();
const TODAY = startOfDay(NOW);
const YESTERDAY = TODAY - 86_400_000;

let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;
beforeEach(() => ({ db, close } = createTestDb()));
afterEach(() => close());

describe('weigh-ins by day', () => {
  it('saves one per day, edits it in place, and keeps the profile on the newest', () => {
    saveWeighIn(db, YESTERDAY, 84, null, NOW);
    saveWeighIn(db, TODAY, 83, 18, NOW);
    saveWeighIn(db, TODAY, 82.6, 18, NOW + 1);
    expect(weighInOn(db, TODAY)).toMatchObject({ weightKg: 82.6, bodyFatPercent: 18, measuredAt: NOW });
    expect(weighInOn(db, YESTERDAY)!.measuredAt).toBe(YESTERDAY + 43_200_000);
    expect(getProfile(db)).toMatchObject({ bodyweightKg: 82.6, bodyFatPercent: 18 });

    deleteWeighInsOn(db, TODAY, NOW + 2);
    expect(weighInOn(db, TODAY)).toBeUndefined();
    expect(getProfile(db).bodyweightKg).toBe(84);
  });
});

describe('measurements and photos by day', () => {
  it('replaces the day’s measurements, and clears the day when every value is gone', () => {
    saveMeasurement(db, TODAY, { waist: 84, leftBicep: 38 }, NOW);
    saveMeasurement(db, TODAY, { waist: 83.5 }, NOW + 1);
    expect(measurementOn(db, TODAY)!.values).toEqual({ waist: 83.5 });
    saveMeasurement(db, TODAY, {}, NOW + 2);
    expect(measurementOn(db, TODAY)).toBeUndefined();
  });

  it('keeps one photo per pose per day: replaced, removed or left alone', () => {
    savePhotos(db, TODAY, { front: 'file:///a.jpg', back: 'file:///b.jpg' }, NOW);
    savePhotos(db, TODAY, { front: 'file:///a2.jpg', back: null }, NOW + 1);
    const day = photosOn(db, TODAY);
    expect(day.front!.uri).toBe('file:///a2.jpg');
    expect(day.back).toBeUndefined();
    savePhotos(db, TODAY, { side: 'file:///s.jpg' }, NOW + 2);
    expect(Object.keys(photosOn(db, TODAY)).sort()).toEqual(['front', 'side']);
  });
});
