import { addWeeks, estimateOneRepMax, startOfDay, startOfWeek, type WeighInPoint } from '@overload/domain';
import { exercises, sessionExercises, sessionSets, sessions, weighIns, type Db, type WeighIn } from '@overload/schema';
import { and, asc, desc, eq, gte, isNotNull, isNull, lte, ne } from 'drizzle-orm';
import { getProfile } from './settingsRepo';

/**
 * The dashboard's reads: weigh-ins, training days, weekly work and per-exercise
 * stats. Working sets only — warm-ups and drop/myo rounds are left out, as in
 * historyRepo — and every joined level filters its tombstone.
 */

export function deleteWeighIn(db: Db, id: string, at: number): void {
  db.update(weighIns).set({ deletedAt: at, updatedAt: at }).where(eq(weighIns.id, id)).run();
}

export function listWeighIns(db: Db, sinceMs = 0): WeighIn[] {
  return db
    .select()
    .from(weighIns)
    .where(and(gte(weighIns.measuredAt, sinceMs), isNull(weighIns.deletedAt)))
    .orderBy(asc(weighIns.measuredAt))
    .all();
}

export const toPoints = (rows: WeighIn[]): WeighInPoint[] => rows.map((r) => ({ at: r.measuredAt, kg: r.weightKg }));

/** Start times of finished sessions in the range: the habits calendar and the streak read them. */
export function workoutTimes(db: Db, sinceMs: number, untilMs: number): number[] {
  return db
    .select({ at: sessions.startedAt })
    .from(sessions)
    .where(and(gte(sessions.startedAt, sinceMs), lte(sessions.startedAt, untilMs), isNotNull(sessions.endedAt), isNull(sessions.deletedAt)))
    .all()
    .map((r) => r.at);
}

type WorkingSet = {
  sessionId: string;
  startedAt: number;
  exerciseId: string;
  name: string;
  weightKg: number | null;
  reps: number | null;
  bodyweightShare: number | null;
};

function workingSets(db: Db, sinceMs: number, untilMs: number, exerciseId?: string): WorkingSet[] {
  return db
    .select({
      sessionId: sessions.id,
      startedAt: sessions.startedAt,
      exerciseId: exercises.id,
      name: exercises.name,
      weightKg: sessionSets.weightKg,
      reps: sessionSets.reps,
      bodyweightShare: exercises.bodyweight,
    })
    .from(sessionSets)
    .innerJoin(sessionExercises, eq(sessionExercises.id, sessionSets.sessionExerciseId))
    .innerJoin(sessions, eq(sessions.id, sessionExercises.sessionId))
    .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .where(
      and(
        gte(sessions.startedAt, sinceMs),
        lte(sessions.startedAt, untilMs),
        exerciseId ? eq(exercises.id, exerciseId) : undefined,
        isNotNull(sessionSets.completedAt),
        ne(sessionSets.setType, 'warmup'),
        isNull(sessionSets.parentSetId),
        isNull(sessionSets.deletedAt),
        isNull(sessionExercises.deletedAt),
        isNull(sessions.deletedAt),
        isNull(exercises.deletedAt),
      ),
    )
    .orderBy(asc(sessions.startedAt))
    .all();
}

export type WeekWork = { weekStart: number; sets: number; loadKg: number; bodyweightKg: number };

/**
 * Sets and volume per week, oldest first, every week in the range present.
 * Volume splits into what was loaded (weight × reps) and the share of
 * bodyweight the movement lifts (the catalogue's fraction × the profile's
 * bodyweight × reps), so a pull-up day is not a zero.
 */
export function weeklyWork(db: Db, weeks: number, now: number): WeekWork[] {
  const first = addWeeks(startOfWeek(now), -(weeks - 1));
  const out = Array.from({ length: weeks }, (_, i) => ({ weekStart: addWeeks(first, i), sets: 0, loadKg: 0, bodyweightKg: 0 }));
  const index = new Map(out.map((w, i) => [w.weekStart, i]));
  const bodyweight = getProfile(db).bodyweightKg ?? 0;
  for (const s of workingSets(db, first, now)) {
    const w = out[index.get(startOfWeek(s.startedAt))!];
    if (!w) continue;
    w.sets++;
    const reps = s.reps ?? 0;
    w.loadKg += (s.weightKg ?? 0) * reps;
    w.bodyweightKg += bodyweight * (s.bodyweightShare ?? 0) * reps;
  }
  return out;
}

export type TopExercise = { exerciseId: string; name: string; sets: number; volumeKg: number };

