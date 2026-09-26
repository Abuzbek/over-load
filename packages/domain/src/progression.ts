/**
 * Smart progression: next session's weight and reps for each planned set, from
 * what was logged last time. Pure — the history, the plan and the weights the
 * gym can make come in; suggestions come out.
 *
 * The model is one number per exercise: an estimated one-rep max (Epley),
 * taken from each logged set's reps to failure — reps done plus reps left in
 * reserve. To progress, the next session aims one rep of capacity above the
 * best set; each planned set then gets the heaviest weight the equipment can
 * make at which the reps, less that set's target RIR, land in its range. A set
 * logged harder than planned lowers the estimate, so recommendations can drop:
 * they follow what was done, they do not punish it.
 */

export type LoggedSet = {
  weightKg: number | null;
  reps: number | null;
  /** Reps in reserve as logged; null falls back to the RIR the set was planned at. */
  rir: number | null;
  partialReps?: number | null;
  /** The RIR the set was planned at, when it was not logged. */
  targetRir?: number | null;
};

export type SetPlan = { repsMin: number; repsMax: number; rir: number };
export type Suggestion = { weightKg: number | null; reps: number };

/** A set logged with no RIR, and no plan to say what it aimed for, is taken as two short of failure. */
const DEFAULT_RIR = 2;
/** A partial rep is worth half a full one. */
const PARTIAL_WEIGHT = 0.5;
/** With no equipment list, weights round to this. */
const FALLBACK_STEP_KG = 2.5;

export function estimatedOneRepMax(weightKg: number, repsToFailure: number): number {
  return weightKg * (1 + repsToFailure / 30);
}

/** Reps to failure at a weight, for an estimated one-rep max (Epley, inverted). */
export function repsToFailureAt(oneRepMaxKg: number, weightKg: number): number {
  return 30 * (oneRepMaxKg / weightKg - 1);
}

const repsToFailure = (s: LoggedSet) =>
  (s.reps ?? 0) + (s.partialReps ?? 0) * PARTIAL_WEIGHT + (s.rir ?? s.targetRir ?? DEFAULT_RIR);

/**
 * The next session's sets, one suggestion per plan, or null with nothing
 * logged to go on. `loadable` is every weight the equipment can make, in kg;
 * null means any weight, rounded to 2.5 kg. A reps-only exercise (no weights
 * logged) gets reps alone: one more rep of capacity than last time.
 */
export function suggestSets(last: LoggedSet[], plans: SetPlan[], loadable: number[] | null): Suggestion[] | null {
  const done = last.filter((s) => s.reps !== null && s.reps > 0);
  if (done.length === 0 || plans.length === 0) return null;

  const weighted = done.filter((s) => s.weightKg !== null && s.weightKg > 0);
  if (weighted.length === 0) {
    const capacity = Math.max(...done.map(repsToFailure)) + 1;
    return plans.map((p) => ({ weightKg: null, reps: Math.max(Math.round(capacity - p.rir), p.repsMin) }));
  }

  // The best set, one rep of capacity up: the progression.
  const best = weighted.reduce((a, b) =>
    estimatedOneRepMax(b.weightKg!, repsToFailure(b)) > estimatedOneRepMax(a.weightKg!, repsToFailure(a)) ? b : a,
  );
  const target = estimatedOneRepMax(best.weightKg!, repsToFailure(best) + 1);

  const weights = candidates(loadable, target);
  return plans.map((plan) => pick(weights, target, plan));
}

/** Every weight worth trying: the equipment's, or a 2.5 kg grid up to the estimated max. */
function candidates(loadable: number[] | null, oneRepMaxKg: number): number[] {
  const list = loadable?.filter((w) => w > 0) ?? [];
  if (list.length > 0) return [...new Set(list)].sort((a, b) => a - b);
  const top = Math.ceil(oneRepMaxKg / FALLBACK_STEP_KG);
  return Array.from({ length: top }, (_, i) => (i + 1) * FALLBACK_STEP_KG);
}

function repsAt(oneRepMaxKg: number, weightKg: number, rir: number): number {
  return Math.floor(repsToFailureAt(oneRepMaxKg, weightKg) + 1e-9) - rir;
}

/**
 * The heaviest weight whose reps land in the range. None in range: the
 * heaviest that still reaches the bottom of it (light equipment — more reps,
 * as the next weight up would be too big a jump); none that heavy: the
 * lightest, for what it gives.
 */
function pick(weights: number[], oneRepMaxKg: number, plan: SetPlan): Suggestion {
  let reaching: Suggestion | null = null;
  for (let i = weights.length - 1; i >= 0; i--) {
    const w = weights[i]!;
    const reps = repsAt(oneRepMaxKg, w, plan.rir);
    if (reps >= plan.repsMin && reps <= plan.repsMax) return { weightKg: w, reps };
    if (reps >= plan.repsMin && !reaching) reaching = { weightKg: w, reps };
  }
  if (reaching) return reaching;
  const lightest = weights[0]!;
  return { weightKg: lightest, reps: Math.max(repsAt(oneRepMaxKg, lightest, plan.rir), 1) };
}

/**
 * Every total a bar and plates can make, one of each plate size per side as
 * often as wanted, up to `maxKg`. Plates are in kg; totals come back to the gram.
 */
export function barTotals(barKg: number, plateSizesKg: number[], maxKg = 400): number[] {
  return pairTotals(plateSizesKg, maxKg - barKg).map((kg) => Math.round((barKg + kg) * 1000) / 1000);
}

/** Every weight a pair of equal loads can make: plates on both sides, or on both arms of a machine. */
export function pairTotals(plateSizesKg: number[], maxKg = 400): number[] {
  // In 50 g units, so 1.25 kg plates and the like stay whole numbers.
  const unit = 0.05;
  const sizes = [...new Set(plateSizesKg.filter((p) => p > 0).map((p) => Math.round(p / unit)))];
  const limit = Math.floor(maxKg / 2 / unit);
  const reachable = new Uint8Array(limit + 1);
  reachable[0] = 1;
  for (let s = 1; s <= limit; s++) reachable[s] = sizes.some((p) => p <= s && reachable[s - p]) ? 1 : 0;
  const out: number[] = [];
  for (let s = 0; s <= limit; s++) if (reachable[s]) out.push(Math.round(s * unit * 2 * 1000) / 1000);
  return out;
}
