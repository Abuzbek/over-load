# Programs and the Client Journey — Design

**Date:** 2026-09-22
**Status:** Vision recorded; one slice approved for build
**Extends** `2026-09-19-workout-logger-design.md` and `2026-09-21-app-shell-design-system-design.md`.

## Why this exists

The owner described the whole shape of the product: two sides (client and coach),
an access model that depends on whether a client has a coach, a first-run journey,
and a program system with three creation paths. Almost none of it is built.

This document records that vision so it is not lost, states what each part depends
on, and marks the **one slice being built now**: a single active program.

Everything here except that slice is **plan, not commitment**. Ordering and detail
will change.

## The two sides

| Side | State |
|---|---|
| **Client** | The whole app as it exists today. |
| **Coach** | Nothing built. Not scoped here beyond its effect on client access. |

### Access model

- A client **with** a coach — either they already have one, or a coach invited them —
  gets every feature **free**.
- A client **without** a coach must **purchase** the app.
- **Today: everything is free for everyone.** The paywall is future work; nothing in
  this document builds it.

This is the first thing that needs an account system to exist, because "does this
client have a coach" is a server-side fact. It therefore sits behind Project B
(accounts and sync), which has its own spec and is not started.

## First-run journey (future)

For the client-without-a-coach case:

1. **Intro** — a banner/marketing screen introducing the app.
2. **Invitation code** — a modal asking whether they have a coach invitation code.
   Entering a valid one routes to the coached (free) path.
3. **Onboarding** — log in or register.
4. **Profile questions**, for a new account: age, gender, weight, height, cardio
   experience, lifting experience, daily activity level, and more.
5. **Subscription** — details deliberately undecided.
6. The app proper.

**Every step here depends on accounts.** Steps 2–5 are meaningless without a server:
an invitation code has to be validated, a registration has to persist somewhere, a
subscription has to be verified. The `More → Account` screen already lays out the
profile and security fields as inert placeholders for exactly these.

Note the profile questions are the same fields already stubbed in `AccountScreen`,
plus **daily activity level**, which is new.

## Programs — corrected model

**There is no "routine".** The owner was explicit: the concept does not exist in the
product. Two things exist.

**A workout** is a named set of exercises — "Full body", "Upper", "Push". It stands on
its own and lives in the **workout library**.

**A program is a day cycle**, not a calendar week. It is an ordered list of days —
Day 1, Day 2, Day 3 … — each holding a workout or nothing (rest). The cycle repeats;
it is not pinned to Monday–Sunday.

- A new program starts with **seven** days, because that is the common case.
- **+ Add day** grows it. The cap is 100, a guard rail rather than a product rule —
  cycles that long are not a real use case.
- A day gets its workout either by **picking one from the library** (reuse) or by
  **adding exercises directly**, which builds that day its own workout, named
  `<program> · Day N`, and puts it in the library like any other.

```
"Beginner full body"   Day 1 Full body · Day 2 rest · Day 3 Full body ·
                       Day 4 rest · Day 5 Full body · Day 6 rest · Day 7 rest
"PPL"                  Day 1 Push · Day 2 Pull · Day 3 Legs · Day 4 rest · Day 5 Push …
```

Three consequences:

1. **A workout is reused across days, not owned by one.** Days 1/3/5 all point at the
   same "Full body" workout. Editing it changes all three, which is the point. A
   program→workout link is a **many-to-many through the day**, not a parent column on
   the workout.
2. **The cycle is the program.** A program with no days assigned is just a name.
3. **Day numbering is by position, not by stored index.** `program_days.day_index` is
   the stored order; the label is the row's position, so a gap (a day tombstoned
   later) still reads Day 1, Day 2, Day 3.

**There is no empty workout.** Starting a session with no plan is gone from the
product: every workout comes from the library or from a program day. The repository
function behind it (`startEmptyWorkout`) is deleted; the bare insert survives only as
a test fixture, `startBareWorkout`, because the session and history tests need a
workout to log sets into.

**The two libraries:**

| Library | What it holds |
|---|---|
| **Program library** | Archived programs — every program that is not the active one. |
| **Workout library** | Standalone workouts. **Starts empty.** "New workout" adds one; so does building a day's workout inline. |

### Naming, decided

The vocabulary is one word per concept, in the product **and** in the database:

