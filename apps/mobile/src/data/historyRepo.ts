import { totalVolumeKg, type CompletedSet } from '@overload/domain';
import {
  exerciseMuscles,
  exercises,
  lookups,
  sessionSets,
  sessionExercises,
  sessions,
  type Db,
  type Session,
} from '@overload/schema';
import { and, asc, count, countDistinct, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, sql } from 'drizzle-orm';
import { getActiveProgram, getProgramDays } from './programRepo';
import { toCompletedSet } from './sessionRepo';
import { getWorkoutDetail } from './workoutRepo';

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
        // A warm-up is not training volume, and a drop or myo round is part of its set.
        ne(sessionSets.setType, 'warmup'),
        isNull(sessionSets.parentSetId),
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
 * Aggregate queries, not a loop per row (see lastPerformance in sessionRepo
 * for the known-bad precedent): one for sets and exercises, one for muscles. Four levels carry a tombstone filter here —
 * session_sets, session_exercises, exercises and sessions — the same four
 * listWorkoutSummaries guards; dropping any one silently inflates the count
 * rather than throwing. `workoutIds` narrows it to sessions of those workouts.
 */
export function periodTotals(db: Db, sinceMs: number, untilMs: number, workoutIds?: string[]): PeriodTotals {
  const row = db
    .select({
      sets: count(sessionSets.id),
      exercises: countDistinct(sessionExercises.exerciseId),
    })
    .from(sessionSets)
    .innerJoin(sessionExercises, eq(sessionExercises.id, sessionSets.sessionExerciseId))
    .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .innerJoin(sessions, eq(sessions.id, sessionExercises.sessionId))
    .where(
      and(
        isNotNull(sessionSets.completedAt),
        // A warm-up is not training volume, and a drop or myo round is part of its set.
        ne(sessionSets.setType, 'warmup'),
        isNull(sessionSets.parentSetId),
        gte(sessionSets.completedAt, sinceMs),
        lte(sessionSets.completedAt, untilMs),
        isNull(sessionSets.deletedAt),
        isNull(sessionExercises.deletedAt),
        isNull(exercises.deletedAt),
        isNull(sessions.deletedAt),
        workoutIds ? inArray(sessions.workoutId, workoutIds) : undefined,
      ),
    )
    .get();

  // Every muscle a set trains, supporting ones too: a squat works the glutes and
  // adductors as well as the quads. A separate query: joined above, one set
  // would count once per muscle.
  const muscles = db
    .select({ n: countDistinct(exerciseMuscles.muscleId) })
    .from(sessionSets)
    .innerJoin(sessionExercises, eq(sessionExercises.id, sessionSets.sessionExerciseId))
    .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .innerJoin(sessions, eq(sessions.id, sessionExercises.sessionId))
    .innerJoin(exerciseMuscles, eq(exerciseMuscles.exerciseId, exercises.id))
    .where(
      and(
        isNotNull(sessionSets.completedAt),
        ne(sessionSets.setType, 'warmup'),
        isNull(sessionSets.parentSetId),
        gte(sessionSets.completedAt, sinceMs),
        lte(sessionSets.completedAt, untilMs),
        isNull(sessionSets.deletedAt),
        isNull(sessionExercises.deletedAt),
        isNull(exercises.deletedAt),
        isNull(sessions.deletedAt),
        workoutIds ? inArray(sessions.workoutId, workoutIds) : undefined,
      ),
    )
    .get()?.n ?? 0;

  return { sets: row?.sets ?? 0, exercises: row?.exercises ?? 0, muscles };
}

/**
 * What the active program plans for one cycle: every set of every training
 * day (a workout on two days counts twice), and the distinct exercises and
 * muscles among them — the dashboard's weekly targets. Null with no active
 * program or one with nothing planned.
 */
export function programWeekTargets(db: Db): (PeriodTotals & { workoutIds: string[] }) | null {
  const program = getActiveProgram(db);
  if (!program) return null;
  const details = getProgramDays(db, program.id).flatMap((d) => (d.workout ? [getWorkoutDetail(db, d.workout.id)] : []));
  const planned = details.flatMap((d) => d?.exercises ?? []);
  if (planned.length === 0) return null;
  return {
    sets: planned.reduce((n, e) => n + e.sessionSets.length, 0),
    exercises: new Set(planned.map((e) => e.exercise.id)).size,
    // Every muscle the week trains, supporting ones too — as periodTotals counts them.
    muscles: new Set(
      db
        .select({ id: exerciseMuscles.muscleId })
        .from(exerciseMuscles)
        .where(inArray(exerciseMuscles.exerciseId, [...new Set(planned.map((e) => e.exercise.id))]))
        .all()
        .map((r) => r.id),
    ).size,
    workoutIds: [...new Set(details.map((d) => d!.workout.id))],
  };
}

export type MuscleLoad = { muscle: string; sets: number };

/**
 * Sets per muscle in a window, for the heatmap.
 *
 * **Sets, not kilograms.** Volume in kg is only defined for weight_reps; a
 * plank and a 5 km row would both score zero and the heatmap would call your
 * core and your legs untrained. Fractional set counting works across every
 * tracking type.
 *
 * A secondary muscle counts half. Ignoring them entirely makes a squat look
 * like a quads-only movement, and counting them fully makes every compound
 * light up the whole body.
 *
 * Four joined levels, four tombstone filters — sets, session_exercises,
 * exercises and sessions — the same four periodTotals guards.
 */
export function muscleLoad(db: Db, sinceMs: number, untilMs: number): MuscleLoad[] {
  const sets = sql<number>`sum(${exerciseMuscles.weight})`;
  return db
    .select({ muscle: lookups.name, sets })
    .from(sessionSets)
    .innerJoin(sessionExercises, eq(sessionExercises.id, sessionSets.sessionExerciseId))
    .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .innerJoin(sessions, eq(sessions.id, sessionExercises.sessionId))
    // No tombstone on these two: exercise_muscles and lookups are derived
    // catalogue tables, reached only through the live exercise above.
    .innerJoin(exerciseMuscles, eq(exerciseMuscles.exerciseId, exercises.id))
    .innerJoin(lookups, eq(lookups.id, exerciseMuscles.muscleId))
    .where(
      and(
        isNotNull(sessionSets.completedAt),
        // A warm-up is not training volume, and a drop or myo round is part of its set.
        ne(sessionSets.setType, 'warmup'),
        isNull(sessionSets.parentSetId),
        gte(sessionSets.completedAt, sinceMs),
        lte(sessionSets.completedAt, untilMs),
        isNull(sessionSets.deletedAt),
        isNull(sessionExercises.deletedAt),
        isNull(exercises.deletedAt),
        isNull(sessions.deletedAt),
      ),
    )
    .groupBy(lookups.id)
    .orderBy(desc(sets), asc(lookups.name))
    .all();
}
