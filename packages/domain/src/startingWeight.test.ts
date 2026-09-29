import { describe, expect, it } from 'vitest';
import { startingOneRepMax } from './startingWeight';

const man = { bodyweightKg: 80, gender: 'male' as const, level: 'intermediate' as const };

describe('startingOneRepMax', () => {
  it('scales by bodyweight and the movement', () => {
    expect(startingOneRepMax(man, { pattern: 'Squat', equipment: 'barbell' })).toBe(100);
    expect(startingOneRepMax(man, { pattern: 'Horizontal Push', equipment: 'barbell' })).toBe(80);
  });

  it('is lighter for a novice, a woman, and one dumbbell', () => {
    const squat = { pattern: 'Squat', equipment: 'barbell' as const };
    expect(startingOneRepMax({ ...man, level: 'novice' }, squat)).toBeCloseTo(60);
    expect(startingOneRepMax({ ...man, gender: 'female' }, squat)).toBeCloseTo(70);
    expect(startingOneRepMax(man, { pattern: 'Horizontal Push', equipment: 'dumbbell' })).toBeCloseTo(32);
  });
});
