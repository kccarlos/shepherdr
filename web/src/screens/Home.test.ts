import { expect, test } from 'bun:test'
import { validateAsk, validateLink, validatePool, validateTask } from '@shared/board-contract.ts'
import { tiles } from '../board.ts'
import fx from './home.fixture.json'

// the home reads what contracts/board-data.md says; its fixture (the proof stub's data too) fits the contract
test('the home fixture fits the board data contract', () => {
  const links = fx.deliverables.tasks.flatMap((t) => t.deliverables.filter((d) => 'kind' in d))
  expect(links.length).toBeGreaterThan(0)
  const problems = [...fx.tasks.flatMap(validateTask), ...fx.asks.flatMap(validateAsk), ...fx.usage.flatMap(validatePool), ...links.flatMap(validateLink)]
  expect(problems).toEqual([])
})

test('usage tiles: one per window a pool has, empty and unknown say so', () => {
  const now = Date.parse('2026-11-08T18:40:00Z')
  const t = tiles(fx.usage, now)
  expect(t.map((x) => [x.label, x.left])).toEqual([
    ['claude · 5 hours', 95], ['claude · week', 18], ['codex · week', 0], ['gemini · 5 hours', 70], ['gemini · week', 64], ['antigravity', null],
  ])
  expect(t[2].note).toStartWith('empty until ')
  expect(t[4].note).toBe('refills Thursday')
  expect(t[5].note).toBe('no usage info')
})
