# Release 1 Scope Closure — Design

**Date:** 2026-09-20
**Status:** Approved for planning
**Supersedes nothing.** Extends `2026-09-19-workout-logger-design.md`, which remains
the binding authority for everything not restated here.

## Why this exists

The release-1 spec lists six screens. Five were built. The handoff
(`docs/superpowers/2026-09-20-session-handoff.md`, section 2) recorded the gap as an
open scope question — neither built nor declared deferred — and asked the next session
to resolve it deliberately. This document resolves it.

It also upgrades one of those items from "missing widget" to "defect", on evidence
gathered from a running simulator rather than from reading code.

## The evidence that changed the priority

`exercises.tracking_type` is ignored by the session screen: `SetRow` renders weight +
reps unconditionally. This was documented as cosmetic — 201 of 743 exercises (27%)
showing a nonsensical input.

Inspecting the simulator's database after a real logging session showed it is not
cosmetic. The exercise **All Fours Quad Stretch** has `tracking_type = 'duration'`.
Four sets were logged against it:

```
name                     w     r  vol    completed_at
All Fours Quad Stretch   11.0  8  88.0   1789922161656
All Fours Quad Stretch   15.0  8  120.0  1789922162145
All Fours Quad Stretch   16.0  8  128.0  1789922162670
All Fours Quad Stretch   17.0  8  136.0  1789922164656
```

From which the app derived and cached:

```
All Fours Quad Stretch  est_1rm     21.5333333333333
All Fours Quad Stretch  max_volume  136.0
All Fours Quad Stretch  max_weight  17.0
```

An estimated one-rep max, in kilograms, for a stretch. `duration_seconds` is null — the
column that should have been written was never touched, and the real hold time is gone.
The workout's history summary reads "776 kg", of which 472 kg is this fiction.

Three consequences, in order of severity:

1. **The personal-records cache is polluted** with records that cannot occur.
2. **Volume totals are wrong** wherever a non-weight exercise was logged.
3. **The data is unrecoverable.** Unlike a display bug, this destroyed the measurement.

This is why tracking types lead the work rather than trailing it.

## Scope

In, in build order:

1. Tracking-type correctness (domain gating, then `SetRow` branching)
2. Routine builder: target weight per set, reorder exercises
3. Settings screen with a kg/lb display preference
4. Personal-records screen, custom exercises, start empty workout, dark headers

Explicitly still deferred, unchanged from the release-1 spec: progress charts, CSV
import, superset and advanced-set-type UI, a visible banner on a failed write.

Newly deferred, with reasons:

- **Per-exercise rest seconds.** `routineExercises.restSeconds` is written as null and
  `ActiveSession` already falls back to `DEFAULT_REST_SECONDS`. The plumbing exists;
  only a builder control is missing. Deferred to keep this pass bounded.
- **Pace as a personal record** for `distance_duration`. `max_distance` and
  `max_duration` cover the useful cases without introducing a derived-rate metric.

## 1. Tracking-type correctness

### The shape of the fix

The obvious reading is that this is a `SetRow` problem. It is not. Three layers are
implicated, and fixing only the top one would stop new corruption while leaving the
existing bad records and volume totals in place:

- `packages/domain/src/sets.ts` — `CompletedSet` carries no `trackingType` and no
  `distanceM`.
- `packages/domain/src/personalRecords.ts` — `METRICS` applies all four metrics to
  every exercise unconditionally. `max_weight` is `(s) => s.weightKg ?? 0`. Nothing in
  the type system or the logic knows a stretch cannot have a one-rep max.
- `apps/mobile/src/data/sessionRepo.ts` — `SetValues` has no `distanceM` key, so
  `sets.distance_m` is **unwritable**, not merely unwritten.

### Domain changes

```ts
export type TrackingType = 'weight_reps' | 'reps' | 'duration' | 'distance_duration';

export type CompletedSet = {
  id: string;
  exerciseId: string;
  trackingType: TrackingType;   // new
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceM: number | null;     // new
  completedAt: number;
};

export type PersonalRecordType =
  | 'max_weight' | 'max_reps' | 'max_volume' | 'est_1rm'
  | 'max_duration' | 'max_distance';   // new
```

