# ECC (Everything Claude Code) — usage guide

How to use the ECC plugin in this repo (Overload, the Expo / React Native app).
Written against **ECC 2.2.2**, installed at **user scope** with **hook mode `minimal`**.

- Plugin files: `~/.claude/plugins/cache/ecc/ecc/2.2.2/`
- ECC's own full command list: `COMMANDS-QUICK-REF.md` in that folder
- Upstream: https://github.com/affaan-m/ECC

---

## 1. What ECC adds

| Part | Count | How you use it |
|---|---|---|
| Slash commands | ~94 | You type them: `/ecc:<name> [args]` |
| Skills | ~290 | Claude loads them itself when a task matches; you can also ask for one by name |
| Agents | ~68 | Claude hands work to them (reviewers, build fixers, planners); you can ask for one by name |
| Hooks | ~25 | Run on their own around tool calls and at session end; the hook mode decides which ones |
| MCP server | 1 | `chrome-devtools` (browser debugging and Lighthouse) |

Every ECC command has the `ecc:` prefix. ECC's own docs write `/plan`; here that
is `/ecc:plan`. Type `/ecc:` to get the full list as autocomplete.

---

## 2. Commands worth using in this repo

This is a TypeScript / Expo / React Native project. Most of ECC's language-specific commands (Go, Rust,
Kotlin, Flutter, Django, C++…) don't apply here. These do:

### Planning

| Command | Use it for |
|---|---|
| `/ecc:plan <task>` | Restates the task, lists risks and writes a step-by-step plan. **Changes nothing until you confirm.** Start here for anything bigger than a small fix. |
| `/ecc:plan-prd <idea>` | A short PRD for a larger feature (e.g. coach invitations), which then goes to `/ecc:plan` |
| `/ecc:feature-dev <feature>` | Guided feature work: explore the code, then design, then build |

### Building features end to end

These run a whole pipeline (research → plan → TDD → review → commit):

| Command | Use it for |
|---|---|
| `/ecc:orch-add-feature <feature>` | A new feature, e.g. "remove an exercise from a workout" |
| `/ecc:orch-change-feature <change>` | Change how an existing feature behaves |
| `/ecc:orch-fix-defect <bug>` | Bug: reproduce it as a failing test, fix it, review it, commit |
| `/ecc:orch-refine-code <area>` | Refactor without changing behaviour; tests must pass before and after |

They end in a gated commit. See §8 about commit messages.

### Reviewing

| Command | Use it for |
|---|---|
| `/ecc:code-review` | Reviews your uncommitted changes |
| `/ecc:code-review <PR # or URL>` | Reviews a GitHub PR |
| `/ecc:react-review` | React focus: hooks, re-renders, accessibility |
| `/ecc:review-pr <PR>` | Deeper review of a PR by several agents |
| `/ecc:security-scan` | Security pass. Worth running on `src/sync/` and `functions/` |
| `/ecc:santa-loop` | Two independent reviewers who both have to approve. Slow; save it for risky changes |

### Fixing builds and tests

| Command | Use it for |
|---|---|
| `/ecc:build-fix` | Fixes `pnpm typecheck` / bundle errors one at a time, with small diffs |
| `/ecc:react-build` | Build breaks specific to React / bundlers |
| `/ecc:react-test` | TDD with React Testing Library / Vitest |
| `/ecc:test-coverage` | Finds coverage gaps and writes the missing tests |

### Cleanup and docs

| Command | Use it for |
|---|---|
| `/ecc:refactor-clean` | Dead code and duplicates (runs knip / depcheck / ts-prune) |
| `/ecc:update-docs` | Updates docs from their source of truth |
| `/ecc:update-codemaps` | Regenerates `docs/CODEMAPS/*` |

### Small helpers

| Command | Use it for |
|---|---|
| `/ecc:aside <question>` | A side question that doesn't derail the current task |
| `/ecc:checkpoint` | Records a checkpoint after verification (tests passed and so on) |
| `/ecc:model-route <task>` | Recommends a model tier for a task |
| `/ecc:cost-report` | Your Claude Code spend, from ECC's cost tracker |
| `/ecc:ecc-guide <question>` | Asks ECC about itself: "which agent reviews TypeScript?" |

