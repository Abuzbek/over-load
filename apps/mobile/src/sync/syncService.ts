import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { forgetCursors } from '../data/syncRepo';
import { db } from '../db/client';
import { onAccountChanged, type Account } from './auth';
import { firebaseEnabled } from './firebase';
import { firestoreRemote } from './firestoreRemote';
import { syncNow } from './syncEngine';

export type SyncStatus = {
  enabled: boolean;
  account: Account | null;
  syncing: boolean;
  lastSyncedAt: number | null;
  error: string | null;
};

/** While the app is open, how often to sync without being asked. */
const INTERVAL_MS = 2 * 60 * 1000;

let status: SyncStatus = { enabled: firebaseEnabled, account: null, syncing: false, lastSyncedAt: null, error: null };
const listeners = new Set<() => void>();

function update(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => status,
  );
}

/**
 * One sync, reporting through the status. Never throws: sync is background
 * work, and a phone in a gym basement is offline by design — the outbox keeps
 * everything for the next attempt.
 */
export async function requestSync(): Promise<void> {
  const account = status.account;
  if (!account) return;
  update({ syncing: true });
  try {
    await syncNow(db, await firestoreRemote(account.uid), account.uid);
    update({ syncing: false, lastSyncedAt: Date.now(), error: null });
  } catch (error) {
    update({ syncing: false, error: error instanceof Error ? error.message : String(error) });
  }
}

let started = false;

/**
 * Starts syncing for whoever is signed in: at sign-in, whenever the app comes
 * to the foreground, and every couple of minutes while it is open. Called
 * once, after the database is ready. A no-op in a build without Firebase.
 */
export function startSync(): void {
  if (started || !firebaseEnabled) return;
  started = true;

  onAccountChanged((account) => {
    // Signed out, or a different person signed in: their cursors are not ours.
    if (account?.uid !== status.account?.uid) forgetCursors(db);
    update({ account, lastSyncedAt: null, error: null });
    void requestSync();
  });

  AppState.addEventListener('change', (state) => {
    if (state === 'active') void requestSync();
  });
  setInterval(() => {
    if (AppState.currentState === 'active') void requestSync();
  }, INTERVAL_MS);
}
