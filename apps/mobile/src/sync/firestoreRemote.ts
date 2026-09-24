import type { SyncedTable } from '@overload/schema';
import { SETTINGS_ID } from '../data/settingsRepo';
import type { OutgoingChange, SyncRow } from '../data/syncRepo';
import { firestoreReady } from './firebase';
import type { Remote } from './syncEngine';

const PAGE = 500;

/**
 * Pulls re-read this far behind the cursor. Two batches committed close
 * together can become visible out of timestamp order; re-reading a window is
 * free (applying a row twice is a no-op) and closes that gap.
 */
const OVERLAP_MS = 10_000;

/**
 * The account in Firestore: users/{uid}/{table}/{rowId}, one document per row,
 * `{ row, updatedAt, syncedAt }`. `syncedAt` is the server's clock, so the
 * pull cursor never depends on a phone's clock; `updatedAt` is the row's own,
 * which is what a conflict is decided on.
 */
export async function firestoreRemote(uid: string): Promise<Remote> {
  const fs = await firestoreReady();
  const db = fs.getFirestore();
  const table = (name: SyncedTable) => fs.collection(db, 'users', uid, name);

  return {
    async push(changes: OutgoingChange[]) {
      // A batch holds at most 500 writes; the outbox is read 400 at a time.
      for (let i = 0; i < changes.length; i += PAGE) {
        const batch = fs.writeBatch(db);
        for (const { table: name, row } of changes.slice(i, i + PAGE)) {
          batch.set(fs.doc(table(name), row.id), {
            row: stripUndefined(row),
            updatedAt: row.updatedAt,
            syncedAt: fs.serverTimestamp(),
          });
        }
        await batch.commit();
      }
    },

    async pull(name: SyncedTable, since: number) {
      const rows: SyncRow[] = [];
      let cursor = since;
      const from = fs.Timestamp.fromMillis(Math.max(0, since - OVERLAP_MS));
      let last: import('@react-native-firebase/firestore').QueryDocumentSnapshot | undefined;

      for (;;) {
        const q = last
          ? fs.query(table(name), fs.where('syncedAt', '>=', from), fs.orderBy('syncedAt'), fs.startAfter(last), fs.limit(PAGE))
          : fs.query(table(name), fs.where('syncedAt', '>=', from), fs.orderBy('syncedAt'), fs.limit(PAGE));
        const snap = await fs.getDocs(q);
        for (const doc of snap.docs) {
          const data = doc.data();
          rows.push(data.row as SyncRow);
          cursor = Math.max(cursor, (data.syncedAt as { toMillis(): number }).toMillis());
        }
        if (snap.docs.length < PAGE) break;
        last = snap.docs[snap.docs.length - 1];
      }
      return { rows, cursor };
    },

    async hasData() {
      // Every account that has ever pushed has a gym: the first launch makes one.
      const snap = await fs.getDocs(fs.query(table('gyms'), fs.limit(1)));
      return !snap.empty;
    },
  };
}

/**
 * When the account finished onboarding, read straight from Firestore: the
 * settings row (fixed id, SETTINGS_ID) of users/{uid}. Null for an account
 * that never did — a new sign-up. One document read; sync is not needed for it.
 */
export async function accountOnboardedAt(uid: string): Promise<number | null> {
  const fs = await firestoreReady();
  const snap = await fs.getDoc(fs.doc(fs.getFirestore(), 'users', uid, 'app_settings', SETTINGS_ID));
  const onboardedAt = (snap.data()?.row as { onboardedAt?: unknown } | undefined)?.onboardedAt;
  return typeof onboardedAt === 'number' ? onboardedAt : null;
}

/** Firestore rejects `undefined`; the rows use null for empty, but be sure. */
function stripUndefined(row: SyncRow): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
}
