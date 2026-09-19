import type { NewExercise, TrackingType } from '@workouts/schema';

/** The upstream row shape from yuhonas/free-exercise-db. */
export type SourceExercise = {
  name: string;
  equipment: string | null;
  category: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
};

export type SeedExercise = Omit<NewExercise, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

const BODYWEIGHT = new Set(['body only', 'none', null]);

/**
 * Isometric holds are bodyweight strength work by the dataset's categories but
 * are logged as time, not reps. Matched on a name fragment, lowercased.
 */
const DURATION_NAME_HINTS = ['plank', 'hold', 'hang', 'wall sit', 'l-sit', 'isometric'];

export function inferTrackingType(source: SourceExercise): TrackingType {
  const name = source.name.toLowerCase();
  if (DURATION_NAME_HINTS.some((hint) => name.includes(hint))) return 'duration';
  if (source.category === 'cardio') return 'distance_duration';
  if (source.category === 'stretching') return 'duration';
  if (BODYWEIGHT.has(source.equipment)) return 'reps';
  return 'weight_reps';
}

export function mapSourceExercise(source: SourceExercise): SeedExercise {
  return {
    name: source.name,
    trackingType: inferTrackingType(source),
    primaryMuscle: source.primaryMuscles[0] ?? 'other',
    secondaryMuscles: source.secondaryMuscles,
    equipment: source.equipment ?? 'none',
    instructions: source.instructions.join(' ') || null,
    isCustom: false,
  };
}
