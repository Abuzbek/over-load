import {
  equipment,
  exerciseEquipment,
  exerciseLinks,
  exerciseMuscles,
  exercises,
  lookups,
  newId,
  now,
  sessionExercises,
  sessions,
  sessionSets,
  type Db,
  type EquipmentCategory,
  type Exercise,
  type TrackingType,
} from '@overload/schema';
import {
  and,
  asc,
  between,
  desc,
  eq,
  getTableColumns,
  isNotNull,
  isNull,
  like,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

/** The picker's Type filter: the file's exercise type crossed with the region it trains. */
export const EXERCISE_TYPE_FILTERS = {
  compound_upper: 'Compound Upper',
  compound_lower: 'Compound Lower',
  upper_isolation: 'Upper Isolation',
  lower_isolation: 'Lower Isolation',
  full_body: 'Full Body',
  core: 'Core',
} as const;
export type ExerciseTypeFilter = keyof typeof EXERCISE_TYPE_FILTERS;

/** The Resistance filter's "Bodyweight only": an exercise with no resistance need. */
export const BODYWEIGHT_ONLY = 'bodyweight';

export type ExerciseFilters = {
  search?: string;
  limit?: number;
  /** Only what this gym's equipment allows. */
  gymId?: string | null;
  /** Any of these feature-muscle groups as a primary. */
  muscleIds?: string[];
  type?: ExerciseTypeFilter;
  lateralityId?: string;
  /** An equipment id the exercise can be loaded with, or BODYWEIGHT_ONLY. */
  resistance?: string;
  support?: string;
  /** Inclusive, 1–5. */
  rom?: [number, number];
  stability?: [number, number];
};

/** The picker's five groups, in display order. */
export const EXERCISE_GROUPS = {
  bodyweight_personal: 'Bodyweight & Personal',
  machines: 'Machines',
  free_weights: 'Free weights',
  cardio: 'Cardio',
  other: 'Other',
} as const;
export type ExerciseGroup = keyof typeof EXERCISE_GROUPS;

/** Which group an exercise's main resistance item puts it in. */
const GROUP_BY_CATEGORY: Record<EquipmentCategory, ExerciseGroup> = {
  body_weights: 'bodyweight_personal',
  bands_ropes: 'bodyweight_personal',
  accessories_functional: 'bodyweight_personal',
  cable_machines: 'machines',
  plate_loaded_machines: 'machines',
  pin_loaded_machines: 'machines',
  free_weights: 'free_weights',
  loaded_bars: 'free_weights',
  fixed_weight_bars: 'free_weights',
  loaded_accessories: 'free_weights',
  cardio: 'cardio',
  benches_racks: 'other',
  other: 'other',
};

/** A picker row: the exercise, its muscle-group names (primary, secondary) and group. */
export type ExerciseListItem = Exercise & {
  primaryMuscles: string | null;
  secondaryMuscles: string | null;
  group: ExerciseGroup;
};

/**
 * The outer row in a correlated subquery. Drizzle writes `${outer('id')}` as a
 * bare "id" in a single-table select, which a subquery over `lookups` would
 * bind to its own id column instead.
 */
const outer = (column: 'id' | 'exercise_type_id' | 'region_id') => sql.raw(`"exercises"."${column}"`);

const lookupName = (column: 'exercise_type_id' | 'region_id') =>
  sql`(select name from lookups where id = ${outer(column)})`;

function typeFilter(type: ExerciseTypeFilter): SQL {
  const t = lookupName('exercise_type_id');
  const r = lookupName('region_id');
  switch (type) {
    case 'compound_upper': return sql`${t} = 'Multi-joint (compound)' and ${r} = 'Upper body'`;
    case 'compound_lower': return sql`${t} = 'Multi-joint (compound)' and ${r} = 'Lower body'`;
    case 'upper_isolation': return sql`${t} = 'Single joint (isolation)' and ${r} = 'Upper body'`;
    case 'lower_isolation': return sql`${t} = 'Single joint (isolation)' and ${r} = 'Lower body'`;
    case 'full_body': return sql`${r} = 'Full body'`;
    case 'core': return sql`(${t} = 'Core' or ${r} = 'Core')`;
  }
}

function equipmentFilter(need: 'resistance' | 'support', value: string): SQL {
  if (value === BODYWEIGHT_ONLY) {
    return sql`not exists (select 1 from exercise_equipment e where e.exercise_id = ${outer('id')} and e.need = ${need})`;
  }
  return sql`exists (select 1 from exercise_equipment e
    where e.exercise_id = ${outer('id')} and e.need = ${need} and e.equipment_id = ${value})`;
}

const musclesOf = (weight: number) => sql<string | null>`(
  select group_concat(l.name, ', ') from exercise_muscles m join lookups l on l.id = m.muscle_id
  where m.exercise_id = ${outer('id')} and m.weight = ${weight}
)`;

/**
 * The category of the first resistance option's main item. Plates ride along
 * with a bar ("Barbell and weight plates"), so a free weight only wins when
 * the option has nothing else.
 */
const resistanceCategory = sql<EquipmentCategory | null>`(
  select q.category from exercise_equipment e join equipment q on q.id = e.equipment_id
  where e.exercise_id = ${outer('id')} and e.need = 'resistance' and q.deleted_at is null
  order by e.option, q.category = 'free_weights'
  limit 1
)`;

/**
 * The file's recommendation levels, 1 (best) to 9: the worse of strength and
 * hypertrophy first, so an exercise low on both leads; then their sum, so of
 * two equally-worst ones the better all-rounder does. None at all sorts last.
 */
const recommended = [
  sql`coalesce(max(${exercises.recommendationStrength}, ${exercises.recommendationHypertrophy}), 99)`,
  sql`coalesce(${exercises.recommendationStrength} + ${exercises.recommendationHypertrophy}, 99)`,
];

/** Most recommended first (above), then most searched-for, then by name. */
export function listExercises(db: Db, opts: ExerciseFilters = {}): ExerciseListItem[] {
  const filters: SQL[] = [isNull(exercises.deletedAt)];
  // search_text adds the alternative names; LIKE is case-insensitive already.
  if (opts.search) {
    const pattern = `%${opts.search}%`;
    filters.push(or(like(exercises.name, pattern), like(exercises.searchText, pattern.toLowerCase()))!);
  }
  if (opts.gymId) filters.push(doableAt(opts.gymId));
  if (opts.muscleIds?.length) {
    filters.push(sql`exists (select 1 from exercise_muscles m where m.exercise_id = ${outer('id')}
      and m.weight = 1 and m.muscle_id in (${sql.join(opts.muscleIds.map((id) => sql`${id}`), sql`, `)}))`);
  }
  if (opts.type) filters.push(typeFilter(opts.type));
  if (opts.lateralityId) {
    filters.push(sql`exists (select 1 from exercise_links k where k.exercise_id = ${outer('id')}
      and k.role = 'laterality' and k.lookup_id = ${opts.lateralityId})`);
  }
  if (opts.resistance) filters.push(equipmentFilter('resistance', opts.resistance));
  if (opts.support) filters.push(equipmentFilter('support', opts.support));
  if (opts.rom) filters.push(between(exercises.rom, opts.rom[0], opts.rom[1]));
  if (opts.stability) filters.push(between(exercises.stability, opts.stability[0], opts.stability[1]));

  const query = db
    .select({
      ...getTableColumns(exercises),
      primaryMuscles: musclesOf(1),
      secondaryMuscles: musclesOf(0.5),
      category: resistanceCategory,
    })
    .from(exercises)
    .where(and(...filters))
    .orderBy(...recommended, desc(exercises.searchBoost), asc(exercises.name));
  const rows = opts.limit ? query.limit(opts.limit).all() : query.all();
  return rows.map(({ category, ...row }) => ({
    ...row,
    // No resistance item (bodyweight) or the user's own: Bodyweight & Personal.
    group: row.isCustom || !category ? 'bodyweight_personal' : GROUP_BY_CATEGORY[category],
  }));
}

export type FilterOption = { id: string; name: string };
export type EquipmentOption = FilterOption & { category: EquipmentCategory; available: boolean };

export type ExerciseFilterOptions = {
  /** Most-trained first, the order the picker's strip shows them in. */
  muscles: FilterOption[];
  lateralities: FilterOption[];
  resistance: EquipmentOption[];
  support: EquipmentOption[];
};

/**
 * What each filter can choose from. Equipment options are only the items some
 * exercise actually needs; `available` says whether the gym owns it.
 */
export function exerciseFilterOptions(db: Db, gymId: string | null): ExerciseFilterOptions {
  const muscles = db
    .select({ id: lookups.id, name: lookups.name })
    .from(lookups)
    .leftJoin(exerciseMuscles, and(eq(exerciseMuscles.muscleId, lookups.id), eq(exerciseMuscles.weight, 1)))
    .where(eq(lookups.type, 'featureMuscleGroup'))
    .groupBy(lookups.id)
    .orderBy(sql`count(${exerciseMuscles.exerciseId}) desc`, asc(lookups.name))
    .all();

  const lateralities = db
    .select({ id: lookups.id, name: lookups.name })
    .from(lookups)
    .where(eq(lookups.type, 'laterality'))
    .orderBy(asc(lookups.name))
    .all();

  const owned = gymId
    ? sql<number>`exists (select 1 from gym_equipment ge where ge.gym_id = ${gymId}
        and ge.equipment_id = ${equipment.id} and ge.deleted_at is null)`
    : sql<number>`1`;
  const forNeed = (need: 'resistance' | 'support'): EquipmentOption[] =>
    db
      .selectDistinct({ id: equipment.id, name: equipment.name, category: equipment.category, available: owned })
      .from(exerciseEquipment)
      .innerJoin(equipment, eq(equipment.id, exerciseEquipment.equipmentId))
      .where(and(eq(exerciseEquipment.need, need), isNull(equipment.deletedAt)))
      .orderBy(asc(equipment.name))
      .all()
      .map((row) => ({ ...row, available: Boolean(row.available) }));

  return { muscles, lateralities, resistance: forNeed('resistance'), support: forNeed('support') };
}

export type ExerciseDetail = {
  exercise: Exercise;
  type: string | null;
  region: string | null;
  /** Every list field of the file by its name (laterality, movementPattern, …), names in order. */
  links: Record<string, string[]>;
  muscles: { id: string; name: string; primary: boolean }[];
  /** Per need, the alternatives; each alternative is the items it needs together. */
  equipment: Record<'resistance' | 'support', FilterOption[][]>;
};

export function getExerciseDetail(db: Db, id: string): ExerciseDetail | undefined {
  const exercise = getExercise(db, id);
  if (!exercise) return undefined;
  const name = (lookupId: string | null) =>
    lookupId ? (db.select({ name: lookups.name }).from(lookups).where(eq(lookups.id, lookupId)).get()?.name ?? null) : null;

  const links: Record<string, string[]> = {};
  for (const row of db
    .select({ role: exerciseLinks.role, name: lookups.name })
    .from(exerciseLinks)
    .innerJoin(lookups, eq(lookups.id, exerciseLinks.lookupId))
    .where(eq(exerciseLinks.exerciseId, id))
    .orderBy(asc(exerciseLinks.role), asc(exerciseLinks.position))
    .all()) {
    (links[row.role] ??= []).push(row.name);
  }

  const muscles = db
    .select({ id: lookups.id, name: lookups.name, weight: exerciseMuscles.weight })
    .from(exerciseMuscles)
    .innerJoin(lookups, eq(lookups.id, exerciseMuscles.muscleId))
    .where(eq(exerciseMuscles.exerciseId, id))
    .orderBy(desc(exerciseMuscles.weight), asc(lookups.name))
    .all()
    .map(({ weight, ...m }) => ({ ...m, primary: weight === 1 }));

  const equipmentByNeed: ExerciseDetail['equipment'] = { resistance: [], support: [] };
  for (const row of db
    .select({ need: exerciseEquipment.need, option: exerciseEquipment.option, id: equipment.id, name: equipment.name })
    .from(exerciseEquipment)
    .innerJoin(equipment, eq(equipment.id, exerciseEquipment.equipmentId))
    .where(and(eq(exerciseEquipment.exerciseId, id), isNull(equipment.deletedAt)))
    .orderBy(asc(exerciseEquipment.option), asc(equipment.name))
    .all()) {
    (equipmentByNeed[row.need][row.option] ??= []).push({ id: row.id, name: row.name });
  }
  for (const need of ['resistance', 'support'] as const) equipmentByNeed[need] = equipmentByNeed[need].filter(Boolean);

  return { exercise, type: name(exercise.exerciseTypeId), region: name(exercise.regionId), links, muscles, equipment: equipmentByNeed };
}

export type ExerciseHistoryEntry = {
  sessionId: string;
  name: string;
  startedAt: number;
  sets: number;
  reps: number;
  volumeKg: number;
};

/** Every session that completed a set of this exercise, newest first. */
export function exerciseHistory(db: Db, exerciseId: string): ExerciseHistoryEntry[] {
  return db
    .select({
      sessionId: sessions.id,
      name: sessions.name,
      startedAt: sessions.startedAt,
      sets: sql<number>`count(*)`,
      reps: sql<number>`coalesce(sum(${sessionSets.reps}), 0)`,
      volumeKg: sql<number>`coalesce(sum(${sessionSets.weightKg} * ${sessionSets.reps}), 0)`,
    })
    .from(sessionSets)
    .innerJoin(sessionExercises, eq(sessionExercises.id, sessionSets.sessionExerciseId))
    .innerJoin(sessions, eq(sessions.id, sessionExercises.sessionId))
    .where(
      and(
        eq(sessionExercises.exerciseId, exerciseId),
        isNotNull(sessionSets.completedAt),
        isNull(sessionSets.deletedAt),
        isNull(sessionExercises.deletedAt),
        isNull(sessions.deletedAt),
      ),
    )
    .groupBy(sessions.id)
    .orderBy(desc(sessions.startedAt))
    .all();
}

/**
 * The exercise's equipment needs are all met by what the gym owns: for every
 * need (resistance, support) at least one option has no item missing. An
 * exercise with no needs — bodyweight — is doable anywhere.
 *
 * Every probe below is a range on exercise_equipment's primary key, and the
 * owned set is uncorrelated, so SQLite builds it once per query. Two tombstone
 * levels on it: the gym_equipment row and the catalogue item.
 */
function doableAt(gymId: string): SQL {
  return sql`not exists (
    select 1 from exercise_equipment n
    where n.exercise_id = ${outer('id')}
      and not exists (
        select 1 from exercise_equipment o
        where o.exercise_id = n.exercise_id and o.need = n.need
          and not exists (
            select 1 from exercise_equipment i
            where i.exercise_id = o.exercise_id and i.need = o.need and i.option = o.option
              and i.equipment_id not in (
                select ge.equipment_id from gym_equipment ge
                join equipment q on q.id = ge.equipment_id
                where ge.gym_id = ${gymId} and ge.deleted_at is null and q.deleted_at is null
              )
          )
      )
  )`;
}

export function getExercise(db: Db, id: string): Exercise | undefined {
  return db
    .select()
    .from(exercises)
    .where(and(eq(exercises.id, id), isNull(exercises.deletedAt)))
    .get();
}

/**
 * A custom exercise names its muscle as free text. When that text is one of
 * the catalogue's muscle groups it is linked as the primary, so the exercise
 * counts on the heatmap like a seeded one.
 */
export function createCustomExercise(
  db: Db,
  input: { name: string; trackingType: TrackingType; primaryMuscle: string; equipment: string },
): Exercise {
  const timestamp = now();
  const row: Exercise = {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    name: input.name,
    trackingType: input.trackingType,
    primaryMuscle: input.primaryMuscle,
    equipment: input.equipment,
    instructions: null,
    isCustom: true,
    exerciseTypeId: null,
    regionId: null,
    rom: null,
    stability: null,
    bodyweight: null,
    recommendationStrength: null,
    recommendationHypertrophy: null,
    searchBoost: 0,
    searchText: input.name.toLowerCase(),
  };

  db.insert(exercises).values(row).run();

  const muscle = db
    .select({ id: lookups.id })
    .from(lookups)
    .where(and(eq(lookups.type, 'featureMuscleGroup'), sql`lower(${lookups.name}) = ${input.primaryMuscle.trim().toLowerCase()}`))
    .get();
  if (muscle) db.insert(exerciseMuscles).values({ exerciseId: row.id, muscleId: muscle.id, weight: 1 }).run();

  return row;
}
