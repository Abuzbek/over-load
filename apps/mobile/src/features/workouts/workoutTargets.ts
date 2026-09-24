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
      // No target weight yet: the reps are the plan, so say only that.
      if (values.targetWeightKg === null) return `${values.targetReps ?? '—'} reps`;
      return `${formatWeight(values.targetWeightKg, unit)} × ${values.targetReps ?? '—'}`;
    case 'reps':
      return `${values.targetReps ?? '—'} reps`;
    case 'duration':
    case 'distance_duration':
      return null;
  }
}

/** Seconds a working set takes, and the changeover between exercises. */
const SET_SECONDS = 45;
const CHANGEOVER_SECONDS = 60;

/**
 * "Estimated workout time is 32 min": every set's work, the rest between an
 * exercise's sets (its own rest, else the timer's default), and a changeover
 * per exercise. Rounded up, so a short workout never reads 0 min.
 */
export function estimateWorkoutMinutes(
  exercises: { sets: number; restSeconds: number | null }[],
  defaultRestSeconds: number,
): number {
  const seconds = exercises.reduce(
    (total, { sets, restSeconds }) =>
      sets === 0
        ? total
        : total + sets * SET_SECONDS + (sets - 1) * (restSeconds ?? defaultRestSeconds) + CHANGEOVER_SECONDS,
    0,
  );
  return Math.ceil(seconds / 60);
}

export type MuscleVolume = { id: string; name: string; exercises: number; sets: number };

/**
 * The overview's Target Muscles: per muscle group, how many exercises train it
 * and how many sets it gets — a full set as a primary, half as a secondary,
 * the heatmap's weighting. Most sets first.
 */
export function targetMuscles(
  exercises: { sets: number; muscles: { id: string; name: string; primary: boolean }[] }[],
): MuscleVolume[] {
  const byId = new Map<string, MuscleVolume>();
  for (const { sets, muscles } of exercises) {
    for (const m of muscles) {
      const v = byId.get(m.id) ?? { id: m.id, name: m.name, exercises: 0, sets: 0 };
      v.exercises += 1;
      v.sets += m.primary ? sets : sets / 2;
      byId.set(m.id, v);
    }
  }
  return [...byId.values()].sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name));
}
