import { describe, expect, it } from 'vitest';
import { plateLoading, plateStepKg } from './plates';

const PLATES = [1.25, 2.5, 5, 10, 15, 20];

describe('plateLoading', () => {
  it('loads the heaviest plates first, per side', () => {
    expect(plateLoading(55, 20, PLATES)).toEqual({ perSide: [{ kg: 15, count: 1 }, { kg: 2.5, count: 1 }], sideKg: 17.5, shortKg: 0 });
    expect(plateLoading(140, 20, PLATES).perSide).toEqual([{ kg: 20, count: 3 }]);
  });

  it('says what the plates cannot make, and loads nothing under the bar', () => {
    expect(plateLoading(21, 20, PLATES)).toMatchObject({ perSide: [], shortKg: 1 });
    expect(plateLoading(10, 20, PLATES)).toMatchObject({ perSide: [], sideKg: 0, shortKg: 0 });
    // A weight converted from pounds: a hair off 70 kg is 70 kg.
    expect(plateLoading(70 + 3e-6, 20, PLATES).shortKg).toBe(0);
    expect(plateLoading(70 - 3e-7, 20, PLATES).shortKg).toBe(0);
  });

  it('steps by the lightest pair of plates', () => {
    expect(plateStepKg(PLATES)).toBe(2.5);
    expect(plateStepKg([])).toBeNull();
  });
});

