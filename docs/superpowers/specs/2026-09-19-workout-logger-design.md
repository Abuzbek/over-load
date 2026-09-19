# Workout Logger — Release 1 Design

**Date:** 2026-09-19
**Status:** Approved, ready for implementation planning

## Purpose

An offline-first mobile workout logger: build a routine, run a session,
review history and personal records. Comparable in scope to the Hevy app's
core logging loop.

Release 1 is the substrate for everything that follows. Social features, a
coach platform, and smart auto-progression all read from the workout log, so
the logging loop is built first and built well.

## Scope

### In

- Routine builder (templates with target sets, reps, weight, rest)
- Live workout session with per-set logging and rest timers
- Curated exercise library (~300 exercises)
- Workout history and personal records
- Supersets and advanced set types (warmup, drop, failure, RPE/RIR)
- Progress charts (top set, estimated 1RM, volume over time)
- CSV import from Hevy and Strong

### Out

Deferred, in rough priority order: accounts and cloud sync (phase 2), smart
auto-progression, social feed, coach platform, Apple Watch app, body
measurements, crash reporting.

### Constraints

- Solo development, nights and weekends
- No backend in release 1; the app must be fully usable with no network
- The schema must support sync without restructuring

## Approach

Release 1 ships as a fully functional on-device app. SQLite is the source of
truth, there are no accounts, and nothing is deployed.

The schema is nonetheless designed for sync from day one. That work is cheap
now and miserable to retrofit, and it is the only part of a local-first
decision that is genuinely hard to reverse.

Phase 2 adds a Node + Postgres API (Fastify, Drizzle, push/pull sync with a
change cursor) that adopts this schema with minor dialect edits.

### Alternatives rejected

**App and API built together.** Nothing to retrofit and multi-device works at
launch, but it means debugging a mobile app, an API, and a sync protocol
simultaneously before a single screen is usable. Too slow for the timeline.

**Thin server as a blob store.** Workouts stored as JSON documents with
last-write-wins. Minimal server code, but it wastes Postgres — coach
dashboards and cross-user analytics need queryable relational data, forcing a
storage rewrite exactly when the coach platform arrives.

## Stack

- Expo + TypeScript, `expo-router`
- `expo-sqlite` with Drizzle ORM (typed queries, real migrations)
- Own UI primitives, no third-party component kit
- Vitest for unit and integration tests
- pnpm workspaces

## Repository layout

    apps/
      mobile/          Expo app            (release 1)
      api/             Fastify + Postgres  (phase 2, empty for now)
    packages/
      domain/          pure TS logic — shared by both
      schema/          Drizzle table definitions + shared types

The monorepo exists from the first commit even though only one app does.
`packages/domain` is shared, so PR detection and 1RM math have exactly one
implementation rather than a mobile copy and a server copy that drift.

## Architecture

Four layers, strictly one-directional:

    features/   screens & components, grouped by feature
       ↓
    data/       repositories — the ONLY place SQL lives
       ↓
    domain/     pure TypeScript — no React, no SQLite
       ↓
    db/         schema, migrations, sync primitives

**`domain/` is the critical boundary.** Estimated 1RM, PR detection, volume
aggregation, unit conversion, set validation, CSV name-matching, and later the
auto-progression engine are pure functions over plain objects, importing
neither React nor the database. The logic that is hard to get right runs in
millisecond tests on a laptop with no simulator and no fixtures.

**`data/` exposes repositories** (`routineRepo`, `sessionRepo`,
`exerciseRepo`). Features never write SQL and never import Drizzle. The phase-2
sync engine slots in behind these repositories without changing any screen.

**The active session writes through to disk.** The live workout is not React
state saved at the end; every completed set writes to SQLite immediately and
the screen reads back from the database. Phones die mid-workout and iOS kills
backgrounded apps. A logger that loses a session loses the user permanently, so
there is no unsaved state to lose.

## Data model

    exercises ──────┐
                    ├──< routine_exercises ──< routine_sets     (the plan)
    routines ───────┘

    exercises ──────┐
                    ├──< workout_exercises ──< sets             (what happened)
    workouts ───────┘

    personal_records  (derived cache, keyed by exercise)

Plan and performance are separate trees, not one reused tree. Starting a
routine copies its exercises and target sets into a new workout. Editing a
routine therefore never alters logged history, and swapping an exercise
mid-session cannot corrupt the template. The duplication is intentional.

### Decisions that are expensive to reverse

**Sync columns on every synced table, including join tables.** (`personal_records` is
the sole exemption — it is a derived cache, described below.) `id` (UUIDv7,
generated client-side), `updated_at`, `deleted_at`. Deletes are tombstones.
Because `updated_at` is universal, phase-2 sync finds local changes with
`WHERE updated_at > last_push` — no outbox table and no dirty flags.

