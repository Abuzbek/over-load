import type { HeightUnit } from './units';


/**
 * Height is stored in centimetres, like weight is stored in kilograms. Feet and
 * inches are a display format, and one value: 5'11" is a single height, not
 * five of one thing and eleven of another.
 */
export function formatHeight(cm: number | null, unit: HeightUnit): string {
  if (cm === null) return '—';
  if (unit === 'cm') return `${Math.round(cm)} cm`;
  const totalInches = Math.round(cm / 2.54);
  // 11.6" rounds to 12", which is a foot — carry it rather than print 5'12".
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}"`;
}

export function feetInchesToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * 2.54;
}

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm / 2.54);
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 1-based month, so February 2024 is (2, 2024). Day 0 of the next month. */
export function daysInMonth(month: number, year: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * A birthday is a calendar date held as epoch milliseconds at UTC midnight, so
 * every read and write of it uses UTC. Reading it with local getters shows the
 * day before for anyone west of Greenwich.
 */
export function formatBirthDate(ms: number | null): string {
  if (ms === null) return '—';
  const date = new Date(ms);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function toBirthDate(day: number, month: number, year: number): number {
  return Date.UTC(year, month - 1, day);
}

export function birthDateParts(ms: number): { day: number; month: number; year: number } {
  const date = new Date(ms);
  return { day: date.getUTCDate(), month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
}

/**
 * Whether day/month/year name a real date. Date.UTC happily rolls 31 February
 * over into March, so a round trip is the check.
 */
export function isRealDate(day: number, month: number, year: number): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return false;
  if (year < 1900 || month < 1 || month > 12 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCDate() === day && date.getUTCMonth() === month - 1;
}
