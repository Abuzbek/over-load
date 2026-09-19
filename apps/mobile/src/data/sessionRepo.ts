import {
  exercises,
  newId,
  now,
  sets,
  workoutExercises,
  workouts,
  type Db,
  type Exercise,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
} from '@workouts/schema';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { getRoutineDetail } from './routineRepo';

export type WorkoutDetailExercise = {
  workoutExercise: WorkoutExercise;
  exercise: Exercise;
  sets: WorkoutSet[];
};

export type WorkoutDetail = {
  workout: Workout;
  exercises: WorkoutDetailExercise[];
};

function timestamps(at: number) {
  return { createdAt: at, updatedAt: at, deletedAt: null };
}

/**
 * Copies the routine into a fresh workout tree. Targets become pre-filled
 * values on planned sets, so the lifter edits a number rather than typing one.
 */
export function startWorkoutFromRoutine(db: Db, routineId: string, at: number): string {
  const detail = getRoutineDetail(db, routineId);
  if (!detail) throw new Error(`Routine not found: ${routineId}`);

  const workoutId = newId();

  db.transaction((tx) => {
    tx.insert(workouts).values({
      id: workoutId,
      ...timestamps(at),
      routineId,
      name: detail.routine.name,
      startedAt: at,
      endedAt: null,
      notes: null,
    }).run();

    for (const entry of detail.exercises) {
      const workoutExerciseId = newId();

      tx.insert(workoutExercises).values({
        id: workoutExerciseId,
        ...timestamps(at),
        workoutId,
        exerciseId: entry.exercise.id,
        orderIndex: entry.routineExercise.orderIndex,
        notes: entry.routineExercise.notes,
        restSeconds: entry.routineExercise.restSeconds,
        supersetGroup: entry.routineExercise.supersetGroup,
      }).run();

      for (const plannedSet of entry.sets) {
        tx.insert(sets).values({
          id: newId(),
          ...timestamps(at),
          workoutExerciseId,
          orderIndex: plannedSet.orderIndex,
          setType: plannedSet.setType,
          weightKg: plannedSet.targetWeightKg,
          reps: plannedSet.targetReps,
          durationSeconds: null,
          distanceM: null,
          rpe: null,
          rir: null,
          completedAt: null,
        }).run();
      }
    }
  });

  return workoutId;
}

export function startEmptyWorkout(db: Db, name: string, at: number): string {
  const workoutId = newId();
  db.insert(workouts).values({
    id: workoutId,
    ...timestamps(at),
    routineId: null,
    name,
    startedAt: at,
    endedAt: null,
    notes: null,
  }).run();
  return workoutId;
}

/** A workout with no endedAt is in progress. This is what powers crash recovery. */
export function getActiveWorkoutId(db: Db): string | undefined {
  return db
    .select({ id: workouts.id })
    .from(workouts)
    .where(and(isNull(workouts.endedAt), isNull(workouts.deletedAt)))
    .orderBy(desc(workouts.startedAt))
    .get()?.id;
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
    sets: db
      .select()
      .from(sets)
      .where(and(eq(sets.workoutExerciseId, workoutExercise.id), isNull(sets.deletedAt)))
      .orderBy(asc(sets.orderIndex))
      .all(),
  }));

  return { workout, exercises: detailExercises };
}
