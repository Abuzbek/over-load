# Release 1 Scope Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the release-1 scope gap — make `tracking_type` drive the session screen and the derived metrics, give the routine builder target weights and reordering, add a Settings screen with kg/lb display, and surface personal records.

**Architecture:** The tracking-type work is a domain change, not a UI change. `CompletedSet` gains `trackingType` and `distanceM`; personal-record metrics and volume are selected per tracking type; `SetRow` renders inputs from a pure descriptor. Everything else layers on top: repositories gain the joins and writes they were missing, and four screens are added or extended.

**Tech Stack:** Expo + expo-router, TypeScript, Drizzle + expo-sqlite, Vitest, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-09-20-release-1-scope-closure-design.md`

## Global Constraints

- **Weight is always kilograms.** Pounds are display-only. No table stores a unit for a weight.
- **Timestamps are integer epoch milliseconds.** Never ISO strings, never `Date` objects.
- **Deletes are tombstones.** Set `deleted_at`; never `DELETE`. **Every read filters `deleted_at IS NULL` at EVERY joined level.** `personal_records` is the sole exemption — a derived cache whose hard `DELETE` is correct.
- **`packages/domain` imports nothing.** Zero dependencies in its `package.json`; that is what enforces the boundary. It may not import `@overload/schema`.
- **Screens never touch Drizzle.** Type-only imports from `@overload/schema` are fine; query-builder imports are not.
- **Ordering indexes use `max(orderIndex) + 1` over ALL rows including tombstoned** — never a count of live rows.
- **`sets.completedAt IS NULL` means planned-but-not-performed.** Do not repurpose it.
- **Check both iOS and Android** for anything platform-sensitive.
- Node 20+, pnpm 9+. Run all commands from the repo root.
- Test command: `pnpm exec vitest run <path>`. Full suite: `pnpm test`. Type gate: `pnpm typecheck`.

---

## File Structure

**Created:**
- `packages/domain/src/trackingTypes.ts` — the `TrackingType` union and per-type metric/volume rules
- `packages/domain/src/formatWeight.ts` — the single kg→display conversion
- `packages/schema/src/appSettings.ts` — `app_settings` table
- `apps/mobile/src/data/settingsRepo.ts` — read/write the unit preference
- `apps/mobile/src/features/session/setInputs.ts` — `inputsFor(trackingType)` descriptor
- `apps/mobile/src/features/settings/SettingsScreen.tsx`
- `apps/mobile/src/features/records/RecordsList.tsx`
- `apps/mobile/app/settings.tsx`, `apps/mobile/app/records.tsx`

**Modified:**
- `packages/domain/src/sets.ts` — `CompletedSet` gains `trackingType`, `distanceM`; `setVolumeKg` gates
- `packages/domain/src/personalRecords.ts` — metrics selected per tracking type
- `packages/domain/src/index.ts` — re-exports
- `apps/mobile/src/data/sessionRepo.ts` — `toCompletedSet` signature, `SetValues.distanceM`, `listAllPersonalRecords`
- `apps/mobile/src/data/historyRepo.ts` — join `exercises` for tracking type
- `apps/mobile/src/data/routineRepo.ts` — `reorderRoutineExercises`
- `apps/mobile/src/features/session/SetRow.tsx` — render from the descriptor
- `apps/mobile/src/features/session/RestTimer.tsx` — safe-area inset
- `apps/mobile/src/features/routines/RoutineBuilder.tsx` — target weight, reorder
- `apps/mobile/app/_layout.tsx` — dark `screenOptions`
- `apps/mobile/app/index.tsx` — Settings / Records / empty-workout entries

---

# Phase 1 — Tracking-type correctness

This phase fixes an active data-corruption bug. Ship and verify it before starting Phase 2.

### Task 1: Tracking types and volume gating in `domain`

**Files:**
- Create: `packages/domain/src/trackingTypes.ts`
- Modify: `packages/domain/src/sets.ts`, `packages/domain/src/index.ts`
- Test: `packages/domain/src/sets.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `TrackingType`, `TRACKING_TYPES`, `tracksWeight(t: TrackingType): boolean`; `CompletedSet` with new required fields `trackingType: TrackingType` and `distanceM: number | null`

`packages/domain` may not import `@overload/schema`, so this union is declared independently and kept in step with `TRACKING_TYPES` in `packages/schema/src/exercises.ts:4`. Task 3 adds a test that fails if they drift.

- [ ] **Step 1: Write the failing test**

Append to `packages/domain/src/sets.test.ts`:

```ts
import { setVolumeKg, totalVolumeKg, type CompletedSet } from './sets';

function set(over: Partial<CompletedSet> = {}): CompletedSet {
  return {
    id: 'a', exerciseId: 'e', trackingType: 'weight_reps', setType: 'normal',
    weightKg: 10, reps: 5, durationSeconds: null, distanceM: null,
    completedAt: 1, ...over,
  };
}

describe('setVolumeKg tracking-type gating', () => {
  it('counts volume for weight_reps', () => {
    expect(setVolumeKg(set())).toBe(50);
  });

  it('is zero for a duration exercise even when a weight was stored', () => {
    expect(setVolumeKg(set({ trackingType: 'duration', weightKg: 17, reps: 8 }))).toBe(0);
  });

  it('is zero for a bodyweight reps exercise', () => {
    expect(setVolumeKg(set({ trackingType: 'reps', weightKg: 17, reps: 8 }))).toBe(0);
  });

  it('excludes non-weight sets from a mixed total', () => {
    expect(totalVolumeKg([set(), set({ trackingType: 'duration', weightKg: 17, reps: 8 })])).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/domain/src/sets.test.ts`
Expected: FAIL — type errors on the missing `trackingType`/`distanceM` fields, and the duration case returning 136 instead of 0.

- [ ] **Step 3: Write the implementation**

Create `packages/domain/src/trackingTypes.ts`:

