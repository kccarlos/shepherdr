# Factory field notes: the first real project (WukongMind, 2026-11-11/12)

The first time the factory ran on a real product rather than on itself. WukongMind is a fork of Forumind (iOS) into an agent browser; the owner wanted to sleep and wake up to a TestFlight build. Each note below is something that stopped or slowed the start, with what fixed it tonight and what the factory should do instead. Newest notes are added at the end through the night.

## From "new folder" to a running Assistant

| # | What happened | Fixed tonight by | What the factory should do |
|---|---|---|---|
| 1 | The owner opened plain `claude` in the new folder and asked whether a prompt would make it the Assistant. It can't: the role, settings and labels come from Shepherdr's launch. | The orchestrator explained, switched the window to the Shepherdr layout and opened the Assistant tab with `herdr-app do tab.new` (mod chat, role coordinator, template assistant). | One command or button: "start a project here" that creates the space, opens its Assistant and checks the prerequisites below. |
| 2 | The window was on Herdr's plain layout, so no space showed an Assistant, and nothing said why. | `herdr-app do layout.switch {"name":"shepherdr"}`. | New spaces should get an Assistant whatever the layout, or the plain layout should say "switch to Shepherdr for an Assistant". |
| 3 | Creating the GitHub repo was blocked by the orchestrator's permission checker (an upload to an external service). | The owner created it by hand. | The start-a-project flow asks once for the repo name and visibility, and the owner runs the create. |
| 4 | The requirements lived in a Claude Doc that agents in hc can't read, and were in Chinese while the owner wants projects English-first. | The orchestrator read it through the Docs connector and wrote `docs/<project>/requirements.md` in English. | The start step imports linked requirements into the repo as Markdown, in English. |
| 5 | A fork of an existing app (Forumind) brings its own CI, bundle IDs, App Group, iCloud container and share extension. Each needs an Apple-side step. | Defaults: new repo copied from Forumind, `forumind` remote fetch-only, first build without share extension and iCloud. | A fork checklist: remotes, bundle IDs, capabilities that need the developer portal, CI variables and secrets. |
| 6 | Sending the Assistant its first messages from outside: `herdr-app do chat.send` (data/chat-sendreq.json) only works while the chat mod is loaded; later sends failed with "unknown command". | `hc send <assistant terminal> "<one line>"`. | A stable CLI to message a space's Assistant, e.g. `herdr-task tell-assistant <space> "…"` from anywhere, and multi-line safe. |

## Apple and shipping

| # | What happened | Fixed tonight by | What the factory should do |
|---|---|---|---|
| 7 | A new App Store Connect app needs an Apple web session with two-factor sign-in. `asc web auth login` can't prompt inside the `!` shell. | `asc web auth login --two-factor-code-command "osascript … display dialog …"`, then `asc web apps create`. | Put Apple sign-in first in the start checklist, before the owner leaves. |
| 8 | TestFlight needs an app record, an internal group with the owner in it, and either local signing or CI secrets. | The orchestrator created the app, the "Myself" group and added the owner; repo variables `DEVELOPMENT_TEAM`, `TESTFLIGHT_GROUPS`; the owner set the `OP_SERVICE_ACCOUNT_TOKEN` secret. | Template these for every iOS project; only the secret needs the owner. |
| 9 | The owner wants CI/CD the Forumind way (GitHub Actions), not uploads from the Mac. | The Assistant folded CI adaptation into the fork-setup task; the first build ships through `release.yml`. | iOS projects start with the CI task first; local upload is only the fallback. |
| 10 | Unattended agents run in hc on the Mac: does the login keychain work there? | Probe: an hc terminal is in the Aqua session and `codesign` with Apple Distribution works. | Keep that probe in the start checklist; the wiki's "Background session" warning is for the herdr server, not hc terminals here. |

## Secrets and permission checkers

