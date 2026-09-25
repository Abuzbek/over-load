import { tracksWeight, type TrackingType } from './trackingTypes';

export type SetType = 'normal' | 'warmup' | 'drop' | 'myo' | 'failure';

/**
 * A set that actually happened. Repositories map database rows into this shape;
 * every analytic function consumes it. Fields are null when the exercise's
 * tracking type does not use them (a plank has no weight, a pull-up no reps target).
 */
export type CompletedSet = {
  id: string;
  exerciseId: string;
  trackingType: TrackingType;
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceM: number | null;
  /** Epoch milliseconds. */
  completedAt: number;
};

/** Warmups are real work but never records. Everything else counts. */
export function countsTowardRecords(set: CompletedSet): boolean {
  return set.setType !== 'warmup';
}

export function setVolumeKg(set: CompletedSet): number {
  // A plank with a stray weight value is not 136 kg of work. Gating here rather
  // than at each call site keeps every consumer consistent.
  if (!tracksWeight(set.trackingType)) return 0;
  if (set.weightKg === null || set.reps === null) return 0;
  if (set.weightKg <= 0 || set.reps <= 0) return 0;
  return set.weightKg * set.reps;
}

export function totalVolumeKg(sets: CompletedSet[]): number {
  return sets.filter(countsTowardRecords).reduce((sum, s) => sum + setVolumeKg(s), 0);
}

/**
 * A drop set's next round: the load taken down by about 40%, rounded down to
 * what can be loaded. 55 kg drops to 32.5, then 17.5.
 */
export function nextDropKg(kg: number, incrementKg = 2.5): number {
  return Math.max(Math.floor((kg * 0.6) / incrementKg + 1e-9) * incrementKg, incrementKg);
}
