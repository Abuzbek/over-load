import { computePersonalRecords, type CompletedSet, type PersonalRecordType } from '@overload/domain';
import {
  exercises,
  newId,
  now,
  personalRecords,
  sessionSets,
  sessionExercises,
  sessions,
  type Db,
  type Exercise,
  type PersonalRecordRow,
  type TrackingType,
  type Session,
  type SessionExercise,
  type SessionSet,
} from '@overload/schema';
import { and, asc, desc, eq, inArray, isNotNull, isNull, max } from 'drizzle-orm';
import { markDayDoneForWorkout } from './programRepo';
import { getWorkoutDetail } from './workoutRepo';

export type WorkoutDetailExercise = {
  sessionExercise: SessionExercise;
  exercise: Exercise;
  sessionSets: SessionSet[];
};

export type SessionDetail = {
  workout: Session;
  exercises: WorkoutDetailExercise[];
};

function timestamps(at: number) {
  return { createdAt: at, updatedAt: at, deletedAt: null };
}

/**
 * Copies the workout into a fresh workout tree. Targets become pre-filled
 * values on planned sessionSets, so the lifter edits a number rather than typing one.
 */
export function startSessionFromWorkout(db: Db, workoutId: string, at: number): string {
  const detail = getWorkoutDetail(db, workoutId);
  if (!detail) throw new Error(`Workout not found: ${workoutId}`);

  const sessionId = newId();

  db.transaction((tx) => {
    tx.insert(sessions).values({
      id: sessionId,
      ...timestamps(at),
      workoutId,
      name: detail.workout.name,
      startedAt: at,
      endedAt: null,
      notes: null,
    }).run();

    for (const entry of detail.exercises) {
      const sessionExerciseId = newId();

      tx.insert(sessionExercises).values({
        id: sessionExerciseId,
        ...timestamps(at),
        sessionId,
        exerciseId: entry.exercise.id,
        orderIndex: entry.workoutExercise.orderIndex,
        notes: entry.workoutExercise.notes,
        restSeconds: entry.workoutExercise.restSeconds,
        supersetGroup: entry.workoutExercise.supersetGroup,
      }).run();

      for (const plannedSet of entry.sessionSets) {
        tx.insert(sessionSets).values({
          id: newId(),
          ...timestamps(at),
          sessionExerciseId,
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

  return sessionId;
}

/** A workout with no endedAt is in progress. This is what powers crash recovery. */
export function getActiveSessionId(db: Db): string | undefined {
  return db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(isNull(sessions.endedAt), isNull(sessions.deletedAt)))
    .orderBy(desc(sessions.startedAt))
    .get()?.id;
}

/**
 * The row, not just the id — the in-progress bar needs name and startedAt.
 * Same predicate as getActiveSessionId so the two can never disagree about
 * which workout is active.
 */
export function getActiveSession(db: Db): Session | undefined {
  return db
    .select()
    .from(sessions)
    .where(and(isNull(sessions.deletedAt), isNull(sessions.endedAt)))
    .orderBy(desc(sessions.startedAt))
    .limit(1)
    .get();
}

/**
 * Tombstones an unfinished workout the lifter chose to throw away. Without
 * this, starting a second workout strands the first: it has no endedAt so
 * history never lists it, and getActiveSessionId only ever returns the newest.
 * The workout row alone is tombstoned — every read of its exercises and sessionSets
 * joins through it, so they go with it.
 */
export function discardSession(db: Db, sessionId: string, at: number): void {
  db
    .update(sessions)
    .set({ deletedAt: at, updatedAt: at })
    .where(eq(sessions.id, sessionId))
    .run();
}

export function getSessionDetail(db: Db, sessionId: string): SessionDetail | undefined {
  const workout = db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), isNull(sessions.deletedAt)))
    .get();

  if (!workout) return undefined;

  const joined = db
    .select({ sessionExercise: sessionExercises, exercise: exercises })
    .from(sessionExercises)
    .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .where(
      and(
        eq(sessionExercises.sessionId, sessionId),
        isNull(sessionExercises.deletedAt),
        isNull(exercises.deletedAt),
      ),
    )
    .orderBy(asc(sessionExercises.orderIndex))
    .all();

  const detailExercises = joined.map(({ sessionExercise, exercise }) => ({
    sessionExercise,
    exercise,
    sessionSets: db
      .select()
      .from(sessionSets)
      .where(and(eq(sessionSets.sessionExerciseId, sessionExercise.id), isNull(sessionSets.deletedAt)))
      .orderBy(asc(sessionSets.orderIndex))
      .all(),
  }));

  return { workout, exercises: detailExercises };
}

export type SetValues = {
  weightKg?: number | null;
  reps?: number | null;
  durationSeconds?: number | null;
  distanceM?: number | null;
  rpe?: number | null;
  rir?: number | null;
};

export function addExerciseToSession(
  db: Db,
  sessionId: string,
  exerciseId: string,
  at: number,
): SessionExercise {
  // max(orderIndex) + 1 over ALL rows (including tombstoned), not a count of
  // live siblings — a count collides with an existing index after a soft-delete.
  const highest = db
    .select({ maxIndex: max(sessionExercises.orderIndex) })
    .from(sessionExercises)
    .where(eq(sessionExercises.sessionId, sessionId))
    .get();

  const row = {
    id: newId(),
    ...timestamps(at),
    sessionId,
    exerciseId,
    orderIndex: (highest?.maxIndex ?? -1) + 1,
    notes: null,
    restSeconds: null,
    supersetGroup: null,
  };

  db.insert(sessionExercises).values(row).run();
  return row;
}

export function addSet(db: Db, sessionExerciseId: string, at: number): SessionSet {
  // Same max-based indexing as above, for the same reason.
  const highest = db
    .select({ maxIndex: max(sessionSets.orderIndex) })
    .from(sessionSets)
    .where(eq(sessionSets.sessionExerciseId, sessionExerciseId))
    .get();

  const previous = db
    .select()
    .from(sessionSets)
    .where(and(eq(sessionSets.sessionExerciseId, sessionExerciseId), isNull(sessionSets.deletedAt)))
    .orderBy(desc(sessionSets.orderIndex))
    .get();

  const row = {
    id: newId(),
    ...timestamps(at),
    sessionExerciseId,
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

  db.insert(sessionSets).values(row).run();
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
  const patch: Partial<typeof sessionSets.$inferInsert> = { completedAt: at, updatedAt: at };
  if (values.weightKg !== undefined) patch.weightKg = values.weightKg;
  if (values.reps !== undefined) patch.reps = values.reps;
  if (values.durationSeconds !== undefined) patch.durationSeconds = values.durationSeconds;
  if (values.distanceM !== undefined) patch.distanceM = values.distanceM;
  if (values.rpe !== undefined) patch.rpe = values.rpe;
  if (values.rir !== undefined) patch.rir = values.rir;
  db.update(sessionSets).set(patch).where(eq(sessionSets.id, setId)).run();
}

export function uncompleteSet(db: Db, setId: string): void {
  db.update(sessionSets).set({ completedAt: null, updatedAt: now() }).where(eq(sessionSets.id, setId)).run();
}

export function toCompletedSet(
  row: SessionSet,
  exerciseId: string,
  trackingType: TrackingType,
): CompletedSet {
  return {
    id: row.id,
    exerciseId,
    trackingType,
    setType: row.setType,
    weightKg: row.weightKg,
    reps: row.reps,
    durationSeconds: row.durationSeconds,
    distanceM: row.distanceM,
    completedAt: row.completedAt!,
  };
}

/** Completed sessionSets for this exercise from the most recent workout that is not the current one. */
export function lastPerformance(
  db: Db,
  exerciseId: string,
  excludeSessionId: string,
): CompletedSet[] {
  const previousSession = db
    .select({ sessionId: sessions.id })
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
    .orderBy(desc(sessions.startedAt))
    .all()
    .find((row) => row.sessionId !== excludeSessionId);

  if (!previousSession) return [];

  return db
    .select({ set: sessionSets, trackingType: exercises.trackingType })
    .from(sessionSets)
    .innerJoin(sessionExercises, eq(sessionExercises.id, sessionSets.sessionExerciseId))
    .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .where(
      and(
        eq(sessionExercises.sessionId, previousSession.sessionId),
        eq(sessionExercises.exerciseId, exerciseId),
        isNotNull(sessionSets.completedAt),
        isNull(sessionSets.deletedAt),
        isNull(sessionExercises.deletedAt),
        isNull(exercises.deletedAt),
      ),
    )
    .orderBy(asc(sessionSets.orderIndex))
    .all()
    .map(({ set, trackingType }) => toCompletedSet(set, exerciseId, trackingType));
}

/** Completed sessionSets for a single exercise across all history, most-recent tombstones excluded. */
export function completedSetsForExercise(db: Db, exerciseId: string): CompletedSet[] {
  return allCompletedSets(db, [exerciseId]);
}

function allCompletedSets(db: Db, exerciseIds: string[]): CompletedSet[] {
  if (exerciseIds.length === 0) return [];

  return db
    .select({ set: sessionSets, exerciseId: sessionExercises.exerciseId, trackingType: exercises.trackingType })
    .from(sessionSets)
    .innerJoin(sessionExercises, eq(sessionExercises.id, sessionSets.sessionExerciseId))
    .innerJoin(sessions, eq(sessions.id, sessionExercises.sessionId))
    .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .where(
      and(
        inArray(sessionExercises.exerciseId, exerciseIds),
        isNotNull(sessionSets.completedAt),
        isNull(sessionSets.deletedAt),
        isNull(sessionExercises.deletedAt),
        isNull(sessions.deletedAt),
        isNull(exercises.deletedAt),
      ),
    )
    .all()
    .map(({ set, exerciseId, trackingType }) => toCompletedSet(set, exerciseId, trackingType));
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

/**
 * Recomputes every exercise's records from `sessionSets`. personal_records is a derived
 * cache, so this is always safe; it exists so installs written before metrics
 * were gated by tracking type drop records that can no longer occur.
 */
export function rebuildAllPersonalRecords(db: Db): void {
  const ids = db
    .selectDistinct({ exerciseId: sessionExercises.exerciseId })
    .from(sessionExercises)
    .where(isNull(sessionExercises.deletedAt))
    .all()
    .map((row) => row.exerciseId);

  recomputePersonalRecords(db, ids);
}

export function finishSession(db: Db, sessionId: string, at: number): void {
  db.update(sessions).set({ endedAt: at, updatedAt: at }).where(eq(sessions.id, sessionId)).run();

  // Finishing a workout ticks off the program day it came from, so the user
  // does not have to check the box by hand. An empty or ad-hoc workout has no
  // workoutId and ticks nothing.
  const workoutId = db
    .select({ workoutId: sessions.workoutId })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get()?.workoutId;
  if (workoutId) markDayDoneForWorkout(db, workoutId, at);

  const touched = db
    .selectDistinct({ exerciseId: sessionExercises.exerciseId })
    .from(sessionExercises)
    .where(and(eq(sessionExercises.sessionId, sessionId), isNull(sessionExercises.deletedAt)))
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

export type PersonalRecordSummary = {
  exerciseName: string;
  type: PersonalRecordType;
  value: number;
  achievedAt: number;
};

/**
 * Every current record, across every exercise, for the records screen.
 * `personal_records` has no `deleted_at` of its own — it is a derived cache —
 * so a tombstoned exercise's records only disappear here because this join
 * filters `exercises.deletedAt`. Dropping that filter would surface records
 * for exercises the lifter deleted.
 */
export function listAllPersonalRecords(db: Db): PersonalRecordSummary[] {
  return db
    .select({
      exerciseName: exercises.name,
      type: personalRecords.type,
      value: personalRecords.value,
      achievedAt: personalRecords.achievedAt,
    })
    .from(personalRecords)
    .innerJoin(exercises, eq(exercises.id, personalRecords.exerciseId))
    .where(isNull(exercises.deletedAt))
    .orderBy(asc(exercises.name), asc(personalRecords.type))
    .all()
    .map((row) => ({ ...row, type: row.type as PersonalRecordType }));
}
