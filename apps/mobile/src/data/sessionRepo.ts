import { computePersonalRecords, type CompletedSet } from '@workouts/domain';
import {
  exercises,
  newId,
  now,
  personalRecords,
  sets,
  workoutExercises,
  workouts,
  type Db,
  type Exercise,
  type PersonalRecordRow,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
} from '@workouts/schema';
import { and, asc, desc, eq, inArray, isNotNull, isNull, max } from 'drizzle-orm';
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

/**
 * Tombstones an unfinished workout the lifter chose to throw away. Without
 * this, starting a second workout strands the first: it has no endedAt so
 * history never lists it, and getActiveWorkoutId only ever returns the newest.
 * The workout row alone is tombstoned — every read of its exercises and sets
 * joins through it, so they go with it.
 */
export function discardWorkout(db: Db, workoutId: string, at: number): void {
  db
    .update(workouts)
    .set({ deletedAt: at, updatedAt: at })
    .where(eq(workouts.id, workoutId))
    .run();
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

export type SetValues = {
  weightKg?: number | null;
  reps?: number | null;
  durationSeconds?: number | null;
  rpe?: number | null;
  rir?: number | null;
};

export function addExerciseToWorkout(
  db: Db,
  workoutId: string,
  exerciseId: string,
  at: number,
): WorkoutExercise {
  // max(orderIndex) + 1 over ALL rows (including tombstoned), not a count of
  // live siblings — a count collides with an existing index after a soft-delete.
  const highest = db
    .select({ maxIndex: max(workoutExercises.orderIndex) })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .get();

  const row = {
    id: newId(),
    ...timestamps(at),
    workoutId,
    exerciseId,
    orderIndex: (highest?.maxIndex ?? -1) + 1,
    notes: null,
    restSeconds: null,
    supersetGroup: null,
  };

  db.insert(workoutExercises).values(row).run();
  return row;
}

export function addSet(db: Db, workoutExerciseId: string, at: number): WorkoutSet {
  // Same max-based indexing as above, for the same reason.
  const highest = db
    .select({ maxIndex: max(sets.orderIndex) })
    .from(sets)
    .where(eq(sets.workoutExerciseId, workoutExerciseId))
    .get();

  const previous = db
    .select()
    .from(sets)
    .where(and(eq(sets.workoutExerciseId, workoutExerciseId), isNull(sets.deletedAt)))
    .orderBy(desc(sets.orderIndex))
    .get();

  const row = {
    id: newId(),
    ...timestamps(at),
    workoutExerciseId,
    orderIndex: (highest?.maxIndex ?? -1) + 1,
    setType: 'normal' as const,
    // Carry the last set's load forward — almost always what the next set uses.
    weightKg: previous?.weightKg ?? null,
    reps: previous?.reps ?? null,
    durationSeconds: null,
    distanceM: null,
    rpe: null,
    rir: null,
    completedAt: null,
  };

  db.insert(sets).values(row).run();
  return row;
}

/**
 * Writes through immediately — this is the whole crash-safety story. Omitted
 * fields are left as they are so a partial edit never blanks a logged value.
 */
export function completeSet(db: Db, setId: string, values: SetValues, at: number): void {
  // Typed against the schema, so renaming a column fails to compile here rather
  // than silently writing nothing. Each field is assigned only when present, so
  // an omitted key leaves the stored value alone while an explicit null clears it.
  const patch: Partial<typeof sets.$inferInsert> = { completedAt: at, updatedAt: at };
  if (values.weightKg !== undefined) patch.weightKg = values.weightKg;
  if (values.reps !== undefined) patch.reps = values.reps;
  if (values.durationSeconds !== undefined) patch.durationSeconds = values.durationSeconds;
  if (values.rpe !== undefined) patch.rpe = values.rpe;
  if (values.rir !== undefined) patch.rir = values.rir;
  db.update(sets).set(patch).where(eq(sets.id, setId)).run();
}

export function uncompleteSet(db: Db, setId: string): void {
  db.update(sets).set({ completedAt: null, updatedAt: now() }).where(eq(sets.id, setId)).run();
}

export function toCompletedSet(row: WorkoutSet, exerciseId: string): CompletedSet {
  return {
    id: row.id,
    exerciseId,
    setType: row.setType,
    weightKg: row.weightKg,
    reps: row.reps,
    durationSeconds: row.durationSeconds,
    completedAt: row.completedAt!,
  };
}

/** Completed sets for this exercise from the most recent workout that is not the current one. */
export function lastPerformance(
  db: Db,
  exerciseId: string,
  excludeWorkoutId: string,
): CompletedSet[] {
  const previousWorkout = db
    .select({ workoutId: workouts.id })
    .from(sets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(
      and(
        eq(workoutExercises.exerciseId, exerciseId),
        isNotNull(sets.completedAt),
        isNull(sets.deletedAt),
        isNull(workoutExercises.deletedAt),
        isNull(workouts.deletedAt),
      ),
    )
    .orderBy(desc(workouts.startedAt))
    .all()
    .find((row) => row.workoutId !== excludeWorkoutId);

  if (!previousWorkout) return [];

  return db
    .select({ set: sets })
    .from(sets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
    .where(
      and(
        eq(workoutExercises.workoutId, previousWorkout.workoutId),
        eq(workoutExercises.exerciseId, exerciseId),
        isNotNull(sets.completedAt),
        isNull(sets.deletedAt),
        isNull(workoutExercises.deletedAt),
      ),
    )
    .orderBy(asc(sets.orderIndex))
    .all()
    .map(({ set }) => toCompletedSet(set, exerciseId));
}

function allCompletedSets(db: Db, exerciseIds: string[]): CompletedSet[] {
  if (exerciseIds.length === 0) return [];

  return db
    .select({ set: sets, exerciseId: workoutExercises.exerciseId })
    .from(sets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(
      and(
        inArray(workoutExercises.exerciseId, exerciseIds),
        isNotNull(sets.completedAt),
        isNull(sets.deletedAt),
        isNull(workoutExercises.deletedAt),
        isNull(workouts.deletedAt),
      ),
    )
    .all()
    .map(({ set, exerciseId }) => toCompletedSet(set, exerciseId));
}

/**
 * Rebuilds the derived record cache for the given exercises. Deletes first —
 * this is a cache, so stale rows must never survive a recompute. `personal_records`
 * has no `deleted_at` column and is never synced, so a hard delete here is correct
 * and required, not a tombstone violation.
 */
function recomputePersonalRecords(db: Db, exerciseIds: string[]): void {
  if (exerciseIds.length === 0) return;

  const records = computePersonalRecords(allCompletedSets(db, exerciseIds));

  db.transaction((tx) => {
    tx.delete(personalRecords).where(inArray(personalRecords.exerciseId, exerciseIds)).run();
    if (records.length === 0) return;
    tx.insert(personalRecords).values(
      records.map((record) => ({
        id: newId(),
        exerciseId: record.exerciseId,
        type: record.type,
        value: record.value,
        setId: record.setId,
        achievedAt: record.achievedAt,
      })),
    ).run();
  });
}

export function finishWorkout(db: Db, workoutId: string, at: number): void {
  db.update(workouts).set({ endedAt: at, updatedAt: at }).where(eq(workouts.id, workoutId)).run();

  const touched = db
    .selectDistinct({ exerciseId: workoutExercises.exerciseId })
    .from(workoutExercises)
    .where(and(eq(workoutExercises.workoutId, workoutId), isNull(workoutExercises.deletedAt)))
    .all()
    .map((row) => row.exerciseId);

  recomputePersonalRecords(db, touched);
}

export function listPersonalRecords(db: Db, exerciseId: string): PersonalRecordRow[] {
  return db
    .select()
    .from(personalRecords)
    .where(eq(personalRecords.exerciseId, exerciseId))
    .all();
}
