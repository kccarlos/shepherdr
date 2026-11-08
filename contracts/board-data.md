# Board data contract

What the board's screens (B2..B6) read, and what the service (S1) must send (docs/factory.md section 10). Fields come
from the canvas's "needs: …" chips and docs/board-audit.md's "Missing" lines. The validator is
`web/shared/board-contract.ts` (`validateTask`, `validateAsk`, `validatePool`, `validateLink`); each side's bun test runs
it on what its own code really sends or reads. Each returns a list of problems, empty when the value fits. Unknown
extra keys in the new shapes are rejected. Times are ms ints. **The service sends nothing else new**: only the fields
below, in the snapshot keys named, plus the one endpoint.

## Task: extra fields on each `snapshot.tasks[]` row
- `agents`: `[{role, cli, model, address, parent, state}]`. `role` is worker, reviewer, verifier or checks; `cli` is
  claude, codex or agy; `model` is a string or null (the CLI's default); `address` is the terminal; `parent` is the
  terminal address that started it, or null; `state` is working, idle, done or ended.
  ```json
  {"role": "reviewer", "cli": "agy", "model": "gemini-4-argon-high", "address": "term-7", "parent": "term-3", "state": "working"}
  ```
- `reviews`, `checks`, `verdicts`: exactly the shapes of contracts/gate-evidence.md (`t["reviews"]` and so on),
  copied from the store; absent means none yet.
- `size`: `{"added": 42, "removed": 7, "limit": 60}`; `limit` is null when the task has none.

## Asks: `snapshot.asks`, an object `{[id]: Ask}` (FAC-9's `STORE/asks/<id>.json`; today's snapshot has `{}`)
```json
{"id": "a1b2c3", "question": "Ship it?", "options": ["Yes", "No"], "recommend": "Yes", "task": "FAC-37",
 "terminal": "term-9", "answer": null, "at": 1762600000000}
```
`recommend` is one of `options`; `task` and `terminal` may be null; `answer` is null until answered, then a string.

## Usage: `snapshot.usage`, an array `[Pool]` (usage.py, one per provider)
```json
{"pool": "claude", "five_hour_left": 80, "week_left": 55, "five_hour_reset": "2026-11-08T20:00:00Z",
 "week_reset": "2026-11-12T09:00:00Z", "state": "ok"}
```
`*_left` are % left (0..100), or null when `state` is unknown; resets are ISO strings or null. `state` is ok, floor
(a window is at or under its floor) or unknown.

## Deliverables: `GET /api/deliverables?folder=<abs>&on=<machine>` (FAC-24), as it is
Returns `{folder, machine, tasks: [{ref, title, proof, deliverables}], agents}`. Nothing changes except one added
entry shape in a task's `deliverables`, for a design link: `{"kind": "link", "title": "Canvas", "url": "https://claude.ai/…", "at": 1762600000000}`.
Entries without `kind` are FAC-24's artifact cards.
