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

export type SuggestOptions = {
  /**
   * Resistance the logged weight leaves out: a plate-loaded machine's own, the
   * share of bodyweight a movement lifts. The estimate is of the total; the
   * suggestion is back in the weight you load.
   */
  offsetKg?: number;
  /** One rep of capacity above the best set (between sessions); false re-plans at today's level (mid-session). */
  progress?: boolean;
};

/**
 * The next session's sets, one suggestion per plan, or null with nothing
 * logged to go on. `loadable` is every weight the equipment can make, in kg;
 * null means any weight, rounded to 2.5 kg. A reps-only exercise (no weights
 * logged) gets reps alone: one more rep of capacity than last time.
 */
export function suggestSets(last: LoggedSet[], plans: SetPlan[], loadable: number[] | null, options: SuggestOptions = {}): Suggestion[] | null {
  const { offsetKg = 0, progress = true } = options;
  const done = last.filter((s) => s.reps !== null && s.reps > 0);
  if (done.length === 0 || plans.length === 0) return null;

  const weighted = done.filter((s) => s.weightKg !== null && s.weightKg > 0);
  if (weighted.length === 0) {
    const capacity = Math.max(...done.map(repsToFailure)) + (progress ? 1 : 0);
    return plans.map((p) => ({ weightKg: null, reps: Math.max(Math.round(capacity - p.rir), p.repsMin) }));
  }

  return suggestFromOneRepMax(targetOneRepMax(weighted, offsetKg, progress), plans, loadable, offsetKg);
}

/** The logged set with the highest estimated one-rep max: what the next session builds on. */
export function bestSet(sets: LoggedSet[], offsetKg = 0): LoggedSet | null {
  const weighted = sets.filter((s) => s.weightKg !== null && s.weightKg > 0 && s.reps !== null && s.reps > 0);
  if (weighted.length === 0) return null;
  return weighted.reduce((a, b) =>
    estimatedOneRepMax(b.weightKg! + offsetKg, repsToFailure(b)) > estimatedOneRepMax(a.weightKg! + offsetKg, repsToFailure(a)) ? b : a,
  );
}

/** The estimated one-rep max to plan against, in total resistance: the best set's, one rep up to progress. */
export function targetOneRepMax(sets: LoggedSet[], offsetKg = 0, progress = true): number {
  const best = bestSet(sets, offsetKg)!;
  return estimatedOneRepMax(best.weightKg! + offsetKg, repsToFailure(best) + (progress ? 1 : 0));
}

/** Each plan's weight and reps against an estimated one-rep max (total resistance). */
export function suggestFromOneRepMax(oneRepMaxKg: number, plans: SetPlan[], loadable: number[] | null, offsetKg = 0): Suggestion[] {
  const weights = candidates(loadable, oneRepMaxKg);
  return plans.map((plan) => pick(weights, oneRepMaxKg, plan, offsetKg));
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
 * lightest, for what it gives. Weights are as loaded; reps are predicted on
 * the total, the offset added.
 */
function pick(weights: number[], oneRepMaxKg: number, plan: SetPlan, offsetKg = 0): Suggestion {
  let reaching: Suggestion | null = null;
  for (let i = weights.length - 1; i >= 0; i--) {
    const w = weights[i]!;
    const reps = repsAt(oneRepMaxKg, w + offsetKg, plan.rir);
    if (reps >= plan.repsMin && reps <= plan.repsMax) return { weightKg: w, reps };
    if (reps >= plan.repsMin && !reaching) reaching = { weightKg: w, reps };
  }
  if (reaching) return reaching;
  const lightest = weights[0]!;
  return { weightKg: lightest, reps: Math.max(repsAt(oneRepMaxKg, lightest + offsetKg, plan.rir), 1) };
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

/** What a suggestion was built on, for explaining it. */
export type SuggestionBasis =
  | { kind: 'history'; best: LoggedSet }
  | { kind: 'today'; best: LoggedSet }
  | { kind: 'estimate'; bodyweightKg: number; level: string; pattern: string | null };

/**
 * The wand: why a set is planned at this weight and these reps, in a few plain
 * sentences — what it was built on, the estimate that came out, and how the
 * suggestion fits the plan. `kg` formats a weight in the user's unit.
 */
export function explainSuggestion(
  basis: SuggestionBasis,
  oneRepMaxKg: number,
  plan: SetPlan,
  suggestion: Suggestion,
  kg: (weightKg: number) => string,
  offsetKg = 0,
): string[] {
  const lines: string[] = [];
  const setText = (s: LoggedSet) => `${kg(s.weightKg ?? 0)} × ${s.reps}${s.partialReps ? ` + ${s.partialReps} partial` : ''} at ${s.rir ?? s.targetRir ?? DEFAULT_RIR} RIR`;
  if (basis.kind === 'estimate') {
    lines.push(
      `No history for this exercise yet, so this starts from an estimate: ${kg(basis.bodyweightKg)} bodyweight, ${basis.level} lifting experience${basis.pattern ? `, a ${basis.pattern.toLowerCase()} movement` : ''}.`,
      `That puts your one-rep max near ${kg(oneRepMaxKg)}. The plan stops one rep further from failure than usual, to start on the safe side.`,
    );
  } else {
    const rtf = repsToFailure(basis.best);
    lines.push(
      basis.kind === 'history'
        ? `Your best set last time: ${setText(basis.best)} — about ${Math.round(rtf)} reps to failure.`
        : `Re-planned from your sets today. Best so far: ${setText(basis.best)} — about ${Math.round(rtf)} reps to failure.`,
      basis.kind === 'history'
        ? `To progress, the plan aims one rep more than that: an estimated one-rep max of ${kg(oneRepMaxKg)}.`
        : `The rest of today is planned at that level: an estimated one-rep max of ${kg(oneRepMaxKg)}.`,
    );
  }
  if (offsetKg > 0) {
    lines.push(
      `That estimate is of the whole resistance: the weight you load plus ${kg(offsetKg)} it leaves out — the machine's own resistance, or the share of your bodyweight the movement lifts. So each step up in weight is a smaller step of the whole.`,
    );
  }
  if (suggestion.weightKg !== null) {
    const range = plan.repsMax > 200 ? `${plan.repsMin}+` : plan.repsMin === plan.repsMax ? `${plan.repsMin}` : `${plan.repsMin}–${plan.repsMax}`;
    const fits = suggestion.reps >= plan.repsMin && suggestion.reps <= plan.repsMax;
    lines.push(
      fits
        ? `${kg(suggestion.weightKg)} × ${suggestion.reps} at ${plan.rir} RIR is the heaviest your equipment makes that lands in the ${range} rep range.`
        : suggestion.reps > plan.repsMax
          ? `The next weight up would be too big a jump, so ${kg(suggestion.weightKg)} for ${suggestion.reps} reps instead — more reps than the ${range} range.`
          : `Even the lightest weight available, ${kg(suggestion.weightKg)}, is heavy for the ${range} range.`,
    );
  }
  return lines;
}