```ts
/**
 * Mirrors TRACKING_TYPES in packages/schema/src/exercises.ts. It is duplicated
 * rather than imported because packages/domain has zero dependencies by design;
 * a parity test in apps/mobile fails if the two ever drift.
 */
export const TRACKING_TYPES = ['weight_reps', 'reps', 'duration', 'distance_duration'] as const;

export type TrackingType = (typeof TRACKING_TYPES)[number];

/** Only weight_reps carries a load, so only it contributes volume or a 1RM. */
export function tracksWeight(trackingType: TrackingType): boolean {
  return trackingType === 'weight_reps';
}
```

In `packages/domain/src/sets.ts`, add the import, extend the type, and gate the volume:

```ts
import { tracksWeight, type TrackingType } from './trackingTypes';

export type CompletedSet = {
  id: string;
  exerciseId: string;
  trackingType: TrackingType;
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceM: number | null;
  /** Epoch milliseconds. */
  completedAt: number;
};

export function setVolumeKg(set: CompletedSet): number {
  // A plank with a stray weight value is not 136 kg of work. Gating here rather
  // than at each call site keeps every consumer consistent.
  if (!tracksWeight(set.trackingType)) return 0;
  if (set.weightKg === null || set.reps === null) return 0;
  if (set.weightKg <= 0 || set.reps <= 0) return 0;
  return set.weightKg * set.reps;
}
```

Add `export * from './trackingTypes';` to `packages/domain/src/index.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run packages/domain/src/sets.test.ts`
Expected: PASS. Other suites will not compile yet — that is expected until Task 3.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/trackingTypes.ts packages/domain/src/sets.ts packages/domain/src/index.ts packages/domain/src/sets.test.ts
git commit -m "feat(domain): gate set volume on tracking type"
```

---

### Task 2: Personal-record metrics per tracking type

**Files:**
- Modify: `packages/domain/src/personalRecords.ts`
- Test: `packages/domain/src/personalRecords.test.ts`

**Interfaces:**
- Consumes: `TrackingType`, `tracksWeight`, `CompletedSet` (Task 1)
- Produces: `PersonalRecordType` widened with `'max_duration' | 'max_distance'`; `computePersonalRecords(sets: CompletedSet[]): PersonalRecord[]` unchanged in signature

`personal_records.type` is a free-text column with no CHECK constraint, so the two new values need no migration.

- [ ] **Step 1: Write the failing test**

Append to `packages/domain/src/personalRecords.test.ts`:

```ts
function set(over: Partial<CompletedSet> = {}): CompletedSet {
  return {
    id: 'a', exerciseId: 'e', trackingType: 'weight_reps', setType: 'normal',
    weightKg: 10, reps: 5, durationSeconds: null, distanceM: null,
    completedAt: 1, ...over,
  };
}

