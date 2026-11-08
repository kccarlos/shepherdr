import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// a throwaway app home
process.env.HERDR_APP_HOME = mkdtempSync(join(tmpdir(), "shep-deliverables-"));
const { Compat } = await import("./compat.ts");

const art = (id: string, more: any = {}) => ({ id, title: id, version: 1, folder: "/srv/shop", at: 100, files: ["recipe.json"], versions: [{ v: 1, at: 100, publisher: "t1" }], ...more });
const row = (more: any) => ({ section: "working", machine: null, folder: "/srv/shop", slug: "shop", agents: [], logs: [], ...more });

function board(rows: any[], arts: any[], folder = "/srv/shop", machine: string | null = null) {
  const c = new Compat() as any;
  c.snapshot({ host: "mini", user: "me", machines: [], spaces: [], sections: [], rows, artifacts: arts });
  return c.deliverables(folder, machine);
}

test("each task's deliverables: its proof first with its title, newest version and first picture", () => {
  const arts = [
    art("proof-0001", { task: "SHOP-4", title: "SHOP-4: Coverage · Proof", version: 3, at: 50, files: ["b.png", "a shot.png", "recipe.json"].sort(),
      versions: [{ v: 3, at: 50, publisher: "t5" }] }),
    art("chart-0002", { task: "SHOP-4", at: 3000, files: ["chart.svg", "recipe.json"] }),
    art("plain-0003", { task: "SHOP-4", at: 2000 }),
    art("other-0004", { task: "SHOP-5", at: 4000 }),
    art("elsewhere-0005", { task: "SHOP-4", folder: "/srv/blog", at: 5000 }),
  ];
  const b = board([row({ ref: "SHOP-4", id: 4, title: "Coverage", proof: "proof-0001", proofTitle: "SHOP-4: Coverage · Proof" })], arts);
  expect(b.tasks).toHaveLength(1);
  const t = b.tasks[0];
  expect(t.proof).toEqual({ id: "proof-0001", title: "SHOP-4: Coverage · Proof", version: 3, thumb: "api/artifacts/proof-0001/file/a%20shot.png?v=3" });
  // the Artifacts tab's own list and order: proof, then newest first; another task's and another folder's left out
  expect(t.deliverables.map((d: any) => d.id)).toEqual(["proof-0001", "chart-0002", "plain-0003"]);
  expect(t.deliverables[1].thumb).toBe("api/artifacts/chart-0002/file/chart.svg?v=1");
  // no picture: no thumbnail
  expect(t.deliverables[2].thumb).toBeNull();
});

test("each agent's latest: what its own terminal published while it ran, else the task's newest", () => {
  const arts = [
    // t5 published v1 while the first agent ran; t5 again (the address reused by a later program) long after it ended
    art("mine-0001", { task: "SHOP-4", version: 2, at: 900000, files: ["recipe.json", "shot.png"],
      versions: [{ v: 1, at: 1500, publisher: "t5" }, { v: 2, at: 900000, publisher: "t9" }] }),
    art("late-0002", { task: "SHOP-4", at: 800000, versions: [{ v: 1, at: 800000, publisher: "t5" }] }),
  ];
  const agents = [{ address: "t5", at: 1000, ended: 2000 }, { address: "t7", at: 300000, ended: null }];
  const b = board([row({ ref: "SHOP-4", id: 4, title: "Coverage", agents })], arts);
  expect(b.agents.map((g: any) => [g.address, g.by, g.latest.id])).toEqual([["t5", "agent", "mine-0001"], ["t7", "task", "mine-0001"]]);
  expect(b.agents[0].latest.thumb).toBe("api/artifacts/mine-0001/file/shot.png?v=2");
  // each entry is one run of the agent: when it ended tells it from a later program on the same address
  expect(b.agents.map((g: any) => [g.at, g.ended])).toEqual([[1000, 2000], [300000, null]]);
});

test("a task done over a week ago, which the web app no longer shows, isn't listed either", () => {
  const rows = [row({ ref: "SHOP-1", id: 1, title: "Old", section: "done", done_at: Date.now() - 10 * 86400000 }), row({ ref: "SHOP-2", id: 2, title: "Recent", section: "done", done_at: Date.now() - 86400000 })];
  expect(board(rows, []).tasks.map((t: any) => t.ref)).toEqual(["SHOP-2"]);
});

test("another machine's: only its own artifacts, its thumbnails read there; a task with none lists no agent", () => {
  const arts = [art("far-0001", { task: "SHOP-4", machine: "vm", files: ["x.jpg"] }), art("near-0002", { task: "SHOP-4", files: ["y.jpg"] })];
  const rows = [row({ ref: "SHOP-4", id: 4, title: "Far", machine: "vm", agents: [{ address: "t1", at: 0 }] }), row({ ref: "SHOP-6", id: 6, title: "Empty", agents: [{ address: "t2", at: 0 }] })];
  const far = board(rows, arts, "/srv/shop", "vm");
  expect(far.tasks.map((t: any) => t.deliverables.map((d: any) => d.thumb))).toEqual([["api/artifacts/far-0001/file/x.jpg?v=1&on=vm"]]);
  const near = board(rows, arts);
  expect(near.tasks.map((t: any) => [t.ref, t.deliverables.length])).toEqual([["SHOP-6", 0]]);
  expect(near.agents).toEqual([]);
  // a proof the registry doesn't list (yet): its id and title only
  expect(board([row({ ref: "SHOP-4", id: 4, title: "T", proof: "gone-0009" })], []).tasks[0].proof).toEqual({ id: "gone-0009", title: "gone-0009" });
});
