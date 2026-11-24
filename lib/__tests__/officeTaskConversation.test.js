import { expect, it } from 'vitest'
import { discussionInput, findDiscussionTasks } from '../office/task-conversation.mjs'

const atrium = { id: 'a', brief: 'Atrium lighting', status: 'awaiting_owner_review', history: [] }
const roof = { id: 'r', brief: 'Roof lighting', status: 'completed', history: [] }
const tasks = [atrium, roof]
const prior = { recordSource: { id: roof.id } }

it('uses the named assignment, recognises a follow-up and asks about ambiguous titles', () => {
  expect(findDiscussionTasks(tasks, 'What changed on the atrium?', prior)).toEqual([atrium])
  expect(findDiscussionTasks(tasks, 'Why did Emma return it?', prior)).toEqual([roof])
  expect(findDiscussionTasks(tasks, 'What changed on lighting?')).toEqual(tasks)
  expect(findDiscussionTasks(tasks, 'What changed, why, and what do you need me to decide?')).toEqual([atrium])
  expect(findDiscussionTasks(tasks, 'Please create a new draft for the roof.', prior)).toEqual([])
  expect(findDiscussionTasks(tasks, 'Why does the office have a budget?', prior)).toEqual([])
})

it('keeps the two recent drafts and their independent reviews, and pins links to the versions available at the time', () => {
  const task = { ...atrium, history: [
    { action: 'delivered', by: 'daniel', version: 1, content: 'Initial proposal' },
    { action: 'reviewed', by: 'emma', version: 1, reasons: 'Add the access requirement', verdict: 'REVISE' },
    { action: 'delivered', by: 'daniel', version: 2, content: 'Includes access' },
    { action: 'reviewed', by: 'emma', version: 2, reasons: 'Access is covered', verdict: 'PASS' },
  ] }
  const saved = discussionInput(task, 'Why?', '', [])
  expect(saved.input.assignment.history.map(e => e.text)).toEqual(['Initial proposal', 'Add the access requirement', 'Includes access', 'Access is covered'])
  task.history.push({ action: 'accepted', by: 'owner', note: 'Proceed' })
  task.status = 'completed'
  expect(saved.recordSource.events).toEqual([0, 1, 2, 3])
  expect(discussionInput(task, 'Why?', '', []).input.assignment.next).toBe('Approved and filed.')
})

it('keeps long escaped drafts, history and owner messages inside the model input limit', () => {
  const long = '\u0001'.repeat(10000)
  const actions = ['delivered', 'reviewed', 'advised_lead', 'recommended', 'delegated', 'requested_revision', 'accepted', 'progress']
  const history = [...actions, ...actions].map(action => ({ action, instructions: long, content: long, at: new Date().toISOString(), by: 'daniel' }))
  const task = { ...atrium, history, brief: long, evidence: long, pause: long }
  const conversation = Array(4).fill({ message: long, content: long })
  for (const message of ['a'.repeat(4000), long.slice(0, 4000)]) {
    const { input } = discussionInput(task, message, long, conversation)
    expect(input.message).toBe(message)
    expect(JSON.stringify(input).length).toBeLessThan(48000)
  }
})
