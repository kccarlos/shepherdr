# Sheepdog v0 on the herdr-core backend

What [factory.md section 3](factory.md) asks of sheepdog in v0, checked against sheepdog's code. Sources: sheepdog
`~/Documents/herdr-sheepdog` at `cf9c7337`, paths under `internal/`. The ask pane is FAC-9's
`mods/tasks/bin/herdr_task/ask.py` at `c132c0b2` (branch `task/9-herdr-task-ask-and-the-ask-pane`, not yet merged
into kc-factory).

## Verdict

- The Assistant pane works with no sheepdog code.
- The ask pane, as FAC-9 wrote it, does **not** become a card, and a tap would not answer it.
- Both ask pane fixes go in `ask.py`, so "no sheepdog code" can still hold for asks. One limit remains: the option
  under the cursor can't be tapped if it starts with a word like "No" or "Wait".
- Muting the workers needs a sheepdog change.

## How sheepdog sees an hc terminal

- Only live terminals on this machine count. An address with a slash (another machine) is ignored
  (herdrcore/mapping.go:29-32, herdrcore/events.go:21).
- A terminal counts as an agent when it has a status, or runs a known agent program (herdrcore/mapping.go:76-78).
- An OSC 7501 report maps to herdr's states: idle, working, done, blocked (herdrcore/mapping.go:100-112).
- New agents come from one unfiltered `events.subscribe` (herdrcore/fleet.go:18). A terminal running something other
  than a known agent program is picked up on its first reported status (fleet.go:73-84, 99-126). The watcher then
  reads a snapshot to get its state (herdr/watcher.go:329-342).