---

## 3. Memory between sessions

ECC has three separate memory systems. You only need one of them day to day.

### Context Keeper — `/ecc:ck` (recommended; this project is registered)

Pass the subcommand as an argument:

| Command | What it does |
|---|---|
| `/ecc:ck save` | At the end of a session: saves what you did, where you stopped, next steps, decisions made and blockers. Shows you a draft first. |
| `/ecc:ck resume` | At the start of a session: shows the full briefing |
| `/ecc:ck info` | A five-line snapshot |
| `/ecc:ck list` | Every registered project |
| `/ecc:ck forget <name>` | Deletes a project's saved context (asks first) |

Data is stored in `~/.claude/ck/contexts/overload/`. The project was registered with its
stack, goal (the coach platform) and invariants (kg, epoch ms, tombstones, and so on).

> The ck scripts live at `~/.claude/plugins/cache/ecc/ecc/2.2.2/skills/ck/`,
> not at `~/.claude/skills/ck/` as the skill text says. Its optional SessionStart
> hook, which injects the briefing automatically, is **not** registered. Add it only
> if you want the briefing on every start (about 100 tokens).

### Session files — `/ecc:save-session`, `/ecc:resume-session`, `/ecc:sessions`

A second session store in `~/.claude/session-data/`. It overlaps with ck, so use one of the two.

### Instincts — `/ecc:instinct-status`, `/ecc:evolve`, `/ecc:promote`, `/ecc:prune`

Patterns ECC learns while you work, scoped per project or globally. Look at them
now and then; `prune` removes ones older than 30 days that were never promoted.

---

## 4. Turning lessons into skills — `/ecc:learn`

Run `/ecc:learn` after solving something that wasn't obvious. It drafts a skill in
`~/.claude/skills/<name>/SKILL.md`, shows it to you, and saves only when you say yes.

Already saved: **`eas-gitignored-config-files`**. EAS uploads only what
`.gitignore` allows, so files under `apps/mobile/firebase/` are missing on the build
server unless `.easignore` includes them.

`/ecc:learn-eval` does the same but scores the draft first. `/ecc:skill-create`
builds a skill from git history.

---

## 5. Agents

You don't run agents yourself. Claude hands work to them, or you ask for one by name:

> "use the typescript-reviewer agent on `apps/mobile/src/sync/`"

Useful ones here:

| Agent | Use it for |
|---|---|
| `ecc:typescript-reviewer` | Any TS change |
| `ecc:react-reviewer` | Screens and components in `src/features/`, `src/ui/` |
| `ecc:security-reviewer` | Auth, sync, Cloud Functions |
| `ecc:silent-failure-hunter` | Swallowed errors, e.g. in sync and backup |
| `ecc:build-error-resolver` | Typecheck / bundle breaks |
| `ecc:planner`, `ecc:architect` | Designing the coach / read-only-client model |
| `ecc:a11y-architect` | Accessibility of the logger and sheets |
| `ecc:performance-optimizer` | Slow lists and re-renders |
| `ecc:tdd-guide` | Writing the test first |

---

## 6. Hooks and hook modes

Hooks run on their own. The mode decides which ones:

| Hook | What it does | minimal | standard / strict |
|---|---|---|---|
| session-end, evaluate-session, session-end marker | Records the session and learns from it | ✅ | ✅ |
| cost-tracker | Logs spend (read with `/ecc:cost-report`) | ✅ | ✅ |
| plan-canvas-pending | Reminds you about unreviewed plans | ✅ | ✅ |
| **gateguard-fact-force** | Blocks the first Bash/Edit until Claude states the request and what the command does | ❌ | ✅ |
| config-protection | Guards config files from edits | ❌ | ✅ |
| doc-file-warning | Warns before creating stray .md files | ❌ | ✅ |
| suggest-compact, pre-compact | Context-size nudges | ❌ | ✅ |
| format-typecheck (on stop) | Formats and typechecks when a turn ends | ❌ | ✅ |
| check-console-log | Flags leftover `console.log` | ❌ | ✅ |
| desktop-notify | Desktop notification when a turn ends | ❌ | ✅ |
| observe, governance-capture, mcp-health-check, skill tracking | Telemetry / health | ❌ | ✅ |

