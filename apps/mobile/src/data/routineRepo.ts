import { summariseMuscles } from '@overload/domain';
import {
  exercises,
  newId,
  now,
  routineExercises,
  routineSets,
  routines,
  workouts,
  type Db,
  type Exercise,
  type Routine,
  type RoutineExercise,
  type RoutineSet,
} from '@overload/schema';
import { and, asc, eq, isNotNull, isNull, max } from 'drizzle-orm';

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
  const highest = db.select({ maxIndex: max(routines.orderIndex) }).from(routines).get();
  const row = {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    name,
    notes: null,
    orderIndex: (highest?.maxIndex ?? -1) + 1,
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
  const highest = db
    .select({ maxIndex: max(routineExercises.orderIndex) })
    .from(routineExercises)
    .where(eq(routineExercises.routineId, routineId))
    .get();

  const timestamp = now();
  const row = {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    routineId,
    exerciseId,
    orderIndex: (highest?.maxIndex ?? -1) + 1,
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
  const highest = db
    .select({ maxIndex: max(routineSets.orderIndex) })
    .from(routineSets)
    .where(eq(routineSets.routineExerciseId, routineExerciseId))
    .get();

  const timestamp = now();
  const row = {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    routineExerciseId,
    orderIndex: (highest?.maxIndex ?? -1) + 1,
    setType: 'normal' as const,
    targetReps: values.targetReps ?? null,
    targetWeightKg: values.targetWeightKg ?? null,
    targetRpe: null,
  };

  db.insert(routineSets).values(row).run();
  return row;
}

/**
 * Renumbers live rows above every existing index, tombstones included, so a
 * reorder can never produce an index a tombstoned sibling already holds and
 * `max(orderIndex) + 1` stays correct for the next insert.
 */
export function reorderRoutineExercises(
  db: Db,
  routineId: string,
  orderedIds: string[],
  at: number,
): void {
  db.transaction((tx) => {
    const highest = tx
      .select({ maxIndex: max(routineExercises.orderIndex) })
      .from(routineExercises)
      .where(eq(routineExercises.routineId, routineId))
      .get();

    const base = (highest?.maxIndex ?? -1) + 1;

    orderedIds.forEach((id, position) => {
      tx.update(routineExercises)
        .set({ orderIndex: base + position, updatedAt: at })
        .where(and(eq(routineExercises.id, id), eq(routineExercises.routineId, routineId)))
        .run();
    });
  });
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
    .where(
      and(
        eq(routineExercises.routineId, routineId),
        isNull(routineExercises.deletedAt),
        isNull(exercises.deletedAt),
      ),
    )
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

export type RoutineSummary = {
  routine: Routine;
  exerciseCount: number;
  lastTrainedAt: number | null;
  primaryMuscles: string[];
};

/**
 * One grouped read per concern rather than a query per routine. lastPerformance
 * already shows what the per-row loop costs, and it is a known deferred minor.
 *
 * Four levels carry a tombstone filter: routines, routine_exercises, exercises
 * and workouts. Dropping any one of them silently changes the numbers on the
 * Train screen rather than throwing.
 */
export function listRoutineSummaries(db: Db): RoutineSummary[] {
  const live = listRoutines(db); // already filters routines.deletedAt

  const entries = db
    .select({
      routineId: routineExercises.routineId,
      orderIndex: routineExercises.orderIndex,
      primaryMuscle: exercises.primaryMuscle,
    })
    .from(routineExercises)
    .innerJoin(exercises, eq(routineExercises.exerciseId, exercises.id))
    .where(and(isNull(routineExercises.deletedAt), isNull(exercises.deletedAt)))
    .orderBy(asc(routineExercises.orderIndex))
    .all();

  const lastTrained = db
    .select({ routineId: workouts.routineId, lastAt: max(workouts.startedAt) })
    .from(workouts)
    .where(and(isNull(workouts.deletedAt), isNotNull(workouts.endedAt)))
    .groupBy(workouts.routineId)
    .all();

  const lastByRoutine = new Map(lastTrained.map((r) => [r.routineId, r.lastAt ?? null]));

  return live.map((routine) => {
    const mine = entries.filter((e) => e.routineId === routine.id);
    return {
      routine,
      exerciseCount: mine.length,
      lastTrainedAt: lastByRoutine.get(routine.id) ?? null,
      primaryMuscles: summariseMuscles(mine.map((e) => e.primaryMuscle), 3),
    };
  });
}
