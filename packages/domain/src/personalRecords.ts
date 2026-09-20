import { estimateOneRepMax } from './oneRepMax';
import { countsTowardRecords, setVolumeKg, type CompletedSet } from './sets';
import type { TrackingType } from './trackingTypes';

export type PersonalRecordType =
  | 'max_weight'
  | 'max_reps'
  | 'max_volume'
  | 'est_1rm'
  | 'max_duration'
  | 'max_distance';

export type PersonalRecord = {
  exerciseId: string;
  type: PersonalRecordType;
  value: number;
  setId: string;
  /** Epoch milliseconds. */
  achievedAt: number;
};

type Metric = { type: PersonalRecordType; of: (set: CompletedSet) => number };

const MAX_WEIGHT: Metric = { type: 'max_weight', of: (s) => s.weightKg ?? 0 };
const MAX_REPS: Metric = { type: 'max_reps', of: (s) => s.reps ?? 0 };
const MAX_VOLUME: Metric = { type: 'max_volume', of: setVolumeKg };
const EST_1RM: Metric = {
  type: 'est_1rm',
  of: (s) => estimateOneRepMax(s.weightKg ?? 0, s.reps ?? 0),
};
const MAX_DURATION: Metric = { type: 'max_duration', of: (s) => s.durationSeconds ?? 0 };
const MAX_DISTANCE: Metric = { type: 'max_distance', of: (s) => s.distanceM ?? 0 };

/**
 * A record only means something if the exercise measures it. Before this map
 * existed, every metric ran against every exercise, which cached an estimated
 * one-rep max in kilograms for a stretch.
 */
const METRICS_BY_TRACKING_TYPE: Record<TrackingType, Metric[]> = {
  weight_reps: [MAX_WEIGHT, MAX_REPS, MAX_VOLUME, EST_1RM],
  reps: [MAX_REPS],
  duration: [MAX_DURATION],
  distance_duration: [MAX_DISTANCE, MAX_DURATION],
};

/**
 * Recomputes every record from scratch. This is a derived cache, never a
 * source of truth, so it is always safe to throw away and rebuild.
 * Ties go to the earliest set — the first time you hit a number is the record.
 */
export function computePersonalRecords(sets: CompletedSet[]): PersonalRecord[] {
  const working = sets.filter(countsTowardRecords);
  const byExercise = new Map<string, CompletedSet[]>();

  for (const set of working) {
    const group = byExercise.get(set.exerciseId);
    if (group) group.push(set);
    else byExercise.set(set.exerciseId, [set]);
  }

  const records: PersonalRecord[] = [];

  for (const [exerciseId, group] of byExercise) {
    const metrics = METRICS_BY_TRACKING_TYPE[group[0]!.trackingType];

    for (const metric of metrics) {
      let best: CompletedSet | undefined;
      let bestValue = 0;

      for (const set of group) {
        const value = metric.of(set);
        if (value <= 0) continue;
        const isBetter = value > bestValue;
        const isEarlierTie =
          value === bestValue && best !== undefined && set.completedAt < best.completedAt;
        if (isBetter || isEarlierTie) {
          best = set;
          bestValue = value;
        }
      }

      if (best) {
        records.push({
          exerciseId,
          type: metric.type,
          value: bestValue,
          setId: best.id,
          achievedAt: best.completedAt,
        });
      }
    }
  }

  return records;
}
