import { appSettings, equipment, exercises as exercisesTable, gymEquipment, gyms, newId, now } from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listExercises } from './exerciseRepo';
import {
  activateGym,
  availableExerciseEquipment,
  canDoWithEquipment,
  createGym,
  ensureDefaultGym,
  getActiveGym,
  listGymEquipment,
  listGyms,
  removeGym,
  setGymEquipmentConfig,
  setGymEquipmentOwned,
} from './gymRepo';
import { seedEquipmentIfEmpty, type SeedEquipment } from './seedRepo';

let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;

const SEED: SeedEquipment[] = [
  { name: 'Barbell', category: 'loaded_bars', kind: 'list', satisfies: ['barbell'],
    values: [{ kg: 20 }] },
  { name: 'Dumbbells', category: 'free_weights', kind: 'list', satisfies: ['dumbbell'],
    values: [{ kg: 10 }, { kg: 20 }] },
  { name: 'Pin-Loaded Leg Press', category: 'pin_loaded_machines', kind: 'range',
    satisfies: ['machine'], minKg: 0, maxKg: 250, incrementKg: 5 },
  { name: 'Flat Bench', category: 'benches_racks', kind: 'none', satisfies: [] },
];

beforeEach(() => {
  ({ db, close } = createTestDb());
  seedEquipmentIfEmpty(db, SEED);
});

afterEach(() => close());

function equipmentId(name: string) {
  return db.select().from(equipment).where(eq(equipment.name, name)).get()!.id;
}

function insertExercise(name: string, equip: string) {
  db.insert(exercisesTable).values({
    id: newId(), name, trackingType: 'weight_reps', primaryMuscle: 'chest',
    secondaryMuscles: [], equipment: equip,
  }).run();
}

describe('seedEquipmentIfEmpty', () => {
  it('splits the seed row into the config the gym screen edits', () => {
    const barbell = db.select().from(equipment).where(eq(equipment.name, 'Barbell')).get()!;
    expect(barbell.defaults).toEqual({ kind: 'list', values: [{ kg: 20 }] });

    const press = db.select().from(equipment).where(eq(equipment.name, 'Pin-Loaded Leg Press')).get()!;
    expect(press.defaults).toEqual({ kind: 'range', minKg: 0, maxKg: 250, incrementKg: 5 });
  });

  it('does not seed twice', () => {
    expect(seedEquipmentIfEmpty(db, SEED)).toBe(0);
    expect(db.select().from(equipment).all()).toHaveLength(SEED.length);
  });
});

describe('ensureDefaultGym', () => {
  // The upgrade path: someone already using the app must see the same exercise
  // catalogue tomorrow, so the default gym owns the lot.
  it('owns every catalogue item and is activated', () => {
    const gym = ensureDefaultGym(db, now());
    expect(getActiveGym(db)?.id).toBe(gym.id);
    expect(listGymEquipment(db, gym.id).filter((r) => r.owned)).toHaveLength(SEED.length);
  });

  it('is idempotent', () => {
    ensureDefaultGym(db, now());
    ensureDefaultGym(db, now());
    expect(listGyms(db)).toHaveLength(1);
  });
});

describe('listGymEquipment', () => {
  it('shows catalogue defaults for equipment the gym does not own', () => {
    const gym = createGym(db, 'Home', now());
    const rows = listGymEquipment(db, gym.id);

    expect(rows.every((r) => !r.owned)).toBe(true);
    expect(rows.find((r) => r.equipment.name === 'Dumbbells')!.config)
      .toEqual({ kind: 'list', values: [{ kg: 10 }, { kg: 20 }] });
  });

  it('a gym you create yourself starts empty', () => {
    const gym = createGym(db, 'Home', now());
    expect(listGymEquipment(db, gym.id).filter((r) => r.owned)).toHaveLength(0);
  });
});

