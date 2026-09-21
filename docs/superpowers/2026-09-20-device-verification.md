# Device Verification Checklist — Release 1 Logger

**Branch:** `worktree-logger-foundation` (27+ commits, 253e916..HEAD)
**Status:** 133 tests passing, `pnpm typecheck` clean, `npx expo export --platform ios` succeeds.

## Status — updated 2026-09-21 (branch `scope-closure`, 216 tests)

The **logging loop now runs end to end on an iOS simulator**, driven with `idb`
against a booted iPhone 17 Pro and Metro on 8081.

**Verified this pass (iOS):**

- Log a real set — type weight + reps, tap the checkmark. Inputs lock after
  completion (R22). Decimal weight (`62.5`) accepted.
- **Tracking types drive the session inputs.** A `duration` exercise renders a
  single `mm:ss` field and no kg box; `weight_reps` renders kg + reps.
- **Rest timer** appears pinned at the bottom, visible without scrolling, and
  counts down (1:58 → 1:33). Restarts on each completed set.
- **Rest notification fires** on iOS ("Rest complete / Time for your next set").
- **Crash recovery.** Force-quit from the app switcher mid-workout → resume
  banner on relaunch → both sets intact with exact values. *This was the
  architectural promise the whole data layer exists for; it holds.*
- **Previous performance** pre-fills (`60 kg × 8`) from the prior workout.
- **Volume gating.** History summary read `2 sets · 980 kg` = 60×8 + 62.5×8,
  with the duration exercise correctly contributing zero.
- **History summary matches detail** (`1. 60 kg × 8`, `2. 62.5 kg × 8`).
- **Navigation after finishing** lands on Home with no back button (`dismissAll`
  + `replace`).
- **Records screen** — max weight 62.5 kg, Est. 1RM 79.2 kg (Epley), max volume
  500 kg, max reps 8 dated to the *earlier* workout (earliest-wins tie-break).
- **Settings kg/lb** — switching to lb renders 137.8 lb / 174.5 lb / 1102.3 lb
  and leaves reps unitless; the preference persists across screens.
- **Stranded-workout guard** — starting a second routine offers Resume /
  Discard and start / Cancel. Discard works.
- **Routine builder** reorder (Move up/Move down) and target weight controls.

**Defects found this pass:** see "Found on device" below — three fixed, one open.

**Still not started:** Android in its entirety (SDK, `adb` and AVD
`Medium_Phone_API_36.0` are installed, but the app has never been built for it),
the restore path (§7), and notification *sound* (delivery confirmed, audio not).

## Found on device — 1–3 fixed and re-verified on device, 4 open

**1, 2 and 3 are fixed.** Each was re-tested on the simulator after the fix, not
just re-read: the builder now renders `Set 1`…`Set 5` with no target box for a
plank; completing a set at 11:23:12 and finishing the workout at 11:23:31
produced **no** notification at the 11:25:12 fire time (Notification Center
empty for today); and tapping the lowest set row now scrolls it to sit directly
above the keyboard. The pure descriptors behind the builder fix are covered by
`routineTargets.test.ts` (12 tests). Fixes 2 and 3 are a handler line and a
ScrollView prop — there is no unit-test seam for either (see R21), so the device
run is their evidence.

1. **The routine builder is not tracking-type aware.** `RoutineBuilder.tsx` has
   no reference to `trackingType` at all — it renders `Weight (kg)` + `Reps` and
   displays `— × 8` for every exercise, including `duration` and
   `distance_duration` ones. Task 5 of the scope-closure plan fixed this in the
   *session* screen (`SetRow`/`setInputs.ts`) but left the *planning* tree
   hardcoded. A plank was planned as "8 reps at a kg target".
   **Fixed:** `routineTargets.ts` now supplies the target inputs and the set
   line per tracking type, mirroring `setInputs.ts` on the session side.
   `routine_sets` has no duration or distance column, so those types get no
   target box rather than one whose value would be discarded — adding the
   columns is a schema change, deliberately not done here.

2. **Finishing a workout does not cancel the pending rest notification.**
   `cancelRestNotification()` is called only from the rest timer's `onDismiss`
   (the Skip button). The "Finish workout" handler in `ActiveSession.tsx` calls
   `finishWorkout` and navigates away without cancelling. Observed live: set
   completed 11:05, workout finished 11:06, "Time for your next set" notification
   delivered 11:07 — after the workout was over.
   **Fixed:** the Finish handler now clears the rest state and calls
   `cancelRestNotification()`. Note the sibling case left open: discarding a
   workout from the routine builder while a rest is pending does not cancel it
   either, since `scheduledId` is module-global.

3. **The focused set input is not scrolled into view when the keyboard opens.**
   `KeyboardAvoidingView` does resize correctly and the lower rows *are*
   reachable by scrolling with the keyboard up — so this is narrower than the
   original worry. But the ScrollView has `keyboardDismissMode="interactive"`
   and no `automaticallyAdjustKeyboardInsets`, so tapping a lower set row puts
   the cursor in a field hidden behind the keyboard and the user must scroll
   manually to see what they are typing.
   **Fixed:** the ScrollView takes `automaticallyAdjustKeyboardInsets` on iOS,
   and the `KeyboardAvoidingView` no longer also uses `behavior="padding"` —
   the two together would apply the keyboard height twice. The view still
   pins the rest timer, which was its other job.

