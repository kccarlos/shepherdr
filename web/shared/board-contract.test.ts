import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { validateAsk, validateLink, validatePool, validateTask } from './board-contract.ts'

// the examples are the contract's own JSON blocks, in the order they appear
const ex: any[] = [...readFileSync(new URL('../../contracts/board-data.md', import.meta.url), 'utf8').matchAll(/```json\n([\s\S]*?)```/g)]
  .map((m) => JSON.parse(m[1]))
const [agent, ask, pool, link] = ex
const H = 'a'.repeat(40)
const task = () => ({
  agents: [agent, { ...agent, role: 'checks', cli: null, state: 'blocked' }],
  reviews: [{ round: 1, head: H, by: 'term-7', started_by: 'herdr-task', verdict: 'pass', must_fix: 0, report: '', at: 1 }],
  checks: [{ sha: H, command: 'make', exit: 0, output_tail: 'OK', started_at: 1, finished_at: 2, by: 'term-9', ci: { state: 'success', url: null } }],
  verdicts: [{ sha: H, by: 'term-11', verdict: 'pass', commands: ['x'], output_tail: '', at: 3 }],
  size: { added: 4, removed: 1, limit: null },
})

test('the contract examples fit', () => {
  expect(ex.length).toBe(4)
  expect(validateTask({ agents: [agent], size: { added: 1, removed: 0, limit: 60 } })).toEqual([])
  expect(validateTask(task())).toEqual([])
  expect(validateAsk(ask)).toEqual([])
  expect(validatePool(pool)).toEqual([])
  expect(validateLink(link)).toEqual([])
})

test('a task row without evidence still fits; a wrong or extra key is named', () => {
  const { reviews, checks, verdicts, ...bare } = task()
  expect(validateTask(bare)).toEqual([])
  expect(validateTask({ ...task(), agents: [{ ...agent, role: 'boss', extra: 1 }] }))
    .toEqual(['agents[0].role is wrong', 'agents[0].extra is not in the contract'])
  expect(validateTask({ ...task(), reviews: [{ ...task().reviews[0], verdict: 'pass', must_fix: 1 }] })).toEqual(['reviews[0] round or must_fix is wrong'])
  expect(validateTask({ ...task(), reviews: [{ ...task().reviews[0], report: 'x'.repeat(2001) }] })).toEqual(['reviews[0].report is wrong'])
  expect(validateTask({ ...task(), size: { added: -1, removed: 0 } })).toEqual(['size.added is wrong', 'size.limit is wrong'])
})

test('asks, pools and links reject what does not fit', () => {
  expect(validateAsk({ ...ask, recommend: 'Maybe' })).toEqual(['ask.recommend is not one of options'])
  expect(validateAsk({ ...ask, options: ['Yes', 'Yes'] })).toEqual(['ask.options is wrong'])
  expect(validatePool({ ...pool, five_hour_left: 120, state: 'low' })).toEqual(['pool.five_hour_left is wrong', 'pool.state is wrong'])
  expect(validatePool({ ...pool, week_left: null })).toEqual([])  // a window may be absent (codex has only a weekly one)
  expect(validatePool({ ...pool, state: 'unknown' })).toEqual(['pool.state should be ok'])
  expect(validatePool({ ...pool, five_hour_left: null, week_left: 0, state: 'ok' })).toEqual(['pool.state should be floor'])
  expect(validatePool({ ...pool, five_hour_left: null, week_left: null, state: 'ok' })).toEqual(['pool.state should be unknown'])
  expect(validatePool({ ...pool, pool: 'gemini' })).toEqual(['pool.pool is wrong'])
  expect(validateTask({ ...task(), agents: [{ ...agent, cli: null }, { ...agent, role: 'checks' }] }))
    .toEqual(['agents[0].cli is null only for checks', 'agents[1].cli is null only for checks'])
  expect(validateTask({ ...task(), checks: [{ ...task().checks[0], exit: -9 }] })).toEqual([])
  expect(validateLink({ ...link, url: 'javascript:alert(1)' })).toEqual(['link.url is wrong'])
})
