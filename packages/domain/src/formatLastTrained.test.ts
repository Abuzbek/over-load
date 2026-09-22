import { describe, expect, it } from 'vitest';
import { formatElapsed, formatLastTrained, summariseMuscles } from './formatLastTrained';

const DAY = 86_400_000;
// Local noon, Monday 21 Sep 2026
const NOW = new Date(2026, 8, 21, 12, 0, 0).getTime();

describe('formatLastTrained', () => {
  it('says Never when the workout has never been trained', () => {
    expect(formatLastTrained(null, NOW)).toBe('Never');
  });

  it('says Today for earlier the same day', () => {
    expect(formatLastTrained(NOW - 3 * 3_600_000, NOW)).toBe('Today');
  });

  it('says Yesterday for one day back', () => {
    expect(formatLastTrained(NOW - DAY, NOW)).toBe('Yesterday');
  });

  it('names the weekday within the last week', () => {
    expect(formatLastTrained(NOW - 3 * DAY, NOW)).toBe('Friday');
  });

  it('counts weeks beyond that', () => {
    expect(formatLastTrained(NOW - 21 * DAY, NOW)).toBe('3 weeks ago');
  });

  it('uses the singular for exactly one week', () => {
    expect(formatLastTrained(NOW - 8 * DAY, NOW)).toBe('1 week ago');
  });

  it('switches to months past eight weeks', () => {
    expect(formatLastTrained(NOW - 70 * DAY, NOW)).toBe('2 months ago');
  });

  it('counts calendar days, not elapsed time', () => {
    const last = new Date(2026, 8, 20, 23, 0).getTime();
    const now = new Date(2026, 8, 21, 1, 0).getTime();
    expect(formatLastTrained(last, now)).toBe('Yesterday');
  });

  it('says 1 week ago at exactly seven days', () => {
    expect(formatLastTrained(new Date(2026, 8, 14, 12, 0).getTime(), NOW)).toBe('1 week ago');
  });

  it('still counts weeks at exactly eight weeks', () => {
    expect(formatLastTrained(new Date(2026, 6, 27, 12, 0).getTime(), NOW)).toBe('8 weeks ago');
  });

  it('treats a future timestamp as Today', () => {
    expect(formatLastTrained(NOW + 3_600_000, NOW)).toBe('Today');
  });
});

describe('summariseMuscles', () => {
  it('removes duplicates while preserving order', () => {
    expect(summariseMuscles(['chest', 'triceps', 'chest', 'shoulders'], 3))
      .toEqual(['chest', 'triceps', 'shoulders']);
  });

  it('caps the list at max', () => {
    expect(summariseMuscles(['chest', 'triceps', 'shoulders', 'back'], 2))
      .toEqual(['chest', 'triceps']);
  });

  it('returns an empty list for no muscles', () => {
    expect(summariseMuscles([], 3)).toEqual([]);
  });
});

describe('formatElapsed', () => {
  it('formats under an hour as m:ss', () => {
    expect(formatElapsed(12 * 60_000 + 4_000)).toBe('12:04');
  });

  it('formats an hour or more as h:mm:ss', () => {
    expect(formatElapsed(3_600_000 + 2 * 60_000 + 33_000)).toBe('1:02:33');
  });

  it('never goes negative when the clock moves backwards', () => {
    expect(formatElapsed(-5_000)).toBe('0:00');
  });
});
