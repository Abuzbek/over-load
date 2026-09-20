import { kgToLb, lbToKg, type Unit } from './units';

/** Storage is always kilograms. This is the only place that changes for display. */
export function formatWeight(kg: number | null, unit: Unit): string {
  if (kg === null) return '—';
  const value = unit === 'lb' ? kgToLb(kg) : kg;
  return `${Number(value.toFixed(1))} ${unit}`;
}

/** Converts a value the user typed, in their chosen unit, into stored kilograms. */
export function toStorageKg(entered: number, unit: Unit): number {
  return unit === 'lb' ? lbToKg(entered) : entered;
}
