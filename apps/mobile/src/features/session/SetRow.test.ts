import type { CompletedSet } from '@workouts/domain';
import { describe, expect, it } from 'vitest';
import { formatPrevious } from './SetRow';

function completedSet(overrides: Partial<CompletedSet> = {}): CompletedSet {
  return {
    id: 'set-1',
    exerciseId: 'ex-1',
    setType: 'normal',
    weightKg: 80,
    reps: 8,
    durationSeconds: null,
    completedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('formatPrevious', () => {
  it('formats weight and reps as "80 kg × 8"', () => {
    expect(formatPrevious([completedSet({ weightKg: 80, reps: 8 })], 0)).toBe('80 kg × 8');
  });

  it('formats a bodyweight set (no weight) as reps only', () => {
    expect(formatPrevious([completedSet({ weightKg: null, reps: 12 })], 0)).toBe('12 reps');
  });

  it('falls back to an em dash for missing reps on a bodyweight set', () => {
    expect(formatPrevious([completedSet({ weightKg: null, reps: null })], 0)).toBe('— reps');
  });

  it('falls back to an em dash for missing reps on a weighted set', () => {
    expect(formatPrevious([completedSet({ weightKg: 80, reps: null })], 0)).toBe('80 kg × —');
  });

  it('returns an em dash when there is no previous set at this index', () => {
    expect(formatPrevious([], 0)).toBe('—');
    expect(formatPrevious([completedSet()], 1)).toBe('—');
  });
});
