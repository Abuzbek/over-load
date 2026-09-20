import { beforeEach, describe, expect, it, vi } from 'vitest';

// bootstrap.ts pulls in a live expo-sqlite connection (via ./client) and the
// real migrations artifact. Mock every collaborator so this test exercises
// only initializeDatabase's own control flow: backup -> migrate -> (restore +
// rethrow) | (discard + seed).
vi.mock('./client', () => ({ db: {} }));
vi.mock('./backup', () => ({
  backupDatabase: vi.fn(),
  restoreDatabase: vi.fn(async () => true),
  discardBackup: vi.fn(),
}));
vi.mock('@overload/schema/migrations', () => ({ default: {} }));
vi.mock('drizzle-orm/expo-sqlite/migrator', () => ({ migrate: vi.fn() }));
vi.mock('../data/seedRepo', () => ({ seedExercisesIfEmpty: vi.fn() }));

const { backupDatabase, discardBackup, restoreDatabase } = await import('./backup');
const { migrate } = await import('drizzle-orm/expo-sqlite/migrator');
const { seedExercisesIfEmpty } = await import('../data/seedRepo');
const { initializeDatabase } = await import('./bootstrap');

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

    // Ordering: backup, then migrate, then discard, then seed.
    expect(callOrder(backupDatabase)).toBeLessThan(callOrder(migrate));
    expect(callOrder(migrate)).toBeLessThan(callOrder(discardBackup));
    expect(callOrder(discardBackup)).toBeLessThan(callOrder(seedExercisesIfEmpty));
  });
});
