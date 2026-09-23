import { describe, expect, it } from 'vitest';
import curated from '../../../../../tools/seed-exercises/curated.json';
import { aspectRatio, MAPPED_MUSCLES, REGIONS, UNDRAWN_MUSCLES, VIEW_BOXES } from './muscleRegions';

const CATALOGUE_MUSCLES = new Set(
  (curated as { primaryMuscle: string }[]).map((e) => e.primaryMuscle),
);

describe('muscle region map', () => {
  // A typo here is invisible: the muscle simply never lights up, and the
  // heatmap quietly under-reports forever.
  it('covers every catalogue muscle the artwork can draw', () => {
    const missing = [...CATALOGUE_MUSCLES].filter(
      (m) => !MAPPED_MUSCLES.has(m) && !UNDRAWN_MUSCLES.includes(m),
    );
    expect(missing).toEqual([]);
  });

  // Documents the known gap so that adding an adductor region, or losing
  // another one, is a test change rather than a silent behaviour change.
  it('has exactly one muscle the artwork cannot draw', () => {
    expect(UNDRAWN_MUSCLES).toEqual(['adductors']);
    expect(UNDRAWN_MUSCLES.every((m) => CATALOGUE_MUSCLES.has(m))).toBe(true);
    expect(UNDRAWN_MUSCLES.every((m) => !MAPPED_MUSCLES.has(m))).toBe(true);
  });

  it('maps no muscle the catalogue does not have', () => {
    expect([...MAPPED_MUSCLES].filter((m) => !CATALOGUE_MUSCLES.has(m))).toEqual([]);
  });

  it('every mapped region carries at least one path', () => {
    const mapped = REGIONS.filter((r) => r.muscle !== null);
    expect(mapped.length).toBeGreaterThan(35);
    expect(mapped.every((r) => r.paths.length > 0 && r.paths.every(Boolean))).toBe(true);
  });

  it('keeps the silhouette as backdrop, never as a muscle', () => {
    const backdrops = REGIONS.filter((r) => r.backdrop);
    expect(backdrops.length).toBe(4);
    expect(backdrops.every((r) => r.muscle === null)).toBe(true);
  });

  it('has both views', () => {
    expect(new Set(REGIONS.map((r) => r.view))).toEqual(new Set(['FRONT', 'BACK']));
  });

  // build.py tightens each viewBox to the ink by walking the path data; its own
  // parser is checked there (selfcheck()). This is the coarse guard on the
  // result: the shape of the box, and that no path even starts outside it. It
  // cannot see a box that crops a limb, since only the opening move of each
  // path is absolute — that failure shows up on screen, not here.
  it('gives each view a tall box its paths start inside', () => {
    for (const view of ['FRONT', 'BACK'] as const) {
      const [x, y, width, height] = VIEW_BOXES[view].split(' ').map(Number) as number[];
      expect(width!).toBeGreaterThan(0);
      // A human figure is much taller than it is wide; a box near 1:1 means the
      // bounds collapsed back to the source artwork's square canvas.
      expect(aspectRatio(view)).toBeLessThan(0.6);

      for (const region of REGIONS.filter((r) => r.view === view)) {
        for (const d of region.paths) {
          const move = /^M(-?[\d.]+)[ ,](-?[\d.]+)/.exec(d);
          expect(move).not.toBeNull();
          const px = Number(move![1]);
          const py = Number(move![2]);
          expect(px).toBeGreaterThanOrEqual(x!);
          expect(px).toBeLessThanOrEqual(x! + width!);
          expect(py).toBeGreaterThanOrEqual(y!);
          expect(py).toBeLessThanOrEqual(y! + height!);
        }
      }
    }
  });
});
