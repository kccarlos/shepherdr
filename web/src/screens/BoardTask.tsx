// The board's one-task page (the approved canvas's "one task · ready" artboard): its header with Accept, the verifier's
// verdict, review rounds, checks, proof, size and agents, from the snapshot's task row (contracts/board-data.md) and
// the proof's thumbnail from GET /api/deliverables. Accept opens today's Accept card. A link opens it: #board-task=<id>
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { Task } from '@shared/types.ts'
import { openArtifact, useStore } from '../kernel.ts'
import { openAccept, useAccepting } from './Accept.tsx'

type Agent = { role: string; cli: string | null; model: string | null; address: string; parent: string | null; state: string }
type Review = { round: number; head: string; by: string; verdict: 'pass' | 'changes'; must_fix: number; report: string; at: number }
type Check = { sha: string; command: string; exit: number; output_tail: string; by: string; ci: { state: string; url: string | null } | null }
type Verdict = { sha: string; by: string; verdict: 'pass' | 'fail'; commands: string[]; output_tail: string; at: number }
export type BoardTask = Task & { agents?: Agent[]; reviews?: Review[]; checks?: Check[]; verdicts?: Verdict[]; size?: { added: number; removed: number; limit: number | null } }

let open: string | null = null
const subs = new Set<() => void>()
const set = (id: string | null) => { open = id; for (const f of subs) f() }
export const openBoardTask = (id: string) => set(id)
const back = () => { set(null); if (location.hash.startsWith('#board-task=')) history.replaceState(null, '', location.pathname + location.search) }
const useOpen = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => open)

const STATUS: Record<string, [string, string]> = {
  ready: ['ready · waits for your Accept', 'done'], need: ['needs you', 'blocked'], work: ['working', 'working'],
  merging: ['merging', 'working'], done: ['done', 'done'],
}
const CI: Record<string, string> = { success: 'done', failure: 'danger' }
const card = 'flex flex-col gap-2.5 rounded-[var(--sd-radius)] border border-[var(--sd-line)] bg-[var(--sd-card)] p-3.5'
const h2 = 'm-0 font-display text-lg font-semibold'
const mono = 'font-mono text-xs text-[var(--sd-muted)]'
const muted = 'text-sm text-[var(--sd-muted)]'
const short = (sha: string) => sha.slice(0, 7)
const Tick = ({ ok }: { ok: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ok ? 'M5 12l5 5 9-10' : 'M6 6l12 12M18 6L6 18'} /></svg>
)
const Section = ({ label, heading, children, className = '' }: { label: string; heading?: string; children: ReactNode; className?: string }) => (
  <section aria-label={label} className={`${card} ${className}`}>{heading ? <h2 className={h2}>{heading}</h2> : null}{children}</section>
)
const Tail = ({ text }: { text: string }) => text ? (
  <details className="text-xs"><summary className="flex min-h-11 cursor-pointer items-center text-[var(--sd-muted)]">output</summary>
    <pre className="m-0 mt-1 max-h-60 overflow-auto whitespace-pre-wrap font-mono text-[var(--sd-fg)] [overflow-wrap:anywhere]">{text}</pre></details>
) : null

