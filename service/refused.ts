import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The refused page (the design canvas's error artboard): one self-contained document, since the page's own files are
 *  refused too. Only the body of the answer; the check that refuses stays in auth.ts. */
export function refusedPage(status: number, why: string, web: string): Response {
  const png = join(web, "mascot/alert.png");
  const img = existsSync(png) ? `<img alt="The sheepdog with its head tilted, unsure" src="data:image/png;base64,${readFileSync(png).toString("base64")}">` : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not allowed from here · Shepherdr</title><style>
:root{color-scheme:light dark;--bg:#FAF8F3;--fg:#1F1F22;--muted:#6B6E75;--line:#E4E0D7;--code:#F1EEE7;--danger:#B42318;--danger-bg:#FEF3F2;--danger-line:#F4C7C3}
@media(prefers-color-scheme:dark){:root{--bg:#16181C;--fg:#F5F2EA;--muted:#A3A7AF;--line:#2E3138;--code:#26292F;--danger:#F26B5B;--danger-bg:#2A1C1C;--danger-line:#5A2A2A}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 Inter,system-ui,-apple-system,sans-serif}
main{max-width:1000px;margin:0 auto;padding:48px clamp(16px,3vw,32px);display:flex;flex-wrap:wrap;align-items:center;gap:32px}
img{width:240px;max-width:100%;height:auto}section{flex:1 1 360px;display:flex;flex-direction:column;gap:14px;align-items:flex-start}
.chip{padding:2px 10px;background:var(--danger-bg);border:1px solid var(--danger-line);border-radius:999px;font-size:13px;font-weight:500;color:var(--danger)}
h1{margin:0;font:600 32px/1.2 Outfit,Inter,system-ui,sans-serif}p{margin:0;max-width:520px;color:var(--muted)}h2{margin:0;font-size:15px}ol{margin:0;padding-left:20px}
a.b{display:inline-flex;align-items:center;min-height:44px;padding:0 18px;border:1px solid var(--fg);border-radius:999px;color:var(--fg);font-weight:500;text-decoration:none}
details{padding:10px 14px;background:var(--code);border-radius:8px;font-size:14px}summary{cursor:pointer;font-weight:500}code{display:block;margin-top:8px;font:12px ui-monospace,Menlo,monospace;color:var(--muted)}
</style></head><body><main>${img}<section><span class="chip">not allowed from here</span><h1>this board only opens over Tailscale</h1>
<p>Shepherdr couldn't tell that this connection came from your tailnet, so it showed nothing. Your work is safe; only this page was refused.</p>
<h2>try this</h2><ol><li>Open the board from another device that's signed in to Tailscale.</li><li>On the Mac mini itself, this is a known problem the factory is fixing (FAC-29).</li></ol>
<a class="b" href="">Try again</a>
<details><summary>details for whoever fixes it</summary><code>${status} · ${esc(why)}</code></details></section></main></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
