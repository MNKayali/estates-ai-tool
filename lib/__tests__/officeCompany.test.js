import { describe, it, expect, vi } from 'vitest'
import { company, daily, clientState, job } from '../office/company/records.mjs'
import { action } from '../office/company/actions.mjs'
import { applyResult, claim, statusLine } from '../office/company/work.mjs'
import { agentStep } from '../office/company/agents.mjs'
vi.mock('@vercel/kv', () => ({ createClient: vi.fn(), kv: {} }))
const make = () => company({ assignments: [], monthlyBudgetCents: 300 })
const send = (c, text, key = text) => action(c, { action: 'message', text, requestId: key })
const allocation = (title, owner) => ({
  kind: 'objective',
  summary: title,
  priority: 'normal',
  tasks: [
    {
      owner,
      title,
      titles: [title],
      outputs: [title],
      deadline: 'Today',
      criteria: 'A complete document',
      permission: 'publish',
      scope: 'Company page'
    }
  ]
})
describe('the GM’s portfolio', () => {
  it('queues a second objective without replacing earlier work and honours priority, leases and dependencies', () => {
    const c = make()
    send(c, 'Prepare a post')
    const [first] = claim(c)
    applyResult(
      c,
      c.jobs.find((j) => j.id === first.id),
      allocation('Launch note', 'sarah'),
      {}
    )
    send(c, 'New product guide')
    const parallel = claim(c)
    expect(parallel.map((j) => j.agent)).toEqual(['omar', 'sarah'])
    expect(claim(c)).toHaveLength(0)
    const next = allocation('Guide', 'daniel')
    next.priority = 'urgent'
    applyResult(
      c,
      c.jobs.find((j) => j.id === parallel[0].id),
      next,
      {}
    )
    expect(c.objectives.map((o) => o.status)).toEqual(['active', 'active'])
    expect(claim(c).map((j) => j.agent)).toEqual(['daniel'])
    expect(c.jobs.filter((j) => j.summary && j.lease)).toHaveLength(0)
  })
  it('returns only reviewed bodies, pins decisions to versions and checks edits again', async () => {
    const c = make()
    send(c, 'Prepare a post')
    applyResult(c, c.jobs[0], allocation('Post', 'sarah'), {})
    const t = c.jobs[1]
    applyResult(c, t, { items: [{ body: 'A usable project note.' }] }, {})
    expect(c.outputs).toHaveLength(0)
    expect(JSON.stringify(clientState({ company: c }))).not.toContain('A usable project note.')
    applyResult(c, t, { verdict: 'PASS', reason: 'Usable and anonymous.' }, {})
    const out = c.outputs[0]
    action(c, { action: 'decision', requestId: 'edit1', decision: 'edit', ids: [out.id], text: 'Revised draft' })
    expect(out.status).toBe('Draft')
    expect(() =>
      action(c, { action: 'decision', requestId: 'stale', decision: 'approve', ids: [out.id] })
    ).toThrow('changed')
    const edit = c.jobs.at(-1)
    applyResult(c, edit, { verdict: 'PASS', reason: 'Rechecked edit.' }, {})
    const revised = c.outputs.at(-1)
    expect(revised.version).toBe(2)
    action(c, { action: 'decision', requestId: 'approve2', decision: 'approve', ids: [revised.id] })
    expect(revised.status).toBe('Approved')
    expect(revised.decision.scope).toBe('Company page')
  })
  it('guards identity even if the reviewer incorrectly passes and never inserts unreviewed material', async () => {
    const c = make()
    vi.stubEnv('OFFICE_OWNER_EMAIL', 'alexa.sample12@example.invalid')
    const j = job(c, 'o', 'qa', 'sarah', 'Post', {
      drafts: [{ title: 'Private project', body: 'Contact Alexa for details.' }]
    })
    expect((await agentStep(c, j, async () => ({ verdict: 'PASS', reason: 'OK' }), {})).verdict).toBe('REVISE')
  })
  it('records one visible failure, honours its reset, preserves successful work and suppresses duplicate messages', () => {
    const c = make()
    send(c, 'New work')
    send(c, 'New work')
    daily(c)
    daily(c)
    expect(c.messages.filter((m) => m.type === 'daily')).toHaveLength(1)
    expect(c.jobs).toHaveLength(1)
    const j = c.jobs[0],
      time = Date.now()
    statusLine(
      c,
      j,
      { message: 'Allowance reached', budget: true, resume: new Date(time + 80000).toISOString() },
      time
    )
    statusLine(
      c,
      j,
      { message: 'Allowance reached', budget: true, resume: new Date(time + 80000).toISOString() },
      time
    )
    expect(claim(c, time)).toHaveLength(0)
    expect(claim(c, time + 80001)).toHaveLength(1)
    expect(c.messages.filter((m) => m.failure)).toHaveLength(1)
  })
  it('retains legacy reviewed work without starting or publishing old assignments', () => {
    const c = company({
      assignments: [
        {
          id: 'old',
          brief: 'Old plan',
          review: { version: 1, verdict: 'PASS', reasons: 'OK' },
          deliverable: { version: 1, content: 'Filed text' },
          history: [{ at: '2025-01-01' }]
        }
      ]
    })
    expect(c.outputs[0].body).toBe('Filed text')
    expect(c.objectives[0].status).toBe('historical')
    expect(c.jobs).toHaveLength(0)
  })
})

it('keeps a clarification attached to the original objective when unrelated work arrives', () => {
  const c = make()
  send(c, 'Assess the other report')
  applyResult(c, c.jobs[0], { kind: 'clarify', summary: 'Which report should the team assess?' }, {})
  const pending = c.questions[0]
  send(c, 'Draft the visitor guide')
  applyResult(c, c.jobs.at(-1), allocation('Visitor guide', 'daniel'), {})
  expect(c.objectives[0].brief).toBe('Draft the visitor guide')
  expect(c.questions[0].id).toBe(pending.id)
  send(c, 'The handover report')
  applyResult(c, c.jobs.at(-1), { ...allocation('Handover assessment', 'ahmed'), answersQuestion: pending.id }, {})
  expect(c.objectives[1].brief).toContain('Assess the other report')
  expect(c.questions).toEqual([])
})

it('replaces a conflicting target without cancelling unrelated work or losing the previous result', () => {
  const c = make()
  for (const name of ['Earlier target', 'Unrelated objective']) {
    send(c, name)
    applyResult(c, c.jobs.at(-1), allocation(name, 'sarah'), {})
  }
  const [old, other] = c.objectives
  c.outputs.push({ id: 'saved', body: 'Earlier copy', objective: old.id, status: 'Awaiting my approval' })
  send(c, 'Use the latest target instead')
  applyResult(c, c.jobs.at(-1), { ...allocation('Updated target', 'sarah'), kind: 'amend', target: old.id }, {})
  expect(old.status).toBe('superseded')
  expect(other.status).toBe('active')
  expect(c.outputs[0]).toMatchObject({ body: 'Earlier copy', status: 'Draft' })
})
