import { expect, test } from 'bun:test'
import { itemsOf } from './preview-items.ts'
import { validateLink } from '../shared/board-contract.ts'

const art = (id: string, at: number) => ({ id, title: id, version: 1, at, thumb: null })
const link = (url: string, at: number) => ({ kind: 'link', title: 'Canvas', url, at })

test('itemsOf: newest first, once each, only links that fit the contract', () => {
  const d = { tasks: [
    { ref: 'A-1', title: 'one', deliverables: [art('x', 1), link('javascript:alert(1)', 9), link('https://claude.ai/design/x', 5)] },
    { ref: 'A-2', title: 'two', deliverables: [art('x', 3), art('y', 2)] },
  ], agents: [] }
  expect(itemsOf(d).map((i) => i.key)).toEqual(['https://claude.ai/design/x', 'x', 'y'])
  const bad = { tasks: [{ ref: 'A-1', title: 't', deliverables: [link('https://', 1), link('https://[', 2), { ...art('a', 3), url: 'javascript:alert(1)' }, { ...art('b', 4), kind: 'x' }] }], agents: [] }
  expect(itemsOf(bad).map((i) => [i.key, i.url])).toEqual([['a', undefined]])
  expect(validateLink(link('https://claude.ai/design/x', 5))).toEqual([])
})
