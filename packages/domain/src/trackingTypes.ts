/**
 * Mirrors TRACKING_TYPES in packages/schema/src/exercises.ts. It is duplicated
 * rather than imported because packages/domain has zero dependencies by design;
 * a parity test in apps/mobile fails if the two ever drift.
 */
export const TRACKING_TYPES = ['weight_reps', 'reps', 'duration', 'distance_duration'] as const;

export type TrackingType = (typeof TRACKING_TYPES)[number];

/** Only weight_reps carries a load, so only it contributes volume or a 1RM. */
export function tracksWeight(trackingType: TrackingType): boolean {
  return trackingType === 'weight_reps';
}
