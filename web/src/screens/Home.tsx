// The board's home on a desktop (docs/factory.md section 3; the approved canvas's "home" artboard): the box that tells
// the space's Assistant, the usage pools, the tasks by status, the asks, the agent tree and the deliverables that are
// new to look at. Its data is contracts/board-data.md's (snapshot tasks' agents, asks, usage) and GET api/deliverables.
// Where the canvas drew a dashed "needs: …" chip and the contract sends nothing, the chip stays.
import { useEffect, useState, type ReactNode } from 'react'
import { act, openArtifact, openTask, placeOf, setUI, useSnap, useUI } from '../kernel.ts'
import { GROUPS } from '../groups.ts'
import { machineName, type Snapshot, type Task } from '@shared/types.ts'
import { hhmm, tiles, type Pool } from '../board.ts'

export type Agent = { role: 'worker' | 'reviewer' | 'verifier' | 'checks'; cli: string | null; model: string | null; address: string; parent: string | null; state: string }
export type Ask = { id: string; question: string; options: string[]; recommend: string; task: string | null; answer: string | null; at: number }
type Card = { id: string; title: string; at: number; thumb: string | null }
type Link = { kind: 'link'; title: string; url: string; at: number }
export type Deliverables = { tasks: { ref: string; proof: { id: string } | null; deliverables: (Card | Link)[] }[]; agents: { ref: string; address: string; latest: Card }[] }

const agentsOf = (t: Task) => (t as Task & { agents?: Agent[] }).agents ?? []
/** the task's ref as herdr-task and api/deliverables say it (another machine's task id is "machine:REF") */
const refOf = (t: Task) => t.id.slice(t.id.lastIndexOf(':') + 1)
const live = (a: Agent) => a.state !== 'ended'
/** a task's workers, each with the agents it started (one nobody of them started goes under the first), while any is live */
function treeOf(t: Task) {
  const all = agentsOf(t), workers = all.filter((a) => a.role === 'worker')
  const mine = (w: Agent, a: Agent) => a.parent === w.address || (w === workers[0] && !workers.some((x) => x.address === a.parent))
  return workers.map((w) => ({ w, kids: all.filter((a) => a.role !== 'worker' && live(a) && mine(w, a)) })).filter((n) => live(n.w) || n.kids.length)
}
const who = (a: Agent) => [a.cli ?? 'checks', a.model].filter(Boolean).join(' ')
const STATE: Record<string, string> = { blocked: 'waiting for you' }
const DOT: Record<string, string> = { working: 'var(--sd-working)', blocked: 'var(--sd-blocked)', done: 'var(--sd-done)', idle: 'var(--sd-idle)' }
const STATUS_DOT: Partial<Record<Task['status'], string>> = { need: DOT.blocked, ready: DOT.done, merging: DOT.done, work: DOT.working }

const card = 'rounded-[var(--sd-radius)] border border-[var(--sd-line)] bg-[var(--sd-card)]'
const h2 = 'm-0 font-display text-lg font-semibold'
const muted = 'text-[13px] text-[var(--sd-muted)]'
const Needs = ({ children }: { children: ReactNode }) => (
  <span className="self-start rounded-full border border-dashed border-[var(--sd-dash)] px-[7px] text-[11px] text-[var(--sd-muted)]">needs: {children}</span>
)
const Dot = ({ c, s = 10 }: { c?: string; s?: number }) => <span aria-hidden className="inline-block flex-none rounded-full" style={{ width: s, height: s, background: c ?? DOT.idle }} />
const Chip = ({ children }: { children: ReactNode }) => <span className="rounded-[var(--sd-radius-xs)] bg-[var(--sd-code)] px-2 py-px text-xs text-[var(--sd-muted-on-fill)]">{children}</span>

