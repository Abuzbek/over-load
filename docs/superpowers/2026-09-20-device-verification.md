# Device Verification Checklist — Release 1 Logger + App Shell

**Branch:** `app-shell` (25 commits ahead of `main`, `d819896..8459228`).
**Status:** 254 tests passing, `pnpm typecheck` clean, `pnpm bundle` succeeds.

## Status — updated 2026-09-22 (branch `app-shell`, tabbed app)

The app shell changed completely: four tabs (Train, History, Progress, Profile)
replace the old stack-of-buttons home, the session screen moved outside the
tab group, and every screen was restyled against the "Editorial" design
tokens. **Every previously-verified claim in this file predates that rewrite
and must be treated as unverified until re-driven.** This update records what
has actually been re-verified since, iOS and Android **separately** — they are
not at the same point.

### iOS

**Verified this pass:**

- Set logging inputs lock after completion (checkmark, greyed row).
- Rest timer pinned at the bottom: visible without scrolling, does not cover
  the last set row, counts down correctly (observed `1:57` live).
- Duration-tracked exercises (e.g. Plank) render a single `mm:ss` box, no kg
  box.
- No notification fires after a workout is finished mid-rest: a set was
  completed at 10:54:16 (rest due ~10:56:16), the workout was finished at
  10:55:02, and the screen/Notification Center were sampled every 10s from
  10:56:06–10:57:16 with nothing delivered. Confirms the earlier fix
  (`33ed6a4`, "finishing a workout does not cancel the pending rest
  notification") survived the restyle.
- Force-quit survival: killing the app mid-workout and relaunching brings back
  the in-progress bar as "Resume", with elapsed time correctly derived from
  `startedAt` across the process kill (not reset to `0:00`).
- Finishing a workout lands on Train with the in-progress bar cleared and no
  way to navigate back into the finished session.
- The "No exercises yet" `EmptyState` renders (previously reviewed in code
  only, never seen on a device).
- All four tab titles clear the status bar at matching vertical offsets (the
  cross-tab inconsistency recorded below is fixed).

**Not verified — one gap remains open:**

- **Keyboard scroll-into-view.** Whether tapping a lower set row scrolls it
  above the software keyboard could not be re-confirmed this pass: the
  simulator's software keyboard would not appear despite repeated
  Cmd+Shift+K toggles. The relevant code
  (`automaticallyAdjustKeyboardInsets` iOS-only, no `behavior` prop on the
  `KeyboardAvoidingView`) was audited byte-for-byte against the configuration
  verified working on this same day, before the restyle, and is unchanged.
  Treat this as **not verified**, not as broken — but it has not actually been
  watched happen since the session screen was rebuilt.

Two items from the previous device pass were not re-touched this round
because nothing in scope changed their code path, and are carried forward as
still-good rather than re-claimed: the restore path (§7 below) and
notification *sound* delivery (still unconfirmed as audio, only as delivery).

### Android

**Verified this pass:** cold launch, migrations, 743-exercise seed, dark
theme (background, header, status bar) — unchanged from the first Android
build (see the "Android — first build" section below, task 5 of this plan).
The four restyled tabs (Train, History, Progress, Profile) were confirmed
navigable in the earlier per-task device work for those screens.

**Not verified at all: the session screen has never been exercised on
Android.** No Android device or emulator has logged a set, seen the rest
timer, received a rest notification, force-quit mid-workout, or hit the
in-progress bar's "Resume" path. Every session-screen claim above is iOS-only.
This is the single largest gap in this document. Before trusting the logging
loop on Android, drive it the same way it was driven on iOS: create a
routine, start it, log sets with the keyboard up, background through a full
rest period, force-quit and relaunch.

## Found and fixed during the app-shell build

- **Every tab rendered its title twice** — its own serif `display` title plus
  React Navigation's native header, both saying e.g. "Train". Invisible to
  tests and `pnpm bundle`. Fixed with `headerShown: false` on the `(tabs)`
  Stack.Screen entry (`apps/mobile/app/_layout.tsx`).
- **Fixing that removed the only thing reserving the status-bar area**, so
  titles collided with the clock. Fixed with an opt-in `Screen` `safeTop`
  prop (pushed screens keep native headers and would inset twice if it were
  automatic) plus matching `FlatList` padding in `HistoryList`.
- **Cross-tab inconsistency, fixed:** `safeTop`'s `paddingTop: insets.top`
  was overriding the base `padding: lg` in the style merge instead of adding
  to it, so the three `Screen`-based tabs sat their titles hard against the
  status bar while History (which pads its own `FlatList`) sat lower. Fixed
  by adding `insets.top + theme.spacing.lg` (`8459228`). All four tabs now
  render at the same vertical offset — confirmed on iOS this pass.
- **The in-progress bar rendered below the native tab bar**, contradicting
  both the spec and the approved mockup. Fixed by composing it into the
  `Tabs` `tabBar` prop above `BottomTabBar`, rather than mounting it as a
  sibling after `<Tabs>`.
- Full Android-specific defect list (Kotlin/Compose mismatch, silent
  `userInterfaceStyle` no-op, white status bar) is unchanged from the first
  Android build and is recorded below, in its original section.

## Why this file exists

Most of this app's UI was written without access to a simulator or emulator
for long stretches at a time. Every UI-level claim not listed as verified
above is backed by exactly three things: TypeScript compilation, a successful
Metro/Hermes bundle, and code review — and this project's own history is that
those three have together missed defects that only showed up when someone
actually ran the app, on multiple occasions, on both the original build and
this one.

Work through this before trusting the app.

## Run first, in this order

### 1. Cold launch, both platforms — ✅ iOS done, ✅ Android done

Migrations run, 743 exercises seed, the four tabs render.

### 2. Second launch — ✅ iOS done

No re-seed, no duplicate rows, startup not sluggish.

### 3. Full loop, on iOS and Android separately

Create routine → add exercise → start → log three sets → dismiss the
keyboard → see the rest timer → background the phone for the full rest and
confirm the notification **fires with sound** → finish → confirm the
in-progress bar clears and Train has no way back into the finished session →
open History and confirm the summary matches the detail.

**iOS:** verified except the keyboard scroll-into-view item (see above).
**Android:** not started. This is the checklist to work through before any
Android session-screen claim can be made.

### 4. The crash-safety claim

Log two sets, force-quit from the app switcher, reopen. The resume banner
(now the in-progress bar) should appear, and both sets should be present with
their values intact.

**iOS:** ✅ verified this pass. **Android:** not verified.

### 5. The stranded-workout guard

Start a routine, back out, then start a different routine. You should be
offered Resume / Discard and start / Cancel — not silently given a second
workout.

**Not re-verified against the new tab shell on either platform** this pass;
last confirmed working before the app-shell rewrite (`docs` history, R1 in
the prior device pass).

### 6. Previous performance

Finish a workout, start the same routine again. Set rows should read
`80 kg × 8` rather than `—`.

**Not re-verified this pass** on either platform; the underlying repository
code did not change in this project.

### 7. The restore path

Ship a deliberately broken migration to a device holding real data and
confirm the restore actually restores. **Still never executed**, on either
platform. This remains the single highest-value gap in this whole document —
it is the only defence against a bad migration destroying training history.

## Known-wrong, not fixed — decisions for you

### Deleting an exercise rewrites past workouts

Unchanged from the previous device pass: both history reads report a past
workout as "0 sets · 0 kg" if its exercise is later deleted. Latent, because
no UI soft-deletes an exercise. Recorded again in the 2026-09-22 handoff as a
decision Project B (accounts and sync) inherits.

### No CI

Unchanged. `.github/workflows/ci.yml` runs typecheck/test/bundle on push to
`main` and on PRs, but this branch has not been pushed or merged yet, so no
CI run has ever seen this work.

## Driving the simulator hands-free

`idb` works for taps, swipes and text (`idb ui tap|swipe|text|key --udid
<id>`), using **logical points** — divide screenshot pixels by 3 on this
device. Screenshots via `xcrun simctl io <id> screenshot`. Two gotchas: `idb
ui text` stops reaching the field once the *software* keyboard is enabled
(toggle it with Cmd+Shift+K via `osascript`), and the session route ignores
the iOS edge-swipe back gesture — use `xcrun simctl openurl <id>
"overload://routines"` to leave a workout without finishing it. On this
pass, the software keyboard could not be coaxed to appear at all despite
repeated toggling — the reason the keyboard scroll-into-view check above is
unverified rather than verified-and-failing.

## Android — first build, 2026-09-21 (branch `app-shell`, task 5 of the
app-shell-design-system plan)

