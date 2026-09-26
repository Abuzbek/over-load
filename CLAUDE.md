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
"routine". A **plan** is the generator's output before it is written as a program.

Work happens on feature branches merged into `dev` by PR (`main` is the release
branch). The app is signed-in only when built with Firebase; see Sync. The
roadmap — what is deliberately not built yet — is at the end of this file.

## Commands

All from the repo root:

```bash
pnpm start          # Expo dev server — then press i (iOS) or a (Android)
pnpm ios            # straight to the iOS simulator
pnpm android        # straight to an Android emulator/device

pnpm test           # full suite (456 tests, 38 files); functions/ has its own: npm test there
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
apps/mobile/assets/instructions.json   exercise how-tos, built from assets/markdown/ (gitignored)
apps/mobile/assets/equipment/ + equipment_thumbs/   equipment art (1024px) and the 144px copies the app bundles
apps/mobile/assets/muscle_groups/  per-muscle thumbnails; body_fat/: onboarding body-fat figures (SVG)
functions/               Cloud Functions (Telegram login codes) — its own npm package, not in the workspace
tools/seed-equipment/    equipment.json: starting weights + gym presets, by item name (presets from the
                         catalogue's per-item commercialGym/…/homeGym flags: build.py --presets)
tools/catalogue/         build_instructions.py, build_equipment_thumbs.py (regenerate derived assets)
```

### Navigation (`apps/mobile/app/`)

Tabs under `app/(tabs)/`: `index` (Dashboard), `workout` (active program + workout
library), `new` (the centre + button), `progress`, `more` (settings). The
in-progress workout bar is composed into the tab bar itself (`(tabs)/_layout.tsx`,
via the `Tabs` `tabBar` prop — a sibling after `<Tabs>` renders below the tab bar).

The root `app/_layout.tsx` gates everything: sign-in (`SignInScreen`) until an
account is signed in, then `onboarding` for an account that has not onboarded,
via two `Stack.Protected` groups. **`app/session/[id].tsx` lives deliberately
OUTSIDE `(tabs)`** — mid-set a tab bar is a mis-tap risk; the in-progress bar
routes back into it. `workouts/[id]` (the workout overview), `programs/`,
`exercises` (the picker/library), `history/[id]` and `settings/*` push as
full-screen routes. The two `add-exercise` routes are modals, declared in the
root layout (presentation set inside a screen is ignored).

**Opening a workout never starts it.** Program days and workout cards open the
overview; only its pinned Start Workout starts a session, through
`useWorkoutStarter`'s in-progress guard.

### Design system (`apps/mobile/src/ui/`)

Dark-only "Editorial" tokens (warm near-black, serif display headings, amber
accent) in `theme.ts` and `typography.ts`, consumed through: `Text`, `Screen`,
`Button`, `Card`, `ListRow`, `SectionLabel`, `EmptyState`, `StatTile`,
`Sheet`, `NumericField`, plus `BottomSheet` (@gorhom), `RangeSlider`, `WheelColumn`
(@quidone wheel picker, JS-only) and `Segmented`. Workout display pieces shared by the
overview and the onboarding preview live in `features/workouts/WorkoutSummary.tsx`
(target-muscle cards, exercise rows with set lines and RIR badges). `Button` is a `forwardRef` — `<Link asChild>` clones
its child and passes a ref, and a plain function component dropped it once
before, stopping the app from launching entirely. `Sheet` is the
cross-platform modal (no `Alert.prompt`, which is iOS-only).

### Where things live

- **Exercise picker** (`features/library/ExerciseList.tsx`): filters (muscle, type,
  laterality, resistance/support equipment, ROM, stability, gym) all run in SQL
  (`exerciseRepo.listExercises`). Rows are grouped into five equipment groups
  (`EXERCISE_GROUPS`), sorted by recommendation level; groups rank by their top rows.
  `ExerciseInfoSheet` shows instructions, details and history.
