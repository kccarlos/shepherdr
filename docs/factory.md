# The software factory (kc-factory fork)

The person says what they want once. The factory turns that into merged, verified work. The person is asked only about real product decisions and about actions they chose to approve. This fork tries the idea on Shepherdr. Once it is stable and proven, the design moves into sheepdog as a new agent.

## Roles

| Role | Who | Does |
|---|---|---|
| Person | the owner | Sets goals by voice (sheepdog) or on the web board. Answers decisions. Approves the actions listed under "Asks first". |
| Orchestrator | a Claude session outside Shepherdr | Speaks for the person while they are away. Accepts tasks under the merge rule. Reports to the person through sheepdog and asks there. |
| Assistant | Opus, Shepherdr's coordinator | Splits a goal into tasks, each with a brief and acceptance checks. Picks each task's CLI and model (templates/assistant.md). Watches news and gets workers unstuck. |
| Implementer | Claude Sonnet/Opus, agy, Codex | Works in its own worktree. Reports status, commits and leaves proof. |
| Reviewer | a different model from the implementer | Read-only. Reports findings with levels, each backed by a run. |
| Gate verifier | an independent agent before merge | Runs the real thing (tests, end-to-end, the app). Confirms the proof matches the claim. |

## Rules every role carries

From the owner's lessons (their wiki's `lessons/agent-delivery.md`, Ponytail's smallest complete change and pstack's laziness protocol). Put them in every brief:

- **Smallest complete change.** First ask whether the code needs to exist, then reuse what is there. No new option, abstraction or "for later" code. Removing beats adding.
- **Findings need a run.** A failing test or a reproduced state. A theoretical risk is not a finding.
- **Skip nitpicks.** Style and "could be cleaner" are not findings. A reviewer's proposed fix gets the same restraint as the code.
- **Fix the root cause once,** in the shared code, not with a guard at every caller.
- **Never weaken** validation at trust boundaries, data-loss handling, security or accessibility.
- **Test the real thing,** not a fixture you invented. A skipped check is reported, never hidden.
- **Two failed fixes on the same idea** means the idea is wrong: stop and say so.

## Merge rule

A task merges without asking the person when all of these hold:
- At least 2 review rounds, and the last round finds nothing at Must fix (major) or above.
- The project's checks pass, and CI is green where the repo has CI.
- The gate verifier confirms the proof.

Anything else stops at Ready, and the orchestrator decides or asks.

## Asks first

Nothing is banned outright. These go to the person through sheepdog, and the factory acts once they agree: deleting data or branches others use, force-push, secrets, PRs or issues on other people's repos, spending money (paid APIs), account changes.

Release tags and merges in the person's own repos need no question.

## Usage-aware

The factory knows every quota before it hands out work. `codexbar usage --provider <claude|codex|antigravity> --json` gives each quota's 5-hour window and weekly budget, with reset times. Antigravity reports Gemini and Claude/GPT models separately.

- **Spend what expires first.** Among the CLIs and models that fit a task, pick the one whose budget resets soonest while it still has room. A budget that resets tomorrow is lost if unused; one that resets in five days can wait.
- **Fit the task to the budget left:** a long job never starts on a 5-hour window that is nearly gone.
- **Check between batches,** and about every 10 minutes while work runs. Never only at the end.
- **Running low** (about 5% of a 5-hour window, or the weekly floor of 1%): start no new work on that quota. Workers finish their current step and write a handoff (what's done, what's next, how to resume) into their task. Then the factory sleeps until the printed reset, in sleeps of 10 minutes or less, and resumes from the handoffs. Other quotas keep working meanwhile.

## Permissions

When the person says so, the factory itself edits Claude Code's settings.json (project level first, global when asked) so workers stop on fewer prompts. It keeps a backup and logs each change.

## Scope

One main project per factory. Work in another repo (a wiki lesson, a blog post) becomes a separate task in that repo, under the same rules.

## Board

A production-ready web board, easy to use and good-looking: send a request, watch progress, see the tree of agents (Assistant → workers → reviewers). It starts from Shepherdr's web app and fixes what the trial shows. It moves to the sheepdog iPhone app once proven.

## Status

- Done: agy as a worker (adapter, resume, worktree trust). The Assistant picks CLI and model per task. Installed without the window and without global hooks.
- Next: layer-3 fixes from the trial (hooks survive updates, Claude's invisible trust question, agy audit, agy and routing docs). Then usage-aware routing, the merge rule and the gate verifier. Then self-service permissions. Then the board.
