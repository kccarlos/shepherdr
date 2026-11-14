# Owner console: new project, protocol, or neither? (2026-11-14)

A design review. Code and docs were read, not run. Web sources are cited by number. *Unverified* means one secondary source, or a path that was not exercised.

This follows [sheepdog-integration-design.md](sheepdog-integration-design.md) and **supersedes these parts of it**: the "separate product: no" row; "Shepherdr push off"; its phase 2 (quiet panes and cards in sheepdog) as a required step; decisions 2 and 6; and "the engine asks the local sheepdog daemon" as the only proof of an answer. Its engine phases stand.

## 1. Verdict

**Do not start a new project now. Do not write a spec first. Build the owner contract as a small, versioned JSON surface inside the engine. Wire it first to the phone surface that is cheapest to reach, which is Shepherdr's own web app. Add sheepdog as a second consumer only if a one-night test with fixed thresholds fails.**

1. **The owner layer is mostly engine work.** Verified asks, typed rules, digests and quota rules live in herdr-task whichever console shows them. None of it waits on a console decision.
2. **The factory already has a phone surface.** Shepherdr's web app runs on the phone with push alerts, answer buttons on some alerts, a board that lists open asks, layered settings, chat to each Assistant and a Notify level, served from one always-on machine for every linked machine (`docs/web.md`, `service/push.ts`, `web/public/sw.js`, `service/board.ts`). My earlier doc dismissed it in one row. The owner's feedback is about sheepdog's voice only, so this is a re-weighing, not proof the owner prefers it. See decision 4.
3. **Neither console can answer an engine ask today.** Shepherdr pushes blocked Assistants, tasks that need the owner and Claude Code hook questions; the ask pane starts with `--no-notify`, and no route answers a `STORE/asks` record (*not found in the code read*). Sheepdog's ask-to-card path fails to parse (`sheepdog-v0.md`). The missing piece is one engine action: answer.
4. **A protocol with one producer and one consumer is an API.** Call it a protocol when a second consumer passes the same fixture.
5. **No existing standard fits.** None covers a cross-project inbox, proof of who answered, or standing rules.
6. **About 5% of sheepdog's Go is console material.** A new project re-ships pairing, push and an App Store app before the owner sees anything new.

On the orchestrator's suggestion: the order of code is right. The spec-first step delivers only a document, and "sheepdog first" is an assumption to test, not a given.

## 2. What the community does

| Thing | Real? | What it gives an owner layer | Use for us |
|---|---|---|---|
| MCP 2026-07-28 [1] | Yes | Human input is now "multi round-trip": the server returns `input_required`, the caller retries with answers. Tasks became an extension and lost `tasks/list` | No inbox, approver identity or rules. Later, a thin adapter so any model can call our actions |
| ACP (Zed) [2][3] | Yes; v2 in progress | One editor, one agent session; `session/request_permission` | Per tool call: the wrong level. Remote transport is still an Active RFD |
| A2A 1.0 [4] | Yes | `INPUT_REQUIRED` and `AUTH_REQUIRED` task states, `ListTasks`, webhook push, a version header | Closest shape, but agent-to-agent. Section 7.6 leaves identity and proof to the implementation |
| AG-UI interrupts [5] | Yes; stability unstated | `{id, reason, message, responseSchema, expiresAt}`, resume by id | The field shape to copy for an ask |
| LangChain Agent Inbox [6] | Idea yes; repo archived 2026-09 | One inbox for many agents: accept, edit, respond, ignore | The inbox idea. Tied to LangGraph |
| Paperclip [7][8] | Yes, ~114k stars, MIT | Board approvals (four fixed types; approve, reject, revise), budgets, many agent adapters, responsive web | An engine, not a console: it would replace herdr-task's gate. No options on approvals, no typed rules |
| Claude Code Remote Control [9] | Yes | Phone sees local sessions; push when action is needed; many sessions in server mode | Per session, Claude only; no cross-project inbox or rules |
| Devin, Jules [10] | Yes | Devin: Knowledge and Playbooks, Slack approve buttons. Jules: `AWAITING_PLAN_APPROVAL` with a timer that auto-approves | "Rules said once" and "ask with expiry and default" are common practice |
| Vibe Kanban, HumanLayer, Crystal, Omnara [11][12] | Mixed | Boards and phone remotes for single sessions | Churn: Vibe Kanban's company closed in April 2026; HumanLayer was bought by Factory in November 2026 (*secondary sources*); Crystal deprecated, Omnara pivoted (*unverified*) |

