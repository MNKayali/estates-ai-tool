import { expect, it, vi } from 'vitest'
import { manageAssignment } from '../office/manage.mjs'
import { createAssignment } from '../office/assignment.mjs'

vi.mock('@vercel/kv', () => ({ createClient: vi.fn() }))

function memoryStore(state) {
  const values = new Map([['projento:office:v1:state', state]])
  return {
    get: async key => values.get(key),
    set: async (key, value, { nx }) => {
      if (nx && values.has(key)) return null
      values.set(key, value)
      return 'OK'
    },
    eval: async (_, [lock, key], [token, json]) => {
      if (values.get(lock) !== token) return 0
      if (key) values.set(key, JSON.parse(json))
      values.delete(lock)
      return 1
    },
  }
}

it('runs a shared assignment once when two requests resume it and keeps its reviewed decision for the owner', async () => {
  const task = createAssignment({ id: 'a', brief: 'Prepare a product launch.', at: 'now' })
  const store = memoryStore({ revision: 0, strategy: 'Reliable reports', assignments: [task] })
  const generate = vi.fn(async request => {
    expect(request.input.officeWork[0].id).toBe('a')
    switch (request.role) {
      case 'omar': return request.input.review ? { content: 'Approve the launch draft.' } : {
        specialist: 'sarah', instructions: 'Draft launch copy.', criteria: 'State the product benefit.',
        consultations: [{ role: 'daniel', question: 'What is the user benefit?' }],
      }
      case 'daniel': return { content: 'Early feasibility advice.' }
      case 'sarah': return { content: 'The launch draft.' }
      case 'emma': return { verdict: 'PASS', reasons: 'Matches the brief.' }
    }
  })
  await Promise.all([manageAssignment(store, 'a', generate), manageAssignment(store, 'a', generate)])
  await manageAssignment(store, 'a', generate)
  const saved = (await store.get('projento:office:v1:state')).assignments[0]
  expect(saved.status).toBe('awaiting_owner_review')
  expect(generate.mock.calls.map(([request]) => request.role)).toEqual(['omar', 'daniel', 'sarah', 'emma', 'omar'])
  expect(saved.review.version).toBe(saved.deliverable.version)
})

it('pauses on failure and keeps the last saved handover without repeating calls on each visit', async () => {
  const task = createAssignment({ id: 'b', brief: 'Assess report clarity.', at: 'now' })
  const store = memoryStore({ revision: 0, assignments: [task] })
  const generate = vi.fn().mockResolvedValueOnce({ specialist: 'daniel', instructions: 'Draft copy.', criteria: 'Clear text.' }).mockRejectedValue(new Error('unavailable'))
  await manageAssignment(store, 'b', generate)
  await manageAssignment(store, 'b', generate)
  const saved = (await store.get('projento:office:v1:state')).assignments[0]
  expect(saved.delegation.specialist).toBe('daniel')
  expect(saved.pause).toBeTruthy()
  expect(generate).toHaveBeenCalledTimes(2)
})
