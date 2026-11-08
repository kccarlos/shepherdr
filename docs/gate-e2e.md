# Gate end-to-end proof (G5's run)

The one run that proves the whole gate (docs/factory.md section 6; records in contracts/gate-evidence.md) once G2 (reviewer),
G3 (checks), G4 (gate, merge in code) and G5 (verifier) exist. G5's worker turns it into `test/gate_e2e.sh` (or a Python
script), runs it for real and attaches the output as proof. Nothing here touches the real core, store or `~/.config/herdr-app`.

## Setup (`T=$(mktemp -d)`; remove everything in a `trap`)

1. **Project:** `$T/gate-e2e-$$`, a git repo on `main` (unique name: worktrees land in the fixed `~/.herdr/worktrees/<repo>/`, so the
   trap removes `~/.herdr/worktrees/gate-e2e-$$`) with `app.py` (prints `hi`), `check.sh` (`python3 app.py | grep -x hi`, so the output tail is real), `git config user.*`.
2. **Core:** keep the real `HOME` (herdr-task refuses a changed one). A core under `HC_SESSION=gate-e2e-$$`, started with clean `env -i`. The same
   `PATH=<worktree>/mods/tasks/bin:$T/bin:...`, `SHELL=/usr/bin/env` (else agents start in `$SHELL -lic`, whose login shell reorders `PATH`),
   `HERDR_TASK_STORE` and `HERDR_TASK_SETTINGS` are exported for the core and for the script's own herdr-task calls. `$T/bin/hc` is the AGENTS.md shim (`HC_SESSION=gate-e2e-$$ exec /real/hc "$@"`);
   `herdr-app` is not on that PATH. Inside the core's terminals, `unset HC_SESSION` and set `HC_SOCKET=$HC_TERMINAL_SOCKET`. The trap kills only that core.
3. **Settings** (`$T/shepherdr.json`): `{"everywhere": {"tasks": {"review_min": 2, "review_rounds": 4, "check": "sh check.sh", "merge": "ask",
   "must_fix": "major"}, "reviewer": {"agent": "claude"}}}` (other top-level keys are ignored; `reviewer` is an object). Worker `codex`, reviewer and verifier
   `claude` (agy reviewers run sandboxed on macOS: no `$T`, no hc sockets). `add`, `start` and `accept` pass `--space e2e` (else `default_space()` runs `herdr-app status`; ready, review and tick take none). Not `herdr-app check`.
4. **Fake CLIs** in `$T/bin`, named `claude`, `codex` (`argv_for` starts them by name), each `#!/usr/bin/env python3` (a `#!/bin/sh` script
   reads as a stopped shell, `SHELLS` in base.py), and each waits on a gate file in `$T/plan/` so steps run in order, then stays alive until told to exit:
   - reviewer: reads `plan/review-N` (`pass` or `changes`; N = a counter file it bumps, as herdr-task passes no round), then runs
     `herdr-task review <ref> --pass` or `--changes "<finding>" --must-fix 1` from its own terminal.
   - verifier: runs `python3 app.py` in its cwd (the detached worktree), reads `plan/verdict`, runs `herdr-task verdict <ref> --pass|--fail --command "python3 app.py"` (G5's real name).
   - worker: commits an `app.py` change in the task worktree, then runs `herdr-task ready <ref> --summary ...`.
5. Prose is dropped under `--json` and a fake's own output stays in its terminal: each fake appends the command's exit and output to `$T/log`, and
   the script reads that. After each step it dumps `t` from `$T/store` and runs `test/contract_gate_evidence.py` on every record of the four lists.

## Positive run

| # | Step | Must show |
|---|---|---|
| 1 | `add "Say hello"` then `start` (fake worker as agent) | task in `running`, worktree on `task/..`, `start` SHA = `main` |
| 2 | Worker commits, says `ready` | ready returns "started review round 1 of <head7>"; `review_runs[0]` has `head` = HEAD and `address` of a live reviewer terminal; state not yet `ready` for the person |
| 3 | Reviewer 1 `--pass` | `reviews[0]` `started_by` herdr-task, `by` = `review_runs[0].address`, `pass`, `must_fix` 0; message says round 2 started (review.min 2); the reviewer's terminal is gone within ~6 s |
| 4 | Reviewer 2 `--pass` | two counting rounds, same `head`, distinct addresses; task is `ready` |
| 5 | `tick` | `check_run` set, a `herdr.role=checks` terminal live; wait for its exit, `tick` again:  a detached worktree of that SHA existed, then `checks[0]` with `sha` = head, `exit` 0, real `output_tail`, `by` a `herdr.role=checks` terminal; the worktree and terminal are removed; the repo dir has no new files |
| 6 | `tick`, then wait until the verifier's terminal has exited and `tick` cleaned its worktree | G5: `verdicts[0]` `sha` = head after a verifier started in its own detached worktree (cwd is not the task worktree), `verdict` pass, `by` its terminal, `commands` as the fake ran them; no second verifier on the same SHA |
| 7 | `accept --space e2e --json` | G4: `git -C repo rev-parse main` = the verified SHA exactly (`ff-only`, no merge commit), task `done`; its JSON/prose need not name the SHA, `rev-parse main` does |

## Negative runs (each from a fresh task unless said; every one ends with `main` unmoved and `accept` refused with the reason in plain words)

- **Forged verdict:** (a) the worker's own terminal runs `herdr-task verdict ... --pass` and `herdr-task review ... --pass`:
  both refused ("only the ... herdr-task started ... from its own terminal"), no record written. (b) On a task at Ready, the script edits
  `$T/store` to append a `reviews` row with `started_by` herdr-task but no matching `review_runs`, or a `verdicts` row
  whose `by` is no verifier it started: `accept` refuses naming the missing round/verdict (G4's words).
- **Moved head:** (a) after step 4, 5 or 6 the worker commits, then says `ready`: "a new commit to review" (`back_to_work`), `auto_merge`
  cleared, `accept` refuses, and the new head needs 2 new rounds, a new check and a new verdict. (b) With a reviewer/verifier open, the
  worker commits and the fake answers: refused ("moved on from <sha7>"), no record. (c) A commit with no `ready`: `accept` still refuses (gate keys on the exact SHA).
  Also move `main` after step 6: `accept` sends the task back to its worker to rebase (fresh-base rule), `main` unmoved.
- **Failing check:** `check.sh` made to fail on the head: `checks[-1].exit` non-zero with the real output tail, the task does
  not reach the verifier, `accept` refuses with "checks failed". A fixed commit passes only on its own new record.
- **Failing verdict:** `plan/verdict` = `fail`: `verdicts[-1].verdict` is `fail`, `accept` refuses, the worker is told
  (G5's wording), and no second verifier starts on the same SHA until the head moves.
- **Missing round:** `plan/review-2` = `changes`: `reviews[1]` `changes`, the finding reaches the worker, no checks or
  verifier start, the task stays `running` (not Ready). Then `ready` a fixed commit; a round-2 `changes` on a Ready task refuses `accept` in G4's words.
- **Not a gate folder:** `review_min` 0 on a second task: ready/accept behave as before, no reviewer, check or verifier starts.

## Done when

The script exits 0 only if every row above showed what it must, the validator passed on every record the real code wrote
(not on hand-made ones; the forged rows are expected to fail it or the counting rule), and nothing exists in
`$T` after cleanup. Attach its full output to G5's proof; report the PR path (`gh pr merge --match-head-commit`) as not
proven unless a throwaway fork was used.
