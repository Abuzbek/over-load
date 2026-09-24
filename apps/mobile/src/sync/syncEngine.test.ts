import { exercises, gyms, programs, sessions, syncOutbox, type SyncedTable } from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { eq, isNull } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { EQUIPMENT_SEED, fixtureFile } from '../data/catalogueTestFixtures';
import { createCustomExercise, listExercises } from '../data/exerciseRepo';
import { ensureDefaultGym, listGyms, renameGym } from '../data/gymRepo';
import { ensureDefaultProgram } from '../data/programRepo';
import { syncCatalogue } from '../data/seedRepo';
import { addExerciseToSession, addSet, completeSet, finishSession, listAllPersonalRecords } from '../data/sessionRepo';
import { getWeightUnit, setWeightUnit } from '../data/settingsRepo';
import { applyRemote, clearAccountData, localOwner, outboxSize } from '../data/syncRepo';
import { startBareSession } from '../data/sessionTestFixtures';
import { createWorkout, listWorkouts } from '../data/workoutRepo';
import { syncNow, type Remote } from './syncEngine';

/**
 * Firestore as the engine sees it: documents per table, each stamped by the
 * server's clock on write. Rows go through a JSON round trip, as they would
 * over the wire.
 */
class FakeRemote implements Remote {
  clock = 1000;
  docs = new Map<SyncedTable, Map<string, { row: Record<string, unknown>; stamp: number }>>();
  onPush?: () => void;

  async push(changes: Parameters<Remote['push']>[0]) {
    this.onPush?.();
    const stamp = ++this.clock;
    for (const { table, row } of changes) {
      if (!this.docs.has(table)) this.docs.set(table, new Map());
      this.docs.get(table)!.set(row.id, { row: JSON.parse(JSON.stringify(row)), stamp });
    }
  }

  async pull(table: SyncedTable, since: number) {
    const docs = [...(this.docs.get(table)?.values() ?? [])].filter((d) => d.stamp >= since);
    return {
      rows: docs.map((d) => d.row) as Awaited<ReturnType<Remote['pull']>>['rows'],
      cursor: docs.reduce((max, d) => Math.max(max, d.stamp), since),
    };
  }

  async hasData() {
    return [...this.docs.values()].some((t) => t.size > 0);
  }

  count(table: SyncedTable) {
    return this.docs.get(table)?.size ?? 0;
  }
}

const open: (() => void)[] = [];
afterEach(() => open.splice(0).forEach((close) => close()));

/** A new install: migrated, catalogue seeded, first-launch defaults created. */
function device() {
  const { db, close } = createTestDb();
  open.push(close);
  syncCatalogue(db, fixtureFile(), EQUIPMENT_SEED, 1);
  ensureDefaultProgram(db, 1);
  ensureDefaultGym(db, 1);
  return db;
}

function logBench(db: ReturnType<typeof device>, at: number) {
  const sessionId = startBareSession(db, 'Push', at);
  const se = addExerciseToSession(db, sessionId, 'Bench press', at);
  completeSet(db, addSet(db, se.id, at).id, { weightKg: 100, reps: 5 }, at);
  finishSession(db, sessionId, at);
  return sessionId;
}

describe('the outbox', () => {
  it('queues every change to the user’s rows, and nothing from the catalogue', () => {
    const db = device();
    const queued = () => db.select().from(syncOutbox).all().map((r) => r.tableName);
    expect(queued()).not.toContain('exercises');

    createCustomExercise(db, { name: 'Mine', trackingType: 'reps', primaryMuscle: 'Quads', equipment: 'None' });
    expect(queued().filter((t) => t === 'exercises')).toHaveLength(1);
  });

  it('holds one entry per row however often it changes', () => {
    const db = device();
    const gym = listGyms(db)[0]!.gym;
    const before = outboxSize(db);
    renameGym(db, gym.id, 'A', 2);
    renameGym(db, gym.id, 'B', 3);
    expect(outboxSize(db)).toBe(before);
  });

  it('does not queue rows written by a pull', () => {
    const db = device();
    db.delete(syncOutbox).run();
    applyRemote(db, 'gyms', [{ ...listGyms(db)[0]!.gym, name: 'From server', updatedAt: 99 }]);
    expect(outboxSize(db)).toBe(0);
  });
});

