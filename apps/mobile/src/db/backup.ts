// The path-based API moved here in SDK 54; the object API that replaced it
// buys nothing for copying three files.
import * as FileSystem from 'expo-file-system/legacy';
import { DB_NAME, expoDb } from './client';

const DB_PATH = `${FileSystem.documentDirectory}SQLite/${DB_NAME}`;
const BACKUP_PATH = `${DB_PATH}.backup`;

/** SQLite's WAL-mode sidecar files. A copy of the main file alone can miss
 * committed data that hasn't been checkpointed into it yet. */
const SIDECAR_SUFFIXES = ['-wal', '-shm'] as const;

async function exists(uri: string): Promise<boolean> {
  return (await FileSystem.getInfoAsync(uri)).exists;
}

async function copyIfExists(from: string, to: string): Promise<void> {
  if (!(await exists(from))) return;
  await FileSystem.copyAsync({ from, to });
}

async function deleteIfExists(uri: string): Promise<void> {
  if (!(await exists(uri))) return;
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

/**
 * Forces any committed-but-not-yet-checkpointed WAL frames onto the main
 * database file before it is copied. Per SQLite, wal_checkpoint is a no-op
 * when the connection isn't in WAL mode; the try/catch is defensive only, in
 * case a given platform/build rejects the pragma outright — in that case the
 * plain file copy below still runs, backing up whatever is safely on disk.
 */
function checkpointWal(): void {
  try {
    expoDb.execSync('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch {
    // Best-effort — see comment above.
  }
}

/**
 * Copies the database file, and its -wal/-shm sidecars when present, before
 * migrations run. A WAL checkpoint is forced first so the copied main file
 * reflects everything committed so far, not just what has already been
 * checkpointed.
 *
 * The connection stays open here, deliberately. Only the `.backup` paths are
 * written, and nothing holds those open; the live `workouts.db` is read, not
 * replaced. `initializeDatabase` runs `migrate()` on this same connection the
 * instant this resolves, so closing it would break every launch. Restoring is
 * the opposite case — see `restoreDatabase`.
 */
export async function backupDatabase(): Promise<void> {
  if (!(await exists(DB_PATH))) return; // first launch — nothing to protect yet

  checkpointWal();

  await FileSystem.copyAsync({ from: DB_PATH, to: BACKUP_PATH });
  for (const suffix of SIDECAR_SUFFIXES) {
    await copyIfExists(`${DB_PATH}${suffix}`, `${BACKUP_PATH}${suffix}`);
  }
}

/**
 * Restores the main file and its sidecars from backup. Returns whether a
 * backup actually existed (and was restored), so a caller can distinguish
 * "we recovered your data" from "there was nothing to recover."
 *
 * The open connection is closed first. This copy overwrites the very file the
 * connection is reading, and the native behaviour differs by platform: iOS
 * unlinks the destination before copying, leaving the handle attached to a
 * dead inode, while Android truncates and overwrites in place, leaving the
 * connection's page cache stale against different content. Either way the
 * handle is worthless afterwards, so it is closed rather than left to lie.
 * The caller surfaces a "please restart the app" message, so a closed
 * connection is the expected end state.
 */
export async function restoreDatabase(): Promise<boolean> {
  if (!(await exists(BACKUP_PATH))) return false;

  expoDb.closeSync();

  await FileSystem.copyAsync({ from: BACKUP_PATH, to: DB_PATH });
  for (const suffix of SIDECAR_SUFFIXES) {
    const backupSidecar = `${BACKUP_PATH}${suffix}`;
    const dbSidecar = `${DB_PATH}${suffix}`;
    if (await exists(backupSidecar)) {
      await FileSystem.copyAsync({ from: backupSidecar, to: dbSidecar });
    } else {
      // No sidecar was captured at backup time (WAL was already checkpointed
      // and empty). Remove any sidecar that has since appeared so we don't
      // leave a restored main file paired with a stale -wal/-shm.
      await deleteIfExists(dbSidecar);
    }
  }
  return true;
}

export async function discardBackup(): Promise<void> {
  await deleteIfExists(BACKUP_PATH);
  for (const suffix of SIDECAR_SUFFIXES) {
    await deleteIfExists(`${BACKUP_PATH}${suffix}`);
  }
}
