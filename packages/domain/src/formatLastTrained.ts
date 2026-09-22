const DAY_MS = 86_400_000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Calendar-day difference, not elapsed milliseconds: a workout at 23:00
 * yesterday is "Yesterday" at 01:00 today, even though only two hours passed.
 */
function calendarDaysBetween(earlier: number, later: number): number {
  const a = new Date(earlier);
  const b = new Date(later);
  const aMidnight = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bMidnight = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((bMidnight - aMidnight) / DAY_MS);
}

export function formatLastTrained(lastTrainedAt: number | null, now: number): string {
  if (lastTrainedAt === null) return 'Never';

  const days = calendarDaysBetween(lastTrainedAt, now);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return WEEKDAYS[new Date(lastTrainedAt).getDay()]!;

  const weeks = Math.floor(days / 7);
  if (weeks <= 8) return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;

  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}

/** Distinct, order-preserving, capped. Takes strings so domain stays dependency-free. */
export function summariseMuscles(primaryMuscles: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const muscle of primaryMuscles) {
    if (seen.has(muscle)) continue;
    seen.add(muscle);
    out.push(muscle);
    if (out.length === max) break;
  }
  return out;
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, '0');
  if (hours === 0) return `${minutes}:${ss}`;
  return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`;
}
