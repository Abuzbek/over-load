const LB_PER_KG = 2.20462262185;

export type Unit = 'kg' | 'lb';

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}

/** Rounds to the nearest usable loading step. An increment of 0 disables rounding. */
export function roundToIncrement(value: number, increment: number): number {
  if (increment <= 0) return value;
  return Math.round(value / increment) * increment;
}
