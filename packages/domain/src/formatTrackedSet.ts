import { formatDistance, type DistanceUnit } from './formatDistance';
import { formatWeight } from './formatWeight';
import { formatDuration } from './restTimer';
import type { TrackingType } from './trackingTypes';
import type { Unit } from './units';

export type TrackedSetValues = {
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceM: number | null;
};

/**
 * The one place a set's raw fields become a display string, by tracking
 * type. Shared by SetRow's "previous performance" line and the workout
 * history detail view, so the two never drift: `weight_reps` shows weight ×
 * reps, `reps` shows a rep count, `duration` shows mm:ss, and
 * `distance_duration` shows distance and duration together.
 */
export function formatTrackedSet(
  trackingType: TrackingType,
  values: TrackedSetValues,
  unit: Unit,
  distanceUnit: DistanceUnit,
): string {
  switch (trackingType) {
    case 'weight_reps':
      return `${formatWeight(values.weightKg, unit)} × ${values.reps ?? '—'}`;
    case 'reps':
      return `${values.reps ?? '—'} reps`;
    case 'duration':
      return values.durationSeconds === null ? '—' : formatDuration(values.durationSeconds);
    case 'distance_duration': {
      const duration = values.durationSeconds === null ? '—' : formatDuration(values.durationSeconds);
      return `${formatDistance(values.distanceM, distanceUnit)} · ${duration}`;
    }
  }
}
