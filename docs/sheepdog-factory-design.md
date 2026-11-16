# sheepdog-factory: design and roadmap (2026-11-16)

A direction-setting design. Code and docs were read, not run. Web sources are cited by number; *search summary* means I did not open the primary page. *Unverified* means a path nobody has exercised.

This doc **supersedes the verdicts** of [sheepdog-integration-design.md](sheepdog-integration-design.md) ("keep the fork, sheepdog controls it") and [owner-console-evaluation.md](owner-console-evaluation.md) ("Shepherdr's phone web first"). Their engine findings (forged approvals, ask kinds, typed rules, the owner contract) are kept and reused below.

Words: the **owner** is the person. The **engine** is today's `herdr_task` Python package. The **coordinator** is the one Opus agent per project (Shepherdr's "Assistant"). The **brain** is sheepdog's `internal/brain`. The **babysitter** is the outside Opus session that watched the factory by hand; it must not come back.

## 1. Verdict

**Yes, this is the right direction under the new goals. Build one product: the engine leaves the Shepherdr fork and ships inside sheepdog's install, on herdr-core only. But extract it, do not rewrite it: the Python engine and its tests move as they are, and the Go port stays off the plan until a trigger fires.**

What changed since 2026-11-14, and why the earlier answer no longer holds:

| Earlier argument | Now |
|---|---|
| "Upstream still pays for most of it" | Still true of the engine: the 11-14 doc counted about 14k of its lines as upstream's. But most of upstream's work is the desktop UI we are dropping (53.4k lines of JS mods, 13.8k of TS `service/`, 29.9k of `web/`), and once spaces become projects and the commands are renamed, upstream's engine fixes no longer merge. Syncing itself was not the problem: the factory merged 119 upstream commits unattended (note 34). We give this up knowingly. |
| "Shepherdr's phone web is the cheapest console" | The owner chose the console: sheepdog voice. A second owner channel is what "stitched" means. |
| "Sheepdog is a second consumer, only if a test fails" | Sheepdog is the product; the factory is a mode of it. |
| "Releases cannot be delegated" | The owner already delegates patch releases after QA. Delegation becomes a typed rule with a scope and an expiry (section 3). |

What still holds, and how this plan respects it:

| Earlier argument | Evidence today | How the plan respects it |
|---|---|---|
| The rules are a moving target | Since the 11-14 doc: 14 engine changes merged (FAC-96 to FAC-110), 3 in flight (FAC-111 to 113), 4 new field notes (50 to 53) | No rewrite. The Python moves with its history; pitfall fixes keep landing during the move |
| A port throws the tests away | 16.5k lines of Python tests in 20 files; `test_herdr_task.py` alone has 534 tests in 77 classes | The suite is the acceptance test of the extraction (phase 1) |
| The brain cannot judge factory work | 6 steps and 25 s per turn (`brain.go`), not Opus | The brain routes and reads back. Judgement stays with the coordinator and the Fable gate |
| An owner approval can be forged | `accepted_by` is free text; an agent can type "the owner approved" | Owner answers are proven by the daemon, in code (section 3). Sheepdog's rule "rails stay in code" applies |
| No babysitter layer | Night one needed about 40 interventions | Every duty has a named owner in code or in the coordinator (section 5) |

One honest cost: we lose upstream for good and own 19k lines of Python alone. And the seam does not vanish, it moves inside one install: a Go daemon and a Python engine still talk over a contract. That is acceptable because the owner sees one tool, one update and one channel; the contract gets a fixture test in the same repo.

## 2. Product shape: what "hands-off, voice-only" means

The owner's whole loop is five things. Each is one short exchange.

| Touchpoint | The owner says or hears | What happens in code |
|---|---|---|
| Give a goal | "In WukongMind, build Learn on ask for 1.5." | The brain picks the project and passes the words unchanged to its coordinator (`say`). The coordinator plans a graph (section 4). The owner hears a three-sentence plan summary |
| Set a rule | "Designs don't wait for me; Fable decides." | Read back with its class and scope ("Typed rule, this project: … Save?"). Saved on a yes. Never asked again |
| Answer an ask | "Two things need you. WukongMind: tag 1.5.0 now? …" "Yes." | The ask is a record; the answer goes through the rail; the engine runs what it unlocks |
| Approve a release | Same as an ask, kind `release`, unless a delegation rule covers it | Engine tags or triggers the workflow after the proven answer |
| Hear a digest | "Since last night: 9 merged, milestone 2 done, 1 waiting on CI, Claude 40% left. Nothing needs you." | Built in code from the store, no model. On request, at a milestone, in the morning |

