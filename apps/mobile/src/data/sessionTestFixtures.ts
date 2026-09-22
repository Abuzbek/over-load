import { newId, workouts, type Db } from '@overload/schema';

/**
 * Inserts a bare workout row — no routine, no exercises.
 *
 * This used to be `startEmptyWorkout` in sessionRepo, backing a "Start empty
 * workout" button. That feature is gone: workouts now always come from the
 * library or a program day. The insert survives only as a test fixture, because
 * almost every session and history test needs a workout to log sets into and
 * building one through a routine would drag the whole copy-from-template path
 * into tests that are not about it.
 *
 * TEST ONLY. Nothing under app/ or features/ may import this.
 */
export function startBareWorkout(db: Db, name: string, at: number): string {
  const workoutId = newId();
  db.insert(workouts).values({
    id: workoutId,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    routineId: null,
    name,
    startedAt: at,
    endedAt: null,
    notes: null,
  }).run();
  return workoutId;
}
