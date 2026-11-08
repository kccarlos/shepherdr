# Board audit: Shepherdr's web app as the factory board

docs/factory.md section 3 ("Board") and phase 6 start the board from Shepherdr's web app (`web/`, `service/`). This
is an audit of what runs today, measured against the board views, plus a comparison with the orchestrator's hand-made
board design (claude.ai artifact 8RSbNnZBZxv3g4CwZAdaQT, "Sheepdog Factory Board": home and one-task pages). It records
facts only: no visual design and no implementation split. The screenshots are in the FAC-19 proof artifact.

## How it was looked at (2026-11-08)

- The installed web app (3.1.16) is served from the Mac mini at `https://kechengs-mac-mini.tail935235.ts.net/shepherdr/`.
- **Finding: from the Mac mini itself, every page answers 403 with the plain text "not from Tailscale".** Both curl and
  headless Brave got it, and `/api/health` answers 200. The refusal is `service/auth.ts:23`: the login header came on a
  connection `service/peer.ts` didn't trust. netstat shows the caller side held by `io.tailscale.ipn` (root). Other
  devices (a phone) were not tested. The cause is not established.
- **Finding: `herdr-browser` fails on the Mac mini** with "agent-browser isn't installed here". Installing it was not
  allowed in this task.
- So the screenshots are of the installed release's own `web/dist`, served by a small Bun stub with fictional spaces,
  tasks and needs (the AGENTS.md method), and driven by headless Brave over CDP. The UI is real; the data is not. Stub
  side effects that are not findings: "detached" on every space, "claude · Not known yet", the same chat in every
  task, and empty machine health.

## The three bars, today

- **Production-ready.** A "Loading…" screen shows before the first snapshot (`web/src/App.tsx:121-135`). After 8 s
  without a link it says "Can't reach Shepherdr. Trying again…" (not captured). A link lost after load shows a top
  banner, "Can't reach Shepherdr since 08:44 AM. Showing what it showed last; trying again." (`web/src/main.tsx:37`),
  and keeps the last screen. Empty states have words: "No tasks on any machine. Ask an Assistant to plan some."
  (`web/plugins/tasks/client.tsx:629`) and "No messages". At 390 px there is no horizontal scroll (scrollWidth 390):
  the sidebar becomes a menu, and Chat / Tasks / Artifacts move to a bottom bar. On the phone's Accept sheet, the
  Details row starts under the sticky Accept and Cancel buttons. A refused page is bare text (the 403 above).
- **Easy.** Desktop shows the Assistant's box and the Tasks panel side by side, with Needs you first and a count in
  the tab and the footer. Sending a request takes one step, but it goes to the Assistant of the space shown (the Home
  space first), not to a named factory Assistant. On a phone, Tasks is a separate tab.
- **Good-looking.** One type family and one spacing scale across the panels. Light and dark both follow
  `prefers-color-scheme`, and the status colors (red needs, green ready, amber working) hold in both.

## The board views

### 1. Send a request (to the Assistant)
- Today: the chat composer "Message the Assistant" (`web/plugins/chat/client.tsx:1780`), with Send, dictation and a
  voice call.
- Data and API: `POST /api/action {type:"send", chat, text}` (`service/main.ts:726` → `service/actions.ts:567`). It
  exists and works for any space's Assistant chat.
- Missing: a way to know which chat is the factory's Assistant. `herdr.factory` appears nowhere in `service/`, `web/`
  or `core/` (grep). The Assistant is found only as a space's coordinator (`herdr.role=coordinator`,
  `service/actions.ts:472`).

### 2. Tasks by status
- Today: the Tasks panel groups tasks by status, in this order: Needs you, Ready, Working, Queued, Scheduled, To do,
  Done. Each row shows its title, ref, space, minutes left and a Review button on Ready.
- Data and API: the `/api/ws` snapshot's `tasks` (`service/main.ts:585`, sent at `service/live.ts:61`). Rows are built
  from the task store at `service/model.ts:239` and mapped at `service/compat.ts:372-404`, with the status mapping at
  `service/compat.ts:44`.
