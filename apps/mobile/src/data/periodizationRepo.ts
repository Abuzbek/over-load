import { cyclePlan, type CycleSet, type PlanGoal } from '@overload/domain';
import { lookups, type Db, type Exercise, type WorkoutSet } from '@overload/schema';
import { and, eq } from 'drizzle-orm';
import { getActiveProgram, getProgramDays } from './programRepo';
import { getTrainingPreferences } from './settingsRepo';

/** Which cycle a workout is being trained in, and how its block runs. */
export type CycleContext = { cycle: number; goal: PlanGoal; deload: boolean };

/**
 * The cycle a workout is on, when it is periodized: it is a day of the active
 * program, and that program was generated — a program built by hand keeps the
 * plan as written. Goal and deload are the ones the program was made with.
 */
export function cycleFor(db: Db, workoutId: string): CycleContext | null {
  const program = getActiveProgram(db);
  if (!program?.generated) return null;
  if (!getProgramDays(db, program.id).some((d) => d.workout?.id === workoutId)) return null;
  const prefs = getTrainingPreferences(db);
  return { cycle: program.cycleNumber, goal: prefs?.goal ?? 'hypertrophy', deload: prefs?.deload ?? true };
}

/**
 * An exercise's working sets for a cycle, from its planned sets: warm-ups
 * aside, the rep range and RIR of the plan are the first cycle's, and
 * periodization moves them on from there.
 */
export function cycleSets(db: Db, exercise: Exercise, planned: WorkoutSet[], context: CycleContext): CycleSet[] {
  const working = planned.filter((s) => s.setType !== 'warmup');
  const base = working.map((s) => ({ repsMin: s.targetReps ?? 8, repsMax: s.targetRepsMax ?? s.targetReps ?? 8, rir: s.targetRir ?? 2 }));
  return cyclePlan(base, context.cycle, { goal: context.goal, compound: isCompound(db, exercise), deload: context.deload });
}

function isCompound(db: Db, exercise: Exercise): boolean {
  if (!exercise.exerciseTypeId) return false;
  return (
    db
      .select({ name: lookups.name })
      .from(lookups)
      .where(and(eq(lookups.id, exercise.exerciseTypeId), eq(lookups.type, 'exerciseType')))
      .get()?.name.startsWith('Multi-joint') ?? false
  );
}

/** "7–9 reps", "8 reps", "2+ reps" (to failure). */
export function cycleSetLabel(set: CycleSet): string {
  if (set.repsMax === null) return `${set.repsMin}+ reps`;
  return set.repsMax > set.repsMin ? `${set.repsMin}–${set.repsMax} reps` : `${set.repsMin} reps`;
}
