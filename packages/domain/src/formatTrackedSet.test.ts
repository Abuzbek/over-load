import { describe, expect, it } from 'vitest';
import { formatTrackedSet, type TrackedSetValues } from './formatTrackedSet';

function values(overrides: Partial<TrackedSetValues> = {}): TrackedSetValues {
  return {
    weightKg: null,
    reps: null,
    durationSeconds: null,
    distanceM: null,
    ...overrides,
  };
}

describe('formatTrackedSet', () => {
  it('formats weight_reps as weight × reps', () => {
    expect(formatTrackedSet('weight_reps', values({ weightKg: 80, reps: 8 }), 'kg')).toBe('80 kg × 8');
  });

  it('converts weight_reps weight to the display unit', () => {
    expect(formatTrackedSet('weight_reps', values({ weightKg: 100, reps: 5 }), 'lb')).toBe('220.5 lb × 5');
  });

  it('falls back to an em dash for missing reps on weight_reps', () => {
    expect(formatTrackedSet('weight_reps', values({ weightKg: 80, reps: null }), 'kg')).toBe('80 kg × —');
  });

  it('formats reps as "N reps"', () => {
    expect(formatTrackedSet('reps', values({ reps: 12 }), 'kg')).toBe('12 reps');
  });

  it('falls back to "— reps" when reps is missing', () => {
    expect(formatTrackedSet('reps', values({ reps: null }), 'kg')).toBe('— reps');
  });

  it('formats duration as mm:ss', () => {
    expect(formatTrackedSet('duration', values({ durationSeconds: 125 }), 'kg')).toBe('2:05');
  });

  it('falls back to an em dash when duration is missing', () => {
    expect(formatTrackedSet('duration', values({ durationSeconds: null }), 'kg')).toBe('—');
  });

  it('formats distance_duration as distance and duration', () => {
    expect(
      formatTrackedSet('distance_duration', values({ distanceM: 5000, durationSeconds: 1800 }), 'kg'),
    ).toBe('5000 m · 30:00');
  });

  it('falls back to em dashes when distance and duration are both missing', () => {
    expect(formatTrackedSet('distance_duration', values(), 'kg')).toBe('— m · —');
  });
});
