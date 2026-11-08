import { describe, expect, test } from "bun:test";
import { gate, localCaller, type Gate } from "./auth.ts";

const g: Gate = { owner: "me@example.com", dns: "box.tailnet.example", port: 7788, token: "secret-token" };
const tailnet = (init: { method?: string; headers?: Record<string, string> } = {}) =>
  new Request("http://box.tailnet.example/api/me", {
    method: init.method ?? "GET",
    headers: { host: "box.tailnet.example", "tailscale-user-login": "me@example.com", ...init.headers },
  });
const local = (headers: Record<string, string> = {}) =>
  new Request("http://127.0.0.1:7788/api/me", { headers: { host: "127.0.0.1:7788", ...headers } });

describe("through tailscale serve", () => {
  test("the owner reads", () => expect(gate(tailnet(), g, false, true)).toMatchObject({ ok: true, via: "tailnet" }));
  test("someone else on the tailnet is refused", () =>
    expect(gate(tailnet({ headers: { "tailscale-user-login": "other@example.com" } }), g, false, true)).toMatchObject({ ok: false, status: 403 }));
  test("the header from a connection Tailscale didn't open is refused", () =>
    expect(gate(tailnet(), g, false, false)).toMatchObject({ ok: false, status: 403 }));
  test("another host name is refused (DNS rebinding)", () =>
    expect(gate(tailnet({ headers: { host: "evil.example" } }), g, false, true)).toMatchObject({ ok: false, status: 421 }));
  test("without Tailscale running nobody gets in", () =>
    expect(gate(tailnet(), { ...g, owner: null }, false, true)).toMatchObject({ ok: false, status: 503 }));
  test("a write needs the page's own origin and the header", () => {
    const ok = tailnet({ method: "POST", headers: { origin: "https://box.tailnet.example", "x-shepherdr": "1" } });
    expect(gate(ok, g, false, true)).toMatchObject({ ok: true });
    const noHeader = tailnet({ method: "POST", headers: { origin: "https://box.tailnet.example" } });
    expect(gate(noHeader, g, false, true)).toMatchObject({ ok: false, status: 403 });
    const otherOrigin = tailnet({ method: "POST", headers: { origin: "https://evil.example", "x-shepherdr": "1" } });
    expect(gate(otherOrigin, g, false, true)).toMatchObject({ ok: false, status: 403 });
  });
  test("a socket from another site is refused", () => {
    expect(gate(tailnet({ headers: { origin: "https://evil.example" } }), g, true, true)).toMatchObject({ ok: false });
    expect(gate(tailnet({ headers: { origin: "https://box.tailnet.example" } }), g, true, true)).toMatchObject({ ok: true });
  });
  test("cross-site and preflight requests are refused", () => {
    expect(gate(tailnet({ headers: { "sec-fetch-site": "cross-site" } }), g, false, true)).toMatchObject({ ok: false });
    expect(gate(tailnet({ method: "OPTIONS" }), g, false, true)).toMatchObject({ ok: false });
  });
});

describe("on this machine", () => {
  test("the token gets in", () => expect(gate(local({ authorization: "Bearer secret-token" }), g)).toMatchObject({ ok: true, via: "local" }));
  test("no token, no entry", () => expect(gate(local(), g)).toMatchObject({ ok: false, status: 401 }));
  test("a wrong token is refused", () => expect(gate(local({ authorization: "Bearer nope" }), g)).toMatchObject({ ok: false, status: 401 }));
  test("a browser page on 127.0.0.1 is refused even with the token", () =>
    expect(gate(local({ authorization: "Bearer secret-token", origin: "http://127.0.0.1:7788" }), g)).toMatchObject({ ok: false }));
  test("another host name is refused", () =>
    expect(gate(new Request("http://x/api", { headers: { host: "evil.example", authorization: "Bearer secret-token" } }), g)).toMatchObject({ ok: false, status: 421 }));
});

test("macOS: the caller's side of the exact connection, from nettop (Tailscale's extension runs as root)", async () => {
  const { darwinPids } = await import("./peer.ts");
  const listing = [
    "bun.87948,,", "tcp4 127.0.0.1:7788<->127.0.0.1:56078,Established,",
    "io.tailscale.ip.3083,,", "tcp4 127.0.0.1:56078<->127.0.0.1:7788,Established,",
    "curl.4000,,", "tcp4 127.0.0.1:56079<->127.0.0.1:7788,TimeWait,",
    // a name with a line break and a comma ("x\ni.3083,") posing as Tailscale's row, over its own pid 4242
    "x", "i.3083,.4242,,", "tcp4 127.0.0.1:56080<->127.0.0.1:7788,Established,",
  ].join("\n");
  const byPid: Record<string, string> = {
    "3083": "io.tailscale.ip.3083,,\ntcp4 127.0.0.1:56078<->127.0.0.1:7788,Established,",
    "4000": "curl.4000,,\ntcp4 127.0.0.1:56079<->127.0.0.1:7788,TimeWait,",
    "4242": "x\ni.3083,.4242,,\ntcp4 127.0.0.1:56080<->127.0.0.1:7788,Established,",
  };
  const run = (args: string[]) => (args[0] === "-p" ? byPid[args[1]] ?? "" : listing);
  expect(darwinPids(56078, 7788, run)).toEqual([3083]);
  expect(darwinPids(56079, 7788, run)).toEqual([]);
  expect(darwinPids(56080, 7788, run)).toEqual([]);
  expect(darwinPids(56078, 7788, () => "")).toEqual([]);
});

test("the caller of a real connection to this process is found to be this user (macOS: netstat saw nothing under bun)", async () => {
  const { peerUid } = await import("./peer.ts");
  let uid: number | null | undefined;
  const srv = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(req, s) { uid = peerUid(s.requestIP(req)!.port, s.port!); return new Response("ok"); } });
  try { await (await fetch(`http://127.0.0.1:${srv.port}/`)).text(); } finally { srv.stop(true); }
  expect(uid).toBe(process.getuid!());
});

describe("health's id only to this machine's callers (GitHub #635)", () => {
  test("the window on 127.0.0.1 by the service's port", () => expect(localCaller(local(), 7788)).toBe(true));
  test("not through tailscale serve", () => expect(localCaller(tailnet(), 7788)).toBe(false));
  test("not a tagged device's request through tailscale serve (the machine's name, no login)", () =>
    expect(localCaller(tailnet({ headers: { "tailscale-user-login": "" } }), 7788)).toBe(false));
  test("not a browser page", () => expect(localCaller(local({ origin: "http://127.0.0.1:7788" }), 7788)).toBe(false));
  test("not by another port", () => expect(localCaller(local(), 7790)).toBe(false));
});
