// The board home's usage strip (screens/Home.tsx), apart from the screen so a test can run it: contracts/board-data.md's
// pools as the canvas draws them, one tile per window.
export type Pool = { pool: string; five_hour_left: number | null; week_left: number | null; five_hour_reset: string | null; week_reset: string | null; state: string }

const NAMES: Record<string, string> = { claude: 'claude', codex: 'codex', 'antigravity-gemini': 'gemini', 'antigravity-claude-gpt': 'antigravity' }
export const hhmm = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
/** when a window refills, as the canvas says it: a time today, else the weekday */
const when = (iso: string, now: number) => { const t = Date.parse(iso); return t - now < 20 * 3600e3 ? hhmm(t) : new Date(t).toLocaleDateString([], { weekday: 'long' }) }

/** one tile per pool's window that has one; an unknown pool says so once */
export function tiles(pools: Pool[], now = Date.now()) {
  return pools.flatMap((p) => {
    const name = NAMES[p.pool] ?? p.pool
    if (p.state === 'unknown') return [{ label: name, left: null as number | null, note: 'no usage info' }]
    return ([['5 hours', p.five_hour_left, p.five_hour_reset], ['week', p.week_left, p.week_reset]] as const)
      .filter(([, left]) => left !== null)
      .map(([w, left, reset]) => ({ label: `${name} · ${w}`, left, note: !reset ? '' : `${left === 0 ? 'empty until' : 'refills'} ${when(reset, now)}${p.state === 'floor' && left ? ' · at its floor' : ''}` }))
  })
}

