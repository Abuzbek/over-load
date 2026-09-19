import { describe, expect, it } from 'vitest';
import { formatDuration, restRemainingSeconds } from './restTimer';

const START = 1_700_000_000_000;

describe('restRemainingSeconds', () => {
  it('returns the full duration at the moment the set completes', () => {
    expect(restRemainingSeconds(START, 120, START)).toBe(120);
  });

  it('counts down as wall-clock time passes', () => {
    expect(restRemainingSeconds(START, 120, START + 30_000)).toBe(90);
  });

  it('reaches zero exactly at the end', () => {
    expect(restRemainingSeconds(START, 120, START + 120_000)).toBe(0);
  });

  it('never goes negative, however long the app was suspended', () => {
    expect(restRemainingSeconds(START, 120, START + 999_000)).toBe(0);
  });

  it('rounds up so the display never shows 0 while time remains', () => {
    expect(restRemainingSeconds(START, 120, START + 119_500)).toBe(1);
  });
});

describe('formatDuration', () => {
  it('formats under a minute with a zero minute component', () => {
    expect(formatDuration(45)).toBe('0:45');
  });

  it('pads the seconds', () => {
    expect(formatDuration(65)).toBe('1:05');
  });

  it('formats zero', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('handles durations over ten minutes', () => {
    expect(formatDuration(725)).toBe('12:05');
  });
});