| Concept | Tables |
|---|---|
| A repeating cycle of days | `programs`, `program_days` |
| A named plan you can train | `workouts`, `workout_exercises`, `workout_sets` |
| A plan you actually performed | `sessions`, `session_exercises`, `session_sets` |
| A movement in the catalogue | `exercises` |

**There is no `routine` anywhere.** An earlier version of this document kept the
name, arguing a rename was a migration plus a sweep across every repository,
screen and test for no behavioural gain. That was wrong twice over: the word
`routine` does not exist in the product, and the table named `workouts` held the
*performed* thing, so the name the owner cares about was taken by the wrong
concept. Migration 0008 renames six tables and six columns.

The renames go in a fixed order, because `routines` cannot become `workouts`
until the old `workouts` has become `sessions`. `ALTER TABLE ... RENAME TO` and
`RENAME COLUMN` do not rebuild a table, so the foreign-key hazard that broke
0005 does not apply here.

### Creation paths (future)

Choosing to create a program offers three routes:

**1. Smart generation.** The app builds the program from answers to:

| Question | Values |
|---|---|
| Primary goal | muscle hypertrophy · muscle strength · both |
| Extra focus | **5 focus points total**, spent across muscles, **max 2 per muscle** |
| Deprioritise | up to **5** muscles |
| Times per week | a count — this sets how many of the seven days get a workout |
| Session length | ≤20min · 20–40 · 40–60 · 60–90 · 90–120 · >120 |
| Structure | full body · upper/lower · split |
| Deload week | on/off |
| Name, icon, icon colour | free text and a picker |

Then the generated result is reviewed and adjusted: exercises, sets, preferred
weight, and RIR per set.

**2. From scratch.** Just the program details; the user fills the week themselves from
the workout library.

**3. Import from file.** Upload a spreadsheet (typically `.xlsx`) and generate from it.

**On smart generation's real cost:** it is a programming engine, not a form. Turning a
goal, a weekly frequency, a session-length band and a focus budget into a sensible
week — choosing exercises per muscle, distributing sets, sequencing days — is the
substantive product here, and it needs the muscle taxonomy work too (this app has 17
primary muscles, coarser than the reference designs assume). The questionnaire is a
day; the generator is not.

**On import:** parsing arbitrary user spreadsheets is open-ended. It needs a defined
template before it is buildable as anything other than a guess.

## Scope of the current build

**In scope — the single active program rule, and nothing else:**

- A `programs` table: name, icon, icon colour, ordering. **Built.**
- A `program_days` table: program × day_index → workout, or rest. **Built.**
- Exactly one active program, enforced in the repository, not by UI convention.
- Activating an archived program deactivates the previously active one, in one
  transaction — a failure must not leave zero or two active.
- A screen to see the active program, see archived ones, and activate one.

**Explicitly out of scope of this build:** coach side, access model, paywall, intro
screen, invitation codes, onboarding, registration, profile questions, subscription,
smart generation, `.xlsx` import, RIR, preferred weight, deload scheduling.

### Constraints this build inherits

- **Deletes are tombstones**; every read filters `deleted_at IS NULL` at every joined
  level. A program → workout → exercise read is three levels before it reaches sets.
- **Ordering indexes use `max(orderIndex) + 1` over all rows including tombstoned.**
- Archiving is **not** deleting. An archived program keeps its workouts and its
  history; history is immutable regardless of program state.
- Existing routines predate programs. The migration must give them a home rather
  than orphaning them — a default program, created and activated on migration.

### The question this build must answer deliberately

Today a workout in progress references a routine. When a routine's program is
archived mid-workout, nothing should break: the workout already copied what it
needed at start time (that is why starting a routine copies rather than references).
Confirm that holds before shipping.

## Open questions

1. ~~Naming~~ and ~~does a program own its workouts~~ — both resolved above. A workout
   is shared, and the `routines` table keeps its name while meaning "workout template".
2. **What happens to a week when a workout in it is deleted?** The day should fall back
   to rest rather than dangle. Needs deciding when deletion exists in the UI.
3. ~~Does the week start on Monday?~~ Moot: a program is a day cycle, not a calendar
   week, so no weekday is involved at all.
4. **Daily activity level** is a new profile field with no consumer yet; it presumably
   feeds smart generation.
