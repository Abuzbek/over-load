export const DEFAULT_REST_SECONDS = 120;

/**
 * Derived from wall-clock time rather than counted down by an interval.
 * setInterval stops when iOS suspends the app; a timestamp does not.
 */
export function restRemainingSeconds(startedAt: number, restSeconds: number, nowMs: number): number {
  const elapsedMs = nowMs - startedAt;
  const remainingMs = restSeconds * 1000 - elapsedMs;
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / 1000);
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
