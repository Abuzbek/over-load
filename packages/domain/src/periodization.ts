/**
 * Periodization: how a program's plan changes from cycle to cycle across a
 * block of seven, the last a deload, after which the block repeats. Pure — an
 * exercise's base plan (its first cycle) and the cycle number in, that cycle's
 * sets out. Loads are not set here: smart progression fills them from what was
 * lifted, against whatever this returns.
 *
 * By goal. Hypertrophy — and isolation work for any goal — keeps its rep
 * range and tapers reps in reserve towards failure, finishing with failure
 * sets. Compounds for strength or both alternate a moderate cycle (the base
 * range) with a heavy one (2–4 reps, then sets to failure), effort rising each
 * pair. The deload drops a set and stops well short of failure.
 *
 * Three rules on top, after MacroFactor's generated programs: a heavy barbell
 * compound never goes to failure (reps in reserve floor at 1), bar one low-rep
 * set in the strength scheme's hardest cycle; a bodyweight exercise, which
 * cannot add load, adds a rep to its range each cycle; and isolation work
 * rotates through three rep zones — the plan's, higher, lower — a cycle each.
 */

import type { SetType } from './sets';
import type { PlanGoal } from './programPlan';

export type CycleSet = { repsMin: number; repsMax: number | null; rir: number; setType: SetType };
export type DeloadAt = 'none' | 'first' | 'last';
export type CycleOptions = {
  goal: PlanGoal;
  compound: boolean;
  deload: DeloadAt;
  /** Cycles in a block; 7 unless the program says. */
  cycleCount?: number;
  /** Loaded on a barbell (or trap bar): with `compound`, kept off failure. */
  barbell?: boolean;
  /** Logged by reps alone: progresses by the rep range, a rep a cycle. */
  bodyweight?: boolean;
};

export const BLOCK_CYCLES = 7;
/** The scheme's training cycles: the block's positions other than the deload. */
const SCHEME_STEPS = 6;
/** Reps "to failure" sets aim at least this many of, whatever the load. */
const FAILURE_MIN_REPS = 2;
const HEAVY = { min: 2, max: 4 };

/** An isolation's rep zones, as offsets from its plan's range: the plan's, higher, lower. */
const ZONES = [0, 4, -3];
const ZONE_MIN_REPS = 5;
const ZONE_MAX_WIDTH = 3;

const failure = (repsMin: number): CycleSet => ({ repsMin, repsMax: null, rir: 0, setType: 'failure' });

/** Where a cycle falls in its block, 1 to the cycle count; the block repeats after the last. */
export function blockPosition(cycle: number, cycleCount = BLOCK_CYCLES): number {
  return ((Math.max(Math.round(cycle), 1) - 1) % Math.max(cycleCount, 1)) + 1;
}

export function isDeloadCycle(cycle: number, deload: DeloadAt, cycleCount = BLOCK_CYCLES): boolean {
  const position = blockPosition(cycle, cycleCount);
  return cycleCount > 1 && ((deload === 'first' && position === 1) || (deload === 'last' && position === cycleCount));
}

/**
 * Which of the scheme's six training steps a cycle is: the block's training
 * cycles, however many, spread evenly from the first step to the last.
 */
export function schemeStep(cycle: number, deload: DeloadAt, cycleCount = BLOCK_CYCLES): number {
  const count = Math.max(cycleCount, 1);
  const training = count - (count > 1 && deload !== 'none' ? 1 : 0);
  const index = blockPosition(cycle, count) - 1 - (count > 1 && deload === 'first' ? 1 : 0);
  return training <= 1 ? 1 : 1 + Math.round((index * (SCHEME_STEPS - 1)) / (training - 1));
}

/**
 * One exercise's working sets for a cycle. `base` is its plan for the first
 * cycle: the set count, the rep range and the RIR it works at (the first set's
 * extra rep of reserve is the scheme's own). Warm-ups are not passed in.
 */
export function cyclePlan(base: { repsMin: number; repsMax: number | null; rir: number }[], cycle: number, options: CycleOptions): CycleSet[] {
  const sets = scheme(base, cycle, options);
  if (!options.barbell || !options.compound || isDeloadCycle(cycle, options.deload, options.cycleCount ?? BLOCK_CYCLES)) return sets;
  // A heavy barbell compound stops short of failure: failure sets become sets at
  // 1 in reserve, in the range they belong to — except the strength scheme's
  // last heavy set of its hardest cycle, one low-rep set to failure.
  const repsMin = base[0]!.repsMin;
  const repsMax = base[0]!.repsMax ?? repsMin;
  const hardest = sets.some((s) => s.repsMin === HEAVY.min) && schemeStep(cycle, options.deload, options.cycleCount) === SCHEME_STEPS;
  return sets.map((s, i) => {
    if (s.setType !== 'failure') return { ...s, rir: Math.max(s.rir, 1) };
    if (hardest && i === sets.length - 1) return s;
    return s.repsMin === FAILURE_MIN_REPS
      ? { repsMin: HEAVY.min, repsMax: HEAVY.max, rir: 1, setType: 'normal' }
      : { repsMin: s.repsMin, repsMax: s.repsMin === repsMin ? repsMax : s.repsMin + 2, rir: 1, setType: 'normal' };
  });
}

