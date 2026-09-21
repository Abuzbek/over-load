# App Shell & Design System — Design

**Date:** 2026-09-21
**Status:** Approved for planning
**Supersedes nothing.** Extends `2026-09-19-workout-logger-design.md`, which remains the
binding authority for everything not restated here, and follows
`2026-09-20-release-1-scope-closure-design.md`.

## Why this exists

The app works and is verified end to end on iOS: the logging loop, crash recovery, rest
timer, records, settings and history all run on a simulator
(`docs/superpowers/2026-09-20-device-verification.md`). What it does not do is look like a
product. The home screen is six stacked buttons of equal weight; nothing on it tells you
anything about your training. Navigation is a stack rooted at that hub, so every
destination is two taps deep and a back button away.

This document designs the shell and the visual language. It is **Project A** of a
two-project decomposition agreed with the project owner.

## Scope

**In scope.** Tab navigation; a design system (tokens, typography, component kit); every
screen restyled; the repository queries the new screens require; a full device pass on
**both** platforms.

**Out of scope — this is Project B.** Accounts, authentication, a backend, per-user data
scoping and the offline-first sync engine. The owner has chosen real server-backed
accounts as the eventual target, which makes Project B substantially larger than
Project A — it is effectively auth plus the phase-2 sync layer. It gets its own spec.
Project A deliberately leaves it an obvious home: the Profile tab.

Nothing here changes the database schema.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Four tabs** — Train, History, Progress, Profile | Five is crowded on a phone; the 743-exercise library is a lookup tool, not a place to dwell, so it lives inside Train and the add-exercise flows. Four leaves Profile as the natural home for Project B. |
| D2 | **The active session is a full-screen route outside the tab group** | Mid-set, a tab bar is a distraction and a mis-tap risk. A persistent in-progress bar above the tab bar routes back into it. |
| D3 | **Visual direction: "Editorial"** — warm near-black, generous spacing, serif display headings, amber accent | Chosen by the owner from six candidate directions rendered as working mockups of the Train tab. |
| D4 | **Dark only** | A light variant is a feature, not a prerequisite for the goal, and would roughly double the surface needing verification on two platforms. Tokens are structured so light is a later addition, not a rewrite. |
| D5 | **Bundle one serif via `expo-font`** | `ui-serif` resolves to New York on iOS and Noto Serif on Android. The serif *is* the identity of D3; letting it differ per platform undercuts the whole direction. Cost is one first-party dependency and ~100–200 KB. |
| D6 | **Full scope: every screen, plus the queries the design needs** | A redesign that renders the same bare data is new paint. `listRoutines` today returns routines with no exercise count and no last-trained date. |
| D7 | **Build order: tokens → Train vertical slice → roll out** | This repo's documented lesson is that a green suite and a clean typecheck proved nothing on four separate occasions. The build order must yield a runnable, checkable app at every step, and must derive the component API from real usage rather than guesswork. |
| D8 | **Android is built and verified as part of this project, starting at step 2** | Android has never been run once. Four cross-platform defects already shipped here. We are about to touch every screen and add a bundled font. |

## Design tokens

Extends `apps/mobile/src/ui/theme.ts` in place, preserving the existing `theme.colors.x`
shape so screens migrate incrementally rather than in a flag day.

```
background    #14120F      surface       #1E1B17      surfaceRaised #241E17
border        #2E2A24      text          #F5F0E8      textMuted     #A39A8C
accent        #E8834A      onAccent      #14120F
success       #3DD68C      danger        #E5484D

spacing   xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32
radius    sm 8 · md 14 · lg 20 · pill 999
```

Type scale:

| Token | Face | Size / line | Use |
|---|---|---|---|
| `display` | serif | 30 / 34 | Screen titles |
| `title` | sans 600 | 20 / 26 | Card and section titles |
| `heading` | sans 600 | 17 / 22 | Row titles |
| `body` | sans 400 | 15 / 20 | Body copy |
| `label` | sans 600 | 12 / 16, uppercase, +1.4 tracking | Section labels |
| `caption` | sans 400 | 12 / 16 | Metadata |
| `numeric` | sans, `fontVariant: ['tabular-nums']` | inherits | Every weight, count and timer |

`numeric` is not decoration. Weights, set counts and the rest timer all change in place,
and proportional figures make them jitter.

**No shadows.** Depth comes from the `surface` → `surfaceRaised` step. iOS `shadow*` and
Android `elevation` diverge in appearance and in cost, and there is no reason to fight
that on a dark ground.

## Navigation

```
app/_layout.tsx                    bootstrap gate + font loading
app/(tabs)/_layout.tsx             Tabs + in-progress bar
app/(tabs)/index.tsx               Train
app/(tabs)/history.tsx             History
app/(tabs)/progress.tsx            Progress (personal records only — see note)
app/(tabs)/profile.tsx             Profile (settings; Project B's home)
app/session/[id].tsx               active session — OUTSIDE the tab group
app/session/[id]/add-exercise.tsx
app/routines/[id].tsx              routine builder
app/routines/[id]/add-exercise.tsx
app/exercises.tsx                  library
app/history/[id].tsx               workout detail
```

**On the Progress tab's name.** It contains personal records and nothing else in this
project. Charts remain deferred to a later plan. The tab is named Progress rather than
Records because charts will land in it and renaming a tab later is a worse outcome than a
tab that starts with one section — but nothing in Project A builds a chart.

