import { DEFAULT_REST_SECONDS } from './restTimer';

/**
 * The program generator, pure: onboarding answers plus the exercises a gym
 * allows in, a cycle of days and workouts out. Muscles are feature-muscle-group
 * names ("Chest", "Side Delts"), the same names the catalogue uses.
 */

export type PlanGoal = 'hypertrophy' | 'strength' | 'both';
export type PlanSplit = 'full_body' | 'upper_lower';
export type PlanLevel = 'novice' | 'intermediate' | 'advanced';

export type PlanCandidate = {
  id: string;
  name: string;
  primaryMuscles: string[];
  compound: boolean;
  /** Recommendation levels, 1 (best) to 9; null when the catalogue has none. */
  strength: number | null;
  hypertrophy: number | null;
  /** 1–5, 5 most stable. */
  stability: number | null;
  /** 1–5, 5 the longest range of motion. */
  rom: number | null;
  /** One side at a time: each set takes about twice as long. */
  unilateral: boolean;
  /** Logged as reps alone — bodyweight work, loaded by the body, not a bar. */
  repsOnly: boolean;
};

export type PlanInput = {
  goal: PlanGoal;
  split: PlanSplit;
  daysPerWeek: number;
  /** The most a session may take, in minutes. Every workout fits inside it. */
  sessionMinutes: number;
  /** Muscle name → 1–2 extra-focus points. */
  focus: Record<string, number>;
  deprioritized: string[];
  level: PlanLevel;
  /** Most popular first: a tie in score goes to the earlier one. */
  candidates: PlanCandidate[];
};

/** One working set: a rep range to land in, and how many reps to leave in reserve. */
export type PlannedSet = { repsMin: number; repsMax: number; rir: number };
export type PlannedExercise = {
  exerciseId: string;
  muscle: string;
  unilateral: boolean;
  restSeconds: number;
  sets: PlannedSet[];
};
export type PlannedWorkout = { name: string; exercises: PlannedExercise[] };
/** `days[i]` is an index into `workouts`, or null for rest. Seven days: one week. */
export type Plan = { workouts: PlannedWorkout[]; days: (number | null)[] };

/** Training days spread across a week, rest in between where it fits. */
const TRAINING_DAYS: Record<number, number[]> = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
};

/**
 * Muscles in the order a workout trains them, big compound work first. A and B
 * lead with different muscles so the two days differ in more than exercise.
 */
const SLOTS = {
  fullA: ['Quads', 'Chest', 'Lats', 'Hamstrings', 'Side Delts', 'Upper Back', 'Glutes', 'Triceps', 'Biceps', 'Calves', 'Abs', 'Rear Delts'],
  fullB: ['Hamstrings', 'Upper Back', 'Front Delts', 'Quads', 'Chest', 'Glutes', 'Biceps', 'Triceps', 'Side Delts', 'Abs', 'Calves', 'Lats'],
  upper: ['Chest', 'Lats', 'Upper Back', 'Side Delts', 'Triceps', 'Biceps', 'Front Delts', 'Rear Delts', 'Forearms', 'Upper Traps'],
  lower: ['Quads', 'Hamstrings', 'Glutes', 'Calves', 'Adductors', 'Abs', 'Lower Back', 'Obliques', 'Abductors'],
};

/** Small muscles recover fast and respond to higher reps. */
const SMALL = new Set(['Side Delts', 'Rear Delts', 'Calves', 'Abs', 'Obliques', 'Forearms', 'Neck', 'Tibs', 'Abductors']);

/** More exercises than this is a marathon, however long the session may run. */
const MAX_EXERCISES = 10;

/** How long one set takes to do, in seconds; a unilateral set is both sides. */
const SET_SECONDS = 40;
const UNILATERAL_SET_SECONDS = 75;
/** Moving to the next exercise and setting it up. */
const CHANGEOVER_SECONDS = 60;

export type EstimateItem = { sets: number; restSeconds: number | null; unilateral?: boolean };

/**
 * A workout's length: every set's work, the rest between an exercise's sets
 * and a changeover per exercise. The generator fits workouts to it and the
 * workout overview shows it, so the two always agree.
 */
export function estimateWorkoutSeconds(items: EstimateItem[], defaultRestSeconds = DEFAULT_REST_SECONDS): number {
  return items.reduce((total, { sets, restSeconds, unilateral }) => {
    if (sets === 0) return total;
    const work = sets * (unilateral ? UNILATERAL_SET_SECONDS : SET_SECONDS);
    return total + work + (sets - 1) * (restSeconds ?? defaultRestSeconds) + CHANGEOVER_SECONDS;
  }, 0);
}

/** The same in whole minutes, rounded up, so a short workout never reads 0 min. */
export function estimateWorkoutMinutes(items: EstimateItem[], defaultRestSeconds?: number): number {
  return Math.ceil(estimateWorkoutSeconds(items, defaultRestSeconds) / 60);
}

/**
 * The rep range for one exercise. Strength goes heavy and low on compounds,
 * hypertrophy moderate. Small muscles, unstable setups (where balance gives out
 * before the muscle does) and bodyweight movements (loaded by reps, not plates)
 * all move the range up.
 */
export function repRange(
  goal: PlanGoal,
  c: Pick<PlanCandidate, 'compound' | 'stability' | 'repsOnly'>,
  muscle: string,
): { min: number; max: number } {
  let [min, max] =
    goal === 'strength' ? (c.compound ? [4, 6] : [8, 10])
      : goal === 'both' ? (c.compound ? [5, 8] : [8, 12])
        : c.compound ? [7, 9] : [10, 12];
  if (!c.compound && SMALL.has(muscle)) [min, max] = [min + 2, max + 3];
  if ((c.stability ?? 3) <= 2) [min, max] = [min + 2, max + 2];
  if (c.repsOnly) [min, max] = [Math.max(min, 8), Math.max(max, 12)];
  return { min, max };
}

