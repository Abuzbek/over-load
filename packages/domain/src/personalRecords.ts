import { estimateOneRepMax } from './oneRepMax';
import { countsTowardRecords, setVolumeKg, type CompletedSet } from './sets';

export type PersonalRecordType = 'max_weight' | 'max_reps' | 'max_volume' | 'est_1rm';

export type PersonalRecord = {
  exerciseId: string;
  type: PersonalRecordType;
  value: number;
  setId: string;
  /** Epoch milliseconds. */
  achievedAt: number;
};

type Metric = { type: PersonalRecordType; of: (set: CompletedSet) => number };

const METRICS: Metric[] = [
  { type: 'max_weight', of: (s) => s.weightKg ?? 0 },
  { type: 'max_reps', of: (s) => (s.weightKg === null ? 0 : (s.reps ?? 0)) },
  { type: 'max_volume', of: setVolumeKg },
  { type: 'est_1rm', of: (s) => estimateOneRepMax(s.weightKg ?? 0, s.reps ?? 0) },
];

/**
 * Recomputes every record from scratch. This is a derived cache, never a
 * source of truth, so it is always safe to throw away and rebuild.
 * Ties go to the earliest set — the first time you hit a number is the record.
 */
export function computePersonalRecords(sets: CompletedSet[]): PersonalRecord[] {
  const working = sets.filter(countsTowardRecords);
  const byExercise = new Map<string, CompletedSet[]>();

  for (const set of working) {
    const group = byExercise.get(set.exerciseId);
    if (group) group.push(set);
    else byExercise.set(set.exerciseId, [set]);
  }

  const records: PersonalRecord[] = [];

  for (const [exerciseId, group] of byExercise) {
    for (const metric of METRICS) {
      let best: CompletedSet | undefined;
      let bestValue = 0;

      for (const set of group) {
        const value = metric.of(set);
        if (value <= 0) continue;
        const isBetter = value > bestValue;
        const isEarlierTie =
          value === bestValue && best !== undefined && set.completedAt < best.completedAt;
        if (isBetter || isEarlierTie) {
          best = set;
          bestValue = value;
        }
      }

      if (best) {
        records.push({
          exerciseId,
          type: metric.type,
          value: bestValue,
          setId: best.id,
          achievedAt: best.completedAt,
        });
      }
    }
  }

  return records;
}
