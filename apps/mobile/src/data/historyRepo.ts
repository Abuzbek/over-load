import { totalVolumeKg, type CompletedSet } from '@overload/domain';
import {
  exercises,
  sessionSets,
  sessionExercises,
  sessions,
  type Db,
  type Session,
} from '@overload/schema';
import { and, count, countDistinct, desc, eq, gte, isNotNull, isNull, lte } from 'drizzle-orm';
import { toCompletedSet } from './sessionRepo';

export type WorkoutSummary = {
  workout: Session;
  setCount: number;
  volumeKg: number;
};

export function listFinishedWorkouts(db: Db, limit = 50): WorkoutSummary[] {
  const finished = db
    .select()
    .from(sessions)
    .where(and(isNotNull(sessions.endedAt), isNull(sessions.deletedAt)))
    .orderBy(desc(sessions.startedAt))
    .limit(limit)
    .all();

  return finished.map((workout) => {
    const completed: CompletedSet[] = db
      .select({ set: sessionSets, exerciseId: sessionExercises.exerciseId, trackingType: exercises.trackingType })
      .from(sessionSets)
      .innerJoin(sessionExercises, eq(sessionExercises.id, sessionSets.sessionExerciseId))
      // Joining exercises for its tracking type, and for its tombstone:
      // getSessionDetail already drops sessionSets whose exercise definition is
      // deleted, so without this the list summary and the detail screen
      // disagree about the same workout.
      .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
      .where(
        and(
          eq(sessionExercises.sessionId, workout.id),
          isNotNull(sessionSets.completedAt),
          isNull(sessionSets.deletedAt),
          isNull(sessionExercises.deletedAt),
          isNull(exercises.deletedAt),
        ),
      )
      .all()
      .map(({ set, exerciseId, trackingType }) => toCompletedSet(set, exerciseId, trackingType));

    return {
      workout,
      setCount: completed.length,
      volumeKg: totalVolumeKg(completed),
    };
  });
}

export type PeriodTotals = {
  sets: number;
  exercises: number;
  muscles: number;
};

/**
 * One aggregate query, not a loop per row (see lastPerformance in sessionRepo
 * for the known-bad precedent). Four levels carry a tombstone filter here —
 * session_sets, session_exercises, exercises and sessions — the same four
 * listWorkoutSummaries guards; dropping any one silently inflates the count
 * rather than throwing.
 */
export function periodTotals(db: Db, sinceMs: number, untilMs: number): PeriodTotals {
  const row = db
    .select({
      sets: count(sessionSets.id),
      exercises: countDistinct(sessionExercises.exerciseId),
      muscles: countDistinct(exercises.primaryMuscle),
    })
    .from(sessionSets)
    .innerJoin(sessionExercises, eq(sessionExercises.id, sessionSets.sessionExerciseId))
    .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .innerJoin(sessions, eq(sessions.id, sessionExercises.sessionId))
    .where(
      and(
        isNotNull(sessionSets.completedAt),
        gte(sessionSets.completedAt, sinceMs),
        lte(sessionSets.completedAt, untilMs),
        isNull(sessionSets.deletedAt),
        isNull(sessionExercises.deletedAt),
        isNull(exercises.deletedAt),
        isNull(sessions.deletedAt),
      ),
    )
    .get();

  return row ?? { sets: 0, exercises: 0, muscles: 0 };
}
