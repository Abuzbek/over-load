/**
 * The dashboard's maths: calendar buckets, the bodyweight trend, training
 * streaks and rep-max estimates. Pure — timestamps (epoch ms, local time) in,
 * numbers out.
 */

const DAY_MS = 86_400_000;

/** Midnight, local time, of the day `ms` falls in. */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Monday 00:00, local time, of the week `ms` falls in. */
export function startOfWeek(ms: number): number {
  const d = new Date(startOfDay(ms));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** The Monday a week after (or `weeks` after) the one `weekStart` is. Calendar arithmetic, so DST days do not drift it. */
export function addWeeks(weekStart: number, weeks: number): number {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + weeks * 7);
  return d.getTime();
}

export type WeighInPoint = { at: number; kg: number };
export type TrendPoint = { day: number; kg: number; trendKg: number };

/** How far each day's weight pulls the trend: a tenth, so one salty dinner barely moves it. */
const TREND_ALPHA = 0.1;

/**
 * The bodyweight trend: each day's average weigh-in, smoothed exponentially.
 * A gap of several days pulls the trend as far as that many daily steps would
 * have, so a week away does not freeze it. Points come back one per day logged,
 * oldest first.
 */
export function weightTrend(points: WeighInPoint[]): TrendPoint[] {
  const byDay = new Map<number, number[]>();
  for (const p of points) {
    const day = startOfDay(p.at);
    byDay.set(day, [...(byDay.get(day) ?? []), p.kg]);
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);
  const out: TrendPoint[] = [];
  for (const day of days) {
    const values = byDay.get(day)!;
    const kg = values.reduce((a, b) => a + b, 0) / values.length;
    const prev = out.at(-1);
    if (!prev) {
      out.push({ day, kg, trendKg: kg });
      continue;
    }
    const gap = Math.max(Math.round((day - prev.day) / DAY_MS), 1);
    const pull = 1 - (1 - TREND_ALPHA) ** gap;
    out.push({ day, kg, trendKg: prev.trendKg + pull * (kg - prev.trendKg) });
  }
  return out;
}

/**
 * The trend's change over the last week, in kg per week: the newest trend
 * against the one about seven days before (or the oldest, scaled to a week).
 * Null with under two days logged.
 */
export function weeklyRate(trend: TrendPoint[]): number | null {
  if (trend.length < 2) return null;
  const last = trend.at(-1)!;
  const target = last.day - 7 * DAY_MS;
  const before = [...trend].reverse().find((p) => p.day <= target) ?? trend[0]!;
  const days = (last.day - before.day) / DAY_MS;
  if (days <= 0) return null;
  return ((last.trendKg - before.trendKg) / days) * 7;
}

/**
 * Weeks in a row with at least one workout, ending this week — or last week,
 * when this one has none yet, so Monday morning does not break a streak —
 * and the longest such run. `days` are workout timestamps, any order.
 */
export function workoutStreak(days: number[], now: number): { current: number; longest: number } {
  const weeks = new Set(days.map(startOfWeek));
  const sorted = [...weeks].sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const w of sorted) {
    run = prev !== null && addWeeks(prev, 1) === w ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = w;
  }
  let week = startOfWeek(now);
  if (!weeks.has(week)) week = addWeeks(week, -1);
  let current = 0;
  while (weeks.has(week)) {
    current++;
    week = addWeeks(week, -1);
  }
  return { current, longest };
}

/** Estimated maxes for 1, 3 and 10 reps from a one-rep max (Epley, inverted). */
export function repMaxes(oneRepMaxKg: number): { reps: number; kg: number }[] {
  return [1, 3, 10].map((reps) => ({ reps, kg: reps === 1 ? oneRepMaxKg : oneRepMaxKg / (1 + reps / 30) }));
}
