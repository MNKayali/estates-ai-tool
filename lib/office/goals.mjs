import { createAssignment, delegate } from './assignment.mjs'
import { roles, companyContext } from './roles.mjs'
import { OfficeError } from './store.mjs'

const specialists = ['sarah', 'daniel', 'ahmed']
export const planningStages = ['scoping', 'consulting', 'proposing', 'checking_strategy']
export function field(value, label, max = 1500) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new OfficeError('Check ' + label + ' and try again.', 400)
  return value.trim()
}
function items(value, label, max, required = true) {
  if (!Array.isArray(value) || (required && !value.length) || value.length > max) throw new OfficeError('The team returned an incomplete ' + label + '.', 502)
  return value
}
export function newGoal(names, evidence = '', at = new Date().toISOString()) {
  const objectives = items(names, 'objective list', 3).map(name => ({ name: field(name,'objective',names.length === 1 ? 4000 : 1200), owner: 'omar' }))
  return { ...createAssignment({id: crypto.randomUUID(), brief: objectives.map(o => o.name).join('\n'), evidence, at}),
    kind: 'goal', objectives, status: 'scoping', proposals: [], contributions: [] }
}
function record(task, status, event, fields = {}) {
  return { ...task, ...fields, status, history: [...task.history, { ...event, at: new Date().toISOString() }] }
}
export function sharedKnowledge(state) {
  return {
    ownerPriorities: (state.strategy || '').slice(0,1200),
    approvedReferences: (state.references || []).slice(-6).map(r=>({source:r.source,fact:r.fact})),
    goals: state.assignments.filter(t => t.kind === 'goal').slice(0,12).map(t => ({
      goal: t.brief.slice(0,220), status: t.status, approvedStrategy: t.approved?.summary?.slice(0,400),
      pendingProposal: t.status === 'strategy_decision' ? t.proposals.at(-1)?.summary.slice(0,220) : undefined,
      decision: t.decisions?.at(-1)?.decision,
    })),
    outcomes: state.assignments.filter(t => t.kind === 'delivery' && t.status === 'completed').slice(0,6)
      .map(t => ({ work: t.brief.slice(0,160), reviewedOutcome: t.recommendation?.slice(0,300) })),
    meetings: (state.meetings || []).filter(m => m.minutes).slice(-4).map(m => ({ topic:m.topic.slice(0,120), summary:m.minutes.summary.slice(0,300) })),
  }
}
function proposal(output, task) {
  const plans = items(output.objectivePlans, 'strategy', 3)
  if (plans.length !== task.objectives.length) throw new OfficeError('The strategy must cover every objective.', 502)
  return {
    version: task.proposals.length + 1, summary: field(output.content,'strategy summary',1600),
    assumptions: field(output.assumptions,'assumptions'), tradeoff: field(output.tradeoff,'cost and value'),
    permissions: items(output.permissions || [],'permission requests',3,false).map(note=>field(note,'specific external action',600)),
    objectives: plans.map((row, i) => ({
      ...task.objectives[i], baseline: field(row.baseline,'baseline'), target: field(row.target,'target'),
      actions: items(row.actions,'delivery actions',3).map(action => {
        if (!specialists.includes(action.lead)) throw new OfficeError('The proposed action needs a specialist lead.',502)
        return { lead: action.lead, brief: field(action.brief,'action',800), criteria: field(action.criteria,'success measure',600), deadline: field(action.deadline,'deadline',120) }
      }),
    })),
  }
}
export async function planStage(task, {generate, knowledge, maxRounds = 2}) {
  const ask = (role, instruction, input) => generate({role, companyContext, job:roles[role], instruction,
    input:{ objectives:task.objectives, ownerEvidence:task.evidence.slice(0,4000), knowledge, ...input }})
  if (task.status === 'scoping') {
    const output = await ask('omar','Choose one or two relevant specialists to research the supplied evidence. Return consultations with a focused question for each. Explore viability, test assumptions and challenge weak objectives. Request external evidence only when essential.',{})
    const requests = items(output.consultations,'consultations',2).map(r => {
      if (!specialists.includes(r.role)) throw new OfficeError('Invalid planning specialist.',502)
      return {role:r.role, question:field(r.question,'research question',1000)}
    })
    if (new Set(requests.map(r=>r.role)).size !== requests.length) throw new OfficeError('Duplicate consultation.',502)
    return record(task,'consulting',{by:'omar',action:'research_requested',note:requests.map(r=>r.question).join('\n')},{requests})
  }
  if (task.status === 'consulting') {
    const request = task.requests[task.contributions.length]
    const output = await ask(request.role,'Answer the GM’s research question from the supplied material. Distinguish evidence, assumptions and what would disprove your recommendation. Do not claim to have researched external sources.',{question:request.question, colleagues:task.contributions})
    const note = field(output.content,'specialist advice',2200)
    const contributions = [...task.contributions,{...request,content:note}]
    return record(task,contributions.length === task.requests.length ? 'proposing' : 'consulting',{by:request.role,action:'advised_lead',note},{contributions})
  }
  if (task.status === 'proposing') {
    const output = await ask('omar','Produce the best feasible consolidated strategy. Return content in 2–4 sentences, assumptions, tradeoff (challenge feasibility, compare cost versus value and give an alternative) and objectivePlans in original order. For each supply baseline (unknown if unmeasured), proposed observable target, and one to three internal deliverable actions with lead, brief, criteria and deadline relative to approval. No invented numbers or business results. Return permissions listing each specific proposed external action, recipient or destination and scope requiring separate owner clearance. Turn delivery actions into internal preparations. Otherwise return an empty permissions list. Address all reviewer and owner feedback.',{
      research:task.contributions, previous:task.proposals.at(-1), feedback:task.history.filter(e=>['reviewed','requested_revision','supplied_evidence'].includes(e.action)).slice(-3),
    })
    const plan = proposal(output,task)
    return record(task,'checking_strategy',{by:'omar',action:'strategy_proposed',version:plan.version,note:plan.summary},{proposals:[...task.proposals,plan]})
  }
  const plan = task.proposals.at(-1)
  const output = await ask('emma','Independently check this exact strategy. Challenge Omar on evidence, assumptions, value, measurable success, responsibilities, deadlines and external permissions. Return PASS, REVISE or BLOCK with specific reasons.',{proposal:plan,research:task.contributions})
  if (!['PASS','REVISE','BLOCK'].includes(output.verdict)) throw new OfficeError('Missing strategy verdict.',502)
  const review = {version:plan.version,verdict:output.verdict,reasons:field(output.reasons,'review reasons',2400)}
  const status = review.verdict === 'PASS' ? 'strategy_decision' : review.verdict === 'REVISE' && plan.version < maxRounds ? 'proposing' : 'strategy_blocked'
  return record(task,status,{by:'emma',action:'reviewed',...review},{strategyReview:review})
}
export function goalDecision(state, task, decision, note, at) {
  const plan = task.proposals.at(-1)
  if (task.status !== 'strategy_decision' || task.strategyReview?.verdict !== 'PASS' || task.strategyReview.version !== plan?.version)
    throw new OfficeError('This strategy needs an independent review before a decision.',409)
  if (!['approve','reject','revise'].includes(decision)) throw new OfficeError('Choose a strategy decision.',400)
  const decisions = [...(task.decisions || []),{decision,note,version:plan.version,at}]
  const children = []
  if (decision === 'approve') {
    for (const [index,obj] of plan.objectives.entries()) for (const a of obj.actions) {
      const child = createAssignment({id:crypto.randomUUID(),brief:a.brief,evidence:task.evidence,at})
      children.push({...delegate(child,{specialist:a.lead,instructions:a.brief,criteria:a.criteria,goal:obj.name,at}),
        kind:'delivery',parentId:task.id,objectiveIndex:index,approvedVersion:plan.version,deadline:a.deadline})
    }
    if (state.assignments.length + children.length > 120) throw new OfficeError('The task register is full.',409)
  }
  const status = {approve:'monitoring',reject:'rejected',revise:'proposing'}[decision]
  const changed = record(task,status,{by:'owner',action:{approve:'strategy_approved',reject:'strategy_rejected',revise:'requested_revision'}[decision],version:plan.version,note},
    {decisions,approved:decision === 'approve' ? plan : undefined})
  return {...state,assignments:[...children,...state.assignments.map(t=>t.id === task.id ? changed : t)]}
}
export function authorisedDelivery(task,state) {
  const parent = state.assignments.find(t=>t.id === task.parentId)
  return task.kind === 'delivery' && parent?.status === 'monitoring' && parent.approved?.version === task.approvedVersion
}
export function closeDeliveredGoals(tasks) {
  return tasks.map(t=>{
    if (t.status !== 'monitoring') return t
    const children = tasks.filter(c=>c.parentId === t.id)
    return children.length && children.every(c=>c.status === 'completed') ? record(t,'filed',{by:'omar',action:'delivery_filed',note:'All internal deliverables passed quality review. Business impact requires separate evidence.'}) : t
  })
}
