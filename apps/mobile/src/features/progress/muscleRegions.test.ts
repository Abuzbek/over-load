import { describe, expect, it } from 'vitest';
import appFile from '../../../assets/app_file.json';
import { aspectRatio, MAPPED_MUSCLES, REGIONS, UNDRAWN_MUSCLES, viewBox } from './muscleRegions';

const FIGURES = ['male', 'female'] as const;
const VIEWS = ['FRONT', 'BACK'] as const;

// The muscle groups the heatmap aggregates by: exercise_muscles points at
// these lookups, and muscleLoad returns their names.
const CATALOGUE_MUSCLES = new Set(
  Object.values(appFile.uuidIndex as Record<string, { type: string; name: unknown }>)
    .filter((e) => e.type === 'featureMuscleGroup')
    .map((e) => String(e.name)),
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

  // Documents the known gaps so that drawing one, or losing another, is a
  // test change rather than a silent behaviour change.
  it('has exactly the known muscles the artwork cannot draw', () => {
    expect(UNDRAWN_MUSCLES).toEqual(['Hip flexors']);
    expect(UNDRAWN_MUSCLES.every((m) => CATALOGUE_MUSCLES.has(m))).toBe(true);
    expect(UNDRAWN_MUSCLES.every((m) => !MAPPED_MUSCLES.has(m))).toBe(true);
  });

  // Both bodies must light the same muscles, or switching gender in the
  // profile would quietly drop one from the map.
  it('draws the same muscles on both figures', () => {
    const muscles = (figure: string) =>
      [...new Set(REGIONS.filter((r) => r.figure === figure && r.muscle).map((r) => r.muscle))].sort();
    expect(muscles('female')).toEqual(muscles('male'));
    expect(muscles('male')).toEqual([...CATALOGUE_MUSCLES].filter((m) => !UNDRAWN_MUSCLES.includes(m)).sort());
  });

  it('maps no muscle the catalogue does not have', () => {
    expect([...MAPPED_MUSCLES].filter((m) => !CATALOGUE_MUSCLES.has(m))).toEqual([]);
  });

  it('every mapped region carries at least one path', () => {
    const mapped = REGIONS.filter((r) => r.muscle !== null);
    expect(mapped.length).toBeGreaterThan(100);
    expect(mapped.every((r) => r.paths.length > 0 && r.paths.every(Boolean))).toBe(true);
  });

  it('keeps the silhouette and joints as backdrop, never as a muscle', () => {
    const backdrops = REGIONS.filter((r) => r.backdrop);
    // One silhouette per figure and view, plus the back views' joints.
    expect(backdrops.filter((r) => r.id === 'body').length).toBe(4);
    expect(backdrops.every((r) => r.muscle === null)).toBe(true);
    expect(REGIONS.filter((r) => !r.backdrop).every((r) => r.muscle !== null)).toBe(true);
  });

  it('has both views of both figures', () => {
    const keys = new Set(REGIONS.map((r) => `${r.figure}-${r.view}`));
    expect(keys).toEqual(new Set(FIGURES.flatMap((f) => VIEWS.map((v) => `${f}-${v}`))));
  });

  // build.py tightens each viewBox to the ink by walking the path data; its own
  // parser is checked there (selfcheck()). This is the coarse guard on the
  // result: the shape of the box, and that no path even starts outside it. It
  // cannot see a box that crops a limb, since only the opening move of each
  // path is absolute — that failure shows up on screen, not here.
  it('gives each view a tall box its paths start inside', () => {
    for (const [figure, view] of FIGURES.flatMap((f) => VIEWS.map((v) => [f, v] as const))) {
      const [x, y, width, height] = viewBox(figure, view).split(' ').map(Number) as number[];
      expect(width!).toBeGreaterThan(0);
      // A human figure is much taller than it is wide; a box near 1:1 means the
      // bounds collapsed back to the source artwork's square canvas.
      expect(aspectRatio(figure, view)).toBeLessThan(0.6);

      for (const region of REGIONS.filter((r) => r.figure === figure && r.view === view)) {
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
