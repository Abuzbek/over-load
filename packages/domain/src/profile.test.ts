import { describe, expect, it } from 'vitest';
import {
  birthDateParts,
  cmToFeetInches,
  feetInchesToCm,
  formatBirthDate,
  formatHeight,
  isRealDate,
  toBirthDate,
} from './profile';

describe('formatHeight', () => {
  it('shows nothing for an unset height', () => {
    expect(formatHeight(null, 'cm')).toBe('—');
    expect(formatHeight(null, 'ft')).toBe('—');
  });

  it('rounds centimetres to the whole', () => {
    expect(formatHeight(180.4, 'cm')).toBe('180 cm');
  });

  it('splits feet and inches', () => {
    expect(formatHeight(180.34, 'ft')).toBe("5'11\"");
    expect(formatHeight(152.4, 'ft')).toBe("5'0\"");
  });

  it("carries a rounded-up twelfth inch into the next foot", () => {
    // 182.8cm is 71.97", which rounds to 72" — six feet, not 5'12".
    expect(formatHeight(182.8, 'ft')).toBe("6'0\"");
  });
});

describe('feet and inches', () => {
  it('round-trips a height', () => {
    const cm = feetInchesToCm(5, 11);
    expect(cmToFeetInches(cm)).toEqual({ feet: 5, inches: 11 });
  });
});

describe('birth dates', () => {
  it('formats and parts round-trip in UTC', () => {
    const ms = toBirthDate(1, 3, 1994);
    expect(formatBirthDate(ms)).toBe('1 Mar 1994');
    expect(birthDateParts(ms)).toEqual({ day: 1, month: 3, year: 1994 });
  });

  it('shows nothing for an unset birthday', () => {
    expect(formatBirthDate(null)).toBe('—');
  });

  it('rejects dates that do not exist', () => {
    expect(isRealDate(31, 2, 1994)).toBe(false);
    expect(isRealDate(29, 2, 1995)).toBe(false);
    expect(isRealDate(29, 2, 1996)).toBe(true); // a leap year
    expect(isRealDate(0, 1, 1994)).toBe(false);
    expect(isRealDate(1, 13, 1994)).toBe(false);
    expect(isRealDate(1, 1, 1800)).toBe(false);
    expect(isRealDate(1.5, 1, 1994)).toBe(false);
  });
});
