// Board task rows shaped as contracts/board-data.md says the service sends them: the one-task page's test checks
// them with the contract's validator, and its proof screenshots are drawn from them.
const H = (c: string) => c.repeat(40)
const at = 1762600000000
export const readyTask = {
  id: 'FAC-12', name: 'G1 · gate evidence contract', status: 'ready', place: 'factory', age: '3h', state: 'ready', on: 'mini', created: '',
  taskFolder: '/srv/dev/factory', base: 'kc-factory', pr: { number: 11, url: 'https://github.com/example/shop/pull/11' },
  summary: "A short agreed format for the merge gate's review and check records now exists, with a checker and a test, so later gate pieces can be built to match.",
  proof: 'proof-fac12',
  agents: [
    { role: 'worker', cli: 'claude', model: 'claude-sonnet-5-5', address: 'term-3', parent: null, state: 'idle' },
    { role: 'reviewer', cli: 'agy', model: 'gemini-4-argon-high', address: 'term-7', parent: 'term-3', state: 'ended' },
    { role: 'reviewer', cli: 'agy', model: 'gemini-4-argon-high', address: 'term-8', parent: 'term-3', state: 'ended' },
    { role: 'checks', cli: null, model: null, address: 'term-9', parent: null, state: 'done' },
    { role: 'verifier', cli: 'codex', model: null, address: 'term-11', parent: null, state: 'done' },
  ],
  reviews: [
    { round: 1, head: 'b811c4d' + H('1').slice(7), by: 'term-7', started_by: 'herdr-task', verdict: 'changes', must_fix: 5, report: '1 blocker, 4 major, 1 minor: the checker accepted a pass with findings left.', at },
    { round: 2, head: '0d35f19' + H('2').slice(7), by: 'term-8', started_by: 'herdr-task', verdict: 'changes', must_fix: 1, report: 'model may be null when the CLI default ran.', at: at + 600000 },
    { round: 3, head: 'd0674bd' + H('3').slice(7), by: 'term-8', started_by: 'herdr-task', verdict: 'pass', must_fix: 0, report: 'Nothing at major or above on the final head.', at: at + 1200000 },
  ],
  checks: [
    // an earlier head's failed run: the page shows only the latest head's
    { sha: '0d35f19' + H('2').slice(7), command: 'python3 -m unittest discover -s test', exit: 1, output_tail: 'FAILED (failures=1)', started_at: at + 700000, finished_at: at + 730000, by: 'term-9', ci: null },
    { sha: 'd0674bd' + H('3').slice(7), command: 'python3 -m unittest discover -s test', exit: 0, output_tail: 'Ran 412 tests in 38.214s\n\nOK (skipped=3)', started_at: at + 1300000, finished_at: at + 1338000, by: 'term-9', ci: null },
    { sha: 'd0674bd' + H('3').slice(7), command: 'bin/sync-shared --check', exit: 0, output_tail: 'all 198 copies match', started_at: at + 1340000, finished_at: at + 1341000, by: 'term-9', ci: { state: 'success', url: 'https://github.com/example/shop/actions/runs/1' } },
  ],
  verdicts: [
    { sha: 'd0674bd' + H('3').slice(7), by: 'term-11', verdict: 'pass', commands: ['python3 test/contract_gate_evidence.py'], output_tail: 'checked 4 sample records: OK', at: at + 1400000 },
  ],
  size: { added: 109, removed: 7, limit: 60 },
}
// a task still at work: no rounds, checks or verdict yet, and no limit in its brief
export const workingTask = {
  id: 'FAC-41', name: 'B3 · Board: one task page with its evidence', status: 'work', place: 'factory', age: '40m', state: 'working', on: 'mini', created: '',
  taskFolder: '/srv/dev/factory', base: 'kc-factory',
  agents: [{ role: 'worker', cli: 'claude', model: 'claude-opus-5-5', address: 'term-21', parent: null, state: 'working' }],
  size: { added: 38, removed: 2, limit: null },
}
