// The window's Settings › Web (mods/shepherdr-settings/web-section.js) shows who may open the web app (FAC-114): the
// service.owners logins the service wrote into web.json, or "Nobody yet" on a tagged machine, with the command.
// No window runs here, so gpui and herdr are stand-ins (fake-gpui.ts, fake-herdr.ts).
import { afterAll, expect, mock, test } from "bun:test";
import { fakeHerdr } from "./fake-herdr";
import { element, fakeGpuiBase, fakeGpuiKit } from "./fake-gpui";

let webJson = "null";
const shared = new Map<string, unknown>();
mock.module("herdr", () => fakeHerdr({
  home: () => "/nonexistent-home", appHome: () => "/nonexistent-app",
  exec: async () => ({ code: 1, stdout: "", stderr: "" }), hc: async () => ({ code: 1, stdout: "", stderr: "" }),
  theme: () => new Proxy({}, { get: () => "#000000" }), readTextFile: async () => webJson, shared: (k: string) => shared.get(k), setShared: (k: string, v: unknown) => { shared.set(k, v); },
}));
mock.module("gpui-kit", () => fakeGpuiKit({ View: class {}, div: () => element(), svg: () => element("svg"), image: () => element("img") }));
mock.module("gpui-base", () => fakeGpuiBase({ v_flex: () => element(), h_flex: () => element() }));

const { webSection } = await import("../mods/shepherdr-settings/web-section.js");
const theme = new Proxy({}, { get: () => "#000000" });
let later = 0;
const realNow = Date.now;
Date.now = () => realNow() + later;

async function rows(web: object) {
  webJson = JSON.stringify(web);
  const seen: { title: string; about: string; control: any }[] = [];
  const view = { title: () => element(), row: (_t: unknown, title: string, about: string, control: any) => { seen.push({ title, about, control }); return element(); } };
  // the page reads web.json at most every 5 s: a minute later, the first draw starts reading it and the next shows it
  later += 60_000;
  webSection(view, theme);
  for (let i = 0; i < 5; i++) await Bun.sleep(5);
  seen.length = 0;
  webSection(view, theme);
  return seen;
}
const text = (el: any): string[] => (typeof el === "string" ? [el] : (el?.kids ?? []).flatMap(text));

test("a tagged machine with nobody named: Nobody yet, and the command", async () => {
  const r = (await rows({ on: true, why: "tagged", owners: [], tagged: true })).find((x) => x.title === "Who may open it")!;
  expect(text(r.control)).toEqual(["Nobody yet"]);
  expect(r.about).toContain("shepherdr web owners");
});

test("the named logins", async () => {
  const r = (await rows({ on: true, why: null, link: "https://box/shepherdr/", owners: ["me@example.com"], tagged: true })).find((x) => x.title === "Who may open it")!;
  expect(text(r.control)).toEqual(["me@example.com"]);
});

test("an older service's web.json (no owners): no row", async () => {
  expect((await rows({ on: true, why: null, link: "https://box/shepherdr/" })).some((x) => x.title === "Who may open it")).toBe(false);
});

afterAll(() => { Date.now = realNow; });
