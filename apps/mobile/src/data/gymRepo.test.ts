import { appSettings, equipment, gymEquipment, gyms, now } from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listExercises } from './exerciseRepo';
import {
  activateGym,
  countOwnedEquipment,
  createGymFromPreset,
  duplicateGym,
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
import { EQUIPMENT_SEED, INDEX, OWNABLE, fixtureFile } from './catalogueTestFixtures';
import { syncCatalogue } from './seedRepo';

let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestDb());
  syncCatalogue(db, fixtureFile(), EQUIPMENT_SEED, now());
});

afterEach(() => close());

function equipmentId(name: string) {
  return db.select().from(equipment).where(eq(equipment.name, name)).get()!.id;
}

describe('the equipment catalogue', () => {
  it('takes identity from the file and starting weights from equipment.json', () => {
    const barbell = db.select().from(equipment).where(eq(equipment.id, 'barbell')).get()!;
    expect(barbell).toMatchObject({ name: 'Barbell', category: 'loaded_bars', defaults: { kind: 'list', values: [{ kg: 20 }] } });

    const press = db.select().from(equipment).where(eq(equipment.id, 'legPress')).get()!;
    expect(press.defaults).toEqual({ kind: 'range', minKg: 0, maxKg: 250, incrementKg: 5 });
  });

  // A gym owns "Dumbbells"; the singular only exists for exercises to name.
  it('lists only items a gym can own, never a plural’s singular', () => {
    expect(db.select().from(equipment).all().map((e) => e.name).sort()).toEqual([...OWNABLE].sort());
  });

  it('is idempotent: running it again changes nothing', () => {
    const before = db.select().from(equipment).all();
    syncCatalogue(db, fixtureFile(), EQUIPMENT_SEED, now() + 1000);
    expect(db.select().from(equipment).all()).toEqual(before);
  });

  // The upgrade path for a catalogue correction: an item moves group, and every
  // install has to pick that up rather than only fresh ones.
  it('moves an item to its new group without losing the gyms that own it', () => {
    const gym = createGym(db, 'Home', now());
    setGymEquipmentOwned(db, gym.id, 'barbell', true, now());

    const index = { ...INDEX, barbell: { ...INDEX.barbell!, category: 'cat-other' } };
    const seed = EQUIPMENT_SEED.map((row) => (row.name === 'Barbell' ? { ...row, kind: 'none' as const } : row));
    syncCatalogue(db, fixtureFile({ uuidIndex: index }), seed, now());

    const row = listGymEquipment(db, gym.id).find((r) => r.equipment.id === 'barbell')!;
    expect(row.equipment.category).toBe('other');
    expect(row.owned).toBe(true);
    // The kind changed, so the gym's saved weights are reset to the new shape
    // rather than left as a list the editor can no longer render.
    expect(row.config).toEqual({ kind: 'none' });
  });

  it('keeps a gym’s edited weights when only the group moves', () => {
    const gym = createGym(db, 'Home', now());
    setGymEquipmentConfig(db, gym.id, 'dumbbells', { kind: 'list', values: [{ kg: 42 }] }, now());

    const index = { ...INDEX, dumbbells: { ...INDEX.dumbbells!, category: 'cat-bars' } };
    syncCatalogue(db, fixtureFile({ uuidIndex: index }), EQUIPMENT_SEED, now());

    expect(listGymEquipment(db, gym.id).find((r) => r.equipment.id === 'dumbbells')!.config)
      .toEqual({ kind: 'list', values: [{ kg: 42 }] });
  });

  it('tombstones an item that leaves the catalogue', () => {
    const { bench: _, ...index } = INDEX;
    const exercises = fixtureFile().exercises.map((e) => ({ ...e, supportEquipmentGroupIds: [] }));
    syncCatalogue(db, fixtureFile({ uuidIndex: index, exercises }), EQUIPMENT_SEED, now());
    expect(listGymEquipment(db, createGym(db, 'Home', now()).id)).toHaveLength(OWNABLE.length - 1);
  });
});

