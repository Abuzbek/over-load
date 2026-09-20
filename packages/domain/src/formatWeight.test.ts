import { describe, expect, it } from 'vitest';
import { formatWeight, toStorageKg } from './formatWeight';

describe('formatWeight', () => {
  it('shows kilograms unchanged', () => {
    expect(formatWeight(60, 'kg')).toBe('60 kg');
  });

  it('converts to pounds for display', () => {
    expect(formatWeight(100, 'lb')).toBe('220.5 lb');
  });

  it('renders an em dash for no weight', () => {
    expect(formatWeight(null, 'kg')).toBe('—');
  });

  it('drops a trailing zero', () => {
    expect(formatWeight(60.0, 'kg')).toBe('60 kg');
  });
});

describe('toStorageKg', () => {
  it('passes kilograms through untouched', () => {
    expect(toStorageKg(60, 'kg')).toBe(60);
  });

  it('round-trips pounds within a gram', () => {
    expect(toStorageKg(220.46, 'lb')).toBeCloseTo(100, 2);
  });
});
