import { roles } from './roles.mjs'

export const stages = [
  { label: 'Shape the plan', accountable: 'Omar', responsible: 'Omar', consulted: 'Relevant specialists', informed: 'Nabil' },
  { label: 'Prepare the work', accountable: 'Omar', responsible: 'Assignment lead', consulted: 'Named contributors', informed: 'Emma' },
  { label: 'Check the draft', accountable: 'Emma', responsible: 'Emma', consulted: 'Assignment lead', informed: 'Omar and Nabil' },
  { label: 'Recommend a decision', accountable: 'Omar', responsible: 'Omar', consulted: 'Emma', informed: 'Nabil' },
  { label: 'Approve or return', accountable: 'Nabil', responsible: 'Nabil', consulted: 'Omar and Emma', informed: 'Assignment lead' },
]

export function nextStep(task) {
  const lead = roles[task.delegation?.specialist]?.name ?? 'The lead'
  if (task.pause) return task.pause
  const consult = task.delegation?.consultations?.find(item => !task.contributions?.some(done => done.role === item.role))
  switch (task.status) {
    case 'queued': return 'Omar sets the plan and appoints a lead.'
    case 'assigned':
    case 'in_progress': return consult ? roles[consult.role].name + ' advises ' + lead + '.' : lead + ' prepares the draft.'
    case 'revision_requested': return lead + ' revises the draft using the feedback.'
    case 'awaiting_quality_review': return 'Emma checks the submitted version.'
    case 'with_gm': return 'Omar prepares his recommendation.'
    case 'awaiting_owner_review': return 'Your decision is needed.'
    case 'completed': return 'Approved and filed.'
    default: return task.review?.reasons || task.history.at(-1)?.note || 'Further information is needed.'
  }
}

export function officeBriefing(state) {
  const tasks = state.assignments
  const mostRecent = items => [...items].sort((a,b) => String(b.history.at(-1)?.at).localeCompare(String(a.history.at(-1)?.at)))[0]
  const groups = [
    ['Decision', mostRecent(tasks.filter(t => t.status === 'awaiting_owner_review')), 'Nothing is waiting for your approval.'],
    ['Held up', mostRecent(tasks.filter(t => t.pause || ['blocked','quality_blocked'].includes(t.status))), 'No blockers recorded.'],
    ['In progress', mostRecent(tasks.filter(t => !t.pause && ['queued','assigned','in_progress','awaiting_quality_review','revision_requested','with_gm'].includes(t.status))), 'No work currently in progress.'],
    ['Last completed', mostRecent(tasks.filter(t => t.status === 'completed')), 'No completed work recorded yet.'],
  ]
  const lines = groups.map(([label, task, empty]) => label + ' — ' + (task ? task.brief + ' ' + nextStep(task) : empty))
  return { content: lines.join('\n\n'), spokenSummary: lines.join(' '), relatedAssignments: groups.flatMap(([,task]) => task ? [task.id] : []) }
}
