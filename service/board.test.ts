import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateAsk, validatePool, validateTask } from "../web/shared/board-contract.ts";

// throwaway homes: herdr-task's store (FAC-9's asks), the service's data (usage.py's cache: test/preload.ts's), an app home with this
// repo's herdr_task; the records are this folder's real ones, private text taken out (fixtures/board-store.json)
const tmp = mkdtempSync(join(tmpdir(), "shep-board-"));
const real = JSON.parse(readFileSync(join(import.meta.dir, "fixtures", "board-store.json"), "utf8"));
mkdirSync(join(tmp, "store", "asks"), { recursive: true });
for (const a of real.asks) writeFileSync(join(tmp, "store", "asks", `${a.id}.json`), JSON.stringify(a));
mkdirSync(join(tmp, "app", "mods", "tasks"), { recursive: true });
symlinkSync(join(import.meta.dir, "..", "mods", "tasks", "bin"), join(tmp, "app", "mods", "tasks", "bin"));
// (model.ts may already be loaded by another test file: its app home, then, is the one that test gave)
Object.assign(process.env, { HERDR_TASK_STORE: join(tmp, "store"), HERDR_APP_HOME: join(tmp, "app") });
const { DATA } = await import("./paths.ts");
const { Model } = await import("./model.ts");
const { Compat } = await import("./compat.ts");