Also seen: durable waits (Temporal, OpenAI Agents SDK; *search summaries only*), which our store already has because an ask is a file; Gas Town's "Mayor" agent (*search summary only*), which is the babysitter we deleted; and essays that say the human should guard gates and design the line, not review everything [13][14]. Not checked: Factory.ai's manager view, OpenHands, Sweep, Terragon, Codex cloud.

Three facts matter. Everyone converges on one ask shape: id, question, options or schema, expiry, resume by id. Nobody standardises the three things this owner wants: one inbox across engines, proof the owner answered, typed standing rules. And products here change or die within months, so depending on one is a bigger risk than a few hundred lines of our own.

## 3. Sheepdog: module map and extraction cost

Sizes are non-test lines. "Clean" means clean by imports; the web handlers are still methods on `web.Server`. The repo is public and has users.

| Group | Where | Lines | For an owner console | How cleanly |
|---|---|---|---|---|
| Pairing, TLS pin, device auth | `pair`, `identity`, `web/{auth,tlsid,devices,pair}.go` | ~2.1k | Reusable | Clean; `auth.go` needs a small `voice/wsproto` helper. `web/tsnet.go` pulls in `onboard`, and with it brain and voice |
| Push and relay | `push`, `relay/` | 1.7k + 0.5k | Reusable | Clean. The relay serves one bundle id |
| Install, update, service | `service`, `update` | 1.4k | Reusable | Clean |
| Event log, SSE, idempotency | `eventlog`, `web/{sse,idempotency}.go` | 1.6k | Reusable | Clean |
| Setup and doctor | `onboard`, `config` | 5.2k | Partly | Tangled with model and voice key checks |
| The approval rail | `supervisor/inputs.go` | 0.7k | The idea, not the code | Tied to a pane and `ParsePrompt`; an ask record with no screen needs a new path |
| Voice I/O | `voice` | 13.9k | Not needed | — |
| Per-agent babysitting | `supervisor`, `brain`, `herdr`, `hc`, `herdrcore`, `workerlog`, `attention`, `state`, most of `web` | ~55k | No | — |
| Measurement | `eval`, `bench`, `scorecard`, `northstar`, `audioe2e` | ~25k | No | — |

About 7k of roughly 129k Go lines are console material. In the iPhone app (53k Swift), by file name, computers, pairing and links are about 8k and approvals, push and actions about 4k (*rough count*).

Go's `internal/` rule means another repo cannot import these packages. So reuse is one of: promote them to a public API kept stable forever; copy them and let two copies of security code drift; or add a mode or binary in the same module, which costs no extraction (*unverified: a daemon with voice and brain both off*). A new iPhone app adds a bundle id, App Store review, a relay change and a second Xcode Cloud workflow.

What sheepdog has that the web does not: APNs alerts that break through Focus, Approve and Decline on the notification (after the passcode), and a Secure Enclave key per computer that already signs logins and *could* sign an answer. That last one is a possibility, not a feature.

## 4. Options

Sizes: S is under about 300 lines, M about 500 to 1,000, L more.

| Option | First useful result | Upkeep | Fit (rules, away from screen, phone) | Lock-in | Risk |
|---|---|---|---|---|---|
| **A. sheepdog gains a factory mode** | M: quiet rule, a card path for ask records, one daemon per machine | Factory code inside a per-agent product | Native push and notification buttons | Low | The ask-to-card path has never run |
| **B. New lean console from extracted packages** | L, then A's work on top | A third product, a second app | Same as A when done | Low | Plumbing first, value last |
| **C. Adopt Paperclip or a standard** | L: a migration that drops the gate | Someone else's roadmap | Poor: no typed rules | High | Churn; replaces what the owner likes |
| **D. Shepherdr's phone web, engine-owned contract** | S: ask records in the alert list plus one answer route | New code in the fork's `service/` and `web/` | Already cross-machine through one host. Web Push needs the Home Screen app; answer buttons depend on the browser (*unverified on iOS*) | Medium: the UI is Shepherdr's | Web push may be late or silent |
| **E. D first; A as a second consumer if the test fails** | Same as D | D's, plus A's M only if earned | Best of both, paid for when needed | Low | Two channels unless the label rule is kept |