- Missing: each worker's CLI and model. Every live worker is labelled `cli: "claude"` (`service/compat.ts:403`), so
  an agy or codex worker shows as claude. No model field reaches the web.

### 3. Agent tree (Assistant → workers → reviewers, verifier)
- Today: a task's header lists its worker's subagents (for example the "fac-19-review" chip). There is no tree view.
- Data and API: terminals labelled `herdr.task=<slug>#<id>` (`service/model.ts:209-217`). Subagents are the worker's
  hc children (`service/model.ts:264` → `core/chat-view.js:415`). The Assistant → task edge is the row's `space`
  (`service/model.ts:256`).
- Missing:
  - A reviewer or verifier that herdr-task starts (contract G3/G5) is not the worker's child, so `subagentsOf` won't
    list it.
  - `agentsOf` finds such an agent with role `reviewer`, but it is only dropped from `worker` (`service/model.ts:245`)
    and never sent.
  - No snapshot field carries a terminal's role, CLI or model per task.

### 4. Each task's evidence (review rounds, checks, verdict, proof)
- Today: the Accept card shows the summary, commits, changed files, checks, proof and folded details. A task's tabs
  show its chat, terminal, files, changes, pull request, browser and artifacts.
- Data and API: `POST /api/action {type:"evidence"}` (`service/actions.ts:636`), which runs
  `herdr-task show --evidence` (`mods/tasks/bin/herdr_task/proof.py:96`). It works for any task, not only Ready ones
  (`service/actions.ts:587`).
- Missing:
  - None of `reviews`, `review_runs`, `checks` or `verdicts` (contracts/gate-evidence.md) is in the evidence or the
    snapshot rows.
  - "Checks" is GitHub's PR rollup only (`proof.py:75-83`), not a check herdr-task ran.
  - Today's worker-recorded rounds use another shape (`result`, `text`, `head`; `commands.py:478`) than the
    contract's herdr-task rounds (`verdict`, `must_fix`, `started_by`).
  - G2–G5, which produce those records, are not on kc-factory yet.

### 5. Open asks
- Today: Needs you (the panel group, the filter and the footer count) lists tasks needing the person, blocked
  Assistants, Claude permission or question cards and secret asks (`service/compat.ts:409-430`).
- Data and API: the snapshot's `needs` and `asks`. `service/asks.ts` is a different idea: Claude Code
  PermissionRequest hook cards in `data/chat-asks`, answered through `/api/action`.
- Missing: FAC-9's ask pane keeps `STORE/asks/<id>.json` and a blocked hc terminal. It exists only on the unmerged
  branch `task/9-herdr-task-ask-and-the-ask-pane` (`mods/tasks/bin/herdr_task/ask.py`). No service code reads those
  records or shows such a pane.

### 6. Usage pools (claude, codex, antigravity; 5-hour and weekly left, resets)
- Today: the machine's meter popover, "Plan usage": per CLI, each window's % left and % used, and when it refills.
  Antigravity says "No usage info."
- Data and API: the snapshot's `machines[].stats.limits` (`web/shared/types.ts:182`). These come from
  `service/machines.ts`, which runs `machine.py --limits` every 10 minutes (`mods/tasks/bin/herdr_task/machine.py:484`,
  claude and codex only). They are shown in `web/plugins/health/client.tsx:223`.
- Missing: antigravity, and codexbar as the source. FAC-20's `mods/tasks/bin/herdr_task/usage.py` (codexbar: claude,
  codex, antigravity) is only on the unmerged branch `task/20-usage-pools-codexbar-module`. The popover sits per
  machine, a click away.

### 7. Deliverable previews (docs/factory.md section 3 on origin/kc-factory)
- Today: each task has an Artifacts tab, its proof first. The Accept card links the proof, and a recipe draws natively
  on the web (`web/src/screens/Recipe.tsx`). An artifact posted in a chat is a message (`ArtifactPost {id, v}`,
  `web/shared/types.ts:514`).
