import { describe, expect, it } from 'vitest'
import { buildBriefing, createAssignment, recordOwnerDecision, reviewDeliverable } from '../office/assignment.mjs'
import { runStage } from '../office/run-stage.mjs'

const at = '2026-11-22T19:40:00Z'
const create = () => createAssignment({ id: 'sample', at, brief: 'Improve the explanation of uncertainty.' })

async function stage(task, role, response) {
  return runStage(task, {
    now: () => at,
    generate: async (request) => {
      expect(request.role).toBe(role)
      if (role === 'emma') expect(request.input.deliverable).toBe(task.deliverable)
      return response
    },
  })
}

const plan = { specialist: 'daniel', instructions: 'Draft copy.', criteria: 'Explain the range in plain English.' }

describe('Projento office workflow', () => {
  it('retains revisions and requires an owner decision after a quality pass', async () => {
    let task = await stage(create(), 'omar', plan)
    task = await stage(task, 'daniel', { content: 'First draft' })
    task = await stage(task, 'emma', { verdict: 'REVISE', reasons: 'Clarify the range.' })
    task = await stage(task, 'daniel', { content: 'Revised draft' })

    expect(() => reviewDeliverable(task, { version: 1, verdict: 'PASS' })).toThrow()
    expect(() => recordOwnerDecision(task, { accepted: true, note: 'Accepted.', at })).toThrow()

    task = await stage(task, 'emma', { verdict: 'PASS', reasons: 'Meets the criteria.' })
    expect(task.status).toBe('with_gm')
    expect(() => recordOwnerDecision(task, { accepted: true, note: 'Yes', at })).toThrow()
    task = await stage(task, 'omar', { content: 'Approve the reviewed explanation.' })
    expect(task.deliverable.version).toBe(2)
    expect(task.history[2].content).toBe('First draft')
    expect(buildBriefing([task], { since: at }).needsOwnerDecision).toEqual([task])

    task = recordOwnerDecision(task, { accepted: true, note: 'Accepted for internal use.', at })
    expect(buildBriefing([task], { since: at }).recentlyCompleted).toEqual([task])
  })

  it.each([['sarah', 'daniel', 'Marketing plan'], ['ahmed', 'sarah', 'Service improvement']])(
    'passes the actual contribution to %s and keeps the lead accountable', async (lead, helper, brief) => {
      let task = createAssignment({ id: 'example', at, brief })
      task = await stage(task, 'omar', { ...plan, specialist: lead, consultations: [{ role: helper, question: 'Advise on your part.' }] })
      task = await stage(task, helper, { content: 'Here is the specialist input.' })
      task = await runStage(task, { generate: async request => {
        expect(request.role).toBe(lead)
        expect(request.input.contributions[0].content).toBe('Here is the specialist input.')
        for (const name of ['Omar', 'Sarah', 'Daniel', 'Ahmed', 'Emma']) expect(request.companyContext).toContain(name)
        return { content: 'Combined draft' }
      } })
      expect(task.status).toBe('awaiting_quality_review')
      expect(task.history.map(turn => turn.by)).toEqual(['owner', 'omar', helper, lead])
    })
  it('records missing evidence as a blocker and leaves a failed generation unmodified', async () => {
    const queued = create()
    await expect(runStage(queued, {
      generate: async () => { throw new Error('Provider unavailable') },
    })).rejects.toThrow('Provider unavailable')
    expect(queued.history).toHaveLength(1)

    const assigned = await stage(queued, 'omar', plan)
    const blocked = await stage(assigned, 'daniel', { blocker: 'No sample report supplied.' })
    expect(buildBriefing([blocked], { since: at }).blockers).toEqual([blocked])
    expect(blocked.history.at(-1).note).toBe('No sample report supplied.')
  })
})
