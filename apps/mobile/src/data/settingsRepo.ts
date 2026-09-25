import { DEFAULT_WARMUP_SCHEME, type DistanceUnit, type Unit, type WarmupStep } from '@overload/domain';
import {
  appSettings,
  now,
  type Db,
  type HeightUnit,
  type NewAppSettings,
  type Profile,
  type TrainingPreferences,
} from '@overload/schema';
import { eq, isNull } from 'drizzle-orm';

/**
 * `app_settings` is a single-row table, created empty by its migration, so the
 * very first read on every existing install hits an absent row.
 */
/**
 * The same id on every device, so an account's settings are one row that
 * sync merges rather than one per install.
 */
export const SETTINGS_ID = 'settings';

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
  db.insert(appSettings).values({ id: SETTINGS_ID, createdAt: at, updatedAt: at, ...patch }).run();
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

/** Display only, like the other two. The profile's height is stored in cm. */
export function getHeightUnit(db: Db): HeightUnit {
  const row = currentRow(db);
  if (row) return row.heightUnit;
  upsertSettings(db, {}, now());
  return 'cm';
}

export function setHeightUnit(db: Db, unit: HeightUnit, at: number): void {
  upsertSettings(db, { heightUnit: unit }, at);
}

/**
 * Every field is optional and starts empty. Nothing in the app reads a profile
 * to work — it is the user's own record of themselves — so a half-filled one
 * is a normal state, not a migration to finish later.
 */
export function getProfile(db: Db): Profile {
  const row = currentRow(db);
  if (!row) {
    upsertSettings(db, {}, now());
    return EMPTY_PROFILE;
  }
  return {
    name: row.profileName,
    birthDate: row.birthDate,
    gender: row.gender,
    bodyweightKg: row.bodyweightKg,
    heightCm: row.heightCm,
    liftingExperience: row.liftingExperience,
    cardioExperience: row.cardioExperience,
    bodyFatPercent: row.bodyFatPercent,
  };
}

/** Whether this account has been through onboarding (on any device). */
export function getOnboardedAt(db: Db): number | null {
  return currentRow(db)?.onboardedAt ?? null;
}

/** The user's warm-up scheme, or the default one. */
export function getWarmupScheme(db: Db): WarmupStep[] {
  return currentRow(db)?.trainingPreferences?.warmupScheme ?? DEFAULT_WARMUP_SCHEME;
}

/** Kept with the training preferences; a phone that has none (not onboarded) keeps nothing. */
export function setWarmupScheme(db: Db, scheme: WarmupStep[], at: number): void {
  const preferences = currentRow(db)?.trainingPreferences;
  if (!preferences) return;
  upsertSettings(db, { trainingPreferences: { ...preferences, warmupScheme: scheme } }, at);
}

export function setOnboarded(db: Db, preferences: TrainingPreferences, at: number): void {
  upsertSettings(db, { onboardedAt: at, trainingPreferences: preferences }, at);
}

const EMPTY_PROFILE: Profile = {
  name: null,
  birthDate: null,
  gender: null,
  bodyweightKg: null,
  heightCm: null,
  liftingExperience: null,
  cardioExperience: null,
  bodyFatPercent: null,
};

/**
 * A patch, not a whole profile: the screen edits one field at a time, and
 * writing the rest back would turn a stale read into silent data loss.
 * `null` clears a field, which is why this checks for the key's presence.
 */
export function setProfile(db: Db, patch: Partial<Profile>, at: number): void {
  const columns: Partial<NewAppSettings> = {};
  if ('name' in patch) columns.profileName = patch.name;
  if ('birthDate' in patch) columns.birthDate = patch.birthDate;
  if ('gender' in patch) columns.gender = patch.gender;
  if ('bodyweightKg' in patch) columns.bodyweightKg = patch.bodyweightKg;
  if ('heightCm' in patch) columns.heightCm = patch.heightCm;
  if ('liftingExperience' in patch) columns.liftingExperience = patch.liftingExperience;
  if ('cardioExperience' in patch) columns.cardioExperience = patch.cardioExperience;
  if ('bodyFatPercent' in patch) columns.bodyFatPercent = patch.bodyFatPercent;
  upsertSettings(db, columns, at);
}
