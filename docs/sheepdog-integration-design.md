# Sheepdog and the factory: integration design (2026-11-14)

A design review of both codebases, the 49 field notes and [sheepdog-port.md](sheepdog-port.md). Code was read, not run. Claims marked *unverified* were not exercised.

Three things have been called "orchestrator". Here the **brain** is sheepdog's `internal/brain`, the **coordinator** is the per-project Assistant, and the **babysitter** is the outside Opus session that watched the factory for two days.

## 1. Verdict

**Keep the engine in Python, as a program sheepdog controls through a narrow contract. Do not port it to Go. Delete the babysitter; do not move it into sheepdog. For factory work, sheepdog is a direction-and-rules channel, not a narrator of agents.**

| Option | Tick and store owned by | Upstream merges | Verdict |
|---|---|---|---|
| Python under sheepdog's control | herdr-task; sheepdog reads `--json` and answers asks | the fork | **Yes** |
| Port to Go | sheepdog daemon | none; the fork ends | No |
| Separate product | herdr-task with Shepherdr's own voice, push and board | the fork | No: two owner channels |

Why not port:
- The rules are still being found: notes 37–49 came after the earlier plan was written.
- The engine has about 15k lines of Python tests. A port throws them away.
- Upstream still pays for most of it. The fork's own layer is +4.4k/−0.4k on about 14k upstream lines: 9 new files (2.2k) and edits to 20 upstream files (2.3k). Only the edits conflict.
- sheepdog is already about 129k lines of Go and 53k of Swift. The brain is capped at 6 steps and 25 s and is not Opus. It cannot judge factory work.

The real divergence is `git diff upstream/main kc-factory`: 145 files, +15.4k. That is `herdr_task` +4.4k, tests +6.2k, `service/` +1.1k (board data), docs +1.4k, all other mods 61 lines. The 561-file figure is inflated: FAC-67 was a squash merge, so git still counts 122 upstream commits as unmerged and each sync conflicts again.

| Where | Owns |
|---|---|
| sheepdog daemon | Asks, alerts and digests as cards, push and speech; the approval rail; passing the owner's goals and rules on |
| iPhone app | The cards it has today. No task board |
| herdr-core | Terminals, labels, events, machines. Unchanged |
| Coordinator (Opus) | Planning, splitting, recap decisions, answering workers inside the worktree |
| Engine (herdr-task) | Store, gate, budgets, leases, watchdog, model choice, standing rules, and every owner-gated action |

**Stop maintaining:** the fork's board work in `service/` (frozen); Shepherdr's push and voice for factory spaces after phase 2; the copied `NEGATIVE` word list in `ask.py` once sheepdog answers asks. **Make the next upstream sync a real merge commit.**

### Positioning: one layer above all factory spaces

Yes: sheepdog's value for factory work is that the owner never opens a factory space. But the value is the shared inbox and routing, which are mostly code. It is not a chief coordinator.

| Cross-project job | Who | Why not a coordinator |
|---|---|---|
| One inbox of asks and gates, labelled by project | Code (sheepdog, the phone) | A coordinator sees only its own space |
| One digest across projects | Code | Same |
| Quota and priority between projects | Engine: typed rules in the Everywhere layer, read by `usage.pick` and the start limits | The pools are per account; no coordinator sees the others' demand |
| Sending the owner's words to the right coordinator | Brain | This is what it does today for agents: one or two steps |
| Rules that apply everywhere | Engine's Everywhere layer; sheepdog reads them back | — |

The brain's part is small: work out which project the owner means, pass the words on unchanged, answer "what needs me?" from the code-built inbox, and read a new rule and its scope back. The 6-step cap and the model are no problem for that, because none of it is judgement. It must not rank projects, accept, judge gates, rewrite goals or poll. A trade-off between projects is the owner's: it is said once as a rule, or it arrives as an ask. An Opus layer above the coordinators would be the babysitter again.

One limit: with a daemon per machine, the single layer is the phone, not one brain. Each brain routes only to its own machine's coordinators (the app's "Talk to" picks the computer). *Unverified: whether Everywhere settings sync across machines.*

## 2. Where the babysitter's duties go

