import { describe, expect, test } from "bun:test";
import { NO_OWNERS, refusedPage } from "./refused.ts";

describe("the refused page", () => {
  test("is html with the refusal's status and reason, escaped", async () => {
    const r = refusedPage(403, "not from <Tailscale>", "/nowhere");
    expect(r.status).toBe(403);
    expect(r.headers.get("content-type")).toContain("text/html");
    const html = await r.text();
    expect(html).toContain("this board only opens over Tailscale");
    expect(html).toContain("403 · not from &lt;Tailscale&gt;");
  });
  test("a tagged machine with nobody set says which setting and the command (FAC-114)", async () => {
    const r = refusedPage(503, "tagged", "/nowhere", NO_OWNERS);
    expect(r.status).toBe(503);
    const html = await r.text();
    expect(html).toContain("service.owners");
    expect(html).toContain("shepherdr web owners you@example.com");
    expect(html).not.toContain("FAC-29");
  });
});
