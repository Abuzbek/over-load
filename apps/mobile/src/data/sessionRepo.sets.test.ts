import { exercises, newId, type Exercise } from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { periodTotals } from './historyRepo';
import {
  addExerciseToSession,
  addRound,
  addSet,
  addWarmupSets,
  completeSet,
  deleteSet,
  detachSuperset,
  finishSession,
  getSessionDetail,
  pauseSession,
  resumeSession,
  supersetWithNext,
  setSetType,
  updateSet,
} from './sessionRepo';
import { startBareSession } from './sessionTestFixtures';

const AT = 1_700_000_000_000;
let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;
let sessionId: string;
let seId: string;

beforeEach(() => {
  ({ db, close } = createTestDb());
  const bench = { id: newId(), name: 'Bench', trackingType: 'weight_reps' as const, primaryMuscle: 'Chest', equipment: 'barbell' };
  db.insert(exercises).values(bench).run();
  sessionId = startBareSession(db, 'Push', AT);
  seId = addExerciseToSession(db, sessionId, (bench as unknown as Exercise).id, AT).id;
});
afterEach(() => close());

const sets = () => getSessionDetail(db, sessionId)!.exercises[0]!.sessionSets;

describe('session sets', () => {
  it('saves typed values without completing the set', () => {
    const set = addSet(db, seId, AT);
    updateSet(db, set.id, { weightKg: 80, reps: 8, partialReps: 2, rir: 1 }, AT + 1);
    expect(sets()[0]).toMatchObject({ weightKg: 80, reps: 8, partialReps: 2, rir: 1, completedAt: null });
  });

  it('puts warm-ups before every other set, in the order given', () => {
    addSet(db, seId, AT);
    addWarmupSets(db, seId, [{ weightKg: 40, reps: 8 }, { weightKg: 60, reps: 5 }], AT);
    expect(sets().map((s) => [s.setType, s.weightKg])).toEqual([['warmup', 40], ['warmup', 60], ['normal', null]]);
  });

  it('starts a drop set with a lighter round to failure, each round lighter again; none once it stops being one', () => {
    const set = addSet(db, seId, AT);
    updateSet(db, set.id, { weightKg: 55 }, AT);
    setSetType(db, set.id, 'drop', AT);
    addRound(db, set.id, AT + 1);
    const rounds = () => sets().filter((s) => s.parentSetId === set.id);
    expect(rounds().map((s) => [s.weightKg, s.targetRir])).toEqual([[32.5, 0], [17.5, 0]]);
    expect(sets().find((s) => s.id === set.id)!.rir).toBe(0);
    setSetType(db, set.id, 'normal', AT + 2);
    expect(sets()).toHaveLength(1);
    expect(sets()[0]!.rir).toBeNull();
  });

  it("plans a myo round at the parent's weight, left for the box to show", () => {
    const set = addSet(db, seId, AT);
    updateSet(db, set.id, { weightKg: 55 }, AT);
    setSetType(db, set.id, 'myo', AT);
    expect(sets().filter((s) => s.parentSetId === set.id).map((s) => [s.weightKg, s.targetWeightKg])).toEqual([[null, 55]]);
  });

  it('makes a failure set RIR 0, and deleting a set deletes its rounds', () => {
    const set = addSet(db, seId, AT);
    setSetType(db, set.id, 'failure', AT);
    expect(sets()[0]).toMatchObject({ targetRir: 0, rir: 0 });
    setSetType(db, set.id, 'myo', AT);
    deleteSet(db, set.id, AT + 1);
    expect(sets()).toHaveLength(0);
  });

  it('counts neither warm-ups nor rounds as sets of training', () => {
    const set = addSet(db, seId, AT);
    setSetType(db, set.id, 'drop', AT);
    const round = sets().find((s) => s.parentSetId === set.id)!;
    addWarmupSets(db, seId, [{ weightKg: 40, reps: 8 }], AT);
    for (const s of sets()) completeSet(db, s.id, { weightKg: 50, reps: 5 }, AT + 10);
    expect(round.parentSetId).toBe(set.id);
    expect(periodTotals(db, AT, AT + 100).sets).toBe(1);
  });
});

describe('supersets', () => {
  it('joins an exercise to the next one only, and detaching leaves no superset of one', () => {
    const second = addExerciseToSession(db, sessionId, getSessionDetail(db, sessionId)!.exercises[0]!.exercise.id, AT).id;
    const groups = () => getSessionDetail(db, sessionId)!.exercises.map((e) => e.sessionExercise.supersetGroup);
    supersetWithNext(db, second, AT); // the last has no next
    expect(groups()).toEqual([null, null]);
    supersetWithNext(db, seId, AT);
    expect(groups()).toEqual([1, 1]);
    detachSuperset(db, seId, AT);
    expect(groups()).toEqual([null, null]);
  });
});

describe('pause', () => {
  it('leaves the paused time out of the workout, finished paused or not', () => {
    pauseSession(db, sessionId, AT + 1000);
    resumeSession(db, sessionId, AT + 61_000);
    expect(getSessionDetail(db, sessionId)!.workout).toMatchObject({ startedAt: AT + 60_000, pausedAt: null });
    pauseSession(db, sessionId, AT + 100_000);
    finishSession(db, sessionId, AT + 160_000);
    const w = getSessionDetail(db, sessionId)!.workout;
    expect(w.endedAt! - w.startedAt).toBe(40_000);
  });
});
