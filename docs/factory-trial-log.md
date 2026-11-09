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
- `herdr-task ready` on a detached HEAD (after a worker's `git rebase --onto`) says "ready: pull request #26" but
  pushes the task branch, which still points at the old commit; the PR keeps the old head and its conflict. ready
  should refuse a detached HEAD, or push HEAD to the task branch.
- Calls (orchestrator's standing answer, 2026-11-08 ~14:10): FAC-50 to ~160 lines to fix a data-loss blocker (a
  skipped hung folder still rewrote shared news/retry state), round limit 9; B3 (FAC-41) at ~194 lines (all canvas
  parts with empty states); S1 (FAC-39) stays in service/ (no web/shared edits; B2/B3 type the fields); FAC-34 one
  more round; FAC-49 not hung (waiting on its round-4 reviewer), round limit 9 (3 passes needed).
- Usage (~14:30): Gemini weekly 83% -> 56% overnight from gate rounds; Claude weekly 9%, resets ~21:30. Until then
  Sonnet-worker tasks (FAC-17, 42, 43, 44, 46, 50, 52, 53) review with Claude Opus and review.min 2 (Opus is another
  model); Opus-worker tasks keep Argon, since an Opus reviewer wouldn't be independent of an Opus worker. FAC-53 sends
  reviewers only the delta and never starts a second live reviewer. Docs-only/tiny tasks: argon-medium, or one Opus
  round plus one Argon (Assistant routing).
- Person's decision (~14:45): the auto-merge hardening is over-engineered; review plus the orchestrator's checks
  before Accept catch worker shortcuts. Cancelled before they started: FAC-16 (G5 verifier: Tart VM per run, flake
  rule, person-in-the-loop VM steps), FAC-17 (G6 role settings at launch), FAC-18 (G7 worker sandbox + outbox the tick
  validates; agy implementers first), FAC-30 (verdict caller check by pid; task can't lower review.min), FAC-46
  (3 Argon rounds or 2 with another model, in code), FAC-47 (implementer rejections recorded; Opus breaks ties). The
  pushback rule stays in worker.md/reviewer.md (FAC-45). G4 finishes only as "herdr-task merges the exact SHA".
  Merges stay on Accept; auto-merge deferred. Tasks from now on: one complete change of ~150-300 lines, no separate
  doc/plan tasks unless the plan is the person's decision.
- Claude reviewers that herdr-task starts run in `--permission-mode plan`: they can't run their verdict command, so an
  Opus reviewer writes its review as a plan and waits on "approve plan" (FAC-42's t10y, verdict pass).
- After FAC-49's install (~15:00): the Sonnet tasks went back from Opus to sandboxed Argon reviewers (review.min back
  to the folder's 3), since Claude reviewers in plan mode can't record verdicts. Five pre-sandbox reviewers that were
  blocked (t106, t10t, t10w, t10y, t114) were ended; FAC-32, 34, 39, 42 and 50 re-readied with round limit 10.
- Assistant session 2 takes over (16:47, after the full stop at ~15:40). The stop had interrupted every reviewer
  mid-round (t11c, t113, t118, t119, t11g, t11d) and FAC-43's worker; each got a nudge to carry on, which keeps its
  context (cheaper than a fresh round). FAC-15's round-8 reviewer t110 (on 12271222, which the worker is rewriting for
  the core cut) was ended so only one reviewer runs per task; FAC-15 review.rounds 10 = exactly the two more rounds.
- Calls: review.min 2 on FAC-15, 39-43, 50 (day one's rule is 2 rounds; the folder still says 3). All reviews stay
  Argon, since Claude reviewers in plan mode can't record verdicts. The loop-breaker by hand counts from this
  takeover: the next herdr-task round with a Must-fix finding on any of them stops it for a RECAP.md, and the
  Assistant decides. FAC-50 (Must fix 3, 5, 3, 4, 2 over five rounds) gets round 8 as its last before a recap.
  FAC-42's Preview.tsx at 109 lines (limit ~100, from review fixes) accepted.
- FAC-51 conflicts with kc-factory: its rebase waits for the person's VM decision (the base keeps moving, and an
  Opus turn spent now would likely be spent again). Its AGENTS.md line (Tart: sync before stop; guest self-update;
  keychain over ssh) is held until it merges, since vm/ isn't on the base yet.
- FAC-54 added: loop-breaker and per-task budget in code (Opus worker, Argon review, min 2, at most 3 rounds), queued
  behind 7 running tasks (limit 3). Cancelled FAC-32/34 still have idle workers (t72, t73) and reviewers (t11f, t11b);
  left for the person to end.
- FAC-15: cut to its core (commands.py +44/-54, 8 tests). The worker merged origin/kc-factory into its branch to clear
  a test-file conflict; the Assistant reset its stored start d6722e06 -> c5917bb7 (the merge-base), so the Argon round
  sees only FAC-15's 2 files. That round is one of its last two; a Must-fix finding means a recap, not a fix.
- Trial-log conflicts (FAC-41 and FAC-51 went Needs you "conflicts with the base"): the task branches started from the
  old local kc-factory hold the previous Assistant's doc commits, which origin has under other SHAs. `git cherry`
  showed every one already on origin, so kc-factory got a record-only merge (`-s ours`, tree unchanged) of
  845b8549, e6d99909 and c4c55727. FAC-39..43 and 51 now merge cleanly with no worker turn and no new head (a new head
  would need two new review rounds). From now on the Assistant pushes its doc commits at once.
- FAC-15 (G4) dropped, by the orchestrator's standing call: its second recap trigger (Argon round 9 on bdc1432: a
  blocker and a major after the core cut; RECAP.md in its worktree recommended fixing both, about 6 lines). Finding 1
  (accept on a PR task force-deletes commits made locally after ready; merge_now matches GitHub's headRefOid, then
  finish(even_if_busy=True)) exists on kc-factory today, and data loss is always fixed: FAC-55 (Sonnet, ~5 lines plus
  a test with the real finish) guards it on its own. Finding 2 came only with the cut, so it goes with G4. Its branch
  and worktree are kept; the person cancels the task.
- FAC-40: round 2 (Must fix 4, same as round 1) met the loop-breaker, but the worker hadn't been told the hand rule
  and had already fixed and re-readied (round 3, t11q, running). Counted as its one continue; a Must-fix in round 3
  is its second trigger. The hand rule (recap instead of fixing) was then sent to every active worker (FAC-39, 40,
  42, 43, 50).
- FAC-50 (start-up probe) dropped at its recap after round 8 (Must fix 3, 5, 3, 4, 2, 3, 2; ~150 production lines
  against a 30-line brief). Every round found a new hole in one premise: a persisted per-app hang record serving the
  15 s tick, the long-lived scheduler and other apps at once. The smallest version already ships: locate()'s FAC-10
  timeout says "git didn't answer ... (on macOS: may this app open that folder?)", and section 11 has the fix.
  Branch, worktree and RECAP.md kept; the person removes the task.
- FAC-40 (B2) split at its second trigger (round 3: 2 majors, both from the send box and leaving the board, the
  premise being a board that replaces the whole layout and so owns app-wide state). It ships read-only, with "show
  them" as a plain link; the send box comes back as a follow-up that reuses the chat Composer (add it once FAC-40 is
  accepted). Rounds 4-5 of 5 are left for the two passes; a Must-fix there comes back to the Assistant.
- Friction: a reviewer-exit notice (`<hc>tX ... exited</hc>`) landing in a Ready worker's chat counts as "at work
  again", so a task that passed its gate drops out of Ready (FAC-42 after rounds 5-6 passed) until its worker says
  ready again. The notice shouldn't count as work, or ready should come back by itself when nothing changed.
- FAC-40 round 4 (after the split): 1 major, a security one (link deliverables rendered without validateLink, so
  javascript:/data: hrefs), plus 2 minors, in a new area. Security is always fixed: ~5 lines, review.rounds 6 for
  exactly the two passes. A Must-fix in round 5 takes the "new to look at" strip out of the task.
