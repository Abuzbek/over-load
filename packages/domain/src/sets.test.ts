import { describe, expect, it } from 'vitest';
import { countsTowardRecords, setVolumeKg, totalVolumeKg, type CompletedSet } from './sets';

function set(partial: Partial<CompletedSet> = {}): CompletedSet {
  return {
    id: 's1',
    exerciseId: 'e1',
    setType: 'normal',
    weightKg: 100,
    reps: 5,
    durationSeconds: null,
    completedAt: 1_700_000_000_000,
    ...partial,
  };
}

describe('countsTowardRecords', () => {
  it('counts normal sets', () => {
    expect(countsTowardRecords(set())).toBe(true);
  });

  it('counts failure sets', () => {
    expect(countsTowardRecords(set({ setType: 'failure' }))).toBe(true);
  });

  it('counts drop sets', () => {
    expect(countsTowardRecords(set({ setType: 'drop' }))).toBe(true);
  });

  it('excludes warmup sets', () => {
    expect(countsTowardRecords(set({ setType: 'warmup' }))).toBe(false);
  });
});

describe('setVolumeKg', () => {
  it('multiplies weight by reps', () => {
    expect(setVolumeKg(set({ weightKg: 100, reps: 5 }))).toBe(500);
  });

  it('is zero for a set with no weight', () => {
    expect(setVolumeKg(set({ weightKg: null, reps: 12 }))).toBe(0);
  });

  it('is zero for a set with no reps', () => {
    expect(setVolumeKg(set({ reps: null, durationSeconds: 60 }))).toBe(0);
  });
});

describe('totalVolumeKg', () => {
  it('sums working sets and ignores warmups', () => {
    const sets = [
      set({ id: 'a', setType: 'warmup', weightKg: 60, reps: 10 }),
      set({ id: 'b', weightKg: 100, reps: 5 }),
      set({ id: 'c', weightKg: 100, reps: 3 }),
    ];
    expect(totalVolumeKg(sets)).toBe(800);
  });

  it('is zero for an empty list', () => {
    expect(totalVolumeKg([])).toBe(0);
  });
});
