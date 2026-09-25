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
  /** The muscle the exercise is for (mainMuscleOf). */
  mainMuscle: string;
  /** The muscles it trains hard, then in support. */
  primaryMuscles: string[];
  secondaryMuscles: string[];
  /** A compound for this goal (the catalogue's primary or secondary compound). */
  compound: boolean;
  /** A primary compound: the big lift a workout is built around. */
  primaryCompound: boolean;
  /**
   * Variants too alike to both be in a program (the catalogue's exclusion
   * groupings): a pin-loaded and a plate-loaded pullover, say.
   */
  exclusionGroups: string[];
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
 * Muscles in the order a workout trains them, big compound work first. Each
 * full-body day leads with different muscles so the days differ in more than
 * exercise.
 */
const SLOTS = {
  full: [
    ['Quads', 'Chest', 'Lats', 'Hamstrings', 'Side Delts', 'Upper Back', 'Glutes', 'Triceps', 'Biceps', 'Calves', 'Abs', 'Rear Delts'],
    ['Hamstrings', 'Upper Back', 'Front Delts', 'Quads', 'Chest', 'Glutes', 'Biceps', 'Triceps', 'Side Delts', 'Abs', 'Calves', 'Lats'],
    ['Glutes', 'Lats', 'Chest', 'Quads', 'Hamstrings', 'Side Delts', 'Triceps', 'Biceps', 'Rear Delts', 'Upper Back', 'Calves', 'Abs'],
  ],
  upper: ['Chest', 'Lats', 'Upper Back', 'Side Delts', 'Triceps', 'Biceps', 'Front Delts', 'Rear Delts', 'Forearms', 'Upper Traps'],
  lower: ['Quads', 'Hamstrings', 'Glutes', 'Calves', 'Adductors', 'Abs', 'Lower Back', 'Obliques', 'Abductors'],
};

/**
 * The muscle a movement pattern is for, where the pattern says more than the
 * catalogue's muscle order does: it lists primaries in no particular order, so
 * a lat pulldown's first is Biceps and a back squat's Glutes.
 */
const PATTERN_MUSCLE: Record<string, string> = {
  'Horizontal Push': 'Chest',
  'Vertical Push': 'Front Delts',
  'Horizontal Pull': 'Upper Back',
  'Vertical Pull': 'Lats',
  'Lat Accessory': 'Lats',
  Squat: 'Quads',
  'Lunge/Split Squat/Step Up/Single Leg Squat': 'Quads',
  'Hip Hinge': 'Hamstrings',
  'Glute Max Accessory': 'Glutes',
};

/** The first pattern's muscle, if the exercise trains it as a primary; else its first primary. */
export function mainMuscleOf(patterns: string[], primaryMuscles: string[]): string | undefined {
  for (const p of patterns) {
    const m = PATTERN_MUSCLE[p];
    if (m && primaryMuscles.includes(m)) return m;
  }
  return primaryMuscles[0];
}

/**
 * Muscles the big lifts already train, that get little of their own: half the
 * weekly target, unless focused.
 */
const MINOR = new Set(['Adductors', 'Abductors', 'Obliques', 'Lower Back', 'Forearms', 'Upper Traps', 'Neck', 'Tibs', 'Hip flexors', 'Serratus']);

/** How much one set counts for a muscle: the one it is for, the other primaries, the supporting ones. */
const CREDIT = { main: 1, primary: 0.5, secondary: 0.25 };

/** Muscles a compound lift is for; the rest get isolation work. */
const BIG = new Set(['Quads', 'Chest', 'Lats', 'Upper Back', 'Hamstrings', 'Glutes', 'Front Delts']);

/** Small muscles recover fast and respond to higher reps. */
const SMALL = new Set(['Side Delts', 'Rear Delts', 'Calves', 'Abs', 'Obliques', 'Forearms', 'Neck', 'Tibs', 'Abductors']);

/** The smallest shortfall, in sets, that earns a muscle its own exercise. */
const MIN_GAP = 2;

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

