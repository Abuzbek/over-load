import { describe, expect, it } from 'vitest';
import { addWeeks, repMaxes, startOfWeek, weeklyRate, weightTrend, workoutStreak } from './insights';

const day = (y: number, m: number, d: number, h = 8) => new Date(y, m - 1, d, h).getTime();

describe('weightTrend', () => {
  it('averages a day, smooths across days, and pulls harder over a gap', () => {
    const t = weightTrend([
      { at: day(2026, 9, 1), kg: 80 },
      { at: day(2026, 9, 2, 7), kg: 81 },
      { at: day(2026, 9, 2, 20), kg: 83 },
      { at: day(2026, 9, 12), kg: 80 },
    ]);
    expect(t.map((p) => p.kg)).toEqual([80, 82, 80]);
    expect(t[1]!.trendKg).toBeCloseTo(80.2);
    // Ten days later, the pull is 1 − 0.9¹⁰ ≈ 0.65, not a single day's 0.1.
    expect(t[2]!.trendKg).toBeCloseTo(80.2 - 0.2 * (1 - 0.9 ** 10));
  });

  it('gives a weekly rate from the trend, null with one day', () => {
    expect(weeklyRate(weightTrend([{ at: day(2026, 9, 1), kg: 80 }]))).toBeNull();
    const falling = weightTrend(Array.from({ length: 15 }, (_, i) => ({ at: day(2026, 9, 1 + i), kg: 80 - i * 0.1 })));
    expect(weeklyRate(falling)!).toBeLessThan(0);
  });
});

describe('workoutStreak', () => {
  it('counts weeks in a row up to this week, forgiving a week not trained yet', () => {
    const monday = startOfWeek(day(2026, 9, 21));
    const weeks = (...ago: number[]) => ago.map((a) => addWeeks(monday, -a) + 86_400_000);
    // Trained 1, 2 and 3 weeks ago, and 5–8 weeks ago; nothing yet this week.
    expect(workoutStreak(weeks(1, 2, 3, 5, 6, 7, 8), monday + 3_600_000)).toEqual({ current: 3, longest: 4 });
    expect(workoutStreak(weeks(0, 1), monday + 3_600_000)).toEqual({ current: 2, longest: 2 });
    expect(workoutStreak([], monday)).toEqual({ current: 0, longest: 0 });
  });
});

describe('repMaxes', () => {
  it('estimates 1, 3 and 10 rep maxes from the one-rep max', () => {
    expect(repMaxes(100).map((r) => Math.round(r.kg))).toEqual([100, 91, 75]);
  });
});
