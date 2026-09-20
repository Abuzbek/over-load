import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../index';

const DRIZZLE_FOLDER = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle');

type JournalEntry = { idx: number; version: string; when: number; tag: string; breakpoints: boolean };
type Journal = { version: string; dialect: string; entries: JournalEntry[] };

export type PartialDb = BetterSQLite3Database<typeof schema>;

/**
 * Builds an in-memory database migrated only through the given journal entry
 * (0-indexed, inclusive), by copying that prefix of drizzle/meta/_journal.json
 * and its referenced .sql files into a scratch folder and migrating against
 * that folder alone.
 *
 * Pairs with `applyFullMigrations`: insert data while the schema is frozen at
 * an old version, then run the *real* drizzle/ folder and prove later
 * migrations don't destroy it. This is the only way to exercise a later
 * migration's SQL for real — drizzle's migrator compares each migration's
 * journal timestamp against the newest one already recorded in
 * `__drizzle_migrations` and skips anything not newer, so migrating a
 * database that already has every migration applied (e.g. one built via
 * `createTestDb`) runs zero statements and would pass even if a migration
 * were destructive.
 *
 * Reusable as migrations accumulate: `createDbAtMigration(0)` means "only
 * the first migration applied," `createDbAtMigration(1)` means "the first
 * two," and so on — adding migration 0002 needs a new test, not a rewrite of
 * this helper.
 */
export function createDbAtMigration(throughIndex: number): { db: PartialDb; close: () => void } {
  const journal: Journal = JSON.parse(
    fs.readFileSync(path.join(DRIZZLE_FOLDER, 'meta/_journal.json'), 'utf-8'),
  );
  const entries = journal.entries.slice(0, throughIndex + 1);
  if (entries.length === 0) {
    throw new Error(`throughIndex ${throughIndex} selects no journal entries`);
  }

  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overload-migrations-'));
  fs.mkdirSync(path.join(scratchDir, 'meta'));
  fs.writeFileSync(path.join(scratchDir, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
  for (const entry of entries) {
    fs.copyFileSync(
      path.join(DRIZZLE_FOLDER, `${entry.tag}.sql`),
      path.join(scratchDir, `${entry.tag}.sql`),
    );
  }

  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: scratchDir });

  return {
    db,
    close: () => {
      sqlite.close();
      fs.rmSync(scratchDir, { recursive: true, force: true });
    },
  };
}

/**
 * Applies the real, full drizzle/ folder to a database already migrated to
 * some earlier point (via `createDbAtMigration`). Whichever migrations
 * haven't been applied yet actually run — this is not a no-op the way
 * re-migrating an already-current database is.
 */
export function applyFullMigrations(db: PartialDb): void {
  migrate(db, { migrationsFolder: DRIZZLE_FOLDER });
}
