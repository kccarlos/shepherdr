# Porting the factory into sheepdog: design and plan (2026-11-12)

Goal: the factory is managed from sheepdog, by voice and phone, away from the screen. This plan came from a design review (Fable) of both codebases; open decisions are at the end. Terms: the per-project Assistant is called the **coordinator** here (its label is `herdr.role=coordinator`); sheepdog's own orchestrator is `internal/brain`.

## Verdict: integrate first, rewrite selectively later
- The proof night needs no sheepdog: Shepherdr's service already web-pushes needs-you, ready, done and alerts (`service/push.ts`).
- The Python (`mods/tasks/bin/herdr_task/`, ~14k lines) still changes weekly (FAC-57 to FAC-66); porting it now ports a moving target.
- Most of the rest duplicates sheepdog: Shepherdr's own voice, push and phone board (`service/voice.ts`, `push.ts`, `web/`). Only the Python holds the rails.
- Sheepdog stays a relay, so no second LLM orchestrator appears: a brain turn is capped (6 steps, 25 s, `internal/brain/brain.go`), and event turns get read tools only (`internal/brain/tools.go`).
- The task store and gate are not the first port: they are file-based rails already in code and the riskiest to re-implement. They go last.

## Target architecture

| Where | End state |
|---|---|
| sheepdog daemon | The person's channel: voice relay to the coordinator, asks and alerts as cards, push and speech, the approval rail for the person's taps, a read-only task view. Later possibly the no-model watchdog and tick |
| iPhone app | Tasks by status, open asks, Accept, usage pools |
| herdr-core | Terminals, labels, events (unchanged) |
| Coordinator (Claude) | Planning and decisions inside its delegation |
| herdr-task (Python, for now) | Store, worktrees, gate, budgets, loop-breaker, Autopilot |

**Transition contract:** exec `herdr-task … --json`, plus the hc event stream sheepdog already holds. No new socket.
- Read: every command has `--json` (`list`, `show`, `ask --show`, `autopilot show`); `auto feed` gives task events (added, ready, failed, needs-you, merged, stalled; `automations.py`).
- Write: `tell-assistant <space> "…"`, `accept`, `recap --decide`, `autopilot on|run-now`, `project start|checklist`.
- Asks: the ask pane is the contract (`ask.py`: `❯` marks the recommended option, one key answers).
- Shapes: reuse `contracts/board-data.md` and `contracts/gate-evidence.md` as sheepdog's fixtures. Prefer the CLI over the Bun service's `/api/state` so sheepdog doesn't depend on it.

**Gaps:**
1. No task event stream to outside readers (news goes only to the coordinator, `news.py`). Smallest fix: sheepdog re-reads `list --json` when an hc event arrives for a terminal labelled `herdr.task`.
2. Alerts are invisible to sheepdog: `send_alert` writes a `herdr.alert` label (`commands.py`); sheepdog reads only `herdr.space` (`internal/herdrcore/spaces.go`).
3. Worker panes can't be muted: they carry `herdr.task.space`, not `herdr.space` (`launch.py`), and mutes key on the space folder (`internal/attention/mutes.go`).
4. Ask → card → tap has never been run end to end (`docs/sheepdog-v0.md`).
5. `ask.py` copies sheepdog's negative-word list across repos: a hand-kept list that will drift.

## Phases

| # | What | Size | Exit criterion |
|---|---|---|---|
| 0 | Proof night: `project start`, checklist, Autopilot on; sheepdog off or muted so nothing double-pushes | No code | Zero interventions beyond asks and delegated gates (factory.md 12b "Measure"); coordinator share of cost below day one's 41.5% |
| 1 | Sheepdog as ask and alert channel: run gap 4, read `herdr.alert`, quiet factory panes by label; then turn Shepherdr's push off | S (~300 lines Go) | An ask and a watchdog alert each reach the locked phone once; a tap answers; workers make no speech |
| 2 | Voice in: speak to the coordinator through the existing prompt path, plus one read-only brain tool over `list --json` (eval evidence per sheepdog AGENTS.md) | S–M | Give a goal, hear status and answer an ask by voice, never opening the board |
| 3 | Phone board: a daemon endpoint serving the `contracts/board-data.md` shapes, an iOS tasks pane with Accept through the tap rail | M–L | A week without opening the Shepherdr web board |
| 4 | Selective port, on triggers only. Predicted order: watchdog and alerting (`watchdog.py`), usage parking, then gate and store last | L | Trigger: a module caused a field-note-class failure twice, or 2 weeks with no gate changes. Port against contract tests |

**Do not port:** the `mods/` JS desktop plugins; Shepherdr's voice, dictation and web push; `machines.py`, `star.py`, `feedback.py`, `browsers.py`, `backups.py`; the web board once phase 3 lands.

## Risks
1. **Two approval regimes.** The coordinator answers workers' prompts with `hc keys` (`templates/assistant.md`); sheepdog's rail answers only on the user's fresh words (sheepdog `docs/dev/roles.md`). Today sheepdog would announce the same blocked worker and race the coordinator. The boundary must be code: a rule keyed on the `herdr.task` label.
2. **Merge safety.** `project start` sets merge "checks" with agy workers at `perm: full`, unsandboxed, as the same OS user that can call `hc` and `herdr-task`. On the non-PR merge path the worker merges itself (`commands.py`), so "merge is code" holds only for PR repos. factory.md §1 and §13 and the guide still say nothing auto-merges; they are stale.
3. **Cost.** Every worker transition can trigger a sheepdog event turn; quiet-by-label (phase 1) is also the cost control.
4. **Contract drift.** The Python is unversioned; pin it with a fixture test in sheepdog.
5. **macOS consent.** The sheepdog repo sits under `~/Documents`, the folder that stalled the factory for 3 hours.

## Decisions for the owner
- a. Factory worker panes silent in sheepdog by label, with only asks and alerts reaching the owner?
- b. What is the coordinator called in sheepdog's glossary?
- c. Accept merge "checks" with unsandboxed `perm: full` workers, or limit it to PR repos until a sandbox exists?
- d. Phase 3: a native tasks pane, or the web board embedded first?
- e. Agree with the phase 4 triggers, and the gate going last?
