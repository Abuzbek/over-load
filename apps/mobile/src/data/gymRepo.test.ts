import { appSettings, equipment, exercises as exercisesTable, gymEquipment, gyms, newId, now } from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listExercises } from './exerciseRepo';
import {
  activateGym,
  countOwnedEquipment,
  createGymFromPreset,
  duplicateGym,
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
  setGymEquipmentOwnedBulk,
} from './gymRepo';
import { syncEquipmentCatalogue, type SeedEquipment } from './seedRepo';

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
  syncEquipmentCatalogue(db, SEED);
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

describe('syncEquipmentCatalogue', () => {
  it('splits the seed row into the config the gym screen edits', () => {
    const barbell = db.select().from(equipment).where(eq(equipment.name, 'Barbell')).get()!;
    expect(barbell.defaults).toEqual({ kind: 'list', values: [{ kg: 20 }] });

    const press = db.select().from(equipment).where(eq(equipment.name, 'Pin-Loaded Leg Press')).get()!;
    expect(press.defaults).toEqual({ kind: 'range', minKg: 0, maxKg: 250, incrementKg: 5 });
  });

  it('is idempotent: running it again changes nothing', () => {
    expect(syncEquipmentCatalogue(db, SEED)).toEqual({ added: 0, changed: 0, retired: 0 });
    expect(db.select().from(equipment).all()).toHaveLength(SEED.length);
  });

  // The upgrade path for a catalogue correction: an item moves group, and every
  // install has to pick that up rather than only fresh ones.
  it('moves an item to its new group without losing the gyms that own it', () => {
    const gym = createGym(db, 'Home', now());
    const id = equipmentId('Barbell');
    setGymEquipmentOwned(db, gym.id, id, true, now());

    const corrected = SEED.map((row) =>
      row.name === 'Barbell' ? { ...row, category: 'other' as const, kind: 'none' as const } : row,
    );
    expect(syncEquipmentCatalogue(db, corrected).changed).toBe(1);

    const row = listGymEquipment(db, gym.id).find((r) => r.equipment.id === id)!;
    expect(row.equipment.category).toBe('other');
    expect(row.owned).toBe(true);
    // The kind changed, so the gym's saved weights are reset to the new shape
    // rather than left as a list the editor can no longer render.
    expect(row.config).toEqual({ kind: 'none' });
  });

  it('keeps a gym’s edited weights when only the group moves', () => {
    const gym = createGym(db, 'Home', now());
    const id = equipmentId('Dumbbells');
    setGymEquipmentConfig(db, gym.id, id, { kind: 'list', values: [{ kg: 42 }] }, now());

    const corrected = SEED.map((row) =>
      row.name === 'Dumbbells' ? { ...row, category: 'loaded_bars' as const } : row,
    );
    syncEquipmentCatalogue(db, corrected);

    expect(listGymEquipment(db, gym.id).find((r) => r.equipment.id === id)!.config)
      .toEqual({ kind: 'list', values: [{ kg: 42 }] });
  });

  it('tombstones an item that leaves the catalogue', () => {
    const shorter = SEED.filter((row) => row.name !== 'Flat Bench');
    expect(syncEquipmentCatalogue(db, shorter).retired).toBe(1);
    expect(listGymEquipment(db, createGym(db, 'Home', now()).id)).toHaveLength(SEED.length - 1);
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

describe('setGymEquipmentOwnedBulk', () => {
  it('ticks a whole group in one go', () => {
    const gym = createGym(db, 'Home', now());
    const ids = [equipmentId('Barbell'), equipmentId('Dumbbells')];

    setGymEquipmentOwnedBulk(db, gym.id, ids, true, now());

    const rows = listGymEquipment(db, gym.id);
    expect(rows.filter((r) => r.owned).map((r) => r.equipment.name).sort())
      .toEqual(['Barbell', 'Dumbbells']);
  });

  it('unticks a whole group in one go', () => {
    const gym = createGym(db, 'Home', now());
    const ids = [equipmentId('Barbell'), equipmentId('Dumbbells')];
    setGymEquipmentOwnedBulk(db, gym.id, ids, true, now());

    setGymEquipmentOwnedBulk(db, gym.id, ids, false, now());

    expect(listGymEquipment(db, gym.id).filter((r) => r.owned)).toHaveLength(0);
  });

  // Same tombstone semantics as ticking one at a time: unticking a group and
  // putting it back must not throw away the weights you typed.
  it('keeps edited weights across a bulk untick and re-tick', () => {
    const gym = createGym(db, 'Home', now());
    const id = equipmentId('Dumbbells');
    setGymEquipmentOwned(db, gym.id, id, true, now());
    setGymEquipmentConfig(db, gym.id, id, { kind: 'list', values: [{ kg: 42 }] }, now());

    setGymEquipmentOwnedBulk(db, gym.id, [id], false, now());
    setGymEquipmentOwnedBulk(db, gym.id, [id], true, now());

    expect(listGymEquipment(db, gym.id).find((r) => r.equipment.id === id)!.config)
      .toEqual({ kind: 'list', values: [{ kg: 42 }] });
  });

  it('leaves equipment outside the group alone', () => {
    const gym = createGym(db, 'Home', now());
    setGymEquipmentOwned(db, gym.id, equipmentId('Flat Bench'), true, now());

    setGymEquipmentOwnedBulk(db, gym.id, [equipmentId('Barbell')], true, now());

    expect(listGymEquipment(db, gym.id).filter((r) => r.owned).map((r) => r.equipment.name).sort())
      .toEqual(['Barbell', 'Flat Bench']);
  });

  it('does nothing for an empty group', () => {
    const gym = createGym(db, 'Home', now());
    setGymEquipmentOwnedBulk(db, gym.id, [], true, now());
    expect(listGymEquipment(db, gym.id).filter((r) => r.owned)).toHaveLength(0);
  });
});

describe('createGymFromPreset', () => {
  it('stocks the gym from the named list', () => {
    const gym = createGymFromPreset(db, 'Home', 'house', ['Dumbbells', 'Flat Bench'], now());
    expect(listGymEquipment(db, gym.id).filter((r) => r.owned).map((r) => r.equipment.name).sort())
      .toEqual(['Dumbbells', 'Flat Bench']);
    expect(gym.icon).toBe('house');
  });

  it('a blank preset leaves it empty', () => {
    const gym = createGymFromPreset(db, 'Blank', 'house', [], now());
    expect(listGymEquipment(db, gym.id).filter((r) => r.owned)).toHaveLength(0);
  });

  // Presets name equipment; a name the catalogue does not have must be skipped
  // rather than taking the whole creation down with it.
  it('ignores names that are not in the catalogue', () => {
    const gym = createGymFromPreset(db, 'Home', 'house', ['Dumbbells', 'Trampoline'], now());
    expect(listGymEquipment(db, gym.id).filter((r) => r.owned)).toHaveLength(1);
  });
});

describe('duplicateGym', () => {
  it('copies the icon and everything owned, with THIS gym’s weights', () => {
    const source = createGymFromPreset(db, 'Home', 'house', ['Dumbbells'], now());
    setGymEquipmentConfig(db, source.id, equipmentId('Dumbbells'), { kind: 'list', values: [{ kg: 42 }] }, now());

    const copy = duplicateGym(db, source.id, 'Home copy', now())!;

    expect(copy.icon).toBe('house');
    const row = listGymEquipment(db, copy.id).find((r) => r.equipment.name === 'Dumbbells')!;
    expect(row.owned).toBe(true);
    // The source's weights, not the catalogue defaults.
    expect(row.config).toEqual({ kind: 'list', values: [{ kg: 42 }] });
  });

  it('leaves the original alone', () => {
    const source = createGymFromPreset(db, 'Home', 'house', ['Dumbbells'], now());
    const copy = duplicateGym(db, source.id, 'Home copy', now())!;

    setGymEquipmentOwned(db, copy.id, equipmentId('Dumbbells'), false, now());

    expect(listGymEquipment(db, source.id).find((r) => r.equipment.name === 'Dumbbells')!.owned).toBe(true);
  });

  it('returns undefined for a gym that is not there', () => {
    expect(duplicateGym(db, 'nope', 'x', now())).toBeUndefined();
  });
});

describe('countOwnedEquipment', () => {
  it('counts per gym, ignoring unticked items', () => {
    const a = createGymFromPreset(db, 'A', 'house', ['Dumbbells', 'Barbell'], now());
    const b = createGymFromPreset(db, 'B', 'house', ['Flat Bench'], now());
    setGymEquipmentOwned(db, a.id, equipmentId('Barbell'), false, now());

    const counts = countOwnedEquipment(db);
    expect(counts.get(a.id)).toBe(1);
    expect(counts.get(b.id)).toBe(1);
  });
});
