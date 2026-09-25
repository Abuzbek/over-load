import { describe, expect, it } from 'vitest';
import {
  estimateWorkoutMinutes,
  estimateWorkoutSeconds,
  generatePlan,
  repRange,
  rirScheme,
  weeklySetTarget,
  type PlanCandidate,
  type PlanInput,
  type PlannedWorkout,
} from './programPlan';

const c = (id: string, muscle: string, over: Partial<PlanCandidate> = {}): PlanCandidate => ({
  id, name: id, mainMuscle: muscle, primaryMuscles: [muscle], secondaryMuscles: [], compound: false, primaryCompound: false, exclusionGroups: [], strength: 3, hypertrophy: 3,
  stability: 3, rom: 3, unilateral: false, repsOnly: false, ...over,
});

const MUSCLES = ['Quads', 'Chest', 'Lats', 'Hamstrings', 'Side Delts', 'Upper Back', 'Glutes', 'Triceps', 'Biceps', 'Calves', 'Abs', 'Rear Delts', 'Front Delts'];
// Two exercises per muscle, so A and B can each get their own.
const CATALOGUE = MUSCLES.flatMap((m) => [c(`${m} 1`, m), c(`${m} 2`, m, { hypertrophy: 5, strength: 5 })]);

const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  goal: 'hypertrophy', split: 'full_body', daysPerWeek: 3, sessionMinutes: 60,
  focus: {}, deprioritized: [], level: 'intermediate', candidates: CATALOGUE, ...over,
});

const minutes = (w: PlannedWorkout) =>
  estimateWorkoutMinutes(w.exercises.map((e) => ({ sets: e.sets.length, restSeconds: e.restSeconds, unilateral: e.unilateral })));

describe('generatePlan', () => {
  it('gives each training day its own workout, with rest between', () => {
    const plan = generatePlan(input());
    expect(plan.workouts.map((w) => w.name)).toEqual(['Workout A', 'Workout B', 'Workout C']);
    expect(plan.days).toEqual([0, null, 1, null, 2, null, null]);
  });

  // The bug this covers: "20 to 40 minutes" produced a 56-minute workout.
  it('fits every workout inside the session length', () => {
    for (const sessionMinutes of [20, 40, 60, 90]) {
      const plan = generatePlan(input({ sessionMinutes, focus: { Chest: 2, Lats: 2, Quads: 1 } }));
      for (const w of plan.workouts) {
        expect(minutes(w)).toBeLessThanOrEqual(sessionMinutes);
        expect(w.exercises.length).toBeGreaterThan(0);
      }
    }
  });

  it('fits more into a longer session', () => {
    const count = (sessionMinutes: number) => generatePlan(input({ sessionMinutes })).workouts[0]!.exercises.length;
    expect(count(90)).toBeGreaterThan(count(40));
  });

  it('never repeats an exercise across the program while there are others to use', () => {
    const ids = generatePlan(input({ daysPerWeek: 2 })).workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reuses an exercise from another day rather than leave a muscle out, but never twice in one workout', () => {
    const plan = generatePlan(input({ sessionMinutes: 90, daysPerWeek: 5 }));
    for (const w of plan.workouts) {
      const ids = w.exercises.map((e) => e.exerciseId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBeGreaterThan(3);
    }
  });

  it('plans each set as a rep range with reps in reserve', () => {
    const first = generatePlan(input()).workouts[0]!.exercises[0]!;
    expect(first.exerciseId).toBe('Quads 1');
    expect(first.sets).toEqual([
      { repsMin: 10, repsMax: 12, rir: 2 },
      { repsMin: 10, repsMax: 12, rir: 1 },
      { repsMin: 10, repsMax: 12, rir: 1 },
    ]);
    expect(first.restSeconds).toBe(90);
  });

  it('gives focused muscles more weekly volume, and drops deprioritized ones', () => {
    const plan = generatePlan(input({ sessionMinutes: 90, focus: { Calves: 2 }, deprioritized: ['Chest'] }));
    const weekly = (muscle: string) =>
      plan.days.reduce<number>((n, w) => n + (w === null ? 0 : plan.workouts[w]!.exercises.filter((e) => e.muscle === muscle).reduce((s, e) => s + e.sets.length, 0)), 0);
    expect(weekly('Calves')).toBeGreaterThan(weekly('Biceps'));
    expect(weekly('Chest')).toBe(0);
  });

  // The bug this covers: five focus muscles, and a split squat (quads, glutes
  // and adductors all primary) crowded them out while counting for none of them.
  it('covers every focused muscle', () => {
    const squat = c('Split squat', 'Quads', { compound: true, primaryMuscles: ['Quads', 'Glutes', 'Adductors'] });
    const candidates = [squat, ...CATALOGUE];
    const focus = { Glutes: 1, Chest: 1, 'Side Delts': 1, Lats: 1, Quads: 1 };
    const a = generatePlan(input({ sessionMinutes: 60, focus, candidates })).workouts[0]!.exercises;
    for (const m of Object.keys(focus)) {
      const covered = a.some((e) => candidates.find((c) => c.id === e.exerciseId)!.primaryMuscles.includes(m));
      expect(covered, m).toBe(true);
    }
  });

  it('counts a compound for its other primaries at half, so they need fewer sets of their own', () => {
    const glutes = (candidates: PlanCandidate[]) =>
      generatePlan(input({ sessionMinutes: 30, candidates })).workouts.flatMap((w) => w.exercises).filter((e) => e.muscle === 'Glutes')
        .reduce<number>((n, e) => n + e.sets.length, 0);
    const squat = c('Squat', 'Quads', { compound: true, primaryCompound: true, primaryMuscles: ['Glutes', 'Quads'] });
    const without = CATALOGUE.filter((x) => x.mainMuscle !== 'Quads');
    expect(glutes([squat, ...without])).toBeLessThan(glutes([c('Leg extension', 'Quads'), ...without]));
  });

  it('never puts two variants from one exclusion group in a program, while there is another choice', () => {
    const candidates = [
      c('Pin-loaded pullover', 'Lats', { exclusionGroups: ['Machine pullovers'] }),
      c('Plate-loaded pullover', 'Lats', { exclusionGroups: ['Machine pullovers'] }),
      c('Pulldown', 'Lats', { hypertrophy: 5 }),
    ];
    const ids = generatePlan(input({ candidates, daysPerWeek: 2 })).workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId));
    expect(ids).toContain('Pin-loaded pullover');
    expect(ids).not.toContain('Plate-loaded pullover');
  });

  it('fills the session it was given', () => {
    const plan = generatePlan(input({ sessionMinutes: 60 }));
    for (const w of plan.workouts) expect(minutes(w)).toBeGreaterThan(50);
  });

  it('picks an exercise meant for the muscle over one that merely involves it', () => {
    const candidates = [
      c('Squat', 'Quads', { primaryMuscles: ['Quads', 'Glutes'], hypertrophy: 1 }),
      c('Hip thrust', 'Glutes', { hypertrophy: 3 }),
    ];
    const plan = generatePlan(input({ focus: { Glutes: 2 }, candidates }));
    expect(plan.workouts[0]!.exercises.find((e) => e.muscle === 'Glutes')?.exerciseId).toBe('Hip thrust');
  });

  it('alternates upper and lower days for a split', () => {
    expect(generatePlan(input({ split: 'upper_lower', daysPerWeek: 4 })).workouts.map((w) => w.name))
      .toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B']);
    expect(generatePlan(input({ split: 'upper_lower', daysPerWeek: 3 })).workouts.map((w) => w.name))
      .toEqual(['Upper A', 'Lower A', 'Upper B']);
  });

  it('gives novices the more stable variation when recommendations tie', () => {
    const candidates = [c('Wobbly', 'Quads', { stability: 1 }), c('Machine', 'Quads', { stability: 5 })];
    expect(generatePlan(input({ level: 'novice', candidates })).workouts[0]!.exercises[0]!.exerciseId).toBe('Machine');
  });

  it('prefers the longer range of motion for hypertrophy', () => {
    const candidates = [c('Partial', 'Quads', { rom: 2 }), c('Deep', 'Quads', { rom: 5 })];
    expect(generatePlan(input({ candidates })).workouts[0]!.exercises[0]!.exerciseId).toBe('Deep');
  });

  it('breaks a tie in favour of the more popular (earlier) candidate', () => {
    const candidates = [c('Barbell squat', 'Quads'), c('Accentuated eccentric squat', 'Quads')];
    expect(generatePlan(input({ candidates })).workouts[0]!.exercises[0]!.exerciseId).toBe('Barbell squat');
  });

  it('gives a big muscle a compound, a primary one first, and a small muscle isolation when it scores as well', () => {
    const pick = (muscle: string, candidates: PlanCandidate[]) =>
      generatePlan(input({ candidates })).workouts[0]!.exercises.find((e) => e.muscle === muscle)?.exerciseId;
    expect(pick('Quads', [c('Leg extension', 'Quads'), c('Leg press', 'Quads', { compound: true }), c('Squat', 'Quads', { compound: true, primaryCompound: true, hypertrophy: 4 })]))
      .toBe('Squat');
    expect(pick('Biceps', [c('Chin-up', 'Biceps', { compound: true, hypertrophy: 4 }), c('Curl', 'Biceps')])).toBe('Curl');
  });
});