**Recommendation: E.** The contract makes the console replaceable, which is the real goal behind "design around a protocol". B stays possible and gets cheaper once the contract and fixture exist.

## 5. The contract, first sketch

**Base: our own small JSON contract, not MCP, ACP or A2A.** The repo already works this way: `contracts/board-data.md` and `gate-evidence.md` each have a validator that every producer's tests run. Add `contracts/owner.md`.

**Who calls whom.** The console calls the engine. The engine never calls a console and never needs one: an unanswered ask waits in the store. Events are hints; resources are the truth.

**Bindings.** v1 is `herdr-task owner … --json` and the store files the Shepherdr service already reads. For a remote consumer later: the same shapes over HTTP with an SSE stream, using sheepdog's conventions (`protocol` and `min_protocol`, `?since=<id>`, `Idempotency-Key`).

| Resource | Shape (v1) |
|---|---|
| `hello` | `{protocol, min_protocol, engine, machine, ask_kinds[], rule_types[]}` |
| `projects` | `[{id, name, machine, status: working\|waiting\|idle\|stopped, open_asks, goal, spent, pools}]` |
| `asks` | `[{id, project, kind, question, options[], recommend, task, at, expires_at, on_expiry, gated, answer, answered_by}]` |
| `digest` | Per project, built in code: `{merged[], waiting[], spent, pools, since}` |
| `rules` | `[{id, scope: everywhere\|machine\|project, class: typed\|text, type, value, expires_at, saved_by_ask}]` |
| `events` | `ask.opened`, `ask.answered`, `ask.expired`, `project.status`, `digest.ready`, `rule.saved`, `alert`, each with a rising id |

| Action | Rule |
|---|---|
| `answer(ask, option, proof)` | Idempotent; 409 if closed. The engine, not the console, runs what the answer unlocks |
| `say(project, text)` | Delivers the owner's words unchanged to that coordinator |
| `propose_rule(scope, value or text)` | Returns an ask of kind `rule` with the read-back; saved only when that ask is answered |
| `revoke_rule(id)` | Immediate; logged |

**Ask kinds:** `decision`, `gate`, `release`, `paid-key`, `delete`, `install`, `reset`, `rule`. A console shows a kind it does not know as a plain question with options, and does not offer an answer if the ask is gated.

**Proof of the owner's answer.** Gated asks need it; `decision` asks do not.

| Level | Proof | Limits |
|---|---|---|
| 1, now | The console attests that the tailnet owner's login made the request (`service/auth.ts`). The local token does not count | At the Mac, the owner answers gated asks through the tailnet link too. With the host on another machine, the answer crosses the hc link as a write: a trust step, *unverified* |
| 2, only with sheepdog | The phone signs `{ask, option, nonce}`; the engine checks the signature | Needs new app and engine code |

Neither stops an agent running as the same user from editing the engine's files. VMs do that. A typed "the owner approved" stays refused.

**Rules: two classes, named in every read-back.**
- **Typed, enforced in code:** `merge_policy`, `review_rounds`, `quota_order`, `project_priority`, `designs_wait`, `notify`, `delegation {kinds, until}`. Releases, paid keys and resets cannot be delegated.
- **Text:** given to the coordinator at every start. Remembered, but only a model follows it.

**Versioning.** One integer. Fields are only added within a version. Consumers ignore unknown fields; producers' validators reject them in tests.

## 6. Plan

