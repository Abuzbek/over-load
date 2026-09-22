export const DISTANCE_UNITS = ['km', 'mi'] as const;
export type DistanceUnit = (typeof DISTANCE_UNITS)[number];

const YD_PER_M = 1.09361;
const M_PER_MILE = 1609.344;
const MI_THRESHOLD_M = 0.1 * M_PER_MILE; // 160.9344

/** Storage is always metres. This is the only place that changes for display. */
export function formatDistance(metres: number | null, unit: DistanceUnit): string {
  if (metres === null) return '—';

  if (unit === 'km') {
    if (metres < 1000) return `${Math.round(metres)} m`;
    return `${Number((metres / 1000).toFixed(1))} km`;
  }

  if (metres < MI_THRESHOLD_M) return `${Math.round(metres * YD_PER_M)} yd`;
  return `${Number((metres / M_PER_MILE).toFixed(1))} mi`;
}
