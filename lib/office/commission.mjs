import { newGoal } from './goals.mjs'
import { OfficeError } from './store.mjs'

export const gmInstruction = 'As GM, when Nabil asks the team to produce something or build a plan, return assignmentBrief to initiate strategy planning only. Own the assumptions, value for money and feasible alternatives. Never claim execution started before the owner approved a reviewed strategy. Include the agreed constraints. If an open assignment covers the request, report its status and omit assignmentBrief. For information or a briefing, answer directly and omit assignmentBrief. You manage delegations, consultations and reviews.'

export function commission(assignments, brief, message, at) {
  if (!brief) return assignments
  if (typeof brief !== 'string' || !brief.trim() || brief.length > 4000) throw new OfficeError('Omar could not record a usable brief.', 502)
  if (assignments.some(task => task.status !== 'completed' && task.brief === brief.trim())) return assignments
  if (assignments.length >= 40) throw new OfficeError('The office has reached its assignment limit.', 409)
  return [newGoal([brief],message,at), ...assignments]
}
