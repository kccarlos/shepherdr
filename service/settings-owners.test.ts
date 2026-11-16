// The service hears a change to the settings file by its own name (FAC-114): settings.json since the data move, which
// `shepherdr web owners` replaces with a rename, so service.owners applies without a restart.
import { expect, test } from "bun:test";
import { mkdtempSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Settings } from "./settings.ts";

test("a replaced settings.json is read again", async () => {
  const dir = mkdtempSync(join(tmpdir(), "shep-watch-"));
  const file = join(dir, "settings.json");
  writeFileSync(file, JSON.stringify({ everywhere: {} }));
  const was = process.env.HERDR_TASK_SETTINGS;
  process.env.HERDR_TASK_SETTINGS = file;
  try {
    const s = new Settings();
    s.start();
    const heard = new Promise<boolean>((done) => { s.on(() => done(true)); setTimeout(() => done(false), 3000); });
    writeFileSync(join(dir, "settings.json.tmp"), JSON.stringify({ everywhere: { service: { owners: ["me@example.com"] } } }));
    renameSync(join(dir, "settings.json.tmp"), file);
    expect(await heard).toBe(true);
  } finally {
    process.env.HERDR_TASK_SETTINGS = was;
  }
});

test("Settings › Web shows who may open it, read-only, with the command", () => {
  const s = new Settings();
  const row = (owners: string[], tagged: boolean) =>
    s.sections({ on: true, link: "https://box/shepherdr/", why: null, owners, tagged }).find((x) => x.rows.some((r) => r.key === "web.link"))!.rows.find((r) => r.key === "web.owners")!;
  expect(row([], true)).toMatchObject({ label: "Who may open it", value: "Nobody yet", fixed: true });
  expect(row([], true).hint).toContain("shepherdr web owners");
  expect(row(["me@example.com", "two@github"], true).value).toBe("me@example.com, two@github");
  expect(row([], false).value).toBe("This machine's owner");
});
