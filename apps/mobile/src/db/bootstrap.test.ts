import { exercises, newId, personalRecords } from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// bootstrap.ts pulls in a live expo-sqlite connection (via ./client) and the
// real migrations artifact. Mock every collaborator so this test exercises
// only initializeDatabase's own control flow: backup -> migrate -> (restore +
// rethrow) | (discard + seed + rebuild personal records).
vi.mock('./client', () => ({ db: {} }));
vi.mock('./backup', () => ({
  backupDatabase: vi.fn(),
  restoreDatabase: vi.fn(async () => true),
  discardBackup: vi.fn(),
}));
vi.mock('@overload/schema/migrations', () => ({ default: {} }));
vi.mock('drizzle-orm/expo-sqlite/migrator', () => ({ migrate: vi.fn() }));
vi.mock('../data/seedRepo', () => ({ seedExercisesIfEmpty: vi.fn() }));
vi.mock('../data/sessionRepo', () => ({ rebuildAllPersonalRecords: vi.fn() }));

const { backupDatabase, discardBackup, restoreDatabase } = await import('./backup');
const { migrate } = await import('drizzle-orm/expo-sqlite/migrator');
const { seedExercisesIfEmpty } = await import('../data/seedRepo');
const { rebuildAllPersonalRecords } = await import('../data/sessionRepo');
const { initializeDatabase } = await import('./bootstrap');

// The real implementation, bypassing the mock above — used to test
// rebuildAllPersonalRecords's own behavior against a real database rather than
// initializeDatabase's control flow.
const {
  rebuildAllPersonalRecords: rebuildAllPersonalRecordsForReal,
  addExerciseToWorkout,
  startEmptyWorkout,
} = await vi.importActual<typeof import('../data/sessionRepo')>('../data/sessionRepo');

/** The global order this mock was invoked in, across every mock in the file. */
function callOrder(fn: unknown): number {
  const order = (fn as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
  if (order === undefined) throw new Error('mock was not called');
  return order;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('initializeDatabase', () => {
  it('restores and rethrows on migration failure, without discarding the backup or seeding', async () => {
    const error = new Error('bad migration');
    vi.mocked(migrate).mockRejectedValueOnce(error);
    vi.mocked(restoreDatabase).mockResolvedValueOnce(true);

    await expect(initializeDatabase()).rejects.toThrow('bad migration');

    expect(backupDatabase).toHaveBeenCalledTimes(1);
    expect(migrate).toHaveBeenCalledTimes(1);
    expect(restoreDatabase).toHaveBeenCalledTimes(1);
    expect(discardBackup).not.toHaveBeenCalled();
    expect(seedExercisesIfEmpty).not.toHaveBeenCalled();

    // Ordering: backup, then migrate, then restore.
    expect(callOrder(backupDatabase)).toBeLessThan(callOrder(migrate));
    expect(callOrder(migrate)).toBeLessThan(callOrder(restoreDatabase));
  });

  it('attaches whether a restore actually happened to the rethrown error', async () => {
    vi.mocked(migrate).mockRejectedValueOnce(new Error('bad migration'));
    vi.mocked(restoreDatabase).mockResolvedValueOnce(false); // e.g. first launch, no backup existed

    await expect(initializeDatabase()).rejects.toMatchObject({ restored: false });
  });

  it('discards the backup and seeds on success, without restoring', async () => {
    vi.mocked(migrate).mockResolvedValueOnce(undefined);

    await initializeDatabase();

    expect(backupDatabase).toHaveBeenCalledTimes(1);
    expect(migrate).toHaveBeenCalledTimes(1);
    expect(restoreDatabase).not.toHaveBeenCalled();
    expect(discardBackup).toHaveBeenCalledTimes(1);
    expect(seedExercisesIfEmpty).toHaveBeenCalledTimes(1);
    expect(rebuildAllPersonalRecords).toHaveBeenCalledTimes(1);

    // Ordering: backup, then migrate, then discard, then seed, then rebuild.
    expect(callOrder(backupDatabase)).toBeLessThan(callOrder(migrate));
    expect(callOrder(migrate)).toBeLessThan(callOrder(discardBackup));
    expect(callOrder(discardBackup)).toBeLessThan(callOrder(seedExercisesIfEmpty));
    expect(callOrder(seedExercisesIfEmpty)).toBeLessThan(callOrder(rebuildAllPersonalRecords));
  });
});

describe('rebuildAllPersonalRecords', () => {
  let db: ReturnType<typeof createTestDb>['db'];
  let close: () => void;
  let plankId: string;

  beforeEach(() => {
    ({ db, close } = createTestDb());

    const plank = {
      id: newId(),
      name: 'Plank',
      trackingType: 'duration' as const,
      primaryMuscle: 'core',
      secondaryMuscles: [],
      equipment: 'bodyweight',
    };
    db.insert(exercises).values(plank).run();
    plankId = plank.id;

    // rebuildAllPersonalRecords only rebuilds exercises a workout has touched;
    // give it one, with no completed sets, so plankId is in scope for the rebuild.
    const workoutId = startEmptyWorkout(db, 'Session', 1);
    addExerciseToWorkout(db, workoutId, plankId, 1);
  });

  afterEach(() => close());

  it('drops records that the current metric rules would not produce', () => {
    // A stale row of the kind the pre-gating code wrote for a duration exercise.
    db.insert(personalRecords).values({
      id: newId(), exerciseId: plankId, type: 'est_1rm',
      value: 21.53, setId: 'stale', achievedAt: 1,
    }).run();

    rebuildAllPersonalRecordsForReal(db);

    const remaining = db.select().from(personalRecords)
      .where(eq(personalRecords.exerciseId, plankId)).all();
    expect(remaining.find((r) => r.type === 'est_1rm')).toBeUndefined();
  });
});
