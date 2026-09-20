import {
  exercises,
  newId,
  now,
  type Db,
  type Exercise,
  type TrackingType,
} from '@overload/schema';
import { and, asc, eq, isNull, like } from 'drizzle-orm';

export function listExercises(
  db: Db,
  opts: { search?: string; limit?: number } = {},
): Exercise[] {
  const filters = [isNull(exercises.deletedAt)];
  if (opts.search) filters.push(like(exercises.name, `%${opts.search}%`));

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
