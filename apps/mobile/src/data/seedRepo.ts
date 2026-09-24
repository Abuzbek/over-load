import {
  catalogueMeta,
  equipment,
  exerciseEquipment,
  exerciseLinks,
  exerciseMuscles,
  exercises,
  gymEquipment,
  lookups,
  type Db,
  type EquipmentCategory,
  type EquipmentConfig,
  type EquipmentNeed,
  type NewExercise,
  type TrackingType,
  type WeightKind,
  type WeightValue,
} from '@overload/schema';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';

/**
 * Which catalogue is seeded. Bump the suffix whenever tools/seed-equipment/
 * equipment.json or instructions.json changes; a new app_file.json changes the prefix. Launch
 * compares this with catalogue_meta and only parses the 3.7 MB file on a
 * mismatch — a test pins the prefix to the file's own generatedAt.
 */
export const CATALOGUE_VERSION = '2026-05-05T21:00:52Z#2';

export type AppFileEntry = { type: string; name: string | number } & Record<string, unknown>;
export type AppFileExercise = { id: string; name: string } & Record<string, unknown>;
export type AppFile = {
  generatedAt: string;
  exercises: AppFileExercise[];
  uuidIndex: Record<string, AppFileEntry>;
};

/** An entry of tools/seed-equipment/equipment.json: the weights an item starts with. */
export type SeedEquipment = { name: string; category: EquipmentCategory; kind: WeightKind } & Record<string, unknown>;

const CATEGORY_BY_NAME: Record<string, EquipmentCategory> = {
  'Free Weights': 'free_weights',
  'Loadable Bars': 'loaded_bars',
  'Fixed Weight Bars': 'fixed_weight_bars',
  'Bands & Ropes': 'bands_ropes',
  'Body Weights': 'body_weights',
  'Benches & Racks': 'benches_racks',
  'Accessories & Functional': 'accessories_functional',
  'Loadable Accessories': 'loaded_accessories',
  'Cable Machines': 'cable_machines',
  'Plate Loaded Machines': 'plate_loaded_machines',
  'Pin Loaded Machines': 'pin_loaded_machines',
  Cardio: 'cardio',
  Other: 'other',
};

/** Needs nothing: a need with this as an option is satisfied anywhere. */
const BODYWEIGHT_ONLY = 'bodyweight only';

/** Single-valued lookup fields, stored as columns rather than links. */
const SCALAR_FIELDS = new Set([
  'id', 'name', 'exerciseType', 'regionTrained', 'rom', 'stability', 'bodyweight',
  'recommendationLevelStrength', 'recommendationLevelHypertrophy', 'searchBoostValue',
]);

const NEEDS: [EquipmentNeed, string][] = [
  ['resistance', 'resistanceEquipmentGroupIds'],
  ['support', 'supportEquipmentGroupIds'],
];

export function getCatalogueVersion(db: Db): string | null {
  return db.select().from(catalogueMeta).where(eq(catalogueMeta.key, 'version')).get()?.value ?? null;
}

/**
 * Metric names to the app's tracking types. The file is richer than the
 * session screen: carries (distance + weight) and weighted holds (duration +
 * weight) keep the part it can log. Assistance weight is deliberately NOT
 * weight_reps — more assistance is an easier set, and a weight PR would
 * reward it. The metrics themselves are kept as links, role `exerciseMetrics`.
 */
export function inferTrackingType(metrics: string[]): TrackingType {
  const has = (prefix: string) => metrics.some((m) => m.startsWith(prefix));
  if (has('Distance long')) return 'distance_duration';
  if (has('Duration')) return 'duration';
  if (has('Weight') || has('Distance short')) return 'weight_reps';
  return 'reps';
}

/**
 * Reconciles the whole catalogue — lookups, equipment, exercises and their
 * links — against the file, by the file's ids, in one transaction.
 *
 * Seeded exercises are upserted, never deleted: sessions point at them. One the
 * file drops is tombstoned. Their links, muscles and equipment needs are
 * derived data and are rebuilt outright (a real DELETE, like
 * personal_records). Custom exercises are left alone.
 */
