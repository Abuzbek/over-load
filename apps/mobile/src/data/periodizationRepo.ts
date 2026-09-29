import { blockPosition, cyclePlan, type CycleSet, type DeloadAt, type PlanGoal } from '@overload/domain';
import { cyclePlans, lookups, newId, type Db, type Exercise, type WorkoutSet } from '@overload/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { getActiveProgram, getProgramDays } from './programRepo';
import { getTrainingPreferences } from './settingsRepo';

/** Which cycle a workout is being trained in, and how its block runs. */
export type CycleContext = { programId: string; cycle: number; goal: PlanGoal; deload: DeloadAt; cycleCount: number };

/**
 * The cycle a workout is on, when it is periodized: it is a day of the active
 * program, and that program has periodization on (a generated program from
 * the start, one built by hand if turned on). Goal, deload and block length
 * are the program's; a program with no goal of its own takes the preferences'.
 */
export function cycleFor(db: Db, workoutId: string): CycleContext | null {
  const program = getActiveProgram(db);
  if (!program?.periodized) return null;
  if (!getProgramDays(db, program.id).some((d) => d.workout?.id === workoutId)) return null;
  return {
    programId: program.id,
    cycle: program.cycleNumber,
    goal: program.goal ?? getTrainingPreferences(db)?.goal ?? 'hypertrophy',
    deload: program.deload,
    cycleCount: program.cycleCount,
  };
}

/**
 * An exercise's working sets for a cycle: the user's own plan for that cycle
 * if they edited it (cycle_plans), else periodization's, from the planned sets
 * — warm-ups aside, the plan's rep range and RIR are the first cycle's, and
 * periodization moves them on from there.
 */
export function cycleSets(db: Db, workoutExerciseId: string, exercise: Exercise, planned: WorkoutSet[], context: CycleContext): CycleSet[] {
  const own = getCyclePlan(db, workoutExerciseId, blockPosition(context.cycle, context.cycleCount));
  if (own) return own;
  const working = planned.filter((s) => s.setType !== 'warmup');
  const base = working.map((s) => ({ repsMin: s.targetReps ?? 8, repsMax: s.targetRepsMax ?? s.targetReps ?? 8, rir: s.targetRir ?? 2 }));
  return cyclePlan(base, context.cycle, {
    goal: context.goal,
    compound: isCompound(db, exercise),
    deload: context.deload,
    cycleCount: context.cycleCount,
    barbell: /barbell|trap bar/i.test(exercise.equipment),
    bodyweight: exercise.trackingType === 'reps',
  });
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

/** The user's own sets for one cycle (its position in the block), if they edited it. */
export function getCyclePlan(db: Db, workoutExerciseId: string, position: number): CycleSet[] | null {
  return (
    db
      .select({ sets: cyclePlans.sets })
      .from(cyclePlans)
      .where(and(eq(cyclePlans.workoutExerciseId, workoutExerciseId), eq(cyclePlans.cycle, position), isNull(cyclePlans.deletedAt)))
      .get()?.sets ?? null
  );
}

/** Saves an exercise's sets for the given cycles (positions in the block), replacing what they had. */
export function saveCyclePlan(db: Db, workoutExerciseId: string, positions: number[], sets: CycleSet[], at: number): void {
  const plan = sets.map((s) => ({ repsMin: s.repsMin, repsMax: s.repsMax, rir: s.rir, setType: s.setType === 'warmup' ? ('normal' as const) : s.setType }));
  db.transaction((tx) => {
    for (const cycle of positions) {
      const existing = tx
        .select({ id: cyclePlans.id })
        .from(cyclePlans)
        .where(and(eq(cyclePlans.workoutExerciseId, workoutExerciseId), eq(cyclePlans.cycle, cycle), isNull(cyclePlans.deletedAt)))
        .get();
      if (existing) tx.update(cyclePlans).set({ sets: plan, updatedAt: at }).where(eq(cyclePlans.id, existing.id)).run();
      else tx.insert(cyclePlans).values({ id: newId(), createdAt: at, updatedAt: at, deletedAt: null, workoutExerciseId, cycle, sets: plan }).run();
    }
  });
}

/** Back to periodization's plan for every cycle: the user's edits for the exercise go. */
export function clearCyclePlans(db: Db, workoutExerciseId: string, at: number): void {
  db.update(cyclePlans)
    .set({ deletedAt: at, updatedAt: at })
    .where(and(eq(cyclePlans.workoutExerciseId, workoutExerciseId), isNull(cyclePlans.deletedAt)))
    .run();
}
