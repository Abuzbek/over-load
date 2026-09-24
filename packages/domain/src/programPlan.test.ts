import { describe, expect, it } from 'vitest';
import {
  estimateWorkoutMinutes,
  estimateWorkoutSeconds,
  generatePlan,
  repRange,
  rirScheme,
  type PlanCandidate,
  type PlanInput,
  type PlannedWorkout,
} from './programPlan';

const c = (id: string, muscle: string, over: Partial<PlanCandidate> = {}): PlanCandidate => ({
  id, name: id, primaryMuscles: [muscle], compound: false, strength: 3, hypertrophy: 3,
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
  it('lays three full-body days out A, B, A with rest between', () => {
    const plan = generatePlan(input());
    expect(plan.workouts.map((w) => w.name)).toEqual(['Workout A', 'Workout B']);
    expect(plan.days).toEqual([0, null, 1, null, 0, null, null]);
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

  it('never repeats an exercise across the program', () => {
    const ids = generatePlan(input({ sessionMinutes: 90 })).workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId));
    expect(new Set(ids).size).toBe(ids.length);
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

  it('leads with focused muscles, adds a set per point, and drops deprioritized ones', () => {
    const a = generatePlan(input({ focus: { Calves: 2 }, deprioritized: ['Chest'] })).workouts[0]!.exercises;
    expect(a[0]).toMatchObject({ muscle: 'Calves' });
    expect(a[0]!.sets).toHaveLength(5);
    expect(a.some((e) => e.muscle === 'Chest')).toBe(false);
  });

  it('builds upper and lower days for a split, alternating when under four days', () => {
    expect(generatePlan(input({ split: 'upper_lower', daysPerWeek: 4 })).workouts.map((w) => w.name))
      .toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B']);
    const three = generatePlan(input({ split: 'upper_lower', daysPerWeek: 3 }));
    expect(three.days.filter((d) => d !== null)).toEqual([0, 1, 0]);
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

  it('prefers an isolation exercise once the big lifts are in', () => {
    const candidates = [
      ...['Quads', 'Chest', 'Lats'].map((m) => c(m, m, { compound: true })),
      c('Pulldown', 'Hamstrings', { compound: true }),
      c('Curl', 'Hamstrings'),
    ];
    expect(generatePlan(input({ candidates })).workouts[0]!.exercises[3]!.exerciseId).toBe('Curl');
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
