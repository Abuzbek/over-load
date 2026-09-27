import { describe, expect, it } from 'vitest';
import { barTotals, estimatedOneRepMax, explainSuggestion, pairTotals, suggestSets, type SetPlan } from './progression';

const PLATES = [1.25, 2.5, 5, 10, 15, 20];
const BAR = barTotals(20, PLATES);
const plan = (repsMin: number, repsMax: number, rir: number): SetPlan => ({ repsMin, repsMax, rir });

describe('suggestSets', () => {
  it('progresses: one rep of capacity above the best set, the heaviest loadable weight in range', () => {
    // 100 × 8 at 2 RIR: 10 reps to failure; aiming for 11 at 100 kg.
    const next = suggestSets([{ weightKg: 100, reps: 8, rir: 2 }], [plan(7, 9, 2)], BAR);
    expect(next).toEqual([{ weightKg: 105, reps: 7 }]);
    expect(estimatedOneRepMax(105, 7 + 2)).toBeGreaterThan(estimatedOneRepMax(100, 8 + 2));
  });

  it('drops the weight after a set logged harder than planned', () => {
    // Planned 8 at 2 RIR; did 6 with 1 left.
    expect(suggestSets([{ weightKg: 100, reps: 6, rir: 1 }], [plan(7, 9, 2)], BAR)).toEqual([{ weightKg: 95, reps: 8 }]);
  });

  it('takes the best set, the RIR it was planned at when none was logged, and half the partial reps', () => {
    const last = [
      { weightKg: 100, reps: 8, rir: null, targetRir: 2 },
      { weightKg: 100, reps: 6, rir: 0, partialReps: 2 },
    ];
    expect(suggestSets(last, [plan(7, 9, 2)], BAR)).toEqual([{ weightKg: 105, reps: 7 }]);
  });

  it('gives each set its own reps for its RIR', () => {
    const next = suggestSets([{ weightKg: 100, reps: 8, rir: 2 }], [plan(7, 9, 3), plan(7, 9, 2)], BAR)!;
    expect(next[0]!.reps).toBeGreaterThanOrEqual(7);
    expect(next[0]!.weightKg!).toBeLessThanOrEqual(next[1]!.weightKg!);
  });

  it('with light equipment, more reps rather than too big a jump', () => {
    expect(suggestSets([{ weightKg: 10, reps: 12, rir: 2 }], [plan(8, 12, 2)], [10, 12.5, 15])).toEqual([{ weightKg: 10, reps: 13 }]);
  });

  it('reps alone for a reps-only exercise, and nothing with no history', () => {
    expect(suggestSets([{ weightKg: null, reps: 12, rir: 2 }], [plan(8, 15, 2)], null)).toEqual([{ weightKg: null, reps: 13 }]);
    expect(suggestSets([], [plan(8, 12, 2)], BAR)).toBeNull();
  });

  it('rounds to 2.5 kg with no equipment to go on', () => {
    expect(suggestSets([{ weightKg: 40, reps: 10, rir: 2 }], [plan(8, 12, 2)], null)![0]!.weightKg! % 2.5).toBe(0);
  });
});

describe('loadable totals', () => {
  it('makes every bar total the plates can, both sides alike', () => {
    expect(barTotals(20, [2.5, 5], 40)).toEqual([20, 25, 30, 35, 40]);
    expect(BAR).toContain(22.5);
    expect(pairTotals([1.25], 5)).toEqual([0, 2.5, 5]);
  });
});

describe('explainSuggestion', () => {
  it('says what the suggestion was built on and how it fits the plan', () => {
    const lines = explainSuggestion(
      { kind: 'history', best: { weightKg: 100, reps: 8, rir: 2 } },
      estimatedOneRepMax(100, 11),
      plan(7, 9, 2),
      { weightKg: 105, reps: 7 },
      (w) => `${w} kg`,
    );
    expect(lines[0]).toBe('Your best set last time: 100 kg × 8 at 2 RIR — about 10 reps to failure.');
    expect(lines.at(-1)).toContain('105 kg × 7 at 2 RIR');
  });

  it('counts a machine or bodyweight offset into the estimate, suggesting the weight you load', () => {
    // 50 kg of plates on a 30 kg sled: the next plates are a smaller step of the total, so it can go heavier.
    const next = suggestSets([{ weightKg: 50, reps: 8, rir: 2 }], [plan(1, 30, 0)], [50, 60, 70], { offsetKg: 30 })!;
    const without = suggestSets([{ weightKg: 50, reps: 8, rir: 2 }], [plan(1, 30, 0)], [50, 60, 70])!;
    expect(next[0]).toEqual({ weightKg: 70, reps: 2 });
    expect(without[0]).toEqual({ weightKg: 60, reps: 4 });
  });

  it('re-plans mid-session at today’s level, without the progression rep', () => {
    const today = suggestSets([{ weightKg: 100, reps: 8, rir: 2 }], [plan(7, 9, 2)], BAR, { progress: false })!;
    const next = suggestSets([{ weightKg: 100, reps: 8, rir: 2 }], [plan(7, 9, 2)], BAR)!;
    expect(today[0]).toEqual({ weightKg: 102.5, reps: 7 });
    expect(today[0]!.weightKg!).toBeLessThan(next[0]!.weightKg!);
  });
});