describe('weeklySetTarget', () => {
  it('adds half again per focus point', () => {
    expect(weeklySetTarget('intermediate', 0)).toBe(9);
    expect(weeklySetTarget('intermediate', 2)).toBe(18);
    expect(weeklySetTarget('novice', 0)).toBe(6);
  });
});

describe('repRange', () => {
  it('goes heavy and low on compounds for strength, higher for small muscles and unstable setups', () => {
    expect(repRange('strength', { compound: true, stability: 5, repsOnly: false }, 'Quads')).toEqual({ min: 4, max: 6 });
    expect(repRange('hypertrophy', { compound: false, stability: 5, repsOnly: false }, 'Side Delts')).toEqual({ min: 12, max: 15 });
    expect(repRange('hypertrophy', { compound: true, stability: 1, repsOnly: false }, 'Quads')).toEqual({ min: 9, max: 11 });
    expect(repRange('strength', { compound: true, stability: 3, repsOnly: true }, 'Chest')).toEqual({ min: 8, max: 12 });
  });
});

describe('rirScheme', () => {
  it('eases into the first set and keeps novices further from failure', () => {
    expect(rirScheme(3, true, 'intermediate')).toEqual([3, 2, 2]);
    expect(rirScheme(3, false, 'novice')).toEqual([3, 2, 2]);
    expect(rirScheme(1, false, 'advanced')).toEqual([1]);
  });
});

describe('estimateWorkoutSeconds', () => {
  it('counts work, rest between sets and a changeover; a unilateral set takes longer', () => {
    // 3 × 40 + 2 × 90 + 60 = 360; 3 × 75 + 2 × 90 + 60 = 465.
    expect(estimateWorkoutSeconds([{ sets: 3, restSeconds: 90 }])).toBe(360);
    expect(estimateWorkoutSeconds([{ sets: 3, restSeconds: 90, unilateral: true }])).toBe(465);
    expect(estimateWorkoutSeconds([{ sets: 0, restSeconds: 90 }])).toBe(0);
  });
});
