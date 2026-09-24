# Overload — offline-first workout logger

Expo/React Native app targeting **iOS and Android**, pnpm monorepo, SQLite via
Drizzle. Packages are scoped `@overload/*`; the app's bundle id is
`com.overload.app`. Note that `workouts` is also domain vocabulary — the table,
`workout_exercises`, `getWorkoutDetail` — and is unrelated to the project name.

**One word per concept, in the product and the database.** A **program** is a
repeating cycle of days (`programs`, `program_days`); a **workout** is a named
plan you can train (`workouts`, `workout_exercises`, `workout_sets`); a
**session** is a workout you performed (`sessions`, `session_exercises`,
`session_sets`); an **exercise** is a movement in the catalogue; a **gym** is
a place you train (`gyms`) and the equipment in it (`equipment` catalogue +
`gym_equipment`), which filters that catalogue. The weight editor a piece of
equipment gets is decided by its **category**, never by the item. There is no
"routine" — migration 0008 removed the last of that name. Release 1 (the logging loop) is built and merged. The app shell and design
system (four tabs, `src/ui/` component kit) is built on branch `app-shell`,
not yet merged; see `docs/superpowers/2026-09-22-session-handoff.md` for full
state and history.

## Commands

All from the repo root:

```bash
pnpm start          # Expo dev server — then press i (iOS) or a (Android)
pnpm ios            # straight to the iOS simulator
pnpm android        # straight to an Android emulator/device

pnpm test           # full suite (396 tests, 31 files)
pnpm typecheck      # type gate; CI runs this too (.github/workflows/ci.yml)
pnpm run ci         # everything CI runs, locally: install + typecheck + test + bundle
pnpm bundle         # expo export — catches packaging breaks tests cannot see

pnpm db:generate    # regenerate migrations after a schema change
```

## Layout

```
packages/domain/    pure TypeScript — NO imports at all, zero dependencies
packages/schema/    Drizzle tables, generated migrations, test harnesses
apps/mobile/src/data/    repository layer — the ONLY place SQL is written
apps/mobile/src/db/      client, backup, bootstrap
apps/mobile/src/features/ + src/ui/ + app/    screens; repository calls only
apps/mobile/assets/app_file.json   the exercise catalogue (1213 exercises), seeded as-is
tools/seed-equipment/    equipment.json: starting weights + gym presets, by item name
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
- **The catalogue tables are exempt too** — `lookups`, `exercise_links`, `exercise_muscles`,
  `exercise_equipment`, `catalogue_meta` (`packages/schema/src/catalogue.ts`). Derived from
  `app_file.json`, keyed by its ids, rebuilt with a real `DELETE` by `syncCatalogue`, and
  only ever read through a tombstone-filtered `exercises` row. Do not add `deleted_at` to them.
- **Bump `CATALOGUE_VERSION` (`seedRepo.ts`) when `app_file.json`, `equipment.json` or
  `instructions.json` changes.** `instructions.json` is generated from `assets/markdown/` by
  `tools/catalogue/build_instructions.py` and seeded into `exercises.instructions`.
  Launch compares it with `catalogue_meta` and parses the 3.7 MB file only on a mismatch; a
  test pins its prefix to the file's `generatedAt`, but an `equipment.json` edit needs the
  `#n` suffix bumped by hand.
- **`personal_records` is the other exemption** — a derived cache with no `deleted_at`,
  rebuilt from `sets`. Its hard `DELETE` is correct; do not "fix" it.
- **`packages/domain` imports nothing.** No React, no expo, no drizzle, no I/O. It has
  zero dependencies in its package.json and that is what enforces the boundary.
- **Screens never touch Drizzle.** Type-only imports from `@overload/schema` are fine;
  query-builder imports are not.
- **Ordering indexes use `max(orderIndex) + 1` over ALL rows including tombstoned** —
  never a count of live rows, which collides after a soft delete.
- **`sets.completedAt IS NULL` means planned-but-not-performed.** This is the mechanism
  behind crash recovery; do not repurpose it.

## Sync (Firebase) — `apps/mobile/src/sync/`

SQLite is the only store screens read. Firebase (Auth: Apple, Google, phone; Firestore)
holds a copy of the user's own rows at `users/{uid}/{table}/{rowId}`, one Firebase project
per profile, config in `apps/mobile/firebase/<profile>/` — gitignored, like `.env`; the
committed `*.example.*` templates show the shape. Without those files the build
leaves Firebase out and the app runs local-only (`extra.firebase` in `app.config.js`).

- **Triggers queue changes, not repositories.** `drizzle/0002_sync_outbox.sql` puts every
  insert/update on a `SYNCED_TABLES` table (`syncState.ts`) into `sync_outbox`. A new user
  table needs adding to that list AND its two triggers; the schema test counts them.
