import { useSyncExternalStore } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { AppState } from 'react-native';
import { now } from '@overload/schema';
import { ensureDefaultGym } from '../data/gymRepo';
import { ensureDefaultProgram } from '../data/programRepo';
import { needsOnboarding } from '../data/onboardingRepo';
import { getOnboardedAt } from '../data/settingsRepo';
import { clearAccountData, localOwner, outboxSize } from '../data/syncRepo';
import { db } from '../db/client';
import { accountStillExists, deleteSignedInUser, onAccountChanged, reauthenticate, signOutOfAccount, type Account } from './auth';
import { firebaseEnabled } from './firebase';
import { accountOnboardedAt, deleteAccountData, firestoreRemote } from './firestoreRemote';
import { syncNow, type RestoreProgress } from './syncEngine';

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
  /** Goes up each time a sync writes rows into this phone's database. */
  dataVersion: number;
  error: string | null;
  /**
   * The first sync after signing in on a phone with no copy of the account,
   * which the app waits for behind the restore screen. 'idle' otherwise.
   */
  restore: RestoreState;
};

export type RestoreState =
  | { state: 'idle' }
  | { state: 'restoring'; progress: RestoreProgress | null }
  | { state: 'failed'; error: string };

const IDLE: RestoreState = { state: 'idle' };


/** While the app is open, how often to sync without being asked. */
const INTERVAL_MS = 2 * 60 * 1000;
/** How long signing out waits for its last sync before counting what is left. */
const SIGN_OUT_SYNC_MS = 10_000;

let status: SyncStatus = { enabled: firebaseEnabled, authResolved: false, onboarding: 'unknown', account: null, syncing: false, lastSyncedAt: null, error: null, dataVersion: 0, restore: IDLE };
const listeners = new Set<() => void>();

function update(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribe, () => status);
}

/**
 * Re-renders the caller when a sync has written rows into the database, and
 * only then. Screens read the database while rendering and otherwise re-read
 * only on focus, so rows pulled while one is open (at sign-in, or from another
 * device) stayed invisible until the user navigated away and back.
 */
export function useSyncedData(): number {
  return useSyncExternalStore(subscribe, () => status.dataVersion);
}

/**
 * One sync, reporting through the status. Never throws: sync is background
 * work, and a phone in a gym basement is offline by design — the outbox keeps
 * everything for the next attempt.
 */
export async function requestSync(onProgress?: (progress: RestoreProgress) => void): Promise<void> {
  const account = status.account;
  if (!account || deleting) return;
  update({ syncing: true });
  const run = (async () => {
    try {
      const { pulled, adopted } = await syncNow(db, await firestoreRemote(account.uid), account.uid, Date.now(), onProgress);
      const changed = pulled > 0 || adopted;
      update({ syncing: false, lastSyncedAt: Date.now(), error: null, ...(changed ? { dataVersion: status.dataVersion + 1 } : {}) });
    } catch (error) {
      update({ syncing: false, error: error instanceof Error ? error.message : String(error) });
    }
  })();
  running = run;
  await run;
}

/** The sync in progress, if any: deleting the account waits for it, or it could write rows back. */
let running: Promise<void> | null = null;
/** While the account is being deleted, nothing syncs. */
let deleting = false;

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
    // No copy of this account here yet (a new phone, or after logging out):
    // the first sync brings all of it, so the app waits behind the restore screen.
    const fresh = account !== null && localOwner(db) !== account.uid;
    update({ account, authResolved: true, onboarding: 'unknown', lastSyncedAt: null, error: null, restore: IDLE });
    if (account) void confirmAccount(account.uid);
    void (fresh ? restoreAccount() : requestSync());
  });

  AppState.addEventListener('change', (state) => {
    if (state === 'active') void requestSync();
  });
  setInterval(() => {
    if (AppState.currentState === 'active') void requestSync();
  }, INTERVAL_MS);
}

/**
 * A restored session whose account was deleted on the server signs out, back
 * to the sign-in screen, and drops the local copy; otherwise it would look like
 * a new account and land in onboarding. Only then is onboarding checked.
 */
async function confirmAccount(uid: string): Promise<void> {
  if (!(await accountStillExists())) {
    if (status.account?.uid !== uid) return;
    // The account and its server copy are gone; so is this phone's copy of it.
    resetLocalCopy();
    await signOutOfAccount();
    return;
  }
  await checkOnboarding(uid);
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
  // A last sync, but not forever: offline, a Firestore commit waits for the
  // server indefinitely, and the button would spin with nothing happening.
  // Whatever did not make it stays in the outbox and is counted below.
  await Promise.race([requestSync(), new Promise((resolve) => setTimeout(resolve, SIGN_OUT_SYNC_MS))]);
  const unsynced = outboxSize(db);
  if (unsynced > 0 && !force) return { unsynced };
  resetLocalCopy();
  await signOutOfAccount();
  return { unsynced: 0 };
}

/**
 * Deletes the account for good: a fresh sign-in first (cancelled: nothing
 * happens), then everything under users/{uid} in Firestore, then the Firebase
 * user, then this phone's copy. If the server part fails it throws and the
 * phone keeps its copy, so trying again loses nothing.
 */
export async function deleteAccount(): Promise<{ cancelled: boolean }> {
  const account = status.account;
  if (!account) throw new Error('Not signed in');
  const { ok, appleAuthorizationCode } = await reauthenticate();
  if (!ok) return { cancelled: true };
  deleting = true;
  try {
    await running;
    await deleteAccountData(account.uid);
    await deleteSignedInUser(appleAuthorizationCode);
    resetLocalCopy();
    // Progress photos live only on the phone (rows sync, images do not), so
    // logging out keeps them for the next sign-in; deleting the account does not.
    await FileSystem.deleteAsync(`${FileSystem.documentDirectory}progress-photos/`, { idempotent: true });
  } finally {
    deleting = false;
  }
  return { cancelled: false };
}

/**
 * The first sync of an account on this phone, reported to the restore screen.
 * Runs again from "Try again"; a table that already arrived is not fetched twice.
 */
export async function restoreAccount(): Promise<void> {
  update({ restore: { state: 'restoring', progress: null } });
  await requestSync((progress) => {
    if (status.restore.state === 'restoring') update({ restore: { state: 'restoring', progress } });
  });
  // "Continue in the background" already let the user in: leave it that way.
  if (status.restore.state === 'idle') return;
  update({ restore: status.error ? { state: 'failed', error: status.error } : IDLE });
}

/** Into the app without waiting; sync carries on in the background as usual. */
export function skipRestore(): void {
  update({ restore: IDLE });
}
