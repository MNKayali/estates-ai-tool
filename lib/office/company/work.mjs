import { closed, id, job, message, now, plain } from './records.mjs'

function finish(j) {
  j.stage = 'done'
  j.ended = now()
  delete j.lease
}
function necessary(s, label, max = 800) {
  return plain(s, label, max)
}
function plan(c, j, r) {
  const summary = necessary(r.summary, 'GM reply', 1600)
  if (!['objective', 'answer', 'clarify', 'amend'].includes(r.kind)) throw new Error('Incomplete GM response.')
  const pending = c.questions?.find((q) => q.id === r.answersQuestion)
  if (r.kind === 'answer' || r.kind === 'clarify') {
    if (r.kind === 'clarify' && pending)
      throw Object.assign(new Error('Omar could not resolve the clarification.'), { manual: true })
    if (r.kind === 'clarify') (c.questions ||= []).push({ id: j.id, request: j.text, question: summary })
    else if (pending) c.questions = c.questions.filter((q) => q.id !== pending.id)
    message(c, 'Omar', summary)
    finish(j)
    return
  }
  const original = r.kind === 'amend' && c.objectives.find((o) => o.id === r.target)
  if (r.kind === 'amend' && !original) throw new Error('Omar needs to identify the existing objective.')
  if (!Array.isArray(r.tasks) || !r.tasks.length || r.tasks.length > 6)
    throw new Error('Omar needs to complete the allocation.')
  const allocations = r.tasks.map((t) => {
    if (!Object.hasOwn(c.agents, t.owner) || t.owner === 'emma') throw new Error('Missing delivery owner.')
    if (!Array.isArray(t.outputs) || !t.outputs.length || t.outputs.length > 7)
      throw new Error('Missing deliverables.')
    const permission = t.permission
    if (!['internal', 'send', 'spend', 'publish'].includes(permission)) throw new Error('Unclear permission.')
    return {
      agent: t.owner,
      title: necessary(t.title, 'task'),
      titles: t.outputs.map((s) => necessary(s, 'output title', 180)),
      deadline: necessary(t.deadline, 'deadline', 180),
      criteria: necessary(t.criteria, 'completion criteria'),
      permission,
      scope: permission === 'internal' ? '' : necessary(t.scope, 'approval scope', 500)
    }
  })
  const objective = {
    id: id(),
    title: summary,
    label: (r.projectName || summary).slice(0, 100),
    brief: pending ? pending.request + '\n' + j.text : j.text,
    priority: ['urgent', 'later'].includes(r.priority) ? r.priority : 'normal',
    status: 'active',
    created: now()
  }
  if (original) {
    original.status = 'superseded'
    original.replacement = objective.id
    for (const old of c.jobs.filter((t) => t.objective === original.id && !closed(t))) {
      old.stage = 'cancelled'
      delete old.lease
    }
    for (const old of c.outputs.filter((o) => o.objective === original.id && o.status === 'Awaiting my approval'))
      old.status = 'Draft'
  }
  if (pending) c.questions = c.questions.filter((q) => q.id !== pending.id)
  c.objectives.push(objective)
  for (const p of r.priorities || []) {
    const existing = c.objectives.find((o) => o.id === p.id && o.status === 'active')
    if (existing && ['urgent', 'normal', 'later'].includes(p.priority)) existing.priority = p.priority
  }
  const tasks = allocations.map((t) => job(c, objective.id, 'produce', t.agent, t.title, t))
  job(c, objective.id, 'produce', 'omar', 'GM summary', {
    summary: true,
    titles: ['GM summary'],
    requires: tasks.map((t) => t.id),
    deadline: 'After independent review',
    criteria: 'Report actual outputs and remaining decisions in two sentences.',
    permission: 'internal'
  })
  j.objective = objective.id
  finish(j)
  message(c, 'Omar', summary, { objective: objective.id, type: 'allocation' })
}
export function applyResult(c, j, r, sources) {
  if (j.stage === 'intake') return plan(c, j, r)
  if (j.stage === 'produce') {
    if (!Array.isArray(r.items) || r.items.length !== j.titles.length)
      throw new Error('The draft set was incomplete.')
    j.drafts = r.items.map((d, i) => ({ title: j.titles[i], body: necessary(d.body, 'finished output', 6000) }))
    if (new Set(j.drafts.map((d) => d.body.toLowerCase())).size !== j.drafts.length)
      throw new Error('Duplicate drafts require correction.')
    j.sources = sources
    j.stage = 'qa'
    j.attempts = 0
    delete j.lease
    return
  }
  if (!['PASS', 'REVISE'].includes(r.verdict)) throw new Error('Emma could not record her verdict.')
  const reason = necessary(r.reason, 'review note', 2000)
  if (r.verdict === 'REVISE') {
    j.feedback = reason
    j.revisions = (j.revisions || 0) + 1
    if (j.revisions > 2)
      throw Object.assign(new Error('Emma needs a management decision after two revisions. ' + reason), {
        manual: true
      })
    j.stage = 'produce'
    j.attempts = 0
    delete j.lease
    return
  }
  const ids = []
  for (const d of j.drafts) {
    const output = {
      id: id(),
      objective: j.objective,
      author: j.agent,
      at: now(),
      title: d.title,
      body: d.body,
      version: (j.previousVersion || 0) + 1,
      review: reason,
      status: j.permission === 'internal' ? 'Draft' : 'Awaiting my approval',
      scope: j.scope,
      permission: j.permission,
      replaces: j.replaces,
      sources: Object.fromEntries(
        Object.entries(j.sources || {}).map(([key, source]) => [
          key,
          key === 'website' && source.content ? { source: source.source } : source
        ])
      )
    }
    c.outputs.push(output)
    ids.push(output.id)
  }
  delete j.drafts
  finish(j)
  const objective = c.objectives.find((o) => o.id === j.objective)
  if (j.summary) objective.status = 'delivered'
  message(
    c,
    'Omar',
    j.summary
      ? c.outputs.at(-1).body
      : j.titles.length === 1
        ? 'Ready: ' + j.titles[0] + '.'
        : 'Emma has reviewed the ' + j.titles.length + ' outputs below.',
    { type: 'result', objective: j.objective, outputs: ids }
  )
}
export function statusLine(c, j, error, time = Date.now()) {
  const transient = !error.manual && !error.budget && j.attempts < 3
  j.pause =
    error.budget || error.manual
      ? error.message
      : 'The ' +
        (j.stage === 'qa' ? 'quality check' : j.stage === 'intake' ? 'allocation' : 'drafting step') +
        ' could not finish.'
  j.resume = error.resume || (transient ? new Date(time + 60000).toISOString() : null)
  j.budget = Boolean(error.budget)
  if (!error.budget && !error.manual)
    j.retryFeedback = 'Check the required fields, return the complete set once, and keep each response concise.'
  const saved = j.drafts?.length
    ? 'The draft is saved for Emma.'
    : 'Your message and earlier finished outputs are saved.'
  const when = j.resume
    ? 'Eligible to resume from ' +
      j.resume.slice(0, 16).replace('T', ' ') +
      ' UTC. I check while the office is open and at 07:00 UTC daily.'
    : 'I can resume after you select Retry.'
  const text = j.title + ' — ' + j.pause + ' ' + saved + ' ' + when
  const previous = c.messages.find((m) => m.failure === j.id)
  if (previous) Object.assign(previous, { text, at: now(), resolved: false })
  else message(c, 'Omar', text, { failure: j.id, type: 'decision' })
  delete j.lease
}
function eligible(c, j, time) {
  if (closed(j) || j.lease?.until > time || (j.pause && (!j.resume || Date.parse(j.resume) > time))) return false
  return !j.requires || j.requires.every((id) => c.jobs.some((t) => t.id === id && t.stage === 'done'))
}
export function available(c, time = Date.now()) {
  const priority = (o) => ({ urgent: 0, normal: 1, later: 2 })[o?.priority] ?? 1
  const rank = (j) => (j.stage === 'intake' ? -1 : priority(c.objectives.find((o) => o.id === j.objective)))
  return c.jobs
    .filter((j) => eligible(c, j, time))
    .sort((a, b) => rank(a) - rank(b) || a.created.localeCompare(b.created))
}
export function claim(c, time = Date.now()) {
  const occupied = new Set(
    c.jobs.filter((j) => !closed(j) && j.lease?.until > time).map((j) => (j.stage === 'qa' ? 'emma' : j.agent))
  )
  const batch = []
  for (const j of available(c, time)) {
    const role = j.stage === 'qa' ? 'emma' : j.agent
    if (occupied.has(role)) continue
    if (j.lease && j.attempts >= 3) {
      statusLine(c, j, { manual: true, message: 'The last run expired before an output was saved.' }, time)
      continue
    }
    const warning = c.messages.find((m) => m.failure === j.id)
    if (warning) warning.resolved = true
    j.attempts++
    j.pause = null
    j.resume = null
    j.lease = { token: id(), until: time + 90000 }
    occupied.add(role)
    batch.push(structuredClone(j))
    if (batch.length === 3) break
  }
  return batch
}
