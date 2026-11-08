# Agents: running tasks on agy, and how the Assistant picks a CLI

A task's agent can run on Claude Code, Codex or Antigravity CLI (`agy`). This page covers agy, then how the Assistant
chooses between the three.

## Running a task on agy

**You need** `agy` installed on the machine that runs the task, and signed in there (run `agy` once yourself). Nothing
else is set up for it.

**Pick it for one task:**

```
herdr-task add "Audit the billing code" --agent agy --model gemini-4-argon-high
```

`--agent agy` alone uses agy's own default model. `edit` takes the same flags, and the next agent started for the
task uses the new choice. To make agy the default for a space or everywhere, set **Settings › Agents › Workers** to
agy ([Settings](settings.md)); a task's own `--agent` still wins over it.

**Models** are agy's own ids, with the effort as the last part: `gemini-4-argon-*`, `gemini-3.8-flash-*`,
`claude-opus-5-5-*`, `claude-sonnet-5-5-*`, each `low`, `medium` or `high`. The effort can also come separately with
`--effort`.

**Permissions.** Workers start in agy's `accept-edits` mode. The Workers setting can change that: plan mode, or full
access (`--dangerously-skip-permissions`).

**Resume.** When a task's agent is started again, agy picks up its conversation (`--conversation <id>`). herdr-task
learns the id from the conversation file the running agy has open.

**The folder question.** agy asks "Trust this folder?" on first sight of a folder. For a task that works in a
worktree herdr-task made, it is answered for you; any other folder is not.

### What differs from Claude Code and Codex

- The task's brief goes in with `-i`, as agy takes a prompt from nowhere else.
- herdr-task's own commands (`status`, `ready`, ...) are allowed through agy's `--settings`. That list replaces agy's
  own, so herdr-task adds the allow rules you keep in `~/.gemini/antigravity-cli/settings.json` and the folders it
  already trusts, then its own.

### Limits

- The task's chat in the window and on the web can't show an agy conversation: agy keeps it in a database, not a
  log those chats read. Use the agent's terminal.
- A reviewer defaults to the other installed CLI (Claude Code, else Codex); agy reviews only when neither is installed. Pick one with
  `--reviewer`.
- Only workers get the folder trust and the allowed commands; a reviewer's agy doesn't.

## How the Assistant picks a CLI and a model

The Assistant chooses for each task by the kind of work, and says in a line what it picked and why:

| Work | Picked |
|---|---|
| Small fixes, docs, UI | Claude Code, `sonnet` |
| Tricky changes, design | Claude Code, `opus` |
| Hard debugging, backend | Codex |
| Reading much code, an audit | agy, `gemini-4-argon-high` |

The review goes to a different CLI than the one that did the work.

**What you say wins.** Name a CLI, a model or a quota concern ("use Codex", "save my Claude quota") and the Assistant
follows that. It passes your choice with `--agent`, `--model` and `--effort` (`low`, `medium`, `high`, `xhigh`,
`max`), and the review's with `--reviewer`, `--reviewer-model` and `--reviewer-effort`. The source of truth is the
"Pick each task's CLI and model" line of `templates/assistant.md`.
