# Session Handoff — Overload, Release 1

**App name:** Overload (renamed from the working name "workouts" on 2026-09-20 —
packages are `@overload/*`, bundle id `com.overload.app`, SQLite file `overload.db`).
The word `workouts` still appears throughout as domain vocabulary and is unrelated.
**Remote:** https://github.com/Abuzbek/over-load.git
**Date:** 2026-09-20
**Branch:** `main`, 40 commits. Feature branch merged and deleted, worktree removed.
**Remote configured but NOT yet pushed** — CI has never run.
**State:** 133 tests / 18 files passing · `pnpm typecheck` exit 0 · `pnpm bundle` succeeds ·
**the app launches on an iOS simulator**

This document exists so the session that produced this work can be discarded. It
records what was built, what was decided and why, what is deliberately missing,
and what to do next.

## Read this first if you are picking the project up

The app **runs**. Home screen, exercise library (743 seeded exercises, searchable),
routine creation, start/finish a workout, and history all render on an iOS simulator.

Getting there took four more defects after the branch merged, none of which a
green test suite could see — see section 4. The single most useful thing you can
do next is in section 6.

## Companion documents

| File | Purpose |
|---|---|
| `CLAUDE.md` | Invariants and gotchas — loaded into every session automatically |
| `docs/superpowers/specs/2026-09-19-workout-logger-design.md` | The spec. Binding authority. |
| `docs/superpowers/plans/2026-09-19-logger-foundation.md` | The 15-task implementation plan (executed) |
| `docs/superpowers/2026-09-20-device-verification.md` | **Run this before trusting any screen** |

---

## 1. What was built

The complete logging loop: create a routine → start it → log sets with rest
timers → survive a crash → resume → finish → review history.

**`packages/domain`** — pure TypeScript, zero dependencies, no imports.
`units` (kg/lb, plate rounding), `oneRepMax` (Epley), `sets` (the `CompletedSet`
type, volume), `personalRecords` (four metrics, earliest-wins ties),
`restTimer` (timestamp-derived remaining time).

**`packages/schema`** — 8 Drizzle tables in two parallel trees:

```
exercises ──┬──< routine_exercises ──< routine_sets      (the plan)
routines ───┘
exercises ──┬──< workout_exercises ──< sets              (what happened)
workouts ───┘
personal_records   (derived cache — no sync columns, rebuilt from sets)
```

Two generated migrations (`0000_magenta_korath`, `0001_sturdy_demogoblin`), plus
two test harnesses: `memoryDb.ts` (`createTestDb()` → `{db, close}`, runs the real
migrations) and `partialMigrate.ts` (`createDbAtMigration(n)` — applies a journal
prefix so data-preservation across a migration can actually be tested).

**Plan and performance are separate trees by design.** Starting a routine *copies*
it into a workout rather than referencing it, so editing a template never rewrites
logged history.

**`apps/mobile/src/data`** — the repository layer, the only place SQL is written:
`exerciseRepo`, `routineRepo`, `sessionRepo` (start, log, previous-performance,
finish, PR recompute, discard), `historyRepo`, `seedRepo`.

**`apps/mobile/src/db`** — `client` (opens SQLite, sets `foreign_keys = ON`),
`backup` (WAL checkpoint, sidecar-aware copy, close-before-restore), `bootstrap`
(backup → migrate → restore-and-rethrow on failure → seed).

**Screens** — home with resume banner, exercise library, routine list and builder,
active session with rest timer, history list and detail.

**`tools/seed-exercises`** — fetches the public-domain `free-exercise-db`, maps it,
writes the committed `curated.json`: 743 exercises across 11 equipment categories.

### Test distribution (133)

| Area | Tests |
|---|---|
| `apps/mobile/src/data` (repositories, real SQLite) | 56 |
| `packages/domain` (pure logic) | 37 |
| `apps/mobile/src/db` (backup, bootstrap) | 14 |
| `tools/seed-exercises` (mapping) | 11 |
| `packages/schema` (tables, migrations) | 10 |
| `apps/mobile/src/features` (`formatPrevious` only) | 5 |

---

## 2. What is deliberately NOT built

### Declared deferred by the plan

Progress charts · CSV import from Hevy/Strong · superset and advanced-set-type UI
(the schema and repositories already support supersets, warmup/drop/failure, RPE
and RIR — only the controls are missing) · a visible banner on a failed write.

### Missing and NOT declared — the open scope question

The final review found, and I verified, that roughly a third of the spec's
release-1 screen surface is neither built nor listed as deferred. **This is a
defect in the plan, not in the implementations.**