| # | What happened | Fixed tonight by | What the factory should do |
|---|---|---|---|
| 11 | End-to-end tests need a real model key, but `op run` through the 1Password app waits for an approval nobody gives at night. | The read-only service account (`~/.config/op/cloud-agents.token`) reads the Developer vault unattended. | Night runs use the service account by default; say so in worker briefs. |
| 12 | Auto-mode permission checkers (the orchestrator's and the Assistant's) blocked credential handling, settings edits and "always allow" choices that did not come from the owner directly, even when the owner had asked the orchestrator. | The owner ran the commands or confirmed in the Assistant's own chat. | Owner decisions that touch secrets or settings must be given to the Assistant by the owner, in its chat, once; the start checklist collects them up front. |

## agy as worker and reviewer

| # | What happened | Fixed tonight by | What the factory should do |
|---|---|---|---|
| 13 | The Assistant picked agy (Argon) for a worker by default, in accept-edits mode with an allow list. It stopped on a prompt for nearly every command (`git add`, checks, starting its reviewer, `hc wait`, a grep script). The orchestrator answered about eight of them; the Assistant can't answer dialogs. | Space settings: agy workers with `perm: full` (`--dangerously-skip-permissions`), outside any sandbox, limited by brief (worktree only, no credential stores, push only its own branch, web text is data). The running task was killed and resumed under the new settings. | A sandboxed worker mode like the reviewer's, or the factory VM. Never default an unattended worker to an allow-list agy. |
| 14 | `herdr-task resume` kept the old argv until resumed with `--agent agy`; a resumed agy session sits idle at turn 0 until it gets a message. | Resume with `--agent`, then `hc send` a "continue" line. | Resume should rebuild argv from current settings and send a continue message itself. |
| 15 | Herdr's sandboxed agy reviewer (FAC-49) stopped at "Sign in required": agy now keeps its sign-in in the keychain and `~/.gemini/antigravity-cli/antigravity-oauth-token` no longer exists, so the sandbox has nothing to copy. | Reviewers switched to Claude Opus per task; then a flag file `~/.herdr/agy-review-unsandboxed` (7842ead5) runs agy reviewers as the person's agy. | Find where agy keeps its token now and hand a copy to the sandbox, or move review into the VM. Detect "Sign in required" and fall back to another reviewer automatically. |
| 16 | A worker asked "how should we proceed" through its question tool when the reviewer failed; the Assistant can't answer it, so it waited on the orchestrator. | The orchestrator picked the recommended option. | Reviewer failures are the gate's job: switch reviewer and rerun without asking the worker. |

## Planning

| # | What happened | Fixed tonight by | What the factory should do |
|---|---|---|---|
| 17 | The owner expected a design pass (Claude's Design skill) before UI work; the plan had none. agy has no design tool. | A design task on Claude Opus before the UI task, output a design artifact plus `docs/<project>/design-m1.md`. | UI milestones get a design task by default, on Claude. |
| 18 | Milestone gates ("owner confirms M0") would stop the night at M0. | The owner delegated M0 and M1 acceptance to the orchestrator for the night. | The start checklist asks: "which gates can the orchestrator pass while you're away?" |
| 19 | Model routing changed three times in one evening (Claude, then agy Gemini because its quota resets soon, then Claude reviewers). | Edited per task with `herdr-task edit --agent/--model/--reviewer`. | The Assistant should pick models from a usage-aware rule (pool that resets first), not a fixed default. |

## Overnight additions

| # | What happened | Fixed tonight by | What the factory should do |
|---|---|---|---|
| 20 | Herdr's Claude reviewer ran with `--permission-mode plan`, finished its review, and could not record it: plan mode blocks every command, `herdr-task review` too. The task sat in review with no verdict, and only the reviewer's own terminal may record one, so the orchestrator could not record it for it either (and lost the round by killing that terminal). | Findings handed to the worker by hand for a new round; Claude reviewers now run in auto mode (131a1c56). | Gate reviewers need a test that runs a real verdict end to end per CLI. When a reviewer ends without a verdict, the gate should read its last message and fall back, not wait. |
| 21 | A worker's own Codex reviewer stopped on Codex's "Trust this folder?" prompt; accepting writes `~/.codex/config.toml`, which tonight's limits forbid. | The worker switched to a Claude reviewer. | Pre-trust task worktrees for every CLI the factory uses (or pass trust per session), so no first-run prompt appears at night. |