- **Program generator** (`packages/domain/src/programPlan.ts`, pure) is volume-driven:
  each muscle has a weekly set target (`weeklySetTarget`: +50% per focus point, half for
  minor muscles like adductors), tracked across the whole week. A set counts 1 for the
  muscle the exercise is *for*, 0.5 for its other primaries, 0.25 for secondaries.
  **The catalogue lists primaries in no useful order** (a lat pulldown's first is Biceps,
  a squat's Glutes), so the main muscle comes from the movement pattern (`mainMuscleOf`).
  Compound or not, and "primary compound", come from the catalogue's per-goal
  classification (`exerciseClassification*` links), not `exerciseType`; big muscles get a
  compound, small ones isolation; two variants from one `exclusionGroupings` group never
  share a program. After every muscle is covered, spare time goes to extra sets (focused
  first) up to a weekly cap, so the session the user picked is filled. Rep ranges, RIR,
  rest and a hard session-length budget via `estimateWorkoutSeconds` — the same estimate
  the workout overview shows. `onboardingRepo` feeds it candidates and writes the result
  (`createProgramFromPlan`). One workout per training day (A, B, C…), each muscle spread
  over about target÷3 days; a generated program is flagged `programs.generated` and keeps
  its seven days (`addProgramDay`/`removeProgramDay` refuse; a day's workout can change).
- **Periodization** (`packages/domain/src/periodization.ts`, pure): a block of 7 cycles, the
  last a deload (if chosen), then it repeats. By goal: hypertrophy (and isolation work for
  any goal) keeps the rep range and tapers RIR to failure sets; strength/both compounds
  alternate moderate cycles with heavy ones (2–4 reps, then "2+" failure sets). Only a
  *generated* active program is periodized (`periodizationRepo.cycleFor`, using the
  program's `cycle_number` and the goal/deload preferences); its workout overview shows this
  cycle's sets and a session starts from them, with smart progression filling the loads.
- **Creating programs**: + → New Program opens `features/programs/CreateProgramFlow.tsx`
  (`/programs/new`), built on onboarding's step pieces and the shared `onboarding/StepFlow`
  frame. Smart Generation re-asks the program questions from last time's answers
  (`get/setTrainingPreferences`) and ends in Save to Library / Activate Program
  (`createProgramFromPlan(..., { activate })`); Build From Scratch names it and opens the
  editor with one rest day. `/programs/[id]` is `ProgramEditor`: a tab per day + Add Day,
  and the day's `WorkoutPlan` (the same component the workout overview shows). An exercise
  added to a workout is planned as it was last done (`addExerciseFromHistory`).
- **Smart progression** (`packages/domain/src/progression.ts`, pure): an estimated one-rep
  max (Epley) from last time's working sets — reps + RIR (+ half the partials) to failure,
  the planned RIR when none was logged — aimed one rep of capacity higher; each planned set
  gets the heaviest weight the equipment can make (`gymRepo.loadableWeights`: bar totals,
  racks, stacks, plate pairs) whose reps, less its target RIR, land in the range. Applied
  when a session starts (`startSessionFromWorkout`), pre-filling weight and reps, unless
  `training_preferences.smartProgression` is off. Nothing yet with no history.
- **Dashboard rings** measure this week (from Monday) against the active program's week
  (`historyRepo.programWeekTargets`). Muscles count every muscle an exercise trains,
  supporting ones too (`exercise_muscles`), not just the main one.
- **Workout sets** carry `target_reps` (+ `target_reps_max` for a range) and
  `target_rir`; `workout_exercises.rest_seconds` holds the planned rest.
- **Session logger** (`features/session/ActiveSession.tsx`): one exercise per page (a
  horizontal pager) with a strip of exercises on top; the route hides the native header and
  the screen draws its own (menu, workout clock, rest countdown). Sets are typed on the app's
  own `ui/Keypad.tsx` (digits, RIR row, full/partial switch), not the system keyboard —
  fields are Pressables, and each is saved (`updateSet`) as soon as it is left. Session sets
  copy the plan as `target_*` columns when the workout starts; reps start empty and an
  untouched box logs its placeholder (the top of the range). Set types: normal, warmup, drop,
  myo, failure; a drop/myo set's later rounds are rows with `parent_set_id`. Warm-ups are
  inserted *before* the working sets with indexes below the lowest in use (`addWarmupSets`);
  warm-ups and rounds are left out of set counts and volume (`historyRepo`), and records
  already skip warm-ups. Layout rules live in `setTable.ts` (tested); the warm-up maths is
  `packages/domain/src/warmup.ts`; the user's scheme is kept in `training_preferences`.
  A drop or myo set starts with one round (drop: `nextDropKg`, RIR 0; myo: the set's weight,
  shown greyed) and runs without rest until its last round. Supersets (`supersetGroup`) join
  an exercise to the *next* one only; ticking a set moves to the partner with no rest, and
  rest starts after the last. Pause stores `sessions.paused_at`; resuming moves `started_at`
  forward, so durations everywhere leave the pause out. **Rows swipe to delete only because
  each Swipeable `blocksExternalGesture` the pager's `Gesture.Native()`** — without it the
  horizontal pager takes every drag; and an open row closes before any other tap on the page,
  or a sheet opened over it sticks invisible.
  The **plate calculator** shows above the keypad while a weight is typed for an exercise
  loaded on a bar: `gymRepo.barLoadingFor` finds the bar its resistance equipment needs and
  the active gym owns (heaviest listed weight), plus the gym's plates; the maths is
  `packages/domain/src/plates.ts`. Any weight may be typed: what the gym's plates cannot make
  shows as an "extra" plate each side, and −/+ step by the lightest plate pair from exactly
  what is typed. Plates show in the unit they are marked in (whole quarter-kilos ⇒ kg), with
  the total also in the user's unit when that differs.

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
- **Sign-in is required** when the build has Firebase: `app/_layout.tsx` shows
  `SignInScreen` until an account is signed in (and waits for `authResolved`, so a
  signed-in user never sees it flash). A build without Firebase config runs local-only.
- **The phone's user data is a copy of ONE account** (`localOwner` = the uid its sync
  cursors carry). Signing out, or a different account signing in, runs
  `clearAccountData` — a real `DELETE` of the user tables (not tombstones, which would
  sync), then fresh defaults. The one exception to the tombstone rule; the catalogue is
  kept. Sign-out syncs first and refuses to lose unsynced changes without `force`.
- The catalogue, `equipment` and `personal_records` never sync.
- **Onboarding** (`app/onboarding.tsx`, `src/features/onboarding/`) is decided by
  Firebase: after sign-in `syncService.checkOnboarding` reads `onboardedAt` from the
  account's settings doc in Firestore (a phone that already has the flag skips the
  read). A build without Firebase uses `needsOnboarding` (local). Onboarding writes the
  profile as it goes, creates the gym on the gym-type step (`setUpGym`: replaces the
  default on a new account, never an existing account's gyms) and writes the program
  only on finishing. Candidates go to the generator in popularity order — ties go to
  the earlier one, so keep that order.
- **Never write to `app_settings` just because someone signed in.** A fresh write makes
  this phone's row newer than the account's and sync would keep the phone's. The
  Account page shows the Firebase name/email as a fallback instead of storing them.
- **Phone sign-in is hidden** (commented out in `SignInScreen.tsx`); the sheet, SMS and
  Telegram paths all remain.
- **Telegram login codes go through Cloud Functions** (`functions/`, its own npm package,
  outside the pnpm workspace; `firebase.json` + `.firebaserc` at the root, aliases
  development/preview/production). `sendTelegramCode` throttles per number (codes cost
  money) and calls Telegram Gateway; `verifyTelegramCode` trusts the phone *Telegram*
  returns, reuses an existing user with that phone (one account across SMS and Telegram)
  and returns a custom token for `signInWithCustomToken`. Region `europe-west1` on both
  sides. Token: `firebase functions:secrets:set TELEGRAM_GATEWAY_TOKEN`. Tests:
  `npm test` in `functions/` (not part of `pnpm test`).

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
  `SvgXml`: muscle thumbnails and body-fat figures come in this way. Only
  `assets/markdown/` and `assets/body/` are gitignored; the app bundles neither
  (`instructions.json` and the heatmap's `regions.json` are the committed outputs).
  Deleting a bundled asset folder breaks the bundle: `equipmentImages.ts` requires
  every thumbnail by path.
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
  Screens pushed on the stack (workout overview, workout detail) keep a real native header,
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
software keyboard will not appear. Driven on the iOS simulator since: the exercise
picker and its sheets, the workout overview and Start Workout, the sign-in screen,
all three onboarding phases end to end (with sync disabled), and the Account page
signed in with Google. Log out, Apple sign-in and the Telegram flow have not been
exercised against a real account.

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

## Roadmap — not built yet, on purpose

### Direction: a coach platform (like Hevy + Hevy Coach)

The product is sold to coaches; everything below serves that.

- **Invitation at first launch.** A modal asks "Do you have a coach invitation?"
  - With one, the account is a **client**. Onboarding skips the program generator, because the coach builds the program now or later.
  - Without one, it is a self-coached user with today's onboarding.
- **Clients are read-only.** A client cannot create or change programs, workouts or exercises. They follow the coach's program and log sessions.
  - This breaks today's assumption that every row under `users/{uid}` is owned and edited by that user.
  - Design sync, rules and screens for a program the trainee does not own.
- **Measurements.** Clients get a daily reminder to measure.
  - Weight is the minimum; body measurements of every kind and progress photos should be trackable.
  - Ordinary users can opt into the same reminders.
- **Pricing.** The coach pays per client, in tiers: 1–10 clients $25/mo, 11–25 clients $40/mo, and so on (not final). A coached client pays nothing.

### Backlog

In rough order of what was asked for earlier:

1. **Set types in the workout builder**: the logger has all of them; plans still only
   make standard sets. Left/right logging is not built.
2. **Starting-weight recommendations**: progression needs one logged session; the first
   has no load.
   Inputs to use: bodyweight, gender, lifting experience, the catalogue's per-exercise
   `bodyweight` fraction, and the onboarding skill answers (today they only exclude
   exercises).
3. **Progression and warm-ups, the rest**: progression is applied at session start, not
   yet adjusted mid-session after a harder set, and has no "why" explanation (the wand);
   warm-ups are added by hand, not automatically; deload is saved but unused.
4. **Exercise images**: every exercise thumbnail is a placeholder. If images must stay
   out of the repo, load them at runtime (e.g. Firebase Storage) rather than bundling.
5. **Workout editing gaps**: no way to remove an exercise from a workout; the ⋮ menu adds
   sets with a single rep target, not a range or RIR; the overview header's gym icon and
   ⋮ are not built; programs are never regenerated after onboarding.
6. **Phone / Telegram sign-in**: deploy the functions (Blaze plan, Gateway token secret)
   and uncomment the button.
7. **Firebase console per profile** (preview, production): Firestore + rules deploy,
   Apple/Google providers, APNs key, Android SHA fingerprints. Development is set up.
8. **Smaller**: history sort chips in the info sheet; move the remaining `Sheet` modals to
   `BottomSheet`; marketing/feature slides after onboarding (only with a subscription);
   drive an Android checklist.
