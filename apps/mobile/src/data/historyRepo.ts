import { totalVolumeKg, type CompletedSet } from '@overload/domain';
import {
  exercises,
  sets,
  workoutExercises,
  workouts,
  type Db,
  type Workout,
} from '@overload/schema';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { toCompletedSet } from './sessionRepo';

export type WorkoutSummary = {
  workout: Workout;
  setCount: number;
  volumeKg: number;
};

export function listFinishedWorkouts(db: Db, limit = 50): WorkoutSummary[] {
  const finished = db
    .select()
    .from(workouts)
    .where(and(isNotNull(workouts.endedAt), isNull(workouts.deletedAt)))
    .orderBy(desc(workouts.startedAt))
    .limit(limit)
    .all();

  return finished.map((workout) => {
    const completed: CompletedSet[] = db
      .select({ set: sets, exerciseId: workoutExercises.exerciseId, trackingType: exercises.trackingType })
      .from(sets)
      .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
      // Joining exercises for its tracking type, and for its tombstone:
      // getWorkoutDetail already drops sets whose exercise definition is
      // deleted, so without this the list summary and the detail screen
      // disagree about the same workout.
      .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
      .where(
        and(
          eq(workoutExercises.workoutId, workout.id),
          isNotNull(sets.completedAt),
          isNull(sets.deletedAt),
          isNull(workoutExercises.deletedAt),
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
