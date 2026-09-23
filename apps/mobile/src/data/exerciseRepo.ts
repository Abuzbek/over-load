import {
  exerciseMuscles,
  exercises,
  lookups,
  newId,
  now,
  type Db,
  type Exercise,
  type TrackingType,
} from '@overload/schema';
import { and, asc, eq, isNull, like, or, sql, type SQL } from 'drizzle-orm';

export function listExercises(
  db: Db,
  opts: { search?: string; limit?: number; gymId?: string | null } = {},
): Exercise[] {
  const filters: SQL[] = [isNull(exercises.deletedAt)];
  // search_text adds the alternative names; LIKE is case-insensitive already.
  if (opts.search) {
    const pattern = `%${opts.search}%`;
    filters.push(or(like(exercises.name, pattern), like(exercises.searchText, pattern.toLowerCase()))!);
  }
  if (opts.gymId) filters.push(doableAt(opts.gymId));

  const query = db.select().from(exercises).where(and(...filters)).orderBy(asc(exercises.name));
  return opts.limit ? query.limit(opts.limit).all() : query.all();
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
    where n.exercise_id = ${exercises.id}
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