export function syncCatalogue(
  db: Db,
  file: AppFile,
  equipmentSeed: SeedEquipment[],
  at: number,
  /** Exercise id → how-to markdown (assets/instructions.json). */
  instructions: Record<string, string> = {},
) {
  const index = file.uuidIndex;
  const name = (id: string) => String(index[id]?.name ?? '');

  // Owning "Dumbbells" is owning a "Dumbbell": the plural points at its singular.
  const pluralOf = new Map<string, string>();
  for (const [id, entry] of Object.entries(index)) {
    if (entry.type === 'equipment' && typeof entry.pluralOf === 'string') pluralOf.set(entry.pluralOf, id);
  }
  const ownable = Object.entries(index).filter(([id, e]) => e.type === 'equipment' && !pluralOf.has(id));
  const bodyweightIds = new Set(ownable.filter(([, e]) => String(e.name).toLowerCase() === BODYWEIGHT_ONLY).map(([id]) => id));

  const lookupRows = Object.entries(index).map(([id, { type, name: n, ...data }]) => ({
    id, type, name: String(n), data: Object.keys(data).length ? data : null,
  }));

  const equipmentRows = equipmentFromFile(ownable, index, equipmentSeed);

  const exerciseRows: NewExercise[] = [];
  const linkRows: (typeof exerciseLinks.$inferInsert)[] = [];
  const muscleRows: (typeof exerciseMuscles.$inferInsert)[] = [];
  const needRows: (typeof exerciseEquipment.$inferInsert)[] = [];

  for (const row of file.exercises) {
    const list = (field: string) => (Array.isArray(row[field]) ? (row[field] as string[]) : []);
    const scalar = (field: string) => (typeof row[field] === 'string' ? (row[field] as string) : null);
    const num = (field: string) => (typeof row[field] === 'number' ? (row[field] as number) : null);

    for (const [field, value] of Object.entries(row)) {
      if (SCALAR_FIELDS.has(field) || !Array.isArray(value)) continue;
      value.forEach((lookupId, position) => linkRows.push({ exerciseId: row.id, role: field, position, lookupId }));
    }

    const weights = new Map<string, number>();
    for (const id of list('secondaryFeatureMuscle')) weights.set(id, 0.5);
    for (const id of list('primaryFeatureMuscle')) weights.set(id, 1);
    for (const [muscleId, weight] of weights) muscleRows.push({ exerciseId: row.id, muscleId, weight });

    for (const [need, field] of NEEDS) {
      const options = list(field).map((id) => {
        const members = index[id]?.type === 'equipment' ? [id] : ((index[id]?.equipment as string[]) ?? []);
        return [...new Set(members.map((m) => pluralOf.get(m) ?? m))];
      });
      // A bodyweight option means the need is met anywhere; drop it whole.
      if (options.some((o) => o.length === 0 || o.some((m) => bodyweightIds.has(m)))) continue;
      options.forEach((items, option) => {
        for (const equipmentId of items) needRows.push({ exerciseId: row.id, need, option, equipmentId });
      });
    }

    const featureMuscles = [...list('primaryFeatureMuscle'), ...list('secondaryFeatureMuscle')];
    const resistance = list('resistanceEquipmentGroupIds')[0];
    const rom = scalar('rom');
    const stability = scalar('stability');
    exerciseRows.push({
      id: row.id,
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
      name: row.name,
      trackingType: inferTrackingType(list('exerciseMetrics').map(name)),
      primaryMuscle: featureMuscles[0] ? name(featureMuscles[0]) : 'Other',
      equipment: resistance ? name(resistance) : 'None',
      instructions: instructions[row.id] ?? null,
      isCustom: false,
      exerciseTypeId: scalar('exerciseType'),
      regionId: scalar('regionTrained'),
      rom: rom ? Number(name(rom)) : null,
      stability: stability ? Number(name(stability)) : null,
      bodyweight: num('bodyweight'),
      recommendationStrength: num('recommendationLevelStrength'),
      recommendationHypertrophy: num('recommendationLevelHypertrophy'),
      searchBoost: num('searchBoostValue') ?? 0,
      searchText: [row.name, ...list('alternativeName').map(name)].join('\n').toLowerCase(),
    });
  }

  const seededIds = exerciseRows.map((r) => r.id!);

  db.transaction((tx) => {
    for (const chunk of chunks(lookupRows, 2000)) {
      tx.insert(lookups).values(chunk)
        .onConflictDoUpdate({ target: lookups.id, set: excluded(['type', 'name', 'data']) })
        .run();
    }

    syncEquipment(tx as unknown as Db, equipmentRows, at);

    for (const chunk of chunks(exerciseRows, 400)) {
      tx.insert(exercises).values(chunk)
        .onConflictDoUpdate({
          target: exercises.id,
          set: {
            ...excluded([
              'name', 'tracking_type', 'primary_muscle', 'equipment', 'exercise_type_id', 'region_id',
              'rom', 'stability', 'bodyweight', 'recommendation_strength', 'recommendation_hypertrophy',
              'search_boost', 'search_text', 'instructions', 'updated_at',
            ]),
            deletedAt: null,
          },
        })
        .run();
    }

    const seeded = sql`(select ${exercises.id} from ${exercises} where ${exercises.isCustom} = 0)`;
    tx.delete(exerciseLinks).where(inArray(exerciseLinks.exerciseId, seeded)).run();
    tx.delete(exerciseMuscles).where(inArray(exerciseMuscles.exerciseId, seeded)).run();
    tx.delete(exerciseEquipment).where(inArray(exerciseEquipment.exerciseId, seeded)).run();
    for (const chunk of chunks(linkRows, 4000)) tx.insert(exerciseLinks).values(chunk).run();
    for (const chunk of chunks(muscleRows, 4000)) tx.insert(exerciseMuscles).values(chunk).run();
    for (const chunk of chunks(needRows, 4000)) tx.insert(exerciseEquipment).values(chunk).run();

    tx.update(exercises)
      .set({ deletedAt: at, updatedAt: at })
      .where(and(eq(exercises.isCustom, false), notInArray(exercises.id, seededIds), sql`${exercises.deletedAt} is null`))
      .run();

    tx.insert(catalogueMeta).values({ key: 'version', value: CATALOGUE_VERSION })
      .onConflictDoUpdate({ target: catalogueMeta.key, set: { value: CATALOGUE_VERSION } })
      .run();
  });

  return {
    exercises: exerciseRows.length,
    links: linkRows.length,
    muscles: muscleRows.length,
    needs: needRows.length,
    equipment: equipmentRows.length,
  };
}