**Never narrated:** a worker starting, finishing, asking its coordinator, a review round, a CI run, a retry, a rebase, a model switch, a restart that worked. In a factory project a code rule keyed on the task label silences all worker and reviewer speech and push. Only asks, alerts and digests get through. This is a code rule, not a chattiness prompt.

**Alerts** (things that break the silence without being asked): the factory has stopped (no pool left, disk, a consent prompt suspected, main red for over an hour, a task waiting on CI over 90 minutes), and nothing else.

**Still at the Mac**, collected by `doctor` and the start checklist before the owner leaves: agent CLI logins, `gh` login, Apple sign-in with two-factor, Apple agreements, macOS consent prompts (Files and Folders, removable volumes), typing a new secret value, pressing a Claude reset. The phone only says one is wanted (notes 7, 12, 36, 40).

Without the app team's APNs key a self-hosted daemon cannot push to a locked phone. The first-run text must say so: asks then wait in the inbox and are spoken at the next voice session.

**The test for every message, setting and page element** is borrowed from dsh-superagent [10]: it costs the owner attention, so it must give more than it costs or it is removed. Two of its rules become ours as written: "speak only when a person must act or can use a result", and "ask one concrete question at a time, in a structured form".

Community check: the systems I read put people at gates or at review, not in the loop [1][2][5][10]; StrongDM removes review as well [8, *search summary*]. I found nothing published on voice digests for a factory; this part is ours to prove.

## 3. Architecture on herdr-core

```
owner ── voice / phone ── sheepdog daemon (Go) ── owner contract ── engine (Python, stdlib only)
                           rail, proof, cards,      (JSON, fixture     store, tick, gate, graph,
                           digest speech, rules      tested)           budgets, watchdog, rules
                           read-back                                        │ hc
                                                                 herdr-core terminals:
                                                    coordinator (1 per project) · workers · reviewers
```