export function BoardTaskPage() {
  const id = useOpen()
  const t = useStore((s) => (id ? (s.snap?.tasks.find((x) => x.id === id) as BoardTask | undefined) : undefined))
  const accepting = useAccepting(id ?? '')
  const first = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLDivElement>(null)
  // the keyboard stays on the page while nothing is over it: it starts on the back link, Tab wraps, Escape closes; then
  // the focus goes back where it was
  useEffect(() => {
    if (!id || !t) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    first.current?.focus({ preventScroll: true })
    const key = (e: KeyboardEvent) => {
      const el = box.current
      if (!el || [...document.querySelectorAll('[aria-modal=true]')].some((d) => d !== el)) return
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); back() }
      if (e.key !== 'Tab') return
      const all = [...el.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), summary')]
      const at = all.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey ? at <= 0 : at < 0 || at === all.length - 1) { e.preventDefault(); all.at(e.shiftKey ? -1 : 0)?.focus() }
    }
    addEventListener('keydown', key, true)
    return () => { removeEventListener('keydown', key, true); if (opener?.isConnected) opener.focus({ preventScroll: true }) }
  }, [id, !t])
  const [proof, setProof] = useState<{ title: string; thumb?: string | null } | null>(null)
  useEffect(() => {
    setProof(null)
    if (!t?.taskFolder || !t.proof) return
    let gone = false
    const ref = t.id.slice(t.id.indexOf(':') + 1)
    fetch(`api/deliverables?folder=${encodeURIComponent(t.taskFolder)}&on=${encodeURIComponent(t.on)}`).then((r) => r.json())
      .then((d) => !gone && setProof(d.tasks?.find((x: { ref: string }) => x.ref === ref)?.proof ?? null), () => {})
    return () => { gone = true }
  }, [t?.id, t?.taskFolder, t?.proof, t?.on])
  if (!id || !t) return null

  const agent = (role: string) => t.agents?.filter((a) => a.role === role).at(-1)
  const named = (a?: Agent) => (a ? [a.cli, a.model].filter(Boolean).join(' · ') : 'none yet')
  const byAddr = (addr: string) => t.agents?.find((a) => a.address === addr)
  const [word, tone] = STATUS[t.status] ?? [t.status, 'idle']
  // only the latest head's checks: herdr-task adds a run for each head it checks
  const rounds = t.reviews ?? [], checks = (t.checks ?? []).filter((c) => c.sha === t.checks?.at(-1)?.sha), v = t.verdicts?.at(-1), size = t.size
  const total = size ? size.added + size.removed : 0
  const over = !!size && size.limit !== null && total > size.limit
  const last = rounds.at(-1)
  const failing = checks.filter((c) => c.exit !== 0 || c.ci?.state === 'failure').length

  return (
    <div ref={box} role="dialog" aria-modal="true" aria-label={`${t.id} ${t.name}`}
      className="absolute inset-0 z-7 overflow-y-auto bg-[var(--sd-bg)] text-[15px] text-[var(--sd-fg)]">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-5 px-[clamp(16px,3vw,32px)] pt-[max(1rem,env(safe-area-inset-top))] pb-12">
        <button ref={first} type="button" onClick={back} className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm text-[var(--sd-primary-text)] hover:text-[var(--sd-fg)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>board
        </button>
        <header className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-[var(--sd-muted)]">
            <span className="font-mono">{t.id}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium" style={{ background: `var(--sd-${tone}-soft, var(--sd-track))`, color: `var(--sd-${tone === 'blocked' ? 'blocked-text' : tone})` }}>
              <span aria-hidden="true" className="size-2 rounded-full" style={{ background: `var(--sd-${tone})` }} />{word}
            </span>
            {t.pr ? <a href={t.pr.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-[var(--sd-muted)]">PR #{t.pr.number}{t.base ? ` into ${t.base}` : ''}</a> : null}
          </div>
          <h1 className="m-0 font-display text-[32px]/[1.2] font-semibold">{t.name}</h1>
          {t.summary ? <p className="m-0 max-w-[720px] text-[var(--sd-muted)]">{t.summary}</p> : null}
          <div className="mt-1 flex flex-wrap gap-2">
            {t.status === 'ready' ? (
              <button type="button" disabled={accepting || t.accepting} onClick={() => openAccept(t.id)} className="h-11 rounded-full bg-[var(--sd-primary)] px-6 font-semibold text-[var(--sd-on-primary)] disabled:opacity-60">
                {accepting || t.accepting ? 'Accepting…' : 'Accept and merge'}
              </button>
            ) : null}
            {t.proof ? <button type="button" onClick={() => openArtifact(t.proof!)} className="inline-flex h-11 items-center px-3 text-[var(--sd-primary-text)] hover:text-[var(--sd-fg)]">open the proof</button> : null}
          </div>
        </header>

        <div className="flex flex-wrap items-start gap-5">
          <main className="flex min-w-0 flex-[999_1_540px] flex-col gap-4">
            <Section label="Verdict" className="!flex-row flex-wrap items-center !gap-x-3.5">
              <span aria-hidden="true" className="grid size-7 flex-none place-items-center rounded-full" style={{ background: v ? `var(--sd-${v.verdict === 'pass' ? 'done' : 'danger'}-${v.verdict === 'pass' ? 'soft' : 'bg'})` : 'var(--sd-track)', color: v ? `var(--sd-${v.verdict === 'pass' ? 'done' : 'danger'})` : 'var(--sd-muted)' }}>{v ? <Tick ok={v.verdict === 'pass'} /> : null}</span>
              <div className="flex min-w-0 flex-[999_1_300px] flex-col gap-0.5">
                <h2 className="m-0 text-[15px] font-semibold">{v ? `verdict: ${v.verdict === 'pass' ? 'passed' : 'failed'} on ${short(v.sha)}` : 'verdict: none yet'}</h2>
                <span className="text-[13px] text-[var(--sd-muted)]">
                  {[rounds.length ? `${rounds.length} review round${rounds.length > 1 ? 's' : ''}, the last ${last!.verdict === 'pass' ? 'with nothing to fix' : `with ${last!.must_fix} to fix`}` : 'no review rounds yet',
                    checks.length ? (failing ? `${failing} check${failing > 1 ? 's' : ''} failing` : checks.some((c) => c.ci?.state === 'pending') ? 'CI pending' : 'all checks pass') : 'no checks yet',
                    over ? 'over the size limit' : ''].filter(Boolean).join(' · ')}
                </span>
                {v?.commands.length ? <span className={`${mono} [overflow-wrap:anywhere]`}>$ {v.commands.join(' · ')}</span> : null}
                {v ? <Tail text={v.output_tail} /> : null}
              </div>
            </Section>

            <Section label="Review rounds" heading="review rounds">
              {rounds.length ? (
                <ol className="m-0 flex list-none flex-col p-0">
                  {rounds.map((r, i) => (
                    <li key={`${r.round}-${r.head}`} className={`flex gap-3 py-2.5 ${i < rounds.length - 1 ? 'border-b border-[var(--sd-line)]' : ''}`}>
                      <span aria-hidden="true" className="mt-[7px] size-2.5 flex-none rounded-full" style={{ background: `var(--sd-${r.verdict === 'pass' ? 'done' : 'blocked'})` }} />
                      <div className="flex min-w-0 flex-auto flex-col gap-0.5">
                        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                          <span className="font-medium">round {r.round}</span>
                          <span className="text-[13px] font-medium" style={{ color: `var(--sd-${r.verdict === 'pass' ? 'done' : 'primary-text'})` }}>{r.verdict === 'pass' ? 'clean' : 'changes asked'}</span>
                        </div>
                        <span className={`${muted} whitespace-pre-line [overflow-wrap:anywhere]`}>{r.verdict === 'changes' ? `${r.must_fix} to fix${r.report ? ': ' : ''}` : ''}{r.report || (r.verdict === 'pass' ? 'No findings.' : '')}</span>
                        <span className={mono}>{short(r.head)} · {named(byAddr(r.by)) === 'none yet' ? r.by : named(byAddr(r.by))}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : <p className={`m-0 ${muted}`}>No review rounds yet.</p>}
            </Section>

            <Section label="Checks" heading="checks">
              {checks.length ? checks.map((c, i) => (
                <div key={i} className="flex flex-col gap-1 rounded-[var(--sd-radius-sm)] bg-[var(--sd-code)] px-3 py-2">
                  <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                    <span className="font-mono text-[13px] [overflow-wrap:anywhere]">{c.command}</span>
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium" style={{ color: `var(--sd-${c.exit === 0 ? 'done' : 'danger'})` }}>
                      <Tick ok={c.exit === 0} />{c.exit === 0 ? 'passed' : `failed · exit ${c.exit}`}
                      {c.ci ? (c.ci.url ? <a href={c.ci.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center" style={{ color: `var(--sd-${CI[c.ci.state] ?? 'muted'})` }}>· CI {c.ci.state}</a> : <span style={{ color: `var(--sd-${CI[c.ci.state] ?? 'muted'})` }}>· CI {c.ci.state}</span>) : null}
                    </span>
                  </div>
                  <Tail text={c.output_tail} />
                </div>
              )) : <p className={`m-0 ${muted}`}>No checks yet.</p>}
            </Section>
          </main>

          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
            <Section label="Proof" heading="proof">
              {t.proof ? (
                <>
                  {proof?.thumb ? <button type="button" aria-label={proof.title} onClick={() => openArtifact(t.proof!)} className="overflow-hidden rounded-[var(--sd-radius-sm)] border border-[var(--sd-line)] bg-[var(--sd-code)] p-0"><img src={proof.thumb} alt="" className="block max-h-56 w-full object-cover object-top" /></button> : null}
                  <button type="button" onClick={() => openArtifact(t.proof!)} className="inline-flex min-h-11 items-center self-start text-left text-[var(--sd-primary-text)] hover:text-[var(--sd-fg)]">{proof?.title ?? t.proof}</button>
                </>
              ) : <p className={`m-0 ${muted}`}>No proof yet.</p>}
            </Section>

            <Section label="Size" heading="size" className="!gap-2">
              {size ? (
                <>
                  <div className="flex items-baseline gap-2"><span className="font-display text-[30px] font-semibold tabular-nums">{total}</span>
                    <span className={muted}>lines changed{size.limit !== null ? ` · brief said about ${size.limit}` : ''}</span></div>
                  {size.limit ? (
                    <div className="relative h-1.5 rounded-full bg-[var(--sd-track)]">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (total / size.limit) * 100)}%`, background: `var(--sd-${over ? 'blocked' : 'done'})` }} />
                      {over ? <span aria-hidden="true" className="absolute -top-1 h-3.5 w-0.5 bg-[var(--sd-fg)]" style={{ left: `${(size.limit / total) * 100}%` }} /> : null}
                    </div>
                  ) : null}
                  {over ? <p className="m-0 text-sm font-medium text-[var(--sd-primary-text)]">Over the limit.</p> : null}
                  <p className={`m-0 text-[13px] text-[var(--sd-muted)] tabular-nums`}>+{size.added} −{size.removed}</p>
                </>
              ) : <p className={`m-0 ${muted}`}>Not known yet.</p>}
            </Section>

            <Section label="Who worked on it" heading="agents" className="!gap-2">
              {(['worker', 'reviewer', 'verifier'] as const).map((role) => (role === 'verifier' && !agent(role) ? null : (
                <div key={role} className="flex justify-between gap-2 text-sm"><span>{role}</span><span className="text-[var(--sd-muted)]">{named(agent(role))}</span></div>
              )))}
            </Section>
          </aside>
        </div>
      </div>
    </div>
  )
}

// A link straight to a task's page: #board-task=<task id>
function fromLink(hash: string) {
  const m = /^#board-task=(.+)$/.exec(hash)
  if (m) set(decodeURIComponent(m[1]))
}
if (typeof window !== 'undefined') {
  fromLink((window as { shepherdrLink?: string }).shepherdrLink ?? '')
  addEventListener('hashchange', () => fromLink(location.hash))
}
