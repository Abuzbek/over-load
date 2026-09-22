# Session Handoff — Overload, App Shell & Design System

**Date:** 2026-09-22
**Branch:** `app-shell`, 25 commits ahead of `main` (`d819896..8459228`). **Not merged,
not pushed.** No CI run has seen this work.
**State:** 254 tests / 26 files passing · `pnpm typecheck` exit 0 · `pnpm bundle`
succeeds · **the app runs, tabbed, on both an iOS simulator and an Android emulator**,
verified to different depths on each (see section 2).

This document exists so the session that produced this work can be discarded. It
records what was built, what is verified where, what defects this build found and
fixed, what Project B inherits, and what is still open.

## Read this first if you are picking the project up

The app shell is now four tabs (Train, History, Progress, Profile) with the active
session as a full-screen route outside the tab group, restyled end to end against
the "Editorial" design tokens. The logging loop itself — the domain and repository
layers underneath — did not change; only navigation, visuals and the new
Train-tab/in-progress-bar queries did.

**iOS is verified to the same depth as the previous handoff, on the new shell.
Android is not: the session screen — the entire logging loop — has never been
touched on an Android device or emulator.** That is the single most important thing
in this document. See `docs/superpowers/2026-09-20-device-verification.md` for the
exact, per-check breakdown.

## Companion documents

| File | Purpose |
|---|---|
| `CLAUDE.md` | Invariants and gotchas — loaded into every session automatically |
| `docs/superpowers/specs/2026-09-21-app-shell-design-system-design.md` | The spec for this project. Binding authority. |
| `docs/superpowers/plans/2026-09-21-app-shell-design-system.md` | The 17-task implementation plan (executed) |
| `.superpowers/sdd/2026-09-21-app-shell-design-system/progress.md` | The full ledger — every ruling, defect and finding from this build |
| `docs/superpowers/2026-09-20-device-verification.md` | **Run this before trusting any screen** — rewritten for the tabbed app |
| `docs/superpowers/2026-09-20-session-handoff.md` | The Release 1 handoff this one follows |

---

## 1. What was built

**Navigation.** `app/(tabs)/` — Train (`index`), History, Progress, Profile — as a
`Tabs` navigator with a persistent in-progress workout bar composed into the tab bar
itself (above `BottomTabBar`, not mounted as a sibling after `<Tabs>` — a sibling
renders below the whole navigator, tab bar included). `app/session/[id].tsx` sits
**deliberately outside** the tab group, per the spec: mid-set, a tab bar is a
distraction and a mis-tap risk, and the in-progress bar is what routes back into it.
`app/routines/`, `app/exercises.tsx` and `app/history/[id].tsx` also stay outside the
tab group as pushed, full-screen routes with their own native headers.

**Design system**, `apps/mobile/src/ui/`: dark-only "Editorial" tokens (warm
near-black background, serif display headings, amber accent, no shadows — depth
comes from a `surface`/`surfaceRaised` step) in `theme.ts` and `typography.ts`,
consumed through ten components: `Text`, `Screen`, `Button`, `Card`, `ListRow`,
`SectionLabel`, `EmptyState`, `StatTile`, `Sheet`, `NumericField`. One bundled serif
(`Newsreader_600SemiBold`, imported per-weight to avoid the package's 14-face
index) loads through `expo-font` behind a `FontsProvider`/`useSerifLoaded()` context
that never blocks launch — same "cosmetic subsystem must not brick the app"
principle as the personal-records rebuild.

**`packages/domain`** — three new pure helpers, all in `formatLastTrained.ts`,
all primitive-in/primitive-out per the package's zero-dependency rule:
`formatLastTrained(lastTrainedAt, now)` ("Monday" / "3 weeks ago" / "Never"),
`summariseMuscles(primaryMuscles, max)`, `formatElapsed(ms)`.

**New repository queries**, `apps/mobile/src/data/`: `listRoutineSummaries(db)`
(`routineRepo.ts`) — one grouped query spanning `routines` → `routine_exercises` →
`exercises` → `workouts`, returning exercise count, `lastTrainedAt` and up to three
`primaryMuscles` per routine, with a tombstone test at each of the four joined
levels (the exact defect class that hit five queries during the original build).
`getActiveWorkout(db)` (`sessionRepo.ts`) — the active workout row itself, feeding
the in-progress bar.