/**
 * Reps in reserve per set: the first a little further from failure to settle
 * into the weight, the rest at the target. Compounds stop further from failure
 * than isolations — form goes on them first — and so does a novice, still
 * learning where failure is.
 */
export function rirScheme(sets: number, compound: boolean, level: PlanLevel): number[] {
  const target = (compound ? 2 : 1) + (level === 'novice' ? 1 : 0);
  return Array.from({ length: sets }, (_, i) => (i === 0 && sets > 1 ? target + 1 : target));
}

/** Rest between sets: longer after heavy compound work. */
export function restSeconds(goal: PlanGoal, compound: boolean): number {
  if (!compound) return goal === 'strength' ? 120 : 90;
  return goal === 'strength' ? 180 : goal === 'both' ? 150 : 120;
}

/** Working sets before focus: fewer for a novice's isolations, more for an advanced lifter's compounds. */
function baseSets(level: PlanLevel, compound: boolean): number {
  if (level === 'novice') return compound ? 3 : 2;
  if (level === 'advanced') return compound ? 4 : 3;
  return 3;
}

function templates(split: PlanSplit, daysPerWeek: number): { name: string; slots: string[] }[] {
  if (split === 'upper_lower') {
    const all = [
      { name: 'Upper A', slots: SLOTS.upper },
      { name: 'Lower A', slots: SLOTS.lower },
      { name: 'Upper B', slots: SLOTS.upper },
      { name: 'Lower B', slots: SLOTS.lower },
    ];
    // Two or three days a week: one upper and one lower workout, alternating.
    return daysPerWeek < 4 ? all.slice(0, 2) : all;
  }
  const all = [
    { name: 'Workout A', slots: SLOTS.fullA },
    { name: 'Workout B', slots: SLOTS.fullB },
  ];
  return daysPerWeek === 1 ? all.slice(0, 1) : all;
}

/**
 * Focused muscles move to the front, most points first; deprioritized ones
 * drop out. A focused muscle a template lacks is added — asking for more
 * calves should get calves on every day.
 */
function prioritise(slots: string[], focus: Record<string, number>, deprioritized: string[]): string[] {
  const focused = Object.entries(focus)
    .filter(([, points]) => points > 0)
    .sort(([a, pa], [b, pb]) => pb - pa || slots.indexOf(a) - slots.indexOf(b))
    .map(([muscle]) => muscle);
  return [...focused, ...slots.filter((m) => !focused.includes(m))].filter((m) => !deprioritized.includes(m));
}

/**
 * Lower is better. The goal's recommendation level first; then a novice gets
 * the more stable variation, hypertrophy the longer range of motion, and each
 * slot the kind it is for — big lifts first, isolation after.
 */
function score(c: PlanCandidate, input: PlanInput, wantCompound: boolean): number {
  const { goal, level } = input;
  const rec =
    goal === 'strength' ? c.strength
      : goal === 'hypertrophy' ? c.hypertrophy
        : c.strength === null || c.hypertrophy === null ? null : Math.max(c.strength, c.hypertrophy);
  let s = rec ?? 10;
  if (level === 'novice') s += (5 - (c.stability ?? 3)) * 0.4;
  if (goal !== 'strength') s -= ((c.rom ?? 3) - 3) * 0.2;
  if (wantCompound !== c.compound) s += 1;
  return s;
}

function planned(c: PlanCandidate, muscle: string, sets: number, input: PlanInput): PlannedExercise {
  const { min, max } = repRange(input.goal, c, muscle);
  return {
    exerciseId: c.id,
    muscle,
    unilateral: c.unilateral,
    restSeconds: restSeconds(input.goal, c.compound),
    sets: rirScheme(sets, c.compound, input.level).map((rir) => ({ repsMin: min, repsMax: max, rir })),
  };
}

const lengthOf = (list: PlannedExercise[]) =>
  estimateWorkoutSeconds(list.map((e) => ({ sets: e.sets.length, restSeconds: e.restSeconds, unilateral: e.unilateral })));

export function generatePlan(input: PlanInput): Plan {
  const days = Math.min(Math.max(Math.round(input.daysPerWeek), 1), 7);
  const budget = input.sessionMinutes * 60;
  const used = new Set<string>();

  const workouts = templates(input.split, days).map(({ name, slots }) => {
    const exercises: PlannedExercise[] = [];
    for (const muscle of prioritise(slots, input.focus, input.deprioritized)) {
      if (exercises.length >= MAX_EXERCISES) break;
      const wantCompound = exercises.length < 3;
      // Stable sort: ties keep the candidates' order, most popular first.
      const best = input.candidates
        .filter((c) => c.primaryMuscles.includes(muscle) && !used.has(c.id))
        .sort((a, b) => score(a, input, wantCompound) - score(b, input, wantCompound))[0];
      if (!best) continue;

      // Focus points are extra sets. When the session cannot take them all,
      // a smaller dose still beats leaving the muscle out.
      const wanted = baseSets(input.level, best.compound) + (input.focus[muscle] ?? 0);
      let fitted: PlannedExercise | null = null;
      for (let sets = wanted; sets >= 2 && !fitted; sets--) {
        const next = planned(best, muscle, sets, input);
        if (lengthOf([...exercises, next]) <= budget) fitted = next;
      }
      if (!fitted) break; // The session is full.
      used.add(best.id);
      exercises.push(fitted);
    }
    return { name, exercises };
  });

  const week: (number | null)[] = Array.from({ length: 7 }, () => null);
  TRAINING_DAYS[days]!.forEach((day, n) => {
    week[day] = n % workouts.length;
  });
  return { workouts, days: week };
}