/** Working sets per exercise before focus: fewer for a novice's isolations, more for an advanced lifter's compounds. */
function baseSets(level: PlanLevel, compound: boolean): number {
  if (level === 'novice') return compound ? 3 : 2;
  if (level === 'advanced') return compound ? 4 : 3;
  return 3;
}

/**
 * Hard sets a muscle should get in a week. Around ten is the usual target for
 * growth, fewer for a novice; each focus point adds half again. A
 * deprioritized muscle gets none of its own — it still gets whatever the
 * other exercises give it.
 */
export function weeklySetTarget(level: PlanLevel, points: number, muscle?: string): number {
  const base = level === 'novice' ? 6 : level === 'advanced' ? 12 : 9;
  if (points === 0 && muscle && MINOR.has(muscle)) return base / 2;
  return base * (1 + 0.5 * points);
}

/** Past this a muscle gets no more sets, however much time is left. */
function weeklySetCap(level: PlanLevel, points: number, muscle: string): number {
  return Math.min(weeklySetTarget(level, points, muscle) * 1.6, 24);
}

const LETTERS = 'ABCDEFG';

/**
 * One workout per training day, each its own: a cycle is one pass through
 * them, and the next cycle starts again at the first. Upper and lower
 * alternate; full-body days rotate which muscles lead.
 */