- The status's `kind` and `msg` are decoded (hc/types.go:35-42) but never read: `grep -rn 'Status\.\(Kind\|Msg\)'
  internal cmd` finds no use outside tests. `blocked, kind=question` is just "blocked" to sheepdog.

## The ask pane in sheepdog today

- FAC-9's pane starts with `hc run --bg` and the labels `herdr.role=ask` and `herdr.ask=<id>`, but no `herdr.space`
  (ask.py:70-73). It prints the question, the options as `  1. <option>` (no cursor marker), then
  `Answer with a number…` and `> `. It reports `state=blocked:kind=question:msg=<base64>` (ask.py:96-100), then
  reads one line with `input()` (ask.py:104).
- Sheepdog picks it up as an agent once it reports a status (mapping.go:77). Its kind is the Python program's name,
  because no `app` is reported (mapping.go:36-49).
- When it reports blocked, the supervisor reads the screen and runs `herdr.ParsePrompt`
  (supervisor/transitions.go:111-127, 393-410, 417-419).
- **The parse fails.** A numbered menu needs exactly one option with a cursor marker `›`, `❯` or `>`
  (herdr/prompt.go:37, 306). An unnumbered menu needs a marker row with a label (prompt.go:55), and `> ` has no label.
- On a failed parse, sheepdog says "<name> is waiting at a prompt." It records the block as answered and creates
  no pending action (supervisor/transitions.go:420-426). The pending action is what the phone shows as a question card
  and answers on a tap (`POST /api/pending/answer` → `AnswerTap`, supervisor/inputs.go:583-600). So there is no card
  and nothing to tap.
- The ask pane is never muted. A mute matches a space's exact folder (attention/mutes.go:164-168), and this pane has
  no space and no folder (supervisor/attention.go:601-611).

## The tap path, once a card exists

- `AnswerTap` re-reads the screen, which must still parse to the same prompt (supervisor/inputs.go:605-614,
  supervisor/reprompt.go:296-307). It records the tap as the person's own input (inputs.go:638), so the approval rail
  passes it as fresh words (inputs.go:644, 458-481). factory.md's "the tap is the person's fresh input" holds, with
  one exception below.
- **A "no" can't approve, and that can block a tap.** When no label starts with "Yes", the option under the cursor
  becomes the prompt's yes keys (prompt.go:214-216), which `keysLabel` calls "yes" (supervisor/brainhost.go:412-416),
  so `approves` is true (inputs.go:549-553). The rail refuses an approving answer whose words start with no, wait,
  hold, stop, cancel, don't and the like (inputs.go:478-479, 526-544), and a tap's words are the option's label
  (inputs.go:638). So that option can't be tapped or spoken if its label starts with one of those words. A scratch
  `ParsePrompt` run on `❯ 2. Wait for review  (recommended)` gives yes keys `["2"]`.
- It then sends the option's keys with `SendKeys`, with no Enter added (supervisor/tools.go:489). A numbered option's
  keys are just its digit, unless its label ends in a plain key hint like `(y)` (prompt.go:40-44, 85-90).
- **A digit alone doesn't answer FAC-9's pane**, because `input()` waits for Enter (ask.py:104).

## Smallest fix for the ask pane (in ask.py, no sheepdog code)

1. Put a cursor marker on the recommended option, e.g. `❯ 1. Ship now  (recommended)`, which parses with keys `1`
   and `2` and the recommendation flagged (prompt.go:62). A spoken "yes" picks it (prompt.go:214-216). If its label
   starts with a negative word, put the marker on the first option that doesn't (see above). If all of them do, one
   option stays untappable until sheepdog changes `keysLabel` or the rail.
2. Read one keypress, so a digit answers without Enter. Words of one's own then need another way in.
- With both fixes the voice works too: the orchestrator's `send_keys` goes through the same rail as a tap
  (supervisor/brainhost.go:311-326).

## What works today without the fix

- The phone's agent window can press keys from an allow-list that includes `1`-`9` and `enter`
  (supervisor/window.go:51-52). With no pending question, the keys go to the pane as they are (window.go:257-260),
  so pressing `1` and then `enter` answers FAC-9's pane as it is.
- Free text can't reach a blocked pane from sheepdog. A typed prompt is refused while the pane is blocked
  (window.go:170-173), and hc's send refuses a blocked terminal (herdrcore/terminal.go:33-40, backend.go:115).
  Words of one's own go in only through the live terminal (herdrcore/bridge.go).

## The Assistant pane

- It is an ordinary Claude Code terminal, so sheepdog sees it as a `claude` agent (mapping.go:15, 52-58).
- The person's words reach it through the orchestrator's `prompt` tool: `brainHost.Prompt` → `sendInstruction`
  (supervisor/brainhost.go:224-236). Before typing, that checks for a menu on screen and for half-typed text
  (supervisor/tools.go:172-183). Then hc's send pastes the words and presses Enter. The send waits until the terminal
  has been quiet for about 3 s, and is refused while the pane is blocked (hc/client.go:130-140, terminal.go:35-39).
- Every prompt gets the SignOff trailer added by code, not by the model: three short lines on what changed, what
  needs a decision and what is next (supervisor/journal.go:48, 63). factory.md's "three-line SignOff" holds.
- Action tools run only on a turn the person's own words started. Event turns are read-only
  (brain/tools.go:94, 113-115, 282-289).
- A voice turn has 6 steps and 25 s (brain/brain.go:30, 38). An event turn has 6 s (brain.go:41).
- The orchestrator finds the Assistant by its spoken name or alias (supervisor/tools.go:545-560).

## Needs a change

- **Ask pane** (ask.py): the cursor marker (avoiding negative first words) and the one-key read above.
- **Muting workers** (sheepdog): factory.md says worker panes labelled `herdr.factory` are muted as a space. Sheepdog
  reads no `herdr.factory`, `herdr.role` or `herdr.task` label (grep of `internal/`). Workers carry
  `herdr.task.space`, never `herdr.space` (Shepherdr launch.py:629, 642), and sheepdog takes a space only from
  `herdr.space` (herdrcore/spaces.go:33). A mute is per space folder (attention.go:527-533), and herdrcore has no
  `PaneCwd` fallback (the only one is in `inject/herdr.go`). So a worker can't be muted in v0. Its blocks are heard at every chattiness level, and its
  finishes only at chatty, since the person never dealt with it (supervisor/settings.go:72-79). Fix: a mute by
  label in sheepdog, or a `herdr.space` on workers, which herdr-app would then show.

## Not checked by a run

- After an answer, the pane reports `working` and exits. The watcher then emits a closed transition from
  blocked or working (herdr/watcher.go:346, 562-567). If that happens, the person hears "<name> has gone away; its
  pane closed." at interrupt level (supervisor/transitions.go:81, 89-105). This is read from the code only.
- The spoken name sheepdog gives an `ask-<id>` terminal and the Assistant. No end-to-end run with the sheepdog
  daemon either: the brief forbids running sheepdog.
