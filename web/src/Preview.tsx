// The board's deliverable preview (the canvas's "preview" artboard): one deliverable large, who made it, a way back.
// B2 and B3 open it with previewUrl(...) (main.tsx draws this screen for such an address). Data: GET api/deliverables
// (contracts/board-data.md) and the artifact endpoints; a recipe is drawn by Recipe.tsx, a picture as itself, a design
// link as a card that opens it.
import { useEffect, useReducer, useState } from 'react'
import { ArrowUpRightIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/16/solid'
import { Recipe, UNREADABLE } from './screens/Recipe.tsx'
import { itemsOf, type Deliverables, type Item } from './preview-items.ts'
import * as R from '@core/recipe.js'

const { withIds } = R as any

/** the address of a deliverable's preview: key is an artifact's id, or a link's url */
export const previewUrl = (key: string, folder: string, on?: string | null) =>
  `?${new URLSearchParams({ preview: key, folder, ...(on ? { on } : {}) })}`

const card = 'flex flex-col gap-2.5 rounded-[var(--sd-radius)] border border-[var(--sd-line)] bg-[var(--sd-card)] p-3.5'
const chip = 'text-[0.75rem] text-[var(--sd-muted)]'
const mono = 'font-mono text-[0.75rem] text-[var(--sd-muted)]'

function Body({ it, on }: { it: Item; on: string }) {
  const [recipe, setRecipe] = useState<{ blocks: unknown[] } | null>(null)
  const [bad, setBad] = useState(false)
  const base = it.id ? `api/artifacts/${encodeURIComponent(it.id)}` : ''
  useEffect(() => {
    setRecipe(null); setBad(false)
    if (!it.id) return
    let gone = false
    fetch(`${base}/recipe?v=${it.version}${on}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error('gone'))))
      .then((r) => !gone && setRecipe(withIds(r)), () => !gone && setBad(true))
    return () => { gone = true }
  }, [it.key, on])
  if (it.url) return <a href={it.url} target="_blank" rel="noopener noreferrer" className={`${card} text-[var(--sd-fg)] no-underline`}>
    <span className="inline-flex items-center gap-1.5 text-[0.8125rem] text-[var(--sd-primary-text)]">opens on {new URL(it.url).host || it.url}<ArrowUpRightIcon aria-hidden className="size-3.5" /></span>
    <span className={chip}>A design can't be shown here; only people it's shared with can open it.</span>
  </a>
  if (recipe) return <Recipe recipe={recipe} asset={(s) => `${base}/file/${s.split('/').map(encodeURIComponent).join('/')}?v=${it.version}${on}`} />
  if (bad && it.thumb) return <img src={it.thumb} alt={it.title} className="h-auto max-w-full self-start rounded-[var(--sd-radius)] border border-[var(--sd-line)]" />
  return <p className="text-[var(--sd-muted)]">{bad ? UNREADABLE : 'Loading…'}</p>
}

export function Preview({ id: first, folder, on }: { id: string; folder: string; on: string | null }) {
  const [id, setId] = useState(first)
  const [, resized] = useReducer((n: number) => n + 1, 0)
  useEffect(() => { addEventListener('resize', resized); return () => removeEventListener('resize', resized) }, [])
  const [d, setD] = useState<Deliverables | null | false>(null)
  useEffect(() => {
    fetch(`api/deliverables?${new URLSearchParams({ folder, ...(on ? { on } : {}) })}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error('gone'))))
      .then(setD, () => setD(false))
  }, [folder, on])
  const back = () => (history.length > 1 ? history.back() : location.assign(location.pathname))
  const items = d ? itemsOf(d) : []
  const n = items.findIndex((x) => x.key === id), it = items[n]
  const open = (key: string) => { history.replaceState(null, '', previewUrl(key, folder, on)); setId(key) }
  const arrow = 'flex size-11 items-center justify-center rounded-[var(--sd-radius-md)] text-[var(--sd-fg)] disabled:opacity-40'
  const agent = it && d ? d.agents.find((a) => it.id && a.by === 'agent' && a.ref === it.ref && a.latest.id === it.id) : null
  return (
    <div data-device={innerWidth < 640 ? 'phone' : 'desktop'} className="h-full overflow-y-auto bg-[var(--sd-bg)] font-[var(--sd-font-ui)] text-[0.9375rem] text-[var(--sd-fg)]">
      <nav aria-label="Preview" className="flex items-center justify-between gap-4 border-b border-[var(--sd-line)] bg-[var(--sd-card)] px-4 py-2 sm:px-8">
        <button type="button" onClick={back} className="inline-flex min-h-11 items-center gap-1.5 text-[0.875rem] text-[var(--sd-primary-text)]"><ChevronLeftIcon aria-hidden className="size-4" />board</button>
        {it ? <div className={`flex items-center gap-1 ${chip}`}>
          <button type="button" aria-label="Previous item" disabled={n < 1} onClick={() => open(items[n - 1].key)} className={arrow}><ChevronLeftIcon aria-hidden className="size-4.5" /></button>
          <span className="tabular-nums">{n + 1} of {items.length}</span>
          <button type="button" aria-label="Next item" disabled={n >= items.length - 1} onClick={() => open(items[n + 1].key)} className={arrow}><ChevronRightIcon aria-hidden className="size-4.5" /></button>
        </div> : null}
      </nav>
      {!it ? <p className="p-8 text-[var(--sd-muted)]">{d === null ? 'Loading…' : d === false ? "Can't reach the board's deliverables." : 'This deliverable is gone.'}</p> : (
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-start gap-6 px-4 pt-5 pb-12 sm:px-8">
          <main className="flex min-w-0 flex-[999_1_600px] flex-col gap-4.5">
            <header className="flex flex-col gap-1.5">
              <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 text-[0.8125rem] text-[var(--sd-muted)]`}>
                <span>{it.url ? 'design' : 'artifact'}</span><span className={mono}>{it.ref}</span>
                <time>{new Date(it.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
              </div>
              <h1 className="font-[var(--sd-font-display)] text-[1.75rem]/[1.2] font-semibold">{it.title}</h1>
            </header>
            <Body it={it} on={d && d.machine ? `&on=${encodeURIComponent(d.machine)}` : ''} />
          </main>
          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
            <section aria-label="Made by" className={card}>
              <h2 className="font-[var(--sd-font-display)] text-[1.125rem] font-semibold">made by</h2>
              <span><span className={mono}>{it.ref}</span> {agent ? `agent ${agent.address}` : 'its task'}</span>
              <a href={`?task=${encodeURIComponent(it.ref)}`} className="inline-flex min-h-11 items-center text-[var(--sd-primary-text)] no-underline">open the task · {it.task}</a>
            </section>
            {items.length > 1 ? <section aria-label="Next" className="flex flex-col gap-2.5">
              <h2 className="text-[0.8125rem] font-semibold tracking-wide text-[var(--sd-muted)] uppercase">next</h2>
              {items.filter((x) => x.key !== it.key).slice(0, 2).map((x) => (
                <a key={x.key} href={previewUrl(x.key, folder, on)} onClick={(e) => { e.preventDefault(); open(x.key) }} className={`${card} gap-1 text-[var(--sd-fg)] no-underline`}>
                  <span className={`flex gap-2 ${chip}`}><span>{x.url ? 'design' : 'artifact'}</span><span className={`ml-auto ${mono}`}>{x.ref}</span></span>
                  <span className="font-medium">{x.title}</span>
                </a>))}
            </section> : null}
          </aside>
        </div>
      )}
    </div>
  )
}
