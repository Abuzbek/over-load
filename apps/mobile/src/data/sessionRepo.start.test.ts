import { exercises, newId, now, workoutSets, sessions, type Exercise } from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startBareSession } from './sessionTestFixtures';
import { activateProgram, createProgram, getProgramDays, setProgramDay } from './programRepo';
import { addExerciseToWorkout, addWorkoutSet, createWorkout } from './workoutRepo';
import {
  discardSession,
  finishSession,
  getActiveSession,
  getActiveSessionId,
  getSessionDetail,
  startSessionFromWorkout,
} from './sessionRepo';

const AT = 1_700_000_000_000;

let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;
let bench: Exercise;

beforeEach(() => {
  ({ db, close } = createTestDb());
  const row = {
    id: newId(),
    name: 'Bench Press',
    trackingType: 'weight_reps' as const,
    primaryMuscle: 'chest',
    secondaryMuscles: [],
    equipment: 'barbell',
  };
  db.insert(exercises).values(row).run();
  bench = row as unknown as Exercise;
});

afterEach(() => close());

function pushDay() {
  const workout = createWorkout(db, 'Push Day');
  const re = addExerciseToWorkout(db, workout.id, bench.id);
  addWorkoutSet(db, re.id, { targetReps: 8, targetWeightKg: 80 });
  addWorkoutSet(db, re.id, { targetReps: 6, targetWeightKg: 90 });
  return workout;
}

describe('startSessionFromWorkout', () => {
  it('names the workout after the workout and records the start time', () => {
    const workout = pushDay();
    const detail = getSessionDetail(db, startSessionFromWorkout(db, workout.id, AT));

    expect(detail?.workout.name).toBe('Push Day');
    expect(detail?.workout.startedAt).toBe(AT);
    expect(detail?.workout.endedAt).toBeNull();
    expect(detail?.workout.workoutId).toBe(workout.id);
  });

  it('copies planned sets with targets pre-filled and completedAt null', () => {
    const workout = pushDay();
    const detail = getSessionDetail(db, startSessionFromWorkout(db, workout.id, AT));
    const sessionSets = detail!.exercises[0]!.sessionSets;

    expect(sessionSets.map((s) => s.reps)).toEqual([8, 6]);
    expect(sessionSets.map((s) => s.weightKg)).toEqual([80, 90]);
    expect(sessionSets.every((s) => s.completedAt === null)).toBe(true);
  });

  it('is a copy: editing the workout afterwards does not change the workout', () => {
    const workout = pushDay();
    const sessionId = startSessionFromWorkout(db, workout.id, AT);

    db.update(workoutSets).set({ targetReps: 99 }).where(eq(workoutSets.targetReps, 8)).run();

    const sessionSets = getSessionDetail(db, sessionId)!.exercises[0]!.sessionSets;
    expect(sessionSets.map((s) => s.reps)).toEqual([8, 6]);
  });

  it('throws for an unknown workout', () => {
    expect(() => startSessionFromWorkout(db, newId(), AT)).toThrow(/workout not found/i);
  });

  it('excludes an exercise from the detail once its definition is soft-deleted', () => {
    const workout = pushDay();
    const sessionId = startSessionFromWorkout(db, workout.id, AT);

    db.update(exercises).set({ deletedAt: now() }).where(eq(exercises.id, bench.id)).run();

    const detail = getSessionDetail(db, sessionId);
    expect(detail?.exercises).toEqual([]);
  });
});

describe('getActiveSessionId', () => {
  it('returns undefined when nothing is in progress', () => {
    expect(getActiveSessionId(db)).toBeUndefined();
  });

  it('returns the workout that has no endedAt', () => {
    const sessionId = startBareSession(db, 'Freestyle', AT);
    expect(getActiveSessionId(db)).toBe(sessionId);
  });

  it('returns the most recently started one if several are unfinished', () => {
    startBareSession(db, 'Older', AT);
    const newer = startBareSession(db, 'Newer', AT + 1000);
    expect(getActiveSessionId(db)).toBe(newer);
  });
});

describe('discardSession', () => {
  it('tombstones the workout so it is no longer the active one', () => {
    const sessionId = startBareSession(db, 'Abandoned', AT);
    expect(getActiveSessionId(db)).toBe(sessionId);

    discardSession(db, sessionId, AT + 5000);

    expect(getActiveSessionId(db)).toBeUndefined();
    expect(getSessionDetail(db, sessionId)).toBeUndefined();
  });

  it('records the tombstone and the update time rather than deleting the row', () => {
    const sessionId = startBareSession(db, 'Abandoned', AT);

    discardSession(db, sessionId, AT + 5000);

    const row = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    expect(row).toMatchObject({ deletedAt: AT + 5000, updatedAt: AT + 5000, endedAt: null });
  });

  it('leaves an older unfinished workout resumable once the newer one is discarded', () => {
    const older = startBareSession(db, 'Older', AT);
    const newer = startBareSession(db, 'Newer', AT + 1000);

    discardSession(db, newer, AT + 2000);

    expect(getActiveSessionId(db)).toBe(older);
  });
});

describe('getActiveSession', () => {
  it('returns undefined when nothing is in progress', () => {
    expect(getActiveSession(db)).toBeUndefined();
  });

  it('returns the unfinished workout with its name and start time', () => {
    const at = now();
    const id = startBareSession(db, 'Session', at);
    const active = getActiveSession(db);
    expect(active?.id).toBe(id);
    expect(active?.name).toBe('Session');
    expect(active?.startedAt).toBe(at);
  });

  it('returns undefined once the workout is finished', () => {
    const id = startBareSession(db, 'Session', now());
    finishSession(db, id, now());
    expect(getActiveSession(db)).toBeUndefined();
  });

  it('returns undefined for a discarded workout', () => {
    const id = startBareSession(db, 'Session', now());
    discardSession(db, id, now());
    expect(getActiveSession(db)).toBeUndefined();
  });

  // Matches getActiveSessionId: newest wins, which is what the resume banner
  // and the stranded-workout guard both already assume.
  it('returns the newest unfinished workout when several exist', () => {
    startBareSession(db, 'Older', now() - 10_000);
    const newer = startBareSession(db, 'Newer', now());
    expect(getActiveSession(db)?.id).toBe(newer);
  });
});

describe('finishSession ticks off the program day', () => {
  it('marks the active program day whose workout was just finished', () => {
    const workout = createWorkout(db, 'Push');
    addExerciseToWorkout(db, workout.id, bench.id);
    const program = createProgram(db, { name: 'P' }, AT);
    activateProgram(db, program.id, AT);
    setProgramDay(db, program.id, 0, workout.id, AT);

    const sessionId = startSessionFromWorkout(db, workout.id, AT);
    finishSession(db, sessionId, AT + 60_000);

    expect(getProgramDays(db, program.id)[0]!.completedAt).toBe(AT + 60_000);
  });

  it('leaves the cycle alone for a workout that is not in the program', () => {
    const workout = createWorkout(db, 'Push');
    addExerciseToWorkout(db, workout.id, bench.id);
    const other = createWorkout(db, 'Unrelated');
    addExerciseToWorkout(db, other.id, bench.id);
    const program = createProgram(db, { name: 'P' }, AT);
    activateProgram(db, program.id, AT);
    setProgramDay(db, program.id, 0, workout.id, AT);

    finishSession(db, startSessionFromWorkout(db, other.id, AT), AT + 60_000);

    expect(getProgramDays(db, program.id)[0]!.completedAt).toBeNull();
  });
});
