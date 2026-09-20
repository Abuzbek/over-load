# Workout Logger — Foundation & Core Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline-first mobile workout logger that can be used as a primary training log — create a routine, run a live session with per-set logging and rest timers, review history.

**Architecture:** A pnpm monorepo. Pure TypeScript business logic lives in `packages/domain` with no React and no database imports, so it is testable in milliseconds on a laptop. Drizzle table definitions live in `packages/schema`, shared today by the Expo app and later by the phase-2 Node API. The Expo app reads and writes through repository functions in `apps/mobile/src/data`, which are the only place SQL appears. The active workout session writes every completed set to SQLite immediately rather than holding state in React.

**Tech Stack:** Expo (React Native) + TypeScript, expo-router, expo-sqlite with Drizzle ORM, Vitest, better-sqlite3 (tests only), pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-09-19-workout-logger-design.md`

## Global Constraints

- **Weight is stored in kilograms, always.** Pounds are a display-time conversion. No table stores a user-facing unit.
- **Every synced table carries `id` (UUIDv7, client-generated), `created_at`, `updated_at`, `deleted_at`.** Including join tables. `personal_records` is the sole exemption — it is a derived cache.
- **Deletes are tombstones.** Set `deleted_at`; never issue `DELETE`. Every read filters `WHERE deleted_at IS NULL`.
- **Timestamps are integer epoch milliseconds.** Never ISO strings, never SQLite date types.
- **No cross-row invariants in SQL.** Validation lives in `packages/domain` so the phase-2 server can reuse it.
- **`packages/domain` may not import React, expo-*, drizzle-orm, or any I/O.** It operates on plain objects only. This is enforced by review.
- **Never issue a raw `DELETE` or `UPDATE` from a screen.** Screens call repository functions only.
- **Node 20+, pnpm 9+.**

## File Structure

```
pnpm-workspace.yaml
package.json                              root scripts, shared devDeps
tsconfig.base.json

packages/domain/
  src/units.ts                            kg/lb conversion, plate rounding
  src/oneRepMax.ts                        Epley estimation
  src/sets.ts                             CompletedSet type, volume, set predicates
  src/personalRecords.ts                  PR detection over completed sets
  src/index.ts                            public exports

packages/schema/
  drizzle/                                generated migrations + migrations.js
  drizzle.config.ts
  src/sync.ts                             syncColumns helper, newId()
  src/exercises.ts                        exercises table
  src/routines.ts                         routines, routine_exercises, routine_sets
  src/workouts.ts                         workouts, workout_exercises, sets
  src/personalRecords.ts                  personal_records derived cache
  src/index.ts                            re-exports all tables + inferred types

apps/mobile/
  src/db/client.ts                        openDatabaseSync + drizzle instance
  src/db/backup.ts                        pre-migration file backup/restore
  src/data/exerciseRepo.ts
  src/data/routineRepo.ts
  src/data/sessionRepo.ts
  src/features/library/                   exercise library screens
  src/features/routines/                  routine builder screens
  src/features/session/                   active session screens
  src/features/history/                   history list + detail
  src/ui/                                 shared primitives
  app/                                    expo-router routes

tools/seed-exercises/
  build.ts                                fetch + curate free-exercise-db
  curated.json                            committed output
```

---

### Task 1: Workspace scaffold and the first domain function

Sets up the monorepo and proves the test loop works end to end by implementing unit conversion. Scaffolding is folded in here because it has no independently testable deliverable of its own.

**Files:**
- Create: `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`
- Create: `packages/domain/package.json`, `packages/domain/tsconfig.json`, `packages/domain/src/units.ts`, `packages/domain/src/index.ts`
- Test: `packages/domain/src/units.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `kgToLb(kg: number): number`, `lbToKg(lb: number): number`, `roundToIncrement(value: number, increment: number): number`

- [ ] **Step 1: Create the workspace files**

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
  - 'tools/*'
