import { startOfWeek } from '@overload/domain';
import { exercises, newId, type Exercise } from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startOfDay as dayOf } from '@overload/domain';
import { saveWeighIn } from './bodyRepo';
import { dailySets, exerciseStats, exerciseTiles, listWeighIns, topExercises, weeklyWork, workoutTimes } from './insightsRepo';
import { addExerciseToSession, addSet, completeSet, finishSession } from './sessionRepo';
import { startBareSession } from './sessionTestFixtures';
import { getProfile } from './settingsRepo';

const NOW = new Date(2026, 8, 24, 18).getTime(); // a Thursday
const WEEK = 7 * 86_400_000;

let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;

beforeEach(() => ({ db, close } = createTestDb()));
afterEach(() => close());

function exercise(name: string, bodyweight: number | null = null): Exercise {
  const row = { id: newId(), name, trackingType: 'weight_reps' as const, primaryMuscle: 'chest', equipment: 'barbell', bodyweight };
  db.insert(exercises).values(row).run();
  return row as unknown as Exercise;
}

function train(at: number, ex: Exercise, sets: [number, number][]) {
  const sessionId = startBareSession(db, 'W', at);
  const se = addExerciseToSession(db, sessionId, ex.id, at);
  for (const [weightKg, reps] of sets) completeSet(db, addSet(db, se.id, at).id, { weightKg, reps }, at);
  finishSession(db, sessionId, at + 1);
}

describe('weigh-ins', () => {
  it('logs them in order, and the newest becomes the profile bodyweight', () => {
    saveWeighIn(db, dayOf(NOW - 86_400_000), 81, null, NOW);
    saveWeighIn(db, dayOf(NOW), 80, null, NOW);
    saveWeighIn(db, dayOf(NOW - 2 * 86_400_000), 82, null, NOW); // back-filled: not the newest
    expect(listWeighIns(db).map((w) => w.weightKg)).toEqual([82, 81, 80]);
    expect(getProfile(db).bodyweightKg).toBe(80);
  });
});

describe('weekly work and exercise stats', () => {
  it('buckets sets and volume by week, counting the bodyweight share apart', () => {
    saveWeighIn(db, dayOf(NOW - 3 * WEEK), 80, null, NOW);
    const bench = exercise('Bench', null);
    const dip = exercise('Weighted dip', 0.9);
    train(NOW - WEEK, bench, [[100, 5], [100, 5]]);
    train(NOW, dip, [[10, 8]]);

    const weeks = weeklyWork(db, 3, NOW);
    expect(weeks.map((w) => w.weekStart)).toEqual([startOfWeek(NOW - 2 * WEEK), startOfWeek(NOW - WEEK), startOfWeek(NOW)]);
    expect(weeks.map((w) => w.sets)).toEqual([0, 2, 1]);
    expect(weeks[1]!.loadKg).toBe(1000);
    expect(weeks[2]!.loadKg).toBe(80);
    expect(weeks[2]!.bodyweightKg).toBeCloseTo(80 * 0.9 * 8);

    expect(topExercises(db, 0, NOW, 'sets').map((e) => e.name)).toEqual(['Bench', 'Weighted dip']);
    expect(workoutTimes(db, 0, NOW)).toHaveLength(2);
    expect([...dailySets(db, 0, NOW).values()]).toEqual([2, 1]);
  });

  it("gives an exercise's tiles and stats from its sessions", () => {
    const bench = exercise('Bench');
    train(NOW - WEEK, bench, [[100, 5], [90, 8]]);
    train(NOW, bench, [[102.5, 5]]);

    const [tile] = exerciseTiles(db, NOW);
    expect(tile!.series.map((p) => p.heaviestKg)).toEqual([100, 102.5]);

    const stats = exerciseStats(db, bench.id, 0, NOW)!;
    expect(stats).toMatchObject({ totalSets: 3, totalReps: 18, heaviestKg: 102.5, bestSetReps: 8, bestSetVolumeKg: 720, totalVolumeKg: 500 + 720 + 512.5 });
    expect(stats.bestOneRepMaxKg).toBeCloseTo(102.5 * (1 + 5 / 30));
    expect(exerciseStats(db, bench.id, NOW - 1000, NOW)!.totalSets).toBe(1);
  });
});
