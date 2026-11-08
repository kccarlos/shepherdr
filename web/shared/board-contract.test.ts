import { expect, test } from 'bun:test'
import { validateAsk, validateLink, validatePool, validateTask } from './board-contract.ts'

const H = 'a'.repeat(40)
const task = () => ({
  agents: [{ role: 'reviewer', cli: 'agy', model: null, address: 'term-7', parent: 'term-3', state: 'working' }],
  reviews: [{ round: 1, head: H, by: 'term-7', started_by: 'herdr-task', verdict: 'pass', must_fix: 0, report: 'No findings.', at: 1 }],
  checks: [{ sha: H, command: 'make', exit: 0, output_tail: 'OK', started_at: 1, finished_at: 2, by: 'term-9', ci: { state: 'success', url: null } }],
  verdicts: [{ sha: H, by: 'term-11', verdict: 'pass', commands: ['x'], output_tail: '', at: 3 }],
  size: { added: 4, removed: 1, limit: null },
})
const ask = () => ({ id: 'a1', question: 'Ship?', options: ['Yes', 'No'], recommend: 'Yes', task: null, terminal: 't', answer: null, at: 1 })
const pool = () => ({ pool: 'claude', five_hour_left: 80, week_left: null, five_hour_reset: null, week_reset: null, state: 'unknown' })

test('the contract examples fit', () => {
  expect(validateTask(task())).toEqual([])
  expect(validateAsk(ask())).toEqual([])
  expect(validatePool(pool())).toEqual([])
  expect(validateLink({ kind: 'link', title: 'Canvas', url: 'https://claude.ai/x', at: 1 })).toEqual([])
})

test('a task row without evidence still fits; a wrong or extra key is named', () => {
  const { reviews, checks, verdicts, ...bare } = task()
  expect(validateTask(bare)).toEqual([])
  expect(validateTask({ ...task(), agents: [{ ...task().agents[0], role: 'boss', extra: 1 }] }))
    .toEqual(['agents[0].role is wrong', 'agents[0].extra is not in the contract'])
  expect(validateTask({ ...task(), reviews: [{ ...task().reviews[0], verdict: 'maybe' }] })).toEqual(['reviews[0].verdict is wrong'])
  expect(validateTask({ ...task(), size: { added: 1, removed: 0 } })).toEqual(['size.limit is wrong'])
})

test('asks, pools and links reject what does not fit', () => {
  expect(validateAsk({ ...ask(), recommend: 'Maybe' })).toEqual(['ask.recommend is not one of options'])
  expect(validateAsk({ ...ask(), options: ['Yes'] })).toEqual(['ask.options is wrong'])
  expect(validatePool({ ...pool(), five_hour_left: 120, state: 'low' })).toEqual(['pool.five_hour_left is wrong', 'pool.state is wrong'])
  expect(validateLink({ kind: 'link', title: 'x', url: 'javascript:alert(1)', at: 1 })).toEqual(['link.url is wrong'])
})
