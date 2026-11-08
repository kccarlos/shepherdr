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

`--agent agy` alone leaves the model unset, so agy uses its own default. `edit` takes the same flags, and the next agent started for the
task uses the new choice. A model or effort the task already has stays: switching a task that has `--model sonnet`
to agy also needs `--model default` (or a real agy id). The Workers setting in [Settings](settings.md) only offers Claude Code and Codex, so agy is
chosen per task (the Assistant does this for audits, below).

**Models.** herdr-task keeps no list of models: `--model` goes to agy as written (`default` clears it). `--effort`
must be one of `none`, `minimal`, `lowest`, `low`, `medium`, `high`, `xhigh`, `max`, `ultra` or `default`. Run `agy models` to see the ids,
such as `gemini-4-argon-high` or `gemini-3.8-flash-medium` (family plus `low`, `medium` or `high`).

**Permissions.** A task's agy starts in its `accept-edits` mode.

**Resume.** When a task's agent is started again, agy picks up its conversation (`--conversation <id>`). herdr-task
learns the id from the conversation file the running agy has open.

**The folder question.** agy asks "Trust this folder?" on first sight of a folder. For a task that works in a
worktree herdr-task made, it is answered for you; any other folder is not.

### What differs from Claude Code and Codex

- The task's first message goes in with `-i`: agy takes no plain prompt for an interactive session.
- herdr-task's own commands (`status`, `ready`, ...), `herdr-secret`'s `ask`, `run`, `env` and `list`, and `herdr-browser` are allowed through agy's
  `--settings`. That list replaces agy's own, so herdr-task first copies the allow rules from
  `~/.gemini/antigravity-cli/settings.json`.

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

When review is on, it goes by default to a different CLI than the one that did the work.

**What you say wins.** Name a CLI, a model or a quota concern ("use Codex", "save my Claude quota") and the Assistant
follows that. It passes your choice with `--agent`, `--model` and `--effort` (`low`, `medium`, `high`, `xhigh`,
`max`), and the review's with `--reviewer`, `--reviewer-model` and `--reviewer-effort`. The source of truth is the
"Pick each task's CLI and model" line of `templates/assistant.md`.
