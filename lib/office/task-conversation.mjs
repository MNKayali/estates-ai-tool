import { nextStep } from './dashboard.mjs'

const generalWords = new Set('a an the is are was were to for or of on in at as by and from with me my our you your what which how why did does will can would should do have has about please tell give show need asked say said could explain responsible reason checked return returned approved this that those it its they them their omar emma sarah daniel ahmed assignment task plan review draft work status change changed update latest decision decide prepare create build write make'.split(' '))
const words = value => new Set((value.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(word => word.length > 1 && !generalWords.has(word)))

export function findDiscussionTasks(tasks, message, previous) {
  const question = message.toLowerCase()
  const followUp = /\b(it|that|this|those|these|they|them|why|changed|again|more detail|the draft|the review|the recommendation|explain further|who was responsible|who checked|who approved|what did (emma|omar|sarah|daniel|ahmed) (say|recommend)|what happens next)\b/.test(question)
  const aboutWork = /\b(draft|review|decision|decide|approve|approval|feedback|deliverable|revised|revision|changed|blocked|handover|progress|status|recommendation)\b/.test(question)
  if (!aboutWork && !followUp && !question.includes('?')) return []
  const newWork = /\b(?:please|can you|could you|would you|i want you to|i need you to|ask the team to|let.s)\s+(?:prepare|create|commission|produce|build|write|draft|develop|start|assign)\b|^(?:omar[, ]+)?(?:prepare|create|commission|produce|build|write|draft|develop|start|assign)\b/.test(question)
  if (newWork) return []
  if (!aboutWork && /\b(office|team|strategy|budget|usage|role|goals|kpis)\b/.test(question)) return []
  if (/\b(all|across|overview|how many)\b/.test(question) && /\b(assignments|tasks|office|projects)\b/.test(question)) return []
  const terms = words(question)
  const ranked = tasks.map(task => {
    const title = words(task.brief)
    return { task, score: [...terms].filter(word => title.has(word)).length }
  }).filter(item => item.score).sort((a, b) => b.score - a.score)
  if (ranked.length) return ranked.filter(item => item.score === ranked[0].score).map(item => item.task)
  if (followUp) {
    const ids = previous?.recordSource ? [previous.recordSource.id] : previous?.assignmentId ? [previous.assignmentId] : previous?.relatedAssignments || []
    const recent = tasks.filter(task => ids.includes(task.id))
    if (recent.length) return recent
  }
  if (!aboutWork) return []
  if (/\b(decision|decide|approve|approval)\b/.test(question)) {
    const pending = tasks.filter(task => task.status === 'awaiting_owner_review')
    if (pending.length) return pending
  }
  return tasks.length === 1 || /\b(the|this|which|what changed)\b/.test(question) ? tasks : []
}

export function eventText(event) {
  if (event.action === 'delegated') return [event.goal, event.instructions, ...(event.planSteps || []), event.criteria,
    ...(event.consultations || []).map(item => item.role + ' — ' + item.question)].filter(Boolean).join('\n')
  return event.content || event.reasons || event.note || ''
}

const labels = {
  delivered: 'Draft', reviewed: 'Quality review', advised_lead: 'Specialist advice', recommended: 'Recommendation',
  delegated: 'Work plan', requested_revision: 'Changes requested', accepted: 'Owner approval', progress: 'Progress update',
}
export const eventLabel = event => [labels[event.action] || event.action, event.version && 'v' + event.version, event.verdict].filter(Boolean).join(' · ')

// Limit the serialised text, including escaped characters. Keep both ends of
// long drafts so a change near the conclusion can still be compared.
function excerpt(value = '', limit) {
  if (JSON.stringify(value).length <= limit) return value
  const parts = Array.from(value)
  let size = Math.min(parts.length, limit)
  while (size > 0) {
    const half = Math.floor(size / 2)
    const sample = parts.slice(0, half).join('') + '\n[… excerpt …]\n' + parts.slice(parts.length - half).join('')
    if (JSON.stringify(sample).length <= limit) return sample
    size = Math.floor(size * 0.75)
  }
  return '…'
}

export function discussionRecord(task, scale = 1) {
  const history = task.history
  const recent = history.map((event, index) => ({ event, index })).reverse()
  const counts = {}
  const entries = recent.filter(({ event }) => {
    if (!eventText(event)) return false
    const count = counts[event.action] = (counts[event.action] || 0) + 1
    return count <= (['delivered', 'reviewed', 'advised_lead'].includes(event.action) ? 2 : 1)
  }).reverse()
  const limits = { delivered: 6500, reviewed: 2200, recommended: 1400, delegated: 1400 }
  return {
    recordSource: { id: task.id, events: entries.map(item => item.index) },
    record: {
      brief: excerpt(task.brief, 1500), status: task.status, next: excerpt(nextStep(task), 1000),
      evidence: excerpt(task.evidence, 1800), lead: task.delegation?.specialist,
      history: entries.map(({ event }) => ({
        record: eventLabel(event), by: event.by, at: event.at, text: excerpt(eventText(event), Math.floor((limits[event.action] || 900) * scale)),
      })),
    },
  }
}

// Keep room for the question and the records within the provider's input limit.
export function discussionInput(task, message, strategy, conversation) {
  const { record, recordSource } = discussionRecord(task, JSON.stringify(message).length > 10000 ? 0.45 : 1)
  return { recordSource, input: {
    message, strategy: excerpt(strategy, 1200), assignment: record,
    conversation: conversation.filter(turn => !turn.recordSource || turn.recordSource.id === task.id).slice(-2).map(turn => ({ message: excerpt(turn.message, 350), content: excerpt(turn.content, 700) })),
  } }
}
