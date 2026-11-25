import { id, job, message, now, plain, hasIdentity, daily, toolNames } from './records.mjs'
import { OfficeError } from '../store.mjs'

function cents(n, max) {
  if (!Number.isSafeInteger(n) || n < 0 || n > max) throw new OfficeError('Enter a valid spending limit.', 400)
  return n
}
function wake(c) {
  for (const j of c.jobs.filter((j) => j.budget)) {
    j.pause = null
    j.resume = null
    j.budget = false
    j.attempts = 0
  }
}
function decide(c, b) {
  if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 7 || new Set(b.ids).size !== b.ids.length)
    throw new OfficeError('Choose the reviewed work.', 400)
  const items = b.ids.map((key) => c.outputs.find((o) => o.id === key))
  if (items.some((o) => !o || o.status !== 'Awaiting my approval'))
    throw new OfficeError('This version has already changed.', 422)
  if (!['approve', 'edit', 'reject'].includes(b.decision)) throw new OfficeError('Choose a decision.', 400)
  if (b.decision === 'edit' && items.length !== 1) throw new OfficeError('Choose one output to edit.', 400)
  if (b.decision === 'approve' && items.some((o) => hasIdentity(o.title + ' ' + o.body + ' ' + o.scope)))
    throw new OfficeError('Remove identifying details before approval.', 400)
  for (const o of items) {
    o.decision = { action: b.decision, at: now(), version: o.version, scope: o.scope }
    o.status = b.decision === 'approve' ? 'Approved' : 'Draft'
    if (b.decision === 'edit') {
      const body = plain(b.text, 'edited output', 6000)
      job(c, o.objective, 'qa', o.author, 'Revised ' + o.title, {
        titles: [o.title],
        drafts: [{ title: o.title, body }],
        criteria: 'Check the owner’s exact edit and privacy before approval.',
        deadline: 'Next review',
        previousVersion: o.version,
        replaces: o.id,
        permission: o.permission,
        scope: o.scope,
        sources: o.sources
      })
    }
  }
  message(
    c,
    'Omar',
    b.decision === 'approve'
      ? 'Approval recorded for the selected version. External delivery is manual in Phase 1.'
      : b.decision === 'edit'
        ? 'I’ve sent your edit to Emma for review.'
        : 'I’ve withdrawn the approval request.'
  )
}
export function action(c, b) {
  const key = plain(b.requestId, 'request reference', 100)
  if (c.receipts.includes(key)) return
  daily(c)
  if (b.action === 'message') {
    const text = plain(b.text, 'message', 5000)
    message(c, 'You', text)
    const j = job(c, null, 'intake', 'omar', 'Your message to Omar', {
      text,
      conversationEnd: c.messages.at(-1).id
    })
    if (!c.monthlyCents) {
      j.budget = true
      j.pause = 'Owner allowance needed.'
      if (!c.messages.some((m) => m.type === 'budget' && !m.resolved))
        message(
          c,
          'Omar',
          'Your objective is saved. May the team use up to US$3 per month for AI work, shared across agents? The default limit per agent is US$0.50 per day and US$3 per month.',
          { type: 'budget' }
        )
    }
  } else if (b.action === 'allowance') {
    c.monthlyCents = cents(b.monthlyCents, 100000)
    if (b.agent) {
      if (!Object.hasOwn(c.agents, b.agent)) throw new OfficeError('Unknown agent.', 400)
      c.agents[b.agent].dailyCents = cents(b.dailyCents, 100000)
      c.agents[b.agent].monthlyCents = cents(b.agentMonthlyCents, 100000)
    }
    if (c.monthlyCents) {
      wake(c)
      c.messages
        .filter((m) => m.type === 'budget')
        .forEach((m) => {
          m.resolved = true
        })
    }
  } else if (b.action === 'decline_allowance') {
    c.messages
      .filter((m) => m.type === 'budget')
      .forEach((m) => {
        m.resolved = true
      })
    message(c, 'Omar', 'Your objective is saved. Work can resume when you set an AI allowance in Settings.')
  } else if (b.action === 'agent') {
    const name = plain(b.name, 'name', 50)
    if (Object.values(c.agents).some((a) => a.name.toLowerCase() === name.toLowerCase()))
      throw new OfficeError('That name is already in use.', 400)
    if (!Array.isArray(b.tools) || b.tools.some((t) => !toolNames.includes(t)))
      throw new OfficeError('Choose supported tools.', 400)
    c.agents[id()] = {
      name,
      role: plain(b.role, 'role', 80),
      instructions: plain(b.instructions, 'instructions', 1000),
      tools: [...new Set(b.tools)],
      dailyCents: 50,
      monthlyCents: 300
    }
  } else if (b.action === 'decision') decide(c, b)
  else if (b.action === 'retry') {
    const j = c.jobs.find((t) => t.id === b.jobId && t.pause && !['cancelled', 'done'].includes(t.stage))
    if (!j) throw new OfficeError('This step has already moved on.', 422)
    j.pause = null
    j.resume = null
    j.attempts = 0
    j.revisions = 0
  } else throw new OfficeError('Unknown office action.', 400)
  c.receipts.push(key)
}
