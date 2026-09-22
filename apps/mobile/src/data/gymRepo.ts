import { appSettings, EQUIPMENT, gyms, newId, type Db, type Gym } from '@overload/schema';
import { and, eq, isNull, max } from 'drizzle-orm';

/**
 * Equipment values that mean "nothing needed". They are available at every gym
 * and are deliberately not tickable — a gym with no kit still lets you do
 * push-ups.
 */
export const NO_EQUIPMENT_NEEDED = ['body only', 'none'];

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

export function createGym(db: Db, name: string, equipment: string[], at: number): Gym {
  const highest = db.select({ maxIndex: max(gyms.orderIndex) }).from(gyms).get();
  const row = {
    id: newId(),
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    name,
    equipment,
    // max + 1 over ALL rows including tombstoned, per the ordering invariant.
    orderIndex: (highest?.maxIndex ?? -1) + 1,
  };
  db.insert(gyms).values(row).run();
  return row;
}

export function setGymEquipment(db: Db, gymId: string, equipment: string[], at: number): void {
  db.update(gyms).set({ equipment, updatedAt: at }).where(eq(gyms.id, gymId)).run();
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
 * For a first run, and for every install that predates gyms.
 *
 * The default has EVERYTHING ticked, not nothing: an existing user who opens
 * the app after this ships must see the same catalogue they saw yesterday.
 * Starting empty would hide 555 of 743 exercises without being asked.
 */
export function ensureDefaultGym(db: Db, at: number): Gym {
  const existing = db.select().from(gyms).where(isNull(gyms.deletedAt)).orderBy(gyms.orderIndex).all();
  if (existing.length > 0) return getActiveGym(db) ?? existing[0]!;

  const gym = createGym(db, 'My Gym', [...EQUIPMENT], at);
  activateGym(db, gym.id, at);
  return gym;
}

/** `body only` and `none` are doable anywhere; everything else must be present. */
export function canDoWithEquipment(exerciseEquipment: string, available: string[]): boolean {
  if (NO_EQUIPMENT_NEEDED.includes(exerciseEquipment)) return true;
  return available.includes(exerciseEquipment);
}
