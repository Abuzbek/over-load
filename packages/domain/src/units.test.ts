import { describe, expect, it } from 'vitest';
import { kgToLb, lbToKg, roundToIncrement } from './units';

describe('unit conversion', () => {
  it('converts kilograms to pounds', () => {
    expect(kgToLb(100)).toBeCloseTo(220.462, 3);
  });

  it('converts pounds to kilograms', () => {
    expect(lbToKg(220.462)).toBeCloseTo(100, 3);
  });

  it('round-trips without drift', () => {
    expect(lbToKg(kgToLb(62.5))).toBeCloseTo(62.5, 6);
  });
});

describe('roundToIncrement', () => {
  it('rounds to the nearest 2.5kg plate step', () => {
    expect(roundToIncrement(61.2, 2.5)).toBe(60);
    expect(roundToIncrement(63.9, 2.5)).toBe(65);
  });

  it('rounds half-steps up', () => {
    expect(roundToIncrement(61.25, 2.5)).toBe(62.5);
  });

  it('returns the value unchanged when the increment is zero', () => {
    expect(roundToIncrement(61.2, 0)).toBe(61.2);
  });
});