- Data and API:
  - Every artifact's record comes from herdr-artifact's registries in `~/.herdr/artifacts` (`service/artifacts.ts:13-23`):
    `{id, title, version, task, publisher, at, files, versions[{v, at, publisher}]}`. It reaches the snapshot's
    `artifacts` (`compat.ts:302`).
  - A task's proof is `t["proof"]`, set by `herdr-task ready --proof` (`commands.py:369-373`). It goes into rows
    (`model.ts:266`) and `Task.proof` (`compat.ts:393`).
  - The task's other artifacts come from its agents' addresses (`compat.ts:391` → `core/task-artifacts.js:32`, by
    `publisher`).
  - A recipe's JSON and pictures are served at `GET /api/artifacts/<id>/recipe?v=` and `/file/<path>?v=`
    (`service/main.ts:611-620`).
- Missing:
  - Thumbnails: `Artifact.thumb` is declared (`types.ts:488`, "the check's picture of it") but nothing in `service/`
    sets it, and no endpoint serves one.
  - An external-link kind: a claude.ai canvas link is not an artifact record. Only local recipe and GPUI kinds exist
    (`types.ts:466`).
  - A per-agent latest deliverable: `publisher` is a terminal address, and the web is not sent which tree node made
    which artifact.
  - Before/after pairs as a kind.
  - A "new to look at" mark per person: read marks exist for chats only (`Snapshot.read`, `types.ts:1220`).

## Compared with the orchestrator's design

| Design view | Data it needs | Exists (file:line) | Missing |
|---|---|---|---|
| Usage pools strip (claude week and 5 h, gemini week, codex week; % left, resets) | Per-provider windows | claude and codex: `machine.py:484` → `types.ts:182` | antigravity/gemini (FAC-20 branch only). The design's "gemini" is a different codexbar provider from FAC-20's `antigravity`. |
| "Tell the factory" box with Send and voice | The factory Assistant's chat | send: `actions.ts:567`; dictation: `main.ts:634` | Which chat is the factory's (view 1) |
| Task lanes: needs you, working, queued, done (id, eta, progress, status line, worker model, reviewer model) | Task rows with agents | rows: `model.ts:239`; left/progress/said: `compat.ts:383,400` | worker and reviewer CLI/model (`compat.ts:403`); the "11 merged tonight" count |
| Agents panel (Assistant, then workers with their reviewer child) | Terminals by role, parent and model | `model.ts:209`, `core/chat-view.js:415` | reviewer/verifier rows, models (view 3) |
| "asks for you" | Open asks | `needs`: `compat.ts:409` | FAC-9 records (view 5) |
| "merge gate" panel (feature rollout states) | Not task data | none | No source anywhere; it is the factory's own build state |
| One task: review rounds (round, verdict, detail, head, model) | `t.reviews` / `review_runs` | worker rounds in the store only (`commands.py:478`) | not sent to the web; contract shape not produced (view 4) |
| One task: checks (command, result) | `t.checks` | GitHub rollup only: `proof.py:75` | herdr-task's own check records |
| One task: agents (worker, reviewer, "accepted by") | Agents per task, who accepted | `task.agents` addresses (`model.ts:267`) | CLI/model per agent; who accepted |
| One task: size (lines vs limit) | Diff size, the brief's limit | `+/-` in evidence: `proof.py:136-138` | the size limit (it lives in brief text only) |
| One task: proof link | Proof id | `proof.py:99`, Accept card | — |
| "New to look at" strip (added later) | Recent artifacts per task and agent, a seen mark, thumbnails | `artifacts` in the snapshot (`compat.ts:302`) | thumbnails, link kind, seen marks (view 7) |

Gaps this audit found that the design doesn't cover:
- Loading, offline and error states.
- A light theme.
- Phone layout of the lanes.
- The 403 from the serving Mac.
- A Ready task's Accept action.
- Ready as its own lane: the design has no Ready lane, only needs you, working, queued and done.
