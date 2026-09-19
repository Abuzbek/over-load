import { beforeEach, describe, expect, it, vi } from 'vitest';

const DOCUMENT_DIR = 'file:///doc/';
const DB_PATH = `${DOCUMENT_DIR}SQLite/workouts.db`;
const BACKUP_PATH = `${DB_PATH}.backup`;

vi.mock('expo-file-system', () => ({
  documentDirectory: DOCUMENT_DIR,
  getInfoAsync: vi.fn(),
  copyAsync: vi.fn(),
  deleteAsync: vi.fn(),
}));
vi.mock('./client', () => ({
  DB_NAME: 'workouts.db',
  expoDb: { execSync: vi.fn() },
}));

const FileSystem = await import('expo-file-system');
const { expoDb } = await import('./client');
const { backupDatabase, restoreDatabase, discardBackup } = await import('./backup');

/** Configures getInfoAsync to report `exists: true` only for the given URIs. */
function setExisting(...uris: string[]): void {
  const set = new Set(uris);
  vi.mocked(FileSystem.getInfoAsync).mockImplementation(
    (uri: string) => Promise.resolve({ exists: set.has(uri) }) as ReturnType<typeof FileSystem.getInfoAsync>,
  );
}

function callOrder(fn: unknown): number {
  const order = (fn as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
  if (order === undefined) throw new Error('mock was not called');
  return order;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('backupDatabase', () => {
  it('does nothing when there is no database file yet', async () => {
    setExisting();

    await backupDatabase();

    expect(expoDb.execSync).not.toHaveBeenCalled();
    expect(FileSystem.copyAsync).not.toHaveBeenCalled();
  });

  it('checkpoints WAL before copying the main file, and copies sidecars that exist', async () => {
    setExisting(DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`);

    await backupDatabase();

    expect(expoDb.execSync).toHaveBeenCalledWith('PRAGMA wal_checkpoint(TRUNCATE);');
    expect(FileSystem.copyAsync).toHaveBeenCalledWith({ from: DB_PATH, to: BACKUP_PATH });
    expect(FileSystem.copyAsync).toHaveBeenCalledWith({
      from: `${DB_PATH}-wal`,
      to: `${BACKUP_PATH}-wal`,
    });
    expect(FileSystem.copyAsync).toHaveBeenCalledWith({
      from: `${DB_PATH}-shm`,
      to: `${BACKUP_PATH}-shm`,
    });
    expect(callOrder(expoDb.execSync)).toBeLessThan(callOrder(FileSystem.copyAsync));
  });

  it('skips sidecars that do not exist', async () => {
    setExisting(DB_PATH); // no -wal/-shm

    await backupDatabase();

    expect(FileSystem.copyAsync).toHaveBeenCalledTimes(1); // main file only
  });

  it('backs up safely even if the checkpoint pragma throws', async () => {
    setExisting(DB_PATH);
    vi.mocked(expoDb.execSync).mockImplementation(() => {
      throw new Error('not supported');
    });

    await expect(backupDatabase()).resolves.toBeUndefined();
    expect(FileSystem.copyAsync).toHaveBeenCalledWith({ from: DB_PATH, to: BACKUP_PATH });
  });
});

describe('restoreDatabase', () => {
  it('returns false and copies nothing when there is no backup', async () => {
    setExisting();

    await expect(restoreDatabase()).resolves.toBe(false);
    expect(FileSystem.copyAsync).not.toHaveBeenCalled();
  });

  it('restores the main file and any backed-up sidecars, and returns true', async () => {
    setExisting(BACKUP_PATH, `${BACKUP_PATH}-wal`, `${BACKUP_PATH}-shm`);

    await expect(restoreDatabase()).resolves.toBe(true);
    expect(FileSystem.copyAsync).toHaveBeenCalledWith({ from: BACKUP_PATH, to: DB_PATH });
    expect(FileSystem.copyAsync).toHaveBeenCalledWith({
      from: `${BACKUP_PATH}-wal`,
      to: `${DB_PATH}-wal`,
    });
    expect(FileSystem.copyAsync).toHaveBeenCalledWith({
      from: `${BACKUP_PATH}-shm`,
      to: `${DB_PATH}-shm`,
    });
  });

  it('deletes a stale db-side sidecar when the backup has none', async () => {
    setExisting(BACKUP_PATH, `${DB_PATH}-wal`); // main backup exists; only a live -wal, no backed-up sidecars

    await restoreDatabase();

    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(`${DB_PATH}-wal`, { idempotent: true });
    expect(FileSystem.copyAsync).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: `${DB_PATH}-wal` }),
    );
  });
});

describe('discardBackup', () => {
  it('deletes the backup file and any sidecars that exist', async () => {
    setExisting(BACKUP_PATH, `${BACKUP_PATH}-wal`);

    await discardBackup();

    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(BACKUP_PATH, { idempotent: true });
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(`${BACKUP_PATH}-wal`, { idempotent: true });
    expect(FileSystem.deleteAsync).not.toHaveBeenCalledWith(`${BACKUP_PATH}-shm`, { idempotent: true });
  });
});