| # | Step | Size | Exit test (owner-visible) |
|---|---|---|---|
| 0 | **Baseline night, no code.** Two projects. The owner carries only Shepherdr's phone web, Notify on "Needs me". The sheepdog daemon on the factory machine is stopped for the night | 1 night | Thresholds set before the night: every alert reaches the locked phone within 2 minutes; none is missed. The result is a list of what arrived, how late, and what the owner had to open |
| 1 | `owner` contract v1 in the engine: projects, asks with kinds, `answer`; `contracts/owner.md` and a validator. Ask records join Shepherdr's alert list, with one answer route. The earlier board freeze is lifted for these two things only | Python S, TS S | On the phone, one list shows asks from both projects by name; an ask is answered in at most 3 taps without opening a space |
| 2 | Proof level 1 and typed rules: gated actions run in the engine after a confirmed answer; delegations with expiry; `propose_rule` | Python M | A release and a key grant complete from the phone. A typed "owner approved" and an agent's keys into an ask are refused in tests. A rule said once holds for a week |
| 3 | Digest and quota: one code-built digest for all projects; `usage.pick` at task start; one priority rule | Python S | The morning digest replaces opening any space; a two-project night needs no routing messages |
| 4 | **Only if step 0 or step 1 misses its thresholds.** Sheepdog reads the same contract as a factory source with voice and brain off; cards reuse today's question cards | Go M, Swift S | An ask is answered from the notification; sheepdog passes the same fixture. A signed answer is a later step |
| 5 | **Only on a trigger:** a second engine exists, or sheepdog's per-agent code has blocked a factory change twice. A second binary in sheepdog's module first; a new repo last | — | — |

## 7. Decisions for the owner

| # | Decision | Recommendation | Why |
|---|---|---|---|
| 1 | Start a new owner-console project now? | No. Use step 5's triggers | About 5% of sheepdog is reusable; the rest is plumbing with no new value |
| 2 | Base the contract on MCP, ACP or A2A? | No. A small JSON contract with a validator, as `contracts/` already does | No standard has an inbox, owner proof or rules; all three changed this year |
| 3 | Spec first? | No. Code first with a fixture; a protocol after two consumers | One producer and one consumer is an API |
| 4 | Which phone surface first? Tell us which one you open today: sheepdog's app, Shepherdr's web, or neither | Shepherdr's web, tested by step 0. If you already rely on sheepdog's app and its alerts, swap steps 1 and 4 | It reaches every machine through one host and needs the least code. This is a judgement, not a measurement |
| 5 | Sheepdog's role | Unchanged for hand-run agents. For factories: a second consumer if the thresholds fail. No new voice work | Its strengths are native alerts and a device key, not narration |
| 6 | Proof of the owner's answer | Level 1 now; level 2 only with step 4 | Level 1 needs no app code |

## 8. Risks

| Risk | Containment |
|---|---|
| Web Push is late or silent on the phone | Steps 0 and 1 measure it against thresholds; step 4 is ready |
| Console code in the fork drifts from upstream | The contract is engine-side Python; the web change is one alert source and one route |
| The contract fits only herdr-task | Accepted: one version integer and about ten shapes. Change it when a second engine appears |
| A same-user agent forges an answer | Level 1 refuses the local token for gated asks; every answer is logged with its proof; workers move into VMs |
| Two channels race, or text rules are taken for rails | The label rule (sheepdog handles factory asks only after step 4); the rule class is in every record and read-back |

## Sources

1. MCP 2026-07-28 changelog: https://modelcontextprotocol.io/specification/2026-07-28/changelog
2. ACP v2 overview: https://agentclientprotocol.com/protocol/v2/overview
3. ACP remote transport RFD: https://agentclientprotocol.com/rfds/streamable-http-websocket-transport
4. A2A 1.0: https://a2a-protocol.org/latest/specification/
5. AG-UI interrupts: https://docs.ag-ui.com/concepts/interrupts
6. Agent Inbox: https://github.com/langchain-ai/agent-inbox
7. Paperclip: https://github.com/paperclipai/paperclip
8. Paperclip approvals API: https://docs.paperclip.ing/reference/api/approvals/
9. Claude Code Remote Control: https://code.claude.com/docs/en/remote-control
10. Jules: https://developers.google.com/jules/api/reference/rest/v1alpha/sessions/approvePlan ; Devin: https://docs.devin.ai/release-notes/overview (*search summaries*)
11. Vibe Kanban shutdown: https://vibekanban.com/blog/shutdown (*search summary*)
12. Factory and HumanLayer: https://runtimewire.com/article/factory-acquires-humanlayer-multiplayer-coding-agents (*search summary*)
13. Addy Osmani, "Software Factories, Light and Dark": https://addyosmani.com/blog/software-factories/
14. 12-factor agents, factor 7: https://github.com/humanlayer/12-factor-agents