| Duty | Notes | Goes to | State |
|---|---|---|---|
| Granting rounds, dead reviewers, simulators, size and CI loops, reviewed-commit check, designs waiting for the owner, cleanup | 15, 16, 20–28, 32, 41–49 | Engine | Done (FAC-63, 72, 80–95); automatic fallback reviewer still open |
| Stuck coordinator, blank starts, stalled disk | 37–40 | Watchdog, no model | Done (FAC-78, 83, 86, 87) |
| Model and quota choice | 19, 43 | Engine | **Open.** `usage.pick` has no caller; `settings.worker_pick` reads fixed settings |
| Installing factory merges | guide | Engine, behind an ask | Open |
| Answering workers' cards, re-running CI once, nudging | 16, 28, 37 | Coordinator | Done; Autopilot must be on (30) |
| Exporting claude.ai docs for other workers | 4, 35 | Coordinator | Done by rule |
| Relaying goals and decisions | 6, 12 | sheepdog → engine | Open (section 3) |
| Owner gates, releases, paid keys, deletes | 12, 18, 31, 47 | sheepdog rail → engine | **Open (section 3)** |
| Apple sign-in, agreements, consent prompts | 7, 29, 36, 40 | Owner at the Mac, before leaving | Done as a checklist |

Nothing here needs a second model, as factory.md 12b decided.

## 3. The owner's channel

The owner's touchpoints are goals, asks, gates, releases, quota and digests. Per-agent updates are not among them.

**Quiet by default.** In a factory space, a code rule keyed on the `herdr.task` label stops all speech and push for workers and reviewers. Only asks and alerts get through.

**The approval problem.** Coordinators refused approvals relayed as chat text (note 12), rightly. Text relayed through sheepdog would be no better, and the engine is weak here today:
- `accept --owner-approved "<note>"` stores free text with `by: "Assistant"` (`cmd_accept`).
- `accepted_by` is `person` for any caller that is not a coordinator, workers included, and any value lifts FAC-94's wait (`tick.py`, `not t.get("accepted_by")`).
- The ask pane cannot tell the owner's keys from an agent's `hc keys`.

**The design:**
1. **Every owner decision is an ask record** (`asks/<id>.json`) with a kind: `decision`, `gate`, `release`, `paid-key`, `delete`, `install`, `reset`.
2. **sheepdog answers through the rail.** The ask pane already prints the `❯` marker the prompt parser needs. A tap or the owner's recorded words pass `AnswerTap`'s checks, and sheepdog logs which recorded input answered which ask. *Unverified: ask → card → tap has never run end to end.*
3. **The engine runs the gated action, and checks first.** For every kind except `decision`, it asks the local sheepdog daemon whether the owner answered that ask. A record alone is not enough, because any agent can write it. With no confirmation the action is refused. `accept --ask <id>` replaces `--owner-approved`; `HERDR_TASK_BY` stays for `--on` but stops counting as evidence.

**Standing rules: said once, kept in code.** The engine already has layered settings (Everywhere, machine, space) that reach a coordinator at every start, compaction and handoff (`assistant_settings.py`). Rules go there, in two classes:
- **Typed rules, enforced in code:** merge policy, review rounds, quota order, delegations ("pass M0 and M1 until 08:00"), "designs wait for me". The engine checks them; no prompt is involved.
- **Free-text rules:** delivered to the coordinator every session. They are remembered, but only a model follows them. The doc must say which class a rule is in.

A new rule is itself an ask: sheepdog reads it back ("New rule for this project: …. Save?") and a tap saves it. Releases, paid keys and Claude resets cannot be delegated.

**Secrets.** `herdr-secret` does not use the ask pane. Its ask is a label (`herdr.secret.ask.<NAME>`) and a masked box in the desktop chat, and a stored secret in scope needs no approval at all. So:
- A `paid-key` ask widens a stored secret's scope to one space. The engine does it; no value moves.
- A new value is typed at the Mac. sheepdog only alerts that one is wanted.

**Digests.** One code-built summary per project, with no model: merged, waiting, spent, pools left. It is sent at a milestone, in the morning, or on request.

## 4. Machines

One Mac is the smallest setup. Machines are added by role.

