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
 */

import type { SetType } from './sets';
import type { PlanGoal } from './programPlan';

export type CycleSet = { repsMin: number; repsMax: number | null; rir: number; setType: SetType };
export type CycleOptions = { goal: PlanGoal; compound: boolean; deload: boolean };

export const BLOCK_CYCLES = 7;
/** Reps "to failure" sets aim at least this many of, whatever the load. */
const FAILURE_MIN_REPS = 2;
const HEAVY = { min: 2, max: 4 };

const failure = (repsMin: number): CycleSet => ({ repsMin, repsMax: null, rir: 0, setType: 'failure' });

/** Where a cycle falls in its block, 1–7; the block repeats after the seventh. */
export function blockPosition(cycle: number): number {
  return ((Math.max(Math.round(cycle), 1) - 1) % BLOCK_CYCLES) + 1;
}

export function isDeloadCycle(cycle: number, deload: boolean): boolean {
  return deload && blockPosition(cycle) === BLOCK_CYCLES;
}

/**
 * One exercise's working sets for a cycle. `base` is its plan for the first
 * cycle: the set count, the rep range and the RIR it works at (the first set's
 * extra rep of reserve is the scheme's own). Warm-ups are not passed in.
 */
export function cyclePlan(base: { repsMin: number; repsMax: number | null; rir: number }[], cycle: number, options: CycleOptions): CycleSet[] {
  const n = base.length;
  if (n === 0) return [];
  const repsMin = base[0]!.repsMin;
  const repsMax = base[0]!.repsMax ?? repsMin;
  // The RIR the exercise works at: the base's last set, past the first set's settling rep.
  const t = base[n - 1]!.rir;
  const at = (rir: number) => Math.max(rir, 0);
  const position = blockPosition(cycle);

  if (isDeloadCycle(cycle, options.deload)) {
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
