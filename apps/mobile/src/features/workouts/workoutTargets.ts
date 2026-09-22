import { formatWeight, type TrackingType, type Unit } from '@overload/domain';

export type WorkoutTargetField = 'weightKg' | 'reps';

export type WorkoutTargetInput = {
  field: WorkoutTargetField;
  placeholder: string;
  keyboard: 'decimal-pad' | 'number-pad';
};

export type WorkoutTargetValues = {
  targetWeightKg: number | null;
  targetReps: number | null;
};

const REPS: WorkoutTargetInput = { field: 'reps', placeholder: 'Reps', keyboard: 'number-pad' };

/**
 * The builder's half of what `inputsFor` does for the session screen: a plan
 * for a plank should not ask for a load, and a plan for a run should not ask
 * for reps.
 *
 * `workout_sets` stores only `target_reps` and `target_weight_kg` — there is no
 * column for a target duration or distance. So duration and distance_duration
 * get no target box at all rather than one whose value would be dropped on the
 * floor. Adding those columns is a schema change, not a rendering fix.
 */
export function targetInputsFor(trackingType: TrackingType, unit: Unit): WorkoutTargetInput[] {
  const weight: WorkoutTargetInput = {
    field: 'weightKg',
    placeholder: `Weight (${unit})`,
    keyboard: 'decimal-pad',
  };

  switch (trackingType) {
    case 'weight_reps':
      return [weight, REPS];
    case 'reps':
      return [REPS];
    case 'duration':
    case 'distance_duration':
      return [];
  }
}

/**
 * The planned target for one set, or null when this tracking type has no
 * target worth showing. Null is the signal to render the set number alone
 * rather than an invented "— × 8".
 */
export function formatWorkoutTarget(
  trackingType: TrackingType,
  values: WorkoutTargetValues,
  unit: Unit,
): string | null {
  switch (trackingType) {
    case 'weight_reps':
      return `${formatWeight(values.targetWeightKg, unit)} × ${values.targetReps ?? '—'}`;
    case 'reps':
      return `${values.targetReps ?? '—'} reps`;
    case 'duration':
    case 'distance_duration':
      return null;
  }
}