type EquipmentRow = {
  id: string;
  name: string;
  category: EquipmentCategory;
  kind: WeightKind;
  defaults: EquipmentConfig;
};

/**
 * The file names each item and its category; the weights it starts with —
 * dumbbell sizes, plate colours, band labels, stack ranges — come from
 * equipment.json, matched by name. An item that file does not know takes the
 * weight kind of its category, which is where the kind belongs anyway.
 */
function equipmentFromFile(
  ownable: [string, AppFileEntry][],
  index: Record<string, AppFileEntry>,
  seed: SeedEquipment[],
): EquipmentRow[] {
  const byName = new Map(seed.map((s) => [s.name.toLowerCase(), s]));
  const kindByCategory = new Map<EquipmentCategory, WeightKind>();
  for (const s of seed) if (!kindByCategory.has(s.category)) kindByCategory.set(s.category, s.kind);

  return ownable.map(([id, entry]) => {
    const itemName = String(entry.name);
    const categoryName = typeof entry.category === 'string' ? String(index[entry.category]?.name) : 'Other';
    const category = CATEGORY_BY_NAME[categoryName] ?? 'other';
    const known = byName.get(itemName.toLowerCase());
    const kind = known?.kind ?? kindByCategory.get(category) ?? 'none';
    return { id, name: itemName, category, kind, defaults: configFromSeed(kind, known) };
  });
}

/**
 * Upserts the owned-equipment catalogue by id. An item whose weight kind
 * changes resets the gyms that own it to the new defaults — a stale config
 * would render the wrong editor, or crash it. One the file drops is
 * tombstoned, so a gym that owns it keeps its row.
 */
function syncEquipment(db: Db, rows: EquipmentRow[], at: number) {
  const existing = new Map(db.select().from(equipment).all().map((r) => [r.id, r]));

  for (const row of rows) {
    const current = existing.get(row.id);
    if (!current) {
      db.insert(equipment).values({ ...row, createdAt: at, updatedAt: at, deletedAt: null }).run();
      continue;
    }
    const same =
      current.name === row.name && current.category === row.category && current.kind === row.kind &&
      current.deletedAt === null && JSON.stringify(current.defaults) === JSON.stringify(row.defaults);
    if (same) continue;

    db.update(equipment).set({ ...row, deletedAt: null, updatedAt: at }).where(eq(equipment.id, row.id)).run();
    if (current.kind !== row.kind) {
      db.update(gymEquipment)
        .set({ config: row.defaults, updatedAt: at })
        .where(eq(gymEquipment.equipmentId, row.id))
        .run();
    }
  }

  const keep = rows.map((r) => r.id);
  db.update(equipment)
    .set({ deletedAt: at, updatedAt: at })
    .where(and(notInArray(equipment.id, keep), sql`${equipment.deletedAt} is null`))
    .run();
}

function configFromSeed(kind: WeightKind, row: SeedEquipment | undefined): EquipmentConfig {
  switch (kind) {
    case 'list':
      return { kind: 'list', values: (row?.values as WeightValue[]) ?? [] };
    case 'base':
      return { kind: 'base', baseKg: (row?.baseKg as number) ?? 0 };
    case 'range':
      return {
        kind: 'range',
        minKg: (row?.minKg as number) ?? 0,
        maxKg: (row?.maxKg as number) ?? 0,
        incrementKg: (row?.incrementKg as number) ?? 1,
      };
    case 'labels':
      return { kind: 'labels', labels: (row?.labels as string[]) ?? [] };
    default:
      return { kind: 'none' };
  }
}

/** `set` for an upsert: take each column from the row that was just refused. */
function excluded(columns: string[]) {
  return Object.fromEntries(
    columns.map((c) => [c.replace(/_(\w)/g, (_, ch: string) => ch.toUpperCase()), sql.raw(`excluded.${c}`)]),
  );
}

/** SQLite caps bound parameters per statement; multi-row inserts go in slices. */
function chunks<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}
