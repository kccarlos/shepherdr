import { describe, expect, test } from "bun:test";
import { refusedPage } from "./refused.ts";

describe("the refused page", () => {
  test("is html with the refusal's status and reason, escaped", async () => {
    const r = refusedPage(403, "not from <Tailscale>", "/nowhere");
    expect(r.status).toBe(403);
    expect(r.headers.get("content-type")).toContain("text/html");
    const html = await r.text();
    expect(html).toContain("this board only opens over Tailscale");
    expect(html).toContain("403 · not from &lt;Tailscale&gt;");
  });
});