describe('ensureDefaultGym', () => {
  // The upgrade path: someone already using the app must see the same exercise
  // catalogue tomorrow, so the default gym owns the lot.
  it('owns every catalogue item and is activated', () => {
    const gym = ensureDefaultGym(db, now());
    expect(getActiveGym(db)?.id).toBe(gym.id);
    expect(listGymEquipment(db, gym.id).filter((r) => r.owned)).toHaveLength(OWNABLE.length);
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

describe('listExercises at a gym', () => {
  const doable = (gymId: string) => listExercises(db, { gymId }).map((e) => e.name).sort();
  const own = (gymId: string, ...ids: string[]) => ids.forEach((id) => setGymEquipmentOwned(db, gymId, id, true, now()));

  it('offers bodyweight movements at a gym with nothing in it', () => {
    expect(doable(createGym(db, 'Empty', now()).id)).toEqual(['Push-up']);
  });

  // "Dumbbell curl" names the singular; the gym owns the plural.
  it('matches a singular need against the plural a gym owns', () => {
    const gym = createGym(db, 'Home', now());
    own(gym.id, 'dumbbells');
    expect(doable(gym.id)).toEqual(['Dumbbell curl', 'Push-up']);
  });

  // "Barbell and weight plates" is one option of two items, and the bench
  // press also needs its bench: a bar alone, or a bar and plates with no
  // bench, is not enough.
  it('needs every item of an option, and every need', () => {
    const gym = createGym(db, 'Home', now());
    own(gym.id, 'barbell');
    expect(doable(gym.id)).not.toContain('Bench press');
    own(gym.id, 'plates');
    expect(doable(gym.id)).not.toContain('Bench press');
    own(gym.id, 'bench');
    expect(doable(gym.id)).toContain('Bench press');
  });

  it('drops an exercise when its equipment is unticked', () => {
    const gym = createGym(db, 'Home', now());
    own(gym.id, 'legPress');
    expect(doable(gym.id)).toContain('Leg press');
    setGymEquipmentOwned(db, gym.id, 'legPress', false, now());
    expect(doable(gym.id)).not.toContain('Leg press');
  });

  // Two tombstone levels on the owned set: the gym_equipment row and the item.
  it('ignores an owned item the catalogue has retired', () => {
    const gym = createGym(db, 'Home', now());
    own(gym.id, 'legPress');
    db.update(equipment).set({ deletedAt: now() }).where(eq(equipment.id, 'legPress')).run();
    expect(doable(gym.id)).not.toContain('Leg press');
  });

  it('with no gym, offers everything', () => {
    expect(listExercises(db)).toHaveLength(4);
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
    setGymEquipmentOwned(db, gym.id, equipmentId('Flat bench'), true, now());

    setGymEquipmentOwnedBulk(db, gym.id, [equipmentId('Barbell')], true, now());

    expect(listGymEquipment(db, gym.id).filter((r) => r.owned).map((r) => r.equipment.name).sort())
      .toEqual(['Barbell', 'Flat bench']);
  });

  it('does nothing for an empty group', () => {
    const gym = createGym(db, 'Home', now());
    setGymEquipmentOwnedBulk(db, gym.id, [], true, now());
    expect(listGymEquipment(db, gym.id).filter((r) => r.owned)).toHaveLength(0);
  });
});

describe('createGymFromPreset', () => {
  it('stocks the gym from the named list', () => {
    const gym = createGymFromPreset(db, 'Home', 'house', ['Dumbbells', 'Flat bench'], now());
    expect(listGymEquipment(db, gym.id).filter((r) => r.owned).map((r) => r.equipment.name).sort())
      .toEqual(['Dumbbells', 'Flat bench']);
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
    const b = createGymFromPreset(db, 'B', 'house', ['Flat bench'], now());
    setGymEquipmentOwned(db, a.id, equipmentId('Barbell'), false, now());

    const counts = countOwnedEquipment(db);
    expect(counts.get(a.id)).toBe(1);
    expect(counts.get(b.id)).toBe(1);
  });
});