| Spec says | Reality |
|---|---|
| Six screens including **Settings** | Five. No Settings, so `kgToLb`/`lbToKg` are dead code and every screen hardcodes kg |
| **Personal records** in scope | Computed and cached by `finishWorkout`; `listPersonalRecords` is called by no screen |
| Builder: "set target reps and weight", **reorder**, per-exercise rest | Only add-exercise and add-set. **`targetWeightKg` is therefore always null**, which undercuts the pre-fill that justified copying routines into workouts |
| "Users can create custom exercises" | `createCustomExercise` exists, no UI |
| Home: "start empty workout" | `startEmptyWorkout` exists, no UI |
| `tracking_type` "drives which input widgets the session screen renders" | Ignored. `SetRow` always renders weight + reps, so **201 of 743 exercises (27%)** get a nonsensical input. `sets.durationSeconds` and `distanceM` are write-dead |

**Decide this before building anything else:** either extend the plan to cover
them, or write them into the deferred list explicitly.

---

## 3. Decision record

Twenty-six rulings were made during execution, most because the plan was wrong.
The ones with lasting consequences:

| Ruling | Decision |
|---|---|
| **R11** | Restored full equipment coverage (743 exercises), overriding the plan's count cap — the cap had silently deleted every machine, kettlebell and band exercise. The spec's "~300 hand-curated" was always human content work, out of scope for a script. |
| **R15 / R16** | Declared `babel-preset-expo`, `@babel/runtime`, `query-string`; enabled Metro `unstable_enablePackageExports`. **Without these the app did not bundle at all** — invisible to tests and typecheck. |
| **R17** | Replaced a provably-no-op migration test with a real data-preservation harness; made the backup WAL-aware and sidecar-aware. |
| **R19** | Replaced iOS-only `Alert.prompt` with a cross-platform modal. |
| **R20** | `useFocusEffect` refresh instead of a local counter; removed a `key={version}` that reset scroll position. |
| **R21** | `@testing-library/react-native` genuinely does not work under this repo's Vitest (Node `require(esm)` resolves its CJS `require('react-native')` against RN's Flow source, bypassing Vite's alias). Fell back to pure-function tests. **If you want component tests, this is the wall to plan around.** |
| **R22** | Set inputs lock once completed — an edit after checking would otherwise reach React state but never the database. |
| **R23 / R24** | Created the Android notification channel; added `sound` to the notification content. Without the first, rest alerts were dead on Android; without the second, silent on iOS. |

### Rulings that were later found wrong

Worth knowing, because they show where the reasoning was weak:

- **R9** — claimed a `@ts-expect-error` carried a live compile-time guard. It did not;
  the binding had no contextual type, so the directive was unused and typecheck was
  red. Self-corrected as R9a by annotating the binding.
- **R17** — fixed the WAL half of a backup finding and left the open-connection half,
  then rewrote the comment to *document* the hazard rather than close it. Caught in
  final review; the connection is now closed before a restore.
- **An instruction to close the DB connection before the *backup* copy** would have
  broken every launch, because `bootstrap.ts` calls `migrate()` on that same
  connection one line later and there is no reopen path. The implementer refused and
  explained why; a reviewer independently confirmed it.

### Parked, unresolved

- **History and tombstoned exercises.** Both history reads now agree — and they agree
  on reporting a past workout as "0 sets · 0 kg" if its exercise is later deleted.
  Latent, since no UI soft-deletes an exercise. The alternative is to left-join
  `exercises` in history reads without the tombstone filter and render "(removed)",
  treating history as immutable and the join as a name lookup. **This is a schema
  semantic that phase-2 sync will inherit — decide it deliberately.**
- **No test covers `completeSet` writing an explicit `null` through.** The omission
  path (the one that matters for partial edits) is covered; the semantics were
  verified by inspection.

---

## 4. Getting it to launch — four defects found after the merge

The branch merged with 133 tests green, typecheck clean and `expo export`
succeeding. The app then booted to a red **"App entry not found"** screen with
no error in any log. All four causes were in my own configuration, and none was
reachable by any automated check in the repo.

**1. Metro's `unstable_enablePackageExports` (my ruling R16) was the worst of them.**
I had enabled it globally so Metro could resolve `@overload/schema/migrations`.
It silently changed resolution across the entire dependency tree — Metro bundled
**1205 modules instead of 1388**, picking different builds of several packages —
and expo-router's entry chain stopped registering the `main` component.
*Replaced with `packages/schema/migrations.js`*, a two-line bridge so the subpath
resolves under both classic and exports-based resolution. **Do not re-enable that
flag**; there is a comment in `apps/mobile/metro.config.js` saying so.

