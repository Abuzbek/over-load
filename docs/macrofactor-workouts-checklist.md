# MacroFactor Workouts: feature checklist for Overload's first release

Built from all 125 articles in the help center's MacroFactor Workouts collection
(<https://help.macrofactorapp.com/en/collections/20-macrofactor-workouts>), read in full from
their "Copy for LLM" markdown on 2026-09-25.

**Status legend:**
- ✅ Overload has it.
- 🟡 Partial.
- ⬜ Missing.
- ❓ Not checked in the code yet.

Overload's statuses are a first pass from the codebase. They still need checking before we plan the work.

---

## 0. What the app is, in one paragraph

MacroFactor Workouts (MFW) is a subscription lifting app.

- **Programs:** it generates a program, or you build one. A program is a repeating **cycle** of workout and rest days (not a calendar), run for 1–52 cycles, with optional deloads and periodization.
- **Logging:** you log sets as weight × reps × **RIR**.
- **Smart Progression:** turns what you log into the next session's weight and reps, limited to the plates and machines your **gym profile** says you have.
- **Tracking:** a dashboard tracks weekly volume against targets, records, strength estimates, muscle-group volume, bodyweight trend, body measurements and progress photos.
- **No coaching:** there is no coach/client model. The nearest things are spreadsheet import of purchased programs (e.g. Jeff Nippard's), library sections named for "programs from specific coaches", and sharing before/after photos with "a trainer, coach, or friend".
- **Online-first:** it is *not* offline-first; it has only a limited offline mode.
- **Pricing:** $11.99/month, $47.99 per half year or $71.99/year, or $89.99/year bundled with MacroFactor Nutrition. Paid through RevenueCat.

---

## 1. App shell and navigation

| # | Feature | MFW behaviour | Overload |
|---|---|---|---|
| 1.1 | Tabs | Dashboard · Workout · centre **+** · More | ✅ (plus a Progress tab) |
| 1.2 | Centre **+** = Shortcuts | Weight, Metrics, Photos, History, New program, New workout | 🟡 New Program / New Workout only |
| 1.3 | Shortcut settings | Toggle each, drag to reorder, colour per shortcut, reset to defaults | ⬜ |
| 1.4 | Workout tab **Create** (+ top) | New Section / New Program / New Workout | 🟡 |
| 1.5 | Minimised workout | Stays at the bottom of the screen while you browse the app; the timer keeps running | ✅ in-progress bar |
| 1.6 | Theme | System / Light / Dark | ⬜ dark only |
| 1.7 | Pull-to-refresh on dashboard | Forces a sync with the integrations | ⬜ |

## 2. Onboarding and account

| # | Feature | MFW | Overload |
|---|---|---|---|
| 2.1 | Default gym profile created during onboarding | yes | ✅ |
| 2.2 | Lifting experience, editable later (More › Account) | yes | 🟡 set in onboarding; editing later ❓ |
| 2.3 | Cardio experience, editable | yes | ⬜ |
| 2.4 | Email change (with verification), password reset by email | yes | ⬜ (we use Apple, Google and phone, so maybe N/A) |
| 2.5 | Log out | yes | ✅ |
| 2.6 | Delete account and all data (instant); **granular** delete per data type; **bulk** delete keeping the account | yes | ⬜ (**App Store requires account deletion**) |
| 2.7 | Subscription page: plans, renewal date, swap plan; cancel via the store | yes | ⬜ |
| 2.8 | Launch while offline | limited offline mode; needs the network to validate the subscription | ✅ ours is offline-first (an advantage) |

## 3. Programs

### 3.1 Creating a program
| # | Feature | MFW | Overload |
|---|---|---|---|
| 3.1.1 | **Smart Generation**: goal → focus (5 points) → deprioritise (up to 5) → days/week → minutes/session → gym → split (full body / upper-lower …) → deload yes/no → confirm experience → name, icon, colour | from **+ › New Program** at any time | 🟡 same inputs, but **only inside onboarding**; no deload question |
| 3.1.2 | Review screen: day strip (workout/rest days), target muscles and exercises per workout; edit before saving (swap, superset, schedule, gym per workout) | yes | 🟡 preview, no editing |
| 3.1.3 | **Save to Library** or **Activate Program** | yes | 🟡 onboarding always activates |
| 3.1.4 | **Build from Scratch**: name, icon, colour → program page; days with no exercises are rest days; **Add Day +** | yes | 🟡 ProgramDaysScreen (add day / rest / remove day) |
| 3.1.5 | Scratch programs default to **7 cycles** | yes | ⬜ no cycle concept |
| 3.1.6 | **Import from File** (.xlsx) for a program or a workout; export is its source format; custom exercises break imports | yes | ⬜ |
| 3.1.7 | Generator inputs: goal, experience, schedule, session length, gym equipment, "Do Not Recommend" exclusions, split, emphasis | yes | ✅ except the exclusions list |
| 3.1.8 | Generated programs start each exercise with a hard set (near failure), then higher-RIR sets, **to anchor RIR** | yes | 🟡 our RIR scheme eases *into* sets (the opposite); decide which we want |

### 3.2 Program structure and settings
| # | Feature | MFW | Overload |
|---|---|---|---|
| 3.2.1 | **Cycles**: number of cycles 1–52 (± buttons) | yes | ⬜ |
| 3.2.2 | **Day order**: drag workout and rest days; up to **14 days per cycle** | yes | 🟡 7 fixed weekdays |
| 3.2.3 | **Deload**: None / First cycle / Last cycle | yes | ⬜ (saved in preferences, not used) |
| 3.2.4 | **Periodization** toggle: sets, rep min/max and RIR vary **per cycle** | yes; generated programs periodise automatically | ⬜ |
| 3.2.5 | Target editor per exercise **per cycle**: sets (swipe to delete, + to add), rep min/max, RIR 0–6+ (with a "?" help), set type per set | yes | 🟡 rep range and RIR exist per set; no editor UI, no cycles |
| 3.2.6 | Save scope: **this cycle** / **all cycles** / **all exercises this day** / **all exercises, all cycles** (via "More Options") | yes | ⬜ |
| 3.2.7 | **Skip exercise** in one cycle only | yes | ⬜ |
| 3.2.8 | Gym profile **per workout day** | yes | ⬜ |
| 3.2.9 | Program settings: duplicate program ("Save & Go to Duplicate"), export program | yes | ⬜ |
| 3.2.10 | Archive/restore program (swipe left → folder icon; Archive list in the ⋮ menu) | yes | ⬜ |
| 3.2.11 | Set active program: activate at creation, or **drag a library program into Active Program** | yes | 🟡 activate exists |
| 3.2.12 | Switching programs keeps all history | yes | ✅ |
| 3.2.13 | **End of program**: **Repeat Program Block** or **Complete Program** → then generate / build / import | yes | ⬜ |
| 3.2.14 | Missed workouts don't break the program: cycles, not dates; skip or log rest days, or just resume | yes | 🟡 ours is weekday-based |

### 3.3 Editing workouts inside a program
| # | Feature | MFW | Overload |
|---|---|---|---|
| 3.3.1 | Action bar per workout: Rename, Reorder (drag), Duplicate (appends to the cycle), Remove, Change to Rest | yes | 🟡 move up/down only |
| 3.3.2 | Add exercises: multi-select with **+**, a bag icon with the count, review | yes | ✅ picker multi-select |
| 3.3.3 | Remove exercise: swipe left → "Remove from workout" | yes | ⬜ (roadmap #5) |
| 3.3.4 | Exercise ⋮ menu: Info, Swap, Superset (with previous/next), Move to a different day, Remove | yes | 🟡 Info only ❓ |
| 3.3.5 | **Skip workout** / un-skip (⋮ on the workout) | yes | ⬜ |
| 3.3.6 | Drag workouts to change order in the week view | yes | ⬜ |

## 4. Workout library

| # | Feature | MFW | Overload |
|---|---|---|---|
| 4.1 | Sections: **Active Program** (can be hidden), **Workout Library** (always shown), plus **custom sections** (add, rename, drag to reorder, swipe to delete, drag items into them) | yes | ⬜ custom sections |
| 4.2 | New workout from scratch: name → gym → add exercises → recap → Save to Library | yes | ✅ |
| 4.3 | **Empty workout** (one-off): add exercises → Start or Save Workout Plan | yes | ❓ |
| 4.4 | Workout ⋮ menu: Swap gym for workout, Reset workout, Export (.xlsx), Archive, Delete, Duplicate | yes | ⬜ mostly |
| 4.5 | Archive/restore workout | yes | ⬜ |

## 5. Workout overview (before starting)

| # | Feature | MFW | Overload |
|---|---|---|---|
| 5.1 | Target muscles, total exercises, **estimated duration**, rep details | yes | ✅ |
| 5.2 | Gym icon in the header to swap gym; ⋮ options | yes | ⬜ (roadmap #5) |
| 5.3 | Pinned **Start Workout** | yes | ✅ |

## 6. Logging a workout (the core)

### 6.1 Screen layout
| # | Feature | MFW | Overload |
|---|---|---|---|
| 6.1.1 | Top: **duration timer** (left) and **rest timer** (right) | yes | 🟡 ❓ layout |
| 6.1.2 | **Exercise strip** of thumbnails across the top; tap to jump; drag to reorder; **+** at the end to add | yes | ⬜ (we show a list) |
| 6.1.3 | Header "Weighted Chest Dip, **Set 1 of 4**" | yes | ⬜ |
| 6.1.4 | Set table: Set # · **Previous** ("No Previous") · Weight · Reps · RIR circle · ✓ | yes | 🟡 ❓ "Previous" column |
| 6.1.5 | Tick to complete, untick to undo | yes | ✅ |
| 6.1.6 | **Auto-advance** to the next exercise when all its sets are done (setting) | yes | ❓ |

### 6.2 Workout menu (☰ top-left)
| # | Feature | MFW | Overload |
|---|---|---|---|
| 6.2.1 | Pause / Resume (stops the timer) | yes | ⬜ |
| 6.2.2 | Minimise | yes | ✅ |
| 6.2.3 | Complete workout | yes | ✅ |
| 6.2.4 | Workout settings (the same page as More › Workouts) | yes | ⬜ |
| 6.2.5 | Gym settings (edit the gym's equipment mid-workout) | yes | ⬜ |
| 6.2.6 | Discard workout | yes | ✅ |

### 6.3 Per-exercise action bar (swipe horizontally)
| # | Feature | MFW | Overload |
|---|---|---|---|
| 6.3.1 | **Smart Progression wand** (see §7) | yes | ⬜ |
| 6.3.2 | **Info**: video, instructions, details, history | yes | 🟡 no video |
| 6.3.3 | **Warm Up**: add a smart or manual warm-up set, edit the scheme (see §8) | yes | ⬜ |
| 6.3.4 | **Targets**: change rep range and RIR for this session | yes | ⬜ |
| 6.3.5 | **Swap**: *Smart Substitutions* first (with a quick-swap button), then **Find Other Replacements** | yes | ❓ swap exists? smart substitutions ⬜ |
| 6.3.6 | **Note**: pick the level. **Session** (saved to history), **Exercise** (pinned, shows every time), **Program** (pinned) | yes | 🟡 `notes` columns exist; UI ❓ |
| 6.3.7 | **Superset** with previous/next; rounds shown beneath; rest starts after the pair; "Detach from superset" | yes | 🟡 `superset_group` column exists; UI ⬜ |
| 6.3.8 | **Equipment** panel: resistance and support equipment for this exercise, editable | yes | ⬜ |
| 6.3.9 | **L/R**: separate weight and reps per side (relevant exercises only) | yes | ⬜ |
| 6.3.10 | **More**: Exercise settings, Reset to default, Remove from workout | yes | 🟡 ❓ |

### 6.4 Sets
| # | Feature | MFW | Overload |
|---|---|---|---|
| 6.4.1 | **Set types**: tap the set number → Standard, **W** warm-up, **D** drop set (several weight×reps entries grouped as one set), **M** myo/rest-pause (entries at the same weight), **F** failure (RIR 0) | yes | ⬜ (roadmap #1; `set_type` column is `normal` only) |
| 6.4.2 | **RIR** 0–6+ per set; tap the reps field to change it, including **after** the set is done | yes | 🟡 ❓ post-set edit |
| 6.4.3 | **Full vs partial reps** (F/P toggle under RIR): log full + partial counts | yes | ⬜ |
| 6.4.4 | **Plate calculator**: enter the total weight → plates per side, from the gym's bar and plates; edit bar/base weight, plate list and unit per exercise | yes | ⬜ |
| 6.4.5 | **Bodyweight contribution**: green oval "% BW" → scale weight + added load; edit scale weight inline; can be turned off | yes | ⬜ (catalogue has the `bodyweight` fraction) |
| 6.4.6 | Rest timer: tap → **±10 s**, restart with presets in **15 s steps up to 3:00** | yes | 🟡 ❓ |
| 6.4.7 | Rest between left/right sides (unilateral) | yes | ⬜ |
| 6.4.8 | Create a custom exercise mid-workout (+ in the picker) | yes | ❓ |

### 6.5 Finishing
| # | Feature | MFW | Overload |
|---|---|---|---|
| 6.5.1 | **Update Program** toggle, shown only if the structure changed (swap/add/remove); off = this session only, on = changes carry into the program | yes | ⬜ |
| 6.5.2 | Summary screen: **front/back body map** of what you actually trained | yes | ❓ we have a heatmap in Progress |
| 6.5.3 | Summary: **records set** this session (volume, reps, e1RM) | yes | ❓ |
| 6.5.4 | Summary: total volume, duration, start time, per-exercise sets; editable from there | yes | 🟡 history detail |

## 7. Smart Progression (the "coach" in the app)

| # | Feature | MFW | Overload |
|---|---|---|---|
| 7.1 | **No starting weight**: the first time, you pick the weight; recommendations begin after you log | yes | ⬜ (we plan to *beat* this: roadmap #2 starting-weight estimates) |
| 7.2 | **Rule, sets with RIR ≥ 1**: expected reps to failure = **middle of the rep range + target RIR**. E.g. 7–9 reps @2 RIR → 10. Beat it → load or reps go up; fall short → down. Off-target RIR still counts (8 @3, 10 @1, 11 @0 all mean progress) | yes | ⬜ |
| 7.3 | **Rule, failure sets (RIR 0)**: progress when reps at a load beat the previous best | yes | ⬜ |
| 7.4 | Updates happen **when the workout finishes** (the next Workout A gets new targets) | yes | ⬜ |
| 7.5 | Weights snap to **what the gym can load** (plates, stacks, dumbbell sets, micro-adjustments); weird totals such as 88.5 lb come from fractional plates | yes | ⬜ (gym equipment weights exist) |
| 7.6 | Total resistance includes the machine's starting resistance + % bodyweight | yes | ⬜ |
| 7.7 | Settings: **Apply in session** on/off; **Initial log fill** = Smart Progression or Previous values; **Expand Rep Range** (100×9 instead of forcing 105×8); **Weight Match** (keep the previous weight when possible) | yes | ⬜ |
| 7.8 | **Wand colours**: blue = info, yellow = adjustment to review / sub-optimal, red = equipment missing. Tap for the "why"; **Fix** offers options (use a different bar, edit equipment, "Get new workout targets", accept an off-range target) | yes | ⬜ |
| 7.9 | "Progression unavailable within target rep range" warning | yes | ⬜ |
| 7.10 | Light weights → **high-rep recommendations** (10→15 lb is +50%) | yes | ⬜ |
| 7.11 | Never "punitive": can lower weight/reps after a harder-than-planned set | yes | ⬜ |
| 7.12 | Works on generated, edited and scratch programs; separate from periodization | yes | ⬜ |
| 7.13 | After a swap, progression for the new exercise starts from its own logs | yes | ⬜ |

## 8. Warm-ups

| # | Feature | MFW | Overload |
|---|---|---|---|
| 8.1 | **Smart warm-ups on by default**, scaled from the working weight | yes | ⬜ (preference saved, unused) |
| 8.2 | Warm-Up Automation setting (Smart Warm-Up or not) | yes | ⬜ |
| 8.3 | **Warm-up scheme**: a list of % of the target set × reps (e.g. 40%, 60%, 80%×3) with a reference set; a global default | yes | ⬜ |
| 8.4 | **Per-exercise schemes** override the default; editable mid-workout ("Scheme" toggle), and the change persists | yes | ⬜ |
| 8.5 | Add one manual warm-up set; swipe to remove (the scheme is unchanged) | yes | ⬜ |
| 8.6 | **Hide completed warm-up sets** behind the Warm-Up menu | yes | ⬜ |

## 9. Rest timers

| # | Feature | MFW | Overload |
|---|---|---|---|
| 9.1 | Default by movement type (lower-body compound 3:00, upper-body isolation 1:30, …), editable, Reset Defaults | yes | 🟡 one default |
| 9.2 | **Per-exercise** rest timers (settings list + from a workout) | yes | 🟡 planned rest per workout exercise |
| 9.3 | Rest timer sound setting | yes | 🟡 notifications ✅ |

## 10. Exercises

| # | Feature | MFW | Overload |
|---|---|---|---|
| 10.1 | Library: search, filter by muscle / type / equipment / etc. | yes | ✅ (richer than theirs) |
| 10.2 | Exercise info: **video demo**, instructions, target muscles, stability and ROM ratings, equipment, **joint actions**, bodyweight contribution | yes | 🟡 no video/images (roadmap #4) |
| 10.3 | **Custom exercise**: name, tracked metric (reps / weight / weight per side / duration / distance), type (compound/isolation × upper/lower, core), laterality (bilateral / unilateral / asymmetrical / both), muscles tapped **P** then **S** then off, resistance equipment or "Bodyweight exercise", ROM, stability, BW contribution, movement pattern, alternate names, description → review → Create | yes | ⬜ ❓ (`isCustom` exists) |
| 10.4 | **Edit Duplicate**: copy a catalogue exercise into a custom one | yes | ⬜ |
| 10.5 | Delete a custom exercise (Custom tab) | yes | ⬜ |
| 10.6 | Exercise settings: Weights (which weights are available), Rest timer, Rest between L/R, **Exercise note** (shows every time), **Do Not Recommend** | yes | ⬜ |

## 11. Gym profiles

| # | Feature | MFW | Overload |
|---|---|---|---|
| 11.1 | Several profiles: icon, name, **prefill preset**, edit equipment | yes | ✅ |
| 11.2 | Default = first in list (drag to reorder) | yes | 🟡 active gym |
| 11.3 | **Allow exercises** (despite missing equipment) / **Disallow exercises** (despite having it) per gym | yes | ⬜ |
| 11.4 | Weight options: plate sizes, fractional plates, bars, bands, loadable accessories | yes | 🟡 ❓ `equipment.json` starting weights |
| 11.5 | **Pin-loaded machine weight stacks**: ranges (start, end, increment), several ranges per stack, **micro-adjustments** (dial, selectorised pin, external plates) | yes | ⬜ |
| 11.6 | **Scan with AI**: photograph a weight stack → ranges | yes | ⬜ (nice later) |
| 11.7 | Unit per equipment (kg/lb) | yes | ⬜ |

## 12. History

| # | Feature | MFW | Overload |
|---|---|---|---|
| 12.1 | Workout history list → detail | yes | ✅ |
| 12.2 | **Edit past workout**: untick a set → edit weight/reps/RIR → tick; swipe to delete a set; notes; save ✓ | yes | ❓ |
| 12.3 | Edit **start time/date** and **duration** | yes | ❓ |
| 12.4 | Delete workout (swipe → trash) | yes | ❓ |
| 12.5 | **Backfill**: log a session, then set its date | yes | ❓ |

## 13. Dashboard and analytics

| # | Feature | MFW | Overload |
|---|---|---|---|
| 13.1 | **Weekly Workouts rings**: Muscles, Sets, Exercises done vs weekly target; current vs previous cycle; **All Workouts vs Active Program** | yes | ⬜ (Dashboard has "All workouts") |
| 13.2 | **Recent Records**: Volume / Reps / Estimated 1RM | yes | ✅ Recent records ❓ which types |
| 13.3 | **Workouts insights**: sets and volume over time (week → all time), volume split into **external load vs bodyweight**, top exercises by sets/volume | yes | ⬜ |
| 13.4 | **Weight Trend**: smoothed bodyweight, rate of change | yes | ⬜ |
| 13.5 | **Habits**: calendar of workouts and weigh-ins, streaks; tap a day to log weight or "worked out" | yes | ⬜ |
| 13.6 | **Muscle Groups** tiles: sets/volume per muscle over time → sessions list | yes | 🟡 heatmap |
| 13.7 | **Levels**: body map, **average sets/week per muscle** over 1 week / 1 month / 3 months, front/back toggle, tap a muscle → contributing exercises (sets + muscles), drill into sub-muscles | yes | 🟡 MuscleHeatmap |
| 13.8 | **Exercises** tiles: recent load + trend line → detail | yes | ⬜ |
| 13.9 | Exercise detail metrics: **1RM / 3RM / 10RM estimates**, total volume, best-set volume, heaviest weight, total reps, best-set reps, total sets; time ranges; **monthly recaps** | yes | 🟡 `oneRepMax`, `personalRecords` in domain |
| 13.10 | **Steps** widget (manual or from Health) | yes | ⬜ |
| 13.11 | **Period** tracking widget (calendar; can be hidden) | yes | ⬜ |
| 13.12 | **Customize dashboard**: reorder, add/remove widgets and insights, swipe to remove, Reset to defaults | yes | ⬜ |

## 14. Body metrics and progress photos (**needed for the coach plan**)

| # | Feature | MFW | Overload |
|---|---|---|---|
| 14.1 | **Log weight** (+ optional body-fat %), from + Shortcuts, the Habits calendar, or Body Metrics › Scale Weight; any date | yes | ⬜ (profile weight only) |
| 14.2 | Weigh-in guidance: daily, or at least 3×/week | yes | ⬜ |
| 14.3 | **Body measurements**: 24 metrics, of which 18 are circumferences (waist, hips, chest, shoulders, neck, arms, thighs, calves, …); any date | yes | ⬜ |
| 14.4 | **Progress photos**: Front / Side / Back, one of each per day; camera or gallery; crop / zoom / rotate | yes | ⬜ |
| 14.5 | **Configure** which metrics and photos you track (Data Visibility) | yes | ⬜ |
| 14.6 | **Compare All Metrics**: date presets or custom range; body-fat change %; measurements side by side | yes | ⬜ |
| 14.7 | **Before/after builder**: pick view, before and after from a dated photo ribbon, background (white / grey / matched), **share sheet** | yes | ⬜ |
| 14.8 | Tips content (how to take good photos and measurements) | yes | ⬜ (cheap: static screens) |
| 14.9 | Reminders to measure | **not in MFW** | ⬜ (our coach plan: daily notification) |

## 15. Settings, data and integrations

| # | Feature | MFW | Overload |
|---|---|---|---|
| 15.1 | Units: kg/lb, cm/ft-in, time | yes | ✅ units screen |
| 15.2 | **Apple Health / Health Connect**: read steps (and weight); nothing connects directly | yes | ⬜ |
| 15.3 | **Data export**: Quick (one sheet, date range) and Granular (exercises, muscle groups, gym profiles, weight) → .xlsx | yes | ⬜ |
| 15.4 | Workout settings page: rest timer defaults and sounds, smart warm-ups, auto-advance, bodyweight contribution, smart-progression options | yes | ⬜ |
| 15.5 | Language | – | ✅ (we have it; they don't mention it) |

## 16. Where Overload can be better than MFW

- **Offline-first.** MFW says outright it is not offline-first.
- **Starting-weight recommendations.** MFW gives none until you have logged; we can estimate from bodyweight, sex, experience and the catalogue's bodyweight fraction (roadmap #2).
- **Coach platform.** MFW has none: invitations, read-only clients following a coach's program, daily measurement reminders, coach-side pricing. See CLAUDE.md › Roadmap.
- **Richer exercise filters and catalogue.** 1,213 exercises with type, laterality, stability, ROM and equipment groups.
- **Phone / Telegram sign-in** for markets where that matters.

---

## Suggested grouping for discussion (not a decision)

1. **Must-have for a credible first release:**
   - §6 logging parity: set types, a "Previous" column, rest ±10 s, notes, supersets, swap, remove, L/R.
   - §3.3 workout editing.
   - §3.2 cycles, deload and end-of-program.
   - §7 smart progression (7.2–7.5 core rules).
   - §8 warm-ups.
   - §12 history edit.
   - §2.6 account deletion (the App Store requires it).
2. **Needed for the coach plan:** §14 body metrics, photos and reminders; §13.1 weekly targets; a coach-side program editor that reuses §3.
3. **Polish / later:**
   - §13 analytics depth.
   - §11.5–11.6 machine stacks and AI scan.
   - §3.1.6 xlsx import/export.
   - Dashboard customisation, shortcuts colours, theme.
   - Health integrations, period tracking.
