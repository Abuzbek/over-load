# Overload — offline-first workout logger

Expo/React Native app targeting **iOS and Android**, pnpm monorepo, SQLite via
Drizzle. Packages are scoped `@overload/*`; the app's bundle id is
`com.overload.app`. Note that `workouts` is also domain vocabulary — the table,
`workout_exercises`, `getWorkoutDetail` — and is unrelated to the project name. Release 1 (the logging loop) is built and merged; see
`docs/superpowers/2026-09-20-session-handoff.md` for full state and history.

## Commands

All from the repo root:

```bash
pnpm start          # Expo dev server — then press i (iOS) or a (Android)
pnpm ios            # straight to the iOS simulator
pnpm android        # straight to an Android emulator/device

pnpm test           # full suite (133 tests, 18 files)
pnpm typecheck      # type gate; CI runs this too (.github/workflows/ci.yml)
pnpm run ci         # everything CI runs, locally: install + typecheck + test + bundle
pnpm bundle         # expo export — catches packaging breaks tests cannot see

pnpm db:generate    # regenerate migrations after a schema change
pnpm seed:build     # rebuild curated.json from the upstream dataset
```

## Layout

```
packages/domain/    pure TypeScript — NO imports at all, zero dependencies
packages/schema/    Drizzle tables, generated migrations, test harnesses
apps/mobile/src/data/    repository layer — the ONLY place SQL is written
apps/mobile/src/db/      client, backup, bootstrap
apps/mobile/src/features/ + src/ui/ + app/    screens; repository calls only
tools/seed-exercises/    curated.json (743 exercises), committed
```

## Invariants — do not break these

- **Weight is always kilograms.** Pounds are display-only. No table stores a unit.
- **Timestamps are integer epoch milliseconds.** Never ISO strings, never Date objects.
- **Deletes are tombstones.** Set `deleted_at`; never `DELETE`. **Every read filters
  `deleted_at IS NULL` at EVERY joined level** — this was violated in five separate
  queries during the build. Check each join deliberately.
- **`personal_records` is the one exemption** — a derived cache with no `deleted_at`,
  rebuilt from `sets`. Its hard `DELETE` is correct; do not "fix" it.
- **`packages/domain` imports nothing.** No React, no expo, no drizzle, no I/O. It has
  zero dependencies in its package.json and that is what enforces the boundary.
- **Screens never touch Drizzle.** Type-only imports from `@overload/schema` are fine;
  query-builder imports are not.
- **Ordering indexes use `max(orderIndex) + 1` over ALL rows including tombstoned** —
  never a count of live rows, which collides after a soft delete.
- **`sets.completedAt IS NULL` means planned-but-not-performed.** This is the mechanism
  behind crash recovery; do not repurpose it.

## Things that bite in this codebase

- **Check both platforms.** Four cross-platform defects shipped during the build, each
  working on one OS and silently dead on the other: an iOS-only `Alert.prompt`, a modal
  with no Android keyboard avoidance, a missing Android notification channel, and a
  notification with no sound on iOS. Anything platform-sensitive needs both checked.
- **`pnpm` strict linking.** A package named by a config string must be *declared*, not
  merely transitively present. The app failed to bundle until `babel-preset-expo`,
  `@babel/runtime` and `query-string` were declared explicitly.
- **Metro needs `unstable_enablePackageExports`** (set in `apps/mobile/metro.config.js`)
  because `@overload/schema` exposes `./migrations` and `./testing` only via its
  `exports` map.
- **A screen reading the DB in its render body will show stale data** when another
  screen mutates it — the stack keeps it mounted. Use `useFocusEffect` to bump a
  version counter. Do not use `key={version}`; it remounts and resets scroll.
- **Tests run under `PRAGMA foreign_keys = ON`, and so does production** (`client.ts`).
  Keep them aligned.
- **CI runs install → typecheck → test → bundle** on every push to `main` and every PR.
  The bundle step is not decoration: two defects during the build made the app fail to
  bundle while the suite stayed green.

## Verification reality

The app **launches on an iOS simulator**: migrations run, 743 exercises seed, the
home screen and exercise library render and filter. Everything past that — the
full logging loop, crash recovery, rest timer, notifications, Android — is still
unverified on a device.

Work through `docs/superpowers/2026-09-20-device-verification.md` before trusting
the rest.

**A green suite proves less here than it looks.** Four separate defects shipped
with 133 tests passing, typecheck clean and `expo export` succeeding, and the app
still would not launch: a Metro resolver flag silently mis-resolving 183 modules,
two undeclared expo-router peer dependencies, a major-version-wrong `query-string`,
and a `Button` that dropped the ref `<Link asChild>` passes it. Run the app.
