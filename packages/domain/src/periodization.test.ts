import { describe, expect, it } from 'vitest';
import { blockPosition, cyclePlan, isDeloadCycle } from './periodization';

const base = (n: number, repsMin: number, repsMax: number) =>
  Array.from({ length: n }, (_, i) => ({ repsMin, repsMax, rir: i === 0 ? 3 : 2 }));
/** "8–10@2", "2+F", as the preview tables write them. */
const show = (sets: ReturnType<typeof cyclePlan>) =>
  sets.map((s) => (s.setType === 'failure' ? `${s.repsMin}+F` : `${s.repsMin}${s.repsMax !== s.repsMin ? `–${s.repsMax}` : ''}@${s.rir}`)).join(' ');

describe('cyclePlan', () => {
  it('tapers a hypertrophy exercise towards failure over the block, then deloads', () => {
    const plan = (cycle: number) => show(cyclePlan(base(4, 8, 10), cycle, { goal: 'hypertrophy', compound: true, deload: true }));
    expect([1, 2, 3, 4, 5, 6, 7].map(plan)).toEqual([
      '8–10@3 8–10@2 8–10@2 8–10@2',
      '8–10@2 8–10@2 8–10@2 8–10@2',
      '8–10@2 8–10@1 8–10@1 8–10@1',
      '8–10@1 8–10@1 8–10@1 8–10@1',
      '8–10@1 8–10@1 8–10@1 8+F',
      '8–10@1 8–10@0 8+F 8+F',
      '8@3 8–9@5 8–9@5',
    ]);
  });

  it('alternates moderate and heavy cycles for a compound when the goal is strength or both', () => {
    const plan = (cycle: number) => show(cyclePlan(base(4, 7, 9), cycle, { goal: 'both', compound: true, deload: true }));
    expect([1, 2, 4, 6, 7].map(plan)).toEqual([
      '7–9@2 7–9@2 7–9@2 7–9@2',
      '2–4@3 2–4@2 2+F 2+F',
      '2–4@2 2–4@1 2+F 2+F',
      '2–4@1 2–4@0 2+F 2+F',
      '7@3 7–8@5 7–8@5',
    ]);
  });

  it('keeps isolation work on the taper whatever the goal, and repeats the block after the seventh cycle', () => {
    const iso = (cycle: number) => show(cyclePlan(base(3, 12, 15), cycle, { goal: 'strength', compound: false, deload: true }));
    expect(iso(2)).toBe('12–15@2 12–15@2 12–15@2');
    expect(iso(8)).toBe(iso(1));
    expect(blockPosition(15)).toBe(1);
  });

  it('with no deload, the seventh cycle is a training cycle', () => {
    expect(isDeloadCycle(7, false)).toBe(false);
    expect(cyclePlan(base(4, 8, 10), 7, { goal: 'hypertrophy', compound: true, deload: false })).toHaveLength(4);
  });
});
