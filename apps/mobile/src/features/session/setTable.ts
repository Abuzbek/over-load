import { formatWeight, type Unit } from '@overload/domain';
import type { SessionSet, SetType } from '@overload/schema';

/**
 * How the logger lays out an exercise's sets, kept out of the components so it
 * can be tested: every set of its own in order, each drop or myo set followed
 * by its rounds.
 */
export type SetTableRow = {
  set: SessionSet;
  /** "W" for a warm-up, the set's number, or D / M / F for a drop, myo or failure set. */
  badge: string;
  /** A later round of a drop or myo set: no badge of its own. */
  round: boolean;
};

const LETTER: Partial<Record<SetType, string>> = { warmup: 'W', drop: 'D', myo: 'M', failure: 'F' };

export function setTableRows(sets: SessionSet[]): SetTableRow[] {
  const rounds = new Map<string, SessionSet[]>();
  for (const s of sets) if (s.parentSetId) rounds.set(s.parentSetId, [...(rounds.get(s.parentSetId) ?? []), s]);
  let n = 0;
  return sets
    .filter((s) => !s.parentSetId)
    .flatMap((set) => {
      if (set.setType !== 'warmup') n += 1;
      const badge = LETTER[set.setType] ?? String(n);
      return [{ set, badge, round: false }, ...(rounds.get(set.id) ?? []).map((r) => ({ set: r, badge: '', round: true }))];
    });
}

/** "Set 2 of 4": the first working set not yet done, of all of them. Warm-ups and rounds do not count. */
export function setProgress(sets: SessionSet[]): { current: number; total: number } {
  const working = sets.filter((s) => !s.parentSetId && s.setType !== 'warmup');
  const next = working.findIndex((s) => s.completedAt === null);
  return { current: next === -1 ? working.length : next + 1, total: working.length };
}

/** "7–9", "8", or null with no target. */
export function repTarget(set: Pick<SessionSet, 'targetReps' | 'targetRepsMax'>): string | null {
  if (set.targetReps === null) return null;
  return set.targetRepsMax !== null && set.targetRepsMax > set.targetReps ? `${set.targetReps}–${set.targetRepsMax}` : String(set.targetReps);
}

/**
 * The plan column: "80 kg × 7–9" (or "7–9 reps" without a load) over "2 RIR".
 * A warm-up has no RIR to aim for; a drop or myo round is its load: "30 kg"
 * over "0 RIR".
 */
export function targetLines(set: SessionSet, unit: Unit): [string, string | null] {
  if (set.parentSetId) {
    const load = set.targetWeightKg ?? set.weightKg;
    return [load !== null ? formatWeight(load, unit) : '—', set.targetRir !== null ? `${set.targetRir} RIR` : null];
  }
  const reps = repTarget(set);
  const load = set.targetWeightKg ?? (set.setType === 'warmup' ? set.weightKg : null);
  const main = load !== null && reps ? `${formatWeight(load, unit)} × ${reps}` : reps ? `${reps} reps` : '—';
  return [main, set.setType !== 'warmup' && set.targetRir !== null ? `${set.targetRir} RIR` : null];
}

/** What an empty reps box shows, and logs if the set is ticked untouched: the top of the range. */
export function repsPlaceholder(set: Pick<SessionSet, 'targetReps' | 'targetRepsMax'>): number | null {
  return set.targetRepsMax ?? set.targetReps;
}