**Weight is stored in kilograms, always.** Pounds are a display conversion.
Mixed-unit storage silently corrupts history and cannot be repaired afterward.

**`exercises.tracking_type`** — one of `weight_reps`, `reps`, `duration`,
`distance_duration`. A plank has no weight, a pull-up has no barbell load, and
cardio has neither. Without this column the `sets` table fills with nulls the
UI has to guess at. It also drives which input widgets the session screen
renders.

**Supersets are a nullable `superset_group` integer** on `workout_exercises`
and `routine_exercises`. Same number within the same workout means the same
superset. No separate table, no nesting.

**`sets.completed_at IS NULL` means planned but not yet done.** This column is
what lets the session screen write every row to disk immediately while still
knowing what is finished. It is the mechanism behind crash recovery.

`personal_records` is a cache, fully recomputable from `sets` by a pure
function in `domain/`. It never syncs; each device rebuilds it.

## Screens and flows

Six screens: Home (routine list and "start empty workout"), Routine builder,
Active session, History, Exercise library, Settings.

### Active session

Starting a routine copies it into a `workout` with its `workout_exercises` and
planned `sets`, all written to disk before the screen renders. From then on the
screen is a view over the database.

Each set row shows the target as placeholder text, weight and reps inputs, and
a checkmark. Tapping the checkmark stamps `completed_at` and starts rest. That
is the entire write path, one row at a time.

**Previous performance appears on every row** — what you did last time for that
exercise, e.g. `80 kg × 8`. This is the feature that makes a logger worth
opening instead of using a notes app, because it is what the user actually
bases today's load on. One indexed query per exercise at session start, cached
for the session.

**The rest timer is a timestamp, not an interval.** Remaining time is computed
from `completed_at` on every render. A `setInterval` dies when iOS suspends the
app and the user returns to a timer frozen mid-count. Paired with a scheduled
local notification so the alert arrives with the phone in a pocket, and
`expo-keep-awake` while the session is open.

**Crash recovery is automatic.** On launch, any workout with a null `ended_at`
is unfinished and offered for resume. Since every set was already written,
resuming costs nothing and loses nothing.

Finishing stamps `ended_at`, recomputes personal records for the exercises
touched, and shows a summary.

### Other screens

**Routine builder** — add and reorder exercises, set target reps and weight,
assign supersets, set per-exercise rest. Writes on every change; no save button.

**History and charts** — workout list, workout detail, and per-exercise charts
(top set, estimated 1RM, volume over time) computed by `domain/` functions.

**CSV import** — parse, then map each foreign exercise name to the library by
exact match, then alias, then fuzzy match; the user resolves whatever remains,
once. Preview the counts, then write in a single transaction so a malformed
file cannot half-import.

## Exercise library

Seeded from a public-domain dataset (`free-exercise-db`, ~870 exercises with
images and muscle tagging), hand-curated down to roughly 300 with corrected
metadata and `tracking_type` assigned. Free, legally clean, and available
immediately. Users can create custom exercises.

## Testing

Coverage is weighted toward where bugs are expensive, not spread evenly.

- **`packages/domain` — heavy, TDD.** 1RM estimation, PR detection, volume
  aggregation, unit conversion, set validation, CSV name-matching. Pure
  functions, Vitest, no simulator.
- **`data/` repositories — integration tests against real SQLite** in Node via
  `better-sqlite3` using the same Drizzle schema. Catches the actual failure
  class: queries that are wrong about supersets, ordering, or soft-deleted rows.
- **Migrations — one test each**, applying the migration to a seeded database
  and asserting no data loss.
- **UI — deliberately thin.** A few tests on session state transitions. No
  Detox; end-to-end tooling on React Native is a time sink solo projects do not
  recover from. Training in your own gym is the real end-to-end test.

## Failure modes

There is no network in release 1, which removes most failure modes.

**Migration failure is the only data-loss scenario.** The SQLite file is copied
before migrations are applied and restored if anything throws. A bad migration
costs a restart, not training history.

**Write failures during a session** (realistically disk-full or corruption)
surface a visible, non-silent banner. The app may never pretend a set was saved
when it was not.

**Import is all-or-nothing** — a single transaction.

**Partial sessions are valid data, not errors.** A workout with a null
`ended_at` and three completed sets is resumable, not corrupt.

Crash reporting is deferred; Sentry arrives when users other than the developer
install the app.

## Success criteria

Release 1 is done when the developer can use the app as their only workout
logger for a full training block — including imported history from a previous
app — without losing data or reaching for a notes app.
