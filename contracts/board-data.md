# Board data contract

What the board's screens (B2..B6) read, and what the service (S1) must send (docs/factory.md section 10). Fields come
from the canvas's "needs: …" chips and docs/board-audit.md's "Missing" lines. The validator is
`web/shared/board-contract.ts` (`validateTask`, `validateAsk`, `validatePool`, `validateLink`); each side's bun test runs
it on what its own code really sends or reads. Each returns a list of problems, empty when the value fits. Unknown
extra keys in the new shapes are rejected. Times are ms ints. **The service sends nothing else new**: only the fields
below, in the snapshot keys named, plus the one endpoint.

## Task: extra fields on each `snapshot.tasks[]` row
- `agents`: `[{role, cli, model, address, parent, state}]`. `role` is worker, reviewer, verifier or checks; `cli` is
  claude, codex or agy, or null for `checks` and only for it (it runs a shell command; S1 takes `cli` from herdr-task's records of
  the agents it started, since the chat's `kindOf` gives null for agy); `model` is a string or null (the CLI's default); `address` is the terminal; `parent` is the
  terminal address that started it, or null; `state` is working, idle, blocked, done or ended.
  ```json
  {"role": "reviewer", "cli": "agy", "model": "gemini-4-argon-high", "address": "term-7", "parent": "term-3", "state": "working"}
  ```
- `reviews`, `checks`, `verdicts`: exactly the shapes of contracts/gate-evidence.md (`t["reviews"]` and so on),
  copied from the store, absent meaning none yet. Only `reviews` that have `started_by: "herdr-task"` are sent (a worker's own
  `reviewed` rounds are dropped); gate-evidence's limits hold (round >= 1, must_fix 0 on a pass, `report` <= 2000 chars and
  may be empty, `output_tail` <= 4000).
- `size`: `{"added": 42, "removed": 7, "limit": 60}`; `limit` is null when the task has none.

## Asks: `snapshot.asks`, an array `[Ask]`, oldest first (today's snapshot has `{}` keyed by place; that key is replaced)
S1 builds each from FAC-9's `STORE/asks/<id>.json`: it drops `to` and `answered_at`, and sets `terminal` and `answer` to null when the record has none.
```json
{"id": "a1b2c3", "question": "Ship it?", "options": ["Yes", "No"], "recommend": "Yes", "task": "FAC-37",
 "terminal": "term-9", "answer": null, "at": 1762600000000}
```
`options` are two or more different strings; `recommend` is one of them; `task` and `terminal` may be null; `answer` is null until answered, then a string.

## Usage: `snapshot.usage`, an array `[Pool]`: one per usage.py pool (claude, codex, antigravity-gemini, antigravity-claude-gpt)
S1 maps usage.py's `name`, `five`, `week`, `five_reset`, `week_reset` to the names below.
```json
{"pool": "claude", "five_hour_left": 80, "week_left": 55, "five_hour_reset": "2026-11-08T20:00:00Z",
 "week_reset": "2026-11-12T09:00:00Z", "state": "ok"}
```
`*_left` are % left (0..100), or null when that window has none (codex has only a weekly one); both are null when
`state` is unknown. Resets are ISO strings or null. `pool` is one of the four names. S1 sets `state` (usage.py gives only ok or unknown): unknown when both windows are null,
floor when the 5-hour window is at 5 or under, or the week at 1 or under; else ok. The canvas's "gemini" is `antigravity-gemini`.

## Deliverables: `GET /api/deliverables?folder=<abs>&on=<machine>` (FAC-24), as it is
Returns `{folder, machine, tasks: [{ref, title, proof, deliverables}], agents}`. Nothing changes except one added
entry shape in a task's `deliverables`, for a design link:
```json
{"kind": "link", "title": "Canvas", "url": "https://claude.ai/design/x", "at": 1762600000000}
```
Entries without `kind` are FAC-24's artifact cards.