**2. `expo-linking` and `expo-constants` were undeclared.** expo-router lists both
as `peerDependencies`, and peers must be declared by the consumer. Under pnpm's
strict linking they were simply absent, so the `ExpoLinking` native module was
never compiled into the app. This was the literal cause: `Cannot find native
module 'ExpoLinking'`. Fixed with `npx expo install expo-linking expo-constants`
plus a `pod install`.

**3. `query-string` was pinned to `^9`.** Also mine, from ruling R15. v9 is
ESM-only; expo-router does `__importStar(require("query-string")).stringify`,
which yields `undefined` under CJS. Pinned to `^7`, which has the shape it
expects. Note expo-router 4.0.22 imports `query-string` **without declaring it** —
that is an upstream packaging bug, which is why it has to be declared here at all.

**4. `Button` was not a `forwardRef`.** `<Link asChild>` clones its child and
passes a ref; a plain function component drops it. Worth knowing: a code review
examined this exact pattern earlier and concluded it was correct. It was not.

### What this should change about how you work on this repo

Three of the four were packaging-level. **No amount of unit testing or type
checking reaches that layer.** `pnpm bundle` catches some of it (it is in CI for
that reason) but did not catch any of these — the bundle built fine every time.

The debugging that worked was instrumenting the entry point to force the error
into a log. Indirect probing — greping Podfile.lock, fetching bundle URLs — sent
me down two wrong paths first, including one where I misread the pod name
`EXNotifications` as missing because I searched for `ExpoNotifications`.

---

## 5. Known defect patterns

Five separate queries in the plan omitted a tombstone filter on a joined level. Four
cross-platform defects shipped a feature working on one OS and dead on the other.
Both are listed in `CLAUDE.md` because they are the two mistakes most likely to recur.

A third, subtler pattern, and the one that has cost the most: **seven defects so far
were invisible to a green test suite and a clean typecheck** — the app not bundling,
a migration test that could not fail, a backup copying only the main SQLite file, and
the four launch defects in section 4. Tests passing is not evidence that packaging,
native linking, migrations, or filesystem behaviour are correct. Run the app.

---

## 6. What to do next, in order

### Verified on a device so far

Migrations run · 743 exercises seed and survive a relaunch · library renders and
searches · routine creation via the cross-platform modal · start a workout ·
finish a workout · history list with date and volume summary. Dark theme renders.
`PRAGMA foreign_keys = ON` did **not** break first launch.

### Not yet exercised at all

**Logging an actual set** — the app's entire point, and nothing has touched it.
Also: previous-performance column, rest timer, notifications, crash recovery and
resume, the discard-second-workout guard, and **Android in its entirety**.

### 1. Log one real set (highest value, ~5 minutes)

Routines → add an exercise (does the card appear *immediately*? that is the
`useFocusEffect` fix) → start → type weight and reps → tap the checkmark. Then
watch for the three defects fixed blind and never seen running:
keyboard covering the lower rows with no dismiss path; the rest timer rendering
below the fold instead of pinned; a back button on Home into the routine builder
after finishing.

Then **force-quit from the app switcher and reopen** — the resume banner should
appear with the set intact. That is the architectural promise the whole data
layer exists for and it has never been tested.

### 2. Push

`git push -u origin main`. This triggers the first CI run ever. Two steps are
unproven on Linux: `better-sqlite3` compiling, and Hermes bundling.

### 3. Resolve the scope question in section 2

Still the largest open item.

### 4. Then Plan 2

Charts, CSV import, superset/set-type UI, the failed-write banner — plus whatever
section 2 resolves into.

### Driving the simulator without hands

Useful for a future session: routes are reachable by deep link
(`xcrun simctl openurl booted "overload://routines"`), screenshots via
`xcrun simctl io booted screenshot /tmp/x.png`, and JS errors only appear in
Metro's own output — not the device syslog. Start Metro with its stdout
redirected to a file if you need to read them programmatically.

### Deferred minors worth revisiting

`lastPerformance` loads an exercise's entire history to find one row (push the
exclusion into SQL, add `LIMIT 1`) · the ~1 MB seed JSON is parsed at module scope on
every launch, not just the first · `enableChangeListener` is set but `useLiveQuery` is
never used, so five hand-rolled version counters exist where the intended mechanism
would delete them · `bootstrap.ts` imports `curated.json` by deep relative path across
a package boundary · `softDeleteRoutine` does not tombstone children, which phase-2
sync will notice.
