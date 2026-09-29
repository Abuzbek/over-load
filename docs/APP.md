# Overload

An offline-first workout logger for iOS and Android. It is being turned into a
platform that coaches pay for.

**Stack:** Expo SDK 57 / React Native 0.86 · TypeScript · pnpm monorepo · SQLite + Drizzle (on-device) · Firebase (Auth, Firestore, Cloud Functions) · bundle ids `com.overload.app` (Android), `uz.overload.app` (iOS production)

## Words

**Program**: a repeating cycle of days · **Workout**: a named plan you can train · **Session**: a workout you performed · **Exercise**: a movement in the catalogue · **Gym**: a place you train and its equipment · **Plan**: the generator's output before it becomes a program.

## Features

**Sign-in & onboarding**
- Apple and Google sign-in (phone/Telegram built but hidden). Sign-in is required.
- Onboarding asks for profile, goal, experience, gym type and schedule. It creates the gym, then generates a program.

**Exercise catalogue**
- 1,213 exercises with instructions, muscles, equipment and history.
- Picker filters: muscle, type, laterality, equipment, range of motion, stability, gym.
- Results are grouped by equipment and ranked by recommendation.

**Gyms & equipment**
- Several gyms, each with its own equipment. Equipment filters the catalogue.
- The weight editor depends on the equipment category: bars, plates, stacks, racks.

**Program generator**
- Targets a weekly set count per muscle. Focus muscles get +50%; unfocused muscles drop to two-thirds of their target.
- Every muscle gets its first exercise before any focus muscle gets a second. Big muscles get compounds, small ones isolation work.
- Abs count only their own exercises and train two days a week.
- Sets rep ranges, RIR and rest, and keeps each session within the time the user chose.

**Periodization**
- A block of 1–52 cycles (default 7), with a deload first, last or not at all.
- Hypertrophy: RIR tapers towards failure sets. Strength: moderate cycles alternate with heavy ones (2–4 reps).
- Heavy barbell lifts never go to failure.
- Bodyweight exercises add a rep each cycle; isolation work rotates rep zones.
- Any cycle's sets can be edited. After a block, lifts that stalled move to a new rep range.
- Cycle preview: look at past and future cycles without starting them.

**Programs & workouts**
- Create a program by generating it or building it from scratch.
- Editor with a tab per day. Settings: cycles, deload, periodization, duplicate, archive, delete.
- The workout overview shows target muscles and each exercise's sets. Opening a workout never starts it; only Start Workout does.

**Smart progression**
- Estimates a one-rep max from last time's reps and RIR, aiming one rep higher.
- Picks the heaviest weight the gym's equipment can actually load.
- With no history, starts from bodyweight, gender, experience and movement.
- Re-plans the remaining sets after each completed set. The wand chip explains each suggestion.

**Session logger**
- One exercise per page, with an exercise strip on top, a workout clock and a rest timer.
- Numbers go in on the app's own keypad (digits, RIR, full/partial reps).
- Set types: normal, warm-up (generated), drop, myo, failure. Supersets.
- Swipe to delete a set. Pause and resume. Swap an exercise (smart substitutes or the full library).
- Plate calculator for barbell lifts.
- Recovers after a crash or force-quit. Rest notifications on both platforms.
- On finish: fireworks, a body map, records beaten, volume, and editable time and sets.

**Dashboard**
- Weekly rings compared against the program.
- Widgets: workouts (sets and volume), exercise e1RM tiles with detail stats, a habits heatmap with a calendar and streak, weight trend.

**Body tracking**
- Weight and body fat, measurements, progress photos (stored on the phone, not synced yet).
- Reached from the centre + shortcuts, which also hold Up Next, New Program and New Workout.

**Progress**
- Muscle volume list, heatmap, history.

**Sync**
- The phone's SQLite database is the source of truth. Firebase keeps a copy under `users/{uid}`.
- The newer `updatedAt` wins. Changes are queued by database triggers.
- One account per phone. Signing out clears that account's data.

## Rules the code keeps

Weight is always stored in kg · timestamps are epoch ms · deletes are tombstones (`deleted_at`) · `packages/domain` is pure TypeScript with no imports · only `src/data/` writes SQL · the catalogue and `personal_records` are rebuilt, not synced.

## Layout

`packages/domain` (logic) · `packages/schema` (tables, migrations) · `apps/mobile` (app: `app/` routes, `src/data` repositories, `src/features` screens, `src/ui` design system) · `functions/` (Cloud Functions) · `tools/` (catalogue and asset builders)

## Not built yet

- **Coach platform:** invite codes, read-only clients, measurement reminders, per-client pricing.
- Set types in the workout builder; left/right logging.
- Automatic warm-ups; the block re-tune changing set types.
- Exercise images and videos (plan: Cloudflare R2); progress photo sync (Firebase Storage).
- Removing an exercise from a workout; regenerating a program.
- Enabling phone/Telegram sign-in; Firebase setup for the preview and production profiles; an Android verification pass.
