import type { SessionSet } from '@overload/schema';
import { describe, expect, it } from 'vitest';
import { repsPlaceholder, setProgress, setTableRows, targetLines } from './setTable';

const set = (id: string, over: Partial<SessionSet> = {}): SessionSet =>
  ({
    id, setType: 'normal', parentSetId: null, completedAt: null, weightKg: null, reps: null,
    targetReps: null, targetRepsMax: null, targetRir: null, targetWeightKg: null, ...over,
  }) as SessionSet;

describe('setTableRows', () => {
  it('numbers working sets past warm-ups, letters the special ones, and puts rounds under their set', () => {
    const rows = setTableRows([
      set('w', { setType: 'warmup' }),
      set('a'),
      set('b', { setType: 'drop' }),
      set('c', { setType: 'failure' }),
      set('r', { setType: 'drop', parentSetId: 'b' }),
    ]);
    expect(rows.map((r) => [r.set.id, r.badge, r.round])).toEqual([
      ['w', 'W', false], ['a', '1', false], ['b', 'D', false], ['r', '', true], ['c', 'F', false],
    ]);
  });
});

describe('setProgress', () => {
  it('is the first working set not done, of all working sets', () => {
    const sets = [set('w', { setType: 'warmup' }), set('a', { completedAt: 1 }), set('b'), set('c')];
    expect(setProgress(sets)).toEqual({ current: 2, total: 3 });
    expect(setProgress(sets.map((s) => ({ ...s, completedAt: 1 })))).toEqual({ current: 3, total: 3 });
  });
});

describe('targetLines', () => {
  it('shows the range and RIR, the load when planned, and a warm-up as load × reps', () => {
    expect(targetLines(set('a', { targetReps: 7, targetRepsMax: 9, targetRir: 2 }), 'kg')).toEqual(['7–9 reps', '2 RIR']);
    expect(targetLines(set('a', { targetReps: 7, targetRepsMax: 9, targetWeightKg: 80, targetRir: 2 }), 'kg')).toEqual(['80 kg × 7–9', '2 RIR']);
    expect(targetLines(set('w', { setType: 'warmup', weightKg: 40, targetReps: 8 }), 'kg')).toEqual(['40 kg × 8', null]);
    expect(repsPlaceholder(set('a', { targetReps: 7, targetRepsMax: 9 }))).toBe(9);
    expect(targetLines(set('r', { parentSetId: 'a', setType: 'drop', targetWeightKg: 30, targetRir: 0 }), 'kg')).toEqual(['30 kg', '0 RIR']);
  });
});
