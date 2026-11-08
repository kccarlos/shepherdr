// The board's data (contracts/board-data.md), from what herdr-task keeps: each task's agents with role, CLI and model,
// its gate evidence and size; the open asks (FAC-9's STORE/asks); the usage pools (usage.py's reading).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CLIS = ["claude", "codex", "agy"];
const LIVE = ["working", "blocked", "idle", "done"];

/** The model an argv names (--model x, --model=x, -m x), null: the CLI's default. */
export function modelIn(argv: unknown): string | null {
  const a = Array.isArray(argv) ? argv.map(String) : [];
  const i = a.findIndex((x) => x === "--model" || x === "-m");
  return (i >= 0 ? a[i + 1] : a.find((x) => x.startsWith("--model="))?.slice(8)) || null;
}

/** A task's board fields. task: its store record; on: its machine (null: here), terminal addresses there are on/addr;
 *  status(addr): a live terminal's status state, undefined when not live; size: its diff's lines. */
export function boardOf(task: any, on: string | null, status: (addr: string) => string | null | undefined, size: { added: number; removed: number }) {
  const at = (a: unknown) => (a ? (on ? `${on}/${a}` : String(a)) : null);
  const stateOf = (a: any) => { const s = a.ended ? undefined : status(at(a.address)!); return s === undefined ? "ended" : LIVE.includes(s as string) ? s : "idle"; };
  const runs = Array.isArray(task.review_runs) ? task.review_runs : [];
  const agent = (role: string) => (a: any) => ({ role, cli: a.agent, address: at(a.address), parent: at(a.parent), state: stateOf(a),
    // a reviewer herdr-task started: the model its run records (null: the CLI's default)
    model: runs.find((r: any) => r.address === a.address)?.model ?? modelIn(a.argv) });
  const agents: any[] = [...(task.agents ?? []).map(agent("worker")), ...(task.reviewers ?? []).map(agent("reviewer"))]
    .filter((a) => a.address && CLIS.includes(a.cli));
  const c = task.check_run;
  if (c?.address) agents.push({ role: "checks", cli: null, model: null, address: at(c.address), parent: null, state: status(at(c.address)!) === undefined ? "ended" : "working" });
  // a worker's own `reviewed` rounds never count for the gate: only herdr-task's
  const reviews = Array.isArray(task.reviews) ? task.reviews.filter((r: any) => r.started_by === "herdr-task") : [];
  return { agents, ...(reviews.length ? { reviews } : {}), ...(task.checks?.length ? { checks: task.checks } : {}),
    ...(task.verdicts?.length ? { verdicts: task.verdicts } : {}), size: { ...size, limit: null } };
}

/** The asks still waiting for an answer, oldest first, from FAC-9's records in <dir>. */
export function openAsks(dir: string) {
  let files: string[] = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith(".json")); } catch { return []; }
  return files.flatMap((f) => {
    try {
      const { to, answered_at, ...a } = JSON.parse(readFileSync(join(dir, f), "utf8"));
      return a.answer == null ? [{ ...a, terminal: a.terminal ?? null, answer: null }] : [];
    } catch { return []; }
  }).sort((x, y) => x.at - y.at);
}

/** usage.py's pools as the board reads them, with their state: unknown with no window, floor at 5 % (5 hours) or 1 % (week). */
export const poolsOf = (pools: any[]) => pools.map((p) => {
  const f = p.five ?? null, w = p.week ?? null;
  return { pool: p.name, five_hour_left: f, week_left: w, five_hour_reset: p.five_reset ?? null, week_reset: p.week_reset ?? null,
    state: f === null && w === null ? "unknown" : (f !== null && f <= 5) || (w !== null && w <= 1) ? "floor" : "ok" };
});
