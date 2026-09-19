import { describe, expect, it } from 'vitest';
import { inferTrackingType, mapSourceExercise, type SourceExercise } from './map';

function source(partial: Partial<SourceExercise> = {}): SourceExercise {
  return {
    name: 'Barbell Bench Press',
    equipment: 'barbell',
    category: 'strength',
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps'],
    instructions: ['Lower the bar.', 'Press it up.'],
    ...partial,
  };
}

describe('inferTrackingType', () => {
  it('treats loaded strength work as weight and reps', () => {
    expect(inferTrackingType(source())).toBe('weight_reps');
  });

  it('treats bodyweight strength work as reps only', () => {
    expect(inferTrackingType(source({ name: 'Pull-Up', equipment: 'body only' }))).toBe('reps');
  });

  it('treats cardio as distance and duration', () => {
    expect(inferTrackingType(source({ name: 'Running', category: 'cardio' }))).toBe(
      'distance_duration',
    );
  });

  it('treats stretching as duration', () => {
    expect(inferTrackingType(source({ name: 'Hamstring Stretch', category: 'stretching' }))).toBe(
      'duration',
    );
  });

  it('overrides isometric holds to duration despite being bodyweight strength', () => {
    expect(inferTrackingType(source({ name: 'Plank', equipment: 'body only' }))).toBe('duration');
  });
});

describe('mapSourceExercise', () => {
  it('flattens instructions into a single string', () => {
    expect(mapSourceExercise(source()).instructions).toBe('Lower the bar. Press it up.');
  });

  it('takes the first primary muscle and keeps the rest as secondary', () => {
    const mapped = mapSourceExercise(source({ primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'shoulders'] }));
    expect(mapped.primaryMuscle).toBe('chest');
    expect(mapped.secondaryMuscles).toEqual(['triceps', 'shoulders']);
  });

  it('marks seeded exercises as not custom', () => {
    expect(mapSourceExercise(source()).isCustom).toBe(false);
  });

  it('falls back to "other" when the source has no primary muscle', () => {
    expect(mapSourceExercise(source({ primaryMuscles: [] })).primaryMuscle).toBe('other');
  });
});