export function Home() {
  const snap = useSnap() as Snapshot & { usage?: Pool[]; asks?: unknown }
  const placeId = useUI((u) => u.place)
  const offline = useUI((u) => !!u.offline)
  const place = placeOf(snap, placeId)
  const tasks = snap.tasks.filter((t) => !t.archived && t.place === place?.id)
  const asks = (Array.isArray(snap.asks) ? (snap.asks as Ask[]) : []).filter((a) => a.answer === null)
  const [dl, setDl] = useState<Deliverables[]>([])
  const folders = [...new Set(tasks.map((t) => t.taskFolder).filter((f): f is string => !!f))]
  const fresh = JSON.stringify([folders, tasks.map((t) => t.artifacts), (snap.artifacts ?? []).map((a) => a.v), place?.machine])
  useEffect(() => {
    let current = true
    const on = place?.machine ? `&on=${encodeURIComponent(place.machine)}` : ''
    Promise.all(folders.map((f) => fetch(`api/deliverables?folder=${encodeURIComponent(f)}${on}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)))
      .then((all) => current && setDl(all.filter(Boolean)))
    return () => { current = false }
  }, [fresh])
  const leave = () => setUI({ board: false })
  const latest = new Map(dl.flatMap((d) => d.agents).map((a) => [`${a.ref}:${a.address}`, a.latest]))
  const proofs = new Set(dl.flatMap((d) => d.tasks.map((t) => t.proof?.id)))
  const shown = dl.flatMap((d) => d.tasks.flatMap((t) => t.deliverables.map((x) => ({ ...x, ref: t.ref })))).sort((a, b) => b.at - a.at).slice(0, 6)
  const nodes = tasks.flatMap((t) => treeOf(t).map((n) => ({ t, ...n })))
  const running = nodes.reduce((n, x) => n + (live(x.w) ? 1 : 0) + x.kids.length, 0)
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--sd-bg)] text-[15px]/normal text-[var(--sd-fg)]">
      <div className="mx-auto box-border flex max-w-[1360px] flex-col gap-5 px-[clamp(16px,3vw,32px)] pt-5 pb-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <img src="icon.svg" alt="" className="size-8" />
            <span className="font-display text-xl/none font-bold tracking-[-0.01em]">sheepdog</span>
            <span className="font-display text-xl/none font-medium text-[var(--sd-muted)]">factory</span>
            <span className={`ml-2 inline-flex items-center gap-1.5 ${muted}`}>
              <Dot c={offline ? DOT.idle : DOT.done} s={8} />
              {offline ? 'not connected' : 'live'}{place ? ` · ${machineName(snap.machines, place.machine)}` : ''}
            </span>
          </div>
          <section aria-label="Usage pools" className="flex flex-wrap gap-2">
            {tiles(snap.usage ?? []).map((p) => (
              <div key={p.label} className={`flex min-w-[164px] flex-[1_1_164px] flex-col gap-[5px] rounded-[var(--sd-radius)] border border-[var(--sd-line)] bg-[var(--sd-card)] px-3 py-2`}>
                <div className="flex justify-between gap-2 text-xs whitespace-nowrap"><span className="font-medium">{p.label}</span><span className="tabular-nums">{p.left === null ? '' : `${p.left}% left`}</span></div>
                <div className="h-1 overflow-hidden rounded-full bg-[var(--sd-track)]"><div className="h-full rounded-full bg-[var(--sd-fg)]" style={{ width: `${p.left ?? 0}%` }} /></div>
                <span className="text-xs text-[var(--sd-muted)]">{p.note}</span>
              </div>
            ))}
          </section>
        </header>
        {place ? <Tell chat={place.chat} offline={offline} /> : null}
        <section aria-label="New to look at" className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-2.5"><h2 className="m-0 font-display text-xl font-semibold">new to look at</h2><span className={muted}>what agents made for you</span></div>
            <Needs>a seen mark per person</Needs>
          </div>
          {shown.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
              {shown.map((v) => {
                const link = 'kind' in v
                return (
                  <a key={link ? v.url : v.id} href={link ? v.url : `?artifact=${encodeURIComponent(v.id)}`} target={link ? '_blank' : undefined} rel="noreferrer"
                    onClick={link ? undefined : (e) => { e.preventDefault(); openArtifact(v.id) }}
                    className={`flex flex-col overflow-hidden ${card} text-[var(--sd-fg)] no-underline`}>
                    <div className="box-border flex h-32 items-center justify-center overflow-hidden border-b border-[var(--sd-line)] bg-[var(--sd-code)]">
                      {!link && v.thumb ? <img src={v.thumb} alt="" className="size-full object-cover" /> : <span className="px-3.5 font-display text-[15px] font-semibold">{v.title}</span>}
                    </div>
                    <div className="flex flex-col gap-[3px] px-3.5 pt-2.5 pb-3">
                      <div className="flex items-center gap-2 text-xs text-[var(--sd-muted)]">
                        <span>{link ? 'design' : proofs.has(v.id) ? 'proof' : 'artifact'} · {hhmm(v.at)}</span>
                        <span className="ml-auto font-mono">{v.ref}</span>
                      </div>
                      <span className="text-[15px]/snug font-medium">{v.title}</span>
                    </div>
                  </a>
                )
              })}
            </div>
          ) : <span className={muted}>Nothing new yet.</span>}
        </section>
        <div className="flex flex-wrap items-start gap-5">
          <main className="flex min-w-0 flex-[999_1_600px] flex-col gap-3.5">
            <h1 className="m-0 font-display text-2xl font-semibold">tasks</h1>
            {GROUPS.filter(([s]) => s !== 'done').map(([status, label]) => {
              const rows = tasks.filter((t) => t.status === status)
              if (!rows.length) return null
              return (
                <section key={status} aria-label={label} className="flex flex-col gap-1.5">
                  <div className="flex min-h-6 items-baseline gap-2">
                    <h2 className={`m-0 text-[13px] font-semibold tracking-[0.2px] uppercase ${status === 'need' ? 'text-[var(--sd-primary-text)]' : 'text-[var(--sd-muted)]'}`}>{label}</h2>
                    <span className={`${muted} tabular-nums`}>{rows.length}</span>
                  </div>
                  <div className={`flex flex-col overflow-hidden ${card} ${status === 'need' ? 'border-[var(--sd-blocked)]' : ''}`}>
                    {rows.map((t) => <Row key={t.id} t={t} />)}
                  </div>
                </section>
              )
            })}
            <div className="flex flex-wrap items-center gap-2 px-0.5 py-1">
              <button type="button" onClick={leave} className="min-h-11 cursor-pointer border-none bg-transparent p-0 text-sm text-[var(--sd-primary-text)]">
                {tasks.filter((t) => t.status === 'done').length} done · show them
              </button>
              <Needs>merged-today count</Needs>
            </div>
          </main>
          <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
            <section aria-label="Open asks" className={`flex flex-col gap-2.5 p-3.5 ${card}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className={h2}>asks for you</h2><span className="text-[13px] font-medium text-[var(--sd-primary-text)]">{asks.length} waiting</span></div>
              {asks.map((a) => (
                <div key={a.id} className="flex flex-col gap-2.5 rounded-[var(--sd-radius)] border-[1.5px] border-[var(--sd-blocked)] bg-[var(--sd-primary-soft)] px-3.5 py-3">
                  <div className="flex justify-between gap-2 text-xs whitespace-nowrap"><span><span className="font-mono">{a.task ?? 'Assistant'}</span> · asks</span><span className="tabular-nums">{Math.max(1, Math.round((Date.now() - a.at) / 60e3))} min</span></div>
                  <p className="m-0 text-[15px]/[1.4] font-medium">{a.question}</p>
                  <div className="flex flex-wrap gap-2">
                    {a.options.map((o) => (
                      <span key={o} className={`inline-flex min-h-11 items-center rounded-full bg-[var(--sd-card)] px-4 text-sm ${o === a.recommend ? 'border-[1.5px] border-[var(--sd-fg)] font-semibold' : 'border border-[var(--sd-line)] font-medium'}`}>{o}{o === a.recommend ? ' · recommended' : ''}</span>
                    ))}
                  </div>
                </div>
              ))}
              {asks.length ? <Needs>a way to answer here</Needs> : null}
            </section>
            <section aria-label="Agent tree" className={`flex flex-col gap-3 p-3.5 ${card}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className={h2}>agents</h2><span className={muted}>{running} running</span></div>
              <div className="flex items-center gap-2.5">
                <Dot c="var(--sd-thinking)" />
                <div className="flex flex-col"><span className="font-medium">Assistant</span>
                  <span className="text-xs text-[var(--sd-muted)]">{[place?.assistantTab?.cli, place?.assistantTab?.state].filter(Boolean).join(' · ') || 'plans and routes'}</span></div>
              </div>
              <ul className="m-0 ml-1 flex list-none flex-col gap-2.5 border-l border-[var(--sd-line)] py-0 pr-0 pl-3.5">
                {nodes.map(({ t, w, kids }) => {
                  const made = latest.get(`${refOf(t)}:${w.address}`)
                  return (
                    <li key={w.address} className="flex flex-col gap-1.5">
                      <div className="flex min-h-9 items-center gap-2.5">
                        <Dot c={DOT[w.state]} />
                        <div className="flex min-w-0 flex-auto flex-col">
                          <span className="text-sm"><span className="font-mono text-xs text-[var(--sd-muted)]">{t.id}</span> worker</span>
                          <span className="text-xs text-[var(--sd-muted)]">{who(w)} · {STATE[w.state] ?? w.state}</span>
                        </div>
                        {made?.thumb ? (
                          <a href={`?artifact=${encodeURIComponent(made.id)}`} onClick={(e) => { e.preventDefault(); openArtifact(made.id) }} aria-label={`Preview ${t.id}: ${made.title}`}
                            className="box-border h-11 w-16 flex-none overflow-hidden rounded-[var(--sd-radius-sm)] border border-[var(--sd-line)] bg-[var(--sd-code)]">
                            <img src={made.thumb} alt="" className="size-full object-cover" />
                          </a>
                        ) : null}
                      </div>
                      {kids.map((c) => (
                        <div key={c.address} className="ml-1 flex items-center gap-2.5 border-l border-dashed border-[var(--sd-dash)] pl-3.5">
                          <Dot c={DOT[c.state]} s={8} />
                          <span className="text-xs text-[var(--sd-muted)]">{[c.role, c.cli && who(c), STATE[c.state] ?? c.state].filter(Boolean).join(' · ')}</span>
                        </div>
                      ))}
                    </li>
                  )
                })}
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}

function Row({ t }: { t: Task }) {
  const agents = agentsOf(t)
  const worker = agents.find((a) => a.role === 'worker'), reviewer = agents.filter((a) => a.role === 'reviewer').at(-1)
  return (
    <button type="button" onClick={() => openTask(t.id)} className="flex min-h-11 w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 border-0 border-b border-[var(--sd-line)] bg-transparent px-3.5 py-2.5 text-left text-[var(--sd-fg)] last:border-b-0">
      <Dot c={STATUS_DOT[t.status]} s={8} />
      <div className="flex min-w-0 flex-[999_1_300px] flex-col gap-0.5">
        <div className="flex min-w-0 items-baseline gap-2"><span className="font-mono text-xs text-[var(--sd-muted)]">{t.id}</span><span className="text-[15px]/snug font-medium">{t.name}</span></div>
        {t.sub ? <span className={`text-[13px] ${t.status === 'need' ? 'text-[var(--sd-primary-text)]' : 'text-[var(--sd-muted)]'}`}>{t.sub}</span> : null}
      </div>
      <div className="flex flex-none flex-wrap items-center justify-end gap-1.5">
        {worker || t.agent || 'agents' in t ? <Chip>{worker ? who(worker) : (t.agent?.cli ?? 'not started')}</Chip> : null}
        {reviewer ? <Chip>review · {who(reviewer)}</Chip> : null}
        <span className={`min-w-11 text-right ${muted} tabular-nums`}>{t.left ?? ''}</span>
        {t.status === 'ready' ? <span className="inline-flex min-h-9 items-center rounded-full border border-[var(--sd-fg)] px-3.5 text-sm font-medium">Review</span> : null}
      </div>
    </button>
  )
}

/** the "tell the factory" box: what it says goes to the space's Assistant, as the chat's own box sends it */
function Tell({ chat, offline }: { chat: string; offline: boolean }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async () => {
    if (!text.trim() || offline || busy) return
    setBusy(true)
    const r = await act({ type: 'send', chat, text: text.trim(), human: true }).catch(() => null)
    setBusy(false)
    if (r) setText('')
  }
  const off = !text.trim() || offline || busy
  return (
    <section aria-label="Send a request" className="flex flex-col gap-2 rounded-[var(--sd-radius-lg)] border border-[var(--sd-line)] bg-[var(--sd-card)] p-3.5 shadow-soft">
      <div className="flex flex-wrap items-end gap-2.5">
        <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-1.5">
          <label htmlFor="board-ask" className="text-sm font-medium">tell the factory what you want</label>
          <textarea id="board-ask" rows={2} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }}
            placeholder="e.g. make the board show which model each worker runs"
            className="box-border w-full resize-none rounded-[var(--sd-radius)] border border-[var(--sd-line)] bg-[var(--sd-bg)] px-3.5 py-[11px] font-[inherit] text-[var(--sd-fg)] placeholder:text-[var(--sd-muted)]" />
        </div>
        <button type="button" disabled={off} onClick={send}
          className={`h-11 rounded-full border-none px-[22px] font-semibold ${off ? 'bg-[var(--sd-track)] text-[var(--sd-muted)]' : 'cursor-pointer bg-[var(--sd-primary)] text-[var(--sd-on-primary)]'}`}>Send</button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--sd-muted)]">
        <span>Goes to this space's Assistant. It plans the work and asks you only for decisions.</span>
        <Needs>which chat is the factory's Assistant</Needs>
      </div>
    </section>
  )
}
