import { createTestDb } from '@overload/schema/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EQUIPMENT_SEED, fixtureFile } from './catalogueTestFixtures';
import {
  BODYWEIGHT_ONLY,
  createCustomExercise,
  exerciseFilterOptions,
  exerciseHistory,
  getExerciseDetail,
  listExercises,
  type ExerciseFilters,
} from './exerciseRepo';
import { createGym, listGymEquipment, setGymEquipmentOwned } from './gymRepo';
import { syncCatalogue } from './seedRepo';
import { addExerciseToSession, addSet, completeSet, discardSession, finishSession } from './sessionRepo';
import { startBareSession } from './sessionTestFixtures';

let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestDb());
  syncCatalogue(db, fixtureFile(), EQUIPMENT_SEED, 1, { 'Bench press': '## Setting up\n1. Lie down.' });
});
afterEach(() => close());

const names = (filters: ExerciseFilters) => listExercises(db, filters).map((e) => e.name).sort();

describe('listExercises filters', () => {
  it('matches any selected muscle, as a primary only', () => {
    expect(names({ muscleIds: ['quads'] })).toEqual(['Leg press']);
    // Triceps is only ever secondary.
    expect(names({ muscleIds: ['triceps'] })).toEqual([]);
    expect(names({ muscleIds: ['quads', 'frontDelts'] })).toEqual(['Bench press', 'Leg press']);
  });

  it('crosses exercise type with region', () => {
    expect(names({ type: 'compound_upper' })).toEqual(['Bench press']);
    expect(names({ type: 'upper_isolation' })).toEqual(['Dumbbell curl']);
    expect(names({ type: 'compound_lower' })).toEqual(['Leg press']);
  });

  it('filters by laterality', () => {
    expect(names({ lateralityId: 'unilateral' })).toEqual(['Dumbbell curl']);
  });

  it('filters by an equipment item, or by needing none', () => {
    expect(names({ resistance: 'dumbbells' })).toEqual(['Dumbbell curl']);
    expect(names({ support: 'bench' })).toEqual(['Bench press']);
    expect(names({ resistance: BODYWEIGHT_ONLY })).toEqual(['Push-up']);
  });

  it('keeps ROM and stability inside an inclusive range', () => {
    expect(names({ rom: [4, 5] })).toEqual(['Bench press']);
    expect(names({ stability: [1, 4] })).toEqual([]);
  });

  it('names each row’s primary and secondary muscles', () => {
    const bench = listExercises(db, { search: 'Bench press' })[0]!;
    expect(bench.primaryMuscles?.split(', ').sort()).toEqual(['Chest', 'Front Delts']);
    expect(bench.secondaryMuscles).toBe('Triceps');
  });
});

describe('listExercises groups', () => {
  it('files each exercise under its main resistance item’s category', () => {
    const groups = Object.fromEntries(listExercises(db).map((e) => [e.name, e.group]));
    expect(groups).toEqual({
      // Barbell and plates: the bar is the main item (plates are a tie-break loser).
      'Bench press': 'free_weights',
      'Dumbbell curl': 'free_weights',
      'Push-up': 'bodyweight_personal',
      'Leg press': 'machines',
    });
  });

  it('puts the user’s own exercises with bodyweight', () => {
    const mine = createCustomExercise(db, { name: 'Mine', trackingType: 'reps', primaryMuscle: 'Quads', equipment: 'Barbell' });
    expect(listExercises(db).find((e) => e.id === mine.id)!.group).toBe('bodyweight_personal');
  });
});

describe('listExercises order', () => {
  it('puts exercises low on both recommendations first, unrated last', () => {
    const levels: Record<string, [number, number] | undefined> = {
      'Bench press': [2, 2],
      'Dumbbell curl': [1, 3],
      'Push-up': [1, 1],
      'Leg press': undefined,
    };
    const file = fixtureFile({
      exercises: fixtureFile().exercises.map((e) => ({
        ...e,
        recommendationLevelStrength: levels[e.name]?.[0],
        recommendationLevelHypertrophy: levels[e.name]?.[1],
      })),
    });
    syncCatalogue(db, file, EQUIPMENT_SEED, 2);
    // [1,3] loses to [2,2]: its worse level, 3, is worse than 2.
    expect(listExercises(db).map((e) => e.name)).toEqual(['Push-up', 'Bench press', 'Dumbbell curl', 'Leg press']);
  });
});

describe('exerciseFilterOptions', () => {
  it('lists only equipment some exercise needs, flagged by what the gym owns', () => {
    const gym = createGym(db, 'Home', 1);
    const dumbbells = listGymEquipment(db, gym.id).find((r) => r.equipment.name === 'Dumbbells')!;
    setGymEquipmentOwned(db, gym.id, dumbbells.equipment.id, true, 2);

    const options = exerciseFilterOptions(db, gym.id);
    expect(options.resistance.map((o) => [o.name, o.available])).toEqual([
      ['Barbell', false],
      ['Dumbbells', true],
      ['Pin-loaded leg press', false],
      ['Weight plates', false],
    ]);
    expect(options.support.map((o) => o.name)).toEqual(['Flat bench']);
    expect(options.lateralities.map((o) => o.name)).toEqual(['Bilateral', 'Unilateral']);
    // Chest is a primary of three exercises, so it leads the strip.
    expect(options.muscles[0]!.name).toBe('Chest');
  });
});

describe('getExerciseDetail', () => {
  it('gathers the lookups, muscles, equipment and instructions', () => {
    const detail = getExerciseDetail(db, 'Bench press')!;
    expect(detail.exercise.instructions).toBe('## Setting up\n1. Lie down.');
    expect(detail.type).toBe('Multi-joint (compound)');
    expect(detail.region).toBe('Upper body');
    expect(detail.links.laterality).toEqual(['Bilateral']);
    expect(detail.links.alternativeName).toEqual(['Flat bench']);
    expect(detail.muscles.map((m) => [m.name, m.primary])).toEqual([
      ['Chest', true],
      ['Front Delts', true],
      ['Triceps', false],
    ]);
    expect(detail.equipment).toEqual({
      resistance: [[{ id: 'barbell', name: 'Barbell' }, { id: 'plates', name: 'Weight plates' }]],
      support: [[{ id: 'bench', name: 'Flat bench' }]],
    });
  });
});

describe('exerciseHistory', () => {
  it('sums completed sets per session and skips discarded sessions', () => {
    const log = (at: number, sets: [number, number][]) => {
      const sessionId = startBareSession(db, `Day ${at}`, at);
      const se = addExerciseToSession(db, sessionId, 'Bench press', at);
      for (const [weightKg, reps] of sets) completeSet(db, addSet(db, se.id, at).id, { weightKg, reps }, at);
      addSet(db, se.id, at); // planned, never performed
      return sessionId;
    };
    finishSession(db, log(10, [[100, 5], [100, 4]]), 11);
    finishSession(db, log(20, [[105, 5]]), 21);
    discardSession(db, log(30, [[200, 1]]), 31);

    expect(exerciseHistory(db, 'Bench press')).toEqual([
      { sessionId: expect.any(String), name: 'Day 20', startedAt: 20, sets: 1, reps: 5, volumeKg: 525 },
      { sessionId: expect.any(String), name: 'Day 10', startedAt: 10, sets: 2, reps: 9, volumeKg: 900 },
    ]);
  });
});
