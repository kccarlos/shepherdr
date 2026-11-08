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