- **Today a project lives on one machine.** The store is per machine (`base.STORE`), and `herdr-task --on <machine>` runs "on the machine that holds the folder" (`cli.remote`). One project's tasks do not span machines. Keep that.
- **Linux VMs take non-Apple projects.** They have no macOS consent prompts (notes 39, 40), and a VM is a real sandbox for `perm: full` workers (note 13).
- **Macs take Apple projects.** Each Mac has its own simulator pool; `simulators.py` is already local.
- **One sheepdog daemon per machine.** The iPhone app already pairs with several computers and keeps approvals per computer (`ios/docs/dev/architecture.md`, "Several computers"). The engine then confirms an answer over loopback. The other route, remote terminals in one daemon, is rated L in sheepdog's backlog (#24) and sheepdog drops them today (`isLocal`).
- **Quota is per account.** Every machine must read the same pools. `usage.pick` sorts by a weekly reset, which agy's rolling window does not have.
- **Secrets already span machines**: one vault on the main machine, served over hc's link.

## 5. Plan

| # | What | Size | Exit test |
|---|---|---|---|
| 1 | Quota in code: call `usage.pick` at task start, handle the rolling pool, switch a running task only at 0%; one typed priority rule between projects | S, Python ~200 | A night with two projects and no routing messages |
| 2 | Quiet factory panes by label; asks and `herdr.alert` reach the phone, named by project; then Shepherdr push off | S, Go ~300 | With two projects running, an ask from each and an alert reach the locked phone once, each naming its project; a tap answers; workers make no sound; "tell <project> …" reaches the right coordinator |
| 3 | Owner-proof approvals and typed rules: ask kinds, sheepdog's confirmation, engine-run actions, delegations with expiry | M, Python ~500, Go ~200 | Away from the Mac, a release, an out-of-rounds accept and a key grant complete by phone. In tests, a typed "the owner approved" and an agent's `hc keys` into an ask are both refused |
| 4 | Digest, one for all projects | S | A morning digest replaces opening any factory space |
| 5 | A second machine: a Linux VM with its own engine and daemon | M, mostly setup | A project runs there; its ask reaches the same phone |

**Voice in is not its own phase.** The owner gives a goal once. sheepdog can already send words to an agent pane, and the coordinator is one (*unverified for coordinators*; phase 2 tests it). Build nothing more until the owner asks.

**Do not build:** a Go port; a factory role for the brain; per-worker narration; an iOS task board; secret entry on the phone; tasks of one project on several machines; VM provisioning.

**On the earlier plan.** Integrate-first holds. Four things do not:
- Its phase 0 exit test was zero interventions. Notes 37–49 are that night; it failed.
- Its phase 4 trigger ("2 weeks with no gate changes") has no date. Drop the port.
- It missed that the owner's approval can be forged.
- It made voice-in and a phone board key phases. The owner wants neither first.

## 6. Decisions for the owner

| # | Decision | Recommendation | Why |
|---|---|---|---|
| 1 | Port the engine to Go? (was e) | No. Drop phase 4 | Moving target, 15k lines of tests, upstream maintains most of it |
| 2 | sheepdog's role for factory work, and the name (was a, b) | The one layer above all factory spaces: inbox, digest, rules, routing; workers silent; the brain routes and never judges. "Coordinator"; "orchestrator" stays the brain | The owner steers direction, does not want narration, and should not open each space |
| 3 | Merge on checks with unsandboxed workers? (was c) | Yes for PR repos with CI; never releases, designs or installs | FAC-94 holds; Linux VMs become the sandbox |
| 4 | Phone task board? (was d) | No. Digest first | Unproven need |
| 5 | Confirmed asks and typed rules in the engine? | Yes, phase 3 | Approvals leave the Mac without weakening; rules are said once |
| 6 | Several machines | A project per machine, a daemon per machine | The phone already supports it; no cross-machine code |

## 7. Risks

| Risk | Containment |
|---|---|
| A same-user agent calls sheepdog's loopback API to forge an answer | This stops shortcuts, not attackers. Every answer is logged with its input; workers move into VMs |
| Two approval regimes race on one worker prompt | The label rule: in factory spaces sheepdog handles only asks and alerts |
| The contract drifts | A fixture test in sheepdog over `contracts/` and `list --json`; unknown ask kinds are refused |
| sheepdog is down | Gated actions wait; asks live in the store (note 31); the watchdog alerts through `herdr.alert` |
| Free-text rules are taken for rails | Two classes, named in the doc and in the read-back |
| Upstream drift | Real merges; fork changes stay in `mods/tasks` and tests |
| Many daemons to update and pair | Sheepdog's one-action update; *unverified: a daemon with voice off* |
| Phase 2 rests on an untested path | It is that phase's exit test; nothing later starts first |
