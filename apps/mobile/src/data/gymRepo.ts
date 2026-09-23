import {
  appSettings,
  equipment,
  type Equipment,
  type EquipmentConfig,
  gymEquipment,
  gyms,
  newId,
  type Db,
  type Gym,
} from '@overload/schema';
import { and, eq, inArray, isNull, max, sql } from 'drizzle-orm';

export type GymSummary = { gym: Gym; isActive: boolean };

function settingsRow(db: Db) {
  return db.select().from(appSettings).where(isNull(appSettings.deletedAt)).get();
}

export function listGyms(db: Db): GymSummary[] {
  const activeId = settingsRow(db)?.activeGymId ?? null;
  return db
    .select()
    .from(gyms)
    .where(isNull(gyms.deletedAt))
    .orderBy(gyms.orderIndex)
    .all()
    .map((gym) => ({ gym, isActive: gym.id === activeId }));
}

export function getActiveGym(db: Db): Gym | undefined {
  const activeId = settingsRow(db)?.activeGymId;
  if (!activeId) return undefined;
  return db.select().from(gyms).where(and(eq(gyms.id, activeId), isNull(gyms.deletedAt))).get();
}

/**
 * One column on one row, exactly as activeProgramId works: activating B
 * necessarily overwrites A, so there is never a moment with two active gyms.
 */
export function activateGym(db: Db, gymId: string, at: number): void {
  const row = settingsRow(db);
  if (row) {
    db.update(appSettings).set({ activeGymId: gymId, updatedAt: at }).where(eq(appSettings.id, row.id)).run();
    return;
  }
  db.insert(appSettings).values({ id: newId(), activeGymId: gymId, createdAt: at, updatedAt: at }).run();
}

export function createGym(db: Db, name: string, at: number, icon = 'dumbbell'): Gym {
  const highest = db.select({ maxIndex: max(gyms.orderIndex) }).from(gyms).get();
  const row = {
    id: newId(),
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    name,
    icon,
    // max + 1 over ALL rows including tombstoned, per the ordering invariant.
    orderIndex: (highest?.maxIndex ?? -1) + 1,
  };
  db.insert(gyms).values(row).run();
  return row;
}

/** Every catalogue item, with what this gym owns and the weights it has. */
export type GymEquipmentRow = {
  equipment: Equipment;
  owned: boolean;
  config: EquipmentConfig;
};

export function listGymEquipment(db: Db, gymId: string): GymEquipmentRow[] {
  const catalogue = db
    .select()
    .from(equipment)
    .where(isNull(equipment.deletedAt))
    .orderBy(equipment.name)
    .all();

  const owned = db
    .select()
    .from(gymEquipment)
    .where(and(eq(gymEquipment.gymId, gymId), isNull(gymEquipment.deletedAt)))
    .all();
  const ownedById = new Map(owned.map((row) => [row.equipmentId, row]));

  return catalogue.map((item) => {
    const mine = ownedById.get(item.id);
    return {
      equipment: item,
      owned: mine !== undefined,
      // Not owned yet? Show the catalogue defaults, so ticking it starts from
      // something sensible rather than from zero.
      config: mine?.config ?? item.defaults,
    };
  });
}

/**
 * A row exists only for equipment the gym owns; unticking tombstones it.
 * Re-ticking revives the same row, which is what keeps the weights you edited
 * last time rather than resetting them to the catalogue.
 */
export function setGymEquipmentOwned(
  db: Db,
  gymId: string,
  equipmentId: string,
  owned: boolean,
  at: number,
): void {
  const existing = db
    .select()
    .from(gymEquipment)
    .where(and(eq(gymEquipment.gymId, gymId), eq(gymEquipment.equipmentId, equipmentId)))
    .get();

  if (existing) {
    db.update(gymEquipment)
      .set({ deletedAt: owned ? null : at, updatedAt: at })
      .where(eq(gymEquipment.id, existing.id))
      .run();
    return;
  }
  if (!owned) return;

  const item = db.select().from(equipment).where(eq(equipment.id, equipmentId)).get();
  if (!item) return;
  db.insert(gymEquipment)
    .values({
      id: newId(),
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
      gymId,
      equipmentId,
      config: item.defaults,
    })
    .run();
}

/**
 * Ticks or unticks a whole group at once — a commercial gym is 250 taps
 * otherwise.
 *
 * One transaction, not one write per item: 84 separate statements is slow
 * enough to be visible, and a half-applied group is a worse state than either
 * end of it.
 */
export function setGymEquipmentOwnedBulk(
  db: Db,
  gymId: string,
  equipmentIds: string[],
  owned: boolean,
  at: number,
): void {
  if (equipmentIds.length === 0) return;
  db.transaction((tx) => {
    for (const equipmentId of equipmentIds) {
      setGymEquipmentOwned(tx as Db, gymId, equipmentId, owned, at);
    }
  });
}

export function setGymEquipmentConfig(
  db: Db,
  gymId: string,
  equipmentId: string,
  config: EquipmentConfig,
  at: number,
): void {
  const existing = db
    .select()
    .from(gymEquipment)
    .where(and(eq(gymEquipment.gymId, gymId), eq(gymEquipment.equipmentId, equipmentId)))
    .get();

  if (existing) {
    db.update(gymEquipment)
      .set({ config, updatedAt: at })
      .where(eq(gymEquipment.id, existing.id))
      .run();
    return;
  }
  // Editing the weights of something not yet ticked implies owning it.
  db.insert(gymEquipment)
    .values({ id: newId(), createdAt: at, updatedAt: at, deletedAt: null, gymId, equipmentId, config })
    .run();
}