describe('setGymEquipmentOwned', () => {
  it('ticks and unticks', () => {
    const gym = createGym(db, 'Home', now());
    const id = equipmentId('Barbell');

    setGymEquipmentOwned(db, gym.id, id, true, now());
    expect(listGymEquipment(db, gym.id).find((r) => r.equipment.id === id)!.owned).toBe(true);

    setGymEquipmentOwned(db, gym.id, id, false, now());
    expect(listGymEquipment(db, gym.id).find((r) => r.equipment.id === id)!.owned).toBe(false);
  });

  // Unticking tombstones rather than deleting, so the weights you spent time
  // entering survive a mis-tap.
  it('keeps edited weights across an untick and a re-tick', () => {
    const gym = createGym(db, 'Home', now());
    const id = equipmentId('Dumbbells');
    setGymEquipmentOwned(db, gym.id, id, true, now());
    setGymEquipmentConfig(db, gym.id, id, { kind: 'list', values: [{ kg: 42 }] }, now());

    setGymEquipmentOwned(db, gym.id, id, false, now());
    setGymEquipmentOwned(db, gym.id, id, true, now());

    expect(listGymEquipment(db, gym.id).find((r) => r.equipment.id === id)!.config)
      .toEqual({ kind: 'list', values: [{ kg: 42 }] });
    expect(db.select().from(gymEquipment).all()).toHaveLength(1);
  });

  it('leaves other gyms alone', () => {
    const home = createGym(db, 'Home', now());
    const away = createGym(db, 'Away', now());
    const id = equipmentId('Barbell');

    setGymEquipmentOwned(db, home.id, id, true, now());

    expect(listGymEquipment(db, away.id).find((r) => r.equipment.id === id)!.owned).toBe(false);
  });
});

describe('setGymEquipmentConfig', () => {
  it('is per gym: the same rack can hold different weights in two places', () => {
    const home = createGym(db, 'Home', now());
    const away = createGym(db, 'Away', now());
    const id = equipmentId('Dumbbells');

    setGymEquipmentConfig(db, home.id, id, { kind: 'list', values: [{ kg: 10 }] }, now());
    setGymEquipmentConfig(db, away.id, id, { kind: 'list', values: [{ kg: 60 }] }, now());

    expect(listGymEquipment(db, home.id).find((r) => r.equipment.id === id)!.config)
      .toEqual({ kind: 'list', values: [{ kg: 10 }] });
    expect(listGymEquipment(db, away.id).find((r) => r.equipment.id === id)!.config)
      .toEqual({ kind: 'list', values: [{ kg: 60 }] });
  });
});

describe('availableExerciseEquipment', () => {
  it('is the union of what the owned equipment unlocks', () => {
    const gym = createGym(db, 'Home', now());
    setGymEquipmentOwned(db, gym.id, equipmentId('Dumbbells'), true, now());
    setGymEquipmentOwned(db, gym.id, equipmentId('Flat Bench'), true, now());

    // The bench unlocks nothing on its own — owning one does not make an
    // exercise possible.
    expect(availableExerciseEquipment(db, gym.id)).toEqual(['dumbbell']);
  });

  it('drops equipment the gym has untickd', () => {
    const gym = createGym(db, 'Home', now());
    const id = equipmentId('Barbell');
    setGymEquipmentOwned(db, gym.id, id, true, now());
    setGymEquipmentOwned(db, gym.id, id, false, now());

    expect(availableExerciseEquipment(db, gym.id)).toEqual([]);
  });

  it('feeds the exercise filter end to end', () => {
    insertExercise('Bench Press', 'barbell');
    insertExercise('Dumbbell Curl', 'dumbbell');
    insertExercise('Push-Up', 'body only');

    const gym = createGym(db, 'Home', now());
    setGymEquipmentOwned(db, gym.id, equipmentId('Dumbbells'), true, now());

    const names = listExercises(db, {
      availableEquipment: availableExerciseEquipment(db, gym.id),
    }).map((e) => e.name);
    expect(names.sort()).toEqual(['Dumbbell Curl', 'Push-Up']);
  });
});

describe('removeGym', () => {
  it('tombstones and moves the active pointer', () => {
    const home = createGym(db, 'Home', now());
    const other = createGym(db, 'Other', now());
    activateGym(db, home.id, now());

    removeGym(db, home.id, 999);

    expect(db.select().from(gyms).where(eq(gyms.id, home.id)).get()?.deletedAt).toBe(999);
    expect(getActiveGym(db)?.id).toBe(other.id);
  });

  it('clears the pointer when the last gym goes', () => {
    const only = createGym(db, 'Only', now());
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
  });
});
