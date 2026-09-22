import { describe, expect, it } from 'vitest';
import curated from '../../../../../tools/seed-exercises/curated.json';
import { MAPPED_MUSCLES, REGIONS } from './muscleRegions';

const CATALOGUE_MUSCLES = new Set(
  (curated as { primaryMuscle: string }[]).map((e) => e.primaryMuscle),
);

describe('muscle region map', () => {
  // A typo here is invisible: the muscle simply never lights up, and the
  // heatmap quietly under-reports forever.
  it('covers every primary muscle the exercise catalogue uses', () => {
    expect([...CATALOGUE_MUSCLES].filter((m) => !MAPPED_MUSCLES.has(m))).toEqual([]);
  });

  it('maps no muscle the catalogue does not have', () => {
    expect([...MAPPED_MUSCLES].filter((m) => !CATALOGUE_MUSCLES.has(m))).toEqual([]);
  });

  // Every region name is a string from someone else's package; a rename on
  // their side would silently orphan it.
  it('resolves every mapped region to a real path', () => {
    const mapped = REGIONS.filter((r) => r.muscle !== null);
    expect(mapped.length).toBeGreaterThan(30);
    expect(mapped.every((r) => typeof r.path === 'string' && r.path.length > 0)).toBe(true);
  });

  it('has both views', () => {
    expect(new Set(REGIONS.map((r) => r.view))).toEqual(new Set(['FRONT', 'BACK']));
  });
});