- **Conflicts go to the newer `updatedAt`**, so every write must bump it.
- **Never import `@react-native-firebase/*` at module top level** — go through
  `loadFirebase()` / `firestoreReady()`; a build without Firebase has no native half.
- `app_settings` has the fixed id `'settings'` (`SETTINGS_ID`) so devices share one row.
- The catalogue, `equipment` and `personal_records` never sync.

## Things that bite in this codebase

- **Check both platforms.** Four cross-platform defects shipped during the build, each
  working on one OS and silently dead on the other: an iOS-only `Alert.prompt`, a modal
  with no Android keyboard avoidance, a missing Android notification channel, and a
  notification with no sound on iOS. Anything platform-sensitive needs both checked.
- **`pnpm` strict linking.** A package named by a config string must be *declared*, not
  merely transitively present. The app failed to bundle until `babel-preset-expo`,
  `@babel/runtime` and `query-string` were declared explicitly.
- **A third-party package's `exports` map can resolve to a build that breaks under
  Metro.** `body-muscles` exports fine under vitest but its ESM re-exports came back
  `undefined` in the RN bundle, crashing on `Object.values(MUSCLE_MAP)`. Vendor static
  data from such a package to JSON at build time instead — the heatmap does this with
  `tools/anatomy/build.py`, which also keeps foreign React components out of the
  bundle. Tests passing is not evidence that Metro resolves a dependency.
- **Expo SDK 57 / RN 0.86.** Metro resolves package `exports` maps by default now.
  Bottom tabs come from expo-router's bundled copy
  (`expo-router/build/react-navigation/bottom-tabs`), not `@react-navigation/*`.
  iOS with Firebase needs static frameworks and `ios.disableSPM` on
  `@react-native-firebase/app` (`app.config.js`). After a dependency upgrade, kill
  any old `expo start`: a stale Metro serves the previous tree ("Unable to resolve
  module drizzle-orm").
- **Sheets are `src/ui/BottomSheet.tsx`** (@gorhom/bottom-sheet, driven by a `visible`
  prop). Inside one, scroll with `BottomSheetScrollView`/`BottomSheetFlatList` and type in
  `BottomSheetTextInput`, or dragging and the keyboard misbehave. The older `Sheet` (a
  Modal) still backs the confirm dialogs.
- **`.svg` files import as markup strings** (babel `inline-import`, like `.sql`), for
  `SvgXml`. The muscle thumbnails in `assets/muscle_groups/` come in this way — and that
  folder, like `assets/markdown/`, is gitignored, so a clean checkout cannot bundle.
- **A screen reading the DB in its render body will show stale data** when another
  screen mutates it — the stack keeps it mounted. Use `useFocusEffect` to bump a
  version counter. Do not use `key={version}`; it remounts and resets scroll.
- **Tests run under `PRAGMA foreign_keys = ON`, and so does production** (`client.ts`).
  Keep them aligned.
- **CI runs install → typecheck → test → bundle** on every push to `main` and every PR.
  The bundle step is not decoration: two defects during the build made the app fail to
  bundle while the suite stayed green.
- **Two separate `headerShown: false` flags are both load-bearing, not cosmetic.**
  `apps/mobile/app/_layout.tsx`'s root `Stack.Screen` for `(tabs)` hides the outer
  stack's native header so it doesn't draw over the tab navigator. `apps/mobile/app/
  (tabs)/_layout.tsx`'s `screenOptions` hides the *tabs'* native header so it doesn't
  draw the same serif `display` title a second time underneath each screen's own —
  the missing one of these was the Task 16 defect (`ef2ba53`). Both have guard
  comments at their line; read them before touching either.
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

**iOS:** the logging loop, rest timer, notification suppression on finish and
crash/force-quit recovery are verified against the tab shell, as are programs,
gyms and the equipment catalogue. The one remaining gap is keyboard
scroll-into-view on the session screen, unverified because the simulator's
software keyboard will not appear.

**Android:** the owner confirmed on 2026-09-22 that the app works there, after
the rename and the equipment catalogue landed. That is a report, not a driven
checklist — no specific Android screen has been exercised by anyone writing
this file, so treat a *specific* Android claim (this control, this migration)
as unverified while treating "it runs" as settled.

Work through `docs/superpowers/2026-09-20-device-verification.md` before trusting
the rest.

**A green suite proves less here than it looks.** Four separate defects shipped
with 133 tests passing, typecheck clean and `expo export` succeeding, and the app
still would not launch: a Metro resolver flag silently mis-resolving 183 modules,
two undeclared expo-router peer dependencies, a major-version-wrong `query-string`,
and a `Button` that dropped the ref `<Link asChild>` passes it. Run the app.
