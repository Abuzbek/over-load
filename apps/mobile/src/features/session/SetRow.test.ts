import type { CompletedSet } from '@overload/domain';
import { describe, expect, it } from 'vitest';
import { formatPrevious } from './SetRow';

function completedSet(overrides: Partial<CompletedSet> = {}): CompletedSet {
  return {
    id: 'set-1',
    exerciseId: 'ex-1',
    trackingType: 'weight_reps',
    setType: 'normal',
    weightKg: 80,
    reps: 8,
    durationSeconds: null,
    distanceM: null,
    completedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('formatPrevious', () => {
  it('formats a weight_reps set as weight × reps', () => {
    expect(formatPrevious([completedSet({ weightKg: 80, reps: 8 })], 0, 'kg', 'km')).toBe('80 kg × 8');
  });

  it('converts weight to the display unit', () => {
    expect(formatPrevious([completedSet({ weightKg: 100, reps: 5 })], 0, 'lb', 'km')).toBe('220.5 lb × 5');
  });

  it('falls back to an em dash for missing reps on a weighted set', () => {
    expect(formatPrevious([completedSet({ weightKg: 80, reps: null })], 0, 'kg', 'km')).toBe('80 kg × —');
  });

  it('formats a reps-only set as "N reps"', () => {
    expect(
      formatPrevious(
        [completedSet({ trackingType: 'reps', weightKg: null, reps: 12 })],
        0,
        'kg',
        'km',
      ),
    ).toBe('12 reps');
  });

  it('falls back to "— reps" for a reps-only set with no reps recorded', () => {
    expect(
      formatPrevious(
        [completedSet({ trackingType: 'reps', weightKg: null, reps: null })],
        0,
        'kg',
        'km',
      ),
    ).toBe('— reps');
  });

  it('formats a duration set as mm:ss', () => {
    expect(
      formatPrevious(
        [completedSet({ trackingType: 'duration', weightKg: null, reps: null, durationSeconds: 125 })],
        0,
        'kg',
        'km',
      ),
    ).toBe('2:05');
  });

  it('falls back to an em dash for a duration set with no duration recorded', () => {
    expect(
      formatPrevious(
        [completedSet({ trackingType: 'duration', weightKg: null, reps: null, durationSeconds: null })],
        0,
        'kg',
        'km',
      ),
    ).toBe('—');
  });

  it('formats a distance_duration set as distance and duration', () => {
    expect(
      formatPrevious(
        [
          completedSet({
            trackingType: 'distance_duration',
            weightKg: null,
            reps: null,
            durationSeconds: 1800,
            distanceM: 5000,
          }),
        ],
        0,
        'kg',
        'km',
      ),
    ).toBe('5 km · 30:00');
  });

  it('returns an em dash when there is no previous set at this index', () => {
    expect(formatPrevious([], 0, 'kg', 'km')).toBe('—');
    expect(formatPrevious([completedSet()], 1, 'kg', 'km')).toBe('—');
  });
});
