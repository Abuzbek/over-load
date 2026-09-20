import { totalVolumeKg, type CompletedSet } from '@workouts/domain';
import {
  sets,
  workoutExercises,
  workouts,
  type Db,
  type Workout,
} from '@workouts/schema';
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
      .select({ set: sets, exerciseId: workoutExercises.exerciseId })
      .from(sets)
      .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
      .where(
        and(
          eq(workoutExercises.workoutId, workout.id),
          isNotNull(sets.completedAt),
          isNull(sets.deletedAt),
          isNull(workoutExercises.deletedAt),
        ),
      )
      .all()
      .map(({ set, exerciseId }) => toCompletedSet(set, exerciseId));

    return {
      workout,
      setCount: completed.length,
      volumeKg: totalVolumeKg(completed),
    };
  });
}