/** The exercises trained most since `sinceMs`, by sets or by loaded volume. */
export function topExercises(db: Db, sinceMs: number, now: number, by: 'sets' | 'volume', limit = 5): TopExercise[] {
  const byId = new Map<string, TopExercise>();
  for (const s of workingSets(db, sinceMs, now)) {
    const e = byId.get(s.exerciseId) ?? { exerciseId: s.exerciseId, name: s.name, sets: 0, volumeKg: 0 };
    e.sets++;
    e.volumeKg += (s.weightKg ?? 0) * (s.reps ?? 0);
    byId.set(s.exerciseId, e);
  }
  return [...byId.values()].sort((a, b) => (by === 'sets' ? b.sets - a.sets : b.volumeKg - a.volumeKg)).slice(0, limit);
}

export type SessionPoint = { at: number; oneRepMaxKg: number; volumeKg: number; heaviestKg: number };

/** One point per session an exercise was trained in, oldest first: its best estimated one-rep max, volume and heaviest set. */
function sessionSeries(sets: WorkingSet[]): SessionPoint[] {
  const bySession = new Map<string, SessionPoint>();
  for (const s of sets) {
    const p = bySession.get(s.sessionId) ?? { at: s.startedAt, oneRepMaxKg: 0, volumeKg: 0, heaviestKg: 0 };
    const w = s.weightKg ?? 0;
    const r = s.reps ?? 0;
    p.oneRepMaxKg = Math.max(p.oneRepMaxKg, estimateOneRepMax(w, r));
    p.volumeKg += w * r;
    p.heaviestKg = Math.max(p.heaviestKg, w);
    bySession.set(s.sessionId, p);
  }
  return [...bySession.values()].sort((a, b) => a.at - b.at);
}

export type ExerciseTile = { exerciseId: string; name: string; lastAt: number; series: SessionPoint[] };

/** The exercises trained most recently, each with its last few sessions — the dashboard's tiles. Loaded exercises only. */
export function exerciseTiles(db: Db, now: number, limit = 8, points = 8): ExerciseTile[] {
  const sets = workingSets(db, 0, now).filter((s) => (s.weightKg ?? 0) > 0 && (s.reps ?? 0) > 0);
  const byExercise = new Map<string, WorkingSet[]>();
  for (const s of sets) byExercise.set(s.exerciseId, [...(byExercise.get(s.exerciseId) ?? []), s]);
  return [...byExercise.entries()]
    .map(([exerciseId, list]) => {
      const series = sessionSeries(list);
      return { exerciseId, name: list[0]!.name, lastAt: series.at(-1)!.at, series: series.slice(-points) };
    })
    .sort((a, b) => b.lastAt - a.lastAt)
    .slice(0, limit);
}

export type ExerciseStats = {
  name: string;
  series: SessionPoint[];
  bestOneRepMaxKg: number;
  totalVolumeKg: number;
  bestSetVolumeKg: number;
  heaviestKg: number;
  totalReps: number;
  bestSetReps: number;
  totalSets: number;
};

/** Everything the exercise's stats page shows, over sessions since `sinceMs`. Null if the exercise does not exist. */
export function exerciseStats(db: Db, exerciseId: string, sinceMs: number, now: number): ExerciseStats | null {
  const exercise = db.select({ name: exercises.name }).from(exercises).where(and(eq(exercises.id, exerciseId), isNull(exercises.deletedAt))).get();
  if (!exercise) return null;
  const sets = workingSets(db, sinceMs, now, exerciseId).filter((s) => (s.reps ?? 0) > 0);
  const series = sessionSeries(sets);
  const volume = (s: WorkingSet) => (s.weightKg ?? 0) * (s.reps ?? 0);
  return {
    name: exercise.name,
    series,
    bestOneRepMaxKg: Math.max(0, ...series.map((p) => p.oneRepMaxKg)),
    totalVolumeKg: sets.reduce((a, s) => a + volume(s), 0),
    bestSetVolumeKg: Math.max(0, ...sets.map(volume)),
    heaviestKg: Math.max(0, ...sets.map((s) => s.weightKg ?? 0)),
    totalReps: sets.reduce((a, s) => a + (s.reps ?? 0), 0),
    bestSetReps: Math.max(0, ...sets.map((s) => s.reps ?? 0)),
    totalSets: sets.length,
  };
}

/** Days a weigh-in was logged in the range, as local midnights: the habits calendar's dots. */
export function weighInDays(db: Db, sinceMs: number, untilMs: number): Set<number> {
  return new Set(
    db
      .select({ at: weighIns.measuredAt })
      .from(weighIns)
      .where(and(gte(weighIns.measuredAt, sinceMs), lte(weighIns.measuredAt, untilMs), isNull(weighIns.deletedAt)))
      .all()
      .map((r) => startOfDay(r.at)),
  );
}

/** Working sets per day in the range, keyed by local midnight: the habits heatmap's shading. */
export function dailySets(db: Db, sinceMs: number, untilMs: number): Map<number, number> {
  const out = new Map<number, number>();
  for (const s of workingSets(db, sinceMs, untilMs)) {
    const day = startOfDay(s.startedAt);
    out.set(day, (out.get(day) ?? 0) + 1);
  }
  return out;
}
