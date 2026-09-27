import {
  STARTING_EXTRA_RIR,
  startingOneRepMax,
  suggestFromOneRepMax,
  suggestSets,
  targetOneRepMax,
  bestSet,
  type LoggedSet,
  type SetPlan,
  type Suggestion,
  type SuggestionBasis,
} from '@overload/domain';
import { exerciseEquipment, exerciseLinks, lookups, type Db, type Exercise } from '@overload/schema';
import { and, asc, eq } from 'drizzle-orm';
import { listGymEquipment, loadableWeights } from './gymRepo';
import { getProfile } from './settingsRepo';

/**
 * Resistance the logged weight leaves out, for smart progression: a
 * plate-loaded machine's own (its base weight, from the gym's equipment) and
 * the share of bodyweight the movement lifts (the catalogue's fraction, times
 * the profile's bodyweight). A weighted dip progresses on the whole load.
 */
export function resistanceOffsetKg(db: Db, gymId: string | null, exercise: Exercise): number {
  let offset = 0;
  const bodyweight = getProfile(db).bodyweightKg;
  if (bodyweight && exercise.bodyweight) offset += bodyweight * exercise.bodyweight;
  if (gymId) {
    const needed = new Set(
      db
        .select({ id: exerciseEquipment.equipmentId })
        .from(exerciseEquipment)
        .where(and(eq(exerciseEquipment.exerciseId, exercise.id), eq(exerciseEquipment.need, 'resistance')))
        .all()
        .map((r) => r.id),
    );
    const machine = listGymEquipment(db, gymId).find(
      (r) => r.owned && needed.has(r.equipment.id) && r.equipment.category === 'plate_loaded_machines' && r.config.kind === 'base',
    );
    if (machine?.config.kind === 'base') offset += machine.config.baseKg;
  }
  return Math.round(offset * 10) / 10;
}

/** The catalogue's first movement pattern for an exercise, by name. */
function movementPattern(db: Db, exerciseId: string): string | null {
  return (
    db
      .select({ name: lookups.name })
      .from(exerciseLinks)
      .innerJoin(lookups, eq(lookups.id, exerciseLinks.lookupId))
      .where(and(eq(exerciseLinks.exerciseId, exerciseId), eq(exerciseLinks.role, 'movementPattern')))
      .orderBy(asc(exerciseLinks.position))
      .get()?.name ?? null
  );
}

/** What loads it, from the exercise's first resistance equipment ("Barbell and weight plates", "Dumbbell"…). */
function equipmentKind(exercise: Exercise): 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'other' {
  const e = exercise.equipment.toLowerCase();
  if (e.includes('dumbbell') || e.includes('kettlebell')) return 'dumbbell';
  if (e.includes('cable')) return 'cable';
  if (e.includes('machine') || e.includes('smith') || e.includes('press')) return 'machine';
  if (e.includes('bar')) return 'barbell';
  return 'other';
}

/**
 * A first-session estimate of the one-rep max (total resistance), or null when
 * there is nothing to estimate from: no bodyweight in the profile, or an
 * exercise not logged by weight, or one mostly loaded by the body.
 */
export function startingEstimate(db: Db, exercise: Exercise): { oneRepMaxKg: number; basis: SuggestionBasis } | null {
  const profile = getProfile(db);
  if (!profile.bodyweightKg || exercise.trackingType !== 'weight_reps' || (exercise.bodyweight ?? 0) > 0.3) return null;
  const level = profile.liftingExperience === 'advanced' ? 'advanced' : profile.liftingExperience === 'intermediate' ? 'intermediate' : 'novice';
  const pattern = movementPattern(db, exercise.id);
  const oneRepMaxKg = startingOneRepMax(
    { bodyweightKg: profile.bodyweightKg, gender: profile.gender === 'female' ? 'female' : profile.gender === 'male' ? 'male' : null, level },
    { pattern, equipment: equipmentKind(exercise) },
  );
  return { oneRepMaxKg, basis: { kind: 'estimate', bodyweightKg: profile.bodyweightKg, level, pattern } };
}

export type Planned = { suggestions: Suggestion[]; oneRepMaxKg: number; basis: SuggestionBasis; offsetKg: number };

/**
 * Suggested weight and reps for an exercise's planned sets: from its logged
 * history, one rep of capacity up (or from `today`'s sets, at today's level,
 * mid-session); with neither, from a starting estimate, a rep further from
 * failure. Null with nothing to go on.
 */
export function suggestFor(
  db: Db,
  gymId: string | null,
  exercise: Exercise,
  history: LoggedSet[],
  plans: SetPlan[],
  today: LoggedSet[] = [],
): Planned | null {
  const offsetKg = resistanceOffsetKg(db, gymId, exercise);
  const loadable = gymId ? loadableWeights(db, gymId, exercise.id) : null;
  const from = today.length > 0 && bestSet(today, offsetKg) ? { sets: today, kind: 'today' as const } : { sets: history, kind: 'history' as const };
  const best = bestSet(from.sets, offsetKg);
  if (best) {
    const progress = from.kind === 'history';
    const suggestions = suggestSets(from.sets, plans, loadable, { offsetKg, progress })!;
    return { suggestions, oneRepMaxKg: targetOneRepMax(from.sets, offsetKg, progress), basis: { kind: from.kind, best }, offsetKg };
  }
  // Reps alone (a bodyweight movement logged without load): no estimate needed.
  const repsOnly = suggestSets(from.sets, plans, null, { progress: from.kind === 'history' });
  if (repsOnly) return { suggestions: repsOnly, oneRepMaxKg: 0, basis: { kind: from.kind, best: from.sets[0]! }, offsetKg: 0 };
  const estimate = startingEstimate(db, exercise);
  if (!estimate) return null;
  const careful = plans.map((p) => ({ ...p, rir: p.rir + STARTING_EXTRA_RIR }));
  return { suggestions: suggestFromOneRepMax(estimate.oneRepMaxKg, careful, loadable, offsetKg), oneRepMaxKg: estimate.oneRepMaxKg, basis: estimate.basis, offsetKg };
}
