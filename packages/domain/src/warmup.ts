/**
 * Warm-up sets, worked out from the first working set's load. Pure: the
 * session screen supplies the load and the plate increment.
 */

/** One warm-up: a share of the working weight, for some reps. */
export type WarmupStep = { percent: number; reps: number };
export type WarmupSet = WarmupStep & { weightKg: number };

/** The scheme a user starts from and can edit: 40% × 8, 60% × 5, 80% × 3. */
export const DEFAULT_WARMUP_SCHEME: WarmupStep[] = [
  { percent: 40, reps: 8 },
  { percent: 60, reps: 5 },
  { percent: 80, reps: 3 },
];

/**
 * Smart warm-ups: the heavier the working weight, the more steps to reach it,
 * and fewer reps as the load climbs so the warm-up never tires the lifter.
 * A light load needs one set; a heavy squat four.
 */
export function smartWarmupScheme(workingKg: number): WarmupStep[] {
  if (workingKg < 20) return [{ percent: 50, reps: 10 }];
  if (workingKg < 60) return [{ percent: 50, reps: 8 }, { percent: 75, reps: 4 }];
  if (workingKg < 100) return DEFAULT_WARMUP_SCHEME;
  return [
    { percent: 40, reps: 8 },
    { percent: 55, reps: 5 },
    { percent: 70, reps: 3 },
    { percent: 85, reps: 2 },
  ];
}

/**
 * The scheme as loads: each step's share rounded down to what can be loaded
 * (`incrementKg`), never under `minKg` (an empty bar, say). Steps that round to
 * the same load as the one before, or up to the working weight, are dropped —
 * they would only repeat a set.
 */
export function warmupSets(workingKg: number, scheme: WarmupStep[], incrementKg = 2.5, minKg = 0): WarmupSet[] {
  const out: WarmupSet[] = [];
  for (const step of scheme) {
    const raw = (workingKg * step.percent) / 100;
    const weightKg = Math.max(Math.floor(raw / incrementKg + 1e-9) * incrementKg, minKg);
    if (weightKg <= 0 || weightKg >= workingKg || out.some((s) => s.weightKg === weightKg)) continue;
    out.push({ ...step, weightKg });
  }
  return out;
}
