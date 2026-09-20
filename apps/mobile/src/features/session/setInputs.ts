import type { TrackingType } from '@overload/domain';

export type SetField = 'weightKg' | 'reps' | 'durationSeconds' | 'distanceM';

export type SetInput = {
  field: SetField;
  placeholder: string;
  keyboard: 'decimal-pad' | 'number-pad';
};

const WEIGHT: SetInput = { field: 'weightKg', placeholder: 'kg', keyboard: 'decimal-pad' };
const REPS: SetInput = { field: 'reps', placeholder: 'reps', keyboard: 'number-pad' };
const DURATION: SetInput = { field: 'durationSeconds', placeholder: 'mm:ss', keyboard: 'number-pad' };
const DISTANCE: SetInput = { field: 'distanceM', placeholder: 'm', keyboard: 'decimal-pad' };

/**
 * The spec's reason for tracking_type: it "drives which input widgets the
 * session screen renders". A plank has no weight box; a 5k run has no reps box.
 */
const INPUTS: Record<TrackingType, SetInput[]> = {
  weight_reps: [WEIGHT, REPS],
  reps: [REPS],
  duration: [DURATION],
  distance_duration: [DISTANCE, DURATION],
};

export function inputsFor(trackingType: TrackingType): SetInput[] {
  return INPUTS[trackingType];
}

/** Accepts "mm:ss" or bare seconds. Returns null when the text is not a duration. */
export function parseDuration(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;

  const parts = trimmed.split(':');
  if (parts.length > 2) return null;

  // Number.parseInt parses a leading numeric prefix and ignores trailing
  // garbage ('45abc' -> 45) and truncates decimals ('12.5' -> 12). Reject
  // anything that isn't purely digits before converting, so a paste or a
  // stray keystroke never turns into a plausible-looking wrong number.
  if (parts.some((p) => !/^\d+$/.test(p))) return null;

  const numbers = parts.map((p) => Number.parseInt(p, 10));

  return parts.length === 2 ? numbers[0]! * 60 + numbers[1]! : numbers[0]!;
}

/**
 * Digits only — rejects a decimal point, a comma, or any other character.
 * For integer fields like reps, where Number.parseFloat would otherwise
 * silently accept "8.5" or (after the comma-to-dot swap) "8,5" and round-trip
 * it straight into an `integer` column.
 */
export function parseIntegerInput(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number.parseInt(trimmed, 10);
}

/**
 * A decimal number, treating a comma as the decimal separator (e.g. "60,5")
 * for real-valued fields like weight and distance.
 */
export function parseDecimalInput(text: string): number | null {
  const parsed = Number.parseFloat(text.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatDurationInput(seconds: number | null): string {
  if (seconds === null) return '';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
