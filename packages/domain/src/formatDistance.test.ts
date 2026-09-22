import { describe, expect, it } from 'vitest';
import { formatDistance } from './formatDistance';

describe('formatDistance', () => {
  it('renders an em dash for no distance', () => {
    expect(formatDistance(null, 'km')).toBe('—');
    expect(formatDistance(null, 'mi')).toBe('—');
  });

  describe('km', () => {
    it('shows whole metres below 1000m', () => {
      expect(formatDistance(400, 'km')).toBe('400 m');
    });

    it('shows one decimal in km at or above 1000m', () => {
      expect(formatDistance(5200, 'km')).toBe('5.2 km');
    });

    it('covers the 999 vs 1000 metre boundary', () => {
      expect(formatDistance(999, 'km')).toBe('999 m');
      expect(formatDistance(1000, 'km')).toBe('1 km');
    });
  });

  describe('mi', () => {
    it('shows whole yards below 0.1 mile', () => {
      expect(formatDistance(100, 'mi')).toBe('109 yd');
    });

    it('shows one decimal in miles at or above 0.1 mile', () => {
      expect(formatDistance(5000, 'mi')).toBe('3.1 mi');
    });

    it('covers the 160 vs 161 metre boundary', () => {
      expect(formatDistance(160, 'mi')).toBe('175 yd');
      expect(formatDistance(161, 'mi')).toBe('0.1 mi');
    });
  });
});
