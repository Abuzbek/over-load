/**
 * The plate calculator: what to load on each side of a bar for a total weight.
 * Pure — the gym's bar and plate sizes come in, a loading comes out.
 */

export type PlateCount = { kg: number; count: number };
export type Loading = {
  /** Each side's plates, heaviest first. */
  perSide: PlateCount[];
  /** Weight on one side. */
  sideKg: number;
  /** What could not be loaded with these plates (0 when the total is exact). */
  shortKg: number;
};

const EPSILON = 1e-6;

/**
 * Heaviest plates first, as many of each as fit, the same on both sides. A
 * total under the bar loads nothing; what the plates cannot make up is
 * reported rather than rounded away, so the lifter sees it.
 */
export function plateLoading(totalKg: number, barKg: number, plateSizesKg: number[]): Loading {
  let left = Math.max((totalKg - barKg) / 2, 0);
  const perSide: PlateCount[] = [];
  for (const kg of [...new Set(plateSizesKg)].filter((p) => p > 0).sort((a, b) => b - a)) {
    const count = Math.floor(left / kg + EPSILON);
    if (count > 0) {
      perSide.push({ kg, count });
      left -= count * kg;
    }
  }
  const sideKg = perSide.reduce((n, p) => n + p.kg * p.count, 0);
  // To 10 g: a weight converted from pounds is a hair off whole kilograms, which is no plate at all.
  return { perSide, sideKg, shortKg: Math.max(Math.round(left * 2 * 100) / 100, 0) };
}

/** The smallest change the plates can make: the lightest plate, one each side. */
export function plateStepKg(plateSizesKg: number[]): number | null {
  const lightest = Math.min(...plateSizesKg.filter((p) => p > 0));
  return Number.isFinite(lightest) ? lightest * 2 : null;
}

