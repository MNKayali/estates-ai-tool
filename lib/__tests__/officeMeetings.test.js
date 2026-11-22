import { describe, expect, it, vi } from 'vitest'
import { meetingAction } from '../office/meetings.mjs'
vi.mock('@vercel/kv', () => ({ createClient: vi.fn() }))

describe('office meetings', () => {
  it('supports old office records and supplies earlier speakers to the next participant', async () => {
    const generate = vi.fn().mockResolvedValue({ content: 'I recommend reviewing the sample first.' })
    let state = { assignments: [], strategy: 'Improve clarity.' }
    state = await meetingAction(state, { action: 'meeting_create', topic: 'Report quality', participants: ['omar', 'emma'] }, generate)
    const id = state.meetings[0].id
    state = await meetingAction(state, { action: 'meeting_message', id, message: 'What should we improve?' }, generate)
    state = await meetingAction(state, { action: 'meeting_turn', id, role: 'omar' }, generate)
    state = await meetingAction(state, { action: 'meeting_turn', id, role: 'emma' }, generate)
    expect(generate.mock.calls[1][0].input.discussion).toHaveLength(2)
    expect(generate.mock.calls[1][0].job.name).toBe('Emma')
    expect(state.meetings[0].turns.map(turn => turn.role)).toEqual(['owner', 'omar', 'emma'])
    state = await meetingAction(state, { action: 'meeting_end', id }, generate)
    await expect(meetingAction(state, { action: 'meeting_turn', id, role: 'omar' }, generate)).rejects.toThrow('ended')
  })

  it('rejects outsiders and preserves the discussion after a failed model call', async () => {
    const generate = vi.fn().mockRejectedValue(new Error('Unavailable'))
    const state = await meetingAction({ assignments: [] }, { action: 'meeting_create', topic: 'Priorities', participants: ['omar'] }, generate)
    const id = state.meetings[0].id
    await expect(meetingAction(state, { action: 'meeting_turn', id, role: 'sarah' }, generate)).rejects.toThrow('participant')
    expect(generate).not.toHaveBeenCalled()
    await expect(meetingAction(state, { action: 'meeting_turn', id, role: 'omar' }, generate)).rejects.toThrow('Unavailable')
    expect(state.meetings[0].turns).toEqual([])
  })
})