export function setGymIcon(db: Db, gymId: string, icon: string, at: number): void {
  db.update(gyms).set({ icon, updatedAt: at }).where(eq(gyms.id, gymId)).run();
}

export function renameGym(db: Db, gymId: string, name: string, at: number): void {
  db.update(gyms).set({ name, updatedAt: at }).where(eq(gyms.id, gymId)).run();
}

/**
 * Tombstone, never DELETE. Removing the active gym also clears the pointer,
 * because a dangling activeGymId would filter the catalogue against a gym that
 * no longer exists and silently hide everything.
 */
export function removeGym(db: Db, gymId: string, at: number): void {
  db.update(gyms).set({ deletedAt: at, updatedAt: at }).where(eq(gyms.id, gymId)).run();

  const row = settingsRow(db);
  if (row?.activeGymId !== gymId) return;

  const next = db
    .select()
    .from(gyms)
    .where(isNull(gyms.deletedAt))
    .orderBy(gyms.orderIndex)
    .get();
  db.update(appSettings)
    .set({ activeGymId: next?.id ?? null, updatedAt: at })
    .where(eq(appSettings.id, row.id))
    .run();
}

/**
 * Creates a gym already stocked from a named preset.
 *
 * The preset is a list of equipment names from equipment.json, matched
 * case-insensitively: that file capitalises every word, app_file.json does not.
 */
export function createGymFromPreset(
  db: Db,
  name: string,
  icon: string,
  equipmentNames: string[],
  at: number,
): Gym {
  const gym = createGym(db, name, at, icon);
  if (equipmentNames.length === 0) return gym;

  const items = db
    .select()
    .from(equipment)
    .where(and(inArray(sql`lower(${equipment.name})`, equipmentNames.map((n) => n.toLowerCase())), isNull(equipment.deletedAt)))
    .all();
  if (items.length === 0) return gym;

  db.insert(gymEquipment)
    .values(
      items.map((item) => ({
        id: newId(), createdAt: at, updatedAt: at, deletedAt: null,
        gymId: gym.id, equipmentId: item.id, config: item.defaults,
      })),
    )
    .run();
  return gym;
}

/**
 * Copies a gym, its icon and everything it owns — including the weights that
 * gym has, not the catalogue defaults. Two branches of the same chain differ by
 * a few machines, and re-ticking 200 boxes to express that is absurd.
 */
export function duplicateGym(db: Db, gymId: string, name: string, at: number): Gym | undefined {
  const source = db.select().from(gyms).where(and(eq(gyms.id, gymId), isNull(gyms.deletedAt))).get();
  if (!source) return undefined;

  const copy = createGym(db, name, at, source.icon);
  const owned = db
    .select()
    .from(gymEquipment)
    .where(and(eq(gymEquipment.gymId, gymId), isNull(gymEquipment.deletedAt)))
    .all();

  if (owned.length > 0) {
    db.insert(gymEquipment)
      .values(
        owned.map((row) => ({
          id: newId(), createdAt: at, updatedAt: at, deletedAt: null,
          gymId: copy.id, equipmentId: row.equipmentId, config: row.config,
        })),
      )
      .run();
  }
  return copy;
}

/** How many pieces each gym owns, for the profile list. */
export function countOwnedEquipment(db: Db): Map<string, number> {
  const rows = db
    .select({ gymId: gymEquipment.gymId })
    .from(gymEquipment)
    .innerJoin(equipment, eq(equipment.id, gymEquipment.equipmentId))
    .where(and(isNull(gymEquipment.deletedAt), isNull(equipment.deletedAt)))
    .all();

  const counts = new Map<string, number>();
  for (const { gymId } of rows) counts.set(gymId, (counts.get(gymId) ?? 0) + 1);
  return counts;
}

/**
 * For a first run, and for every install that predates gyms.
 *
 * The default owns EVERYTHING, not nothing: an existing user who opens the app
 * after this ships must see the same exercise catalogue they saw yesterday.
 * Starting empty would hide most of it without being asked. A gym the user adds
 * themselves starts empty, because there they are describing a real room.
 */
export function ensureDefaultGym(db: Db, at: number): Gym {
  const existing = db.select().from(gyms).where(isNull(gyms.deletedAt)).orderBy(gyms.orderIndex).all();
  if (existing.length > 0) return getActiveGym(db) ?? existing[0]!;

  const gym = createGym(db, 'My Gym', at);
  activateGym(db, gym.id, at);

  const catalogue = db.select().from(equipment).where(isNull(equipment.deletedAt)).all();
  if (catalogue.length > 0) {
    db.insert(gymEquipment)
      .values(
        catalogue.map((item) => ({
          id: newId(),
          createdAt: at,
          updatedAt: at,
          deletedAt: null,
          gymId: gym.id,
          equipmentId: item.id,
          config: item.defaults,
        })),
      )
      .run();
  }
  return gym;
}
