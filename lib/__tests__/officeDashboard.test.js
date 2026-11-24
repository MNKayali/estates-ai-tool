import { expect, it, vi } from 'vitest'
import { officeBriefing, nextStep, stages } from '../office/dashboard.mjs'
vi.mock('@vercel/kv', () => ({ createClient: vi.fn() }))
import { priceUsage } from '../office/usage.mjs'

it('shows actionable work, the latest completion and direct assignment links', () => {
  const assignments = [
    { id: 'old', brief: 'Older work', status: 'completed', history: [{ at:'2026-10-10' }] },
    { id: 'done', brief: 'Checked copy', status: 'completed', history: [{ at:'2026-11-10' }] },
    { id: 'pending', brief: 'Release notes', status: 'assigned', pause: 'Budget reached', history: [] },
  ]
  const result = officeBriefing({ assignments })
  expect(result.relatedAssignments).toEqual(['pending', 'done'])
  expect(result.content).toContain('Budget reached')
  expect(result.content).toContain('No work currently in progress.')
  expect(nextStep({ status:'awaiting_owner_review' })).toContain('Your decision')
  expect(stages.find(s => s.label === 'Check the draft').accountable).toBe('Emma')
})

it('prices provider tokens in integral nanodollars and identifies unpriced calls', () => {
  expect(priceUsage({input_tokens: 1000,output_tokens: 200}, 'claude-haiku-4-5')).toEqual({tokens:1200,cost:2000000})
  expect(priceUsage({input_tokens: 0,output_tokens: 0,cache_creation_input_tokens: 6,cache_read_input_tokens:10,cache_creation:{ephemeral_1h_input_tokens:2}}, 'claude-haiku-4-5').cost).toBe(10000)
  expect(priceUsage({input_tokens: 10,output_tokens: 20}, 'unknown')).toEqual({tokens:30,cost:null})
  expect(priceUsage(null, 'claude-haiku-4-5')).toBeNull()
})
