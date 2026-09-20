# Overload

An offline-first workout logger for iOS and Android. Build a routine, run a
session, and never lose a set — every rep you log is written to disk the moment
you tap it.

> **Status: pre-release.** The data layer is well tested (133 tests against real
> SQLite). The UI compiles and bundles but **has not yet been run on a device** —
> see [Verification status](#verification-status) before relying on it.

## Why

Most logging apps treat a workout as a form you submit at the end. Overload treats
it as a ledger you write to continuously, so a dead battery or a backgrounded app
costs you nothing. Every set row also shows what you lifted last time, because
that is the number you actually base today's load on.

## Features

- **Routine builder** — templates with target sets and reps, written on change, no save button
- **Live session** — per-set logging, previous-performance on every row, rest timers
- **Crash recovery** — an unfinished workout is resumable; nothing is held in memory
- **Rest timer** — derived from a timestamp rather than a countdown, so suspending the app cannot desync it, with a local notification for when the phone is in a pocket
- **Exercise library** — 743 exercises across 11 equipment categories, seeded on first launch
- **History** — past workouts with set counts and total volume
- **Personal records** — four metrics per exercise, recomputed on finish
- **Fully offline** — no account, no network, no backend

## Tech

Expo SDK 52 · React Native 0.76 · expo-router 4 · TypeScript · SQLite via
Drizzle ORM 0.36 · Vitest · pnpm workspaces

## Getting started

Requires **Node 20+** and **pnpm 9+**. For a simulator you will also need Xcode
(iOS) or Android Studio (Android).

```bash
git clone https://github.com/Abuzbek/over-load.git
cd over-load
pnpm install

pnpm ios        # iOS simulator
pnpm android    # Android emulator or device
pnpm start      # dev server, then press i or a
```

### Other scripts

```bash
pnpm test         # full suite (133 tests)
pnpm typecheck    # tsc --noEmit across every package
pnpm bundle       # expo export — catches packaging breaks tests cannot see
pnpm db:generate  # regenerate migrations after a schema change
pnpm seed:build   # rebuild the exercise library from the upstream dataset
```

## Project structure

```
packages/domain/          pure TypeScript — zero dependencies, no imports
packages/schema/          Drizzle tables + generated migrations
apps/mobile/src/data/     repository layer — the only place SQL is written
apps/mobile/src/db/       client, pre-migration backup, bootstrap
apps/mobile/src/features/ screens
apps/mobile/app/          expo-router routes
tools/seed-exercises/     builds the curated exercise library
```

## Architecture

Four layers, strictly one-directional: **screens → repositories → domain → schema.**

- **`packages/domain` has zero dependencies and imports nothing.** All the logic
  worth testing — 1RM estimation, PR detection, volume, rest-timer arithmetic —
  runs in milliseconds with no simulator and no database.
- **SQL exists only in the repository layer.** Screens never import Drizzle.
- **Plan and performance are separate trees.** Starting a routine *copies* it into
  a workout rather than referencing it, so editing a template never rewrites
  history you already logged.
- **Designed for sync from day one**, though release 1 is local-only: client-generated
  UUIDv7 keys, `updated_at` everywhere, deletes as tombstones.
- **`completedAt IS NULL` means planned-but-not-performed**, which is what makes
  crash recovery work.

Full design rationale: [`docs/superpowers/specs/2026-09-19-workout-logger-design.md`](docs/superpowers/specs/2026-09-19-workout-logger-design.md)

## Testing

```bash
pnpm test
```

133 tests across 18 files. Repository tests run against real SQLite through the
real migrations, not mocks. Migration tests apply a partial migration set, insert
data, then apply the rest and assert it survived.

Component rendering is **not** covered — `@testing-library/react-native` does not
work under this repo's Vitest setup (a Node ESM/CJS interop issue with React
Native's Flow-typed source). CI runs install, typecheck, tests, and a bundle on
every push and PR.

## Verification status

**No screen in this app has ever been rendered.** It was built without access to a
simulator. Everything UI-level is verified by TypeScript, a successful Metro/Hermes
bundle, and code review — nothing more.

Before trusting any screen, work through
[`docs/superpowers/2026-09-20-device-verification.md`](docs/superpowers/2026-09-20-device-verification.md).

## Roadmap

**Next up** — Settings (including lb display), personal-record display, custom
exercises, routine target and reorder editing, and honouring `tracking_type` so
duration and bodyweight exercises get the right inputs.

**Later** — progress charts, CSV import from Hevy and Strong, superset and
advanced-set-type controls, cloud sync, smart auto-progression.

Current state and open decisions:
[`docs/superpowers/2026-09-20-session-handoff.md`](docs/superpowers/2026-09-20-session-handoff.md)

## Credits

Exercise data derived from
[free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain).
