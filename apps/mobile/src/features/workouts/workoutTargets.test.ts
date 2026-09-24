import { describe, expect, it } from 'vitest';
import { estimateWorkoutMinutes, formatWorkoutTarget, targetInputsFor, targetMuscles } from './workoutTargets';

describe('targetInputsFor', () => {
  it('gives weight and reps for weight_reps', () => {
    expect(targetInputsFor('weight_reps', 'kg').map((i) => i.field)).toEqual(['weightKg', 'reps']);
  });

  it('gives only reps for a bodyweight exercise', () => {
    expect(targetInputsFor('reps', 'kg').map((i) => i.field)).toEqual(['reps']);
  });

  // workout_sets stores only target_reps and target_weight_kg — there is no
  // column to hold a target duration or distance, so offering a box that
  // silently discards what the user types is worse than offering none.
  it('offers no target box for a plank', () => {
    expect(targetInputsFor('duration', 'kg')).toEqual([]);
  });

  it('offers no target box for a run', () => {
    expect(targetInputsFor('distance_duration', 'kg')).toEqual([]);
  });

  it('never offers a weight box for a non-weight exercise', () => {
    for (const t of ['reps', 'duration', 'distance_duration'] as const) {
      expect(targetInputsFor(t, 'kg').some((i) => i.field === 'weightKg')).toBe(false);
    }
  });

  it('labels the weight box with the display unit', () => {
    const weight = targetInputsFor('weight_reps', 'lb').find((i) => i.field === 'weightKg');
    expect(weight?.placeholder).toBe('Weight (lb)');
  });
});

describe('formatWorkoutTarget', () => {
  it('shows weight and reps for weight_reps', () => {
    expect(formatWorkoutTarget('weight_reps', { targetWeightKg: 60, targetReps: 8 }, 'kg')).toBe(
      '60 kg × 8',
    );
  });

  it('shows only the reps for a weight_reps set with no target weight', () => {
    expect(formatWorkoutTarget('weight_reps', { targetWeightKg: null, targetReps: 8 }, 'kg')).toBe(
      '8 reps',
    );
  });

  it('shows a rep count alone for a bodyweight exercise', () => {
    expect(formatWorkoutTarget('reps', { targetWeightKg: null, targetReps: 12 }, 'kg')).toBe(
      '12 reps',
    );
  });

  // The defect this covers: a plank rendered as "— × 8", inventing both a
  // weight target it cannot store and a rep count that means nothing.
  it('shows no target for a plank', () => {
    expect(formatWorkoutTarget('duration', { targetWeightKg: null, targetReps: 8 }, 'kg')).toBeNull();
  });

  it('shows no target for a run', () => {
    expect(
      formatWorkoutTarget('distance_duration', { targetWeightKg: null, targetReps: 8 }, 'kg'),
    ).toBeNull();
  });

  it('converts the target weight to the display unit', () => {
    expect(formatWorkoutTarget('weight_reps', { targetWeightKg: 60, targetReps: 5 }, 'lb')).toBe(
      '132.3 lb × 5',
    );
  });
});

describe('estimateWorkoutMinutes', () => {
  it('counts work, rest between sets and a changeover per exercise', () => {
    // 4 sets: 4×45 + 3×120 + 60 = 600 s; 3 sets at 90 s rest: 3×45 + 2×90 + 60 = 375 s.
    expect(estimateWorkoutMinutes([{ sets: 4, restSeconds: null }, { sets: 3, restSeconds: 90 }], 120)).toBe(17);
  });

  it('ignores an exercise with no sets and never rounds a real workout to zero', () => {
    expect(estimateWorkoutMinutes([{ sets: 0, restSeconds: null }], 120)).toBe(0);
    expect(estimateWorkoutMinutes([{ sets: 1, restSeconds: null }], 120)).toBe(2);
  });
});

describe('targetMuscles', () => {
  it('counts exercises and weights secondary sets at half', () => {
    const chest = { id: 'c', name: 'Chest', primary: true };
    const triceps = { id: 't', name: 'Triceps', primary: false };
    expect(
      targetMuscles([
        { sets: 4, muscles: [chest, triceps] },
        { sets: 3, muscles: [{ ...triceps, primary: true }] },
      ]),
    ).toEqual([
      { id: 't', name: 'Triceps', exercises: 2, sets: 5 },
      { id: 'c', name: 'Chest', exercises: 1, sets: 4 },
    ]);
  });
});