### The in-progress bar

The one genuinely new piece of state. It renders in `(tabs)/_layout.tsx` between content
and the tab bar, showing routine name and elapsed time, and routes into the session.

It reads the active workout through a `useActiveWorkout` hook wrapping the existing
`useFocusEffect` version-counter pattern, plus a 1-second ticker that **runs only while a
workout exists** — an always-on interval behind every tab is a battery cost for nothing.

Elapsed time derives from `workouts.startedAt`, never from an accumulating counter. This
matches how the rest timer already works and is what makes it survive backgrounding.

If the workout ends or is discarded elsewhere, the bar disappears on next focus.

## Component kit

`apps/mobile/src/ui/`: `Screen`, `Text`, `Button`, `Card`, `ListRow`, `SectionLabel`,
`NumericField`, `Sheet`, `EmptyState`, `StatTile`.

Two constraints carried forward from defects that have already cost this project:

- **`Button` remains a `forwardRef`.** `<Link asChild>` clones its child and passes a ref;
  a plain function component drops it. This previously stopped the app launching, and a
  code review looked straight at the pattern and called it correct.
- **`Sheet` keeps the cross-platform modal of R19.** `Alert.prompt` is iOS-only, and
  `Alert`'s button semantics are iOS-shaped.

## Data layer

New in `apps/mobile/src/data/` — the only place SQL is written.

```ts
listRoutineSummaries(db): {
  routine: Routine;
  exerciseCount: number;
  lastTrainedAt: number | null;   // epoch ms
  primaryMuscles: string[];       // distinct, orderIndex order, max 3
}[]

getActiveWorkout(db): Workout | null   // the row, not just the id
```

`lastTrainedAt` is `max(workouts.startedAt)` for that `routineId` where
`endedAt IS NOT NULL`. `primaryMuscles` comes from the routine's exercises.

**This query spans four joined levels** — `routines`, `routine_exercises`, `exercises`,
`workouts`. A missing `deleted_at IS NULL` at any one of them is exactly the defect that
hit five separate queries during the original build. It gets **a tombstone test per
level**, not one test for the query.

It is a single grouped query, not a per-routine loop. `lastPerformance` already
demonstrates the cost of the loop form and is a known deferred minor.

Pure helpers in `packages/domain`. That package imports nothing — not even
`@overload/schema` — so these take primitives, never row types:

```ts
formatLastTrained(lastTrainedAt: number | null, now: number): string   // "Monday" · "3 weeks ago" · "Never"
summariseMuscles(primaryMuscles: string[], max: number): string[]      // distinct, order-preserving
```

The repository maps rows to primitives before calling them. Writing these to accept
`Exercise[]` would breach the zero-dependency boundary, which is enforced only by that
package's empty `package.json`.

## Error handling

- **Font loading falls back to system faces and never blocks.** Same principle as the
  personal-records rebuild fix: a cosmetic subsystem must not be able to brick launch.
  The splash holds only until fonts resolve or fail.
- **Every list gets a real `EmptyState`** — no routines, no history, no records, no search
  results. The current app has none.
- The bootstrap error screen is restyled; its behaviour is unchanged.

## Testing

R21 stands: `@testing-library/react-native` does not work under this repo's Vitest, and
this spec does not pretend otherwise.

| Layer | How |
|---|---|
| Pure functions (`formatLastTrained`, muscle summary, elapsed formatting) | Vitest, test-first |
| Repository queries | Real SQLite, real migrations, **tombstone regression per joined level** |
| Screens | Run on iOS **and** Android; recorded in the device checklist |

`pnpm run ci` at every step. The bundle step matters more than usual here: a bundled font
changes the asset pipeline, and packaging defects in this repo have repeatedly been
invisible to tests and typecheck.

## Rollout

1. **Land scope-closure.** Commit the three device-verification fixes, merge the 25
   commits to `main`, push, let CI run.
2. **Tokens, font loading, `Screen`/`Text`/`Button`.** Build and launch on **Android**
   here. First Gradle run will have its own problems; they are far cheaper now than after
   six screens depend on them.
3. **Tab shell.** Four tabs as thin wrappers over existing content, session route moved
   out of the tab group.
4. **Train vertical slice.** `listRoutineSummaries`, Train UI, in-progress bar.
5. **Migrate the rest.** History, Progress, Profile, library, builder, session.
6. **Full device pass, both platforms.** Update `2026-09-20-device-verification.md`.

## Risks

- **Android is a genuine unknown.** It has never been built. Budget for Gradle, SDK and
  native-module problems that have nothing to do with this design.
- **Bundled font × pnpm strict linking × Metro asset resolution.** This is the exact
  combination behind the `unstable_enablePackageExports` and undeclared-peer failures that
  previously stopped the app launching. Declare the dependency explicitly; do not re-enable
  that Metro flag.
- **Touching every screen re-opens every cross-platform risk.** Keyboard behaviour,
  notification channels and safe-area insets have each already produced a one-platform
  defect here.

## Parked, deliberately

The tombstone semantic — deleting an exercise reports past workouts as "0 sets · 0 kg" —
remains undecided. Surfacing muscle names from `exercises` makes it marginally more
visible but does not force the call, and a schema semantic that phase-2 sync will inherit
should not be smuggled into a redesign. It stays recorded in the handoff document.
