# Device Verification Checklist — Release 1 Logger

**Branch:** `worktree-logger-foundation` (27+ commits, 253e916..HEAD)
**Status:** 133 tests passing, `pnpm typecheck` clean, `npx expo export --platform ios` succeeds.

## Why this file exists

**No screen in this app has ever been rendered.** The build environment had no
simulator, emulator, or device. Every UI-level claim in this branch is backed by
exactly three things: TypeScript compilation, a successful Metro/Hermes bundle,
and code review.

The domain logic and the repository layer are well covered — 133 tests against
real SQLite, running the real migrations, with recorded failing-before evidence
for the load-bearing predicates. The risk is concentrated entirely in the layer
the tooling could not reach.

Work through this before trusting the app.

## Run first, in this order

### 1. Cold launch, both platforms

Migrations run, 743 exercises seed, the library screen lists and filters them.

**Highest-risk item in this list:** `PRAGMA foreign_keys = ON` was added to
`client.ts` in the final fix wave. Nothing in this app has ever run under
foreign-key enforcement. First launch now seeds 743 exercises and builds
routine/workout trees under it. A review scanned every insert path and found
nothing that should throw, but this is the first time it runs for real.

### 2. Second launch

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

### Tracking types are ignored by the session screen

`SetRow` renders weight + reps unconditionally. Measured from the committed seed
data: `weight_reps: 542, duration: 95, reps: 96, distance_duration: 10`. So
**201 of 743 exercises (27%)** render an input that makes no sense — a Plank
shows a "kg" box, a 5k run shows "kg × reps".

`sets.durationSeconds` and `sets.distanceM` exist in the schema and `completeSet`
accepts `durationSeconds`, but no caller passes it — those columns are write-dead.

The spec calls this out explicitly: `tracking_type` "drives which input widgets
the session screen renders." Roughly a three-case branch in `SetRow`.

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
