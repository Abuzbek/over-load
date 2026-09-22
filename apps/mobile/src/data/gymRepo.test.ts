import { appSettings, EQUIPMENT, exercises as exercisesTable, gyms, newId, now } from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listExercises } from './exerciseRepo';
import {
  activateGym,
  canDoWithEquipment,
  createGym,
  ensureDefaultGym,
  getActiveGym,
  listGyms,
  removeGym,
  setGymEquipment,
} from './gymRepo';

let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestDb());
});

afterEach(() => close());

function insertExercise(name: string, equipment: string) {
  const id = newId();
  db.insert(exercisesTable).values({
    id, name, trackingType: 'weight_reps', primaryMuscle: 'chest',
    secondaryMuscles: [], equipment,
  }).run();
  return id;
}

describe('ensureDefaultGym', () => {
  // The upgrade path that matters: someone who has been using the app sees the
  // same catalogue tomorrow. A default gym with nothing ticked would hide most
  // of it without being asked.
  it('creates an everything-ticked gym and activates it', () => {
    const gym = ensureDefaultGym(db, now());
    expect(gym.equipment.sort()).toEqual([...EQUIPMENT].sort());
    expect(getActiveGym(db)?.id).toBe(gym.id);
  });

  it('is idempotent: calling it twice leaves one gym', () => {
    ensureDefaultGym(db, now());
    ensureDefaultGym(db, now());
    expect(listGyms(db)).toHaveLength(1);
  });
});

describe('activateGym', () => {
  it('only ever leaves one gym active', () => {
    const home = createGym(db, 'Home', ['dumbbell'], now());
    const commercial = createGym(db, 'Commercial', [...EQUIPMENT], now());

    activateGym(db, home.id, now());
    activateGym(db, commercial.id, now());

    expect(listGyms(db).filter((g) => g.isActive).map((g) => g.gym.id)).toEqual([commercial.id]);
  });
});

describe('removeGym', () => {
  it('tombstones rather than deleting', () => {
    const gym = createGym(db, 'Home', ['dumbbell'], now());
    removeGym(db, gym.id, 999);

    expect(listGyms(db)).toHaveLength(0);
    expect(db.select().from(gyms).where(eq(gyms.id, gym.id)).get()?.deletedAt).toBe(999);
  });

  // A dangling activeGymId would filter the catalogue against a gym that is no
  // longer there, which reads to the user as the app losing every exercise.
  it('moves the active pointer off a removed gym', () => {
    const home = createGym(db, 'Home', ['dumbbell'], now());
    const other = createGym(db, 'Other', ['barbell'], now());
    activateGym(db, home.id, now());

    removeGym(db, home.id, now());

    expect(getActiveGym(db)?.id).toBe(other.id);
  });

  it('clears the pointer entirely when the last gym goes', () => {
    const only = createGym(db, 'Only', ['dumbbell'], now());
    activateGym(db, only.id, now());

    removeGym(db, only.id, now());

    expect(getActiveGym(db)).toBeUndefined();
    expect(db.select().from(appSettings).get()?.activeGymId).toBeNull();
  });
});

describe('canDoWithEquipment', () => {
  it('allows bodyweight movements at a gym with nothing in it', () => {
    expect(canDoWithEquipment('body only', [])).toBe(true);
    expect(canDoWithEquipment('none', [])).toBe(true);
  });

  it('requires everything else to be present', () => {
    expect(canDoWithEquipment('barbell', ['dumbbell'])).toBe(false);
    expect(canDoWithEquipment('barbell', ['barbell'])).toBe(true);
  });
});

describe('listExercises filtered by gym', () => {
  beforeEach(() => {
    insertExercise('Bench Press', 'barbell');
    insertExercise('Dumbbell Curl', 'dumbbell');
    insertExercise('Push-Up', 'body only');
    insertExercise('Plank', 'none');
  });

  it('returns everything when no gym filter is given', () => {
    expect(listExercises(db)).toHaveLength(4);
  });

  it('keeps only what the gym has, plus everything needing no equipment', () => {
    const names = listExercises(db, { availableEquipment: ['dumbbell'] }).map((e) => e.name);
    expect(names.sort()).toEqual(['Dumbbell Curl', 'Plank', 'Push-Up']);
  });

  // An empty gym is not the same as no gym: it still does bodyweight.
  it('still offers bodyweight work at a gym with nothing ticked', () => {
    const names = listExercises(db, { availableEquipment: [] }).map((e) => e.name);
    expect(names.sort()).toEqual(['Plank', 'Push-Up']);
  });

  it('combines the gym filter with search', () => {
    setGymEquipment(db, createGym(db, 'G', [], now()).id, [], now());
    expect(listExercises(db, { search: 'Pl', availableEquipment: ['dumbbell'] }).map((e) => e.name))
      .toEqual(['Plank']);
  });
});