Android had **never been built once** in this project's history before this
task. This section records what that first build took, because both defects
found here are expensive to rediscover.

**Environment:** macOS, Android SDK at `~/Library/Android/sdk`, AVD
`Medium_Phone_API_36.0` (Android 16 / API 36, arm64-v8a), OpenJDK 17.0.16
(Homebrew). Gradle 8.10.2 and NDK 26.1.10909125 were downloaded and installed
automatically by the first `pnpm android` run — nothing had to be installed by
hand. `compileSdkVersion`/`buildToolsVersion` 35, `targetSdkVersion` 34,
`minSdkVersion` 24 (all Expo SDK 52 / RN 0.76 defaults, untouched).
`apps/mobile/android/` is gitignored, generated fresh by `expo prebuild` on
every `pnpm android`.

### Defect 1 — Kotlin/Compose compiler version mismatch (build-breaking)

First build failed at `expo-modules-core:compileDebugKotlin`: the generated
`apps/mobile/android/build.gradle` defaults `kotlinVersion` to `1.9.25`
while `expo-modules-core@2.2.3`'s Compose Compiler plugin selection reads
that value, but the actual Kotlin Gradle plugin resolved from RN 0.76.0's
`libs.versions.toml` is `1.9.24`.

**Fix:** added `expo-build-properties` (`~0.13.3`) and pinned Kotlin
explicitly in `apps/mobile/app.json`:

