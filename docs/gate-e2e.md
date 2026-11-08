# Gate end-to-end proof (G5's run)

The one run that proves the whole gate (docs/factory.md section 6; records in contracts/gate-evidence.md) once G2 (reviewer),
G3 (checks), G4 (gate, merge in code) and G5 (verifier) exist. G5's worker turns it into `test/gate_e2e.sh` (or a Python
script), runs it for real and attaches the output as proof. Nothing here touches the real core, store or `~/.config/herdr-app`.

## Setup (all in one `mktemp -d`, `$T`)

1. **Project:** `$T/repo`, a git repo on `main` with `app.py` (prints `hi`), `check.sh` (`python3 app.py | grep -qx hi`) and
   `git config user.*`. A bare `$T/origin.git` is the remote only if the PR path is run; the local path needs none.
2. **Core:** `HC_SESSION=gate-e2e-$$` and `hc` started under clean `env -i HOME=$T/home PATH=$T/bin:...` (`HC_SESSION`
   must stay unset for herdr-task itself). herdr-task refuses `hc` under a changed `HC_SESSION`, so `$T/bin/hc` is the AGENTS.md
   shim: `#!/bin/sh` / `HC_SESSION=gate-e2e-$$ exec /real/hc "$@"`. Also set `HC_SOCKET=$HC_TERMINAL_SOCKET` where a
   terminal of the core runs herdr-task. Stop the core in a `trap` on exit.
3. **Store and settings:** `HERDR_TASK_STORE=$T/store`, `HERDR_TASK_SETTINGS=$T/shepherdr.json` with `tasks.review_min` 2,
   `tasks.review_rounds` 4, `tasks.check` `sh check.sh`, `tasks.merge` ask, `tasks.must_fix` major, reviewer `agy`, verifier a
   different CLI than the worker. (Never `herdr-app` or `herdr-app check`; the settings mod is not involved.)
4. **Fake CLIs** in `$T/bin`, named like the real ones, because `argv_for` starts `agy`, `claude`, `codex` by name:
   - `agy` (reviewer): reads `$T/plan/review-<round>` (`pass` or `changes`), runs `herdr-task review <ref> --pass` or
     `--changes "<finding>" --must-fix 1` from its own terminal, then exits. It records nothing else.
   - verifier (a CLI other than the worker's and reviewer's): runs the project (`python3 app.py`) in its cwd (the detached worktree), reads `$T/plan/verdict`
     (`pass` or `fail`) and runs `herdr-task verdict <ref> --pass|--fail --command "python3 app.py"` (G5's name; use its real one).
   - worker: `$T/bin/worker` commits `app.py` change to the task worktree, then `herdr-task ready <ref> --summary ...`.
5. Every step is `herdr-task ... --json`, and after each step the script dumps `t` from `$T/store` and runs
   `test/contract_gate_evidence.py` on every `review_runs`, `reviews`, `checks`, `verdicts` record it finds.

## Positive run

| # | Step | Must show |
|---|---|---|
| 1 | `add "Say hello"` then `start` (fake worker as agent) | task in `running`, worktree on `task/..`, `start` SHA = `main` |
| 2 | Worker commits, says `ready` | ready returns "started review round 1 of <head7>"; `review_runs[0]` has `head` = HEAD and `address` of a live reviewer terminal; state not yet `ready` for the person |
| 3 | Reviewer 1 `--pass` | `reviews[0]` `started_by` herdr-task, `by` = `review_runs[0].address`, `pass`, `must_fix` 0; message says round 2 started (review.min 2); the reviewer's terminal is gone within ~6 s |
| 4 | Reviewer 2 `--pass` | two counting rounds, same `head`, distinct addresses; task is `ready` |
| 5 | `herdr-task tick` (twice) | `check_run` set, a detached worktree of that SHA exists, then `checks[0]` with `sha` = head, `exit` 0, real `output_tail`, `by` a `herdr.role=checks` terminal; the worktree and terminal are removed; the repo dir has no new files |
| 6 | `tick` again | G5: `verdicts[0]` `sha` = head after a verifier started in its own detached worktree (cwd is not the task worktree), `verdict` pass, `by` its terminal, `commands` as the fake ran them; no second verifier on the same SHA |
| 7 | `accept` | G4: `git -C repo rev-parse main` = the verified SHA exactly (`ff-only`, no merge commit), task `done`; the herdr-task output names the SHA |

## Negative runs (each from a fresh task unless said; every one ends with `main` unmoved and `accept` refused with the reason in plain words)

- **Forged verdict:** (a) the worker's own terminal runs `herdr-task verdict ... --pass` and `herdr-task review ... --pass`:
  both refused ("only the ... herdr-task started ... from its own terminal"), no record written. (b) The script edits
  `$T/store` to append a `reviews` row with `started_by` herdr-task but no matching `review_runs`, or a `verdicts` row
  whose `by` is no verifier it started: `accept` refuses naming the missing round/verdict (counting rule).
- **Moved head:** after step 4, 5 or 6 the worker commits again. Evidence on the old SHA is not enough: the task goes back to
  working ("a new commit to review"), `auto_merge` cleared, `accept` refuses, and the new head needs 2 new rounds, a new
  check record and a new verdict. A reviewer or verifier answering after the move is refused ("moved on from <sha7>").
  Also move `main` after step 6: `accept` sends the task back to its worker to rebase (fresh-base rule), `main` unmoved.
- **Failing check:** `check.sh` made to fail on the head: `checks[-1].exit` non-zero with the real output tail, the task does
  not reach the verifier, `accept` refuses with "checks failed". A fixed commit passes only on its own new record.
- **Failing verdict:** `plan/verdict` = `fail`: `verdicts[-1].verdict` is `fail`, `accept` refuses, the worker is told
  (G5's wording), and no second verifier starts on the same SHA until the head moves.
- **Missing round:** `plan/review-2` = `changes`: `reviews[1]` `changes`, the finding reaches the worker, no checks or
  verifier start, `accept` refuses with "needs 2 passing rounds".
- **Not a gate folder:** `review_min` 0 on a second task: ready/accept behave as before, no reviewer, check or verifier starts.

## Done when

The script exits 0 only if every row above showed what it must, the validator passed on every record the real code wrote
(not on hand-made ones; the forged rows are expected to fail it or the counting rule), and nothing exists in
`$T` after cleanup. Attach its full output to G5's proof; report the PR path (`gh pr merge --match-head-commit`) as not
proven unless a throwaway fork was used.
