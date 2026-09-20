import { describe, expect, it } from 'vitest';
import { formatDurationInput, inputsFor, parseDuration } from './setInputs';

describe('inputsFor', () => {
  it('gives weight and reps for weight_reps', () => {
    expect(inputsFor('weight_reps').map((i) => i.field)).toEqual(['weightKg', 'reps']);
  });

  it('gives only reps for a bodyweight exercise', () => {
    expect(inputsFor('reps').map((i) => i.field)).toEqual(['reps']);
  });

  it('gives only duration for a plank', () => {
    expect(inputsFor('duration').map((i) => i.field)).toEqual(['durationSeconds']);
  });

  it('gives distance and duration for a run', () => {
    expect(inputsFor('distance_duration').map((i) => i.field)).toEqual(['distanceM', 'durationSeconds']);
  });

  it('never offers a weight box for a non-weight exercise', () => {
    for (const t of ['reps', 'duration', 'distance_duration'] as const) {
      expect(inputsFor(t).some((i) => i.field === 'weightKg')).toBe(false);
    }
  });
});

describe('parseDuration', () => {
  it('reads mm:ss', () => {
    expect(parseDuration('1:30')).toBe(90);
  });

  it('reads bare seconds', () => {
    expect(parseDuration('45')).toBe(45);
  });

  it('returns null for nonsense', () => {
    expect(parseDuration('abc')).toBeNull();
  });

  it('round-trips through formatDurationInput', () => {
    expect(parseDuration(formatDurationInput(90))).toBe(90);
  });

  it('rejects trailing garbage after bare seconds', () => {
    expect(parseDuration('45abc')).toBeNull();
  });

  it('rejects trailing garbage after mm:ss', () => {
    expect(parseDuration('1:30xyz')).toBeNull();
  });

  it('rejects a decimal instead of silently truncating it', () => {
    expect(parseDuration('12.5')).toBeNull();
  });
});