| Question | Answer | Why |
|---|---|---|
| Where does the engine live? | Its own process, owned by sheepdog. Source in the sheepdog repo under `factory/`; the release binary embeds it (`go:embed`, as `panel.go` already embeds the panel) and unpacks it per version | One install, one version, one update. A feature that touches both sides is one task and one PR |
| Who runs the tick? | The daemon keeps one tick loop alive **as an hc terminal** (`hc run --keep`), as `scheduler.py` does today | A process started by launchd had no Documents access and hung on 11-08; hc terminals sit in the user session (note 10). That is not a cure: the same night processes under hc also hung on Documents until access was granted. The cure is the timed probe in `doctor` and the watchdog. The daemon's own calls (`owner … --json`) read only the store, never the repo. The daemon replaces launchd-bun and `scheduler --ensure` as the thing that keeps the tick alive |
| Language | Python first. No port now (section 8 has the triggers) | Section 1 |
| What replaces a "space"? | A **project = a repo folder**. The store is already one file per folder (`tasks/<slug>.json`, with `project_id`). Settings layers become Everywhere → machine → project. Labels become `sheepdog.project`, `sheepdog.role`, `sheepdog.task` | 8 direct `herdr-app` calls in 5 modules and `APP_HOME` paths in 11 modules are all about spaces, tabs, chat and backups |
| Coordinator | One Opus agent per project, in an hc terminal, no window. Plans the graph, writes briefs, answers workers, decides recaps. Woken by events and a long heartbeat (today's Autopilot, always on). The owner never types in its pane | It is the only place with enough context and model for judgement |
| Brain | Routing only: which project; pass the words on unchanged; answer "what needs me" and "how is X" from code-built facts; read a rule back. Never ranks, accepts, judges or polls | 6 steps and 25 s are enough for that and for nothing more |
| Owner contract | The shapes from the earlier doc: `projects`, `asks`, `digest`, `rules`, `graph` (new), and actions `answer`, `say`, `propose_rule`, `revoke_rule`. v1 binding is `engine owner … --json` | One producer, one consumer, one fixture |
| Approval rail | Every owner decision is an ask record with a kind (`decision`, `gate`, `release`, `paid-key`, `delete`, `install`, `reset`, `rule`). For every gated kind the engine asks the daemon over loopback "did the owner's own tap or fresh words answer ask X?" and refuses without it. `--owner-approved "<text>"` is removed | Today any agent can write the approval. This stops shortcuts, not a same-user attacker; VMs do that |
| Standing rules | One store, two classes, named in every read-back. **Typed** (enforced in code): merge policy, review rounds, auto-accept bar, design gate (`fable` or `owner`), delegation `{kinds, scope, until}`, notify level, project priority. **Text**: given to the coordinator at every start, compaction and handoff (`assistant_settings.py` does this today). Claude resets are never delegable | "Said once, kept": typed rules do not depend on a model remembering |
| Prompt assembly | Built-in parts ship in the binary. The owner's text rules are separate sections laid over them, each recording the built-in text it was based on. The typed-rules summary and the pool table come last and are rebuilt at every wake | From dsh-superagent's `docs/004-prompts.md` [10]. An update then reaches every coordinator without losing the owner's text (note 37), and a rule change leaves the earlier prompt unchanged |

## 4. Task graph

**The problem today.** The data half exists: 73 of 130 WukongMind tasks and 23 of 101 factory tasks carry `--after`. What is missing is everything around it. Milestones live only in title text ("M4 5b: …", "10. Learn on ask acceptance and 1.5.0"). There is no view of order, no check of the plan as a whole, and merges go in task-list order whatever depends on what.

**The model.** Project → milestones → tasks → dependencies.

| Object | Fields added | Rule in code |
|---|---|---|
| Milestone | id, goal, order, exit test, gate (`auto`, `fable`, `owner`), state (planned, active, validating, done) | Ends with an acceptance task the engine adds itself, run by a fresh agent that did not write the code |
| Task | `milestone`, `after[]` (exists), estimate (exists), kind (exists) | A task is *ready to start* when every blocker is done: the same rule as Beads' `bd ready` [4] |
| Plan | A file the coordinator writes; `engine plan apply` checks it | No cycles or dangling ids; every task within the size limit; a design task before a UI milestone; a release ask placed before the merge (note 31) |
| Mandate | On each milestone: the owner's words as said, the project, when, and `explicit` (the owner asked) or `inferred` (the coordinator proposed it under a rule) | Immutable; wider scope is a new mandate. Inferred work is first only recorded as "would start" until the owner turns that rule on. From dsh-superagent's Mandate and its `observe` mode [10] |

**One stage per task, from one ordered table.** A task's stage is what it waits for, and the first matching row wins: owner answer, owner gate, blocked or failed, CI, a blocker task, queued, idle, working. Today the order of status checks hid an out-of-rounds task behind "Working" (note 49) and showed a background build as "Needs you" (note 26). dsh-superagent does this in 26 lines (`src/core/stage.ts`, table in `docs/003-execution.md`) [10]. The owner-waiting rows are the inbox; nothing else is.

**How it is planned.** The coordinator turns the goal into a plan file with milestones. A milestone plan is a judgement task: the Fable gate reviews it, or the owner does if their rule says so. Planner output stays at "what and why" [3].

**How it stays current.** States are derived by the engine, never typed by a model. A split keeps the parent's place in the graph. A replan is `plan amend` with a reason in the log. The digest reports replans as one number.

**Critical path.** Longest remaining chain in the active milestone, from task estimates and the workers' own `--left`. It drives three things: merge order (a task others wait on merges first), urgent priority, and the voice summary.

**How it is shown.**

| Surface | Content | Why |
|---|---|---|
| Voice | "Milestone 2 of 4. 7 of 12 merged. The path to done runs through CI speed-up, then the slow UI tests: about 5 hours. Nothing needs you." | A graph cannot be spoken; its critical path and its blockers can |
| One read-only page, `/factory`, served by the daemon | First what needs the owner, if anything; then milestones left to right, tasks in dependency layers, critical path marked, one line of "why waiting" per task. A healthy state takes no space | Order and relations are the weakness the owner named, and they are visual. Plain JS in the daemon's web, reachable from the paired phone |
| Terminal | `sheepdog factory graph` as a text tree | Free with the same data |

No board, no drag and drop, no chat. A native iOS view only if the page gets used.

Community: milestones as the unit of validation, with validators that have not seen the code, is Factory's Missions design [5, *search summary*]; planner, workers and judges after flat coordination failed is Cursor's [6, *search summary*]; Symphony keeps blockers out of its core and dispatches on a `dispatchable` flag [1]. Claude Code's agent teams share a dependency-aware task list [7, *search summary*].

## 5. Autonomy defaults

Shepherdr became usable after weeks of flipping settings. These are on from the first run; each exists in the engine today unless marked **new**.

| Area | Shepherdr default | sheepdog-factory default |
|---|---|---|
| Accept | The person | The engine, at the evidence bar: 2 passing review rounds, CI green, proof present, no open owner ask (FAC-99) |
| Designs and plans | Wait for the person (FAC-94) | A Fable round judges as the owner would, then accept (FAC-99). A typed rule can switch a project back to "wait for me" |
| Autopilot | A switch, off | Not a switch. The coordinator is always event-woken |
| Review | Rounds until told | 2 rounds, a different model than the worker, deltas from round 2, design and doc tasks 1 round, merge-only commits exempt, one extra round granted by code after a pass (notes 32, 46, 49) |
| Releases | Ask | Ask, unless a delegation rule covers the scope ("patch tags after QA") |
| Worker permissions | Allow-list prompts | On a fresh install: workers run with full permissions as the user, bounded by the brief and the worktree, as we run today. That is not a sandbox, and first run says so. Reviewers stay in the macOS sandbox profile. A project on a VM machine is the real boundary and is opt-in. Worktrees pre-trusted per CLI; CLI auto-update off during runs (notes 13, 21, 40) |
| Questions | CLI dialog | `ask` records only; a pane blocked on a dialog is flagged (note 51) |
| Worker reports | Read from the screen and last words | Structured only: `status`, `ask`, `ready`, plus `blocked` and `dropped` (nothing for a person to do: ends without a message). dsh-superagent rejects "inferring waiting on a person from free text" for the same reason [10] |
| Stop rule | Line count | By impact: a local change runs to a reviewable result; a change that breaks callers or moves module responsibilities stops with one question (`prompts/team/scope.md` in [10]). The size limit stays in code as a review-ability check, without generated files (note 42) |
| Queue | First come | One slot is kept for work the owner just answered, so new work never holds up an answered ask (FAC-103's urgent slot, generalised) |
| Background jobs | "Needs you" or dropped merges (notes 26, 50) | A task waiting on its own job keeps its slot and stays "working", capped at 30 minutes |

**agy stays first-class.** Its adapter (argv, permission mode, trusted workspaces) is in `launch.py` and `settings.py`; 15 modules mention it. Its pool has a rolling window, which the pool table must show as such. Its known traps stay as tests: allow-list prompts (note 13), resume needing a nudge (note 14, FAC-100), sign-in now in the keychain so a sandboxed reviewer has no token (note 15), and a reviewer that exits after its verdict reading as a crash (notes 22, 24).

**CI** (from WUKO-130: 349 runs and 9,188 macOS minutes in 5 days; 89 of 162 PR-hours fell on one day; 26 runs existed only to re-test a branch after someone else's merge):

| Rule | State |
|---|---|
| A behind, conflict-free PR merges after the cheap local checks, not a full CI run | FAC-111, in flight |
| Never auto re-run a job that hit its own time limit | FAC-112, in flight |
| Main red: hold merges and say so; say "merge main", never "rebase" | FAC-113, queued |
| Count PRs in CI against the runner cap before pushing another | **new** |
| Alert when a ready task has waited on CI for 90 minutes | **new** |
| Docs-only commits exempt from new rounds; keep the first `ready_at` | **new** |
| Project start writes the CI shape: one summary check, docs skip, at most 3 heavy jobs per PR, queue not cancel on main, base flakiness measured first (notes 23, 28) | **new**, as a start-checklist item |

**Quota and models.** The owner's rule (11-13) is four lines and says "judged by the model, don't code a pool picker"; field note 43 and the earlier design say "put it in code". Both are right about different halves. Code supplies **facts and hard rails**: a fresh pool table (share left, time to reset, from `codexbar`) in every coordinator wake; never start on an empty pool; switch a running task only at 0%, with the handoff (FAC-104); Codex is a reviewer by default; the coordinator is Opus; at the 5-hour floor write handoffs and sleep to the reset; only the owner presses a reset. The **choice among pools with quota** stays the coordinator's.

**Watchdog, recovery, identity.**

| Failure | Rule |
|---|---|
| Coordinator "working" with no child process and no output for 20 minutes (note 53) | Esc once, then a fresh session with a handoff, then alert |
| Coordinator on an API error or an old template (note 37) | Retry; fresh session with handoff (FAC-78) |
| New agents start blank; a volume answers only old processes (notes 38 to 40) | One alert: "a macOS permission prompt may be waiting"; stop starting agents |
| Crash, reboot, hc restart | At daemon start and every tick: every project with open tasks has **exactly one** live coordinator. None: start one from the store with a handoff. The store is the truth, as in Symphony, which re-polls after a restart rather than restoring state [1]. Workers come back through `revive.py` |
| Coordinator identity | A lease in the project record (terminal, session, template hash). `say`, news and wakes go to the lease holder, not to "whatever terminal has the role label". A second claimant is refused. The restart path is engine code; today `watchdog.restart_assistant` runs `mods/coordinator/restart.sh` from the herdr-app folder, so it cannot work headless |

**Notes 54 and 55 are the cases this must pass, as tests.** Note 54: a coordinator exits during a disk stall; Autopilot, keyed to a dead space id, only queues wakes; workers keep a dead parent and their finished tasks reach no one for hours; recovery needed the owner to open a tab and type. Note 55: a hand-started `claude` and a tab renamed "Assistant" were taken for coordinators; a new space pointed at the home folder; a coordinator tab vanished before its first message; a listing showed the space's folder instead of the agent's cwd. The tests: after any coordinator exit the engine reaches exactly one coordinator per project, in the repo folder, with no owner message; workers with a dead parent are re-parented and their held news delivered; wakes are keyed by project folder; a terminal without the lease is never treated as the coordinator, whatever its name or labels.

## 6. One install

| Layer | How it arrives | Notes |
|---|---|---|
| sheepdog daemon, voice, phone pairing | The one-line installer or Homebrew, as today | One-action update already ships (v0.1.30) |
| Engine, templates, reviewer sandbox profile | Embedded in the sheepdog binary | The engine imports only the standard library. Compressed it should be a few hundred KB (estimate) |
| Python | A managed, current CPython (latest stable 3.x, pinned per release), installed by the installer through `uv python install` into sheepdog's own data folder; never the system `python3` (macOS ships 3.9). Owner decision 2026-11-16 | The engine may use current language features; CI runs only the pinned version. The install grows by one managed interpreter (tens of MB); `doctor` checks it and repairs it |
| herdr-core | The installer fetches it if missing | `hc --help` lists no plugin command, and sheepdog's plugin manifest targets herdr 0.9.4 or newer (herdr-tui), so a plugin is not the route. *Unverified: whether today's installer fetches hc* |

**Cannot be bundled**, so `sheepdog factory doctor` checks each with one plain fix line:

| Thing | Needed for | Without it |
|---|---|---|
| At least one agent CLI, logged in (`claude`, `codex` or `agy`) | Everything | Stop. One CLI is enough: the reviewer is a fresh session on another model |
| `gh`, logged in, default repo pinned (note 33) | PRs, CI, merge | Local-merge mode only |
| `codexbar` | The pool table | Run without quota facts; switch only on a provider error |
| A project volume that answers a timed probe from inside hc | Starting agents | Stop, and name the consent prompt |
| Xcode, `asc`, Apple session, agreements, simulators | iOS projects only | The iOS checklist items stay red |
| APNs relay | Push to a locked phone | Asks wait in the inbox; say so |

**First run, for someone without our context:**

1. Install; `sheepdog setup` (voice key, pairing) as today.
2. `sheepdog factory start <folder>` or "start a project in …" by voice. Doctor runs first.
3. At most five questions, spoken or typed: the goal or a requirements file; which gates you delegate; releases; notify level; confirm the pools found. Each answer is saved as a rule. The manner follows dsh-superagent's `SETUP.md` [10]: probe once and skip what the probe answers; one question at a time, each with a recommended answer that one word accepts; do nothing while asking; show the whole plan once; never ask for a secret in the conversation; put every step that needs the owner's hands in one message.
4. The coordinator starts, plans, and the owner hears the plan summary. From here on: asks and digests only.

`project.py` (621 lines) already has `project start` and `project checklist`; it loses its herdr-app step and gains the doctor.

## 7. Extraction map

Engine modules by fate (lines from `wc -l`; total 19,268). The split comes from each module's docstring and one grep for `space`, `chat`, `APP_HOME` and `herdr-app`; it is **not a line audit**, and phase 1 starts with one.

| Fate | Lines | Modules |
|---|---|---|
| **Keep**, at most a few lines touched | 3,992 | `store`, `queues`, `github`, `budget`, `checks`, `proof`, `provider`, `sessions`, `simulators`, `devices`, `usage`, `machine`, `when`, `archive`, `output` |
| **Adapt lightly** (4 to 14 grep hits each) | 2,526 | `automations` 815, `tick` 744, `revive` 334, `ghnews` 318, `takeover` 242, `handoff` 73 |
| **Adapt** (spaces → projects, no window, no chat, owner contract) | 10,703 | `commands` 2,119, `agents` 1,308, `launch` 999, `settings` 944, `autopilot` 912, `machines` 870, `project` 621, `news` 609, `cli` 554, `feedback` 473, `watchdog` 287, `base` 274, `assistant_settings` 263, `ask` 237, `templates` 194, `scheduler` 39 |
| **Drop** | 1,152 | `backups` (the window's document), `home` (home-space Assistant; its health sample stays in `machine`), `reactions`, `star`, `browsers` (the Browser view) |
| **Replace** | 895 | `layout` (the move from `~/.herdr`) becomes a one-time importer of a Shepherdr store |
| **New, Python** | est. 800 | milestones and plan checks, graph and critical path, owner contract, coordinator lease, CI capacity rule |
| **New, Go** | est. 1,200 | `internal/factory`: keep the tick alive, contract client, asks as cards, answer proof, quiet rule, rule read-back, digest speech, `/factory` page |

Outside `herdr_task`, the templates and engine call helpers that also need a fate:

| Helper | Size | Fate |
|---|---|---|
| `herdr-secret` | 984 lines Python | Keep the by-name store; the masked box becomes a terminal prompt at the Mac |
| `herdr-artifact` and the recipe viewer | in the web app | Proof becomes files (Markdown, images, `recipe.json`) linked from the PR; `/factory` shows the summary only |
| `reviewer.sb` | 43 lines | Keep |
| `mods/coordinator/restart.sh` | — | Rewrite inside the engine (section 5) |
| `service/` (bun), `web/`, every JS mod | 97k lines | Drop |

**Field-note fixes that must survive, as named tests** (most exist in the Python suite; the extraction may not delete them):

| Notes | Fix |
|---|---|
| 13 to 15, 22 | The agy traps listed in section 5 |
| 20, 24, 25 | A reviewer's verdict is recorded end to end per CLI; a pass tells the worker and starts the next round |
| 27, 42 | Size limit in code, generated files excluded |
| 28 | CI attempts count in the loop-breaker |
| 31, 51 | An open ask outlives its worker; no blocking dialogs |
| 33 | Every `gh` call pins the repo |
| 38 | Ending an agent ends its process group |
| 54, 55 | One coordinator per project after any exit; orphaned workers re-parented; identity by lease |
| 39, 40 | Timed volume probe |
| 45, 46 | The reviewed commit is the PR's head; merge-only commits are exempt |
| 48 to 50 | Design waits for its gate; out-of-rounds is visible and self-granting; a wake after ready keeps the merge |
| 52 | Bring a PR up to date before merge (then FAC-111's cheap path) |
| 53 | "Working" with no child is stuck |

**Templates.** `assistant.md` (222 lines) carries the most value and the most Shepherdr:

| Keep | Change | Drop |
|---|---|---|
| Plan, Start the workers, News and watching, Decide yourself / Ask only for, If you were restarted, the iOS and CI rules | Identity ("you coordinate project X; the owner does not read this pane; you reach them only through `ask`, `alert` and the digest"). Plans are a milestone graph through `plan apply`. Accept is policy, not "never accept". Autopilot becomes the only mode. A pool table arrives in each wake | Feedback for Shepherdr, Usage insights, the star, Home space, suggested next message, showing media in chat, the Tasks panel, `herdr-app ls`, the header switch |

`worker.md` (33 lines): drop the two herdr-app mod rules, chat media, the Browser view, suggestions and feedback; keep status, review, `ask`, `ready`, device-wait and secrets. `reviewer.md` (16 lines): keep, minus its two Shepherdr lines (the feedback line and the `herdr-app check` warning).

Sheepdog's rule that prompt changes need eval evidence applies. The factory templates need a small replay set first: about ten scripted situations from the field notes run against the suite's `fake_cli`. Changes to the brain's routing go through `make eval` with no Safe regression.

## 8. Roadmap

Dogfooding: **today's Shepherdr factory builds phases 1 to 4** as ordinary FAC tasks. The new factory first runs a throwaway project in a VM, then itself (phase 5), then WukongMind.

| # | Phase | Size | Exit test |
|---|---|---|---|
| 0 | Close out: land FAC-111 to 113; record the baseline (owner touches and outside interventions per day) | S, days | The three tasks merged; a baseline number exists |
| 1 | **Extraction.** A line audit first; then `factory/` in the sheepdog repo with history; spaces → projects; herdr-app calls removed; five modules dropped; the pinned current Python in CI | M to L, Python est. 2,000 to 3,000 lines touched (unaudited) | The whole Python suite passes with no herdr-app installed. On a Linux VM and a clean Tart VM with only hc and one CLI, a task goes from `add` to a merged PR |
| 2 | **One install and staying alive.** Embed and unpack; daemon keeps the tick; doctor; coordinator lease and reconcile; engine-owned restart | M, Go ~500, Python ~400 | A fresh VM: one install command plus logins, `factory start`, first PR merged. Reboot mid-task: work resumes within 5 minutes with no person and exactly one coordinator |
| 3 | **Owner channel.** Ask kinds and proven answers; quiet rule; `say`; rules with read-back; digest | M, Python ~500, Go ~600, Swift small | One full day by voice and phone only: goal, rule, ask, release, digest. In tests a typed "owner approved" and agent keys into an ask are refused. Zero worker speech. `make eval` shows no Safe regression |
| 4 | **Graph.** Milestones, `plan apply`, critical path, merge order, voice summary, `/factory` page; the new CI rules | M, Python ~600, Go and JS ~500 | "What is blocking milestone 2?" is answered by voice from code-built facts. A split or replan keeps dependencies. The page shows order without opening a terminal |
| 5 | **Self-hosting.** The new factory builds itself and WukongMind; Shepherdr is uninstalled on the Mac; stores imported | S code, 1 week run | One week, two projects: no babysitter intervention, and owner touches are only the five in section 2 plus the at-the-Mac list |
| 6 | **A stranger's first run.** Public docs; a QA agent in a fresh VM follows only the docs | S | It reaches a merged PR with no help |

**When a Go port is justified.** Never as one move. Per module, when both are true: the module has had no rule change for 30 days, and the daemon needs it in process. Read paths (store, graph, digest) are the likely first. A second trigger: system Python becomes the top install failure in phase 6. Review at the end of phase 5; the default answer is "not yet". Anthropic's own advice points the same way: re-examine the harness when a model ships and delete parts that no longer carry weight [3], which is cheaper in Python.

**Do not build:** a task board or chat UI; per-worker narration; a second model above the coordinators; an agent teams or MCP/A2A adapter; our own merge queue (use GitHub's where the plan allows it [9, *search summary*]); tasks of one project on several machines; VM provisioning; secret entry on the phone; a native iOS graph before the page is used; the Go port.

## 9. Decisions for the owner, and risks

| # | Decision | Recommendation | Why |
|---|---|---|---|
| 1 | Extract the Python engine now, port to Go only on the triggers above? | Yes | 14 rule changes in two days; 534 tests carry the pitfalls |
| 2 | Where does the engine's source live? | In the sheepdog repo, `factory/`, embedded in the binary, off until `factory start` | One version and one PR per feature. Shepherdr is MIT, so its notice comes along. The other choice is a separate repo whose release sheepdog embeds |
| 3 | Model choice: code or coordinator? | Facts and hard rails in code; the pick stays with the coordinator | Reconciles your 11-13 rule with field note 43 |
| 4 | Designs and plans by default | Fable gate accepts; a per-project rule can make them wait for you | Your 11-15 practice; FAC-94 becomes the opt-in |
| 5 | A visual surface? | One read-only `/factory` page. No board | Task order is the named weakness and cannot be spoken |
| 6 | The fork | One last upstream sync of the engine before phase 1, as a factory task like note 34; then stop. Freeze Shepherdr's web and board now; uninstall at phase 5 | After the extraction upstream's fixes no longer merge, so take what exists first |
| 7 | Workers on a fresh install | Full permissions as the user, said plainly at first run; a VM machine per project as the opt-in boundary | It is what works unattended today; the worker sandbox was cancelled on 11-08 and VM provisioning is out of scope |

| Risk | Containment |
|---|---|
| We own everything; the factory grows inside a 129k-line product | Section 8's "do not build" list; size limits per phase; the factory is off by default for sheepdog's existing users |
| A same-user agent forges an owner answer over loopback | Every answer logged with its input; workers in VMs; this stops shortcuts, not attackers |
| Voice-only is too thin: the brain routes a goal to the wrong project | Goals and rules are read back with the project name before they are sent |
| The Go–Python contract drifts | One fixture both test suites run; unknown ask kinds are refused |
| A CLI changes under us (agy's sign-in moved, Claude's updater triggered a consent prompt) | Doctor runs a canary start of each CLI before every unattended run; auto-update off during runs |
| Two factories during the move | Shepherdr builds, the new one is the product under test; phase 5 is a single switch with an importer |
| The managed Python fails to install or is removed | The installer and `doctor` reinstall it with `uv`; measured in phase 6 |

**Unverified, in one place:** the suite on the pinned current Python; that `hc exec` and hc terminals share the same file-access grants; that the installer fetches hc; a sheepdog daemon with voice off; ask → card → tap end to end (it has never run); how Everywhere rules sync across machines; iOS behaviour of the `/factory` page.

### Owner decisions (2026-11-16)

KC accepted all seven recommendations in the table above as written, with one change: the engine runs on a managed, current Python (latest stable, pinned per release) installed with `uv`, not on the system `python3` 3.9.

## 10. dsh-superagent: borrow, adapt, avoid

Read on the owner's request: [10], one commit dated 2026-10-31, MIT, about 30k lines of TypeScript with tests. Its README calls it a research prototype, not a product. I read `README.md`, `SETUP.md`, `docs/000` to `005`, the outline of `006` and `007`, the prompts and `src/core/stage.ts`; nothing was run. It is a different kind of system: it reacts to requests from a team on GitHub and Feishu, one request becoming one ticket, one worker and one pull request. It has no goals, milestones or dependencies.

| Area | What it does (file) | For us |
|---|---|---|
| Principle | "Take as little human attention as possible, and give as much value as possible"; every message, setting and panel element is judged by the attention it costs (`docs/000-philosophy.md`) | **Borrow** as the product test (section 2) |
| Owner interaction | Confirms once, stays quiet while working, writes again only for a result, a decision or a failure; one structured question at a time; a `dropped` report ends work with no message (`docs/000`, `prompts/work.md`) | **Borrow** (sections 2 and 5) |
| Stage | One stage per ticket from an ordered table, first match wins; "person" stages are the only inbox (`docs/003-execution.md`, `src/core/stage.ts`) | **Borrow** (section 4) |
| Reports | Workers report through a structured call with six states; free text is never parsed to learn that a person is needed (`docs/001-domain.md`, rejected concepts) | **Borrow** (section 5) |
| Authority | A Mandate records why work may be done and how far; proactive rules start in `observe`, which only records "would accept" (`docs/001`, `docs/002-authorization.md`) | **Adapt**: a mandate per milestone; `observe` only for work the coordinator proposes itself, not for accepts (section 4) |
| Router | The main session routes and never plans: it passes the original request and a note of at most 30 words (`prompts/orchestrator.md`, `prompts/dispatch.md`) | **Confirms** our brain. Our coordinator still plans, because we have goals to split and it does not |
| Prompts | Built-in parts plus three team sections; an override records its base and an upgrade shows "Default updated"; the policy block is last and rebuilt per request; editing a prompt never changes the gate (`docs/004-prompts.md`) | **Borrow** (section 3) |
| Stop rule | No fixed line or round limit; stop when a change breaks callers or moves module responsibilities (`prompts/team/scope.md`) | **Adapt**: impact is the stop rule, size stays a check (section 5) |
| Merge | Auto-merge only under 200 changed lines with approvals that cover the head commit, withdrawn before each push; the agent never merges as itself (`prompts/team/delivery.md`) | **Adapt**: "evidence covers the head commit" is our note 45. We keep the engine as the one that merges, and no line cap beyond the size check |
| Concurrency and jobs | One extra slot for a person's message; a job's end wakes the worker; background work capped at 30 minutes (`docs/003-execution.md`) | **Borrow** the slot and the cap (section 5). The 5-second move to background is its own harness's feature; we run real CLIs and cannot copy it |
| Recovery | Holds and stages are worked out from stored reports and inputs, so a restart keeps them; transient provider errors retry three times (`docs/003-execution.md`) | **Confirms** "the store is the truth" (section 5) |
| Setup | An agent runs the setup from `SETUP.md`: probe, one question at a time, one plan, no secrets in chat | **Borrow** the manner (section 6) |
| Packaging | A bundle for one harness; needs Node, pnpm, tmux, Python, `gh` and the harness, then a profile patch (`SETUP.md`, `cordis.patch.yml`) | **Avoid**: the opposite of one install |
| Documentation | Numbered docs read in order; a "rejected concepts" table with reasons (`docs/001-domain.md`) | **Borrow** for our public docs in phase 6 |
| Task graph | None | **Nothing to borrow**; section 4 stands on Beads, Missions and our own data |
| Prompt size | `prompts/dispatch.md` is 59 dense lines of "do not" for the router | **Avoid**: it reads like patches over a model doing too much. Keep our brain's job small enough not to need it |

## Sources

1. OpenAI Symphony, SPEC.md (read): https://github.com/openai/symphony/blob/main/SPEC.md
2. Addy Osmani, "Software Factories, Light and Dark" (from the earlier doc): https://addyosmani.com/blog/software-factories/
3. Anthropic, "Harness design for long-running application development", 2026-03-24 (read): https://www.anthropic.com/engineering/harness-design-long-running-apps
4. Beads (*search summary*): https://github.com/steveyegge/beads
5. Factory Missions (*search summary*): https://factory.ai/news/missions-architecture
6. Cursor, "Scaling long-running autonomous coding" (*search summary*): https://cursor.com/blog/scaling-agents
7. Claude Code agent teams (*search summary*): https://code.claude.com/docs/en/agent-teams
8. Simon Willison on StrongDM's software factory (*search summary*): https://simonwillison.net/2026/Feb/7/software-factory/
9. Merge queue batching (*vendor page, search summary*): https://mergify.com/learn/merge-queue/batching
10. dsh-superagent prototype (read from a shallow clone at commit 8c32a9d): https://github.com/deepseek-ai/dsh-superagent-prototype