4. **Minor:** entering Routines via deep link (`overload://routines`) renders a
   light-filled back button instead of the themed dark one used on the normal
   push path.

### Driving the simulator hands-free

`idb` works for taps, swipes and text (`idb ui tap|swipe|text|key --udid <id>`),
using **logical points** — divide screenshot pixels by 3 on this device.
Screenshots via `xcrun simctl io <id> screenshot`. Two gotchas: `idb ui text`
stops reaching the field once the *software* keyboard is enabled (toggle it with
Cmd+Shift+K via `osascript`), and the session route ignores the iOS edge-swipe
back gesture — use `xcrun simctl openurl <id> "overload://routines"` to leave a
workout without finishing it.

## Why this file exists

Most of this app's UI was written without access to a simulator. Every UI-level
claim not listed as done above is backed by exactly three things: TypeScript
compilation, a successful Metro/Hermes bundle, and code review.

The domain logic and the repository layer are well covered — 133 tests against
real SQLite, running the real migrations, with recorded failing-before evidence
for the load-bearing predicates. The risk is concentrated entirely in the layer
the tooling could not reach.

Work through this before trusting the app.

## Run first, in this order

### 1. Cold launch, both platforms — ✅ iOS done, Android pending

Migrations run, 743 exercises seed, the library screen lists and filters them.

**Highest-risk item in this list:** `PRAGMA foreign_keys = ON` was added to
`client.ts` in the final fix wave. Nothing in this app has ever run under
foreign-key enforcement. First launch now seeds 743 exercises and builds
routine/workout trees under it. A review scanned every insert path and found
nothing that should throw, but this is the first time it runs for real.

### 2. Second launch — ✅ iOS done

No re-seed, no duplicate rows, startup not sluggish. (The seed JSON is ~1 MB and
is parsed at module scope on every launch, not just the first — a known deferred
minor.)

### 3. Full loop, on iOS and Android separately

Create routine → add exercise → start → log three sets → dismiss the keyboard →
see the rest timer → background the phone for the full rest and confirm the
notification **fires with sound** → finish → check where the back button goes →
open History and confirm the summary matches the detail.

Three items here were fixed without ever being seen running, and are the most
likely to still be wrong:

- **Keyboard on the session screen.** `decimal-pad` has no return key on iOS. A
  `KeyboardAvoidingView` plus `keyboardDismissMode="interactive"` was added; the
  question is whether the lower set rows are actually reachable with the keyboard up.
- **Rest timer placement.** It was rendering inline below the "Finish workout"
  button; it is now a pinned flex sibling of the ScrollView. Confirm it is visible
  mid-workout without scrolling, and that it does not cover the last set row.
- **Navigation after finishing.** `router.dismissAll()` then `replace('/')`.
  Confirm Home has no back button leading into the routine builder.

### 4. The crash-safety claim

This is the architectural promise the whole data layer is built around.

Log two sets, force-quit from the app switcher, reopen. The resume banner should
appear, and both sets should be present with their values intact.

### 5. The stranded-workout guard

Start a routine, back out with the Android hardware back button, then start a
different routine. You should be offered Resume / Discard and start / Cancel —
not silently given a second workout. Before the final fix wave, the first
workout became permanently invisible to every screen.

### 6. Previous performance

Finish a workout, start the same routine again. Set rows should read
`80 kg × 8` rather than `—`.

### 7. The restore path

Ship a deliberately broken migration to a device holding real data and confirm
the restore actually restores.

This is the hardest thing here to test and the most important: it is the only
defence against a bad migration destroying training history. It has never been
executed. The connection is now closed before the restore copy (iOS `copyAsync`
unlinks the destination first; Android overwrites in place — two different
failure modes under an open handle).

## Known-wrong, not fixed — decisions for you

### ~~Tracking types are ignored by the session screen~~ — closed 2026-09-21

Closed by task 5 of the scope-closure plan and confirmed running on a simulator:
`SetRow` renders from `inputsFor(trackingType)`, so a plank shows one `mm:ss`
box and no kg box. `sets.durationSeconds` and `distanceM` are no longer
write-dead.

The measurement that motivated it, for reference: `weight_reps: 542,
duration: 95, reps: 96, distance_duration: 10` — **201 of 743 exercises (27%)**
were rendering a nonsensical input.

The same defect survived one layer up, in the routine *builder*, until
2026-09-21 — see finding 1 above. `routine_sets` still has no target duration
or distance column, so a plank can be planned but not given a target.

### Deleting an exercise rewrites past workouts

Both history reads now agree — and they agree on reporting a past workout as
"0 sets · 0 kg" if its exercise is later deleted. Latent today, because no UI
soft-deletes an exercise. It should be a chosen answer rather than a side effect
of a consistency fix.

The alternative: left-join `exercises` in history reads without the tombstone
filter and render the name with a "(removed)" marker, treating history as
immutable and the join as a name lookup rather than a membership test.

### No CI

There is no CI anywhere in this repo. `pnpm typecheck` is the only enforcement
for the type-safety story — including a `@ts-expect-error` guard that is
meaningless unless typecheck runs — and it fires only when someone remembers.
A ten-line workflow running `pnpm test && pnpm typecheck` makes the existing
gates real.