```

Root `package.json`:

```json
{
  "name": "workouts",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  }
}
```

`packages/domain/package.json`:

```json
{
  "name": "@overload/domain",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
```

`packages/domain/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

- [ ] **Step 2: Install dependencies**

Run: `pnpm install`
Expected: lockfile created, `node_modules` populated, no errors.

- [ ] **Step 3: Write the failing test**

`packages/domain/src/units.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { kgToLb, lbToKg, roundToIncrement } from './units';

describe('unit conversion', () => {
  it('converts kilograms to pounds', () => {
    expect(kgToLb(100)).toBeCloseTo(220.462, 3);
  });

  it('converts pounds to kilograms', () => {
    expect(lbToKg(220.462)).toBeCloseTo(100, 3);
  });

  it('round-trips without drift', () => {
    expect(lbToKg(kgToLb(62.5))).toBeCloseTo(62.5, 6);
  });
});

describe('roundToIncrement', () => {
  it('rounds to the nearest 2.5kg plate step', () => {
    expect(roundToIncrement(61.2, 2.5)).toBe(60);
    expect(roundToIncrement(63.9, 2.5)).toBe(65);
  });

  it('rounds half-steps up', () => {
    expect(roundToIncrement(61.25, 2.5)).toBe(62.5);
  });

  it('returns the value unchanged when the increment is zero', () => {
    expect(roundToIncrement(61.2, 0)).toBe(61.2);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm vitest run packages/domain/src/units.test.ts`
Expected: FAIL — cannot resolve `./units`.

- [ ] **Step 5: Write the implementation**

`packages/domain/src/units.ts`:

```ts
const LB_PER_KG = 2.20462262185;

export type Unit = 'kg' | 'lb';

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}

/** Rounds to the nearest usable loading step. An increment of 0 disables rounding. */
export function roundToIncrement(value: number, increment: number): number {
  if (increment <= 0) return value;
  return Math.round(value / increment) * increment;
}
```

`packages/domain/src/index.ts`:

```ts
export * from './units';
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm vitest run packages/domain/src/units.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold pnpm workspace and add unit conversion"
```

---

### Task 2: One-rep-max estimation

**Files:**
- Create: `packages/domain/src/oneRepMax.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/oneRepMax.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `estimateOneRepMax(weightKg: number, reps: number): number`

- [ ] **Step 1: Write the failing test**

`packages/domain/src/oneRepMax.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { estimateOneRepMax } from './oneRepMax';

describe('estimateOneRepMax', () => {
  it('returns the lifted weight for a single', () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
  });

  it('applies the Epley formula above one rep', () => {
    // 100 * (1 + 5/30) = 116.666...
    expect(estimateOneRepMax(100, 5)).toBeCloseTo(116.667, 3);
  });

  it('returns 0 for zero reps', () => {
    expect(estimateOneRepMax(100, 0)).toBe(0);
  });

  it('returns 0 for zero weight', () => {
    expect(estimateOneRepMax(0, 8)).toBe(0);
  });

  it('never returns a negative estimate', () => {
    expect(estimateOneRepMax(-50, 5)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/domain/src/oneRepMax.test.ts`
Expected: FAIL — cannot resolve `./oneRepMax`.

- [ ] **Step 3: Write the implementation**

`packages/domain/src/oneRepMax.ts`:

```ts
/**
 * Epley estimate: 1RM = w * (1 + reps/30).
 * Accurate enough under ~10 reps, which covers almost all logged work.
 * Returns 0 for inputs that cannot describe a real lift.
 */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}
```

Append to `packages/domain/src/index.ts`:

```ts
export * from './oneRepMax';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/domain/src/oneRepMax.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Epley one-rep-max estimation"
```

---

### Task 3: Completed set model, volume, and personal records

The `CompletedSet` type defined here is the boundary between the database and all analytics. Repositories map rows into it; every domain calculation consumes it.

**Files:**
- Create: `packages/domain/src/sets.ts`, `packages/domain/src/personalRecords.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/sets.test.ts`, `packages/domain/src/personalRecords.test.ts`

**Interfaces:**
- Consumes: `estimateOneRepMax` from Task 2
- Produces:
  - `type SetType = 'normal' | 'warmup' | 'drop' | 'failure'`
  - `type CompletedSet = { id, exerciseId, setType, weightKg, reps, durationSeconds, completedAt }`
  - `countsTowardRecords(set: CompletedSet): boolean`
  - `setVolumeKg(set: CompletedSet): number`
  - `totalVolumeKg(sets: CompletedSet[]): number`
  - `type PersonalRecordType = 'max_weight' | 'max_reps' | 'max_volume' | 'est_1rm'`
  - `type PersonalRecord = { exerciseId, type, value, setId, achievedAt }`
  - `computePersonalRecords(sets: CompletedSet[]): PersonalRecord[]`

- [ ] **Step 1: Write the failing test for sets**

`packages/domain/src/sets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { countsTowardRecords, setVolumeKg, totalVolumeKg, type CompletedSet } from './sets';

function set(partial: Partial<CompletedSet> = {}): CompletedSet {
  return {
    id: 's1',
    exerciseId: 'e1',
    setType: 'normal',
    weightKg: 100,
    reps: 5,
    durationSeconds: null,
    completedAt: 1_700_000_000_000,
    ...partial,
  };
}

describe('countsTowardRecords', () => {
  it('counts normal sets', () => {
    expect(countsTowardRecords(set())).toBe(true);
  });

  it('counts failure sets', () => {
    expect(countsTowardRecords(set({ setType: 'failure' }))).toBe(true);
  });

  it('counts drop sets', () => {
    expect(countsTowardRecords(set({ setType: 'drop' }))).toBe(true);
  });

  it('excludes warmup sets', () => {
    expect(countsTowardRecords(set({ setType: 'warmup' }))).toBe(false);
  });
});

describe('setVolumeKg', () => {
  it('multiplies weight by reps', () => {
    expect(setVolumeKg(set({ weightKg: 100, reps: 5 }))).toBe(500);
  });

  it('is zero for a set with no weight', () => {
    expect(setVolumeKg(set({ weightKg: null, reps: 12 }))).toBe(0);
  });

  it('is zero for a set with no reps', () => {
    expect(setVolumeKg(set({ reps: null, durationSeconds: 60 }))).toBe(0);
  });
});

describe('totalVolumeKg', () => {
  it('sums working sets and ignores warmups', () => {
    const sets = [
      set({ id: 'a', setType: 'warmup', weightKg: 60, reps: 10 }),
      set({ id: 'b', weightKg: 100, reps: 5 }),
      set({ id: 'c', weightKg: 100, reps: 3 }),
    ];
    expect(totalVolumeKg(sets)).toBe(800);
  });

  it('is zero for an empty list', () => {
    expect(totalVolumeKg([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/domain/src/sets.test.ts`
Expected: FAIL — cannot resolve `./sets`.

- [ ] **Step 3: Implement the set model**

`packages/domain/src/sets.ts`:

```ts
export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';

/**
 * A set that actually happened. Repositories map database rows into this shape;
 * every analytic function consumes it. Fields are null when the exercise's
 * tracking type does not use them (a plank has no weight, a pull-up no reps target).
 */
export type CompletedSet = {
  id: string;
  exerciseId: string;
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  /** Epoch milliseconds. */
  completedAt: number;
};

/** Warmups are real work but never records. Everything else counts. */
export function countsTowardRecords(set: CompletedSet): boolean {
  return set.setType !== 'warmup';
}

export function setVolumeKg(set: CompletedSet): number {
  if (set.weightKg === null || set.reps === null) return 0;
  if (set.weightKg <= 0 || set.reps <= 0) return 0;
  return set.weightKg * set.reps;
}

export function totalVolumeKg(sets: CompletedSet[]): number {
  return sets.filter(countsTowardRecords).reduce((sum, s) => sum + setVolumeKg(s), 0);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/domain/src/sets.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Write the failing test for personal records**

`packages/domain/src/personalRecords.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computePersonalRecords } from './personalRecords';
import type { CompletedSet } from './sets';

function set(partial: Partial<CompletedSet> & { id: string }): CompletedSet {
  return {
    exerciseId: 'bench',
    setType: 'normal',
    weightKg: 100,
    reps: 5,
    durationSeconds: null,
    completedAt: 1_700_000_000_000,
    ...partial,
  };
}

describe('computePersonalRecords', () => {
  it('returns no records for an empty list', () => {
    expect(computePersonalRecords([])).toEqual([]);
  });

  it('finds the heaviest set', () => {
    const records = computePersonalRecords([
      set({ id: 'a', weightKg: 100, reps: 5 }),
      set({ id: 'b', weightKg: 120, reps: 1 }),
    ]);
    const maxWeight = records.find((r) => r.type === 'max_weight');
    expect(maxWeight).toMatchObject({ value: 120, setId: 'b', exerciseId: 'bench' });
  });

  it('finds the highest estimated 1RM, which need not be the heaviest set', () => {
    const records = computePersonalRecords([
      set({ id: 'heavy', weightKg: 120, reps: 1 }),   // est 120
      set({ id: 'volume', weightKg: 105, reps: 5 }),  // est 122.5
    ]);
    const est = records.find((r) => r.type === 'est_1rm');
    expect(est?.setId).toBe('volume');
    expect(est?.value).toBeCloseTo(122.5, 3);
  });

  it('ignores warmup sets entirely', () => {
    const records = computePersonalRecords([
      set({ id: 'w', setType: 'warmup', weightKg: 200, reps: 1 }),
      set({ id: 'a', weightKg: 100, reps: 5 }),
    ]);
    expect(records.every((r) => r.setId === 'a')).toBe(true);
  });

  it('keeps records separate per exercise', () => {
    const records = computePersonalRecords([
      set({ id: 'a', exerciseId: 'bench', weightKg: 100, reps: 5 }),
      set({ id: 'b', exerciseId: 'squat', weightKg: 150, reps: 5 }),
    ]);
    const benchMax = records.find((r) => r.exerciseId === 'bench' && r.type === 'max_weight');
    const squatMax = records.find((r) => r.exerciseId === 'squat' && r.type === 'max_weight');
    expect(benchMax?.value).toBe(100);
    expect(squatMax?.value).toBe(150);
  });

  it('breaks ties in favour of the earliest set', () => {
    const records = computePersonalRecords([
      set({ id: 'later', weightKg: 100, reps: 5, completedAt: 2000 }),
      set({ id: 'earlier', weightKg: 100, reps: 5, completedAt: 1000 }),
    ]);
    const maxWeight = records.find((r) => r.type === 'max_weight');
    expect(maxWeight?.setId).toBe('earlier');
  });

  it('omits weight-based records for sets with no weight', () => {
    const records = computePersonalRecords([
      set({ id: 'plank', exerciseId: 'plank', weightKg: null, reps: null, durationSeconds: 60 }),
    ]);
    expect(records).toEqual([]);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm vitest run packages/domain/src/personalRecords.test.ts`
Expected: FAIL — cannot resolve `./personalRecords`.

- [ ] **Step 7: Implement personal record detection**

`packages/domain/src/personalRecords.ts`:

```ts
import { estimateOneRepMax } from './oneRepMax';
import { countsTowardRecords, setVolumeKg, type CompletedSet } from './sets';

export type PersonalRecordType = 'max_weight' | 'max_reps' | 'max_volume' | 'est_1rm';

export type PersonalRecord = {
  exerciseId: string;
  type: PersonalRecordType;
  value: number;
  setId: string;
  /** Epoch milliseconds. */
  achievedAt: number;
};

type Metric = { type: PersonalRecordType; of: (set: CompletedSet) => number };

const METRICS: Metric[] = [
  { type: 'max_weight', of: (s) => s.weightKg ?? 0 },
  { type: 'max_reps', of: (s) => (s.weightKg === null ? 0 : (s.reps ?? 0)) },
  { type: 'max_volume', of: setVolumeKg },
  { type: 'est_1rm', of: (s) => estimateOneRepMax(s.weightKg ?? 0, s.reps ?? 0) },
];

/**
 * Recomputes every record from scratch. This is a derived cache, never a
 * source of truth, so it is always safe to throw away and rebuild.
 * Ties go to the earliest set — the first time you hit a number is the record.
 */
export function computePersonalRecords(sets: CompletedSet[]): PersonalRecord[] {
  const working = sets.filter(countsTowardRecords);
  const byExercise = new Map<string, CompletedSet[]>();

  for (const set of working) {
    const group = byExercise.get(set.exerciseId);
    if (group) group.push(set);
    else byExercise.set(set.exerciseId, [set]);
  }

  const records: PersonalRecord[] = [];

  for (const [exerciseId, group] of byExercise) {
    for (const metric of METRICS) {
      let best: CompletedSet | undefined;
      let bestValue = 0;

      for (const set of group) {
        const value = metric.of(set);
        if (value <= 0) continue;
        const isBetter = value > bestValue;
        const isEarlierTie =
          value === bestValue && best !== undefined && set.completedAt < best.completedAt;
        if (isBetter || isEarlierTie) {
          best = set;
          bestValue = value;
        }
      }

      if (best) {
        records.push({
          exerciseId,
          type: metric.type,
          value: bestValue,
          setId: best.id,
          achievedAt: best.completedAt,
        });
      }
    }
  }

  return records;
}
```

Append to `packages/domain/src/index.ts`:

```ts
export * from './sets';
export * from './personalRecords';
```

- [ ] **Step 8: Run the full suite to verify it passes**

Run: `pnpm vitest run`
Expected: PASS, all tests across units, oneRepMax, sets, personalRecords.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add completed set model, volume, and personal record detection"
```

---

### Task 4: Schema package, sync columns, exercises table, and the test harness

Establishes the database layer. Migration tooling and the in-memory test harness are folded in because the first table cannot be tested without them.

**Files:**
- Create: `packages/schema/package.json`, `packages/schema/tsconfig.json`, `packages/schema/drizzle.config.ts`
- Create: `packages/schema/src/sync.ts`, `packages/schema/src/exercises.ts`, `packages/schema/src/index.ts`
- Create: `packages/schema/src/testing/memoryDb.ts`
- Generated: `packages/schema/drizzle/**` (migration SQL, `meta/_journal.json`, `migrations.js`)
- Test: `packages/schema/src/exercises.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `newId(): string` — UUIDv7
  - `now(): number` — epoch ms
  - `syncColumns` — spreadable column set: `id`, `createdAt`, `updatedAt`, `deletedAt`
  - `exercises` table; `type Exercise = typeof exercises.$inferSelect`; `type NewExercise = typeof exercises.$inferInsert`
  - `type TrackingType = 'weight_reps' | 'reps' | 'duration' | 'distance_duration'`
  - `createTestDb(): { db: BetterSQLite3Database<typeof schema>; sqlite: Database }`

**Note on migration location:** migrations live in `packages/schema/drizzle/`, next to the schema that generates them. The Expo app imports them from there.

- [ ] **Step 1: Create the package and install dependencies**

`packages/schema/package.json`:

```json
{
  "name": "@overload/schema",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./migrations": "./drizzle/migrations.js",
    "./testing": "./src/testing/memoryDb.ts"
  },
  "scripts": {
    "generate": "drizzle-kit generate"
  },
  "dependencies": {
    "drizzle-orm": "^0.36.0",
    "uuidv7": "^1.0.2"
  },
  "devDependencies": {
    "better-sqlite3": "^11.5.0",
    "@types/better-sqlite3": "^7.6.11",
    "drizzle-kit": "^0.28.0"
  }
}
```

`packages/schema/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

Run: `pnpm install`
Expected: dependencies resolve, `better-sqlite3` compiles.

- [ ] **Step 2: Write the sync primitives**

`packages/schema/src/sync.ts`:

```ts
import { integer, text } from 'drizzle-orm/sqlite-core';
import { uuidv7 } from 'uuidv7';

/**
 * UUIDv7 is time-ordered, so client-generated ids still cluster well in a
 * B-tree index. Offline rows are globally unique the moment they are created.
 */
export function newId(): string {
  return uuidv7();
}

/** Epoch milliseconds. The only time representation used anywhere. */
export function now(): number {
  return Date.now();
}

/**
 * Spread into every synced table, including join tables. `personal_records`
 * is the sole exemption — it is a derived cache that never syncs.
 * Deletes are tombstones: set `deletedAt`, never issue DELETE.
 */
export const syncColumns = {
  id: text('id').primaryKey().$defaultFn(newId),
  createdAt: integer('created_at').notNull().$defaultFn(now),
  updatedAt: integer('updated_at').notNull().$defaultFn(now),
  deletedAt: integer('deleted_at'),
};
```

- [ ] **Step 3: Write the exercises table**

`packages/schema/src/exercises.ts`:

```ts
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { syncColumns } from './sync';

export const TRACKING_TYPES = ['weight_reps', 'reps', 'duration', 'distance_duration'] as const;
export type TrackingType = (typeof TRACKING_TYPES)[number];

export const exercises = sqliteTable(
  'exercises',
  {
    ...syncColumns,
    name: text('name').notNull(),
    /** Drives which inputs the session screen renders for this exercise. */
    trackingType: text('tracking_type', { enum: TRACKING_TYPES }).notNull(),
    primaryMuscle: text('primary_muscle').notNull(),
    secondaryMuscles: text('secondary_muscles', { mode: 'json' }).$type<string[]>().notNull(),
    equipment: text('equipment').notNull(),
    instructions: text('instructions'),
    isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => ({
    nameIdx: index('exercises_name_idx').on(table.name),
  }),
);

export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;
```

`packages/schema/src/index.ts`:

```ts
export * from './sync';
export * from './exercises';
```

- [ ] **Step 4: Configure drizzle-kit and generate the first migration**

`packages/schema/drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/index.ts',
  out: './drizzle',
  dialect: 'sqlite',
  driver: 'expo',
});
```

Run: `pnpm --filter @overload/schema generate`
Expected: `packages/schema/drizzle/0000_*.sql`, `drizzle/meta/_journal.json`, and `drizzle/migrations.js` are created. Open the `.sql` file and confirm it contains `CREATE TABLE \`exercises\``.

- [ ] **Step 5: Write the test harness**

`packages/schema/src/testing/memoryDb.ts`:

```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../index';

const MIGRATIONS_FOLDER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
);

export type TestDb = BetterSQLite3Database<typeof schema>;

/**
 * An in-memory database built by running the real migrations, so tests fail
 * when a migration is wrong rather than passing against a hand-built schema.
 */
export function createTestDb(): { db: TestDb; close: () => void } {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db, close: () => sqlite.close() };
}
```

- [ ] **Step 6: Write the failing test**

`packages/schema/src/exercises.test.ts`:

```ts
import { eq, isNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exercises } from './exercises';
import { newId, now } from './sync';
import { createTestDb, type TestDb } from './testing/memoryDb';

let db: TestDb;
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestDb());
});

afterEach(() => close());

function benchPress() {
  return {
    name: 'Barbell Bench Press',
    trackingType: 'weight_reps' as const,
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'front delts'],
    equipment: 'barbell',
    instructions: 'Lower to the chest, press to lockout.',
  };
}

describe('exercises table', () => {
  it('round-trips a row with defaulted sync columns', () => {
    db.insert(exercises).values(benchPress()).run();
    const [row] = db.select().from(exercises).all();

    expect(row?.name).toBe('Barbell Bench Press');
    expect(row?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row?.createdAt).toBeGreaterThan(0);
    expect(row?.updatedAt).toBeGreaterThan(0);
    expect(row?.deletedAt).toBeNull();
    expect(row?.isCustom).toBe(false);
  });

  it('preserves secondaryMuscles as a JSON array', () => {
    db.insert(exercises).values(benchPress()).run();
    const [row] = db.select().from(exercises).all();
    expect(row?.secondaryMuscles).toEqual(['triceps', 'front delts']);
  });

  it('soft-deletes via a tombstone rather than removing the row', () => {
    const id = newId();
    db.insert(exercises).values({ ...benchPress(), id }).run();
    db.update(exercises).set({ deletedAt: now() }).where(eq(exercises.id, id)).run();

    const all = db.select().from(exercises).all();
    const live = db.select().from(exercises).where(isNull(exercises.deletedAt)).all();

    expect(all).toHaveLength(1);
    expect(live).toHaveLength(0);
  });

  it('rejects an unknown tracking type at the type level', () => {
    // @ts-expect-error 'cardio' is not a TrackingType
    const invalid = { ...benchPress(), trackingType: 'cardio' };
    expect(invalid.trackingType).toBe('cardio');
  });
});
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm vitest run packages/schema`
Expected: PASS, 4 tests. If migrations are missing the run fails at `createTestDb` — regenerate with Step 4.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add schema package with sync columns, exercises table, and test harness"
```

---

### Task 5: Routine and workout tables

Adds the two parallel trees. They are deliberately separate: starting a routine copies it, so editing a template never alters logged history.

**Files:**
- Create: `packages/schema/src/routines.ts`, `packages/schema/src/workouts.ts`, `packages/schema/src/personalRecords.ts`
- Modify: `packages/schema/src/index.ts`
- Generated: a new migration in `packages/schema/drizzle/`
- Test: `packages/schema/src/workouts.test.ts`

**Interfaces:**
- Consumes: `syncColumns`, `exercises` from Task 4
- Produces: tables `routines`, `routineExercises`, `routineSets`, `workouts`, `workoutExercises`, `sets`, `personalRecords`, plus `$inferSelect`/`$inferInsert` types for each, and `SET_TYPES`

- [ ] **Step 1: Write the routines tree**

`packages/schema/src/routines.ts`:

```ts
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { exercises } from './exercises';
import { syncColumns } from './sync';

export const SET_TYPES = ['normal', 'warmup', 'drop', 'failure'] as const;
export type SetType = (typeof SET_TYPES)[number];

export const routines = sqliteTable('routines', {
  ...syncColumns,
  name: text('name').notNull(),
  notes: text('notes'),
  orderIndex: integer('order_index').notNull().default(0),
});

export const routineExercises = sqliteTable(
  'routine_exercises',
  {
    ...syncColumns,
    routineId: text('routine_id').notNull().references(() => routines.id),
    exerciseId: text('exercise_id').notNull().references(() => exercises.id),
    orderIndex: integer('order_index').notNull(),
    notes: text('notes'),
    restSeconds: integer('rest_seconds'),
    /** Same number within one routine means the same superset. Null means none. */
    supersetGroup: integer('superset_group'),
  },
  (table) => ({
    routineIdx: index('routine_exercises_routine_idx').on(table.routineId),
  }),
);

export const routineSets = sqliteTable(
  'routine_sets',
  {
    ...syncColumns,
    routineExerciseId: text('routine_exercise_id').notNull().references(() => routineExercises.id),
    orderIndex: integer('order_index').notNull(),
    setType: text('set_type', { enum: SET_TYPES }).notNull().default('normal'),
    targetReps: integer('target_reps'),
    targetWeightKg: real('target_weight_kg'),
    targetRpe: real('target_rpe'),
  },
  (table) => ({
    parentIdx: index('routine_sets_parent_idx').on(table.routineExerciseId),
  }),
);

export type Routine = typeof routines.$inferSelect;
export type NewRoutine = typeof routines.$inferInsert;
export type RoutineExercise = typeof routineExercises.$inferSelect;
export type NewRoutineExercise = typeof routineExercises.$inferInsert;
export type RoutineSet = typeof routineSets.$inferSelect;
export type NewRoutineSet = typeof routineSets.$inferInsert;
```

- [ ] **Step 2: Write the workouts tree**

`packages/schema/src/workouts.ts`:

```ts
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { exercises } from './exercises';
import { routines, SET_TYPES } from './routines';
import { syncColumns } from './sync';

export const workouts = sqliteTable(
  'workouts',
  {
    ...syncColumns,
    /** Null for a freestyle workout started without a routine. */
    routineId: text('routine_id').references(() => routines.id),
    name: text('name').notNull(),
    startedAt: integer('started_at').notNull(),
    /** Null means in progress. On launch, such a workout is offered for resume. */
    endedAt: integer('ended_at'),
    notes: text('notes'),
  },
  (table) => ({
    startedIdx: index('workouts_started_idx').on(table.startedAt),
  }),
);

export const workoutExercises = sqliteTable(
  'workout_exercises',
  {
    ...syncColumns,
    workoutId: text('workout_id').notNull().references(() => workouts.id),
    exerciseId: text('exercise_id').notNull().references(() => exercises.id),
    orderIndex: integer('order_index').notNull(),
    notes: text('notes'),
    restSeconds: integer('rest_seconds'),
    supersetGroup: integer('superset_group'),
  },
  (table) => ({
    workoutIdx: index('workout_exercises_workout_idx').on(table.workoutId),
    exerciseIdx: index('workout_exercises_exercise_idx').on(table.exerciseId),
  }),
);

export const sets = sqliteTable(
  'sets',
  {
    ...syncColumns,
    workoutExerciseId: text('workout_exercise_id').notNull().references(() => workoutExercises.id),
    orderIndex: integer('order_index').notNull(),
    setType: text('set_type', { enum: SET_TYPES }).notNull().default('normal'),
    weightKg: real('weight_kg'),
    reps: integer('reps'),
    durationSeconds: integer('duration_seconds'),
    distanceM: real('distance_m'),
    rpe: real('rpe'),
    rir: integer('rir'),
    /** Null means planned but not yet performed. This is what makes crash recovery work. */
    completedAt: integer('completed_at'),
  },
  (table) => ({
    parentIdx: index('sets_parent_idx').on(table.workoutExerciseId),
    completedIdx: index('sets_completed_idx').on(table.completedAt),
  }),
);

export type Workout = typeof workouts.$inferSelect;
export type NewWorkout = typeof workouts.$inferInsert;
export type WorkoutExercise = typeof workoutExercises.$inferSelect;
export type NewWorkoutExercise = typeof workoutExercises.$inferInsert;
export type WorkoutSet = typeof sets.$inferSelect;
export type NewWorkoutSet = typeof sets.$inferInsert;
```

- [ ] **Step 3: Write the personal records cache**

`packages/schema/src/personalRecords.ts`:

```ts
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { exercises } from './exercises';

/**
 * Derived cache — deliberately WITHOUT sync columns. Fully recomputable from
 * `sets`, so each device rebuilds its own and nothing is ever synced.
 */
export const personalRecords = sqliteTable(
  'personal_records',
  {
    id: text('id').primaryKey(),
    exerciseId: text('exercise_id').notNull().references(() => exercises.id),
    type: text('type').notNull(),
    value: real('value').notNull(),
    setId: text('set_id').notNull(),
    achievedAt: integer('achieved_at').notNull(),
  },
  (table) => ({
    exerciseIdx: index('personal_records_exercise_idx').on(table.exerciseId),
  }),
);

export type PersonalRecordRow = typeof personalRecords.$inferSelect;
```

Append to `packages/schema/src/index.ts`:

```ts
export * from './routines';
export * from './workouts';
export * from './personalRecords';
```

- [ ] **Step 4: Generate the migration**

Run: `pnpm --filter @overload/schema generate`
Expected: a new `0001_*.sql` containing `CREATE TABLE` for `routines`, `routine_exercises`, `routine_sets`, `workouts`, `workout_exercises`, `sets`, `personal_records`.

- [ ] **Step 5: Write the failing test**

`packages/schema/src/workouts.test.ts`:

```ts
import { and, eq, isNotNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exercises } from './exercises';
import { newId } from './sync';
import { createTestDb, type TestDb } from './testing/memoryDb';
import { sets, workoutExercises, workouts } from './workouts';

let db: TestDb;
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestDb());
});

afterEach(() => close());

function seedWorkoutExercise() {
  const exerciseId = newId();
  const workoutId = newId();
  const workoutExerciseId = newId();

  db.insert(exercises).values({
    id: exerciseId,
    name: 'Back Squat',
    trackingType: 'weight_reps',
    primaryMuscle: 'quads',
    secondaryMuscles: ['glutes'],
    equipment: 'barbell',
  }).run();

  db.insert(workouts).values({
    id: workoutId,
    name: 'Leg Day',
    startedAt: 1_700_000_000_000,
  }).run();

  db.insert(workoutExercises).values({
    id: workoutExerciseId,
    workoutId,
    exerciseId,
    orderIndex: 0,
  }).run();

  return { exerciseId, workoutId, workoutExerciseId };
}

describe('workouts tree', () => {
  it('treats a workout with no endedAt as in progress', () => {
    const { workoutId } = seedWorkoutExercise();
    const [row] = db.select().from(workouts).where(eq(workouts.id, workoutId)).all();
    expect(row?.endedAt).toBeNull();
  });

  it('stores planned sets with a null completedAt', () => {
    const { workoutExerciseId } = seedWorkoutExercise();
    db.insert(sets).values({
      workoutExerciseId,
      orderIndex: 0,
      setType: 'normal',
      weightKg: 100,
      reps: 5,
    }).run();

    const [row] = db.select().from(sets).all();
    expect(row?.completedAt).toBeNull();
    expect(row?.weightKg).toBe(100);
  });

  it('distinguishes completed from planned sets', () => {
    const { workoutExerciseId } = seedWorkoutExercise();
    db.insert(sets).values([
      { id: newId(), workoutExerciseId, orderIndex: 0, weightKg: 100, reps: 5, completedAt: 1_700_000_001_000 },
      { id: newId(), workoutExerciseId, orderIndex: 1, weightKg: 100, reps: 5 },
    ]).run();

    const completed = db.select().from(sets).where(isNotNull(sets.completedAt)).all();
    expect(completed).toHaveLength(1);
    expect(completed[0]?.orderIndex).toBe(0);
  });

  it('groups supersets by a shared integer on workout_exercises', () => {
    const { workoutId, exerciseId } = seedWorkoutExercise();
    db.insert(workoutExercises).values([
      { id: newId(), workoutId, exerciseId, orderIndex: 1, supersetGroup: 1 },
      { id: newId(), workoutId, exerciseId, orderIndex: 2, supersetGroup: 1 },
    ]).run();

    const superset = db
      .select()
      .from(workoutExercises)
      .where(and(eq(workoutExercises.workoutId, workoutId), eq(workoutExercises.supersetGroup, 1)))
      .all();

    expect(superset).toHaveLength(2);
  });

  it('rejects a set whose parent workout_exercise does not exist', () => {
    expect(() =>
      db.insert(sets).values({ workoutExerciseId: newId(), orderIndex: 0 }).run(),
    ).toThrow(/FOREIGN KEY/i);
  });
});
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm vitest run packages/schema`
Expected: PASS, 9 tests across both schema test files.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add routine and workout tables with derived PR cache"
```

---

### Task 6: Exercise library seed pipeline

Turns the public-domain `free-exercise-db` dataset into a committed, curated seed file. The mapping is a pure function so the awkward part — inferring tracking type — is unit tested rather than eyeballed.

**Files:**
- Create: `tools/seed-exercises/package.json`, `tools/seed-exercises/src/map.ts`, `tools/seed-exercises/src/build.ts`
- Generated and committed: `tools/seed-exercises/curated.json`
- Test: `tools/seed-exercises/src/map.test.ts`

**Interfaces:**
- Consumes: `TrackingType`, `NewExercise` from `@overload/schema`
- Produces:
  - `type SourceExercise` — the upstream row shape
  - `inferTrackingType(source: SourceExercise): TrackingType`
  - `mapSourceExercise(source: SourceExercise): SeedExercise`
  - `type SeedExercise = Omit<NewExercise, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>`
  - `curated.json` — a `SeedExercise[]` consumed by the mobile app in Task 10

- [ ] **Step 1: Create the tool package**

`tools/seed-exercises/package.json`:

```json
{
  "name": "@overload/seed-exercises",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsx src/build.ts"
  },
  "dependencies": {
    "@overload/schema": "workspace:*"
  },
  "devDependencies": {
    "tsx": "^4.19.0"
  }
}
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing test**

`tools/seed-exercises/src/map.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { inferTrackingType, mapSourceExercise, type SourceExercise } from './map';

function source(partial: Partial<SourceExercise> = {}): SourceExercise {
  return {
    name: 'Barbell Bench Press',
    equipment: 'barbell',
    category: 'strength',
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps'],
    instructions: ['Lower the bar.', 'Press it up.'],
    ...partial,
  };
}

describe('inferTrackingType', () => {
  it('treats loaded strength work as weight and reps', () => {
    expect(inferTrackingType(source())).toBe('weight_reps');
  });

  it('treats bodyweight strength work as reps only', () => {
    expect(inferTrackingType(source({ name: 'Pull-Up', equipment: 'body only' }))).toBe('reps');
  });

  it('treats cardio as distance and duration', () => {
    expect(inferTrackingType(source({ name: 'Running', category: 'cardio' }))).toBe(
      'distance_duration',
    );
  });

  it('treats stretching as duration', () => {
    expect(inferTrackingType(source({ name: 'Hamstring Stretch', category: 'stretching' }))).toBe(
      'duration',
    );
  });

  it('overrides isometric holds to duration despite being bodyweight strength', () => {
    expect(inferTrackingType(source({ name: 'Plank', equipment: 'body only' }))).toBe('duration');
  });
});

describe('mapSourceExercise', () => {
  it('flattens instructions into a single string', () => {
    expect(mapSourceExercise(source()).instructions).toBe('Lower the bar. Press it up.');
  });

  it('takes the first primary muscle and keeps the rest as secondary', () => {
    const mapped = mapSourceExercise(source({ primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'shoulders'] }));
    expect(mapped.primaryMuscle).toBe('chest');
    expect(mapped.secondaryMuscles).toEqual(['triceps', 'shoulders']);
  });

  it('marks seeded exercises as not custom', () => {
    expect(mapSourceExercise(source()).isCustom).toBe(false);
  });

  it('falls back to "other" when the source has no primary muscle', () => {
    expect(mapSourceExercise(source({ primaryMuscles: [] })).primaryMuscle).toBe('other');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run tools/seed-exercises`
Expected: FAIL — cannot resolve `./map`.

- [ ] **Step 4: Write the mapping**

`tools/seed-exercises/src/map.ts`:

```ts
import type { NewExercise, TrackingType } from '@overload/schema';

/** The upstream row shape from yuhonas/free-exercise-db. */
export type SourceExercise = {
  name: string;
  equipment: string | null;
  category: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
};

export type SeedExercise = Omit<NewExercise, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

const BODYWEIGHT = new Set(['body only', 'none', null]);

/**
 * Isometric holds are bodyweight strength work by the dataset's categories but
 * are logged as time, not reps. Matched on a name fragment, lowercased.
 */
const DURATION_NAME_HINTS = ['plank', 'hold', 'hang', 'wall sit', 'l-sit', 'isometric'];

export function inferTrackingType(source: SourceExercise): TrackingType {
  const name = source.name.toLowerCase();
  if (DURATION_NAME_HINTS.some((hint) => name.includes(hint))) return 'duration';
  if (source.category === 'cardio') return 'distance_duration';
  if (source.category === 'stretching') return 'duration';
  if (BODYWEIGHT.has(source.equipment)) return 'reps';
  return 'weight_reps';
}

export function mapSourceExercise(source: SourceExercise): SeedExercise {
  return {
    name: source.name,
    trackingType: inferTrackingType(source),
    primaryMuscle: source.primaryMuscles[0] ?? 'other',
    secondaryMuscles: source.secondaryMuscles,
    equipment: source.equipment ?? 'none',
    instructions: source.instructions.join(' ') || null,
    isCustom: false,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run tools/seed-exercises`
Expected: PASS, 9 tests.

- [ ] **Step 6: Write the build script**

`tools/seed-exercises/src/build.ts`:

```ts
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapSourceExercise, type SeedExercise, type SourceExercise } from './map';

const SOURCE_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';

/**
 * The upstream set is ~870 entries including many near-duplicate machine
 * variations. We keep the equipment categories people actually log and cap the
 * result, which lands near 300 without hand-listing every exercise.
 */
const KEEP_EQUIPMENT = new Set([
  'barbell', 'dumbbell', 'cable', 'machine', 'body only', 'kettlebells',
  'e-z curl bar', 'bands', 'medicine ball', 'exercise ball', 'none',
]);

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../curated.json');

async function main() {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`Failed to fetch source: ${response.status}`);

  const source = (await response.json()) as SourceExercise[];

  const seen = new Set<string>();
  const curated: SeedExercise[] = [];

  for (const row of source) {
    if (!KEEP_EQUIPMENT.has(row.equipment ?? 'none')) continue;
    const key = row.name.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    curated.push(mapSourceExercise(row));
  }

  curated.sort((a, b) => a.name.localeCompare(b.name));

  await writeFile(OUT, `${JSON.stringify(curated, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${curated.length} exercises to ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 7: Generate the seed file and sanity-check it**

Run: `pnpm --filter @overload/seed-exercises build`
Expected: prints a count. Then verify manually:

```bash
node -e "const e=require('./tools/seed-exercises/curated.json'); console.log(e.length); console.log(e.filter(x=>x.trackingType==='weight_reps').length, 'weight_reps'); console.log(e.find(x=>x.name.includes('Plank')))"
```

Expected: a few hundred exercises, the majority `weight_reps`, and Plank showing `trackingType: "duration"`. If the count is wildly off (under 150 or over 500), adjust `KEEP_EQUIPMENT` and rerun.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add exercise library seed pipeline with curated dataset"
```

---

### Task 7: Exercise and routine repositories

The first repositories. Every read filters tombstones; nothing outside this layer writes SQL.

**Files:**
- Create: `packages/schema/src/db.ts`
- Create: `apps/mobile/package.json`, `apps/mobile/tsconfig.json`
- Create: `apps/mobile/src/data/exerciseRepo.ts`, `apps/mobile/src/data/routineRepo.ts`
- Modify: `packages/schema/src/index.ts`
- Test: `apps/mobile/src/data/exerciseRepo.test.ts`, `apps/mobile/src/data/routineRepo.test.ts`

**Interfaces:**
- Consumes: all tables from Tasks 4–5, `createTestDb` from `@overload/schema/testing`
- Produces:
  - `type Db = BaseSQLiteDatabase<'sync', any, typeof schema>` — the one database type both expo-sqlite and better-sqlite3 satisfy
  - `listExercises(db: Db, opts?: { search?: string; limit?: number }): Exercise[]`
  - `getExercise(db: Db, id: string): Exercise | undefined`
  - `createCustomExercise(db: Db, input: { name: string; trackingType: TrackingType; primaryMuscle: string; equipment: string }): Exercise`
  - `listRoutines(db: Db): Routine[]`
  - `createRoutine(db: Db, name: string): Routine`
  - `addExerciseToRoutine(db: Db, routineId: string, exerciseId: string): RoutineExercise`
  - `addRoutineSet(db: Db, routineExerciseId: string, values: { targetReps?: number; targetWeightKg?: number }): RoutineSet`
  - `getRoutineDetail(db: Db, routineId: string): RoutineDetail | undefined`
  - `type RoutineDetail = { routine: Routine; exercises: RoutineDetailExercise[] }`
  - `type RoutineDetailExercise = { routineExercise: RoutineExercise; exercise: Exercise; sets: RoutineSet[] }`
  - `softDeleteRoutine(db: Db, routineId: string): void`

- [ ] **Step 1: Add the shared Db type**

`packages/schema/src/db.ts`:

```ts
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from './index';

/**
 * Both the Expo driver and better-sqlite3 produce a synchronous SQLite
 * database. Typing repositories against the base means the same code runs
 * on device and in Node tests.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the driver's
// run-result type differs per driver; repositories never touch it.
export type Db = BaseSQLiteDatabase<'sync', any, typeof schema>;
```

Append to `packages/schema/src/index.ts`:

```ts
export type { Db } from './db';
```

- [ ] **Step 2: Create the mobile package**

`apps/mobile/package.json` (Expo dependencies are added in Task 10; only what the repositories need is required now):

```json
{
  "name": "@overload/mobile",
  "version": "0.0.0",
  "private": true,
  "main": "expo-router/entry",
  "dependencies": {
    "@overload/domain": "workspace:*",
    "@overload/schema": "workspace:*",
    "drizzle-orm": "^0.36.0"
  }
}
```

`apps/mobile/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx" },
  "include": ["src", "app"]
}
```

Run: `pnpm install`

- [ ] **Step 3: Write the failing exercise repository test**

`apps/mobile/src/data/exerciseRepo.test.ts`:

```ts
import { exercises, newId, now } from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCustomExercise, getExercise, listExercises } from './exerciseRepo';

let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestDb());
  db.insert(exercises).values([
    { id: newId(), name: 'Barbell Bench Press', trackingType: 'weight_reps', primaryMuscle: 'chest', secondaryMuscles: [], equipment: 'barbell' },
    { id: newId(), name: 'Incline Dumbbell Press', trackingType: 'weight_reps', primaryMuscle: 'chest', secondaryMuscles: [], equipment: 'dumbbell' },
    { id: newId(), name: 'Back Squat', trackingType: 'weight_reps', primaryMuscle: 'quads', secondaryMuscles: [], equipment: 'barbell' },
  ]).run();
});

afterEach(() => close());

describe('listExercises', () => {
  it('returns every live exercise sorted by name', () => {
    const names = listExercises(db).map((e) => e.name);
    expect(names).toEqual(['Back Squat', 'Barbell Bench Press', 'Incline Dumbbell Press']);
  });

  it('filters by a case-insensitive substring search', () => {
    expect(listExercises(db, { search: 'press' }).map((e) => e.name)).toEqual([
      'Barbell Bench Press',
      'Incline Dumbbell Press',
    ]);
  });

  it('respects the limit', () => {
    expect(listExercises(db, { limit: 2 })).toHaveLength(2);
  });

  it('excludes tombstoned rows', () => {
    const [first] = listExercises(db);
    db.update(exercises).set({ deletedAt: now() }).where(eq(exercises.id, first!.id)).run();
    expect(listExercises(db).map((e) => e.name)).not.toContain(first!.name);
  });
});

describe('getExercise', () => {
  it('returns the exercise by id', () => {
    const [first] = listExercises(db);
    expect(getExercise(db, first!.id)?.name).toBe(first!.name);
  });

  it('returns undefined for an unknown id', () => {
    expect(getExercise(db, newId())).toBeUndefined();
  });

  it('returns undefined for a tombstoned exercise', () => {
    const [first] = listExercises(db);
    db.update(exercises).set({ deletedAt: now() }).where(eq(exercises.id, first!.id)).run();
    expect(getExercise(db, first!.id)).toBeUndefined();
  });
});

describe('createCustomExercise', () => {
  it('inserts a custom exercise and returns it', () => {
    const created = createCustomExercise(db, {
      name: 'Reverse Nordic Curl',
      trackingType: 'reps',
      primaryMuscle: 'quads',
      equipment: 'body only',
    });

    expect(created.isCustom).toBe(true);
    expect(created.id).toBeTruthy();
    expect(getExercise(db, created.id)?.name).toBe('Reverse Nordic Curl');
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm vitest run apps/mobile/src/data/exerciseRepo.test.ts`
Expected: FAIL — cannot resolve `./exerciseRepo`.

- [ ] **Step 5: Implement the exercise repository**

`apps/mobile/src/data/exerciseRepo.ts`:

```ts
import {
  exercises,
  newId,
  now,
  type Db,
  type Exercise,
  type TrackingType,
} from '@overload/schema';
import { and, asc, eq, isNull, like } from 'drizzle-orm';

export function listExercises(
  db: Db,
  opts: { search?: string; limit?: number } = {},
): Exercise[] {
  const filters = [isNull(exercises.deletedAt)];
  if (opts.search) filters.push(like(exercises.name, `%${opts.search}%`));

  const query = db.select().from(exercises).where(and(...filters)).orderBy(asc(exercises.name));
  return opts.limit ? query.limit(opts.limit).all() : query.all();
}

export function getExercise(db: Db, id: string): Exercise | undefined {
  return db
    .select()
    .from(exercises)
    .where(and(eq(exercises.id, id), isNull(exercises.deletedAt)))
    .get();
}

export function createCustomExercise(
  db: Db,
  input: { name: string; trackingType: TrackingType; primaryMuscle: string; equipment: string },
): Exercise {
  const timestamp = now();
  const row = {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    name: input.name,
    trackingType: input.trackingType,
    primaryMuscle: input.primaryMuscle,
    secondaryMuscles: [],
    equipment: input.equipment,
    instructions: null,
    isCustom: true,
  };

  db.insert(exercises).values(row).run();
  return row;
}
```

Note: SQLite's `LIKE` is case-insensitive for ASCII by default, which is what the search test relies on.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm vitest run apps/mobile/src/data/exerciseRepo.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 7: Write the failing routine repository test**

`apps/mobile/src/data/routineRepo.test.ts`:

```ts
import { exercises, newId, type Exercise } from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addExerciseToRoutine,
  addRoutineSet,
  createRoutine,
  getRoutineDetail,
  listRoutines,
  softDeleteRoutine,
} from './routineRepo';

let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;
let bench: Exercise;
let squat: Exercise;

beforeEach(() => {
  ({ db, close } = createTestDb());
  const rows = [
    { id: newId(), name: 'Bench Press', trackingType: 'weight_reps' as const, primaryMuscle: 'chest', secondaryMuscles: [], equipment: 'barbell' },
    { id: newId(), name: 'Back Squat', trackingType: 'weight_reps' as const, primaryMuscle: 'quads', secondaryMuscles: [], equipment: 'barbell' },
  ];
  db.insert(exercises).values(rows).run();
  [bench, squat] = rows as unknown as [Exercise, Exercise];
});

afterEach(() => close());

describe('createRoutine and listRoutines', () => {
  it('creates a routine and lists it', () => {
    createRoutine(db, 'Push Day');
    expect(listRoutines(db).map((r) => r.name)).toEqual(['Push Day']);
  });

  it('excludes tombstoned routines', () => {
    const routine = createRoutine(db, 'Push Day');
    softDeleteRoutine(db, routine.id);
    expect(listRoutines(db)).toHaveLength(0);
  });
});

describe('getRoutineDetail', () => {
  it('returns undefined for an unknown routine', () => {
    expect(getRoutineDetail(db, newId())).toBeUndefined();
  });

  it('assigns sequential order indexes as exercises are added', () => {
    const routine = createRoutine(db, 'Push Day');
    addExerciseToRoutine(db, routine.id, bench.id);
    addExerciseToRoutine(db, routine.id, squat.id);

    const detail = getRoutineDetail(db, routine.id);
    expect(detail?.exercises.map((e) => e.routineExercise.orderIndex)).toEqual([0, 1]);
    expect(detail?.exercises.map((e) => e.exercise.name)).toEqual(['Bench Press', 'Back Squat']);
  });

  it('nests target sets under their exercise in order', () => {
    const routine = createRoutine(db, 'Push Day');
    const re = addExerciseToRoutine(db, routine.id, bench.id);
    addRoutineSet(db, re.id, { targetReps: 8, targetWeightKg: 80 });
    addRoutineSet(db, re.id, { targetReps: 6, targetWeightKg: 90 });

    const detail = getRoutineDetail(db, routine.id);
    expect(detail?.exercises[0]?.sets.map((s) => s.targetReps)).toEqual([8, 6]);
    expect(detail?.exercises[0]?.sets.map((s) => s.orderIndex)).toEqual([0, 1]);
  });

  it('returns a routine with no exercises as an empty list, not undefined', () => {
    const routine = createRoutine(db, 'Empty');
    expect(getRoutineDetail(db, routine.id)?.exercises).toEqual([]);
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `pnpm vitest run apps/mobile/src/data/routineRepo.test.ts`
Expected: FAIL — cannot resolve `./routineRepo`.

- [ ] **Step 9: Implement the routine repository**

`apps/mobile/src/data/routineRepo.ts`:

```ts
import {
  exercises,
  newId,
  now,
  routineExercises,
  routineSets,
  routines,
  type Db,
  type Exercise,
  type Routine,
  type RoutineExercise,
  type RoutineSet,
} from '@overload/schema';
import { and, asc, eq, isNull } from 'drizzle-orm';

export type RoutineDetailExercise = {
  routineExercise: RoutineExercise;
  exercise: Exercise;
  sets: RoutineSet[];
};

export type RoutineDetail = {
  routine: Routine;
  exercises: RoutineDetailExercise[];
};

export function listRoutines(db: Db): Routine[] {
  return db
    .select()
    .from(routines)
    .where(isNull(routines.deletedAt))
    .orderBy(asc(routines.orderIndex), asc(routines.createdAt))
    .all();
}

export function createRoutine(db: Db, name: string): Routine {
  const timestamp = now();
  const row = {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    name,
    notes: null,
    orderIndex: listRoutines(db).length,
  };
  db.insert(routines).values(row).run();
  return row;
}

export function softDeleteRoutine(db: Db, routineId: string): void {
  db.update(routines).set({ deletedAt: now(), updatedAt: now() }).where(eq(routines.id, routineId)).run();
}

export function addExerciseToRoutine(
  db: Db,
  routineId: string,
  exerciseId: string,
): RoutineExercise {
  const siblings = db
    .select()
    .from(routineExercises)
    .where(and(eq(routineExercises.routineId, routineId), isNull(routineExercises.deletedAt)))
    .all();

  const timestamp = now();
  const row = {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    routineId,
    exerciseId,
    orderIndex: siblings.length,
    notes: null,
    restSeconds: null,
    supersetGroup: null,
  };

  db.insert(routineExercises).values(row).run();
  return row;
}

export function addRoutineSet(
  db: Db,
  routineExerciseId: string,
  values: { targetReps?: number; targetWeightKg?: number } = {},
): RoutineSet {
  const siblings = db
    .select()
    .from(routineSets)
    .where(and(eq(routineSets.routineExerciseId, routineExerciseId), isNull(routineSets.deletedAt)))
    .all();

  const timestamp = now();
  const row = {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    routineExerciseId,
    orderIndex: siblings.length,
    setType: 'normal' as const,
    targetReps: values.targetReps ?? null,
    targetWeightKg: values.targetWeightKg ?? null,
    targetRpe: null,
  };

  db.insert(routineSets).values(row).run();
  return row;
}

export function getRoutineDetail(db: Db, routineId: string): RoutineDetail | undefined {
  const routine = db
    .select()
    .from(routines)
    .where(and(eq(routines.id, routineId), isNull(routines.deletedAt)))
    .get();

  if (!routine) return undefined;

  const joined = db
    .select({ routineExercise: routineExercises, exercise: exercises })
    .from(routineExercises)
    .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
    .where(and(eq(routineExercises.routineId, routineId), isNull(routineExercises.deletedAt)))
    .orderBy(asc(routineExercises.orderIndex))
    .all();

  const detailExercises = joined.map(({ routineExercise, exercise }) => ({
    routineExercise,
    exercise,
    sets: db
      .select()
      .from(routineSets)
      .where(
        and(
          eq(routineSets.routineExerciseId, routineExercise.id),
          isNull(routineSets.deletedAt),
        ),
      )
      .orderBy(asc(routineSets.orderIndex))
      .all(),
  }));

  return { routine, exercises: detailExercises };
}
```

- [ ] **Step 10: Run the full suite to verify it passes**

Run: `pnpm vitest run`
Expected: PASS across domain, schema, seed tool, and both repositories.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add exercise and routine repositories"
```

---

### Task 8: Session repository — starting a workout

Starting a routine **copies** it into a workout tree. This is the mechanism that keeps logged history immutable when a template is later edited, so the copy semantics are what the tests pin down.

**Files:**
- Create: `apps/mobile/src/data/sessionRepo.ts`
- Test: `apps/mobile/src/data/sessionRepo.start.test.ts`

**Interfaces:**
- Consumes: `getRoutineDetail` from Task 7, all workout tables from Task 5
- Produces:
  - `startWorkoutFromRoutine(db: Db, routineId: string, at: number): string` — returns the new workout id
  - `startEmptyWorkout(db: Db, name: string, at: number): string`
  - `getActiveWorkoutId(db: Db): string | undefined`
  - `getWorkoutDetail(db: Db, workoutId: string): WorkoutDetail | undefined`
  - `type WorkoutDetailExercise = { workoutExercise: WorkoutExercise; exercise: Exercise; sets: WorkoutSet[] }`
  - `type WorkoutDetail = { workout: Workout; exercises: WorkoutDetailExercise[] }`

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/data/sessionRepo.start.test.ts`:

```ts
import { exercises, newId, routineSets, type Exercise } from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addExerciseToRoutine, addRoutineSet, createRoutine } from './routineRepo';
import {
  getActiveWorkoutId,
  getWorkoutDetail,
  startEmptyWorkout,
  startWorkoutFromRoutine,
} from './sessionRepo';

const AT = 1_700_000_000_000;

let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;
let bench: Exercise;

beforeEach(() => {
  ({ db, close } = createTestDb());
  const row = {
    id: newId(),
    name: 'Bench Press',
    trackingType: 'weight_reps' as const,
    primaryMuscle: 'chest',
    secondaryMuscles: [],
    equipment: 'barbell',
  };
  db.insert(exercises).values(row).run();
  bench = row as unknown as Exercise;
});

afterEach(() => close());

function pushDay() {
  const routine = createRoutine(db, 'Push Day');
  const re = addExerciseToRoutine(db, routine.id, bench.id);
  addRoutineSet(db, re.id, { targetReps: 8, targetWeightKg: 80 });
  addRoutineSet(db, re.id, { targetReps: 6, targetWeightKg: 90 });
  return routine;
}

describe('startWorkoutFromRoutine', () => {
  it('names the workout after the routine and records the start time', () => {
    const routine = pushDay();
    const detail = getWorkoutDetail(db, startWorkoutFromRoutine(db, routine.id, AT));

    expect(detail?.workout.name).toBe('Push Day');
    expect(detail?.workout.startedAt).toBe(AT);
    expect(detail?.workout.endedAt).toBeNull();
    expect(detail?.workout.routineId).toBe(routine.id);
  });

  it('copies planned sets with targets pre-filled and completedAt null', () => {
    const routine = pushDay();
    const detail = getWorkoutDetail(db, startWorkoutFromRoutine(db, routine.id, AT));
    const sets = detail!.exercises[0]!.sets;

    expect(sets.map((s) => s.reps)).toEqual([8, 6]);
    expect(sets.map((s) => s.weightKg)).toEqual([80, 90]);
    expect(sets.every((s) => s.completedAt === null)).toBe(true);
  });

  it('is a copy: editing the routine afterwards does not change the workout', () => {
    const routine = pushDay();
    const workoutId = startWorkoutFromRoutine(db, routine.id, AT);

    db.update(routineSets).set({ targetReps: 99 }).where(eq(routineSets.targetReps, 8)).run();

    const sets = getWorkoutDetail(db, workoutId)!.exercises[0]!.sets;
    expect(sets.map((s) => s.reps)).toEqual([8, 6]);
  });

  it('throws for an unknown routine', () => {
    expect(() => startWorkoutFromRoutine(db, newId(), AT)).toThrow(/routine not found/i);
  });
});

describe('startEmptyWorkout', () => {
  it('creates a workout with no routine and no exercises', () => {
    const detail = getWorkoutDetail(db, startEmptyWorkout(db, 'Freestyle', AT));
    expect(detail?.workout.routineId).toBeNull();
    expect(detail?.exercises).toEqual([]);
  });
});

describe('getActiveWorkoutId', () => {
  it('returns undefined when nothing is in progress', () => {
    expect(getActiveWorkoutId(db)).toBeUndefined();
  });

  it('returns the workout that has no endedAt', () => {
    const workoutId = startEmptyWorkout(db, 'Freestyle', AT);
    expect(getActiveWorkoutId(db)).toBe(workoutId);
  });

  it('returns the most recently started one if several are unfinished', () => {
    startEmptyWorkout(db, 'Older', AT);
    const newer = startEmptyWorkout(db, 'Newer', AT + 1000);
    expect(getActiveWorkoutId(db)).toBe(newer);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run apps/mobile/src/data/sessionRepo.start.test.ts`
Expected: FAIL — cannot resolve `./sessionRepo`.

- [ ] **Step 3: Implement starting and reading a workout**

`apps/mobile/src/data/sessionRepo.ts`:

```ts
import {
  exercises,
  newId,
  now,
  sets,
  workoutExercises,
  workouts,
  type Db,
  type Exercise,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
} from '@overload/schema';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { getRoutineDetail } from './routineRepo';

export type WorkoutDetailExercise = {
  workoutExercise: WorkoutExercise;
  exercise: Exercise;
  sets: WorkoutSet[];
};

export type WorkoutDetail = {
  workout: Workout;
  exercises: WorkoutDetailExercise[];
};

function timestamps(at: number) {
  return { createdAt: at, updatedAt: at, deletedAt: null };
}

/**
 * Copies the routine into a fresh workout tree. Targets become pre-filled
 * values on planned sets, so the lifter edits a number rather than typing one.
 */
export function startWorkoutFromRoutine(db: Db, routineId: string, at: number): string {
  const detail = getRoutineDetail(db, routineId);
  if (!detail) throw new Error(`Routine not found: ${routineId}`);

  const workoutId = newId();

  db.transaction((tx) => {
    tx.insert(workouts).values({
      id: workoutId,
      ...timestamps(at),
      routineId,
      name: detail.routine.name,
      startedAt: at,
      endedAt: null,
      notes: null,
    }).run();

    for (const entry of detail.exercises) {
      const workoutExerciseId = newId();

      tx.insert(workoutExercises).values({
        id: workoutExerciseId,
        ...timestamps(at),
        workoutId,
        exerciseId: entry.exercise.id,
        orderIndex: entry.routineExercise.orderIndex,
        notes: entry.routineExercise.notes,
        restSeconds: entry.routineExercise.restSeconds,
        supersetGroup: entry.routineExercise.supersetGroup,
      }).run();

      for (const plannedSet of entry.sets) {
        tx.insert(sets).values({
          id: newId(),
          ...timestamps(at),
          workoutExerciseId,
          orderIndex: plannedSet.orderIndex,
          setType: plannedSet.setType,
          weightKg: plannedSet.targetWeightKg,
          reps: plannedSet.targetReps,
          durationSeconds: null,
          distanceM: null,
          rpe: null,
          rir: null,
          completedAt: null,
        }).run();
      }
    }
  });

  return workoutId;
}

export function startEmptyWorkout(db: Db, name: string, at: number): string {
  const workoutId = newId();
  db.insert(workouts).values({
    id: workoutId,
    ...timestamps(at),
    routineId: null,
    name,
    startedAt: at,
    endedAt: null,
    notes: null,
  }).run();
  return workoutId;
}

/** A workout with no endedAt is in progress. This is what powers crash recovery. */
export function getActiveWorkoutId(db: Db): string | undefined {
  return db
    .select({ id: workouts.id })
    .from(workouts)
    .where(and(isNull(workouts.endedAt), isNull(workouts.deletedAt)))
    .orderBy(desc(workouts.startedAt))
    .get()?.id;
}

export function getWorkoutDetail(db: Db, workoutId: string): WorkoutDetail | undefined {
  const workout = db
    .select()
    .from(workouts)
    .where(and(eq(workouts.id, workoutId), isNull(workouts.deletedAt)))
    .get();

  if (!workout) return undefined;

  const joined = db
    .select({ workoutExercise: workoutExercises, exercise: exercises })
    .from(workoutExercises)
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(and(eq(workoutExercises.workoutId, workoutId), isNull(workoutExercises.deletedAt)))
    .orderBy(asc(workoutExercises.orderIndex))
    .all();

  const detailExercises = joined.map(({ workoutExercise, exercise }) => ({
    workoutExercise,
    exercise,
    sets: db
      .select()
      .from(sets)
      .where(and(eq(sets.workoutExerciseId, workoutExercise.id), isNull(sets.deletedAt)))
      .orderBy(asc(sets.orderIndex))
      .all(),
  }));

  return { workout, exercises: detailExercises };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run apps/mobile/src/data/sessionRepo.start.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: start workouts by copying a routine into a workout tree"
```

---

### Task 9: Session repository — logging sets, previous performance, and finishing

The write path used during a live session, plus the query behind "last time you did 80 kg × 8".

**Files:**
- Modify: `apps/mobile/src/data/sessionRepo.ts`
- Test: `apps/mobile/src/data/sessionRepo.logging.test.ts`

**Interfaces:**
- Consumes: everything from Task 8; `computePersonalRecords`, `CompletedSet` from `@overload/domain`
- Produces:
  - `completeSet(db: Db, setId: string, values: SetValues, at: number): void`
  - `type SetValues = { weightKg?: number | null; reps?: number | null; durationSeconds?: number | null; rpe?: number | null; rir?: number | null }`
  - `uncompleteSet(db: Db, setId: string): void`
  - `addSet(db: Db, workoutExerciseId: string, at: number): WorkoutSet`
  - `addExerciseToWorkout(db: Db, workoutId: string, exerciseId: string, at: number): WorkoutExercise`
  - `lastPerformance(db: Db, exerciseId: string, excludeWorkoutId: string): CompletedSet[]`
  - `finishWorkout(db: Db, workoutId: string, at: number): void`
  - `listPersonalRecords(db: Db, exerciseId: string): PersonalRecordRow[]`

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/data/sessionRepo.logging.test.ts`:

```ts
import { exercises, newId, workouts, type Exercise } from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addExerciseToWorkout,
  addSet,
  completeSet,
  finishWorkout,
  getWorkoutDetail,
  lastPerformance,
  listPersonalRecords,
  startEmptyWorkout,
  uncompleteSet,
} from './sessionRepo';

const AT = 1_700_000_000_000;

let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;
let bench: Exercise;

beforeEach(() => {
  ({ db, close } = createTestDb());
  const row = {
    id: newId(),
    name: 'Bench Press',
    trackingType: 'weight_reps' as const,
    primaryMuscle: 'chest',
    secondaryMuscles: [],
    equipment: 'barbell',
  };
  db.insert(exercises).values(row).run();
  bench = row as unknown as Exercise;
});

afterEach(() => close());

/** Logs one finished workout of `weightKg` x `reps` and returns its id. */
function loggedWorkout(weightKg: number, reps: number, at: number): string {
  const workoutId = startEmptyWorkout(db, 'Session', at);
  const we = addExerciseToWorkout(db, workoutId, bench.id, at);
  const set = addSet(db, we.id, at);
  completeSet(db, set.id, { weightKg, reps }, at);
  finishWorkout(db, workoutId, at + 1000);
  return workoutId;
}

describe('completeSet', () => {
  it('stamps completedAt and stores the logged values', () => {
    const workoutId = startEmptyWorkout(db, 'Session', AT);
    const we = addExerciseToWorkout(db, workoutId, bench.id, AT);
    const set = addSet(db, we.id, AT);

    completeSet(db, set.id, { weightKg: 100, reps: 5 }, AT + 60_000);

    const stored = getWorkoutDetail(db, workoutId)!.exercises[0]!.sets[0]!;
    expect(stored.completedAt).toBe(AT + 60_000);
    expect(stored.weightKg).toBe(100);
    expect(stored.reps).toBe(5);
  });

  it('leaves values untouched when they are omitted', () => {
    const workoutId = startEmptyWorkout(db, 'Session', AT);
    const we = addExerciseToWorkout(db, workoutId, bench.id, AT);
    const set = addSet(db, we.id, AT);

    completeSet(db, set.id, { weightKg: 100, reps: 5 }, AT);
    completeSet(db, set.id, { reps: 6 }, AT + 1000);

    const stored = getWorkoutDetail(db, workoutId)!.exercises[0]!.sets[0]!;
    expect(stored.weightKg).toBe(100);
    expect(stored.reps).toBe(6);
  });
});

describe('uncompleteSet', () => {
  it('clears completedAt but keeps the entered values', () => {
    const workoutId = startEmptyWorkout(db, 'Session', AT);
    const we = addExerciseToWorkout(db, workoutId, bench.id, AT);
    const set = addSet(db, we.id, AT);
    completeSet(db, set.id, { weightKg: 100, reps: 5 }, AT);

    uncompleteSet(db, set.id);

    const stored = getWorkoutDetail(db, workoutId)!.exercises[0]!.sets[0]!;
    expect(stored.completedAt).toBeNull();
    expect(stored.weightKg).toBe(100);
  });
});

describe('addSet', () => {
  it('appends with the next order index', () => {
    const workoutId = startEmptyWorkout(db, 'Session', AT);
    const we = addExerciseToWorkout(db, workoutId, bench.id, AT);
    addSet(db, we.id, AT);
    addSet(db, we.id, AT);

    const stored = getWorkoutDetail(db, workoutId)!.exercises[0]!.sets;
    expect(stored.map((s) => s.orderIndex)).toEqual([0, 1]);
  });
});

describe('lastPerformance', () => {
  it('returns nothing when the exercise has never been logged', () => {
    const workoutId = startEmptyWorkout(db, 'Session', AT);
    expect(lastPerformance(db, bench.id, workoutId)).toEqual([]);
  });

  it('returns completed sets from the most recent other workout', () => {
    loggedWorkout(90, 5, AT - 200_000);
    loggedWorkout(100, 5, AT - 100_000);
    const current = startEmptyWorkout(db, 'Today', AT);

    const previous = lastPerformance(db, bench.id, current);
    expect(previous).toHaveLength(1);
    expect(previous[0]?.weightKg).toBe(100);
  });

  it('never returns sets from the current workout', () => {
    const workoutId = startEmptyWorkout(db, 'Today', AT);
    const we = addExerciseToWorkout(db, workoutId, bench.id, AT);
    const set = addSet(db, we.id, AT);
    completeSet(db, set.id, { weightKg: 120, reps: 3 }, AT);

    expect(lastPerformance(db, bench.id, workoutId)).toEqual([]);
  });

  it('ignores sets that were never completed', () => {
    const workoutId = startEmptyWorkout(db, 'Older', AT - 100_000);
    const we = addExerciseToWorkout(db, workoutId, bench.id, AT - 100_000);
    addSet(db, we.id, AT - 100_000);
    finishWorkout(db, workoutId, AT - 90_000);

    const current = startEmptyWorkout(db, 'Today', AT);
    expect(lastPerformance(db, bench.id, current)).toEqual([]);
  });
});

describe('finishWorkout', () => {
  it('stamps endedAt', () => {
    const workoutId = startEmptyWorkout(db, 'Session', AT);
    finishWorkout(db, workoutId, AT + 3_600_000);

    const stored = db.select().from(workouts).where(eq(workouts.id, workoutId)).get();
    expect(stored?.endedAt).toBe(AT + 3_600_000);
  });

  it('recomputes personal records across all history', () => {
    loggedWorkout(100, 5, AT - 100_000);
    loggedWorkout(110, 5, AT);

    const records = listPersonalRecords(db, bench.id);
    const maxWeight = records.find((r) => r.type === 'max_weight');
    expect(maxWeight?.value).toBe(110);
  });

  it('replaces stale records rather than accumulating duplicates', () => {
    loggedWorkout(100, 5, AT - 100_000);
    const firstCount = listPersonalRecords(db, bench.id).length;

    loggedWorkout(110, 5, AT);
    expect(listPersonalRecords(db, bench.id)).toHaveLength(firstCount);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run apps/mobile/src/data/sessionRepo.logging.test.ts`
Expected: FAIL — `completeSet` is not exported.

- [ ] **Step 3: Extend the session repository**

Add to the imports at the top of `apps/mobile/src/data/sessionRepo.ts`:

```ts
import { computePersonalRecords, type CompletedSet } from '@overload/domain';
import { personalRecords, type PersonalRecordRow } from '@overload/schema';
import { inArray, isNotNull } from 'drizzle-orm';
```

Append to `apps/mobile/src/data/sessionRepo.ts`:

```ts
export type SetValues = {
  weightKg?: number | null;
  reps?: number | null;
  durationSeconds?: number | null;
  rpe?: number | null;
  rir?: number | null;
};

export function addExerciseToWorkout(
  db: Db,
  workoutId: string,
  exerciseId: string,
  at: number,
): WorkoutExercise {
  const siblings = db
    .select()
    .from(workoutExercises)
    .where(and(eq(workoutExercises.workoutId, workoutId), isNull(workoutExercises.deletedAt)))
    .all();

  const row = {
    id: newId(),
    ...timestamps(at),
    workoutId,
    exerciseId,
    orderIndex: siblings.length,
    notes: null,
    restSeconds: null,
    supersetGroup: null,
  };

  db.insert(workoutExercises).values(row).run();
  return row;
}

export function addSet(db: Db, workoutExerciseId: string, at: number): WorkoutSet {
  const siblings = db
    .select()
    .from(sets)
    .where(and(eq(sets.workoutExerciseId, workoutExerciseId), isNull(sets.deletedAt)))
    .all();

  const previous = siblings[siblings.length - 1];

  const row = {
    id: newId(),
    ...timestamps(at),
    workoutExerciseId,
    orderIndex: siblings.length,
    setType: 'normal' as const,
    // Carry the last set's load forward — almost always what the next set uses.
    weightKg: previous?.weightKg ?? null,
    reps: previous?.reps ?? null,
    durationSeconds: null,
    distanceM: null,
    rpe: null,
    rir: null,
    completedAt: null,
  };

  db.insert(sets).values(row).run();
  return row;
}

/**
 * Writes through immediately — this is the whole crash-safety story. Omitted
 * fields are left as they are so a partial edit never blanks a logged value.
 */
export function completeSet(db: Db, setId: string, values: SetValues, at: number): void {
  const patch: Record<string, unknown> = { completedAt: at, updatedAt: at };
  for (const key of ['weightKg', 'reps', 'durationSeconds', 'rpe', 'rir'] as const) {
    if (values[key] !== undefined) patch[key] = values[key];
  }
  db.update(sets).set(patch).where(eq(sets.id, setId)).run();
}

export function uncompleteSet(db: Db, setId: string): void {
  db.update(sets).set({ completedAt: null, updatedAt: now() }).where(eq(sets.id, setId)).run();
}

function toCompletedSet(row: WorkoutSet, exerciseId: string): CompletedSet {
  return {
    id: row.id,
    exerciseId,
    setType: row.setType,
    weightKg: row.weightKg,
    reps: row.reps,
    durationSeconds: row.durationSeconds,
    completedAt: row.completedAt!,
  };
}

/** Completed sets for this exercise from the most recent workout that is not the current one. */
export function lastPerformance(
  db: Db,
  exerciseId: string,
  excludeWorkoutId: string,
): CompletedSet[] {
  const previousWorkout = db
    .select({ workoutId: workouts.id })
    .from(sets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(
      and(
        eq(workoutExercises.exerciseId, exerciseId),
        isNotNull(sets.completedAt),
        isNull(sets.deletedAt),
        isNull(workouts.deletedAt),
      ),
    )
    .orderBy(desc(workouts.startedAt))
    .all()
    .find((row) => row.workoutId !== excludeWorkoutId);

  if (!previousWorkout) return [];

  return db
    .select({ set: sets })
    .from(sets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
    .where(
      and(
        eq(workoutExercises.workoutId, previousWorkout.workoutId),
        eq(workoutExercises.exerciseId, exerciseId),
        isNotNull(sets.completedAt),
        isNull(sets.deletedAt),
      ),
    )
    .orderBy(asc(sets.orderIndex))
    .all()
    .map(({ set }) => toCompletedSet(set, exerciseId));
}

function allCompletedSets(db: Db, exerciseIds: string[]): CompletedSet[] {
  if (exerciseIds.length === 0) return [];

  return db
    .select({ set: sets, exerciseId: workoutExercises.exerciseId })
    .from(sets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(
      and(
        inArray(workoutExercises.exerciseId, exerciseIds),
        isNotNull(sets.completedAt),
        isNull(sets.deletedAt),
        isNull(workouts.deletedAt),
      ),
    )
    .all()
    .map(({ set, exerciseId }) => toCompletedSet(set, exerciseId));
}

/**
 * Rebuilds the derived record cache for the given exercises. Deletes first —
 * this is a cache, so stale rows must never survive a recompute.
 */
function recomputePersonalRecords(db: Db, exerciseIds: string[]): void {
  if (exerciseIds.length === 0) return;

  const records = computePersonalRecords(allCompletedSets(db, exerciseIds));

  db.transaction((tx) => {
    tx.delete(personalRecords).where(inArray(personalRecords.exerciseId, exerciseIds)).run();
    if (records.length === 0) return;
    tx.insert(personalRecords).values(
      records.map((record) => ({
        id: newId(),
        exerciseId: record.exerciseId,
        type: record.type,
        value: record.value,
        setId: record.setId,
        achievedAt: record.achievedAt,
      })),
    ).run();
  });
}

export function finishWorkout(db: Db, workoutId: string, at: number): void {
  db.update(workouts).set({ endedAt: at, updatedAt: at }).where(eq(workouts.id, workoutId)).run();

  const touched = db
    .selectDistinct({ exerciseId: workoutExercises.exerciseId })
    .from(workoutExercises)
    .where(and(eq(workoutExercises.workoutId, workoutId), isNull(workoutExercises.deletedAt)))
    .all()
    .map((row) => row.exerciseId);

  recomputePersonalRecords(db, touched);
}

export function listPersonalRecords(db: Db, exerciseId: string): PersonalRecordRow[] {
  return db
    .select()
    .from(personalRecords)
    .where(eq(personalRecords.exerciseId, exerciseId))
    .all();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run apps/mobile/src/data/sessionRepo.logging.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Run the full suite**

Run: `pnpm vitest run`
Expected: PASS, everything green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: log sets, surface previous performance, and recompute PRs on finish"
```

---

### Task 10: Expo app bootstrap — database, migrations with backup, and seeding

The first task that produces a running app. Migration safety is folded in because it is the only data-loss path in release 1 and must exist before the first real migration runs on a device holding real training history.

**Files:**
- Modify: `apps/mobile/package.json`
- Create: `apps/mobile/app.json`, `apps/mobile/babel.config.js`, `apps/mobile/metro.config.js`
- Create: `apps/mobile/src/db/client.ts`, `apps/mobile/src/db/backup.ts`, `apps/mobile/src/db/bootstrap.ts`
- Create: `apps/mobile/src/data/seedRepo.ts`
- Create: `apps/mobile/app/_layout.tsx`, `apps/mobile/app/index.tsx`
- Test: `apps/mobile/src/data/seedRepo.test.ts`, `packages/schema/src/migrations.test.ts`

**Interfaces:**
- Consumes: `listExercises` from Task 7, `curated.json` from Task 6
- Produces:
  - `db: Db` — the app-wide database instance
  - `expoDb` — the raw expo-sqlite handle, needed for backup
  - `DB_NAME = 'workouts.db'`
  - `backupDatabase(): Promise<void>`, `restoreDatabase(): Promise<void>`, `discardBackup(): Promise<void>`
  - `initializeDatabase(): Promise<void>` — backup, migrate, seed; restores on failure
  - `seedExercisesIfEmpty(db: Db, seed: SeedExercise[]): number` — returns rows inserted

- [ ] **Step 1: Add Expo dependencies**

Replace the `dependencies` block in `apps/mobile/package.json` and add scripts:

```json
{
  "name": "@overload/mobile",
  "version": "0.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "ios": "expo start --ios",
    "android": "expo start --android"
  },
  "dependencies": {
    "@overload/domain": "workspace:*",
    "@overload/schema": "workspace:*",
    "drizzle-orm": "^0.36.0",
    "expo": "~52.0.0",
    "expo-file-system": "~18.0.0",
    "expo-keep-awake": "~14.0.0",
    "expo-notifications": "~0.29.0",
    "expo-router": "~4.0.0",
    "expo-sqlite": "~15.0.0",
    "expo-status-bar": "~2.0.0",
    "react": "18.3.1",
    "react-native": "0.76.0",
    "react-native-safe-area-context": "4.12.0",
    "react-native-screens": "~4.1.0"
  },
  "devDependencies": {
    "@babel/core": "^7.25.0",
    "@types/react": "~18.3.12",
    "babel-plugin-inline-import": "^3.0.0"
  }
}
```

Run: `pnpm install`

- [ ] **Step 2: Configure Expo, Babel, and Metro**

`apps/mobile/app.json`:

```json
{
  "expo": {
    "name": "Workouts",
    "slug": "workouts",
    "scheme": "workouts",
    "version": "0.1.0",
    "orientation": "portrait",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "plugins": ["expo-router"],
    "ios": { "supportsTablet": false, "bundleIdentifier": "com.workouts.app" },
    "android": { "package": "com.workouts.app" }
  }
}
```

`apps/mobile/babel.config.js` — the inline-import plugin is what lets Metro bundle the generated `.sql` migration files:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
```

`apps/mobile/metro.config.js` — `sql` must be a source extension, and the monorepo root must be watched so workspace packages resolve:

```js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.sourceExts.push('sql');

module.exports = config;
```

- [ ] **Step 3: Write the database client**

`apps/mobile/src/db/client.ts`:

```ts
import * as schema from '@overload/schema';
import type { Db } from '@overload/schema';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

export const DB_NAME = 'workouts.db';

/** enableChangeListener powers useLiveQuery, so screens re-render on write. */
export const expoDb = openDatabaseSync(DB_NAME, { enableChangeListener: true });

export const db: Db = drizzle(expoDb, { schema });
```

- [ ] **Step 4: Write the backup helper**

`apps/mobile/src/db/backup.ts`:

```ts
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
```

- [ ] **Step 5: Write the failing seed test**

`apps/mobile/src/data/seedRepo.test.ts`:

```ts
import { createTestDb } from '@overload/schema/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listExercises } from './exerciseRepo';
import { seedExercisesIfEmpty } from './seedRepo';

const SEED = [
  { name: 'Bench Press', trackingType: 'weight_reps' as const, primaryMuscle: 'chest', secondaryMuscles: ['triceps'], equipment: 'barbell', instructions: 'Press.', isCustom: false },
  { name: 'Plank', trackingType: 'duration' as const, primaryMuscle: 'abdominals', secondaryMuscles: [], equipment: 'body only', instructions: 'Hold.', isCustom: false },
];

let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestDb());
});

afterEach(() => close());

describe('seedExercisesIfEmpty', () => {
  it('inserts every seed row into an empty library', () => {
    expect(seedExercisesIfEmpty(db, SEED)).toBe(2);
    expect(listExercises(db).map((e) => e.name)).toEqual(['Bench Press', 'Plank']);
  });

  it('is a no-op when the library already has rows', () => {
    seedExercisesIfEmpty(db, SEED);
    expect(seedExercisesIfEmpty(db, SEED)).toBe(0);
    expect(listExercises(db)).toHaveLength(2);
  });

  it('preserves the tracking type from the seed data', () => {
    seedExercisesIfEmpty(db, SEED);
    const plank = listExercises(db).find((e) => e.name === 'Plank');
    expect(plank?.trackingType).toBe('duration');
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm vitest run apps/mobile/src/data/seedRepo.test.ts`
Expected: FAIL — cannot resolve `./seedRepo`.

- [ ] **Step 7: Implement seeding**

`apps/mobile/src/data/seedRepo.ts`:

```ts
import { exercises, newId, now, type Db, type NewExercise } from '@overload/schema';

export type SeedExercise = Omit<NewExercise, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

/**
 * Runs once, on first launch. Guarded on the table being empty rather than a
 * flag, so a user who deletes every exercise is not re-seeded behind their back.
 */
export function seedExercisesIfEmpty(db: Db, seed: SeedExercise[]): number {
  const existing = db.select({ id: exercises.id }).from(exercises).limit(1).all();
  if (existing.length > 0) return 0;
  if (seed.length === 0) return 0;

  const timestamp = now();
  db.insert(exercises).values(
    seed.map((row) => ({
      ...row,
      id: newId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    })),
  ).run();

  return seed.length;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm vitest run apps/mobile/src/data/seedRepo.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 9: Write the migration safety test**

`packages/schema/src/migrations.test.ts`:

```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, expect, it } from 'vitest';
import { exercises } from './exercises';
import { newId } from './sync';
import { createTestDb } from './testing/memoryDb';

const MIGRATIONS_FOLDER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../drizzle',
);

describe('migrations', () => {
  it('re-running every migration preserves existing rows', () => {
    const { db, close } = createTestDb();

    db.insert(exercises).values({
      id: newId(),
      name: 'Bench Press',
      trackingType: 'weight_reps',
      primaryMuscle: 'chest',
      secondaryMuscles: [],
      equipment: 'barbell',
    }).run();

    // Applying the same folder again must be a no-op, never destructive.
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    expect(db.select().from(exercises).all()).toHaveLength(1);
    close();
  });
});
```

Run: `pnpm vitest run packages/schema/src/migrations.test.ts`
Expected: PASS, 1 test. **Add a case to this file for every future migration.**

- [ ] **Step 10: Write the bootstrap**

`apps/mobile/src/db/bootstrap.ts`:

```ts
import migrations from '@overload/schema/migrations';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import curated from '../../../../tools/seed-exercises/curated.json';
import { seedExercisesIfEmpty, type SeedExercise } from '../data/seedRepo';
import { backupDatabase, discardBackup, restoreDatabase } from './backup';
import { db } from './client';

/**
 * Backup, migrate, seed. A failed migration restores the pre-migration file and
 * rethrows, so a bad migration costs a restart rather than training history.
 */
export async function initializeDatabase(): Promise<void> {
  await backupDatabase();

  try {
    await migrate(db, migrations);
  } catch (error) {
    await restoreDatabase();
    throw error;
  }

  await discardBackup();
  seedExercisesIfEmpty(db, curated as SeedExercise[]);
}
```

- [ ] **Step 11: Write the root layout and a placeholder home screen**

`apps/mobile/app/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { initializeDatabase } from '../src/db/bootstrap';

export default function RootLayout() {
  const [state, setState] = useState<{ ready: boolean; error?: Error }>({ ready: false });

  useEffect(() => {
    initializeDatabase()
      .then(() => setState({ ready: true }))
      .catch((error: Error) => setState({ ready: false, error }));
  }, []);

  if (state.error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Database error</Text>
        <Text style={styles.errorBody}>{state.error.message}</Text>
        <Text style={styles.errorBody}>Your previous data was restored. Please restart the app.</Text>
      </View>
    );
  }

  if (!state.ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Stack />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  errorTitle: { fontSize: 18, fontWeight: '600' },
  errorBody: { textAlign: 'center', opacity: 0.7 },
});
```

`apps/mobile/app/index.tsx`:

```tsx
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { exercises } from '@overload/schema';
import { db } from '../src/db/client';

export default function HomeScreen() {
  const { data } = useLiveQuery(db.select().from(exercises));

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Workouts' }} />
      <Text style={styles.text}>Exercise library: {data?.length ?? 0} exercises</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 16 },
});
```

- [ ] **Step 12: Boot the app and verify seeding**

Run: `pnpm --filter @overload/mobile start`, then press `i` for the iOS simulator.
Expected: after a brief loading spinner, the screen reads "Exercise library: N exercises" with N matching the count printed in Task 6 Step 7. Reload the app; the count must stay the same, not double.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: bootstrap Expo app with migrations, backup safety, and library seeding"
```

---

### Task 11: UI primitives and the exercise library screen

The library is built before the routine builder because the builder needs it as an exercise picker.

**Files:**
- Create: `apps/mobile/src/ui/theme.ts`, `apps/mobile/src/ui/Button.tsx`, `apps/mobile/src/ui/ListRow.tsx`, `apps/mobile/src/ui/SearchField.tsx`
- Create: `apps/mobile/src/features/library/ExerciseList.tsx`
- Create: `apps/mobile/app/exercises.tsx`
- Modify: `apps/mobile/app/index.tsx`

**Interfaces:**
- Consumes: `listExercises` from Task 7, `db` from Task 10
- Produces:
  - `theme` — `{ colors, spacing, radius, text }`
  - `<Button title onPress variant? />` where `variant: 'primary' | 'secondary'`
  - `<ListRow title subtitle? right? onPress? />`
  - `<SearchField value onChangeText placeholder? />`
  - `<ExerciseList onSelect?: (exercise: Exercise) => void />` — with `onSelect` it acts as a picker, without it as a browser

- [ ] **Step 1: Write the theme**

`apps/mobile/src/ui/theme.ts`:

```ts
export const theme = {
  colors: {
    background: '#0B0B0F',
    surface: '#16161D',
    border: '#26262F',
    text: '#F5F5F7',
    textMuted: '#9A9AA8',
    accent: '#4F8CFF',
    success: '#3DD68C',
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  radius: { sm: 6, md: 10 },
  text: {
    title: { fontSize: 20, fontWeight: '600' as const },
    body: { fontSize: 16 },
    caption: { fontSize: 13 },
  },
};
```

- [ ] **Step 2: Write the primitives**

`apps/mobile/src/ui/Button.tsx`:

```tsx
import { Pressable, StyleSheet, Text } from 'react-native';
import { theme } from './theme';

type Props = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
};

export function Button({ title, onPress, variant = 'primary' }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : styles.secondary,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.label, variant === 'secondary' && styles.labelSecondary]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  primary: { backgroundColor: theme.colors.accent },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.border },
  pressed: { opacity: 0.7 },
  label: { ...theme.text.body, color: '#FFFFFF', fontWeight: '600' },
  labelSecondary: { color: theme.colors.text },
});
```

`apps/mobile/src/ui/ListRow.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from './theme';

type Props = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
};

export function ListRow({ title, subtitle, right, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.main}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  pressed: { backgroundColor: theme.colors.surface },
  main: { flex: 1, gap: 2 },
  title: { ...theme.text.body, color: theme.colors.text },
  subtitle: { ...theme.text.caption, color: theme.colors.textMuted },
});
```

`apps/mobile/src/ui/SearchField.tsx`:

```tsx
import { StyleSheet, TextInput } from 'react-native';
import { theme } from './theme';

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
};

export function SearchField({ value, onChangeText, placeholder = 'Search' }: Props) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.textMuted}
      autoCorrect={false}
      autoCapitalize="none"
      clearButtonMode="while-editing"
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    margin: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    ...theme.text.body,
  },
});
```

- [ ] **Step 3: Write the exercise list**

`apps/mobile/src/features/library/ExerciseList.tsx`:

```tsx
import type { Exercise } from '@overload/schema';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { listExercises } from '../../data/exerciseRepo';
import { db } from '../../db/client';
import { ListRow } from '../../ui/ListRow';
import { SearchField } from '../../ui/SearchField';
import { theme } from '../../ui/theme';

type Props = {
  /** Supplying onSelect turns the list into a picker. */
  onSelect?: (exercise: Exercise) => void;
};

export function ExerciseList({ onSelect }: Props) {
  const [search, setSearch] = useState('');

  // The library is static during a session, so re-query only as the search changes.
  const exercises = useMemo(() => listExercises(db, { search: search.trim() || undefined }), [search]);

  return (
    <View style={styles.container}>
      <SearchField value={search} onChangeText={setSearch} placeholder="Search exercises" />
      <FlatList
        data={exercises}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={styles.empty}>No exercises match "{search}"</Text>}
        renderItem={({ item }) => (
          <ListRow
            title={item.name}
            subtitle={`${item.primaryMuscle} · ${item.equipment}`}
            onPress={onSelect ? () => onSelect(item) : undefined}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  empty: { ...theme.text.body, color: theme.colors.textMuted, textAlign: 'center', padding: theme.spacing.xl },
});
```

- [ ] **Step 4: Add the route and link to it from home**

`apps/mobile/app/exercises.tsx`:

```tsx
import { Stack } from 'expo-router';
import { ExerciseList } from '../src/features/library/ExerciseList';

export default function ExercisesScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Exercises' }} />
      <ExerciseList />
    </>
  );
}
```

Replace `apps/mobile/app/index.tsx`:

```tsx
import { Link, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button } from '../src/ui/Button';
import { theme } from '../src/ui/theme';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Workouts' }} />
      <Link href="/exercises" asChild>
        <Button title="Browse exercises" onPress={() => {}} />
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
});
```

- [ ] **Step 5: Verify manually**

Run: `pnpm --filter @overload/mobile start`, press `i`.
Expected: tapping "Browse exercises" opens the list showing every seeded exercise. Typing "press" narrows it. Typing "zzzz" shows the empty message.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add UI primitives and exercise library screen"
```

---

### Task 12: Routine list and routine builder

Writes on every change — no save button. Every mutation goes through `routineRepo`.

**Files:**
- Create: `apps/mobile/src/features/routines/RoutineList.tsx`, `apps/mobile/src/features/routines/RoutineBuilder.tsx`
- Create: `apps/mobile/app/routines/index.tsx`, `apps/mobile/app/routines/[id].tsx`, `apps/mobile/app/routines/[id]/add-exercise.tsx`
- Modify: `apps/mobile/app/index.tsx`

**Interfaces:**
- Consumes: `listRoutines`, `createRoutine`, `getRoutineDetail`, `addExerciseToRoutine`, `addRoutineSet`, `softDeleteRoutine` from Task 7; `ExerciseList` from Task 11
- Produces: `<RoutineList />`, `<RoutineBuilder routineId />`; routes `/routines`, `/routines/[id]`, `/routines/[id]/add-exercise`

- [ ] **Step 1: Write the routine list**

`apps/mobile/src/features/routines/RoutineList.tsx`:

```tsx
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { createRoutine, listRoutines } from '../../data/routineRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { ListRow } from '../../ui/ListRow';
import { theme } from '../../ui/theme';

export function RoutineList() {
  // A local counter is the refresh signal: every mutation bumps it and re-reads.
  const [version, setVersion] = useState(0);
  const routines = listRoutines(db);

  const onCreate = useCallback(() => {
    Alert.prompt?.('New routine', 'Name', (name) => {
      if (!name?.trim()) return;
      const routine = createRoutine(db, name.trim());
      setVersion((v) => v + 1);
      router.push(`/routines/${routine.id}`);
    });
  }, []);

  return (
    <View style={styles.container} key={version}>
      <FlatList
        data={routines}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>No routines yet.</Text>}
        renderItem={({ item }) => (
          <ListRow title={item.name} onPress={() => router.push(`/routines/${item.id}`)} />
        )}
      />
      <View style={styles.footer}>
        <Button title="New routine" onPress={onCreate} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  footer: { padding: theme.spacing.lg },
  empty: { ...theme.text.body, color: theme.colors.textMuted, textAlign: 'center', padding: theme.spacing.xl },
});
```

Note: `Alert.prompt` is iOS-only. Android support is a follow-up; it is optional-chained so it no-ops rather than crashing.

- [ ] **Step 2: Write the routine builder**

`apps/mobile/src/features/routines/RoutineBuilder.tsx`:

```tsx
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { addRoutineSet, getRoutineDetail } from '../../data/routineRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { theme } from '../../ui/theme';

type Props = { routineId: string };

export function RoutineBuilder({ routineId }: Props) {
  const [version, setVersion] = useState(0);
  const detail = getRoutineDetail(db, routineId);

  if (!detail) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>Routine not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} key={version}>
      {detail.exercises.map((entry) => (
        <View key={entry.routineExercise.id} style={styles.card}>
          <Text style={styles.cardTitle}>{entry.exercise.name}</Text>
          {entry.sets.map((set, index) => (
            <Text key={set.id} style={styles.setLine}>
              Set {index + 1}: {set.targetWeightKg ?? '—'} kg × {set.targetReps ?? '—'}
            </Text>
          ))}
          <Button
            title="Add set"
            variant="secondary"
            onPress={() => {
              const last = entry.sets[entry.sets.length - 1];
              addRoutineSet(db, entry.routineExercise.id, {
                targetReps: last?.targetReps ?? 8,
                targetWeightKg: last?.targetWeightKg ?? undefined,
              });
              setVersion((v) => v + 1);
            }}
          />
        </View>
      ))}

      {detail.exercises.length === 0 ? (
        <Text style={styles.empty}>No exercises yet. Add one to get started.</Text>
      ) : null}

      <Button
        title="Add exercise"
        onPress={() => router.push(`/routines/${routineId}/add-exercise`)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.lg },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  cardTitle: { ...theme.text.title, color: theme.colors.text },
  setLine: { ...theme.text.body, color: theme.colors.textMuted },
  empty: { ...theme.text.body, color: theme.colors.textMuted, textAlign: 'center' },
});
```

- [ ] **Step 3: Add the routes**

`apps/mobile/app/routines/index.tsx`:

```tsx
import { Stack } from 'expo-router';
import { RoutineList } from '../../src/features/routines/RoutineList';

export default function RoutinesScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Routines' }} />
      <RoutineList />
    </>
  );
}
```

`apps/mobile/app/routines/[id].tsx`:

```tsx
import { Stack, useLocalSearchParams } from 'expo-router';
import { RoutineBuilder } from '../../src/features/routines/RoutineBuilder';

export default function RoutineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ title: 'Edit routine' }} />
      <RoutineBuilder routineId={id} />
    </>
  );
}
```

`apps/mobile/app/routines/[id]/add-exercise.tsx`:

```tsx
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { addExerciseToRoutine, addRoutineSet } from '../../../src/data/routineRepo';
import { db } from '../../../src/db/client';
import { ExerciseList } from '../../../src/features/library/ExerciseList';

export default function AddExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen options={{ title: 'Add exercise', presentation: 'modal' }} />
      <ExerciseList
        onSelect={(exercise) => {
          const routineExercise = addExerciseToRoutine(db, id, exercise.id);
          // A new exercise starts with one set so the card is never empty.
          addRoutineSet(db, routineExercise.id, { targetReps: 8 });
          router.back();
        }}
      />
    </>
  );
}
```

Add a routines link to `apps/mobile/app/index.tsx`, above the exercises link:

```tsx
      <Link href="/routines" asChild>
        <Button title="Routines" onPress={() => {}} />
      </Link>
```

- [ ] **Step 4: Verify manually**

Run: `pnpm --filter @overload/mobile start`, press `i`.
Expected: create a routine named "Push Day", add Bench Press, add two sets, back out to the routine list and reopen it. The exercise and both sets are still there — confirming writes hit the database rather than component state.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add routine list and routine builder screens"
```

---

### Task 13: Active session screen

The core screen. Every completed set writes to SQLite before anything renders, and each row shows what was lifted last time.

**Files:**
- Create: `apps/mobile/src/features/session/SetRow.tsx`, `apps/mobile/src/features/session/ExerciseCard.tsx`, `apps/mobile/src/features/session/ActiveSession.tsx`
- Create: `apps/mobile/app/session/[id].tsx`
- Modify: `apps/mobile/src/features/routines/RoutineBuilder.tsx` (add a "Start workout" button)

**Interfaces:**
- Consumes: `getWorkoutDetail`, `completeSet`, `uncompleteSet`, `addSet`, `finishWorkout`, `lastPerformance`, `startWorkoutFromRoutine` from Tasks 8–9
- Produces:
  - `<SetRow set index previous onComplete onUncomplete />`
  - `<ExerciseCard entry previous onChanged />`
  - `<ActiveSession workoutId />`; route `/session/[id]`
  - `formatPrevious(sets: CompletedSet[], index: number): string` — exported from `SetRow.tsx`

- [ ] **Step 1: Write the set row**

`apps/mobile/src/features/session/SetRow.tsx`:

```tsx
import type { CompletedSet } from '@overload/domain';
import type { WorkoutSet } from '@overload/schema';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from '../../ui/theme';

type Props = {
  set: WorkoutSet;
  index: number;
  previous: CompletedSet[];
  onComplete: (values: { weightKg: number | null; reps: number | null }) => void;
  onUncomplete: () => void;
};

/** "80 kg × 8" for the matching set last time, or an em dash when there was none. */
export function formatPrevious(sets: CompletedSet[], index: number): string {
  const match = sets[index];
  if (!match) return '—';
  if (match.weightKg === null) return `${match.reps ?? '—'} reps`;
  return `${match.weightKg} kg × ${match.reps ?? '—'}`;
}

function toNumber(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export function SetRow({ set, index, previous, onComplete, onUncomplete }: Props) {
  const [weight, setWeight] = useState(set.weightKg?.toString() ?? '');
  const [reps, setReps] = useState(set.reps?.toString() ?? '');
  const completed = set.completedAt !== null;

  return (
    <View style={[styles.row, completed && styles.rowCompleted]}>
      <Text style={styles.index}>{index + 1}</Text>
      <Text style={styles.previous}>{formatPrevious(previous, index)}</Text>

      <TextInput
        value={weight}
        onChangeText={setWeight}
        keyboardType="decimal-pad"
        placeholder="kg"
        placeholderTextColor={theme.colors.textMuted}
        style={styles.input}
      />
      <TextInput
        value={reps}
        onChangeText={setReps}
        keyboardType="number-pad"
        placeholder="reps"
        placeholderTextColor={theme.colors.textMuted}
        style={styles.input}
      />

      <Pressable
        accessibilityLabel={completed ? 'Mark set incomplete' : 'Complete set'}
        onPress={() =>
          completed
            ? onUncomplete()
            : onComplete({ weightKg: toNumber(weight), reps: toNumber(reps) })
        }
        style={[styles.check, completed && styles.checkOn]}
      >
        <Text style={styles.checkMark}>{completed ? '✓' : ''}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.sm },
  rowCompleted: { opacity: 0.6 },
  index: { ...theme.text.body, color: theme.colors.textMuted, width: 20 },
  previous: { ...theme.text.caption, color: theme.colors.textMuted, width: 86 },
  input: {
    flex: 1,
    ...theme.text.body,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    textAlign: 'center',
  },
  check: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: theme.colors.success, borderColor: theme.colors.success },
  checkMark: { color: '#0B0B0F', fontWeight: '700' },
});
```

- [ ] **Step 2: Write the exercise card**

`apps/mobile/src/features/session/ExerciseCard.tsx`:

```tsx
import type { CompletedSet } from '@overload/domain';
import { StyleSheet, Text, View } from 'react-native';
import { addSet, completeSet, uncompleteSet, type WorkoutDetailExercise } from '../../data/sessionRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { theme } from '../../ui/theme';
import { SetRow } from './SetRow';

type Props = {
  entry: WorkoutDetailExercise;
  previous: CompletedSet[];
  onChanged: () => void;
  onSetCompleted: (restSeconds: number | null) => void;
};

export function ExerciseCard({ entry, previous, onChanged, onSetCompleted }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{entry.exercise.name}</Text>

      {entry.sets.map((set, index) => (
        <SetRow
          key={set.id}
          set={set}
          index={index}
          previous={previous}
          onComplete={(values) => {
            completeSet(db, set.id, values, Date.now());
            onChanged();
            onSetCompleted(entry.workoutExercise.restSeconds);
          }}
          onUncomplete={() => {
            uncompleteSet(db, set.id);
            onChanged();
          }}
        />
      ))}

      <Button
        title="Add set"
        variant="secondary"
        onPress={() => {
          addSet(db, entry.workoutExercise.id, Date.now());
          onChanged();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  title: { ...theme.text.title, color: theme.colors.text },
});
```

- [ ] **Step 3: Write the session screen**

`apps/mobile/src/features/session/ActiveSession.tsx`:

```tsx
import type { CompletedSet } from '@overload/domain';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { finishWorkout, getWorkoutDetail, lastPerformance } from '../../data/sessionRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { theme } from '../../ui/theme';
import { ExerciseCard } from './ExerciseCard';

type Props = { workoutId: string };

export function ActiveSession({ workoutId }: Props) {
  // Bumping this re-renders, which re-reads the workout from SQLite.
  const [, setVersion] = useState(0);
  const detail = getWorkoutDetail(db, workoutId);

  // Previous performance is fixed for the session — query once per exercise.
  const previousByExercise = useMemo(() => {
    const map = new Map<string, CompletedSet[]>();
    for (const entry of detail?.exercises ?? []) {
      map.set(entry.exercise.id, lastPerformance(db, entry.exercise.id, workoutId));
    }
    return map;
  }, [workoutId, detail?.exercises.length]);

  if (!detail) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>Workout not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {detail.exercises.map((entry) => (
        <ExerciseCard
          key={entry.workoutExercise.id}
          entry={entry}
          previous={previousByExercise.get(entry.exercise.id) ?? []}
          onChanged={() => setVersion((v) => v + 1)}
          onSetCompleted={() => {}}
        />
      ))}

      {detail.exercises.length === 0 ? (
        <Text style={styles.empty}>This workout has no exercises.</Text>
      ) : null}

      <Button
        title="Finish workout"
        onPress={() => {
          finishWorkout(db, workoutId, Date.now());
          router.replace('/');
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.lg },
  empty: { ...theme.text.body, color: theme.colors.textMuted, textAlign: 'center' },
});
```

- [ ] **Step 4: Add the route and a start button**

`apps/mobile/app/session/[id].tsx`:

```tsx
import { Stack, useLocalSearchParams } from 'expo-router';
import { ActiveSession } from '../../src/features/session/ActiveSession';

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ title: 'Workout', headerBackVisible: false }} />
      <ActiveSession workoutId={id} />
    </>
  );
}
```

In `apps/mobile/src/features/routines/RoutineBuilder.tsx`, add the import:

```tsx
import { startWorkoutFromRoutine } from '../../data/sessionRepo';
```

and add this button directly above the "Add exercise" button:

```tsx
      <Button
        title="Start workout"
        onPress={() => {
          const workoutId = startWorkoutFromRoutine(db, routineId, Date.now());
          router.push(`/session/${workoutId}`);
        }}
      />
```

- [ ] **Step 5: Verify manually**

Run: `pnpm --filter @overload/mobile start`, press `i`.
Expected:
1. Open "Push Day", tap "Start workout". Both planned sets appear with targets pre-filled and the previous column showing "—".
2. Enter 80 and 8, tap the checkmark. The row dims and the check turns green.
3. Force-quit the app and reopen it, then navigate back into the workout via its URL. **The completed set is still checked** — this is the crash-safety guarantee.
4. Finish the workout, start "Push Day" again. The previous column now reads "80 kg × 8".

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add active session screen with write-through set logging"
```

---

### Task 14: Rest timer

The timer is derived from a timestamp so suspending the app cannot freeze it, and a scheduled notification fires with the phone in a pocket.

**Files:**
- Create: `packages/domain/src/restTimer.ts`
- Create: `apps/mobile/src/features/session/RestTimer.tsx`, `apps/mobile/src/features/session/notifications.ts`
- Modify: `packages/domain/src/index.ts`, `apps/mobile/src/features/session/ActiveSession.tsx`
- Test: `packages/domain/src/restTimer.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces:
  - `restRemainingSeconds(startedAt: number, restSeconds: number, nowMs: number): number`
  - `formatDuration(totalSeconds: number): string`
  - `scheduleRestNotification(seconds: number): Promise<void>`, `cancelRestNotification(): Promise<void>`
  - `<RestTimer startedAt restSeconds onDismiss />`
  - `DEFAULT_REST_SECONDS = 120`

- [ ] **Step 1: Write the failing test**

`packages/domain/src/restTimer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatDuration, restRemainingSeconds } from './restTimer';

const START = 1_700_000_000_000;

describe('restRemainingSeconds', () => {
  it('returns the full duration at the moment the set completes', () => {
    expect(restRemainingSeconds(START, 120, START)).toBe(120);
  });

  it('counts down as wall-clock time passes', () => {
    expect(restRemainingSeconds(START, 120, START + 30_000)).toBe(90);
  });

  it('reaches zero exactly at the end', () => {
    expect(restRemainingSeconds(START, 120, START + 120_000)).toBe(0);
  });

  it('never goes negative, however long the app was suspended', () => {
    expect(restRemainingSeconds(START, 120, START + 999_000)).toBe(0);
  });

  it('rounds up so the display never shows 0 while time remains', () => {
    expect(restRemainingSeconds(START, 120, START + 119_500)).toBe(1);
  });
});

describe('formatDuration', () => {
  it('formats under a minute with a zero minute component', () => {
    expect(formatDuration(45)).toBe('0:45');
  });

  it('pads the seconds', () => {
    expect(formatDuration(65)).toBe('1:05');
  });

  it('formats zero', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('handles durations over ten minutes', () => {
    expect(formatDuration(725)).toBe('12:05');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/domain/src/restTimer.test.ts`
Expected: FAIL — cannot resolve `./restTimer`.

- [ ] **Step 3: Implement the timer maths**

`packages/domain/src/restTimer.ts`:

```ts
export const DEFAULT_REST_SECONDS = 120;

/**
 * Derived from wall-clock time rather than counted down by an interval.
 * setInterval stops when iOS suspends the app; a timestamp does not.
 */
export function restRemainingSeconds(startedAt: number, restSeconds: number, nowMs: number): number {
  const elapsedMs = nowMs - startedAt;
  const remainingMs = restSeconds * 1000 - elapsedMs;
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / 1000);
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
```

Append to `packages/domain/src/index.ts`:

```ts
export * from './restTimer';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/domain/src/restTimer.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Write the notification helper**

`apps/mobile/src/features/session/notifications.ts`:

```ts
import * as Notifications from 'expo-notifications';

let scheduledId: string | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Replaces any pending rest notification — only one rest is ever active. */
export async function scheduleRestNotification(seconds: number): Promise<void> {
  await cancelRestNotification();

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    const request = await Notifications.requestPermissionsAsync();
    if (request.status !== 'granted') return;
  }

  scheduledId = await Notifications.scheduleNotificationAsync({
    content: { title: 'Rest complete', body: 'Time for your next set.' },
    trigger: { seconds, channelId: 'rest' },
  });
}

export async function cancelRestNotification(): Promise<void> {
  if (!scheduledId) return;
  await Notifications.cancelScheduledNotificationAsync(scheduledId);
  scheduledId = null;
}
```

- [ ] **Step 6: Write the timer component**

`apps/mobile/src/features/session/RestTimer.tsx`:

```tsx
import { formatDuration, restRemainingSeconds } from '@overload/domain';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../ui/theme';

type Props = {
  startedAt: number;
  restSeconds: number;
  onDismiss: () => void;
};

export function RestTimer({ startedAt, restSeconds, onDismiss }: Props) {
  // The interval only triggers a re-render; the value itself comes from the clock,
  // so a missed tick during suspension corrects itself on the next render.
  const [, setTick] = useState(0);

  useEffect(() => {
    const handle = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(handle);
  }, []);

  const remaining = restRemainingSeconds(startedAt, restSeconds, Date.now());

  return (
    <View style={[styles.bar, remaining === 0 && styles.barDone]}>
      <Text style={styles.label}>{remaining === 0 ? 'Rest complete' : 'Rest'}</Text>
      <Text style={styles.time}>{formatDuration(remaining)}</Text>
      <Pressable onPress={onDismiss} accessibilityLabel="Skip rest">
        <Text style={styles.skip}>Skip</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  barDone: { backgroundColor: theme.colors.success },
  label: { ...theme.text.body, color: theme.colors.text },
  time: { ...theme.text.title, color: theme.colors.text, fontVariant: ['tabular-nums'] },
  skip: { ...theme.text.body, color: theme.colors.accent },
});
```

- [ ] **Step 7: Wire the timer into the session**

In `apps/mobile/src/features/session/ActiveSession.tsx`, add imports:

```tsx
import { DEFAULT_REST_SECONDS } from '@overload/domain';
import { useKeepAwake } from 'expo-keep-awake';
import { RestTimer } from './RestTimer';
import { cancelRestNotification, scheduleRestNotification } from './notifications';
```

Add inside `ActiveSession`, above the `if (!detail)` guard:

```tsx
  // The phone must not lock between sets.
  useKeepAwake();

  const [rest, setRest] = useState<{ startedAt: number; seconds: number } | null>(null);
```

Replace the `onSetCompleted={() => {}}` prop with:

```tsx
          onSetCompleted={(restSeconds) => {
            const seconds = restSeconds ?? DEFAULT_REST_SECONDS;
            setRest({ startedAt: Date.now(), seconds });
            void scheduleRestNotification(seconds);
          }}
```

And render the rest bar as the last child of the `ScrollView`, after the "Finish workout" button:

```tsx
      {rest ? (
        <RestTimer
          startedAt={rest.startedAt}
          restSeconds={rest.seconds}
          onDismiss={() => {
            setRest(null);
            void cancelRestNotification();
          }}
        />
      ) : null}
```

- [ ] **Step 8: Verify manually**

Run: `pnpm --filter @overload/mobile start`, press `i`.
Expected:
1. Complete a set — the rest bar appears and counts down from 2:00.
2. Background the app for 30 seconds and return. **The timer shows roughly 30 seconds less, not a frozen value.** This is the behaviour the timestamp design exists for.
3. Wait for zero — the bar turns green and a notification fires.
4. The screen does not auto-lock while the session is open.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add timestamp-derived rest timer with notification and keep-awake"
```

---

### Task 15: Resume an unfinished workout, and history

Closes the loop: crash recovery becomes reachable from the UI, and finished workouts become reviewable.

**Files:**
- Create: `apps/mobile/src/data/historyRepo.ts`
- Create: `apps/mobile/src/features/history/HistoryList.tsx`, `apps/mobile/src/features/history/WorkoutDetailView.tsx`
- Create: `apps/mobile/app/history/index.tsx`, `apps/mobile/app/history/[id].tsx`
- Modify: `apps/mobile/app/index.tsx`
- Test: `apps/mobile/src/data/historyRepo.test.ts`

**Interfaces:**
- Consumes: `getActiveWorkoutId`, `getWorkoutDetail` from Task 8; `totalVolumeKg` from Task 3
- Produces:
  - `listFinishedWorkouts(db: Db, limit?: number): WorkoutSummary[]`
  - `type WorkoutSummary = { workout: Workout; setCount: number; volumeKg: number }`

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/data/historyRepo.test.ts`:

```ts
import { exercises, newId, type Exercise } from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listFinishedWorkouts } from './historyRepo';
import { addExerciseToWorkout, addSet, completeSet, finishWorkout, startEmptyWorkout } from './sessionRepo';

const AT = 1_700_000_000_000;

let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;
let bench: Exercise;

beforeEach(() => {
  ({ db, close } = createTestDb());
  const row = {
    id: newId(),
    name: 'Bench Press',
    trackingType: 'weight_reps' as const,
    primaryMuscle: 'chest',
    secondaryMuscles: [],
    equipment: 'barbell',
  };
  db.insert(exercises).values(row).run();
  bench = row as unknown as Exercise;
});

afterEach(() => close());

function logWorkout(name: string, at: number, sets: Array<[number, number]>, finish = true) {
  const workoutId = startEmptyWorkout(db, name, at);
  const we = addExerciseToWorkout(db, workoutId, bench.id, at);
  for (const [weightKg, reps] of sets) {
    const set = addSet(db, we.id, at);
    completeSet(db, set.id, { weightKg, reps }, at);
  }
  if (finish) finishWorkout(db, workoutId, at + 1000);
  return workoutId;
}

describe('listFinishedWorkouts', () => {
  it('returns nothing when there is no history', () => {
    expect(listFinishedWorkouts(db)).toEqual([]);
  });

  it('excludes workouts that are still in progress', () => {
    logWorkout('In progress', AT, [[100, 5]], false);
    expect(listFinishedWorkouts(db)).toEqual([]);
  });

  it('returns finished workouts newest first', () => {
    logWorkout('Older', AT - 100_000, [[100, 5]]);
    logWorkout('Newer', AT, [[100, 5]]);
    expect(listFinishedWorkouts(db).map((s) => s.workout.name)).toEqual(['Newer', 'Older']);
  });

  it('summarises completed set count and total volume', () => {
    logWorkout('Push', AT, [[100, 5], [100, 3]]);
    const [summary] = listFinishedWorkouts(db);
    expect(summary?.setCount).toBe(2);
    expect(summary?.volumeKg).toBe(800);
  });

  it('respects the limit', () => {
    logWorkout('A', AT - 200_000, [[100, 5]]);
    logWorkout('B', AT - 100_000, [[100, 5]]);
    logWorkout('C', AT, [[100, 5]]);
    expect(listFinishedWorkouts(db, 2)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run apps/mobile/src/data/historyRepo.test.ts`
Expected: FAIL — cannot resolve `./historyRepo`.

- [ ] **Step 3: Implement the history repository**

`apps/mobile/src/data/historyRepo.ts`:

```ts
import { totalVolumeKg, type CompletedSet } from '@overload/domain';
import {
  sets,
  workoutExercises,
  workouts,
  type Db,
  type Workout,
} from '@overload/schema';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';

export type WorkoutSummary = {
  workout: Workout;
  setCount: number;
  volumeKg: number;
};

export function listFinishedWorkouts(db: Db, limit = 50): WorkoutSummary[] {
  const finished = db
    .select()
    .from(workouts)
    .where(and(isNotNull(workouts.endedAt), isNull(workouts.deletedAt)))
    .orderBy(desc(workouts.startedAt))
    .limit(limit)
    .all();

  return finished.map((workout) => {
    const completed: CompletedSet[] = db
      .select({ set: sets, exerciseId: workoutExercises.exerciseId })
      .from(sets)
      .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
      .where(
        and(
          eq(workoutExercises.workoutId, workout.id),
          isNotNull(sets.completedAt),
          isNull(sets.deletedAt),
        ),
      )
      .all()
      .map(({ set, exerciseId }) => ({
        id: set.id,
        exerciseId,
        setType: set.setType,
        weightKg: set.weightKg,
        reps: set.reps,
        durationSeconds: set.durationSeconds,
        completedAt: set.completedAt!,
      }));

    return {
      workout,
      setCount: completed.length,
      volumeKg: totalVolumeKg(completed),
    };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run apps/mobile/src/data/historyRepo.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the history screens**

`apps/mobile/src/features/history/HistoryList.tsx`:

```tsx
import { router } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { listFinishedWorkouts } from '../../data/historyRepo';
import { db } from '../../db/client';
import { ListRow } from '../../ui/ListRow';
import { theme } from '../../ui/theme';

export function HistoryList() {
  const summaries = listFinishedWorkouts(db);

  return (
    <View style={styles.container}>
      <FlatList
        data={summaries}
        keyExtractor={(item) => item.workout.id}
        ListEmptyComponent={<Text style={styles.empty}>No finished workouts yet.</Text>}
        renderItem={({ item }) => (
          <ListRow
            title={item.workout.name}
            subtitle={`${new Date(item.workout.startedAt).toLocaleDateString()} · ${item.setCount} sets · ${Math.round(item.volumeKg)} kg`}
            onPress={() => router.push(`/history/${item.workout.id}`)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  empty: { ...theme.text.body, color: theme.colors.textMuted, textAlign: 'center', padding: theme.spacing.xl },
});
```

`apps/mobile/src/features/history/WorkoutDetailView.tsx`:

```tsx
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { getWorkoutDetail } from '../../data/sessionRepo';
import { db } from '../../db/client';
import { theme } from '../../ui/theme';

type Props = { workoutId: string };

export function WorkoutDetailView({ workoutId }: Props) {
  const detail = getWorkoutDetail(db, workoutId);

  if (!detail) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>Workout not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {detail.exercises.map((entry) => (
        <View key={entry.workoutExercise.id} style={styles.card}>
          <Text style={styles.title}>{entry.exercise.name}</Text>
          {entry.sets
            .filter((set) => set.completedAt !== null)
            .map((set, index) => (
              <Text key={set.id} style={styles.setLine}>
                {index + 1}. {set.weightKg ?? '—'} kg × {set.reps ?? '—'}
              </Text>
            ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.lg },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.lg, gap: theme.spacing.xs },
  title: { ...theme.text.title, color: theme.colors.text },
  setLine: { ...theme.text.body, color: theme.colors.textMuted },
  empty: { ...theme.text.body, color: theme.colors.textMuted, textAlign: 'center', padding: theme.spacing.xl },
});
```

`apps/mobile/app/history/index.tsx`:

```tsx
import { Stack } from 'expo-router';
import { HistoryList } from '../../src/features/history/HistoryList';

export default function HistoryScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'History' }} />
      <HistoryList />
    </>
  );
}
```

`apps/mobile/app/history/[id].tsx`:

```tsx
import { Stack, useLocalSearchParams } from 'expo-router';
import { WorkoutDetailView } from '../../src/features/history/WorkoutDetailView';

export default function WorkoutHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ title: 'Workout' }} />
      <WorkoutDetailView workoutId={id} />
    </>
  );
}
```

- [ ] **Step 6: Add resume-on-launch to the home screen**

Replace `apps/mobile/app/index.tsx`:

```tsx
import { Link, router, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { getActiveWorkoutId } from '../src/data/sessionRepo';
import { db } from '../src/db/client';
import { Button } from '../src/ui/Button';
import { theme } from '../src/ui/theme';

export default function HomeScreen() {
  const activeWorkoutId = getActiveWorkoutId(db);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Workouts' }} />

      {activeWorkoutId ? (
        <View style={styles.resume}>
          <Text style={styles.resumeText}>You have a workout in progress.</Text>
          <Button title="Resume workout" onPress={() => router.push(`/session/${activeWorkoutId}`)} />
        </View>
      ) : null}

      <Link href="/routines" asChild>
        <Button title="Routines" onPress={() => {}} />
      </Link>
      <Link href="/history" asChild>
        <Button title="History" onPress={() => {}} />
      </Link>
      <Link href="/exercises" asChild>
        <Button title="Browse exercises" onPress={() => {}} />
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.lg, gap: theme.spacing.md },
  resume: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  resumeText: { ...theme.text.body, color: theme.colors.text },
});
```

- [ ] **Step 7: Run the full suite**

Run: `pnpm vitest run`
Expected: PASS, every test across all packages.

- [ ] **Step 8: Verify the whole loop manually**

Run: `pnpm --filter @overload/mobile start`, press `i`.
Expected:
1. Start "Push Day", complete one set, then force-quit the app.
2. Reopen it. The home screen shows "You have a workout in progress." Tap Resume — the completed set is still checked.
3. Finish the workout. It appears under History with the correct set count and volume.
4. Open it from History and confirm the logged sets match what you entered.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add workout history and resume for unfinished sessions"
```

---

## Done when

`pnpm vitest run` is green, and you can complete this loop on a device without touching a keyboard outside the app: create a routine, start it, log sets with rest timers, force-quit mid-workout and resume, finish, and see the workout in history with correct volume.

## Deferred to Plan 2

These are release-1 scope in the spec and are **not** dropped — they are
sequenced into the next plan, which builds on this data:

- **Progress charts** — per-exercise top set, estimated 1RM, and volume over time.
- **CSV import** from Hevy and Strong, including exercise name matching.
- **Superset and advanced set-type UI.** The schema supports supersets, warmup,
  drop, failure, RPE and RIR from Task 5, and the repositories persist them, but
  the session screen exposes only normal sets with weight and reps. Plan 2 adds
  the controls; no migration is required.
- **The failed-write banner** described under Failure Modes in the spec. Task 13
  writes through on every set but does not yet surface a write error visibly.