`personal_records.type` is a free-text column in SQLite, so the two new record types
need no migration — only the union widens.

Metrics become a lookup keyed by tracking type rather than one flat list:

| `tracking_type` | Records kept | Counts toward volume |
|---|---|---|
| `weight_reps` | `max_weight`, `max_reps`, `max_volume`, `est_1rm` | yes |
| `reps` | `max_reps` | no |
| `duration` | `max_duration` | no |
| `distance_duration` | `max_distance`, `max_duration` | no |

`setVolumeKg` returns 0 unless `trackingType === 'weight_reps'`.

`packages/domain` keeps zero dependencies and zero imports. The boundary is unchanged.

### Why no data-repair migration

Rejected deliberately. `personal_records` is a derived cache with no `deleted_at`,
explicitly rebuildable from `sets` — so once the metrics are gated, a rebuild clears
the bad rows with no migration at all. Nulling `weight_kg` on non-weight sets would
delete rows without recovering anything, since the real duration is already lost, and
it would cut against the tombstone discipline everywhere else in the schema. Gating
`setVolumeKg` makes the stored values inert, which achieves the same result without
destroying anything.

A PR rebuild runs at the end of every successful launch, so existing installs
self-heal without a migration and any future drift corrects itself. It is idempotent
by construction — `personal_records` is a derived cache with no source of truth of its
own — so repeating it is safe rather than merely tolerable.

It is deliberately ungated. A "has already run" marker needs durable state, and the
natural home for it (`app_settings`) does not exist until later in this same plan;
introducing a bespoke marker now and migrating it afterwards costs more than the scan.
The work is bounded by completed sets for exercises that appear in `workout_exercises`
— the same computation `finishWorkout` already performs per workout. If launch time
becomes a problem for large histories, gating it behind an `app_settings` flag is the
cheap fix, and it belongs with the other known launch-time costs (the ~1 MB seed JSON
is parsed at module scope on every launch).

### Repository changes

`toCompletedSet` needs the exercise's tracking type, so each of its call sites must
join `exercises`.

> **This is the trap this codebase has fallen into five times.** Every new join needs
> `deleted_at IS NULL` at *that* level, checked deliberately rather than assumed. See
> `CLAUDE.md`. Each new join in this work gets a test that fails before the filter is added.

`SetValues` gains `distanceM`, written under the existing rule: an omitted key leaves
the stored value alone, an explicit null clears it.

### UI

`SetRow` renders inputs per tracking type:

| Type | Inputs |
|---|---|
| `weight_reps` | weight (`decimal-pad`), reps (`number-pad`) |
| `reps` | reps |
| `duration` | duration as `mm:ss` |
| `distance_duration` | distance, duration |

Per ruling R21, `@testing-library/react-native` does not work under this repo's Vitest.
So the branching lives in a pure `inputsFor(trackingType)` descriptor that is tested
directly, and `SetRow` becomes a thin renderer over it. This follows the precedent set
by `formatPrevious`, which is already tested this way.

## 2. Routine builder

**Target weight per set.** `routineRepo.addRoutineSet` already accepts
`{ targetReps, targetWeightKg }`; the builder passes only reps, so `target_weight_kg`
is null on all 7 existing rows. This is mostly a UI control plus wiring. It matters
because pre-filling the session from the routine is the stated justification for
copying routines into workouts rather than referencing them — and today that pre-fill
has nothing to carry.

**Reorder exercises.** New `reorderRoutineExercises(db, routineId, orderedIds)`,
renumbering live rows inside a single transaction.

> The ordering invariant is `max(orderIndex) + 1` over **all** rows including
> tombstoned ones, never a count of live rows. A renumber must not produce an index
> that collides with a tombstoned sibling, and must leave `max()` correct for the next
> insert. This gets a test with a tombstoned row present.

## 3. Settings and units

A new `app_settings` table: a single fixed-id row, `weight_unit` (`'kg' | 'lb'`,
default `'kg'`), plus the standard `created_at` / `updated_at` / `deleted_at`. One
generated migration via `pnpm db:generate`.

**The kilograms invariant is unaffected.** No table stores a unit *for a weight*;
`weight_kg` remains kilograms everywhere, and this column records a display preference
only. `kgToLb` and `lbToKg` in `packages/domain` stop being dead code.

