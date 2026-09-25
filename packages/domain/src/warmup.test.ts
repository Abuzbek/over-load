import { describe, expect, it } from 'vitest';
import { nextDropKg } from './sets';
import { DEFAULT_WARMUP_SCHEME, smartWarmupScheme, warmupSets } from './warmup';

describe('warmupSets', () => {
  it('rounds each step down to a loadable weight', () => {
    expect(warmupSets(80, DEFAULT_WARMUP_SCHEME)).toEqual([
      { percent: 40, reps: 8, weightKg: 30 },
      { percent: 60, reps: 5, weightKg: 47.5 },
      { percent: 80, reps: 3, weightKg: 62.5 },
    ]);
  });

  it('never goes under the bar, and drops steps that repeat a load or reach the working weight', () => {
    expect(warmupSets(30, DEFAULT_WARMUP_SCHEME, 2.5, 20).map((s) => s.weightKg)).toEqual([20, 22.5]);
    expect(warmupSets(10, [{ percent: 100, reps: 1 }])).toEqual([]);
  });
});

describe('smartWarmupScheme', () => {
  it('takes more steps to reach a heavier weight', () => {
    expect(smartWarmupScheme(15)).toHaveLength(1);
    expect(smartWarmupScheme(50)).toHaveLength(2);
    expect(smartWarmupScheme(80)).toHaveLength(3);
    expect(smartWarmupScheme(140)).toHaveLength(4);
  });
});

describe('nextDropKg', () => {
  it('takes about 40% off, down to a loadable weight, never to nothing', () => {
    expect(nextDropKg(55)).toBe(32.5);
    expect(nextDropKg(32.5)).toBe(17.5);
    expect(nextDropKg(2.5)).toBe(2.5);
  });
});
