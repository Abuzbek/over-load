import {
  exercises,
  newId,
  now,
  routineExercises,
  routineSets,
  routines,
  type Db,
  type Exercise,
  type Routine,
  type RoutineExercise,
  type RoutineSet,
} from '@workouts/schema';
import { and, asc, eq, isNull } from 'drizzle-orm';

export type RoutineDetailExercise = {
  routineExercise: RoutineExercise;
  exercise: Exercise;
  sets: RoutineSet[];
};

export type RoutineDetail = {
  routine: Routine;
  exercises: RoutineDetailExercise[];
};

export function listRoutines(db: Db): Routine[] {
  return db
    .select()
    .from(routines)
    .where(isNull(routines.deletedAt))
    .orderBy(asc(routines.orderIndex), asc(routines.createdAt))
    .all();
}

export function createRoutine(db: Db, name: string): Routine {
  const timestamp = now();
  const row = {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    name,
    notes: null,
    orderIndex: listRoutines(db).length,
  };
  db.insert(routines).values(row).run();
  return row;
}

export function softDeleteRoutine(db: Db, routineId: string): void {
  db.update(routines).set({ deletedAt: now(), updatedAt: now() }).where(eq(routines.id, routineId)).run();
}

export function addExerciseToRoutine(
  db: Db,
  routineId: string,
  exerciseId: string,
): RoutineExercise {
  const siblings = db
    .select()
    .from(routineExercises)
    .where(and(eq(routineExercises.routineId, routineId), isNull(routineExercises.deletedAt)))
    .all();

  const timestamp = now();
  const row = {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    routineId,
    exerciseId,
    orderIndex: siblings.length,
    notes: null,
    restSeconds: null,
    supersetGroup: null,
  };

  db.insert(routineExercises).values(row).run();
  return row;
}

export function addRoutineSet(
  db: Db,
  routineExerciseId: string,
  values: { targetReps?: number; targetWeightKg?: number } = {},
): RoutineSet {
  const siblings = db
    .select()
    .from(routineSets)
    .where(and(eq(routineSets.routineExerciseId, routineExerciseId), isNull(routineSets.deletedAt)))
    .all();

  const timestamp = now();
  const row = {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    routineExerciseId,
    orderIndex: siblings.length,
    setType: 'normal' as const,
    targetReps: values.targetReps ?? null,
    targetWeightKg: values.targetWeightKg ?? null,
    targetRpe: null,
  };

  db.insert(routineSets).values(row).run();
  return row;
}

export function getRoutineDetail(db: Db, routineId: string): RoutineDetail | undefined {
  const routine = db
    .select()
    .from(routines)
    .where(and(eq(routines.id, routineId), isNull(routines.deletedAt)))
    .get();

  if (!routine) return undefined;

  const joined = db
    .select({ routineExercise: routineExercises, exercise: exercises })
    .from(routineExercises)
    .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
    .where(and(eq(routineExercises.routineId, routineId), isNull(routineExercises.deletedAt)))
    .orderBy(asc(routineExercises.orderIndex))
    .all();

  const detailExercises = joined.map(({ routineExercise, exercise }) => ({
    routineExercise,
    exercise,
    sets: db
      .select()
      .from(routineSets)
      .where(
        and(
          eq(routineSets.routineExerciseId, routineExercise.id),
          isNull(routineSets.deletedAt),
        ),
      )
      .orderBy(asc(routineSets.orderIndex))
      .all(),
  }));

  return { routine, exercises: detailExercises };
}