/** Which training cycle of the block this is, from 0; the deload is not counted. */
function trainingIndex(cycle: number, deload: DeloadAt, cycleCount: number): number {
  return blockPosition(cycle, cycleCount) - 1 - (cycleCount > 1 && deload === 'first' ? 1 : 0);
}

function scheme(base: { repsMin: number; repsMax: number | null; rir: number }[], cycle: number, options: CycleOptions): CycleSet[] {
  const n = base.length;
  if (n === 0) return [];
  const count = options.cycleCount ?? BLOCK_CYCLES;
  const deloading = isDeloadCycle(cycle, options.deload, count);
  const index = deloading ? 0 : trainingIndex(cycle, options.deload, count);
  let repsMin = base[0]!.repsMin;
  let repsMax = base[0]!.repsMax ?? repsMin;
  if (options.bodyweight) {
    // No load to add: the range climbs a rep a cycle.
    repsMin += index;
    repsMax += index;
  } else if (!options.compound) {
    const zone = ZONES[index % ZONES.length]!;
    // The plan's own zone keeps its width; the others are at most three reps wide.
    const width = zone === 0 ? repsMax - repsMin : Math.min(repsMax - repsMin, ZONE_MAX_WIDTH);
    repsMin = Math.max(repsMin + zone, ZONE_MIN_REPS);
    repsMax = repsMin + width;
  }
  // The RIR the exercise works at: the base's last set, past the first set's settling rep.
  const t = base[n - 1]!.rir;
  const at = (rir: number) => Math.max(rir, 0);
  const position = schemeStep(cycle, options.deload, count);

  if (deloading) {
    const sets = Math.max(n - 1, 1);
    return Array.from({ length: sets }, (_, i) => ({
      repsMin,
      repsMax: i === 0 ? repsMin : Math.min(repsMin + 1, repsMax),
      rir: i === 0 ? 3 : 5,
      setType: 'normal' as const,
    }));
  }

  const moderate = (rirs: number[], lastFailures = 0): CycleSet[] =>
    Array.from({ length: n }, (_, i) =>
      i >= n - lastFailures ? failure(repsMin) : { repsMin, repsMax, rir: at(rirs[Math.min(i, rirs.length - 1)]!), setType: 'normal' as const },
    );

  const undulating = (options.goal === 'strength' || options.goal === 'both') && options.compound;
  if (!undulating) {
    switch (position) {
      case 1: return moderate([t + 1, t]);
      case 2: return moderate([t]);
      case 3: return moderate([t, t - 1]);
      case 4: return moderate([t - 1]);
      case 5: return moderate([t - 1], 1);
      default: return moderate([t - 1, t - 2], Math.max(n - 2, 1));
    }
  }

  // Odd cycles moderate, even cycles heavy: two sets at 2–4, the rest to failure.
  const heavy = (first: number, second: number): CycleSet[] =>
    Array.from({ length: n }, (_, i) =>
      i === 0 ? { repsMin: HEAVY.min, repsMax: HEAVY.max, rir: at(first), setType: 'normal' as const }
        : i === 1 && n > 2 ? { repsMin: HEAVY.min, repsMax: HEAVY.max, rir: at(second), setType: 'normal' as const }
          : failure(FAILURE_MIN_REPS),
    );
  switch (position) {
    case 1: return moderate([t]);
    case 2: return heavy(t + 1, t);
    case 3: return moderate([t - 1]);
    case 4: return heavy(t, t - 1);
    case 5: return moderate([t - 1], 1);
    default: return heavy(t - 1, t - 2);
  }
}

/** Less progress than this over a block counts as a stall. */
export const STALL_PROGRESS = 0.01;

/**
 * After a block: an exercise that stalled (its estimated one-rep max up less
 * than 1% from the block's first session to its last) moves to a fresh rep
 * range of the same width — a high-rep one heavier, a low-rep one lighter —
 * the usual way through a plateau. One that progressed keeps its range (null).
 */
export function retuneRange(repsMin: number, repsMax: number, progress: number): { repsMin: number; repsMax: number } | null {
  if (progress >= STALL_PROGRESS) return null;
  const width = Math.max(repsMax - repsMin, 0);
  const min = repsMin >= 9 ? Math.max(repsMin - 3, 3) : repsMin + 3;
  return { repsMin: min, repsMax: min + width };
}
