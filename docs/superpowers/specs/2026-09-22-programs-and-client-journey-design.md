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

## Programs

A **program** is a named, ordered collection of workouts. It maps onto today's
`routines` table: what this document calls a *workout* is what the code currently
calls a **routine**, and a *program* is a new parent above it.

### The rule being built now

**Exactly one program is active at a time.** Any number may be archived. Activating
an archived program deactivates the current one — there is never a moment with two
active or zero active once a program exists.

This is the slice approved for immediate build. See "Scope of the current build".

### Creation paths (future)

Choosing to create a program offers three routes:

**1. Smart generation.** The app builds the program from answers to:

| Question | Values |
|---|---|
| Primary goal | muscle hypertrophy · muscle strength · both |
| Extra focus | **5 focus points total**, spent across muscles, **max 2 per muscle** |
| Deprioritise | up to **5** muscles |
| Times per week | a count |
| Session length | ≤20min · 20–40 · 40–60 · 60–90 · 90–120 · >120 |
| Structure | full body · upper/lower · split |
| Deload week | on/off |
| Name, icon, icon colour | free text and a picker |

Then the generated result is reviewed and adjusted: exercises, sets, preferred
weight, and RIR per set.

**2. From scratch.** Just the program details and settings; the user adds workouts
and exercises themselves.

**3. Import from file.** Upload a spreadsheet (typically `.xlsx`) and generate the
program from it.

**On smart generation's real cost:** it is a programming engine, not a form. Turning
a goal, a weekly frequency, a session-length band and a focus budget into a sensible
split — choosing exercises per muscle, distributing sets, sequencing days — is the
substantive product here, and it needs the muscle taxonomy work too (this app has
17 primary muscles, coarser than the reference designs assume). The questionnaire is
a day; the generator is not.

**On import:** parsing arbitrary user spreadsheets is open-ended. It needs a defined
template before it is buildable as anything other than a guess.

## Scope of the current build

**In scope — the single active program rule, and nothing else:**

- A `programs` table: name, icon, icon colour, archived/active state, ordering.
- Workouts (today's `routines`) belong to a program.
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

1. **Naming.** The code says "routine"; this document says "workout" for the same
   thing, and "workout" is *also* the word for a logged session (`workouts` table).
   That collision needs resolving before the UI adopts the new vocabulary, or the
   codebase ends up with two meanings for one word.
2. **Does a program own its workouts exclusively**, or can a workout be shared
   between programs? Exclusive is simpler and assumed here.
3. **Daily activity level** is a new profile field with no consumer yet; it presumably
   feeds smart generation.
