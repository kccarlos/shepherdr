// The board's data (contracts/board-data.md), from what herdr-task keeps: each task's agents with role, CLI and model,
// its gate evidence and size; the open asks (FAC-9's STORE/asks); the usage pools (usage.py's reading).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CLIS = ["claude", "codex", "agy"];
const LIVE = ["working", "blocked", "idle", "done"];
const SIZE_LINE = /^[\s>*+-]*\**size(?:\s+limit)?\**\s*:\s*(.+)/gim;
const BRIEF_LINES = /(?<![\w.-])~?\s*(\d+(?:,\d{3})*)(?:\s*(?:[-–—]|to)\s*~?\s*(\d+(?:,\d{3})*))?\s+lines\b/gi;

function briefLines(text: string): number | undefined {
  const scan = (s: string) => {
    const ns = [...s.matchAll(BRIEF_LINES)].flatMap((m) => [m[1], m[2]]).filter(Boolean).map((x) => Number(x!.replace(/,/g, ""))).filter((n) => n > 0);
    return ns.length ? Math.max(...ns) : undefined;
  };
  for (const m of text.matchAll(SIZE_LINE)) { const n = scan(m[1].split(". ")[0]) ?? scan(m[1]); if (n !== undefined) return n; }
  return scan(text);
}

/** The model an argv names (--model x, --model=x, -m x), null: the CLI's default. */
export function modelIn(argv: unknown): string | null {
  const a = Array.isArray(argv) ? argv.map(String) : [];
  // the last one wins, as a CLI's parser takes it
  const i = a.findLastIndex((x) => x === "--model" || x === "-m" || x.startsWith("--model="));
  const v = i < 0 ? null : a[i].startsWith("--model=") ? a[i].slice(8) : a[i + 1];
  return v && !v.startsWith("-") ? v : null;
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
  const lastW = Array.isArray(task.agents) ? task.agents.at(-1) : null;
  const wCli = task.agent || lastW?.agent || (task.model ? "claude" : null);
  const worker = typeof wCli === "string" && wCli
    ? { cli: wCli, model: String(task.model || (lastW?.agent === wCli ? modelIn(lastW?.argv) : null) || "default") } : undefined;
  const lastRun = runs.at(-1), lastR = Array.isArray(task.reviewers) ? task.reviewers.at(-1) : null;
  const rCli = task.reviewer || lastRun?.cli || lastR?.agent || (task.reviewer_model ? "claude" : null);
  const reviewer = typeof rCli === "string" && rCli
    ? { cli: rCli, model: String(task.reviewer_model || (lastRun?.cli === rCli ? lastRun?.model : null) || (lastR?.agent === rCli ? modelIn(lastR?.argv) : null) || "default") } : undefined;
  // a worker's own `reviewed` rounds never count for the gate: only herdr-task's
  const reviews = Array.isArray(task.reviews) ? task.reviews.filter((r: any) => r.started_by === "herdr-task") : [];
  const rounds = (Array.isArray(task.reviews) ? task.reviews : []).flatMap((rv: any, i: number) => {
    const verdict = rv?.verdict ?? rv?.result;
    if (typeof verdict !== "string" || !verdict || typeof rv?.at !== "number") return [];
    const cli = runs.find((r: any) => (rv.by && r.address === rv.by) || (r.round === rv.round && r.head === rv.head))?.cli
      ?? (rv.by && Array.isArray(task.reviewers) ? task.reviewers.find((r: any) => r.address === rv.by)?.agent : null)
      ?? rCli ?? (rv.by && Array.isArray(task.agents) ? task.agents.find((a: any) => a.address === rv.by)?.agent : null) ?? wCli ?? "default";
    return [{ round: Number(rv.round) || i + 1, verdict, head7: String(rv.head ?? "").slice(0, 7), cli: String(cli), at: rv.at }];
  });
  const sets = task.set && typeof task.set === "object" ? task.set : {};
  const revOff = sets.review === "off" || sets.review_rounds === 0
    || (!("review" in sets) && !("review_rounds" in sets) && !sets.review_kind && !("review_min" in sets) && task.brief_review?.on === false);
  const baseRounds = revOff ? 0 : typeof sets.review_rounds === "number" ? sets.review_rounds
    : sets.review_kind ? Math.max(1, Number(sets.review_min) || 0)
    : typeof task.brief_review?.rounds === "number" ? task.brief_review.rounds
    : typeof sets.review_min === "number" && sets.review_min > 0 ? Math.max(3, sets.review_min) : 0;
  const roundLimit = baseRounds > 0 ? baseRounds + (Number(task.review_rounds_added) || 0) : undefined;
  const est = typeof task.size?.estimate === "number" ? task.size.estimate
    : typeof task.estimate_lines === "number" && task.estimate_lines > 0 ? Math.trunc(task.estimate_lines)
    : briefLines(typeof task.prompt === "string" ? task.prompt : "");
  const stored = typeof task.size?.changed === "number" && typeof task.size?.generated === "number";
  const lines = stored || est !== undefined
    ? { ...(stored ? { changed: task.size.changed, generated: task.size.generated } : {}), ...(est !== undefined ? { estimate: est } : {}) } : undefined;
  const acceptedBy = ["person", "assistant", "auto"].includes(task.accepted_by) ? task.accepted_by : undefined;
  return {
    agents, ...(reviews.length ? { reviews } : {}), ...(task.checks?.length ? { checks: task.checks } : {}),
    ...(task.verdicts?.length ? { verdicts: task.verdicts } : {}), size: { ...size, limit: est ?? null },
    ...(worker ? { worker } : {}), ...(reviewer ? { reviewer } : {}),
    ...(rounds.length ? { rounds } : {}), ...(roundLimit !== undefined ? { roundLimit } : {}),
    ...(lines ? { lines } : {}), ...(acceptedBy ? { acceptedBy } : {}),
  };
}

/** The asks still waiting for an answer, oldest first, from FAC-9's records in <dir>. */
export function openAsks(dir: string) {
  let files: string[] = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith(".json")); } catch { return []; }
  return files.flatMap((f) => {
    try {
      const { to, answered_at, ...a } = JSON.parse(readFileSync(join(dir, f), "utf8"));
      return a.answer == null ? [{ ...a, task: a.task || null, terminal: a.terminal || null, answer: null }] : [];
    } catch { return []; }
  }).sort((x, y) => x.at - y.at);
}

/** usage.py's pools as the board reads them, with their state: unknown with no window, floor at 5 % (5 hours) or 1 % (week). */
export const poolsOf = (pools: any[]) => pools.map((p) => {
  // % left, kept within 0..100 (codexbar can report a window a little over spent)
  const pct = (v: unknown) => (typeof v === "number" ? Math.min(100, Math.max(0, v)) : null);
  const f = pct(p.five), w = pct(p.week);
  return { pool: p.name, five_hour_left: f, week_left: w, five_hour_reset: p.five_reset ?? null, week_reset: p.week_reset ?? null,
    state: f === null && w === null ? "unknown" : (f !== null && f <= 5) || (w !== null && w <= 1) ? "floor" : "ok" };
});
