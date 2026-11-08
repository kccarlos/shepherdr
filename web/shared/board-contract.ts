// The board's data contract (contracts/board-data.md): each check returns the problems found, [] when the value fits.
type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => typeof v === 'string' && v !== ''
const int = (v: unknown) => Number.isInteger(v) && (v as number) >= 0
const cap = (n: number) => (x: unknown) => typeof x === 'string' && x.length <= n
const pct = (v: unknown) => v === null || (typeof v === 'number' && v >= 0 && v <= 100)

/** the shape check: each key's test, no key missing, none extra */
function shape(what: string, v: unknown, keys: Record<string, (x: unknown) => boolean>): string[] {
  if (!isObj(v)) return [`${what} is not an object`]
  const bad = Object.keys(keys).filter((k) => !keys[k](v[k])).map((k) => `${what}.${k} is wrong`)
  return bad.concat(Object.keys(v).filter((k) => !Object.hasOwn(keys, k)).map((k) => `${what}.${k} is not in the contract`))
}
const oneOf = (...a: string[]) => (x: unknown) => typeof x === 'string' && a.includes(x)
const orNull = (f: (x: unknown) => boolean) => (x: unknown) => x === null || f(x)
const sha = (x: unknown) => typeof x === 'string' && /^[0-9a-f]{40}$/.test(x)

const AGENT = { role: oneOf('worker', 'reviewer', 'verifier', 'checks'), cli: orNull(oneOf('claude', 'codex', 'agy')),
  model: orNull(str), address: str, parent: orNull(str), state: oneOf('working', 'idle', 'blocked', 'done', 'ended') }
const SIZE = { added: int, removed: int, limit: orNull(int) }
// contracts/gate-evidence.md; the reviews only for rounds herdr-task recorded
const EVIDENCE: Record<string, Record<string, (x: unknown) => boolean>> = {
  reviews: { round: int, head: sha, by: str, started_by: oneOf('herdr-task'), verdict: oneOf('pass', 'changes'),
    must_fix: int, report: cap(2000), at: int },
  checks: { sha, command: str, exit: Number.isInteger, output_tail: cap(4000), started_at: int, finished_at: int, by: str,
    ci: orNull((c) => isObj(c) && !shape('ci', c, { state: oneOf('success', 'failure', 'pending', 'none'), url: orNull(str) }).length) },
  verdicts: { sha, by: str, verdict: oneOf('pass', 'fail'), commands: (x) => Array.isArray(x) && x.every(str),
    output_tail: cap(4000), at: int },
}

/** the board's extra fields on a snapshot task row; the row's other keys are not checked here */
export function validateTask(t: unknown): string[] {
  if (!isObj(t)) return ['task is not an object']
  const out: string[] = []
  if (!Array.isArray(t.agents)) out.push('task.agents is not a list')
  else t.agents.forEach((a, i) => out.push(...shape(`agents[${i}]`, a, AGENT),
    ...(isObj(a) && (a.role === 'checks') !== (a.cli === null) ? [`agents[${i}].cli is null only for checks`] : [])))
  for (const [k, keys] of Object.entries(EVIDENCE)) {
    if (t[k] === undefined) continue
    if (!Array.isArray(t[k])) out.push(`task.${k} is not a list`)
    else (t[k] as unknown[]).forEach((r, i) => out.push(...shape(`${k}[${i}]`, r, keys),
      ...(k === 'reviews' && isObj(r) && ((r.round as number) < 1 || (r.verdict === 'pass' && r.must_fix !== 0)) ? [`reviews[${i}] round or must_fix is wrong`] : [])))
  }
  return out.concat(shape('size', t.size, SIZE))
}

export function validateAsk(a: unknown): string[] {
  const out = shape('ask', a, { id: str, question: str, options: (x) => Array.isArray(x) && x.length >= 2 && x.every(str) && new Set(x).size === x.length,
    recommend: str, task: orNull(str), terminal: orNull(str), answer: orNull(str), at: int })
  if (!out.length && !(a as Obj & { options: unknown[] }).options.includes((a as Obj).recommend)) out.push('ask.recommend is not one of options')
  return out
}

const POOLS = ['claude', 'codex', 'antigravity-gemini', 'antigravity-claude-gpt']
// unknown: both windows null; floor: a window at or under its floor (5 % in 5 hours, 1 % in the week); else ok
export function validatePool(p: unknown): string[] {
  const out = shape('pool', p, { pool: oneOf(...POOLS), five_hour_left: pct, week_left: pct, five_hour_reset: orNull(str),
    week_reset: orNull(str), state: oneOf('ok', 'floor', 'unknown') })
  if (out.length) return out
  const { five_hour_left: f, week_left: w, state } = p as { five_hour_left: number | null; week_left: number | null; state: string }
  const want = f === null && w === null ? 'unknown' : (f !== null && f <= 5) || (w !== null && w <= 1) ? 'floor' : 'ok'
  return state === want ? [] : [`pool.state should be ${want}`]
}

/** a design link among a task's `deliverables` from GET /api/deliverables */
export const validateLink = (l: unknown): string[] =>
  shape('link', l, { kind: oneOf('link'), title: str, url: (x) => typeof x === 'string' && /^https?:\/\//.test(x), at: int })
