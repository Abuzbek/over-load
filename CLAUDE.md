# Overload — offline-first workout logger

Expo/React Native app targeting **iOS and Android**, pnpm monorepo, SQLite via
Drizzle. Packages are scoped `@overload/*`; the app's bundle id is
`com.overload.app`. Note that `workouts` is also domain vocabulary — the table,
`workout_exercises`, `getWorkoutDetail` — and is unrelated to the project name. Release 1 (the logging loop) is built and merged. The app shell and design
system (four tabs, `src/ui/` component kit) is built on branch `app-shell`,
not yet merged; see `docs/superpowers/2026-09-22-session-handoff.md` for full
state and history.

## Commands

All from the repo root:

```bash
pnpm start          # Expo dev server — then press i (iOS) or a (Android)
pnpm ios            # straight to the iOS simulator
pnpm android        # straight to an Android emulator/device

pnpm test           # full suite (254 tests, 26 files)
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

### Navigation (`apps/mobile/app/`)

Four tabs under `app/(tabs)/` — `index` (Train), `history`, `progress`,
`profile` — plus a persistent in-progress workout bar composed into the tab
bar itself (`(tabs)/_layout.tsx`, via the `Tabs` `tabBar` prop, not a sibling
after `<Tabs>` — a sibling renders below the whole navigator, tab bar
included).

**`app/session/[id].tsx` lives deliberately OUTSIDE `(tabs)`.** Mid-set, a tab
bar is a distraction and a mis-tap risk; the in-progress bar is what routes
back into it. `app/routines/`, `app/exercises.tsx` and `app/history/[id].tsx`
are also outside the tab group — they push as full-screen routes with their
own native header.

### Design system (`apps/mobile/src/ui/`)

Dark-only "Editorial" tokens (warm near-black, serif display headings, amber
accent) in `theme.ts` and `typography.ts`, consumed through: `Text`, `Screen`,
`Button`, `Card`, `ListRow`, `SectionLabel`, `EmptyState`, `StatTile`,
`Sheet`, `NumericField`. `Button` is a `forwardRef` — `<Link asChild>` clones
its child and passes a ref, and a plain function component dropped it once
before, stopping the app from launching entirely. `Sheet` is the
cross-platform modal (no `Alert.prompt`, which is iOS-only).

### `packages/domain` — three new helpers (still zero dependencies)

`formatLastTrained(lastTrainedAt, now)`, `summariseMuscles(primaryMuscles,
max)`, `formatElapsed(ms)` — all in `formatLastTrained.ts`, all pure
primitive-in/primitive-out functions per the package's own rule.

### New repository queries (`apps/mobile/src/data/`)

`listRoutineSummaries(db)` (`routineRepo.ts`) — one grouped query across
`routines` → `routine_exercises` → `exercises` → `workouts`, returning
exercise count, `lastTrainedAt` and up to three `primaryMuscles` per routine.
Four joined levels means four separate tombstone tests, not one.
`getActiveWorkout(db)` (`sessionRepo.ts`) — the active workout row itself,
consumed by the in-progress bar.

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
- **`headerShown: false` on the `(tabs)` Stack.Screen is load-bearing, not cosmetic.**
  Every tab renders its own serif `display` title; without that flag React Navigation's
  native header draws the same title again underneath it. It has already been removed
  once by accident during a later task — see the guard comment at the line in
  `apps/mobile/app/_layout.tsx` before touching it again.
- **`Screen`'s `safeTop` prop is opt-in, not automatic.** Only the four tab screens need
  it — `headerShown: false` means nothing else reserves the status-bar area for them.
  Screens pushed on the stack (routine builder, workout detail) keep a real native header,
  which already insets the content; turning `safeTop` on there double-insets. Also: add
  it to the *base* padding (`insets.top + theme.spacing.lg`), never in place of it — a
  bare `insets.top` wins the style merge and both under-pads the title and disagrees with
  any screen (e.g. `HistoryList`) that pads its own `FlatList` separately.
- **Bundle the serif per weight, not from the package root.** `import {
  Newsreader_600SemiBold } from '@expo-google-fonts/newsreader/600SemiBold'` (not the
  package's bare index) — the index re-exports all 14 weights and ships ~1.6-1.8MB of
  fonts the app never uses for one ~100-200KB face.

## Verification reality

The tabbed app-shell rewrite (`app-shell` branch) has been run on both platforms, but
not to the same depth. **iOS:** the full logging loop, rest timer, notification
suppression on finish, and crash/force-quit recovery are verified against the new
tab shell; the one remaining gap is the keyboard scroll-into-view behaviour on the
session screen, unverified because the simulator's software keyboard would not
appear. **Android:** cold launch, migrations, seeding and the four restyled tabs are
verified; **the session screen — logging a set, the rest timer, notifications, crash
recovery — has never been exercised on Android at all.** Treat any Android
session-screen claim as unverified until someone actually drives it.

Work through `docs/superpowers/2026-09-20-device-verification.md` before trusting
the rest.

**A green suite proves less here than it looks.** Four separate defects shipped
with 133 tests passing, typecheck clean and `expo export` succeeding, and the app
still would not launch: a Metro resolver flag silently mis-resolving 183 modules,
two undeclared expo-router peer dependencies, a major-version-wrong `query-string`,
and a `Button` that dropped the ref `<Link asChild>` passes it. Run the app.