function templates(split: PlanSplit, days: number): { name: string; slots: string[] }[] {
  return Array.from({ length: days }, (_, i) => {
    if (split === 'upper_lower') {
      const upper = i % 2 === 0;
      return { name: `${upper ? 'Upper' : 'Lower'} ${LETTERS[Math.floor(i / 2)]}`, slots: upper ? SLOTS.upper : SLOTS.lower };
    }
    const base = SLOTS.full[i % SLOTS.full.length]!;
    // Past three days, rotate the order again so no two days lead alike.
    const shift = Math.floor(i / SLOTS.full.length) * 3;
    return { name: `Workout ${LETTERS[i]}`, slots: [...base.slice(shift), ...base.slice(0, shift)] };
  });
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

/** 0 a primary compound, 1 another compound, 2 isolation or core. */
const tier = (c: PlanCandidate) => (c.primaryCompound ? 0 : c.compound ? 1 : 2);

/**
 * Lower is better. The goal's recommendation level first; then a novice gets
 * the more stable variation, hypertrophy the longer range of motion, and each
 * slot the kind it is for: a workout opens with primary compounds, then other
 * compounds, then isolation. Heavier than the slot asks is fine.
 */
function score(c: PlanCandidate, input: PlanInput, wantTier: number): number {
  const { goal, level } = input;
  const rec =
    goal === 'strength' ? c.strength
      : goal === 'hypertrophy' ? c.hypertrophy
        : c.strength === null || c.hypertrophy === null ? null : Math.max(c.strength, c.hypertrophy);
  let s = rec ?? 10;
  if (level === 'novice') s += (5 - (c.stability ?? 3)) * 0.4;
  if (goal !== 'strength') s -= ((c.rom ?? 3) - 3) * 0.2;
  s += 2 * Math.max(tier(c) - wantTier, 0);
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

/**
 * Builds each workout by volume. Every muscle has a weekly set target
 * (weeklySetTarget), split across the days that train it; the workout keeps
 * adding the best exercise *for* the muscle furthest behind its target —
 * focused muscles weigh more — until the session's time is used. Each
 * exercise counts against every muscle it trains, a full set for a primary and
 * half for a secondary, so a squat's glute work is not paid for twice.
 */
export function generatePlan(input: PlanInput): Plan {
  const days = Math.min(Math.max(Math.round(input.daysPerWeek), 1), 7);
  const budget = input.sessionMinutes * 60;
  const used = new Set<string>();
  const shapes = templates(input.split, days);

  // How often each workout comes round in a week.
  const occurrences = shapes.map((_, w) => TRAINING_DAYS[days]!.filter((__, n) => n % shapes.length === w).length);
  const slotsOf = shapes.map(({ slots }) => prioritise(slots, input.focus, input.deprioritized));

  // What is left of each muscle's weekly target, across the whole week: a
  // workout sees what the ones before it already gave, times how often they
  // repeat. So Workout B does not redo the front delts Workout A's presses trained.
  const remaining = new Map<string, number>();
  const points = (m: string) => input.focus[m] ?? 0;
  for (const slots of slotsOf) for (const m of slots) remaining.set(m, weeklySetTarget(input.level, points(m), m));
  // Groups already in the program; a second variant from one is a near-duplicate.
  const usedGroups = new Set<string>();
  // The days each muscle is trained: about three sets a day, so a muscle with
  // nine sets a week gets three days of the five, not five days of too little
  // to be worth an exercise. Spread evenly, each muscle starting on a
  // different day so no day is left with nothing.
  const trainedOn = new Map<string, Set<number>>();
  [...remaining.keys()].forEach((m, k) => {
    const open = slotsOf.flatMap((slots, w) => (slots.includes(m) ? [w] : []));
    const n = Math.min(Math.max(Math.round(remaining.get(m)! / 3), 1), open.length);
    trainedOn.set(m, new Set(Array.from({ length: n }, (_, j) => open[(Math.floor((j * open.length) / n) + k) % open.length]!)));
  });
  // Sessions from workout w on that train the muscle, to share what is left between.
  const sessionsLeft = (m: string, from: number) =>
    [...trainedOn.get(m)!].reduce((n, w) => n + (w >= from ? occurrences[w]! : 0), 0);

  const byId = new Map(input.candidates.map((c) => [c.id, c]));
  // Takes `sets` of c, done in workout w, off every muscle it trains — this
  // session's deficit, if given, and the week's remaining.
  const credit = (c: PlanCandidate, sets: number, w: number, deficit?: Map<string, number>) => {
    const give = (m: string, n: number) => {
      if (deficit?.has(m)) deficit.set(m, deficit.get(m)! - n);
      if (remaining.has(m)) remaining.set(m, remaining.get(m)! - n * occurrences[w]!);
    };
    for (const m of c.primaryMuscles) give(m, sets * (m === c.mainMuscle ? CREDIT.main : CREDIT.primary));
    for (const m of c.secondaryMuscles) give(m, sets * CREDIT.secondary);
  };

  // First every day gets its exercises; only then does spare time buy extra
  // sets. Filling day A first would spend the week before day E was planned.
  const workouts = shapes.map(({ name }, w) => {
    const slots = slotsOf[w]!;
    // This session's share of what is left.
    // Nothing due for a muscle this isn't one of its days; it still takes the credit.
    const deficit = new Map(slots.map((m) => [m, trainedOn.get(m)!.has(w) ? remaining.get(m)! / Math.max(sessionsLeft(m, w), 1) : 0]));
    const skipped = new Set<string>();
    const exercises: PlannedExercise[] = [];

    while (exercises.length < MAX_EXERCISES) {
      // Focused muscles first while they are still behind; among them, one
      // not yet in this workout before a second exercise for one that is;
      // then whichever is furthest behind. Ties keep slot order. A gap under
      // two sets is not worth an exercise, and a muscle gets one exercise a
      // workout (two if focused).
      const focused = (m: string) => ((input.focus[m] ?? 0) > 0 ? 1 : 0);
      const count = (m: string) => exercises.filter((e) => e.muscle === m).length;
      const muscle = slots
        .filter((m) => !skipped.has(m) && deficit.get(m)! >= MIN_GAP && count(m) < 1 + focused(m))
        .sort((a, b) => focused(b) - focused(a) || count(a) - count(b) || deficit.get(b)! - deficit.get(a)!)[0];
      if (!muscle) break;

      // A big muscle gets a compound — a primary one while the workout has
      // fewer than two — and a small one isolation.
      const primaries = exercises.filter((e) => tier(byId.get(e.exerciseId)!) === 0).length;
      const wantTier = !BIG.has(muscle) ? 2 : primaries < 2 ? 0 : 1;
      // Stable sort: ties keep the candidates' order, most popular first. An
      // exercise *for* this muscle, if there is one; else one that trains it.
      // Never a near-duplicate of one already in the program, unless nothing else is left.
      const fresh = input.candidates.filter((c) => !used.has(c.id));
      const distinct = fresh.filter((c) => !c.exclusionGroups.some((g) => usedGroups.has(g)));
      const pick = (from: PlanCandidate[]) => {
        const pool = from.filter((c) => c.mainMuscle === muscle);
        return (pool.length > 0 ? pool : from.filter((c) => c.primaryMuscles.includes(muscle)))
          .sort((a, b) => score(a, input, wantTier) - score(b, input, wantTier))[0];
      };
      // Last resort, with many days and a small gym: one another day already
      // has, never one twice in the same workout.
      const best = pick(distinct) ?? pick(fresh) ?? pick(input.candidates.filter((c) => !exercises.some((e) => e.exerciseId === c.id)));
      if (!best) {
        skipped.add(muscle);
        continue;
      }

      // Enough sets to close the gap, within reason; fewer if time is short.
      // Focus adds sets later, once every muscle that needs one has an exercise.
      const wanted = Math.min(Math.max(Math.round(deficit.get(muscle)!), 2), baseSets(input.level, best.compound));
      let fitted: PlannedExercise | null = null;
      for (let sets = wanted; sets >= 2 && !fitted; sets--) {
        const next = planned(best, muscle, sets, input);
        if (lengthOf([...exercises, next]) <= budget) fitted = next;
      }
      if (!fitted) {
        skipped.add(muscle); // No room for this one; a smaller exercise may still fit.
        continue;
      }
      used.add(best.id);
      for (const g of best.exclusionGroups) usedGroups.add(g);
      credit(best, fitted.sets.length, w, deficit);
      exercises.push(fitted);
    }
    return { name, exercises };
  });

  workouts.forEach(({ exercises }, w) => {
    const slots = slotsOf[w]!;

    // Time left over: one more set at a time where it helps most — focused
    // muscles first, then the one furthest from its weekly target — until the
    // session is full or every muscle is at its cap. A user who asked for an
    // hour should not get half of one.
    const target = (m: string) => weeklySetTarget(input.level, points(m), m);
    const given = (m: string) => target(m) - remaining.get(m)!;
    // The weekly cap, pro rata to the muscle's days so far: filling the first
    // days to the week's cap would leave the last ones nothing to do.
    const capSoFar = (m: string) =>
      (weeklySetCap(input.level, points(m), m) * (sessionsLeft(m, 0) - sessionsLeft(m, w + 1))) / Math.max(sessionsLeft(m, 0), 1);
    const full = new Set<PlannedExercise>();
    for (;;) {
      const next = exercises
        .filter((e) => !full.has(e))
        .filter((e) => e.sets.length < Math.min(baseSets(input.level, byId.get(e.exerciseId)!.compound) + 1 + points(e.muscle), 5))
        .filter((e) => (points(e.muscle) > 0 || !MINOR.has(e.muscle)) && given(e.muscle) + occurrences[w]! <= capSoFar(e.muscle))
        .sort((a, b) => points(b.muscle) - points(a.muscle) || given(a.muscle) / target(a.muscle) - given(b.muscle) / target(b.muscle))[0];
      if (!next) break;
      const last = next.sets[next.sets.length - 1]!;
      next.sets.push({ ...last });
      if (lengthOf(exercises) > budget) {
        next.sets.pop();
        full.add(next);
        continue;
      }
      credit(byId.get(next.exerciseId)!, 1, w);
    }

    // Big lifts first, while fresh; then the template's order — focused
    // muscles first, big to small — not the order they were chosen in.
    exercises.sort(
      (a, b) => tier(byId.get(a.exerciseId)!) - tier(byId.get(b.exerciseId)!) || slots.indexOf(a.muscle) - slots.indexOf(b.muscle),
    );
  });

  const week: (number | null)[] = Array.from({ length: 7 }, () => null);
  TRAINING_DAYS[days]!.forEach((day, n) => {
    week[day] = n % workouts.length;
  });
  return { workouts, days: week };
}
