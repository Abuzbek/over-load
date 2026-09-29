import { SYNCED_TABLES, type Db, type SyncedTable } from '@overload/schema';
import { rebuildAllPersonalRecords } from '../data/sessionRepo';
import {
  ackOutbox,
  applyRemote,
  discardLocalDefaults,
  getCursor,
  hasOwnData,
  readOutbox,
  setCursor,
  type OutgoingChange,
  type SyncRow,
} from '../data/syncRepo';

/**
 * The server, as the engine needs it. `pull` returns every row the server
 * stamped at or after `since` (its own clock, ms) and the newest stamp seen;
 * at-or-after rather than after, so rows sharing a millisecond across two
 * pages are never skipped — re-applying one is a no-op.
 */
export interface Remote {
  push(changes: OutgoingChange[]): Promise<void>;
  /** `onRows` hears each page as it arrives, for a progress bar. */
  pull(table: SyncedTable, since: number, onRows?: (count: number) => void): Promise<{ rows: SyncRow[]; cursor: number }>;
  hasData(): Promise<boolean>;
  /** How many documents the account holds in one table. */
  countRows(table: SyncedTable): Promise<number>;
}

export type SyncResult = { pushed: number; pulled: number; adopted: boolean };

/**
 * A first sync's progress: rows fetched so far out of the account's total.
 * Only a first sync reports it — later ones fetch a few changed rows.
 */
export type RestoreProgress = {
  /** The table being fetched now; the ones before it in SYNCED_TABLES are finished. */
  table: SyncedTable;
  done: number;
  total: number;
  tables: Record<SyncedTable, { done: number; total: number }>;
};

let inFlight: Promise<SyncResult> | null = null;

/**
 * One full round: pull every table, then push the outbox. Single-flight — a
 * call while a sync runs joins it rather than racing it.
 *
 * Pull comes first so a fresh device adopts the account before it pushes
 * anything. Conflicts resolve by `updatedAt` (applyRemote), so the order does
 * not decide who wins.
 */
export function syncNow(
  db: Db,
  remote: Remote,
  uid: string,
  at = Date.now(),
  onProgress?: (progress: RestoreProgress) => void,
): Promise<SyncResult> {
  inFlight ??= run(db, remote, uid, at, onProgress).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(db: Db, remote: Remote, uid: string, at: number, onProgress?: (progress: RestoreProgress) => void): Promise<SyncResult> {
  const firstSync = SYNCED_TABLES.every((t) => getCursor(db, t, uid) === null);
  const report = firstSync ? onProgress : undefined;
  const tables = Object.fromEntries(SYNCED_TABLES.map((t) => [t, { done: 0, total: 0 }])) as RestoreProgress['tables'];
  const send = (table: SyncedTable) => {
    const all = Object.values(tables);
    report?.({
      table,
      done: all.reduce((n, t) => n + t.done, 0),
      total: all.reduce((n, t) => n + t.total, 0),
      tables: Object.fromEntries(SYNCED_TABLES.map((t) => [t, { ...tables[t] }])) as RestoreProgress['tables'],
    });
  };
  if (report) {
    const counts = await Promise.all(SYNCED_TABLES.map((t) => remote.countRows(t)));
    SYNCED_TABLES.forEach((t, i) => (tables[t].total = counts[i]!));
  }
  let adopted = false;
  if (firstSync && !hasOwnData(db) && (await remote.hasData())) {
    discardLocalDefaults(db, at);
    adopted = true;
  }

  let pulled = 0;
  let setsChanged = false;
  for (const table of SYNCED_TABLES) {
    const since = getCursor(db, table, uid) ?? 0;
    send(table);
    const { rows, cursor } = await remote.pull(
      table,
      since,
      report
        ? (count) => {
            const t = tables[table];
            t.done += count;
            t.total = Math.max(t.total, t.done);
            send(table);
          }
        : undefined,
    );
    const applied = applyRemote(db, table, rows, { force: adopted });
    pulled += applied;
    if (applied > 0 && table === 'session_sets') setsChanged = true;
    setCursor(db, table, uid, Math.max(cursor, since));
  }
  // personal_records is a local cache of the sets; sets from another device
  // change what it should hold.
  if (setsChanged) rebuildAllPersonalRecords(db);

  let pushed = 0;
  for (;;) {
    const { changes, upTo } = readOutbox(db);
    if (upTo === 0) break;
    if (changes.length > 0) await remote.push(changes);
    ackOutbox(db, upTo);
    pushed += changes.length;
  }

  return { pushed, pulled, adopted };
}