describe('clearAccountData', () => {
  it('drops the account’s rows and keeps the catalogue, so the next account starts clean', async () => {
    const phone = device();
    const remote = new FakeRemote();
    createCustomExercise(phone, { name: 'Mine', trackingType: 'reps', primaryMuscle: 'Quads', equipment: 'None' });
    logBench(phone, 10);
    await syncNow(phone, remote, 'u1', 20);
    expect(localOwner(phone)).toBe('u1');
    const catalogue = listExercises(phone).length - 1;

    clearAccountData(phone);

    expect(localOwner(phone)).toBeNull();
    expect(phone.select().from(sessions).all()).toHaveLength(0);
    expect(listGyms(phone)).toHaveLength(0);
    expect(listAllPersonalRecords(phone)).toHaveLength(0);
    expect(listExercises(phone)).toHaveLength(catalogue);
    expect(outboxSize(phone)).toBe(0);
    // The account itself is untouched.
    expect(remote.count('sessions')).toBe(1);
  });
});

describe('syncNow', () => {
  it('pushes everything a device made, then has nothing left to send', async () => {
    const phone = device();
    const remote = new FakeRemote();
    logBench(phone, 10);

    const result = await syncNow(phone, remote, 'u1', 20);
    expect(result.pushed).toBeGreaterThan(0);
    expect(remote.count('sessions')).toBe(1);
    expect(remote.count('session_sets')).toBe(1);
    expect(outboxSize(phone)).toBe(0);
    expect((await syncNow(phone, remote, 'u1', 30)).pushed).toBe(0);
  });

  // The seeded catalogue has the same ids on every device, so history from
  // another phone points at exercises this one already has.
  it('brings a second device the whole account, without doubling the defaults', async () => {
    const phone = device();
    const remote = new FakeRemote();
    createWorkout(phone, 'Push day');
    logBench(phone, 10);
    setWeightUnit(phone, 'lb', 11);
    await syncNow(phone, remote, 'u1', 20);

    const tablet = device();
    const result = await syncNow(tablet, remote, 'u1', 30);

    expect(result.adopted).toBe(true);
    expect(listWorkouts(tablet).map((w) => w.name)).toEqual(['Push day']);
    expect(tablet.select().from(sessions).all()).toHaveLength(1);
    expect(tablet.select().from(gyms).where(isNull(gyms.deletedAt)).all()).toHaveLength(1);
    expect(tablet.select().from(programs).where(isNull(programs.deletedAt)).all()).toHaveLength(1);
    expect(getWeightUnit(tablet)).toBe('lb');
    // personal_records is rebuilt from the pulled sets, never synced.
    expect(listAllPersonalRecords(tablet).length).toBeGreaterThan(0);
    // The tablet's own defaults never reached the account.
    expect(remote.count('gyms')).toBe(1);
  });

  it('keeps a newer local edit over an older one from the server', async () => {
    const phone = device();
    const remote = new FakeRemote();
    await syncNow(phone, remote, 'u1', 20);
    const tablet = device();
    await syncNow(tablet, remote, 'u1', 30);

    const gymId = listGyms(phone)[0]!.gym.id;
    renameGym(phone, gymId, 'Old name', 40);
    renameGym(tablet, gymId, 'New name', 50);
    await syncNow(phone, remote, 'u1', 60);
    await syncNow(tablet, remote, 'u1', 70);
    await syncNow(phone, remote, 'u1', 80);

    expect(listGyms(phone)[0]!.gym.name).toBe('New name');
    expect(listGyms(tablet)[0]!.gym.name).toBe('New name');
  });

  it('keeps an edit made while a push is in flight for the next push', async () => {
    const phone = device();
    const remote = new FakeRemote();
    const gymId = listGyms(phone)[0]!.gym.id;
    remote.onPush = () => {
      remote.onPush = undefined;
      renameGym(phone, gymId, 'Edited mid-push', 25);
    };
    await syncNow(phone, remote, 'u1', 20);
    await syncNow(phone, remote, 'u1', 30);
    expect(remote.docs.get('gyms')!.get(gymId)!.row.name).toBe('Edited mid-push');
  });

  it('carries custom exercises, and only those', async () => {
    const phone = device();
    const remote = new FakeRemote();
    createCustomExercise(phone, { name: 'Zercher carry', trackingType: 'reps', primaryMuscle: 'Quads', equipment: 'None' });
    await syncNow(phone, remote, 'u1', 20);
    expect(remote.count('exercises')).toBe(1);

    const tablet = device();
    await syncNow(tablet, remote, 'u1', 30);
    expect(listExercises(tablet, { search: 'zercher' })).toHaveLength(1);
    expect(tablet.select().from(exercises).where(eq(exercises.isCustom, true)).all()[0]!.isCustom).toBe(true);
  });

  it('joins a sync already running instead of starting a second', async () => {
    const phone = device();
    const remote = new FakeRemote();
    const [a, b] = await Promise.all([syncNow(phone, remote, 'u1', 20), syncNow(phone, remote, 'u1', 20)]);
    expect(a).toBe(b);
  });
});
