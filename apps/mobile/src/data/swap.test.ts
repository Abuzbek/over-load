import { createTestDb } from '@overload/schema/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EQUIPMENT_SEED, fixtureFile } from './catalogueTestFixtures';
import { smartSubstitutes } from './exerciseRepo';
import { createGym } from './gymRepo';
import { syncCatalogue } from './seedRepo';
import {
  addExerciseToSession,
  addSet,
  completeSet,
  finishSession,
  getSessionDetail,
  sessionRecords,
  swapSessionExercise,
  updateSet,
} from './sessionRepo';
import { startBareSession } from './sessionTestFixtures';

const AT = 1_700_000_000_000;
let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestDb());
  syncCatalogue(db, fixtureFile(), EQUIPMENT_SEED, 1);
});
afterEach(() => close());

describe('smartSubstitutes', () => {
  it('offers exercises with exactly the same main muscles, not itself', () => {
    // Push-up and the curl are both chest-only in the fixture; bench adds front delts.
    expect(smartSubstitutes(db, 'Push-up', null).map((e) => e.name)).toEqual(['Dumbbell curl']);
    expect(smartSubstitutes(db, 'Bench press', null)).toEqual([]);
  });

  it('leaves out what the gym cannot do', () => {
    const empty = createGym(db, 'Empty', AT);
    expect(smartSubstitutes(db, 'Push-up', empty.id)).toEqual([]);
  });
});

describe('swapSessionExercise', () => {
  it('puts the new exercise in its place with the same sets, the old loads cleared', () => {
    const sessionId = startBareSession(db, 'Push', AT);
    const entry = addExerciseToSession(db, sessionId, 'Bench press', AT);
    const set = addSet(db, entry.id, AT);
    updateSet(db, set.id, { weightKg: 100, reps: 5 }, AT);
    addSet(db, entry.id, AT);

    swapSessionExercise(db, entry.id, 'Push-up', AT + 1);

    const [swapped] = getSessionDetail(db, sessionId)!.exercises;
    expect(swapped!.exercise.id).toBe('Push-up');
    expect(swapped!.sessionExercise.id).toBe(entry.id);
    expect(swapped!.sessionSets.map((s) => [s.weightKg, s.reps])).toEqual([[null, null], [null, null]]);
  });

  it('refuses once a set is logged', () => {
    const sessionId = startBareSession(db, 'Push', AT);
    const entry = addExerciseToSession(db, sessionId, 'Bench press', AT);
    const set = addSet(db, entry.id, AT);
    completeSet(db, set.id, { weightKg: 100, reps: 5 }, AT);
    expect(() => swapSessionExercise(db, entry.id, 'Push-up', AT)).toThrow();
  });
});

describe('sessionRecords', () => {
  const lift = (at: number, weightKg: number, reps: number) => {
    const sessionId = startBareSession(db, 'Push', at);
    const entry = addExerciseToSession(db, sessionId, 'Bench press', at);
    const set = addSet(db, entry.id, at);
    completeSet(db, set.id, { weightKg, reps }, at + 1);
    finishSession(db, sessionId, at + 2);
    return sessionId;
  };

  it('is a beaten best, with the old one beside it; a first time is no record', () => {
    const first = lift(AT, 100, 5);
    expect(sessionRecords(db, first)).toEqual([]);
    const second = lift(AT + 10_000, 100, 8);
    expect(sessionRecords(db, second)).toEqual([
      { exerciseId: 'Bench press', type: 'est_1rm', value: expect.any(Number), previous: expect.any(Number) },
    ]);
    const [record] = sessionRecords(db, second);
    expect(record!.value).toBeGreaterThan(record!.previous);
    expect(sessionRecords(db, lift(AT + 20_000, 90, 5))).toEqual([]);
  });
});
