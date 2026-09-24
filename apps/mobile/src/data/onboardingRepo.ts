import { generatePlan, type Plan, type PlanCandidate } from '@overload/domain';
import { exerciseLinks, gyms, lookups, programDays, programs, type Db, type TrainingPreferences } from '@overload/schema';
import { and, eq, isNotNull, isNull, ne, notInArray } from 'drizzle-orm';
import equipmentSeed from '../../../../tools/seed-equipment/equipment.json';
import { listExercises } from './exerciseRepo';
import { activateGym, createGymFromPreset, removeGym } from './gymRepo';
import { activateProgram, createProgram, setProgramDay } from './programRepo';
import { getOnboardedAt, getProfile, setOnboarded } from './settingsRepo';
import { hasOwnData } from './syncRepo';
import { addExerciseToWorkout, addWorkoutSet, createWorkout } from './workoutRepo';

export type GymPreset = { key: string; name: string; items: string[] };
export const GYM_PRESETS = equipmentSeed.presets as GymPreset[];

/**
 * For a build without Firebase, where the phone is the whole account: never
 * onboarded and nothing of its own yet. With Firebase, the account's settings
 * in Firestore decide instead (syncService.checkOnboarding).
 */
export function needsOnboarding(db: Db): boolean {
  return getOnboardedAt(db) === null && !hasOwnData(db);
}

/**
 * Creates the gym onboarding asks about and makes it the active one. On a new
 * account it replaces every other gym — the untouched default every install
 * creates, and the pick before this one if the user went back. An account that
 * already trains keeps its gyms; only `replacing`, the earlier pick, goes.
 */
export function setUpGym(db: Db, presetKey: string, name: string, icon: string, at: number, replacing?: string | null): string {
  const preset = GYM_PRESETS.find((p) => p.key === presetKey) ?? GYM_PRESETS[0]!;
  const gym = createGymFromPreset(db, name, icon, preset.items, at);
  activateGym(db, gym.id, at);
  const others = hasOwnData(db)
    ? replacing ? [{ id: replacing }] : []
    : db.select({ id: gyms.id }).from(gyms).where(and(isNull(gyms.deletedAt), ne(gyms.id, gym.id))).all();
  for (const old of others) removeGym(db, old.id, at);
  return gym.id;
}

/**
 * "Can you do…" questions. An unticked one rules out the exercises it names —
 * a novice gets a lat pulldown rather than a pull-up they cannot yet do.
 */
export const SKILLS: { key: string; label: string; excludes: RegExp; unless?: RegExp }[] = [
  { key: 'pullups5', label: 'Can you do at least 5 strict, unassisted pull-ups or chin-ups?', excludes: /pull-up|chin-up/i, unless: /assist|band/i },
  { key: 'pullups10', label: 'Can you do at least 10 strict, unassisted pull-ups or chin-ups?', excludes: /weighted.*(pull|chin)-up/i },
  { key: 'dips10', label: 'Can you do at least 10 bodyweight dips?', excludes: /\bdips?\b/i, unless: /assist|machine|bench/i },
  { key: 'pushups15', label: 'Can you do at least 15 strict push-ups?', excludes: /push-up/i, unless: /incline|knee/i },
  { key: 'bench10', label: 'Can you bench press a barbell for at least 10 reps?', excludes: /barbell.*bench press/i, unless: /incline|decline/i },
  { key: 'incline10', label: 'Can you incline press a barbell for at least 10 reps?', excludes: /incline barbell|barbell incline/i },
  { key: 'ohp10', label: 'Can you overhead press a barbell for at least 10 reps?', excludes: /barbell.*(overhead|shoulder) press/i },
];

/**
 * What the generator may choose from: seeded exercises the gym can host, that
 * track weight or reps (the session screen logs those), minus what the skill
 * answers rule out.
 */
