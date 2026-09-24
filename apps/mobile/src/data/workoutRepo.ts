import { summariseMuscles } from '@overload/domain';
import {
  exercises,
  newId,
  now,
  workoutExercises,
  workoutSets,
  workouts,
  sessions,
  type Db,
  type Exercise,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
} from '@overload/schema';
import { and, asc, eq, isNotNull, isNull, max } from 'drizzle-orm';

export type WorkoutDetailExercise = {
  workoutExercise: WorkoutExercise;
  exercise: Exercise;
  sessionSets: WorkoutSet[];
};

export type WorkoutDetail = {
  workout: Workout;
  exercises: WorkoutDetailExercise[];
};

export function listWorkouts(db: Db): Workout[] {
  return db
    .select()
    .from(workouts)
    .where(isNull(workouts.deletedAt))
    .orderBy(asc(workouts.orderIndex), asc(workouts.createdAt))
    .all();
}

export function createWorkout(db: Db, name: string): Workout {
  const timestamp = now();
  const highest = db.select({ maxIndex: max(workouts.orderIndex) }).from(workouts).get();
  const row = {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    name,
    notes: null,
    orderIndex: (highest?.maxIndex ?? -1) + 1,
    // Always null: a workout belongs to the library, not to a program. The
    // column survives only because dropping it needs a table rebuild that
    // fails under foreign keys — see the comment on the schema.
    programId: null,
  };
  db.insert(workouts).values(row).run();
  return row;
}

export function softDeleteWorkout(db: Db, workoutId: string): void {
  db.update(workouts).set({ deletedAt: now(), updatedAt: now() }).where(eq(workouts.id, workoutId)).run();
}

export function addExerciseToWorkout(
  db: Db,
  workoutId: string,
  exerciseId: string,
  restSeconds: number | null = null,
): WorkoutExercise {
  const highest = db
    .select({ maxIndex: max(workoutExercises.orderIndex) })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .get();

  const timestamp = now();
  const row = {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    workoutId,
    exerciseId,
    orderIndex: (highest?.maxIndex ?? -1) + 1,
    notes: null,
    restSeconds,
    supersetGroup: null,
  };

  db.insert(workoutExercises).values(row).run();
  return row;
}

export function addWorkoutSet(
  db: Db,
  workoutExerciseId: string,
  values: { targetReps?: number; targetRepsMax?: number; targetWeightKg?: number; targetRir?: number } = {},
): WorkoutSet {
  const highest = db
    .select({ maxIndex: max(workoutSets.orderIndex) })
    .from(workoutSets)
    .where(eq(workoutSets.workoutExerciseId, workoutExerciseId))
    .get();

  const timestamp = now();
  const row = {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    workoutExerciseId,
    orderIndex: (highest?.maxIndex ?? -1) + 1,
    setType: 'normal' as const,
    targetReps: values.targetReps ?? null,
    targetRepsMax: values.targetRepsMax ?? null,
    targetWeightKg: values.targetWeightKg ?? null,
    targetRpe: null,
    targetRir: values.targetRir ?? null,
  };

  db.insert(workoutSets).values(row).run();
  return row;
}

/**
 * Renumbers live rows above every existing index, tombstones included, so a
 * reorder can never produce an index a tombstoned sibling already holds and
 * `max(orderIndex) + 1` stays correct for the next insert.
 */
export function reorderWorkoutExercises(
  db: Db,
  workoutId: string,
  orderedIds: string[],
  at: number,
): void {
  db.transaction((tx) => {
    const highest = tx
      .select({ maxIndex: max(workoutExercises.orderIndex) })
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, workoutId))
      .get();

    const base = (highest?.maxIndex ?? -1) + 1;

    orderedIds.forEach((id, position) => {
      tx.update(workoutExercises)
        .set({ orderIndex: base + position, updatedAt: at })
        .where(and(eq(workoutExercises.id, id), eq(workoutExercises.workoutId, workoutId)))
        .run();
    });
  });
}

export function getWorkoutDetail(db: Db, workoutId: string): WorkoutDetail | undefined {
  const workout = db
    .select()
    .from(workouts)
    .where(and(eq(workouts.id, workoutId), isNull(workouts.deletedAt)))
    .get();

  if (!workout) return undefined;

  const joined = db
    .select({ workoutExercise: workoutExercises, exercise: exercises })
    .from(workoutExercises)
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(
      and(
        eq(workoutExercises.workoutId, workoutId),
        isNull(workoutExercises.deletedAt),
        isNull(exercises.deletedAt),
      ),
    )
    .orderBy(asc(workoutExercises.orderIndex))
    .all();

  const detailExercises = joined.map(({ workoutExercise, exercise }) => ({
    workoutExercise,
    exercise,
    sessionSets: db
      .select()
      .from(workoutSets)
      .where(
        and(
          eq(workoutSets.workoutExerciseId, workoutExercise.id),
          isNull(workoutSets.deletedAt),
        ),
      )
      .orderBy(asc(workoutSets.orderIndex))
      .all(),
  }));

  return { workout, exercises: detailExercises };
}

export type WorkoutSummary = {
  workout: Workout;
  exerciseCount: number;
  lastTrainedAt: number | null;
  primaryMuscles: string[];
  /** In order, for the one-line preview under a workout's name. */
  exerciseNames: string[];
};

/**
 * One grouped read per concern rather than a query per workout. lastPerformance
 * already shows what the per-row loop costs, and it is a known deferred minor.
 *
 * Four levels carry a tombstone filter: workouts, workout_exercises, exercises
 * and sessions. Dropping any one of them silently changes the numbers on the
 * Train screen rather than throwing.
 */
export function listWorkoutSummaries(db: Db): WorkoutSummary[] {
  const live = listWorkouts(db); // already filters workouts.deletedAt

  const entries = db
    .select({
      workoutId: workoutExercises.workoutId,
      orderIndex: workoutExercises.orderIndex,
      primaryMuscle: exercises.primaryMuscle,
      name: exercises.name,
    })
    .from(workoutExercises)
    .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
    .where(and(isNull(workoutExercises.deletedAt), isNull(exercises.deletedAt)))
    .orderBy(asc(workoutExercises.orderIndex))
    .all();

  const lastTrained = db
    .select({ workoutId: sessions.workoutId, lastAt: max(sessions.startedAt) })
    .from(sessions)
    .where(and(isNull(sessions.deletedAt), isNotNull(sessions.endedAt)))
    .groupBy(sessions.workoutId)
    .all();

  const lastByWorkout = new Map(lastTrained.map((r) => [r.workoutId, r.lastAt ?? null]));

  return live.map((workout) => {
    const mine = entries.filter((e) => e.workoutId === workout.id);
    return {
      workout,
      exerciseCount: mine.length,
      lastTrainedAt: lastByWorkout.get(workout.id) ?? null,
      primaryMuscles: summariseMuscles(mine.map((e) => e.primaryMuscle), 3),
      exerciseNames: mine.map((e) => e.name),
    };
  });
}
