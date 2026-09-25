import { describe, expect, it } from 'vitest';
import { formatWorkoutTarget, targetInputsFor, targetMuscles } from './workoutTargets';

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

describe('formatWorkoutTarget ranges', () => {
  it('shows a rep range when there is one', () => {
    expect(formatWorkoutTarget('weight_reps', { targetWeightKg: null, targetReps: 7, targetRepsMax: 9 }, 'kg')).toBe('7–9 reps');
    expect(formatWorkoutTarget('weight_reps', { targetWeightKg: 60, targetReps: 7, targetRepsMax: 9 }, 'kg')).toBe('60 kg × 7–9');
  });
});

describe('targetMuscles', () => {
  it("counts a set fully for the exercise's main muscle, half for other primaries, a quarter for secondaries", () => {
    const quads = { id: 'q', name: 'Quads', primary: true };
    const glutes = { id: 'g', name: 'Glutes', primary: true };
    const back = { id: 'b', name: 'Lower Back', primary: false };
    expect(
      targetMuscles([
        // A squat lists Glutes before Quads, but it is a quads exercise.
        { sets: 4, main: 'Quads', muscles: [glutes, quads, back] },
        { sets: 3, main: 'Glutes', muscles: [glutes] },
      ]),
    ).toEqual([
      { id: 'g', name: 'Glutes', exercises: 2, sets: 5 },
      { id: 'q', name: 'Quads', exercises: 1, sets: 4 },
      { id: 'b', name: 'Lower Back', exercises: 1, sets: 1 },
    ]);
  });
});
