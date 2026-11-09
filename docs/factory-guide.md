# Using the factory

How to run, watch, steer and stop the software factory on this Mac. The design and its reasons are in [factory.md](factory.md), what day one cost is in [factory-cost-report-2026-11-08.md](factory-cost-report-2026-11-08.md), and every decision made during the trial is in [factory-trial-log.md](factory-trial-log.md).

## What it is

You say what you want once. An **Assistant** (Opus, a long-lived Claude in herdr-core) splits it into tasks and starts one **worker** per task (Claude Sonnet or Opus) in its own git worktree. A **reviewer** that Herdr starts itself (Argon through agy, or Opus) reviews each task. Herdr runs the project's checks itself. Merges happen on **Accept**: the orchestrator (your Claude session) or you press it after the checks pass. Nothing auto-merges.

## Where things are

| What | Where |
|---|---|
| The fork, branch `kc-factory` | github.com/kccarlos/shepherdr |
| The working copy the factory runs in | `~/Documents/reference_repo/factory-run` |
| The checkout Shepherdr is installed from | `~/Documents/reference_repo/shepherdr-wt/agy` |
| Task worktrees | `~/.herdr/worktrees/factory-run/` |
| Settings | `~/.herdr/shepherdr.json` (space `fac`: `review_min`, `check`; `max_running`) |
| The Assistant's launch template | `~/.config/herdr-core/templates/herdr-assistant-fac.md` |
| VM images | `vm/` ([vm/README.md](../vm/README.md)), images on the external SSD |

## Watch it

- **Board:** `https://<this Mac's tailnet name>/shepherdr/`, from the phone or the Mac. The **Board** button beside Tasks and Artifacts shows usage, tasks by status, open asks, the agent tree and new things agents made. Each task has its own page with review rounds, checks, proof, size and Accept.
- **Terminal:** `cd ~/Documents/reference_repo/factory-run && herdr-task list`, and `herdr-task show FAC-<n>`.
- **Watch the Assistant live:** `hc attach fac-assistant-2` (Ctrl+\ detaches; it keeps working).

## Give it work

- Tell the Assistant: `hc send fac-assistant-2 "<what you want>"`. Later, sheepdog voice sends your words to it.
- Keep requests to real product work. Each task is one complete change of about 150 to 300 lines. Plans and docs are not separate tasks unless you must decide on them.

## Answer it

- The Assistant asks you through an **ask pane**: a small terminal with one question and numbered options, which also reaches your phone. Answer there, or tell the orchestrator your answer.
- It asks only for product decisions, steps only you can do (logins, TCC grants, tokens) and the ask-first list (deleting, force-push, secrets, PRs on others' repos, spending). It decides everything else itself; see "Decide yourself" in `templates/assistant.md`.

## The rules it follows

- **Review:** 2 rounds, one of them by another model; docs get at most 1. From round 2 on, the reviewer sees only what changed. Only one reviewer runs per task at a time.
- **Loop-breaker** (in code): a task still failing review after round 2, whose finding count doesn't drop, flagged twice in the same area, or over 2× its time or Claude-token estimate stops with "recap required". Its worker writes a recap, and the Assistant chooses continue once, split, new approach, or drop. A second trigger means it changes direction. G4 and FAC-50 were dropped this way.
- **Usage:** spend the pool that resets first. Check with `codexbar usage --provider claude` (and `--provider antigravity`). Your floor is 1% weekly unless you lift it.
- **Permissions on the host:** agy reviewers run under `sandbox-exec`, confined to their worktree, with no prompts. Global Claude/Codex hooks stay off: always update with `--no-hooks`.

## Start, stop, resume

```sh
# Stop everything, keeping sessions resumable:
hc interrupt fac-assistant-2                               # then each fac-* terminal
launchctl bootout gui/$(id -u)/dev.shepherdr.service       # the board and ticks
hc kill herdr-automations                                  # the other tick loop

# Start again:
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/dev.shepherdr.service.plist
cd ~/Documents/reference_repo/factory-run && herdr-task scheduler --ensure

# A fresh Assistant session (every few hours, so each turn re-reads less):
hc kill fac-assistant-2
hc run --bg --no-parent --keep --name fac-assistant-3 --cwd ~/Documents/reference_repo/factory-run \
  --label herdr.role=coordinator --label herdr.coordinator.space=fac herdr-assistant-fac "<handoff: state, rules, next work>"

# Install a merged change:
git -C ~/Documents/reference_repo/shepherdr-wt/agy pull --ff-only kc kc-factory
~/Documents/reference_repo/shepherdr-wt/agy/bin/shepherdr update --no-hooks --yes
```

## The VM

The factory is moving into a long-lived Tart VM, `factory-vm`, cloned from `factory-base-<day>` with 8 CPUs and 10 GB. Inside it everything runs with permissions skipped: the VM is the boundary, so there are no sandboxes or allow lists there. Tailscale in the VM lets the phone reach its board. Xcode, simulators and the USB iPhone stay on the host. Until the VM factory is proven on a real task, the host factory keeps running.

## When something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| Ticks, workers and git all hang on a repo under `~/Documents` | macOS lost or is waiting on Files and Folders access for herdr-core or bun | Grant Full Disk Access (System Settings › Privacy & Security) to `~/.local/bin/herdr-core` and `/opt/homebrew/bin/bun`. Test with `hc run --no-parent --name probe -- sh -c 'ls ~/Documents && echo ok'` |
| After `shepherdr update`, the queue freezes | The update restarts the launchd service; a new bun process may lack Documents access | Same grant as above, or boot the service out and let `herdr-automations` tick |
| `~/.claude/settings.json` got Shepherdr hooks | `update` ran without `--no-hooks` (fixed in FAC-3; keep passing it) | Restore from `~/.config/herdr-app/.shepherdr-backup/<stamp>/` |
| The board says "not from Tailscale" | Old service build (fixed in FAC-29) | Update the install |
| A task shows "Working again" for a long time while its worker is idle | A turn ended without `ready` | Tell the worker to run its `herdr-task ready` command again |
| A task keeps going round in review | (The loop-breaker should catch it now) | Read its recap; split, change approach or drop |
