/**
 * A first session's load, for an exercise with no history: an estimated
 * one-rep max from bodyweight, sex, experience, the movement and the
 * equipment. A rough start, deliberately on the light side — after one logged
 * session smart progression works from what was actually lifted.
 */

export type StartingProfile = {
  bodyweightKg: number;
  gender: 'male' | 'female' | null;
  level: 'novice' | 'intermediate' | 'advanced';
};

export type StartingExercise = {
  /** The catalogue's movement pattern ("Squat", "Horizontal Push", "Biceps Accessory"…). */
  pattern: string | null;
  /** Loaded with a barbell, a dumbbell (per hand), a machine or cable, or something else. */
  equipment: 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'other';
};

/**
 * An intermediate man's one-rep max as a share of his bodyweight, with a
 * barbell (or its machine equivalent), by movement pattern. Round figures from
 * common strength standards; a starting guess, not a test.
 */
const RATIO: Record<string, number> = {
  Squat: 1.25,
  'Hip Hinge': 1.4,
  'Lunge/Split Squat/Step Up/Single Leg Squat': 0.7,
  'Horizontal Push': 1.0,
  'Vertical Push': 0.65,
  'Horizontal Pull': 0.9,
  'Vertical Pull': 0.85,
  'Lat Accessory': 0.45,
  'Glute Max Accessory': 1.3,
  'Quad Accessory': 0.7,
  'Hamstring Accessory': 0.55,
  'Chest Accessory': 0.45,
  'Biceps Accessory': 0.4,
  'Triceps Accessory': 0.4,
  'Lateral Delt Accessory': 0.18,
  'Rear Delt Accessory': 0.18,
  'Front Delt Accessory': 0.2,
  'Upper Back Accessory': 0.5,
  'Upper Trap Accessory': 1.0,
  'Calf Accessory': 1.0,
  'Hip Adductor Accessory': 0.7,
  'Hip Abductor Accessory': 0.7,
  'Ab Accessory': 0.35,
};
const DEFAULT_RATIO = 0.4;
const LEVEL = { novice: 0.6, intermediate: 1, advanced: 1.35 };
/** A woman's figure relative to a man's, lower body and upper body. */
const FEMALE = { lower: 0.7, upper: 0.55 };
const LOWER = new Set([
  'Squat', 'Hip Hinge', 'Lunge/Split Squat/Step Up/Single Leg Squat', 'Glute Max Accessory', 'Quad Accessory',
  'Hamstring Accessory', 'Calf Accessory', 'Hip Adductor Accessory', 'Hip Abductor Accessory',
]);
/** One dumbbell against the barbell figure; a machine or cable against it. */
const EQUIPMENT = { barbell: 1, dumbbell: 0.4, machine: 0.9, cable: 0.7, other: 0.8 };

export function startingOneRepMax(profile: StartingProfile, exercise: StartingExercise): number {
  const pattern = exercise.pattern ?? '';
  const sex = profile.gender === 'female' ? (LOWER.has(pattern) ? FEMALE.lower : FEMALE.upper) : 1;
  return profile.bodyweightKg * (RATIO[pattern] ?? DEFAULT_RATIO) * LEVEL[profile.level] * sex * EQUIPMENT[exercise.equipment];
}

/** A first session stops this much further from failure than planned: better light than wrong. */
export const STARTING_EXTRA_RIR = 1;
