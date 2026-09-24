import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { now } from '@overload/schema';
import { ensureDefaultGym } from '../data/gymRepo';
import { ensureDefaultProgram } from '../data/programRepo';
import { needsOnboarding } from '../data/onboardingRepo';
import { getOnboardedAt } from '../data/settingsRepo';
import { clearAccountData, localOwner, outboxSize } from '../data/syncRepo';
import { db } from '../db/client';
import { onAccountChanged, signOutOfAccount, type Account } from './auth';
import { firebaseEnabled } from './firebase';
import { accountOnboardedAt, firestoreRemote } from './firestoreRemote';
import { syncNow } from './syncEngine';

export type SyncStatus = {
  enabled: boolean;
  /** Firebase has said who is signed in (or that nobody is). Until then, don't show sign-in. */
  authResolved: boolean;
  /**
   * Whether the signed-in account still has onboarding to do, decided by
   * Firebase: its settings in Firestore say when it finished, and a new
   * sign-up has none. 'unknown' while that is being read.
   */
  onboarding: 'unknown' | 'needed' | 'done';
  account: Account | null;
  syncing: boolean;
  lastSyncedAt: number | null;
  error: string | null;
};

/** While the app is open, how often to sync without being asked. */
const INTERVAL_MS = 2 * 60 * 1000;

let status: SyncStatus = { enabled: firebaseEnabled, authResolved: false, onboarding: 'unknown', account: null, syncing: false, lastSyncedAt: null, error: null };
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
  if (started) return;
  started = true;
  // No Firebase in this build: the phone's own record decides.
  if (!firebaseEnabled) {
    update({ onboarding: needsOnboarding(db) ? 'needed' : 'done' });
    return;
  }

  onAccountChanged((account) => {
    // This phone holds another account's copy (a sign-out that never finished,
    // or someone else signing in): let it go before this account syncs.
    const owner = localOwner(db);
    if (account && owner && owner !== account.uid) resetLocalCopy();
    update({ account, authResolved: true, onboarding: 'unknown', lastSyncedAt: null, error: null });
    if (account) void checkOnboarding(account.uid);
    void requestSync();
  });

  AppState.addEventListener('change', (state) => {
    if (state === 'active') void requestSync();
  });
  setInterval(() => {
    if (AppState.currentState === 'active') void requestSync();
  }, INTERVAL_MS);
}

/**
 * Asks Firestore whether this account ever finished onboarding. A phone that
 * already knows (the flag is in its copy) does not wait on the network.
 */
async function checkOnboarding(uid: string): Promise<void> {
  let done = getOnboardedAt(db) !== null;
  if (!done) {
    try {
      done = (await accountOnboardedAt(uid)) !== null;
    } catch {
      // Signing in needs a connection, so a failure here is most likely an
      // unconfigured Firestore; onboarding is the safe side of that.
      done = false;
    }
  }
  if (status.account?.uid === uid) update({ onboarding: done ? 'done' : 'needed' });
}

/** Onboarding has finished on this phone: the flag is written, and syncs up with the rest. */
export function markOnboarded(): void {
  update({ onboarding: 'done' });
}

/** This phone back to a fresh install: no account data, just the defaults. */
function resetLocalCopy(): void {
  clearAccountData(db);
  ensureDefaultProgram(db, now());
  ensureDefaultGym(db, now());
}

/**
 * Signs out after a last sync. Changes the server never got would be lost with
 * the local copy, so without `force` it stops and reports how many there are.
 */
export async function signOut({ force = false } = {}): Promise<{ unsynced: number }> {
  await requestSync();
  const unsynced = outboxSize(db);
  if (unsynced > 0 && !force) return { unsynced };
  resetLocalCopy();
  await signOutOfAccount();
  return { unsynced: 0 };
}
