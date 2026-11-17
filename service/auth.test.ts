import { describe, expect, test } from "bun:test";
import { allowed, gate, localCaller, ownersIn, OWNERS_COMMAND, OWNERS_SETTING, type Gate } from "./auth.ts";

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
  test("on another HTTPS port (GitHub #778), only that port's host and origin get in", () => {
    const g2: Gate = { ...g, httpsPort: 8443 };
    const at = (method = "GET", headers: Record<string, string> = {}) =>
      tailnet({ method, headers: { host: "box.tailnet.example:8443", ...headers } });
    expect(gate(at(), g2, false, true)).toMatchObject({ ok: true, via: "tailnet" });
    expect(gate(tailnet(), g2, false, true)).toMatchObject({ ok: false, status: 421 });
    expect(gate(tailnet({ headers: { host: "box.tailnet.example:443" } }), g2, false, true)).toMatchObject({ ok: false, status: 421 });
    expect(gate(at("POST", { origin: "https://box.tailnet.example:8443", "x-shepherdr": "1" }), g2, false, true)).toMatchObject({ ok: true });
    expect(gate(at("POST", { origin: "https://box.tailnet.example", "x-shepherdr": "1" }), g2, false, true)).toMatchObject({ ok: false, status: 403 });
    expect(gate(at("GET", { origin: "https://box.tailnet.example:8443" }), g2, true, true)).toMatchObject({ ok: true });
    expect(gate(at("GET", { origin: "https://box.tailnet.example:9443" }), g2, true, true)).toMatchObject({ ok: false, status: 403 });
  });
  test("443 set outright is the default: the bare name and :443 both get in", () => {
    const g443: Gate = { ...g, httpsPort: 443 };
    expect(gate(tailnet(), g443, false, true)).toMatchObject({ ok: true });
    expect(gate(tailnet({ headers: { host: "box.tailnet.example:443" } }), g443, false, true)).toMatchObject({ ok: true });
    expect(gate(tailnet({ headers: { host: "box.tailnet.example:8443" } }), g443, false, true)).toMatchObject({ ok: false, status: 421 });
  });
  test("cross-site and preflight requests are refused", () => {
    expect(gate(tailnet({ headers: { "sec-fetch-site": "cross-site" } }), g, false, true)).toMatchObject({ ok: false });
    expect(gate(tailnet({ method: "OPTIONS" }), g, false, true)).toMatchObject({ ok: false });
  });
  describe("a link from another site (GitHub #913, SHEP-191)", () => {
    // a top-level navigation: a link clicked in Slack or another site, a typed or bookmarked page
    const nav = { "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" };
    const page = (path: string, headers: Record<string, string> = {}, method = "GET") =>
      new Request(`http://box.tailnet.example${path}`, {
        method,
        headers: { host: "box.tailnet.example", "tailscale-user-login": "me@example.com", ...headers },
      });

    test("the owner's cross-site link opens the entry page", () => {
      expect(gate(page("/", nav), g, false, true)).toMatchObject({ ok: true, via: "tailnet" });
      expect(gate(page("/?task=abc", nav), g, false, true)).toMatchObject({ ok: true, via: "tailnet" });
      expect(gate(page("/shepherdr/", nav), g, false, true)).toMatchObject({ ok: true, via: "tailnet" });
    });
    test("the link still needs the owner, the host and Tailscale's connection", () => {
      expect(gate(page("/", { ...nav, "tailscale-user-login": "other@example.com" }), g, false, true)).toMatchObject({ ok: false, status: 403 });
      expect(gate(page("/", nav), g, false, false)).toMatchObject({ ok: false, status: 403 });
      expect(gate(page("/", { ...nav, host: "evil.example" }), g, false, true)).toMatchObject({ ok: false, status: 421 });
    });
    test("a cross-site API read is still refused, even as a navigation", () => {
      expect(gate(page("/api/me", nav), g, false, true)).toMatchObject({ ok: false, status: 403 });
      expect(gate(page("/shepherdr/api/me", nav), g, false, true)).toMatchObject({ ok: false, status: 403 });
    });
    test("a cross-site page that isn't a top-level navigation is refused", () => {
      const iframe = { ...nav, "sec-fetch-dest": "iframe" };
      expect(gate(page("/", iframe), g, false, true)).toMatchObject({ ok: false, status: 403 });
      const script = { "sec-fetch-site": "cross-site", "sec-fetch-mode": "no-cors", "sec-fetch-dest": "script" };
      expect(gate(page("/", script), g, false, true)).toMatchObject({ ok: false, status: 403 });
      const fetched = { "sec-fetch-site": "cross-site", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" };
      expect(gate(page("/", fetched), g, false, true)).toMatchObject({ ok: false, status: 403 });
    });
    test("a cross-site write is refused, even when it is a form's navigation", () => {
      expect(gate(page("/", { ...nav, origin: "https://evil.example", "x-shepherdr": "1" }, "POST"), g, false, true)).toMatchObject({ ok: false, status: 403 });
      expect(gate(page("/", { ...nav, origin: "https://box.tailnet.example", "x-shepherdr": "1" }, "POST"), g, false, true)).toMatchObject({ ok: false, status: 403 });
      expect(gate(page("/", { ...nav, origin: "https://box.tailnet.example", "x-shepherdr": "1" }, "PUT"), g, false, true)).toMatchObject({ ok: false, status: 403 });
    });
    test("a cross-site WebSocket is refused, even when it looks like a navigation", () => {
      expect(gate(page("/api/ws", nav), g, true, true)).toMatchObject({ ok: false, status: 403 });
      expect(gate(page("/api/ws", { "sec-fetch-site": "cross-site", "sec-fetch-mode": "websocket", "sec-fetch-dest": "empty", origin: "https://evil.example" }), g, true, true)).toMatchObject({ ok: false, status: 403 });
    });
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

test("macOS: netstat giving no socket table is said in the refusal, not a bare 'not from Tailscale' (GitHub #777)", async () => {
  const { netstatProblem } = await import("./peer.ts");
  expect(netstatProblem("Active Internet connections (including servers)\nProto Recv-Q", 0, "")).toBe(null);
  expect(netstatProblem("", 0, "")).toBe("netstat gave no socket table here (exit 0, no output)");
  expect(netstatProblem("", 1, "netstat: sysctl: net.inet.tcp.pcblist_n: Operation not permitted\n")).toContain("Operation not permitted");
  expect(netstatProblem("", null, "")).toContain("didn't run");
});

describe("health's id only to this machine's callers (GitHub #635)", () => {
  test("the window on 127.0.0.1 by the service's port", () => expect(localCaller(local(), 7788)).toBe(true));
  test("not through tailscale serve", () => expect(localCaller(tailnet(), 7788)).toBe(false));
  test("not a tagged device's request through tailscale serve (the machine's name, no login)", () =>
    expect(localCaller(tailnet({ headers: { "tailscale-user-login": "" } }), 7788)).toBe(false));
  test("not a browser page", () => expect(localCaller(local({ origin: "http://127.0.0.1:7788" }), 7788)).toBe(false));
  test("not by another port", () => expect(localCaller(local(), 7790)).toBe(false));
});

// A tagged Tailscale machine (FAC-114): no user owner, so only service.owners gets in, and with none set nobody does.
describe("a tagged machine (FAC-114)", () => {
  const tg: Gate = { ...g, owner: null, tagged: true, owners: ["me@example.com"] };
  const as = (login: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
    tailnet({ ...init, headers: { "tailscale-user-login": login, ...init.headers } });
  test("a configured owner gets in", () => expect(gate(as("me@example.com"), tg, false, true)).toMatchObject({ ok: true, who: "me@example.com", via: "tailnet" }));
  test("one of several configured owners gets in", () =>
    expect(gate(as("two@example.com"), { ...tg, owners: ["me@example.com", "two@example.com"] }, false, true)).toMatchObject({ ok: true }));
  test("another login is refused", () => expect(gate(as("other@example.com"), tg, false, true)).toMatchObject({ ok: false, status: 403 }));
  test("the tagged placeholders never get in", () => {
    for (const p of ["tagged-devices", "box.tailnet.example", ""]) expect(gate(as(p), tg, false, true)).toMatchObject({ ok: false });
  });
  test("a stale machine owner is ignored once tagged", () =>
    expect(gate(as("old@example.com"), { ...tg, owner: "old@example.com" }, false, true)).toMatchObject({ ok: false, status: 403 }));
  test("nothing configured: nobody gets in, with a 503 that names the setting and the command", () => {
    for (const owners of [[], undefined, ["", "  "]]) {
      const r = gate(as("me@example.com"), { ...tg, owners }, false, true);
      expect(r).toMatchObject({ ok: false, status: 503 });
      expect((r as any).why).toContain(OWNERS_SETTING);
      expect((r as any).why).toContain(OWNERS_COMMAND);
    }
  });
  test("the other checks still hold for a configured owner", () => {
    expect(gate(as("me@example.com"), tg, false, false)).toMatchObject({ ok: false, status: 403, why: "not from Tailscale" });
    expect(gate(as("me@example.com"), { ...tg, owners: [] }, false, false)).toMatchObject({ ok: false, status: 403, why: "not from Tailscale" });
    expect(gate(as("me@example.com", { headers: { host: "evil.example" } }), tg, false, true)).toMatchObject({ ok: false, status: 421 });
    expect(gate(as("me@example.com", { method: "POST", headers: { origin: "https://evil.example", "x-shepherdr": "1" } }), tg, false, true)).toMatchObject({ ok: false, status: 403 });
    expect(gate(as("me@example.com", { method: "POST", headers: { origin: "https://box.tailnet.example", "x-shepherdr": "1" } }), tg, false, true)).toMatchObject({ ok: true });
    expect(gate(as("me@example.com"), { ...tg, dns: null }, false, true)).toMatchObject({ ok: false, status: 503 });
  });
  test("closed (Funnel on: no owner, not tagged) stays shut whatever owners says", () =>
    expect(gate(as("me@example.com"), { ...tg, tagged: false }, false, true)).toMatchObject({ ok: false, status: 503, why: "Tailscale isn't running here" }));
  test("a request without the login header is still the local token's", () =>
    expect(gate(new Request("http://box.tailnet.example/api/me", { headers: { host: "box.tailnet.example" } }), tg, false, true)).toMatchObject({ ok: false, status: 421 }));
});

describe("an untagged machine with service.owners (FAC-114)", () => {
  test("the owner still gets in, and the named logins beside them", () => {
    const ug: Gate = { ...g, owners: ["two@example.com"] };
    expect(gate(tailnet(), ug, false, true)).toMatchObject({ ok: true, who: "me@example.com" });
    expect(gate(tailnet({ headers: { "tailscale-user-login": "two@example.com" } }), ug, false, true)).toMatchObject({ ok: true, who: "two@example.com" });
    expect(gate(tailnet({ headers: { "tailscale-user-login": "other@example.com" } }), ug, false, true)).toMatchObject({ ok: false, status: 403 });
  });
  test("with none set, only the owner, as before", () => {
    expect(allowed(g)).toEqual(["me@example.com"]);
    expect(allowed({ ...g, owner: null })).toEqual([]);
    expect(allowed({ ...g, owner: "me@example.com", tagged: true })).toEqual([]);
  });
});

describe("service.owners in the settings file", () => {
  test("a list, a string, commas and spaces; blanks and repeats dropped", () => {
    expect(ownersIn({ everywhere: { service: { owners: ["a@x.com", " b@x.com ", "", "a@x.com"] } } })).toEqual(["a@x.com", "b@x.com"]);
    expect(ownersIn({ everywhere: { service: { owners: "a@x.com, b@x.com c@x.com" } } })).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
  });
  test("missing or junk is none", () => {
    for (const s of [null, {}, { everywhere: {} }, { everywhere: { service: { owners: 3 } } }, { everywhere: { service: { owners: [1, null] } } }]) expect(ownersIn(s)).toEqual([]);
  });
});
