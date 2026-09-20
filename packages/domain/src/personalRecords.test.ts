import { describe, expect, it } from 'vitest';
import { computePersonalRecords } from './personalRecords';
import type { CompletedSet } from './sets';

function set(partial: Partial<CompletedSet> & { id: string }): CompletedSet {
  return {
    exerciseId: 'bench',
    setType: 'normal',
    weightKg: 100,
    reps: 5,
    durationSeconds: null,
    completedAt: 1_700_000_000_000,
    ...partial,
  };
}

describe('computePersonalRecords', () => {
  it('returns no records for an empty list', () => {
    expect(computePersonalRecords([])).toEqual([]);
  });

  it('finds the heaviest set', () => {
    const records = computePersonalRecords([
      set({ id: 'a', weightKg: 100, reps: 5 }),
      set({ id: 'b', weightKg: 120, reps: 1 }),
    ]);
    const maxWeight = records.find((r) => r.type === 'max_weight');
    expect(maxWeight).toMatchObject({ value: 120, setId: 'b', exerciseId: 'bench' });
  });

  it('finds the highest estimated 1RM, which need not be the heaviest set', () => {
    const records = computePersonalRecords([
      set({ id: 'heavy', weightKg: 120, reps: 1 }),   // est 120
      set({ id: 'volume', weightKg: 105, reps: 5 }),  // est 122.5
    ]);
    const est = records.find((r) => r.type === 'est_1rm');
    expect(est?.setId).toBe('volume');
    expect(est?.value).toBeCloseTo(122.5, 3);
  });

  it('ignores warmup sets entirely', () => {
    const records = computePersonalRecords([
      set({ id: 'w', setType: 'warmup', weightKg: 200, reps: 1 }),
      set({ id: 'a', weightKg: 100, reps: 5 }),
    ]);
    expect(records.every((r) => r.setId === 'a')).toBe(true);
  });

  it('keeps records separate per exercise', () => {
    const records = computePersonalRecords([
      set({ id: 'a', exerciseId: 'bench', weightKg: 100, reps: 5 }),
      set({ id: 'b', exerciseId: 'squat', weightKg: 150, reps: 5 }),
    ]);
    const benchMax = records.find((r) => r.exerciseId === 'bench' && r.type === 'max_weight');
    const squatMax = records.find((r) => r.exerciseId === 'squat' && r.type === 'max_weight');
    expect(benchMax?.value).toBe(100);
    expect(squatMax?.value).toBe(150);
  });

  it('breaks ties in favour of the earliest set', () => {
    const records = computePersonalRecords([
      set({ id: 'later', weightKg: 100, reps: 5, completedAt: 2000 }),
      set({ id: 'earlier', weightKg: 100, reps: 5, completedAt: 1000 }),
    ]);
    const maxWeight = records.find((r) => r.type === 'max_weight');
    expect(maxWeight?.setId).toBe('earlier');
  });

  it('omits weight-based records for sets with no weight', () => {
    const records = computePersonalRecords([
      set({ id: 'plank', exerciseId: 'plank', weightKg: null, reps: null, durationSeconds: 60 }),
    ]);
    expect(records).toEqual([]);
  });

  it('records a max_reps PR for a bodyweight exercise, which carries no weight', () => {
    const records = computePersonalRecords([
      set({ id: 'pullup-a', exerciseId: 'pullup', weightKg: null, reps: 8 }),
      set({ id: 'pullup-b', exerciseId: 'pullup', weightKg: null, reps: 12 }),
    ]);

    // max_reps is the only record that means anything without a load, so it
    // must exist; the weight-derived metrics stay absent.
    expect(records.find((r) => r.type === 'max_reps')).toMatchObject({
      value: 12,
      setId: 'pullup-b',
      exerciseId: 'pullup',
    });
    expect(records.map((r) => r.type)).toEqual(['max_reps']);
  });
});
