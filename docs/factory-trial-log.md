# Factory trial log

Every permission rule approved for a factory worker or reviewer during the trial, under the orchestrator's standing
answer (2026-11-08). It becomes the role allow lists in phase 3 (docs/factory.md section 8).

| Time | Task | Role (CLI) | Rule | Scope |
|---|---|---|---|---|
| 2026-11-08 | FAC-1 | audit (agy argon-high, accept-edits) | `codexbar` | always, this conversation |
| 2026-11-08 | FAC-1 | audit (agy argon-high, accept-edits) | `herdr-artifact` | always, this conversation |
| 2026-11-08 | FAC-3 | reviewer (agy argon-high, auto) | read `~/.config/herdr-core/templates/reviewer.md` | once (agy offers no "always" for a file read) |
| 2026-11-08 | FAC-1 | audit (agy argon-high, accept-edits) | `mktemp` | always, this conversation |
| 2026-11-08 | FAC-1 | audit (agy argon-high, accept-edits) | `git grep` | always, this conversation |
| 2026-11-08 | FAC-1 | audit (agy argon-high, accept-edits) | `lsof -p $$ -Fn` (its own shell's open files; read-only, not on the standing list) | once |
| 2026-11-08 | FAC-1 | audit (agy argon-high, accept-edits) | `lsof` (read-only) | always, this conversation |
| 2026-11-08 | FAC-1 | audit (agy argon-high, accept-edits) | `python3 -c` timing `lsof -p <own pid>` (read-only; read in full first) | once each (2 so far): "always python3 -c" would allow any code |
| 2026-11-08 | FAC-1 | audit (agy argon-high, accept-edits) | `python3 /tmp/fac1-audit.*/test_audit_findings.py` (script read first: temp dirs, fake hc/agy, real hc calls mocked) | once |
| 2026-11-08 | FAC-3 | reviewer (agy argon-high, auto) | read files in its own worktree (`bin/shepherdr`), 2 reads | once each |
| 2026-11-08 | FAC-1 | audit (agy argon-high, accept-edits) | rerun of the edited `/tmp/fac1-audit.*/test_audit_findings.py` (re-checked) | once |
| 2026-11-08 | FAC-1 | audit (agy argon-high, accept-edits) | the repo's quick checks in one line (`bin/sync-shared --check`, `python3 -m unittest discover -s test`, `node --check` loop, `git status`, `git log`) | once (compound line; its prefix would allow anything) |
| 2026-11-08 | FAC-1 | audit (agy argon-high, accept-edits) | `zsh -lc 'command -v node; command -v bun; echo PATH'` + `ls` of node install dirs (read-only; node wasn't on its PATH) | once |
| 2026-11-08 | FAC-1 | audit (agy argon-high, accept-edits) | `python3 -c` globbing node install paths (read-only, read in full) | once |
| 2026-11-08 | FAC-1 | audit (agy argon-high, accept-edits) | the quick checks again with nvm's node put on PATH | once |
| 2026-11-08 | FAC-37 | gate reviewer t8c (agy) | the repo node --check loop with nvm/homebrew PATH prefix | always, this conversation |
| 2026-11-08 | all | every role | any command that only reads local state (no writes outside the worktree or temp folders, no network, no process control of other terminals); the Assistant decides and logs each | standing (orchestrator) |
| 2026-11-08 | all | every role | temp folders (`mktemp`, `/tmp`, `$TMPDIR`) are scratch space: writes there allowed | standing (orchestrator) |

## Observations

- agy in accept-edits mode asks before every shell command, including read-only ones (`codexbar`, `herdr-artifact`,
  `git log`). Read-only roles on agy need an allow list for their tools.
- An agy reviewer asks before reading its own role template outside the worktree
  (`~/.config/herdr-core/templates/reviewer.md`). A Claude implementer in auto mode is blocked by the classifier from
  pressing Enter on its reviewer's prompt ("Create Unsafe Agents"), so the prompt waits for the Assistant.
- fac-3-review (t2v) ran with its cwd already in the task's worktree, yet asked before every file read, inside the
  worktree too (`bin/shepherdr`) and outside it (`~/.config/herdr-core/templates/reviewer.md`). Cause: the worker
  started it by hand (`hc run agy -i ...`, no `--settings`), so herdr-task's agy trust (`trustedWorkspaces`) and
  allow list never reached it; `--cwd` alone doesn't trust a folder. Fix for now: FAC-3 restarts it with `--settings`
  trusting only its worktree (as `own_argv` does) and the role text in the prompt. Phase 4: herdr-task starts
  reviewers with their role settings, not the worker.
- Arbitrary scratch scripts (`python3 -c ...`, `python3 /tmp/.../test.py`) can't be allowed by a prefix rule without
  allowing any code: each was read in full and approved once.
- agy's shell had no `node` on PATH (it lives under ~/.nvm), so the repo's `node --check` loop failed until the worker
  found it: 3 extra prompts. Worker environments need the person's login PATH.
- herdr-artifact is not in the commands agy workers may run without asking (herdr-task and herdr-browser are).
- A launchd service needs macOS Documents access before it can tick a repo under ~/Documents. After `shepherdr
  update` restarted `dev.shepherdr.service`, the new bun process had none: its tick's `git rev-parse` hung in the
  repo folder while holding the tick lock, so nothing started, no news went out and no backups ran (also the cause of
  FAC-4's wait). The orchestrator stopped the service (`launchctl bootout`) and killed the hung tick; the
  herdr-automations hc terminal ticks instead, and the web board is offline until the person grants bun access.
  FAC-10 adds a git timeout so a hung call never holds the tick lock.
- News still reaches the Assistant with the launchd service stopped: the herdr-automations hc terminal
  (`herdr-task scheduler`) sends it (13 batches 03:27-04:43, its screen says `news to t2p`). But it can be late:
  none went out 04:11-04:43, and FAC-12's ready (04:28) arrived at 04:43:58, about 15 minutes late. The scheduler
  logged backups at 04:18 and 04:29 and then nothing until 04:43:58 (the 04:39 backup is missing), so its round
  was likely stuck about 14 minutes; its log doesn't say why. Not yet investigated.

- 05:04: everything under herdr-core stopped: an `hc run` probe could not even `ls ~/Desktop`, while the orchestrator's own shell (same Xcode git) answered in 13 ms. So macOS privacy access for the app that owns herdr-core's holder was gone or awaiting a prompt. Ticks (herdr-automations), FAC-9's worker and the Assistant hung on git. Parked until the person grants access. Lesson: factory repos live outside ~/Documents, ~/Desktop and ~/Downloads, or the holder's app and the service's bun get Full Disk Access.
- A worker that leaves a background command running after `ready` (FAC-24: `gh pr checks --watch`) gets a new turn
  when it ends, so herdr-task moves the task from Ready to "Working again" (Needs you) although nothing changed. The
  worker had to run ready again. Briefs could say "no background commands after ready", or busy_again could ignore a
  turn that changes no commit.
- 2026-11-08 ~10:18: the gate turned on for this folder (space `fac` in ~/.herdr/shepherdr.json: `tasks.review_min` 2,
  `tasks.check` = sync-shared + unittest with nvm's node on PATH; backup `shepherdr.json.bak-before-gate-*`). The
  window/settings UI had no `spaces` entry for fac before; the Assistant added it. FAC-27..29 are the first tasks
  briefed for it; G4 (FAC-15) was told mid-run.
- First gated task (FAC-28): herdr-task's own agy reviewer (plan mode) stopped on a permission prompt to run
  `bin/sync-shared --check && python3 -m unittest discover -s test` in the worktree. Nobody in the factory can answer
  it: the worker's `hc keys` and the Assistant's were both refused by Claude Code's auto-mode classifier (pressing
  keys in another agent's terminal). A gate reviewer needs its read-only and test commands allowed at launch
  (`--settings` allow list, G6), or must not run checks (G3 runs them).
- G2's gate_step diffs `<stored start>..<head>`, and `start` never moves on a rebase: FAC-15's reviewer would have
  got 939 lines in 12 files (other tasks' merged work mixed in, cut at 20k characters) for a ~103-line change.
- FAC-28's tests left three ask panes ("Ship?": t6s, t6t, t6v, children of its worker t6q) on the person's live
  herdr-core, although briefs say a throwaway core. A sheepdog watching that core would turn them into phone
  questions. FAC-28 was told to stop exactly those three and to move every ask-pane test and real run to a throwaway
  core (HC_SESSION shim plus HC_SOCKET). The real ask t79 (FAC-31 design approval) stays.
- Size calls the Assistant made (overruns that were review fixes): FAC-32's usage plan at 117 lines (limit ~80; the
  review's 5 majors changed the floor design); FAC-34's sheepdog note at 98 (~80, the orchestrator agreed).
- Stale reviewers replaced (started before FAC-36's allow list): t6y, t6w, t75, t7b, t7n, t7p ended; their workers
  rebase onto origin/kc-factory and say ready again. Starts of FAC-15, 28, 29, 35, 37, 38 reset to the merge-base
  c9abed45 (G2's gate_step diffs from the stored start, which a rebase doesn't move).
- Workers branch from the main folder's local kc-factory, so the Assistant's unpushed AGENTS.md/trial-log commits
  end up in task branches and conflict once origin has them under other SHAs (FAC-11, 15, 28, 29, 35, 37, 38).
- Size call: FAC-49 (agy reviewer sandbox) at ~154 production lines incl. a 40-line profile, limit ~120; growth from
  the read confinement and per-run agy state the person added mid-task. Accepted by the Assistant.
- Size call: FAC-50 (consent-path probe) to ~70 lines (limit ~30) to fix round 1's two blockers (the news never went
  out; a fresh tick process repeated the probe and the news). The separate start-up probe in the scheduler is left for
  a follow-up.
- Size calls: FAC-51 (VM image scripts) kept at 188 lines (limit ~150; a login step and tool lists, both layers built
  and smoke-tested; not a review fix, accepted to avoid a 15-minute rebuild for comments). FAC-50 to ~120 lines (limit
  ~30) for round 3's findings: the start-up probe the brief described plus per-folder skipping in the store sweeps.
- Workers misread the gate: FAC-45 and FAC-35 stopped saying their reviewers "exited with no verdict" while the store
  had recorded passes (reviewers exit after `herdr-task review`, so their terminals are gone). herdr-task tells the
  worker about `--changes`, not about a pass: a one-line news to the worker on each pass would stop the round trips.
- Round limits raised to 9 for FAC-15, 29, 32 (and 8 for 28, 35, 37, 38) after review.min went to 3 mid-run.
