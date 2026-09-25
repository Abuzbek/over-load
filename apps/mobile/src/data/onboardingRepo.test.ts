import type { TrainingPreferences } from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EQUIPMENT_SEED, EXERCISES, INDEX, fixtureFile } from './catalogueTestFixtures';
import { ensureDefaultGym, getActiveGym, listGyms } from './gymRepo';
import {
  completeOnboarding,
  createProgramFromPlan,
  needsOnboarding,
  planCandidates,
  planProgram,
  setUpGym,
} from './onboardingRepo';
import { addProgramDay, ensureDefaultProgram, getActiveProgram, getProgramDays, listPrograms, removeProgramDay } from './programRepo';
import { syncCatalogue } from './seedRepo';
import { createWorkout } from './workoutRepo';

let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestDb());
  syncCatalogue(db, fixtureFile(), EQUIPMENT_SEED, 1);
  ensureDefaultProgram(db, 1);
  ensureDefaultGym(db, 1);
});
afterEach(() => close());

const PREFS: TrainingPreferences = {
  goal: 'hypertrophy', focus: {}, deprioritized: [], daysPerWeek: 3, sessionMinutes: 40,
  split: 'full_body', deload: true, skills: [], smartProgression: true, warmups: true,
};

describe('needsOnboarding', () => {
  it('is true for a new account and false once finished', () => {
    expect(needsOnboarding(db)).toBe(true);
    completeOnboarding(db, PREFS, 2);
    expect(needsOnboarding(db)).toBe(false);
  });

  it('skips an account that already trains', () => {
    createWorkout(db, 'Push');
    expect(needsOnboarding(db)).toBe(false);
  });
});

describe('setUpGym', () => {
  it('replaces the default gym, and the last pick wins', () => {
    setUpGym(db, 'home', 'Home', 'house', 2);
    const second = setUpGym(db, 'everything', 'Big box', 'dumbbell', 3);
    expect(listGyms(db).map((g) => g.gym.name)).toEqual(['Big box']);
    expect(getActiveGym(db)?.id).toBe(second);
  });

  it('keeps the gyms of an account that already trains, replacing only its own earlier pick', () => {
    createWorkout(db, 'Push');
    const first = setUpGym(db, 'home', 'Home', 'house', 2);
    setUpGym(db, 'garage', 'Garage', 'house', 3, first);
    expect(listGyms(db).map((g) => g.gym.name).sort()).toEqual(['Garage', 'My Gym']);
  });
});

describe('planCandidates', () => {
  it('rules out what an unticked skill names', () => {
    const gym = setUpGym(db, 'everything', 'Gym', 'dumbbell', 2);
    const names = (skills: string[]) => planCandidates(db, gym, skills, 'hypertrophy').map((c) => c.name);
    expect(names([])).not.toContain('Push-up');
    expect(names(['pushups15'])).toContain('Push-up');
  });

  it("reads compound or not from the goal's classification, and the main muscle from the movement pattern", () => {
    const pc = { type: 'exerciseClassification', name: 'Primary Compound' };
    const iso = { type: 'exerciseClassification', name: 'Isolation/Accessory' };
    const file = fixtureFile({
      uuidIndex: { ...INDEX, pc, iso },
      exercises: EXERCISES.map((e) =>
        e.name === 'Bench press'
          ? { ...e, primaryFeatureMuscle: ['frontDelts', 'chest'], exerciseClassificationStrength: ['pc'], exerciseClassificationHypertrophy: ['iso'] }
          : e,
      ),
    });
    syncCatalogue(db, file, EQUIPMENT_SEED, 2);
    const gym = setUpGym(db, 'everything', 'Gym', 'dumbbell', 2);
    const bench = (goal: 'strength' | 'hypertrophy' | 'both') =>
      planCandidates(db, gym, ['bench10'], goal).find((c) => c.name === 'Bench press')!;
    // Front Delts is listed first, but a horizontal push is for the chest.
    expect(bench('strength').mainMuscle).toBe('Chest');
    expect(bench('strength')).toMatchObject({ compound: true, primaryCompound: true });
    expect(bench('hypertrophy')).toMatchObject({ compound: false, primaryCompound: false });
    expect(bench('both').primaryCompound).toBe(true);
  });

  it('rules out every free-bar bench press for someone who cannot bench 10 reps', () => {
    const gym = setUpGym(db, 'everything', 'Gym', 'dumbbell', 2);
    expect(planCandidates(db, gym, [], 'hypertrophy').map((c) => c.name)).not.toContain('Bench press');
  });
});

describe('createProgramFromPlan', () => {
  it('writes an active program with its days, and retires the empty default', () => {
    const gym = setUpGym(db, 'everything', 'Gym', 'dumbbell', 2);
    const plan = planProgram(db, gym, PREFS);
    const id = createProgramFromPlan(db, plan, { name: 'My Plan', icon: 'rocket', color: '#E8834A' }, 3);

    expect(getActiveProgram(db)?.id).toBe(id);
    expect(listPrograms(db).map((p) => p.program.name)).toEqual(['My Plan']);
    const days = getProgramDays(db, id);
    expect(days.filter((d) => d.workout).map((d) => d.workout!.name)).toEqual(['Workout A', 'Workout B', 'Workout C']);
  });

  it('keeps a generated program at seven days: none added, none removed', () => {
    const gym = setUpGym(db, 'everything', 'Gym', 'dumbbell', 2);
    const id = createProgramFromPlan(db, planProgram(db, gym, PREFS), { name: 'My Plan', icon: 'x', color: 'x' }, 3);
    expect(addProgramDay(db, id, 4)).toBeNull();
    removeProgramDay(db, id, 1, 4);
    expect(getProgramDays(db, id)).toHaveLength(7);
  });
});
