import {
  exercises,
  newId,
  now,
  type Db,
  type Exercise,
  type TrackingType,
} from '@overload/schema';
import { and, asc, eq, inArray, isNull, like } from 'drizzle-orm';
import { NO_EQUIPMENT_NEEDED } from './gymRepo';

export function listExercises(
  db: Db,
  opts: { search?: string; limit?: number; availableEquipment?: string[] | null } = {},
): Exercise[] {
  const filters = [isNull(exercises.deletedAt)];
  if (opts.search) filters.push(like(exercises.name, `%${opts.search}%`));
  // Null means "no gym filter", which is not the same as an empty gym: a gym
  // with nothing ticked still offers the bodyweight movements.
  if (opts.availableEquipment) {
    filters.push(inArray(exercises.equipment, [...opts.availableEquipment, ...NO_EQUIPMENT_NEEDED]));
  }

  const query = db.select().from(exercises).where(and(...filters)).orderBy(asc(exercises.name));
  return opts.limit ? query.limit(opts.limit).all() : query.all();
}

export function getExercise(db: Db, id: string): Exercise | undefined {
  return db
    .select()
    .from(exercises)
    .where(and(eq(exercises.id, id), isNull(exercises.deletedAt)))
    .get();
}

export function createCustomExercise(
  db: Db,
  input: { name: string; trackingType: TrackingType; primaryMuscle: string; equipment: string },
): Exercise {
  const timestamp = now();
  const row = {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    name: input.name,
    trackingType: input.trackingType,
    primaryMuscle: input.primaryMuscle,
    secondaryMuscles: [],
    equipment: input.equipment,
    instructions: null,
    isCustom: true,
  };

  db.insert(exercises).values(row).run();
  return row;
}
