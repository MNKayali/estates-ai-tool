import { roles } from '../roles.mjs'
import { OfficeError } from '../store.mjs'

export const now = () => new Date().toISOString()
export const id = () => crypto.randomUUID()
export const toolNames = ['website', 'analytics']
export const closed = (job) => ['done', 'cancelled'].includes(job.stage)
export function message(c, from, text, details = {}) {
  c.messages.push({ id: id(), from, text, at: now(), ...details })
}
export function job(c, objective, stage, agent, title, fields = {}) {
  const j = { id: id(), objective, stage, agent, title, created: now(), attempts: 0, ...fields }
  c.jobs.push(j)
  return j
}
export function company(state) {
  if (state.company) return state.company
  const c = {
    agents: Object.fromEntries(
      Object.entries(roles).map(([key, r]) => [
        key,
        {
          name: r.name,
          role: r.title,
          instructions: r.responsibilities,
          tools: key === 'emma' ? [] : [...toolNames],
          dailyCents: 50,
          monthlyCents: 300
        }
      ])
    ),
    objectives: [],
    jobs: [],
    outputs: [],
    messages: [],
    receipts: [],
    daily: '',
    monthlyCents: state.monthlyBudgetCents || 0,
    context: [state.strategy, ...(state.references || []).map((r) => r.source + ' — ' + r.fact)]
      .filter(Boolean)
      .join('\n')
      .slice(0, 4500)
  }
  for (const task of state.assignments || []) {
    if (task.kind !== 'delivery')
      c.objectives.push({
        id: task.id,
        title: task.brief,
        priority: 'normal',
        status: 'historical',
        created: task.history?.[0]?.at || '',
        origin: 'Earlier office'
      })
    if (task.deliverable && task.review?.verdict === 'PASS' && task.review.version === task.deliverable.version) {
      c.outputs.push({
        id: task.id,
        objective: task.parentId || task.id,
        title: task.brief,
        body: task.deliverable.content,
        status: 'Draft',
        author: task.delegation?.specialist || 'omar',
        version: task.deliverable.version,
        at: task.history.at(-1)?.at || '',
        review: task.review.reasons
      })
    }
    const plan = task.approved || (task.strategyReview?.verdict === 'PASS' ? task.proposals?.at(-1) : null)
    if (plan)
      c.outputs.push({
        id: 'plan-' + task.id,
        objective: task.id,
        title: 'Strategy · ' + task.brief,
        body: [
          plan.summary,
          plan.tradeoff,
          plan.assumptions,
          ...(plan.objectives || []).flatMap((o) => [o.name, o.target, ...o.actions.map((a) => a.brief)])
        ]
          .filter(Boolean)
          .join('\n\n'),
        author: 'omar',
        version: plan.version,
        status: task.approved ? 'Approved' : 'Draft',
        at: task.history.at(-1)?.at || '',
        review: task.strategyReview?.reasons
      })
  }
  for (const t of state.chats?.omar || []) {
    c.messages.push(
      { id: 'owner-' + c.messages.length, from: 'You', text: t.message, at: t.at },
      { id: 'omar-' + c.messages.length, from: 'Omar', text: t.content, at: t.at }
    )
  }
  return c
}
export function daily(c, stamp = now()) {
  const date = stamp.slice(0, 10)
  if (c.daily === date) return
  c.daily = date
  const recent = c.outputs.filter((o) => o.at?.slice(0, 10) === date || (c.lastBrief && o.at > c.lastBrief))
  const active = c.objectives.filter((o) => o.status === 'active')
  const pending = c.outputs.filter((o) => o.status === 'Awaiting my approval')
  const stopped = c.jobs.filter((j) => j.pause && !j.resume && !closed(j))
  const line = (items, fallback) =>
    items.length
      ? items.slice(0, 2).join(' · ') + (items.length > 2 ? ' and ' + (items.length - 2) + ' more' : '')
      : fallback
  message(
    c,
    'Omar',
    [
      'Done — ' +
        line(
          recent.map((o) => o.title),
          'No new reviewed outputs.'
        ),
      'In progress — ' +
        line(
          active.map((o) => o.title),
          'No active objectives.'
        ),
      'Needs your decision — ' +
        line(
          [
            ...pending.map((o) => o.title),
            ...stopped.map((j) => j.pause),
            ...(c.questions || []).map((q) => q.question)
          ],
          'Nothing waiting.'
        )
    ].join('\n'),
    { type: 'daily' }
  )
  c.lastBrief = stamp
}
export function clientState(state) {
  const c = company(state)
  return {
    revision: state.revision,
    agents: c.agents,
    monthlyCents: c.monthlyCents,
    messages: c.messages,
    objectives: c.objectives,
    outputs: [...c.outputs].sort((a, b) => b.at.localeCompare(a.at)),
    jobs: c.jobs.map(
      ({ id, objective, stage, agent, title, deadline, criteria, pause, resume, lease, created }) => ({
        id,
        objective,
        stage,
        agent: stage === 'qa' ? 'emma' : agent,
        title,
        deadline,
        criteria,
        pause,
        resume,
        created,
        running: Boolean(lease && lease.until > Date.now())
      })
    )
  }
}
export function plain(value, label, limit) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit)
    throw new OfficeError('Check ' + label + '.', 400)
  return value.trim()
}
export function hasIdentity(text) {
  const email = process.env.OFFICE_OWNER_EMAIL || ''
  const mailbox = email.split('@')[0].replace(/\d+/g, ' ')
  const parts = mailbox
    .split(/[^\p{L}]+/u)
    .filter(
      (part) =>
        part.length >= 3 && !['admin', 'owner', 'office', 'hello', 'contact', 'info'].includes(part.toLowerCase())
    )
  const names = [email, ...parts, ...(process.env.OFFICE_PRIVATE_IDENTIFIERS || '').split('|')]
    .map((name) => name.trim().normalize('NFKC').toLowerCase())
    .filter(Boolean)
  const normalised = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
  return names.some((name) => normalised.includes(name))
}