**Change the mode** with `/ecc:configure-ecc`, choosing `off | minimal | standard | strict`,
then `/reload-plugins`.

**Turn off one hook** instead of changing the whole mode, e.g.
`ECC_DISABLED_HOOKS=pre:bash:gateguard-fact-force`, or `ECC_GATEGUARD=off` for
GateGuard alone.

`standard` is worth trying once the project settles. The stop-time typecheck
catches what `pnpm typecheck` would, but it adds time to every turn.

---

## 7. Suggested routines for this repo

**A backlog feature** (e.g. item 5, "remove an exercise from a workout"):
1. `/ecc:ck resume`
2. `/ecc:plan remove an exercise from a workout` → read it and confirm
3. Let it implement, or run `/ecc:orch-add-feature` for the full pipeline
4. `pnpm run ci`, then **run the app on both platforms** (CLAUDE.md: a green suite proves less than it looks)
5. `/ecc:code-review`
6. `/ecc:ck save`

**A bug:**
`/ecc:orch-fix-defect <what happens, on which platform>`. It starts with a
failing regression test, which suits this repo's vitest setup.

**Before a PR into `dev`:**
`/ecc:code-review` → `/ecc:security-scan` if sync / auth / functions changed →
`/ecc:pr` (or the `commit-commands` plugin).

**After fixing something hard:** `/ecc:learn`.

---

## 8. Things to watch

- **Commit and PR attribution.** Your global `~/.claude/CLAUDE.md` forbids
  `Co-Authored-By` and "Generated with Claude Code" lines. ECC's commit and PR
  commands (`orch-*`, `prp-commit`, `pr`) must follow that rule; check the message
  before approving the commit.
- **Overlap with plugins you already have.** Pick one set per job:

  | Job | ECC | Also installed |
  |---|---|---|
  | Plan | `/ecc:plan` | `superpowers:writing-plans`, `feature-dev` |
  | Review | `/ecc:code-review`, `/ecc:review-pr` | `code-review`, `pr-review-toolkit:review-pr`, built-in `/code-review` |
  | TDD | `/ecc:tdd-workflow` | `superpowers:test-driven-development` |
  | Commit / PR | `/ecc:prp-commit`, `/ecc:pr` | `commit-commands` |
  | Simplify | `ecc:code-simplifier` | `code-simplifier`, `ponytail`, built-in `/simplify` |
  | Session memory | `/ecc:ck`, `/ecc:save-session` | auto memory (`~/.claude/projects/.../memory/`) |

- **Context cost.** ECC took the skill count from about 40 to 426. Every skill's
  description is loaded each session, and most (Django, Go, healthcare,
  networking, trading) don't apply here. If sessions feel slow or noisy, disable
  ECC per project with `/plugin`, or uninstall it and keep only the commands you use.
- **`/ecc:multi-*` commands** call other model providers. They need those API
  keys and send your code to those providers.
- **`chrome-devtools` MCP** runs `npx chrome-devtools-mcp@latest`, which downloads the
  latest version on each use. This project is a mobile app, so it's rarely useful here.

---

## 9. Maintenance

| Task | How |
|---|---|
| Change scope or hook mode | `/ecc:configure-ecc` |
| Reload after a change | `/reload-plugins` or restart Claude Code |
| Check what's installed | `claude plugin list --json` |
| Update | `/plugin` → marketplace `ecc` → update, then `/reload-plugins` |
| Disable / uninstall | `/plugin` → `ecc@ecc` → disable / uninstall |
| Diagnose | `npx --yes --package ecc-universal ecc doctor` |
