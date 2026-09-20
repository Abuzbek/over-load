import { describe, expect, it } from 'vitest';
import { computePersonalRecords } from './personalRecords';
import type { CompletedSet } from './sets';

function set(over: Partial<CompletedSet> = {}): CompletedSet {
  return {
    id: 'a', exerciseId: 'e', trackingType: 'weight_reps', setType: 'normal',
    weightKg: 10, reps: 5, durationSeconds: null, distanceM: null,
    completedAt: 1, ...over,
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
    expect(maxWeight).toMatchObject({ value: 120, setId: 'b', exerciseId: 'e' });
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
      set({ id: 'plank', exerciseId: 'plank', trackingType: 'reps', weightKg: null, reps: null, durationSeconds: 60 }),
    ]);
    expect(records).toEqual([]);
  });

  it('records a max_reps PR for a bodyweight exercise, which carries no weight', () => {
    const records = computePersonalRecords([
      set({ id: 'pullup-a', exerciseId: 'pullup', trackingType: 'reps', weightKg: null, reps: 8 }),
      set({ id: 'pullup-b', exerciseId: 'pullup', trackingType: 'reps', weightKg: null, reps: 12 }),
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

describe('metric selection by tracking type', () => {
  it('gives a duration exercise a max_duration record and nothing else', () => {
    const records = computePersonalRecords([
      set({ trackingType: 'duration', weightKg: 17, reps: 8, durationSeconds: 60 }),
    ]);
    expect(records.map((r) => r.type).sort()).toEqual(['max_duration']);
  });

  it('never gives a stretch an estimated one-rep max', () => {
    const records = computePersonalRecords([
      set({ trackingType: 'duration', weightKg: 17, reps: 8, durationSeconds: 60 }),
    ]);
    expect(records.find((r) => r.type === 'est_1rm')).toBeUndefined();
  });

  it('gives a bodyweight exercise only max_reps', () => {
    const records = computePersonalRecords([set({ trackingType: 'reps', weightKg: null, reps: 12 })]);
    expect(records.map((r) => r.type)).toEqual(['max_reps']);
  });

  it('gives a distance exercise distance and duration records', () => {
    const records = computePersonalRecords([
      set({ trackingType: 'distance_duration', weightKg: null, reps: null, distanceM: 5000, durationSeconds: 1500 }),
    ]);
    expect(records.map((r) => r.type).sort()).toEqual(['max_distance', 'max_duration']);
  });

  it('still gives a weight_reps exercise all four records', () => {
    const records = computePersonalRecords([set()]);
    expect(records.map((r) => r.type).sort()).toEqual(['est_1rm', 'max_reps', 'max_volume', 'max_weight']);
  });
});
