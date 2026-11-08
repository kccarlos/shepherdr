import { expect, test } from 'bun:test'
import { validateTask } from '../../shared/board-contract.ts'
import { readyTask, workingTask } from './BoardTask.fixture.ts'

test('the rows the one-task page is drawn from fit the board data contract', () => {
  expect(validateTask(readyTask)).toEqual([])
  expect(validateTask(workingTask)).toEqual([])
})