export function planCandidates(db: Db, gymId: string, skills: string[]): PlanCandidate[] {
  const compoundId = db
    .select({ id: lookups.id })
    .from(lookups)
    .where(and(eq(lookups.type, 'exerciseType'), eq(lookups.name, 'Multi-joint (compound)')))
    .get()?.id;
  const ruledOut = SKILLS.filter((s) => !skills.includes(s.key));
  // One side at a time: those sets take twice as long, which the time budget needs.
  const unilateral = new Set(
    db
      .select({ id: exerciseLinks.exerciseId })
      .from(exerciseLinks)
      .innerJoin(lookups, eq(lookups.id, exerciseLinks.lookupId))
      .where(and(eq(exerciseLinks.role, 'laterality'), eq(lookups.name, 'Unilateral')))
      .all()
      .map((r) => r.id),
  );

  return listExercises(db, { gymId })
    .filter((e) => !e.isCustom && (e.trackingType === 'weight_reps' || e.trackingType === 'reps') && e.primaryMuscles)
    .filter((e) => !ruledOut.some((s) => s.excludes.test(e.name) && !s.unless?.test(e.name)))
    .map((e) => ({
      id: e.id,
      name: e.name,
      primaryMuscles: e.primaryMuscles!.split(', '),
      compound: e.exerciseTypeId === compoundId,
      strength: e.recommendationStrength,
      hypertrophy: e.recommendationHypertrophy,
      stability: e.stability,
      rom: e.rom,
      unilateral: unilateral.has(e.id),
      repsOnly: e.trackingType === 'reps',
    }));
}

export function planProgram(db: Db, gymId: string, prefs: TrainingPreferences): Plan {
  const level = getProfile(db).liftingExperience;
  const muscleName = new Map(
    db.select({ id: lookups.id, name: lookups.name }).from(lookups).where(eq(lookups.type, 'featureMuscleGroup')).all().map((m) => [m.id, m.name]),
  );
  const byName = (ids: string[]) => ids.map((id) => muscleName.get(id)).filter((n): n is string => !!n);
  return generatePlan({
    goal: prefs.goal,
    split: prefs.split,
    daysPerWeek: prefs.daysPerWeek,
    sessionMinutes: prefs.sessionMinutes,
    focus: Object.fromEntries(Object.entries(prefs.focus).flatMap(([id, points]) => byName([id]).map((n) => [n, points]))),
    deprioritized: byName(prefs.deprioritized),
    level: level === null || level === 'beginner' ? 'novice' : level,
    candidates: planCandidates(db, gymId, prefs.skills),
  });
}

/**
 * Writes a plan as a program and makes it the active one, retiring any
 * program with no workout in it (the empty default every install creates).
 */
export function createProgramFromPlan(
  db: Db,
  plan: Plan,
  display: { name: string; icon: string; color: string },
  at: number,
): string {
  const workoutIds = plan.workouts.map((w) => {
    const workout = createWorkout(db, w.name);
    for (const e of w.exercises) {
      const we = addExerciseToWorkout(db, workout.id, e.exerciseId, e.restSeconds);
      for (const set of e.sets) {
        addWorkoutSet(db, we.id, { targetReps: set.repsMin, targetRepsMax: set.repsMax, targetRir: set.rir });
      }
    }
    return workout.id;
  });

  const program = createProgram(db, { name: display.name, icon: display.icon, iconColor: display.color }, at);
  plan.days.forEach((w, day) => setProgramDay(db, program.id, day, w === null ? null : workoutIds[w]!, at));

  const withWorkouts = db
    .selectDistinct({ id: programDays.programId })
    .from(programDays)
    .where(and(isNotNull(programDays.workoutId), isNull(programDays.deletedAt)));
  db.update(programs)
    .set({ deletedAt: at, updatedAt: at })
    .where(and(isNull(programs.deletedAt), ne(programs.id, program.id), notInArray(programs.id, withWorkouts)))
    .run();
  activateProgram(db, program.id, at);
  return program.id;
}

export function completeOnboarding(db: Db, prefs: TrainingPreferences, at: number): void {
  setOnboarded(db, prefs, at);
}
