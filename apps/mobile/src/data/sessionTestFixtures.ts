import { newId, sessions, type Db } from '@overload/schema';

/**
 * Inserts a bare workout row — no workout, no exercises.
 *
 * This used to be `startEmptyWorkout` in sessionRepo, backing a "Start empty
 * workout" button. That feature is gone: sessions now always come from the
 * library or a program day. The insert survives only as a test fixture, because
 * almost every session and history test needs a workout to log sessionSets into and
 * building one through a workout would drag the whole copy-from-template path
 * into tests that are not about it.
 *
 * TEST ONLY. Nothing under app/ or features/ may import this.
 */
export function startBareSession(db: Db, name: string, at: number): string {
  const sessionId = newId();
  db.insert(sessions).values({
    id: sessionId,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    workoutId: null,
    name,
    startedAt: at,
    endedAt: null,
    notes: null,
  }).run();
  return sessionId;
}