// a hub whose machine.exec runs here (git for the sizes), with the live terminals given (all task 15's)
const hub = (live: Record<string, string | null>) => ({
  on() {}, terminals: new Map(Object.entries(live).map(([address, st]) => [address, { address, state: "live", status: { state: st },
    labels: { "herdr.task": "factory#15", ...(address === "t6n" ? {} : { "herdr.role": "reviewer" }) } }])),
  async call(_: string, p: any) {
    const r = Bun.spawnSync(p.argv);
    return { code: r.exitCode, stdout: r.stdout.toString("base64"), stderr: r.stderr.toString("base64") };
  },
});
const git = (dir: string, ...a: string[]) => Bun.spawnSync(["git", "-C", dir, ...a], { env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).stdout.toString().trim();

/** Model.build on the real records (and a repo holding task 15's branch), then the snapshot compat makes of it. */
async function snapshot(live: Record<string, string | null>) {
  const repo = join(tmp, "repo"); mkdirSync(repo, { recursive: true });
  git(repo, "init", "-q", "-b", "kc-factory"); writeFileSync(join(repo, "a"), "1\n2\n3\n"); git(repo, "add", "."); git(repo, "commit", "-qm", "base");
  const t15 = real.tasks.find((t: any) => t.id === 15);
  git(repo, "checkout", "-qb", t15.branch); writeFileSync(join(repo, "a"), "1\nx\n3\n4\n"); git(repo, "commit", "-qam", "work");
  // done this week (the snapshot shows a done task a week)
  const tasks = real.tasks.map((t: any) => (t.id === 15 ? { ...t, start: git(repo, "rev-parse", "kc-factory") } : t.state === "done" ? { ...t, done_at: Date.now() } : t));
  const m: any = new Model(hub(live) as any, { put() {} } as any);
  m.lists.set(null, [{ slug: "factory", name: "factory-run", prefix: "FAC", folder: repo, machine: null, tasks }]);
  let b: any = null;
  m.onBuild = (x: any) => { b = x; };
  m.build();
  await m.readSizes(b.rows);
  await m.readUsage();
  m.build();
  return { rows: b.rows, snap: new Compat().snapshot({ host: "mini", user: "me", machines: [], spaces: [], sections: [], rows: b.rows, asks: b.asks, usage: b.usage }) as any };
}

// usage.py's own cache (its one-minute TTL), from real codexbar readings, so the service's read never runs codexbar
const readings = JSON.parse(readFileSync(join(import.meta.dir, "fixtures", "codexbar.json"), "utf8"));
const py = `import sys, json, time; sys.path.insert(0, sys.argv[1]); from herdr_task import usage
r = json.loads(sys.argv[3]); print(json.dumps(usage.read(sys.argv[2], fetch=lambda p: r[p])))`;
Bun.spawnSync(["python3", "-c", py, join(import.meta.dir, "..", "mods", "tasks", "bin"), DATA, JSON.stringify(readings)]);

test("every task row, ask and pool the service sends fits the board contract", async () => {
  const { snap } = await snapshot({ t6n: "working", t86: "blocked" });
  expect(snap.tasks.length).toBe(4);
  for (const t of snap.tasks) expect(validateTask(t)).toEqual([]);
  expect(snap.asks.length).toBeGreaterThan(0);
  for (const a of snap.asks) expect(validateAsk(a)).toEqual([]);
  expect(snap.usage.map((p: any) => p.pool)).toEqual(["claude", "codex", "antigravity-gemini", "antigravity-claude-gpt"]);
  for (const p of snap.usage) expect(validatePool(p)).toEqual([]);
});

test("agents carry their real CLI, model, parent and state; the worker's cli is its own", async () => {
  const { snap } = await snapshot({ t6n: "working", t86: "blocked" });
  const t = snap.tasks.find((x: any) => x.id.endsWith("-15"));
  expect(t.agents[0]).toEqual({ role: "worker", cli: "claude", model: "opus", address: "t6n", parent: "t2p", state: "working" });
  expect(t.agents[1]).toEqual({ role: "reviewer", cli: "agy", model: "gemini-4-argon-high", address: "t86", parent: "t6n", state: "blocked" });
  // not live any more: ended
  expect(t.agents.slice(2).every((a: any) => a.role === "reviewer" && a.state === "ended")).toBe(true);
  expect(t.agent.cli).toBe("claude");
});

test("a codex worker reads as codex on its row and in its agents", async () => {
  const t15 = real.tasks.find((t: any) => t.id === 15);
  const was = t15.agents;
  t15.agents = [{ ...was[0], agent: "codex", argv: ["codex", "-m", "gpt-6"] }];
  try {
    const t = (await snapshot({ t6n: "working" })).snap.tasks.find((x: any) => x.id.endsWith("-15"));
    expect(t.agent.cli).toBe("codex");
    expect(t.agents[0]).toMatchObject({ role: "worker", cli: "codex", model: "gpt-6" });
  } finally { t15.agents = was; }
});

test("the tasks view pages get keeps its old shape: the board's fields go in the snapshot only", async () => {
  const views: any[] = [];
  const m: any = new Model(hub({}) as any, { put: (k: string, v: any) => k === "tasks" && views.push(v) } as any);
  m.lists.set(null, [{ slug: "factory", name: "factory-run", prefix: "FAC", folder: tmp, machine: null, tasks: real.tasks }]);
  m.build();
  expect(views[0].length).toBe(4);
  expect(views[0].some((r: any) => "board" in r || "range" in r)).toBe(false);
});

test("evidence: only herdr-task's review rounds; a size from git; a task with none is bare", async () => {
  const { snap } = await snapshot({});
  const byId = (n: number) => snap.tasks.find((x: any) => x.id.endsWith(`-${n}`));
  // task 2's rounds were its worker's own (`reviewed`): never sent
  expect(byId(2).reviews).toBeUndefined();
  expect(byId(36).reviews.length).toBeGreaterThan(0);
  expect(byId(36).reviews.every((r: any) => r.started_by === "herdr-task")).toBe(true);
  expect(byId(36).checks.length).toBe(1);
  // its branch changed one line and added one, from kc-factory
  expect(byId(15).size).toEqual({ added: 2, removed: 1, limit: null });
  expect(byId(16)).toMatchObject({ agents: [], size: { added: 0, removed: 0, limit: null } });
});

test("asks: only the open ones, oldest first, without to and answered_at", async () => {
  const { snap } = await snapshot({});
  const open = real.asks.filter((a: any) => a.answer == null).sort((x: any, y: any) => x.at - y.at);
  expect(snap.asks.map((a: any) => a.id)).toEqual(open.map((a: any) => a.id));
  expect(snap.asks.every((a: any) => !("to" in a) && !("answered_at" in a) && a.answer === null)).toBe(true);
});

test("pools: codex's spent week is floor, a window it lacks is null", async () => {
  const { snap } = await snapshot({});
  const codex = snap.usage.find((p: any) => p.pool === "codex");
  expect(codex).toMatchObject({ five_hour_left: null, week_left: 0, state: "floor" });
});

test("an agent that exited into its kept shell is ended, not idle", async () => {
  const h: any = hub({ t6n: null, t86: null });
  for (const k of h.terminals.values()) k.foreground = { name: "zsh" };
  const m: any = new Model(h, { put() {} } as any);
  m.lists.set(null, [{ slug: "factory", name: "factory-run", prefix: "FAC", folder: tmp, machine: null, tasks: real.tasks }]);
  let b: any = null;
  m.onBuild = (x: any) => { b = x; };
  m.build();
  const t = b.rows.find((r: any) => r.id === 15).board;
  expect(t.agents.slice(0, 2).map((a: any) => a.state)).toEqual(["ended", "ended"]);
});

test("a size is read again when its range moves: done, then reopened", async () => {
  const repo = mkdtempSync(join(tmp, "size-"));
  git(repo, "init", "-q", "-b", "main"); writeFileSync(join(repo, "a"), "1\n"); git(repo, "add", "."); git(repo, "commit", "-qm", "base");
  const start = git(repo, "rev-parse", "HEAD");
  git(repo, "checkout", "-qb", "work"); writeFileSync(join(repo, "a"), "1\n2\n3\n"); git(repo, "commit", "-qam", "w");
  const m: any = new Model(hub({}) as any, { put() {} } as any);
  const row = (section: string, range: string) => ({ key: "k", folder: repo, machine: null, section, range });
  await m.readSizes([row("working", `main...work`)]);
  expect(m.sizes.get("k")).toMatchObject({ added: 2, removed: 0 });
  writeFileSync(join(repo, "a"), "1\n2\n3\n4\n"); git(repo, "commit", "-qam", "w2");
  const head = git(repo, "rev-parse", "HEAD");
  // done within the minute: its range changed, so it's read again
  await m.readSizes([row("done", `${start}..${head}`)]);
  expect(m.sizes.get("k")).toMatchObject({ added: 3 });
  // reopened and worked on: read again, not kept as done
  writeFileSync(join(repo, "a"), "1\n2\n3\n4\n5\n"); git(repo, "commit", "-qam", "w3");
  await m.readSizes([row("working", `main...work`)]);
  expect(m.sizes.get("k")).toMatchObject({ added: 4 });
});

test("odd records still fit: the last --model, an ask with an empty task, a window over spent", async () => {
  const { modelIn, openAsks, poolsOf } = await import("./board.ts");
  expect(modelIn(["claude", "--model", "sonnet", "--model", "opus"])).toBe("opus");
  expect(modelIn(["claude", "--model", "--verbose"])).toBeNull();
  const dir = mkdtempSync(join(tmp, "asks-"));
  writeFileSync(join(dir, "a1.json"), JSON.stringify({ ...real.asks.find((a: any) => a.answer == null), id: "a1", task: "" }));
  expect(openAsks(dir).flatMap(validateAsk)).toEqual([]);
  const [p] = poolsOf([{ name: "claude", five: -0.4, week: 30, five_reset: null, week_reset: null }]);
  expect(validatePool(p)).toEqual([]);
  expect(p).toMatchObject({ five_hour_left: 0, state: "floor" });
});

test("FAC-92: snapshot rows carry worker, reviewer, compact rounds, roundLimit, lines and acceptedBy", async () => {
  const h1 = "a".repeat(40), h2 = "b".repeat(40);
  const full = {
    id: 92, title: "Board data in the snapshot", state: "done", done_at: Date.now(), mode: "worktree",
    agent: "agy", model: "gemini-4-carbon-high", reviewer: "codex",
    agents: [{ address: "tw1", agent: "agy", argv: ["agy", "--model", "gemini-4-carbon-high"], at: 1000, parent: "t0", ended: 2000 }],
    reviewers: [{ address: "tr1", agent: "codex", argv: ["codex"], at: 1100, parent: "tw1" }, { address: "tr2", agent: "codex", argv: ["codex"], at: 1500, parent: "tw1" }],
    review_runs: [{ round: 1, head: h1, address: "tr1", cli: "codex", model: null, at: 1100 }, { round: 2, head: h2, address: "tr2", cli: "codex", model: null, at: 1500 }],
    reviews: [
      { round: 1, head: h1, by: "tr1", started_by: "herdr-task", verdict: "changes", must_fix: 1, report: "fix x", at: 1200 },
      { round: 2, head: h2, by: "tr2", started_by: "herdr-task", verdict: "pass", must_fix: 0, report: "", at: 1600 },
    ],
    brief_review: { on: true, rounds: 5 }, review_rounds_added: 1,
    size: { changed: 168, generated: 34, estimate: 250 }, accepted_by: "assistant",
  };
  const m: any = new Model(hub({}) as any, { put() {} } as any);
  m.lists.set(null, [{ slug: "factory", name: "factory-run", prefix: "FAC", folder: tmp, machine: null, tasks: [full] }]);
  let b: any = null;
  m.onBuild = (x: any) => { b = x; };
  m.build();
  const [t] = (new Compat().snapshot({ host: "mini", user: "me", machines: [], spaces: [], sections: [], rows: b.rows }) as any).tasks;
  expect(validateTask(t)).toEqual([]);
  expect(t.worker).toEqual({ cli: "agy", model: "gemini-4-carbon-high" });
  expect(t.reviewer).toEqual({ cli: "codex", model: "default" });
  expect(t.rounds).toEqual([
    { round: 1, verdict: "changes", head7: "aaaaaaa", cli: "codex", at: 1200 },
    { round: 2, verdict: "pass", head7: "bbbbbbb", cli: "codex", at: 1600 },
  ]);
  expect(t.roundLimit).toBe(6);
  expect(t.lines).toEqual({ changed: 168, generated: 34, estimate: 250 });
  expect(t.size.limit).toBe(250);
  expect(t.acceptedBy).toBe("assistant");
});

test("FAC-92: an old task without the new fields still builds cleanly", async () => {
  const bare = { id: 99, title: "Old task from before board fields", state: "todo" };
  const m: any = new Model(hub({}) as any, { put() {} } as any);
  m.lists.set(null, [{ slug: "factory", name: "factory-run", prefix: "FAC", folder: tmp, machine: null, tasks: [bare] }]);
  let b: any = null;
  m.onBuild = (x: any) => { b = x; };
  m.build();
  const snap = new Compat().snapshot({
    host: "mini", user: "me", machines: [], spaces: [], sections: [],
    rows: [...b.rows, { id: 100, ref: "FAC-100", title: "Row from old caller", section: "done", done_at: Date.now() }],
  }) as any;
  expect(snap.tasks.map((x: any) => x.id)).toEqual(["FAC-99", "FAC-100"]);
  expect(validateTask(snap.tasks[0])).toEqual([]);
  for (const t of snap.tasks) {
    for (const k of ["worker", "reviewer", "rounds", "roundLimit", "lines", "acceptedBy"]) expect(t[k]).toBeUndefined();
  }
});
