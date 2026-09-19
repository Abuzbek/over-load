/**
 * Epley estimate: 1RM = w * (1 + reps/30).
 * Accurate enough under ~10 reps, which covers almost all logged work.
 * Returns 0 for inputs that cannot describe a real lift.
 */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}