The table carries sync columns like every other synced table, so phase-2 sync inherits
it without restructuring.

**Display goes through one function.** `formatWeight(kg, unit)` is added to
`packages/domain` and every screen that currently hardcodes "kg" routes through it —
session, history, builder, personal records. Scattering conversions across screens is
how mixed-unit bugs start, and the invariant's whole point is that there is exactly one
place where kilograms become something else.

Input is converted on the way in: when the unit is `lb`, a typed weight is converted
with `lbToKg` before it reaches the repository.

## 4. Remaining gaps

- **Personal records screen.** `listPersonalRecords` is implemented and called by no
  screen. Records are already computed correctly (verified against raw sets: Epley,
  earliest-wins ties, max volume). Needs a screen, not logic. Grouped by exercise.
- **Custom exercises.** `createCustomExercise` exists with no UI.
- **Start empty workout.** `startEmptyWorkout` exists with no UI.
- **Dark navigation headers.** `app/_layout.tsx` renders a bare `<Stack />`, so every
  screen gets expo-router's default light header above dark content. `ui/theme.ts` is
  dark-only by design, so this is a `screenOptions` fix, not a theming project.

## Testing

| Layer | Approach |
|---|---|
| `packages/domain` | Pure functions. One test per tracking type for metric selection and volume gating; `formatWeight` both units. |
| `apps/mobile/src/data` | Real SQLite, real migrations, as today. Every new join gets a tombstone test that fails before the filter. Reorder gets a tombstoned-sibling test. |
| `packages/schema` | Data preservation across the new migration via `createDbAtMigration`. |
| Components | Pure descriptor functions (`inputsFor`), per R21. |

**A green suite is not sufficient evidence here.** Seven defects so far shipped with
tests passing, typecheck clean, and `expo export` succeeding. Every item in this
document is verified on a running simulator before it is called done. The device
checklist is the gate, not the suite.

## Verification state carried into this work

Confirmed on an iOS simulator on 2026-09-20, driven via `idb`:

- Set logging writes through to SQLite immediately (`60.0|8|1789923624844` observed
  in the database within a second of the tap).
- Crash recovery: with `ended_at` nulled to reproduce the post-crash state, the resume
  banner appears and every set is intact with its values.
- Previous-performance column populates correctly (`15 kg × 8`).
- Rest timer counts down, pinned, without scrolling; completed rows lock.
- History volume matches the sets (776 kg).
- Personal-record arithmetic is correct against raw data.
- CI passes on Linux.

- **Rest notifications fire.** Verified end to end: permission is granted,
  `scheduleNotificationAsync` returns an id, the system store moves the request from
  pending to delivered, and "Rest complete · Time for your next set." appears in
  Notification Center. An earlier reading in this session claimed the notification
  never fired; that was a mis-read of an unopened Notification Center panel, and it is
  wrong. No notification work is in scope.

Open, and carried forward as work rather than assumption:

- **Rest timer has no safe-area inset.** `RestTimer.tsx:38` uses `paddingVertical`
  only, so its content sits in the home-indicator zone.
- **`scheduleRestNotification` is called as a floating promise**
  (`ActiveSession.tsx:69`, `void scheduleRestNotification(seconds)`), and it returns
  early without comment when permission is denied. Scheduling works today, so this is
  latent rather than broken — but a user who declines the permission prompt gets a
  rest timer that silently never notifies. Worth a visible state rather than silence;
  not scoped here.
- **Keyboard avoidance is untested.** `idb` types through the hardware keyboard path,
  so the software keyboard never appeared and the question the checklist raises —
  whether lower set rows stay reachable — remains open.
- **Android is entirely unverified.**

## Open question deliberately not resolved here

**History and tombstoned exercises.** Deleting an exercise makes past workouts report
"0 sets · 0 kg". The alternative is to left-join `exercises` without the tombstone
filter and render "(removed)", treating history as immutable and the join as a name
lookup. This is latent — no UI soft-deletes an exercise — but it is a schema semantic
that phase-2 sync will inherit. It is called out here so the next spec decides it
rather than inheriting it by accident.
