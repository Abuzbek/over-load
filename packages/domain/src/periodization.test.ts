import { describe, expect, it } from 'vitest';
import { blockPosition, cyclePlan, isDeloadCycle, retuneRange, schemeStep } from './periodization';

const base = (n: number, repsMin: number, repsMax: number) =>
  Array.from({ length: n }, (_, i) => ({ repsMin, repsMax, rir: i === 0 ? 3 : 2 }));
/** "8–10@2", "2+F", as the preview tables write them. */
const show = (sets: ReturnType<typeof cyclePlan>) =>
  sets.map((s) => (s.setType === 'failure' ? `${s.repsMin}+F` : `${s.repsMin}${s.repsMax !== s.repsMin ? `–${s.repsMax}` : ''}@${s.rir}`)).join(' ');

describe('cyclePlan', () => {
  it('tapers a hypertrophy exercise towards failure over the block, then deloads', () => {
    const plan = (cycle: number) => show(cyclePlan(base(4, 8, 10), cycle, { goal: 'hypertrophy', compound: true, deload: 'last' }));
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
    const plan = (cycle: number) => show(cyclePlan(base(4, 7, 9), cycle, { goal: 'both', compound: true, deload: 'last' }));
    expect([1, 2, 4, 6, 7].map(plan)).toEqual([
      '7–9@2 7–9@2 7–9@2 7–9@2',
      '2–4@3 2–4@2 2+F 2+F',
      '2–4@2 2–4@1 2+F 2+F',
      '2–4@1 2–4@0 2+F 2+F',
      '7@3 7–8@5 7–8@5',
    ]);
  });

  it('keeps isolation work on the taper whatever the goal, and repeats the block after the seventh cycle', () => {
    const iso = (cycle: number) => show(cyclePlan(base(3, 12, 15), cycle, { goal: 'strength', compound: false, deload: 'last' }));
    expect(iso(2)).toBe('16–19@2 16–19@2 16–19@2');
    expect(iso(8)).toBe(iso(1));
    expect(blockPosition(15)).toBe(1);
  });

  it('with no deload, the seventh cycle is a training cycle', () => {
    expect(isDeloadCycle(7, 'none')).toBe(false);
    expect(cyclePlan(base(4, 8, 10), 7, { goal: 'hypertrophy', compound: true, deload: 'none' })).toHaveLength(4);
  });
});

describe('the block follows the program', () => {
  it('spreads the scheme over any number of cycles, the deload first or last', () => {
    // Four cycles, deload last: three training cycles take steps 1, 4 (rounded from 3.5) and 6.
    expect([1, 2, 3].map((c) => schemeStep(c, 'last', 4))).toEqual([1, 4, 6]);
    expect(isDeloadCycle(4, 'last', 4)).toBe(true);
    // Deload first: cycle 1 is the deload, 2 starts the scheme.
    expect(isDeloadCycle(1, 'first', 7)).toBe(true);
    expect(schemeStep(2, 'first', 7)).toBe(1);
    // One cycle: always the first step, never a deload.
    expect(isDeloadCycle(1, 'last', 1)).toBe(false);
    expect(schemeStep(5, 'last', 1)).toBe(1);
  });
});

describe('retuneRange', () => {
  it('moves a stalled exercise to a fresh range of the same width, and leaves one that progressed', () => {
    expect(retuneRange(10, 12, 0)).toEqual({ repsMin: 7, repsMax: 9 });
    expect(retuneRange(6, 8, -0.02)).toEqual({ repsMin: 9, repsMax: 11 });
    expect(retuneRange(8, 10, 0.04)).toBeNull();
  });
});

describe('rules after MacroFactor', () => {
  it('rotates an isolation through its rep zones — the plan, higher, lower — and deloads at the plan', () => {
    const zone = (cycle: number) => show(cyclePlan(base(2, 10, 12), cycle, { goal: 'hypertrophy', compound: false, deload: 'last' })).split(' ')[0];
    expect([1, 2, 3, 4, 5, 6, 7].map(zone)).toEqual(['10–12@3', '14–16@2', '7–9@2', '10–12@1', '14–16@1', '7–9@1', '10@3']);
    // A wide plan (10–15) rotates through narrower zones.
    expect(show(cyclePlan(base(1, 10, 15), 2, { goal: 'hypertrophy', compound: false, deload: 'last' }))).toBe('14–17@3');
  });

  it('keeps a heavy barbell compound off failure in a hypertrophy block', () => {
    const plan = (cycle: number) => show(cyclePlan(base(4, 8, 10), cycle, { goal: 'hypertrophy', compound: true, barbell: true, deload: 'last' }));
    expect(plan(5)).toBe('8–10@1 8–10@1 8–10@1 8–10@1');
    expect(plan(6)).toBe('8–10@1 8–10@1 8–10@1 8–10@1');
  });

  it('allows a barbell compound one low-rep set to failure, in the strength scheme\'s hardest cycle only', () => {
    const plan = (cycle: number) => show(cyclePlan(base(4, 7, 9), cycle, { goal: 'both', compound: true, barbell: true, deload: 'last' }));
    expect(plan(2)).toBe('2–4@3 2–4@2 2–4@1 2–4@1');
    expect(plan(6)).toBe('2–4@1 2–4@1 2–4@1 2+F');
  });

  it('adds a rep a cycle to a bodyweight exercise, and deloads at its plan', () => {
    const plan = (cycle: number) => show(cyclePlan(base(3, 8, 10), cycle, { goal: 'hypertrophy', compound: true, bodyweight: true, deload: 'first' }));
    expect(plan(1)).toBe('8@3 8–9@5');
    expect(plan(2).split(' ')[0]).toBe('8–10@3');
    expect(plan(4).split(' ')[0]).toBe('10–12@2');
  });
});
