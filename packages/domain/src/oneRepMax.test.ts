import { describe, expect, it } from 'vitest';
import { estimateOneRepMax } from './oneRepMax';

describe('estimateOneRepMax', () => {
  it('returns the lifted weight for a single', () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
  });

  it('applies the Epley formula above one rep', () => {
    // 100 * (1 + 5/30) = 116.666...
    expect(estimateOneRepMax(100, 5)).toBeCloseTo(116.667, 3);
  });

  it('returns 0 for zero reps', () => {
    expect(estimateOneRepMax(100, 0)).toBe(0);
  });

  it('returns 0 for zero weight', () => {
    expect(estimateOneRepMax(0, 8)).toBe(0);
  });

  it('never returns a negative estimate', () => {
    expect(estimateOneRepMax(-50, 5)).toBe(0);
  });
});
