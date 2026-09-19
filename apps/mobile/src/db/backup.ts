import * as FileSystem from 'expo-file-system';
import { DB_NAME } from './client';

const DB_PATH = `${FileSystem.documentDirectory}SQLite/${DB_NAME}`;
const BACKUP_PATH = `${DB_PATH}.backup`;

async function exists(uri: string): Promise<boolean> {
  return (await FileSystem.getInfoAsync(uri)).exists;
}

/**
 * Copies the database file before migrations run. Safe because this happens at
 * startup, before the app has issued any write.
 */
export async function backupDatabase(): Promise<void> {
  if (!(await exists(DB_PATH))) return; // first launch — nothing to protect yet
  await FileSystem.copyAsync({ from: DB_PATH, to: BACKUP_PATH });
}

export async function restoreDatabase(): Promise<void> {
  if (!(await exists(BACKUP_PATH))) return;
  await FileSystem.copyAsync({ from: BACKUP_PATH, to: DB_PATH });
}

export async function discardBackup(): Promise<void> {
  if (!(await exists(BACKUP_PATH))) return;
  await FileSystem.deleteAsync(BACKUP_PATH, { idempotent: true });
}
