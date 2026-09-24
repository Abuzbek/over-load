import {
  appSettings,
  exerciseEquipment,
  exerciseLinks,
  exerciseMuscles,
  exercises,
  gymEquipment,
  gyms,
  personalRecords,
  programDays,
  programs,
  sessionExercises,
  sessions,
  sessionSets,
  syncCursors,
  syncFlags,
  syncOutbox,
  workoutExercises,
  workouts,
  workoutSets,
  SYNCED_TABLES,
  type Db,
  type SyncedTable,
} from '@overload/schema';
import { and, asc, count, eq, getTableColumns, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';

/** A row as it travels: the Drizzle row object, JSON columns already parsed. */
export type SyncRow = Record<string, unknown> & { id: string; updatedAt: number };
export type OutgoingChange = { table: SyncedTable; row: SyncRow };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- one generic path over twelve tables
const TABLES: Record<SyncedTable, SQLiteTable & { id: any; updatedAt: any }> = {
  gyms,
  gym_equipment: gymEquipment,
  exercises,
  programs,
  workouts,
  program_days: programDays,
  workout_exercises: workoutExercises,
  workout_sets: workoutSets,
  sessions,
  session_exercises: sessionExercises,
  session_sets: sessionSets,
  app_settings: appSettings,
};

/**
 * The oldest pending changes, with the rows as they are now. `upTo` is the
 * highest seq read; pass it to ackOutbox once the push has landed.
 */
export function readOutbox(db: Db, limit = 400): { changes: OutgoingChange[]; upTo: number } {
  const pending = db.select().from(syncOutbox).orderBy(asc(syncOutbox.seq)).limit(limit).all();
  if (pending.length === 0) return { changes: [], upTo: 0 };

  const byTable = new Map<SyncedTable, string[]>();
  for (const p of pending) {
    const table = p.tableName as SyncedTable;
    byTable.set(table, [...(byTable.get(table) ?? []), p.rowId]);
  }

  const changes: OutgoingChange[] = [];
  for (const [table, ids] of byTable) {
    const t = TABLES[table];
    const rows = db.select().from(t).where(inArray(t.id, ids)).all() as SyncRow[];
    for (const row of rows) changes.push({ table, row });
  }
  return { changes, upTo: pending[pending.length - 1]!.seq };
}

/**
 * Drops what a push delivered. Only up to `upTo`: a row edited while the push
 * was in flight was re-queued with a higher seq and stays for the next one.
 */
export function ackOutbox(db: Db, upTo: number): void {
  db.delete(syncOutbox).where(lte(syncOutbox.seq, upTo)).run();
}

export function outboxSize(db: Db): number {
  return db.select({ n: count() }).from(syncOutbox).get()?.n ?? 0;
}

/**
 * Writes rows from the server. The newer `updatedAt` wins, so an edit made
 * here since the last sync is not overwritten by an older one from the
 * server; `force` skips that check, for adopting an account on a fresh device.
 *
 * `applying` stops the outbox triggers queueing these rows to be sent back.
 * Foreign keys are deferred to commit: a batch can hold a child before its
 * parent, and both are checked once everything has landed.
 */
export function applyRemote(db: Db, table: SyncedTable, rows: SyncRow[], opts: { force?: boolean } = {}): number {
  if (rows.length === 0) return 0;
  const t = TABLES[table];
  const columns = getTableColumns(t);
  const set = Object.fromEntries(
    Object.entries(columns)
      .filter(([key]) => key !== 'id')
      .map(([key, column]) => [key, sql.raw(`excluded.${column.name}`)]),
  );

  let applied = 0;
  db.transaction((tx) => {
    tx.run(sql`PRAGMA defer_foreign_keys = ON`);
    tx.update(syncFlags).set({ applying: 1 }).where(eq(syncFlags.id, 1)).run();

    const ids = rows.map((r) => r.id);
    const local = new Map(
      (tx.select({ id: t.id, updatedAt: t.updatedAt }).from(t).where(inArray(t.id, ids)).all() as SyncRow[])
        .map((r) => [r.id, r.updatedAt]),
    );
    const winners = rows.filter((row) => {
      const mine = local.get(row.id);
      return opts.force || mine === undefined || row.updatedAt > mine;
    });
    // Only the table's own columns: the server adds bookkeeping fields.
    const clean = winners.map((row) => Object.fromEntries(Object.keys(columns).map((k) => [k, row[k] ?? null])));
    for (let i = 0; i < clean.length; i += 200) {
      tx.insert(t).values(clean.slice(i, i + 200)).onConflictDoUpdate({ target: t.id, set }).run();
    }
    applied = winners.length;

    tx.update(syncFlags).set({ applying: 0 }).where(eq(syncFlags.id, 1)).run();
  });
  return applied;
}

export function getCursor(db: Db, table: SyncedTable, uid: string): number | null {
  const row = db.select().from(syncCursors).where(eq(syncCursors.tableName, table)).get();
  return row && row.uid === uid ? row.cursor : null;
}

export function setCursor(db: Db, table: SyncedTable, uid: string, cursor: number): void {
  db.insert(syncCursors).values({ tableName: table, cursor, uid })
    .onConflictDoUpdate({ target: syncCursors.tableName, set: { cursor, uid } })
    .run();
}

/** Whose account this device's user data is a copy of: the uid its cursors were written for. */
export function localOwner(db: Db): string | null {
  return db.select({ uid: syncCursors.uid }).from(syncCursors).limit(1).get()?.uid ?? null;
}

/**
 * Signing out, or in as someone else: this phone's copy of the account goes,
 * so the next person never sees it. The account itself lives in Firestore.
 *
 * A real DELETE, not tombstones — tombstones would sync, and this is not the
 * user deleting anything, only the device letting go of a cached copy. The
 * catalogue stays; only custom exercises are the account's. Callers recreate
 * the first-launch defaults afterwards.
 */
export function clearAccountData(db: Db): void {
  db.transaction((tx) => {
    tx.run(sql`PRAGMA defer_foreign_keys = ON`);
    tx.delete(personalRecords).run();
    for (const table of [...SYNCED_TABLES].reverse()) {
      if (table === 'exercises') {
        // A custom exercise's muscle links go with it; the catalogue's stay.
        const custom = sql`(select id from exercises where is_custom = 1)`;
        for (const link of [exerciseMuscles, exerciseLinks, exerciseEquipment]) {
          tx.delete(link).where(sql`${link.exerciseId} in ${custom}`).run();
        }
        tx.delete(exercises).where(eq(exercises.isCustom, true)).run();
      }
      else tx.delete(TABLES[table]).run();
    }
    tx.delete(syncOutbox).run();
    tx.delete(syncCursors).run();
  });
}

/**
 * Whether this device holds anything the user made, as opposed to the
 * defaults every install creates (a gym, a program, the settings row).
 */
export function hasOwnData(db: Db): boolean {
  const any = (t: typeof workouts | typeof sessions) =>
    (db.select({ n: count() }).from(t).where(isNull(t.deletedAt)).get()?.n ?? 0) > 0;
  const custom = db.select({ n: count() }).from(exercises)
    .where(and(eq(exercises.isCustom, true), isNull(exercises.deletedAt))).get()?.n ?? 0;
  return any(workouts) || any(sessions) || custom > 0;
}

/**
 * A fresh device signing in to an account that already has data: the
 * defaults this install created would sit next to the account's own "My Gym"
 * and "My Program". Retire them without queueing anything — they were never
 * the user's — so the pull that follows is the whole picture.
 */
export function discardLocalDefaults(db: Db, at: number): void {
  db.transaction((tx) => {
    tx.update(syncFlags).set({ applying: 1 }).where(eq(syncFlags.id, 1)).run();
    tx.update(gyms).set({ deletedAt: at, updatedAt: at }).where(isNull(gyms.deletedAt)).run();
    tx.update(programs).set({ deletedAt: at, updatedAt: at }).where(isNull(programs.deletedAt)).run();
    tx.delete(syncOutbox).run();
    tx.update(syncFlags).set({ applying: 0 }).where(eq(syncFlags.id, 1)).run();
  });
}