describe('metric selection by tracking type', () => {
  it('gives a duration exercise a max_duration record and nothing else', () => {
    const records = computePersonalRecords([
      set({ trackingType: 'duration', weightKg: 17, reps: 8, durationSeconds: 60 }),
    ]);
    expect(records.map((r) => r.type).sort()).toEqual(['max_duration']);
  });

  it('never gives a stretch an estimated one-rep max', () => {
    const records = computePersonalRecords([
      set({ trackingType: 'duration', weightKg: 17, reps: 8, durationSeconds: 60 }),
    ]);
    expect(records.find((r) => r.type === 'est_1rm')).toBeUndefined();
  });

  it('gives a bodyweight exercise only max_reps', () => {
    const records = computePersonalRecords([set({ trackingType: 'reps', weightKg: null, reps: 12 })]);
    expect(records.map((r) => r.type)).toEqual(['max_reps']);
  });

  it('gives a distance exercise distance and duration records', () => {
    const records = computePersonalRecords([
      set({ trackingType: 'distance_duration', weightKg: null, reps: null, distanceM: 5000, durationSeconds: 1500 }),
    ]);
    expect(records.map((r) => r.type).sort()).toEqual(['max_distance', 'max_duration']);
  });

  it('still gives a weight_reps exercise all four records', () => {
    const records = computePersonalRecords([set()]);
    expect(records.map((r) => r.type).sort()).toEqual(['est_1rm', 'max_reps', 'max_volume', 'max_weight']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/domain/src/personalRecords.test.ts`
Expected: FAIL — the duration case returns `max_weight`, `max_reps`, `max_volume` and `est_1rm`.

- [ ] **Step 3: Write the implementation**

In `packages/domain/src/personalRecords.ts`:

```ts
import { estimateOneRepMax } from './oneRepMax';
import { countsTowardRecords, setVolumeKg, type CompletedSet } from './sets';
import type { TrackingType } from './trackingTypes';

export type PersonalRecordType =
  | 'max_weight'
  | 'max_reps'
  | 'max_volume'
  | 'est_1rm'
  | 'max_duration'
  | 'max_distance';

type Metric = { type: PersonalRecordType; of: (set: CompletedSet) => number };

const MAX_WEIGHT: Metric = { type: 'max_weight', of: (s) => s.weightKg ?? 0 };
const MAX_REPS: Metric = { type: 'max_reps', of: (s) => s.reps ?? 0 };
const MAX_VOLUME: Metric = { type: 'max_volume', of: setVolumeKg };
const EST_1RM: Metric = {
  type: 'est_1rm',
  of: (s) => estimateOneRepMax(s.weightKg ?? 0, s.reps ?? 0),
};
const MAX_DURATION: Metric = { type: 'max_duration', of: (s) => s.durationSeconds ?? 0 };
const MAX_DISTANCE: Metric = { type: 'max_distance', of: (s) => s.distanceM ?? 0 };

/**
 * A record only means something if the exercise measures it. Before this map
 * existed, every metric ran against every exercise, which cached an estimated
 * one-rep max in kilograms for a stretch.
 */
const METRICS_BY_TRACKING_TYPE: Record<TrackingType, Metric[]> = {
  weight_reps: [MAX_WEIGHT, MAX_REPS, MAX_VOLUME, EST_1RM],
  reps: [MAX_REPS],
  duration: [MAX_DURATION],
  distance_duration: [MAX_DISTANCE, MAX_DURATION],
};
```

Inside `computePersonalRecords`, replace the `for (const metric of METRICS)` loop header with a per-group lookup. The tracking type is a property of the exercise, so every set in a group shares it — read it from the first set:

```ts
  for (const [exerciseId, group] of byExercise) {
    const metrics = METRICS_BY_TRACKING_TYPE[group[0]!.trackingType];

    for (const metric of metrics) {
      // ...unchanged body: earliest-wins ties, skip values <= 0
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run packages/domain/src/personalRecords.test.ts`
Expected: PASS, including the pre-existing Epley and earliest-wins-tie tests.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/personalRecords.ts packages/domain/src/personalRecords.test.ts
git commit -m "feat(domain): select personal-record metrics by tracking type"
```

---

### Task 3: Carry tracking type through the repository layer

**Files:**
- Modify: `apps/mobile/src/data/sessionRepo.ts`, `apps/mobile/src/data/historyRepo.ts`
- Test: `apps/mobile/src/data/sessionRepo.logging.test.ts`, `apps/mobile/src/data/historyRepo.test.ts`

**Interfaces:**
- Consumes: `CompletedSet`, `TrackingType` (Task 1)
- Produces: `toCompletedSet(row: WorkoutSet, exerciseId: string, trackingType: TrackingType): CompletedSet`; `SetValues` with `distanceM?: number | null`

> **Read this before writing the queries.** Every call site of `toCompletedSet` must now join `exercises` to read `tracking_type`. Five separate queries in the original build shipped without a tombstone filter on a joined level. Each new join below needs `isNull(exercises.deletedAt)` and a test that fails without it.

- [ ] **Step 1: Write the failing tests**

Append to `apps/mobile/src/data/sessionRepo.logging.test.ts`:

```ts
it('carries the exercise tracking type onto completed sets', () => {
  // plankId is a 'duration' exercise seeded in beforeEach
  const workoutId = startEmptyWorkout(db, 'Test', now());
  const we = addExerciseToWorkout(db, workoutId, plankId, now());
  const row = addSet(db, we.id, now());
  completeSet(db, row.id, { durationSeconds: 60 }, now());

  const sets = completedSetsForExercise(db, plankId);
  expect(sets[0]!.trackingType).toBe('duration');
  expect(sets[0]!.durationSeconds).toBe(60);
});

it('writes distanceM through completeSet', () => {
  const workoutId = startEmptyWorkout(db, 'Test', now());
  const we = addExerciseToWorkout(db, workoutId, runId, now());
  const row = addSet(db, we.id, now());
  completeSet(db, row.id, { distanceM: 5000, durationSeconds: 1500 }, now());

  const stored = db.select().from(sets).where(eq(sets.id, row.id)).get();
  expect(stored!.distanceM).toBe(5000);
});

it('excludes sets whose exercise is tombstoned', () => {
  const workoutId = startEmptyWorkout(db, 'Test', now());
  const we = addExerciseToWorkout(db, workoutId, plankId, now());
  const row = addSet(db, we.id, now());
  completeSet(db, row.id, { durationSeconds: 60 }, now());

  db.update(exercises).set({ deletedAt: now() }).where(eq(exercises.id, plankId)).run();

  expect(completedSetsForExercise(db, plankId)).toEqual([]);
});
```

Add a parity test at `apps/mobile/src/data/trackingTypeParity.test.ts`:

```ts
import { TRACKING_TYPES as DOMAIN_TYPES } from '@overload/domain';
import { TRACKING_TYPES as SCHEMA_TYPES } from '@overload/schema';
import { expect, it } from 'vitest';

// packages/domain cannot import the schema, so the union is duplicated there.
// This test is the only thing keeping the two copies honest.
it('domain and schema agree on the tracking types', () => {
  expect([...DOMAIN_TYPES].sort()).toEqual([...SCHEMA_TYPES].sort());
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run apps/mobile/src/data`
Expected: FAIL — `toCompletedSet` takes two arguments, `SetValues` has no `distanceM`, and the tombstone test returns one set.

- [ ] **Step 3: Write the implementation**

In `apps/mobile/src/data/sessionRepo.ts`:

```ts
export type SetValues = {
  weightKg?: number | null;
  reps?: number | null;
  durationSeconds?: number | null;
  distanceM?: number | null;
  rpe?: number | null;
  rir?: number | null;
};
```

Add to `completeSet`, beside the existing assignments:

```ts
  if (values.distanceM !== undefined) patch.distanceM = values.distanceM;
```

Change the mapper:

```ts
export function toCompletedSet(
  row: WorkoutSet,
  exerciseId: string,
  trackingType: TrackingType,
): CompletedSet {
  return {
    id: row.id,
    exerciseId,
    trackingType,
    setType: row.setType,
    weightKg: row.weightKg,
    reps: row.reps,
    durationSeconds: row.durationSeconds,
    distanceM: row.distanceM,
    completedAt: row.completedAt!,
  };
}
```

Every query feeding it joins `exercises` and selects the tracking type. For each of `lastPerformance`, `allCompletedSets` in `sessionRepo.ts` and the summary query in `historyRepo.ts`, add:

```ts
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
```

and extend the `where` with `isNull(exercises.deletedAt)`, select `trackingType: exercises.trackingType`, then map with
`toCompletedSet(set, exerciseId, trackingType)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run apps/mobile/src/data && pnpm typecheck`
Expected: PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/data
git commit -m "feat(data): carry tracking type onto completed sets and write distance"
```

---

### Task 4: Rebuild the personal-record cache once on launch

**Files:**
- Modify: `apps/mobile/src/db/bootstrap.ts`, `apps/mobile/src/data/sessionRepo.ts`
- Test: `apps/mobile/src/db/bootstrap.test.ts`

**Interfaces:**
- Consumes: `recomputePersonalRecords` (existing, private in `sessionRepo.ts`)
- Produces: `rebuildAllPersonalRecords(db: Db): void`

Existing installs hold records that the new gating would never produce — an `est_1rm` of 21.53 kg for a stretch. `personal_records` is a derived cache with no `deleted_at`, so a rebuild is the sanctioned repair and its hard `DELETE` is correct.

- [ ] **Step 1: Write the failing test**

Append to `apps/mobile/src/db/bootstrap.test.ts`:

```ts
it('drops records that the current metric rules would not produce', () => {
  // A stale row of the kind the pre-gating code wrote for a duration exercise.
  db.insert(personalRecords).values({
    id: newId(), exerciseId: plankId, type: 'est_1rm',
    value: 21.53, setId: 'stale', achievedAt: 1,
  }).run();

  rebuildAllPersonalRecords(db);

  const remaining = db.select().from(personalRecords)
    .where(eq(personalRecords.exerciseId, plankId)).all();
  expect(remaining.find((r) => r.type === 'est_1rm')).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/mobile/src/db/bootstrap.test.ts`
Expected: FAIL with "rebuildAllPersonalRecords is not defined".

- [ ] **Step 3: Write the implementation**

In `apps/mobile/src/data/sessionRepo.ts`:

```ts
/**
 * Recomputes every exercise's records from `sets`. personal_records is a derived
 * cache, so this is always safe; it exists so installs written before metrics
 * were gated by tracking type drop records that can no longer occur.
 */
export function rebuildAllPersonalRecords(db: Db): void {
  const ids = db
    .selectDistinct({ exerciseId: workoutExercises.exerciseId })
    .from(workoutExercises)
    .where(isNull(workoutExercises.deletedAt))
    .all()
    .map((row) => row.exerciseId);

  recomputePersonalRecords(db, ids);
}
```

Call it from `initializeDatabase` in `bootstrap.ts`, after migrations and seeding have completed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run apps/mobile/src/db && pnpm test`
Expected: PASS, whole suite green.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/db apps/mobile/src/data/sessionRepo.ts
git commit -m "fix(db): rebuild personal records on launch to drop ungated rows"
```

---

### Task 5: Render set inputs per tracking type

**Files:**
- Create: `apps/mobile/src/features/session/setInputs.ts`
- Modify: `apps/mobile/src/features/session/SetRow.tsx`, `apps/mobile/src/features/session/ExerciseCard.tsx`
- Test: `apps/mobile/src/features/session/setInputs.test.ts`

**Interfaces:**
- Consumes: `TrackingType` (Task 1), `SetValues` (Task 3)
- Produces: `inputsFor(trackingType: TrackingType): SetInput[]` where
  `SetInput = { field: 'weightKg' | 'reps' | 'durationSeconds' | 'distanceM'; placeholder: string; keyboard: 'decimal-pad' | 'number-pad' }`;
  `parseDuration(text: string): number | null`, `formatDurationInput(seconds: number | null): string`

Per ruling R21, `@testing-library/react-native` does not work under this repo's Vitest. The branching therefore lives in a pure function that is tested directly, and `SetRow` is a thin renderer over it — the same approach already used for `formatPrevious`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/features/session/setInputs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatDurationInput, inputsFor, parseDuration } from './setInputs';

describe('inputsFor', () => {
  it('gives weight and reps for weight_reps', () => {
    expect(inputsFor('weight_reps').map((i) => i.field)).toEqual(['weightKg', 'reps']);
  });

  it('gives only reps for a bodyweight exercise', () => {
    expect(inputsFor('reps').map((i) => i.field)).toEqual(['reps']);
  });

  it('gives only duration for a plank', () => {
    expect(inputsFor('duration').map((i) => i.field)).toEqual(['durationSeconds']);
  });

  it('gives distance and duration for a run', () => {
    expect(inputsFor('distance_duration').map((i) => i.field)).toEqual(['distanceM', 'durationSeconds']);
  });

  it('never offers a weight box for a non-weight exercise', () => {
    for (const t of ['reps', 'duration', 'distance_duration'] as const) {
      expect(inputsFor(t).some((i) => i.field === 'weightKg')).toBe(false);
    }
  });
});

describe('parseDuration', () => {
  it('reads mm:ss', () => {
    expect(parseDuration('1:30')).toBe(90);
  });

  it('reads bare seconds', () => {
    expect(parseDuration('45')).toBe(45);
  });

  it('returns null for nonsense', () => {
    expect(parseDuration('abc')).toBeNull();
  });

  it('round-trips through formatDurationInput', () => {
    expect(parseDuration(formatDurationInput(90))).toBe(90);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/mobile/src/features/session/setInputs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `apps/mobile/src/features/session/setInputs.ts`:

```ts
import type { TrackingType } from '@overload/domain';

export type SetField = 'weightKg' | 'reps' | 'durationSeconds' | 'distanceM';

export type SetInput = {
  field: SetField;
  placeholder: string;
  keyboard: 'decimal-pad' | 'number-pad';
};

const WEIGHT: SetInput = { field: 'weightKg', placeholder: 'kg', keyboard: 'decimal-pad' };
const REPS: SetInput = { field: 'reps', placeholder: 'reps', keyboard: 'number-pad' };
const DURATION: SetInput = { field: 'durationSeconds', placeholder: 'mm:ss', keyboard: 'number-pad' };
const DISTANCE: SetInput = { field: 'distanceM', placeholder: 'm', keyboard: 'decimal-pad' };

/**
 * The spec's reason for tracking_type: it "drives which input widgets the
 * session screen renders". A plank has no weight box; a 5k run has no reps box.
 */
const INPUTS: Record<TrackingType, SetInput[]> = {
  weight_reps: [WEIGHT, REPS],
  reps: [REPS],
  duration: [DURATION],
  distance_duration: [DISTANCE, DURATION],
};

export function inputsFor(trackingType: TrackingType): SetInput[] {
  return INPUTS[trackingType];
}

/** Accepts "mm:ss" or bare seconds. Returns null when the text is not a duration. */
export function parseDuration(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;

  const parts = trimmed.split(':');
  if (parts.length > 2) return null;

  const numbers = parts.map((p) => Number.parseInt(p, 10));
  if (numbers.some((n) => !Number.isFinite(n) || n < 0)) return null;

  return parts.length === 2 ? numbers[0]! * 60 + numbers[1]! : numbers[0]!;
}

export function formatDurationInput(seconds: number | null): string {
  if (seconds === null) return '';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
```

Rewrite `SetRow`'s body to hold one text value per field and render from the descriptor. Keep `formatPrevious`, the `editable={!completed}` lock (ruling R22) and the `hitSlop={7}` checkmark exactly as they are:

```tsx
type Props = {
  set: WorkoutSet;
  index: number;
  trackingType: TrackingType;
  previous: CompletedSet[];
  onComplete: (values: SetValues) => void;
  onUncomplete: () => void;
};

export function SetRow({ set, index, trackingType, previous, onComplete, onUncomplete }: Props) {
  const inputs = inputsFor(trackingType);
  const completed = set.completedAt !== null;

  const [values, setValues] = useState<Record<SetField, string>>(() => ({
    weightKg: set.weightKg?.toString() ?? '',
    reps: set.reps?.toString() ?? '',
    durationSeconds: formatDurationInput(set.durationSeconds),
    distanceM: set.distanceM?.toString() ?? '',
  }));

  // Only the fields this tracking type renders are sent. An omitted key leaves
  // the stored value alone, so a plank never writes a null over a weight and a
  // lift never writes a null over a duration.
  function collect(): SetValues {
    const patch: SetValues = {};
    for (const input of inputs) {
      patch[input.field] =
        input.field === 'durationSeconds'
          ? parseDuration(values.durationSeconds)
          : toNumber(values[input.field]);
    }
    return patch;
  }

  return (
    <View style={[styles.row, completed && styles.rowCompleted]}>
      <Text style={styles.index}>{index + 1}</Text>
      <Text style={styles.previous}>{formatPrevious(previous, index)}</Text>

      {inputs.map((input) => (
        <TextInput
          key={input.field}
          value={values[input.field]}
          onChangeText={(text) => setValues((v) => ({ ...v, [input.field]: text }))}
          editable={!completed}
          keyboardType={input.keyboard}
          placeholder={input.placeholder}
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, completed && styles.inputLocked]}
        />
      ))}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={completed ? 'Mark set incomplete' : 'Complete set'}
        accessibilityState={{ checked: completed }}
        hitSlop={7}
        onPress={() => (completed ? onUncomplete() : onComplete(collect()))}
        style={[styles.check, completed && styles.checkOn]}
      >
        <Text style={styles.checkMark}>{completed ? '✓' : ''}</Text>
      </Pressable>
    </View>
  );
}
```

`ExerciseCard` passes `trackingType={entry.exercise.trackingType}`. Its `onComplete` already forwards straight to `completeSet(db, set.id, values, Date.now())`, so no change is needed there beyond the new prop.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run apps/mobile/src/features && pnpm typecheck && pnpm test`
Expected: PASS, exit 0, whole suite green.

- [ ] **Step 5: Verify on a simulator**

This is the task's real gate — the suite cannot see it.

```bash
pnpm start           # then press i
```

Add a Plank and a barbell lift to one routine, start it, and confirm the plank row shows a single `mm:ss` box and the lift shows weight + reps. Log both. Then:

```bash
sqlite3 "$(xcrun simctl get_app_container booted com.overload.app data)/Documents/SQLite/overload.db" \
  "select e.name, s.weight_kg, s.duration_seconds from sets s
     join workout_exercises we on we.id = s.workout_exercise_id
     join exercises e on e.id = we.exercise_id
    where s.completed_at is not null;"
```

Expected: the plank row has `duration_seconds` set and `weight_kg` null.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/session
git commit -m "feat(session): render set inputs from the exercise tracking type"
```

---

# Phase 2 — Routine builder

### Task 6: Target weight per set

**Files:**
- Modify: `apps/mobile/src/features/routines/RoutineBuilder.tsx`
- Test: `apps/mobile/src/data/routineRepo.test.ts`

**Interfaces:**
- Consumes: `addRoutineSet(db, routineExerciseId, values?: { targetReps?: number; targetWeightKg?: number })` — already exists at `routineRepo.ts:85`
- Produces: no new repository surface

`target_weight_kg` is null on every existing row because the builder passes only reps. Pre-filling a session from its routine is the stated reason routines are copied into workouts rather than referenced, so this is what makes that copy carry anything.

- [ ] **Step 1: Write the failing test**

Append to `apps/mobile/src/data/routineRepo.test.ts`:

```ts
it('stores a target weight when one is given', () => {
  const routine = createRoutine(db, 'Push');
  const re = addExerciseToRoutine(db, routine.id, benchId, now());
  const set = addRoutineSet(db, re.id, { targetReps: 5, targetWeightKg: 60 });

  const stored = db.select().from(routineSets).where(eq(routineSets.id, set.id)).get();
  expect(stored!.targetWeightKg).toBe(60);
  expect(stored!.targetReps).toBe(5);
});

it('leaves the target weight null when none is given', () => {
  const routine = createRoutine(db, 'Push');
  const re = addExerciseToRoutine(db, routine.id, benchId, now());
  const set = addRoutineSet(db, re.id, { targetReps: 5 });

  const stored = db.select().from(routineSets).where(eq(routineSets.id, set.id)).get();
  expect(stored!.targetWeightKg).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `pnpm exec vitest run apps/mobile/src/data/routineRepo.test.ts`
Expected: PASS — the repository already supports this. The test exists to pin the behaviour the UI now depends on. If it fails, fix `addRoutineSet` before touching the screen.

- [ ] **Step 3: Add the builder controls**

In `RoutineBuilder.tsx`, replace the bare "Add set" button with two `TextInput`s (weight, `decimal-pad`; reps, `number-pad`) and an "Add set" button that passes both. Render each existing set as `Set N: 60 kg × 5`, showing `—` where the target is null, matching the current copy. Parse with the same `toNumber` approach used in `SetRow` so `"60,5"` and `"60.5"` both work.

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm test`
Expected: exit 0, suite green.

Then on a simulator: add a set with 60 kg × 5, start the routine, and confirm the session row pre-fills 60 in the weight box rather than showing an empty `kg` placeholder.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/routines apps/mobile/src/data/routineRepo.test.ts
git commit -m "feat(routines): set a target weight per set in the builder"
```

---

### Task 7: Reorder exercises in a routine

**Files:**
- Modify: `apps/mobile/src/data/routineRepo.ts`, `apps/mobile/src/features/routines/RoutineBuilder.tsx`
- Test: `apps/mobile/src/data/routineRepo.test.ts`

**Interfaces:**
- Consumes: `routineExercises` table
- Produces: `reorderRoutineExercises(db: Db, routineId: string, orderedIds: string[], at: number): void`

> The ordering invariant is `max(orderIndex) + 1` over **all** rows including tombstoned ones. A renumber must not collide with a tombstoned sibling's index, and must leave the next insert correct. The test below is the one that catches this.

- [ ] **Step 1: Write the failing test**

```ts
it('reorders live exercises without colliding with a tombstoned sibling', () => {
  const routine = createRoutine(db, 'Push');
  const a = addExerciseToRoutine(db, routine.id, benchId, now());
  const b = addExerciseToRoutine(db, routine.id, squatId, now());
  const c = addExerciseToRoutine(db, routine.id, rowId, now());

  // Tombstone the middle one; its orderIndex 1 stays on disk.
  db.update(routineExercises).set({ deletedAt: now() }).where(eq(routineExercises.id, b.id)).run();

  reorderRoutineExercises(db, routine.id, [c.id, a.id], now());

  const live = db.select().from(routineExercises)
    .where(and(eq(routineExercises.routineId, routine.id), isNull(routineExercises.deletedAt)))
    .orderBy(asc(routineExercises.orderIndex))
    .all();
  expect(live.map((r) => r.id)).toEqual([c.id, a.id]);

  // The next insert must still land after everything, tombstones included.
  const d = addExerciseToRoutine(db, routine.id, benchId, now());
  const all = db.select().from(routineExercises).all();
  expect(d.orderIndex).toBe(Math.max(...all.filter((r) => r.id !== d.id).map((r) => r.orderIndex)) + 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/mobile/src/data/routineRepo.test.ts`
Expected: FAIL with "reorderRoutineExercises is not defined".

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Renumbers live rows above every existing index, tombstones included, so a
 * reorder can never produce an index a tombstoned sibling already holds and
 * `max(orderIndex) + 1` stays correct for the next insert.
 */
export function reorderRoutineExercises(
  db: Db,
  routineId: string,
  orderedIds: string[],
  at: number,
): void {
  db.transaction((tx) => {
    const highest = tx
      .select({ maxIndex: max(routineExercises.orderIndex) })
      .from(routineExercises)
      .where(eq(routineExercises.routineId, routineId))
      .get();

    const base = (highest?.maxIndex ?? -1) + 1;

    orderedIds.forEach((id, position) => {
      tx.update(routineExercises)
        .set({ orderIndex: base + position, updatedAt: at })
        .where(and(eq(routineExercises.id, id), eq(routineExercises.routineId, routineId)))
        .run();
    });
  });
}
```

In `RoutineBuilder.tsx`, add "Move up" / "Move down" controls per exercise card that swap neighbours in the live list and call `reorderRoutineExercises` with the new order. Buttons rather than drag-and-drop: no gesture library is a dependency today, and adding one is out of scope.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run apps/mobile/src/data && pnpm typecheck`
Expected: PASS, exit 0.

- [ ] **Step 5: Verify on both platforms**

Reorder on iOS **and** Android. The builder screen already had one cross-platform defect (the iOS-only `Alert.prompt`, ruling R19); four such defects shipped during the original build.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/data/routineRepo.ts apps/mobile/src/data/routineRepo.test.ts apps/mobile/src/features/routines
git commit -m "feat(routines): reorder exercises within a routine"
```

---

# Phase 3 — Settings and units

### Task 8: `app_settings` table

**Files:**
- Create: `packages/schema/src/appSettings.ts`
- Modify: `packages/schema/src/index.ts`
- Test: `packages/schema/src/migrations.test.ts`

**Interfaces:**
- Produces: `appSettings` table; `AppSettings = typeof appSettings.$inferSelect`; `WEIGHT_UNITS = ['kg', 'lb'] as const`

**The kilograms invariant is unaffected.** No table stores a unit *for a weight*; `weight_kg` stays kilograms everywhere. This column records a display preference.

- [ ] **Step 1: Write the table and generate the migration**

Create `packages/schema/src/appSettings.ts`:

```ts
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { syncColumns } from './sync';

export const WEIGHT_UNITS = ['kg', 'lb'] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

/**
 * A single row. Weight is stored in kilograms everywhere; this records how to
 * display it, which is why it does not violate the no-stored-units rule.
 */
export const appSettings = sqliteTable('app_settings', {
  ...syncColumns,
  weightUnit: text('weight_unit', { enum: WEIGHT_UNITS }).notNull().default('kg'),
});

export type AppSettings = typeof appSettings.$inferSelect;
```

Add `export * from './appSettings';` to `packages/schema/src/index.ts`, then:

```bash
pnpm db:generate
```

- [ ] **Step 2: Write the data-preservation test**

Append to `packages/schema/src/migrations.test.ts`. The harness is `createDbAtMigration(throughIndex)` — **0-indexed and inclusive**, so `1` means "0000 and 0001 applied" — paired with `applyFullMigrations(db)`, which then runs the real `drizzle/` folder. This is the only way to exercise the new migration's SQL for real: drizzle skips migrations not newer than the newest already recorded, so a database built by `createTestDb()` runs zero statements and would pass even if the migration were destructive.

```ts
it('preserves exercise data across the app_settings migration', () => {
  // 1 == through 0001_sturdy_demogoblin, i.e. everything before app_settings.
  const { db, close } = createDbAtMigration(1);
  const id = newId();
  db.insert(exercises).values({
    id, name: 'Bench', trackingType: 'weight_reps',
    primaryMuscle: 'chest', secondaryMuscles: [], equipment: 'barbell',
  }).run();

  applyFullMigrations(db);

  expect(db.select().from(exercises).where(eq(exercises.id, id)).get()).toBeDefined();
  close();
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm exec vitest run packages/schema && pnpm typecheck`
Expected: PASS, exit 0. Confirm exactly one new file appeared under `packages/schema/drizzle/`.

- [ ] **Step 4: Commit**

```bash
git add packages/schema
git commit -m "feat(schema): add app_settings with a weight-unit display preference"
```

---

### Task 9: `formatWeight` and `settingsRepo`

**Files:**
- Create: `packages/domain/src/formatWeight.ts`, `apps/mobile/src/data/settingsRepo.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/formatWeight.test.ts`, `apps/mobile/src/data/settingsRepo.test.ts`

**Interfaces:**
- Consumes: `kgToLb`, `lbToKg`, `Unit` (existing, `packages/domain/src/units.ts`)
- Produces: `formatWeight(kg: number | null, unit: Unit): string`; `toStorageKg(entered: number, unit: Unit): number`; `getWeightUnit(db: Db): Unit`; `setWeightUnit(db: Db, unit: Unit, at: number): void`

**Use `Unit` from `packages/domain/src/units.ts` throughout the app, not schema's `WeightUnit`.** The two unions are structurally identical (`'kg' | 'lb'`), so they interchange without a cast, but one name in the application code avoids ambiguity. Schema's `WeightUnit` exists only to constrain the stored column.

One conversion path, not one per screen. Mixed-unit bugs start exactly where conversion is scattered.

- [ ] **Step 1: Write the failing tests**

`packages/domain/src/formatWeight.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatWeight, toStorageKg } from './formatWeight';

describe('formatWeight', () => {
  it('shows kilograms unchanged', () => {
    expect(formatWeight(60, 'kg')).toBe('60 kg');
  });

  it('converts to pounds for display', () => {
    expect(formatWeight(100, 'lb')).toBe('220.5 lb');
  });

  it('renders an em dash for no weight', () => {
    expect(formatWeight(null, 'kg')).toBe('—');
  });

  it('drops a trailing zero', () => {
    expect(formatWeight(60.0, 'kg')).toBe('60 kg');
  });
});

describe('toStorageKg', () => {
  it('passes kilograms through untouched', () => {
    expect(toStorageKg(60, 'kg')).toBe(60);
  });

  it('round-trips pounds within a gram', () => {
    expect(toStorageKg(220.46, 'lb')).toBeCloseTo(100, 2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run packages/domain/src/formatWeight.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
import { kgToLb, lbToKg, type Unit } from './units';

/** Storage is always kilograms. This is the only place that changes for display. */
export function formatWeight(kg: number | null, unit: Unit): string {
  if (kg === null) return '—';
  const value = unit === 'lb' ? kgToLb(kg) : kg;
  return `${Number(value.toFixed(1))} ${unit}`;
}

/** Converts a value the user typed, in their chosen unit, into stored kilograms. */
export function toStorageKg(entered: number, unit: Unit): number {
  return unit === 'lb' ? lbToKg(entered) : entered;
}
```

Create `settingsRepo.ts` with `getWeightUnit` (reading the single row, inserting a default `'kg'` row if absent) and `setWeightUnit` (updating `weightUnit` and `updatedAt`). Write its tests against `createTestDb()` as the other repository tests do.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run packages/domain apps/mobile/src/data/settingsRepo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain apps/mobile/src/data/settingsRepo.ts apps/mobile/src/data/settingsRepo.test.ts
git commit -m "feat: add formatWeight and the weight-unit settings repository"
```

---

### Task 10: Settings screen, and route every weight through `formatWeight`

**Files:**
- Create: `apps/mobile/src/features/settings/SettingsScreen.tsx`, `apps/mobile/app/settings.tsx`
- Modify: `apps/mobile/app/index.tsx`, `SetRow.tsx`, `RoutineBuilder.tsx`, `HistoryList.tsx`, `WorkoutDetailView.tsx`

**Interfaces:**
- Consumes: `formatWeight`, `toStorageKg` (Task 9), `getWeightUnit`, `setWeightUnit` (Task 9)
- Produces: no new repository surface

- [ ] **Step 1: Build the screen**

A kg/lb segmented control reading `getWeightUnit(db)` and writing `setWeightUnit`. Add a "Settings" entry to the home screen.

- [ ] **Step 2: Replace every hardcoded "kg"**

Search and convert:

```bash
grep -rn '\bkg\b' apps/mobile/src/features apps/mobile/app
```

Every display site becomes `formatWeight(value, unit)`. `SetRow`'s weight input converts on the way in with `toStorageKg` before building `SetValues`, so what reaches the repository is always kilograms. The `placeholder` for the weight field becomes the unit.

> A screen that reads the database in its render body shows stale data when another screen mutates it — the stack keeps it mounted. Read the unit through the existing `useFocusEffect` version-counter pattern. Do **not** add `key={version}`; ruling R20 removed one because it reset scroll position.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm test`
Expected: exit 0, suite green.

On a simulator: switch to lb, confirm the session screen, history and builder all change together, then confirm with sqlite3 that `sets.weight_kg` is still kilograms:

```bash
sqlite3 "$(xcrun simctl get_app_container booted com.overload.app data)/Documents/SQLite/overload.db" \
  "select weight_kg from sets where completed_at is not null order by completed_at desc limit 3;"
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile
git commit -m "feat(settings): add a kg/lb display preference and route weights through formatWeight"
```

---

# Phase 4 — Remaining gaps

### Task 11: Personal-records screen

**Files:**
- Create: `apps/mobile/src/features/records/RecordsList.tsx`, `apps/mobile/app/records.tsx`
- Modify: `apps/mobile/src/data/sessionRepo.ts`, `apps/mobile/app/index.tsx`
- Test: `apps/mobile/src/data/sessionRepo.logging.test.ts`

**Interfaces:**
- Consumes: `personalRecords` table, `formatWeight` (Task 9)
- Produces: `listAllPersonalRecords(db: Db): { exerciseName: string; type: PersonalRecordType; value: number; achievedAt: number }[]`

The records are already computed correctly and `listPersonalRecords` is called by no screen.

- [ ] **Step 1: Write the failing test**

```ts
function logOneBenchSet(): void {
  const workoutId = startEmptyWorkout(db, 'Test', now());
  const we = addExerciseToWorkout(db, workoutId, benchId, now());
  const row = addSet(db, we.id, now());
  completeSet(db, row.id, { weightKg: 100, reps: 5 }, now());
  finishWorkout(db, workoutId, now());
}

it('lists records for every exercise with the exercise name', () => {
  logOneBenchSet();

  const records = listAllPersonalRecords(db);
  expect(records.some((r) => r.exerciseName === 'Barbell Bench Press')).toBe(true);
});

it('omits records whose exercise is tombstoned', () => {
  logOneBenchSet();
  db.update(exercises).set({ deletedAt: now() }).where(eq(exercises.id, benchId)).run();

  expect(listAllPersonalRecords(db).some((r) => r.exerciseName === 'Barbell Bench Press')).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/mobile/src/data/sessionRepo.logging.test.ts`
Expected: FAIL with "listAllPersonalRecords is not defined".

- [ ] **Step 3: Write the implementation**

Join `personalRecords` to `exercises` with `isNull(exercises.deletedAt)`, ordered by exercise name then type. Render grouped by exercise; weight-valued types go through `formatWeight`, `max_duration` through `formatDuration`, `max_distance` as metres, `max_reps` as a bare count.

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm test`
Expected: exit 0, suite green. Then confirm on a simulator that a plank shows a duration record and no `est_1rm` — the Phase 1 fix, visible end to end.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile
git commit -m "feat(records): add a personal-records screen"
```

---

### Task 12: Custom exercises and start-empty-workout

**Files:**
- Modify: `apps/mobile/src/features/library/ExerciseList.tsx`, `apps/mobile/app/index.tsx`

**Interfaces:**
- Consumes: `createCustomExercise` (`exerciseRepo.ts:30`), `startEmptyWorkout` (`sessionRepo.ts:92`)
- Produces: nothing new

Both repository functions exist and have no UI.

- [ ] **Step 1: Add the controls**

A "New exercise" action on the library screen opening a modal with name, tracking type (a four-way choice — this is what the exercise's whole behaviour keys off), primary muscle and equipment. A "Start empty workout" button on home calling `startEmptyWorkout`, then navigating to the session.

> Use the cross-platform modal that ruling R19 introduced. **`Alert.prompt` is iOS-only** and was already removed once for exactly this reason. The modal needs Android keyboard avoidance — a missing `KeyboardAvoidingView` was one of the four cross-platform defects.

- [ ] **Step 2: Verify on both platforms**

Run: `pnpm typecheck && pnpm test`
Expected: exit 0.

Create a custom exercise and start an empty workout on iOS **and** Android.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile
git commit -m "feat: add custom exercise creation and empty workouts"
```

---

### Task 13: Dark headers and the rest-timer safe area

**Files:**
- Modify: `apps/mobile/app/_layout.tsx`, `apps/mobile/src/features/session/RestTimer.tsx`

**Interfaces:**
- Consumes: `theme` (`ui/theme.ts`)
- Produces: nothing new

Two defects found on a simulator on 2026-09-20. `_layout.tsx:39` renders a bare `<Stack />`, so every screen gets expo-router's default light header above dark content. `RestTimer` uses `paddingVertical` only, so its row sits in the home-indicator zone.

- [ ] **Step 1: Theme the navigation headers**

```tsx
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { color: theme.colors.text },
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    />
  );
```

The bootstrap error and loading states in the same file also need `backgroundColor: theme.colors.background` on `styles.center` and a themed text colour — they are currently unstyled white.

- [ ] **Step 2: Inset the rest timer**

Use `useSafeAreaInsets()` from `react-native-safe-area-context` and add the bottom inset to the bar's padding. Confirm the package is already a dependency; if not, install with `npx expo install react-native-safe-area-context` and declare it explicitly — **pnpm's strict linking means a package named by config must be declared, not merely transitively present.**

- [ ] **Step 3: Verify on both platforms**

Run: `pnpm typecheck && pnpm test && pnpm bundle`
Expected: exit 0, suite green, bundle succeeds.

Screenshot every screen on iOS and Android: no light header anywhere, and the rest timer's row clear of the home indicator.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile
git commit -m "fix(ui): theme navigation headers and inset the rest timer"
```

---

## Closing out

- [ ] Run the full pipeline: `pnpm run ci`
- [ ] Work the device checklist in `docs/superpowers/2026-09-20-device-verification.md` on **both** platforms
- [ ] Update the handoff and checklist — both are stale (they state CI has never run and set logging was never exercised; neither is true as of 2026-09-20)
- [ ] Record the scope question in section 2 of the handoff as resolved by this plan
