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