**Screens.** All four tabs and the session screen were rebuilt against the new
component kit: Train on `listRoutineSummaries`, History (list + detail), Progress
(personal records as 2x2-wrapped stat tiles — still records only, no charts),
Profile (settings, and Project B's intended home), and the active session.

### Test distribution (254, up from 133)

Growth came from: the typography scale (6), the three domain helpers plus their
timezone-aware `formatLastTrained` suite, the two new repository queries with their
tombstone-per-level tests, `SetRow`/`routineTargets` tracking-type coverage, and a
new test covering `addSet`'s carry-forward of the previous set's load
(`6c60181`, added after the device pass surfaced it as worth locking down).

---

## 2. What is verified on which platform

**iOS — verified this project:**

- Set logging inputs lock after completion.
- Rest timer pinned at the bottom, visible without scrolling, does not cover the
  last set row, counts down correctly.
- Duration-tracked exercises render one `mm:ss` box, no kg box.
- No notification fires after finishing a workout mid-rest (sampled live, confirmed
  the earlier fix survived the restyle).
- Force-quit survival: the in-progress bar returns as "Resume" with elapsed time
  correctly derived from `startedAt` across a process kill.
- Finishing lands on Train with the bar cleared and no way back into the session.
- The "No exercises yet" `EmptyState` renders (previously reviewed in code only).
- All four tab titles clear the status bar at matching offsets.

**iOS — the one open gap:** whether the keyboard scrolls a tapped lower set row into
view could not be re-confirmed. The simulator's software keyboard would not appear
despite repeated toggling. The code (`automaticallyAdjustKeyboardInsets` iOS-only, no
`behavior` on the `KeyboardAvoidingView`) was audited byte-for-byte against the
configuration verified working earlier the same day and is unchanged, but this is an
audit, not an observation. Treat it as unverified.

**Android — verified this project:** cold launch, migrations, 743-exercise seed, the
warm dark palette end to end including the status bar, and the four restyled tabs
being navigable (confirmed in the per-task device work for History/Progress/Profile
and Train).

**Android — not verified at all: the session screen.** No Android device or
emulator has ever logged a set, seen the rest timer, received a rest notification,
force-quit mid-workout, or exercised the in-progress bar's Resume path. This gap
predates this project (it was true in the Release 1 handoff too) and this project
did not close it — task 5 built and verified Android for the shell and font work
only; no later task in this plan re-opened the session screen on Android.

**Not re-verified on either platform this project** (unchanged code paths, not
re-driven, not because anything is known broken): the stranded-workout guard,
previous-performance pre-fill, and the restore path (§7 of the device-verification
doc — still never executed on any platform, still the single highest-value gap in
this codebase's testing story).

---

## 3. Defects found and fixed during this build

**Android (task 5 — first Android build ever):**

1. Kotlin/Compose compiler mismatch (1.9.25 wanted vs 1.9.24 resolved) —
   build-breaking. Fixed with `expo-build-properties` pinning `kotlinVersion`.
2. `userInterfaceStyle: "dark"` was a silent no-op on Android — needs
   `expo-system-ui` installed, which was undeclared. The app *looked* launched and
   functional while rendering light native chrome.
3. Status bar stayed white even after (2) — a separate, build-time native resource
   (`androidStatusBar` config key), untouched by either `userInterfaceStyle` or
   `expo-system-ui`.

**Navigation (task 9):**

4. Nesting the Tabs navigator under the root Stack rendered two stacked headers
   ("(tabs)" then e.g. "Train"). Fixed with `headerShown: false` on the `(tabs)`
   `Stack.Screen` — now guarded with an explanatory comment after a reviewer flagged
   that the route tree is invisible to both the test suite and `pnpm bundle`, so a
   later edit could silently reintroduce it with every gate green.

**In-progress bar (task 10):**

5. The brief's own mount code rendered the bar *below* the native tab bar,
   contradicting both the spec and the approved mockup. Fixed by composing it into
   the `Tabs` `tabBar` prop above `BottomTabBar`, which required declaring
   `@react-navigation/bottom-tabs` explicitly (present only transitively via
   expo-router — not good enough under this repo's pnpm strict linking).

**Session screen restyle (task 16), found by the controller driving the app
directly after three implementer agents stalled mid-device-pass:**

6. Every tab rendered its title twice — its own serif `display` title plus React
   Navigation's native header. Fixed by extending (4)'s `headerShown: false`.
7. Fixing (6) removed the only thing reserving the status-bar area, so titles
   collided with the clock. Fixed with an opt-in `Screen` `safeTop` prop (pushed
   screens keep real headers and would double-inset if it were automatic), plus
   matching `FlatList` padding in `HistoryList`.

**Final polish (task 17 follow-up, `8459228`):**

8. `safeTop`'s `paddingTop: insets.top` was overriding the base `padding: lg` in the
   style merge rather than adding to it, so the three `Screen`-based tabs sat their
   titles against the status bar while History (which pads its own `FlatList`) sat
   lower. Fixed by adding `insets.top + theme.spacing.lg`. All four tabs now match,
   confirmed on iOS.

**Process note, recorded because it happened three times:** three implementer
agents stalled mid-session during sustained device driving on this plan (once on
task 16's device work specifically, twice more on retries — one stall happened on a
short audit dispatch with no device work at all, which ruled out "device driving
takes too long" as the sole cause; the controller's own tool calls were also failing
around the same window). The controller took over device verification directly for
tasks 16 and 17 rather than continuing to retry a degraded delegation path.

---

## 4. What Project B (accounts and sync) inherits

- **The Profile tab** is built as its intended home — currently settings only.
- **The tombstone semantic is still undecided.** Deleting an exercise makes both
  history reads report a past workout as "0 sets · 0 kg". Still latent (no UI
  soft-deletes an exercise yet), still not decided. The alternative on record:
  left-join `exercises` in history reads without the tombstone filter and render a
  "(removed)" marker, treating history as immutable and the join as a name lookup
  rather than a membership test.
- **`softDeleteRoutine` does not tombstone children** — carried over from Release 1,
  unchanged here, and something a sync layer built on tombstones will need to
  notice.
- **No accounts, auth, backend, or per-user data scoping exist anywhere in this
  app.** Project A (this project) deliberately built nothing toward that beyond
  leaving Profile as the landing spot — see the spec's Scope section.

---

## 5. Incoming scope — muscle-volume "Levels" view (not part of this project)

Recorded at the end of the ledger, for whoever specs it next. The owner supplied
reference screenshots of a muscle-volume "Levels" view and wants Progress to work
similarly. Decisions already taken, ahead of that spec being written:

- Map (or equivalent visual) on top, personal records retained below.
- Ship against this app's existing 17-muscle taxonomy rather than re-tagging all
  743 exercises to the reference's 22 — the reference splits shoulders into
  front/side/rear and adds serratus/tibialis/obliques; this app has one `shoulders`
  bucket of 120 exercises.
- Feasibility already checked: sets-per-muscle is computable today (`sets` →
  `workout_exercises` → `exercises`, `primaryMuscle` + `secondaryMuscles`) with no
  schema change.
- Open assumption to confirm before building: secondary muscles weigh 0.5 of a set
  — the only way to reproduce the reference's half-set values.
- Dominant cost is expected to be the anatomical SVG asset, not the code.
- Sequencing: this project (tasks 16-17) finishes first, then this gets its own spec.

---

## 6. What to do next, in order

### 1. Drive the session screen on Android (highest value, currently zero coverage)

Create a routine, start it, log sets with the keyboard up, background through a
full rest period and confirm the notification fires with sound, force-quit and
relaunch to confirm the in-progress bar's Resume path. This is the same loop that
was driven on iOS for both this project and Release 1 — it has simply never
happened on Android at all.

### 2. Get the iOS keyboard onto the simulator to close the one remaining iOS gap

Whatever blocked the software keyboard from appearing (repeated Cmd+Shift+K
toggling did not work) needs a different approach — a real device, a simulator
reset, or a different toggle path — to actually watch a lower set row scroll into
view rather than continuing to rely on a code audit.

### 3. Merge and push

This branch is local, 25 commits ahead of `main`, not pushed. Merging triggers the
first CI run this work will have seen.

### 4. The restore path (§7 of the device-verification doc)

Unchanged from Release 1: still never executed on any platform, still the only
defence against a bad migration destroying training history.

### 5. Then spec the muscle-volume "Levels" view (section 5 above)

### Driving the simulator/emulator without hands

Useful for a future session, unchanged from Release 1 plus one new gotcha: `idb`
taps/swipes/text work on iOS using logical points (screenshot pixels ÷ 3 on this
device); `idb ui text` stops reaching a field once the software keyboard is
enabled; the session route ignores the iOS edge-swipe back gesture (use `xcrun
simctl openurl <id> "overload://routines"` instead). New this project: the
software keyboard would not appear at all during the final device pass despite
repeated toggling — if that recurs, try a full simulator restart before assuming
the code regressed.
