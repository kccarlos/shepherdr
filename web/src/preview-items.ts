// The deliverables a preview steps through (Preview.tsx), from GET api/deliverables (contracts/board-data.md).
import { validateLink } from '../shared/board-contract.ts'

export type Item = { key: string; title: string; at: number; ref: string; task: string; id?: string; version?: number; thumb?: string | null; url?: string }
export type Deliverables = { machine?: string | null; tasks: { ref: string; title: string; deliverables: any[] }[]; agents: { ref: string; address: string; by: string; latest: { id: string } }[] }

/** every task's deliverables, newest first, once each by key; a link must fit the contract and be http(s) (a link has no id: its url is its key) */
export function itemsOf(d: Deliverables): Item[] {
  const seen = new Set<string>()
  return d.tasks.flatMap((t) => t.deliverables
    .filter((x) => (x.kind === 'link' ? !validateLink(x).length && !!URL.parse(x.url)?.host : x.kind === undefined && typeof x.id === 'string'))
    .map((x) => ({ ...x, url: x.kind === 'link' ? x.url : undefined, key: x.kind === 'link' ? x.url : x.id, ref: t.ref, task: t.title })))
    .sort((a, b) => b.at - a.at).filter((x) => !seen.has(x.key) && seen.add(x.key))
}
