// A folder's deliverables for the board (docs/factory.md section 3, "deliverable previews bubble up"): each task's
// artifacts as its Artifacts tab finds them (core/task-artifacts.js), its proof first, each with its newest version and
// that version's first picture as its thumbnail; and each of its agents' latest: the newest one that agent's own
// terminal published while it ran, else the task's newest. Read only, from what the service already holds.

const IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i;

// core/task-artifacts.js byAgent: a version its agent published while it ran (a minute's slack either side)
const byAgent = (g: any, v: any) => !!g?.address && v?.publisher === g.address
  && (v.at ?? 0) >= (g.at ?? 0) - 60000 && (!g.ended || (v.at ?? 0) <= g.ended + 60000);

/** An artifact as the board shows it: its newest version, and that version's first picture (by file name). */
function card(a: any) {
  const pic = (Array.isArray(a.files) ? a.files : []).find((f: unknown) => typeof f === "string" && IMAGE.test(f));
  const on = a.machine ? `&on=${encodeURIComponent(a.machine)}` : "";
  return {
    id: a.id, title: a.title ?? a.id, version: a.version, at: a.at ?? 0,
    thumb: pic ? `api/artifacts/${encodeURIComponent(a.id)}/file/${pic.split("/").map(encodeURIComponent).join("/")}?v=${a.version}${on}` : null,
  };
}

/** rows: the service's task rows (service/model.ts); arts: herdr-artifact's records; ids(row): its artifacts, proof first. */
export function deliverables(rows: any[], arts: any[], folder: string, machine: string | null, ids: (row: any) => string[]) {
  const here = new Map(arts.filter((a) => (a?.machine ?? null) === machine).map((a) => [a.id, a]));
  const tasks: any[] = [], agents: any[] = [];
  for (const r of rows) {
    if (r.folder !== folder || (r.machine ?? null) !== machine) continue;
    const mine = ids(r).map((id) => here.get(id)).filter(Boolean);
    const proof = r.proof ? here.get(r.proof) : null;
    tasks.push({
      ref: r.ref, title: r.title,
      proof: r.proof ? { id: r.proof, title: r.proofTitle ?? proof?.title ?? r.proof, ...(proof ? { version: proof.version, thumb: card(proof).thumb } : {}) } : null,
      deliverables: mine.map(card),
    });
    if (!mine.length) continue;
    const newest = [...mine].sort((x, y) => (y.at ?? 0) - (x.at ?? 0))[0];
    for (const g of r.agents ?? []) {
      // its own newest version among the task's artifacts
      let own: any = null, at = -1;
      for (const a of mine) for (const v of a.versions ?? []) if (byAgent(g, v) && (v.at ?? 0) > at) { own = a; at = v.at ?? 0; }
      agents.push({ ref: r.ref, address: g.address, at: g.at ?? 0, by: own ? "agent" : "task", latest: card(own ?? newest) });
    }
  }
  return { folder, machine, tasks, agents };
}