```json
["expo-build-properties", { "android": { "kotlinVersion": "1.9.24" } }]
```

### Defect 2 — `userInterfaceStyle: "dark"` was a no-op on Android

Prebuild logged a warning that `expo-system-ui` was needed to enable this
feature; without it the root view background never switched off the Android
light default, even though the config key was present and correct.

**Fix:** added `expo-system-ui` (`~4.0.9`) as a plain dependency.

### Defect 3 — status bar stayed white even after Defect 2's fix

The prebuilt `AppTheme` extends `Theme.AppCompat.Light.NoActionBar` and
hardcodes `android:statusBarColor` to `#ffffff`. Neither `userInterfaceStyle`
nor `expo-system-ui` touches this — it is build-time native resource
controlled by Expo's `androidStatusBar` config key.

**Fix:** added to `apps/mobile/app.json`:

```json
"androidStatusBar": { "backgroundColor": "#1E1B17", "barStyle": "light-content" }
```

### Verification checklist — confirmed on `Medium_Phone_API_36.0`

- Launch, migrations, seed: 743 rows, all `deleted_at IS NULL`, all ten
  tables present, `PRAGMA foreign_keys = ON` did not break first launch.
- The bundled Newsreader serif renders identically to iOS (confirmed with a
  temporary `<Text variant="display">`, screenshotted on both platforms, then
  reverted — no variant currently ships in the real UI).
- Warm dark palette end to end, including the status bar after Defect 3's
  fix.
- Gates: `pnpm typecheck` exit 0, `pnpm test` all green, `pnpm install
  --frozen-lockfile` succeeds, `pnpm bundle` succeeds.

### Not exercised on Android, then or since

The full logging loop — start a workout, log sets, rest timer,
notifications, crash recovery, restore path — has still never been driven on
Android. Task 5 scoped that first pass to first-build health, not parity, and
no later task in this plan closed that gap. **This is the same gap called out
at the top of this document and is the single most important thing to do
next.**
