import { commission, gmInstruction } from '@/lib/office/commission.mjs'
import { chairMeeting } from '@/lib/office/meeting-chair.mjs'
import { meetingAction } from '@/lib/office/meetings.mjs'
import { isOfficeOwner } from '@/lib/office/access'
import { recordOwnerDecision, supplyEvidence } from '@/lib/office/assignment.mjs'
import { companyContext, roles, sharedWork } from '@/lib/office/roles.mjs'
import { trackedReply, usageSummary, pricedModel } from '@/lib/office/usage.mjs'
import { findDiscussionTasks, discussionInput } from '@/lib/office/task-conversation.mjs'
import { officeBriefing } from '@/lib/office/dashboard.mjs'
import { newGoal, goalDecision, sharedKnowledge } from '@/lib/office/goals.mjs'
import { after } from 'next/server'
import { manageAssignment, needsManagement } from '@/lib/office/manage.mjs'
import { officeProviderConfigured, officeModel } from '@/lib/office/provider.mjs'
import { OfficeError, officeStore, readOffice, updateOffice } from '@/lib/office/store.mjs'

export const maxDuration = 300
const at = () => new Date().toISOString()
const reply = (data, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'private, no-store' },
})

function failure(error) {
  if (error instanceof OfficeError) return reply({ error: error.message }, error.status)
  console.error('[office-action]', { failure: error?.name ?? 'UnknownError' })
  return reply({ error: 'The office could not save or complete this action. Your earlier work is saved. Please refresh before retrying.' }, 503)
}

export async function GET(request) {
  if (!await isOfficeOwner(request)) return reply({ error: 'Owner access required.' }, 403)
  try {
    const store = officeStore()
    return reply({ ...await readOffice(store), usage: await usageSummary(store).catch(() => null), modelReady: officeProviderConfigured() })
  } catch (error) {
    return failure(error)
  }
}

function textField(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new OfficeError(`${label} must contain between 1 and ${max} characters.`, 400)
  }
  return value.trim()
}

export async function POST(request) {
  if (!await isOfficeOwner(request)) return reply({ error: 'Owner access required.' }, 403)
  if (request.headers.get('sec-fetch-site') === 'cross-site'
    || request.headers.get('content-type')?.split(';')[0] !== 'application/json') {
    return reply({ error: 'Invalid office request.' }, 403)
  }

  try {
    const buffer = await request.text()
    if (buffer.length > 20000) return reply({ error: 'Office request is too large.' }, 413)
    let body
    try {
      body = JSON.parse(buffer)
    } catch {
      return reply({ error: 'Invalid office JSON.' }, 400)
    }
    if (!Number.isSafeInteger(body?.revision) || body.revision < 0) {
      return reply({ error: 'Refresh the office before submitting this action.' }, 400)
    }
    const store = officeStore()
    const generate = async (request, taskId, background = false, scopeId = taskId) => {
      if (!officeProviderConfigured()) throw new OfficeError('The office model is not configured.', 503)
      return trackedReply(store, request, { role: request.role || request.job.name.toLowerCase(), taskId, scopeId, background })
    }
    function schedule(state) {
      if (!officeProviderConfigured()) return
      const meeting = state.meetings?.find(m=>m.status === 'running' && !m.pause)
      if (meeting) after(()=>chairMeeting(store,meeting.id,(req,id)=>generate(req,id,true)))
      const pending = state.assignments.filter(needsManagement).slice(0, 3)
      if (pending.length) after(async () => {
        await Promise.all(pending.map(task => manageAssignment(store, task.id, request => generate(request, task.id, true, task.parentId || task.id))))
      })
    }
    if (body.action === 'resume') {
      const saved = await readOffice(store)
      schedule(saved)
      return reply({ ...saved, usage: await usageSummary(store).catch(() => null), modelReady: officeProviderConfigured() })
    }
    const state = await updateOffice(store, body.revision, async (current) => {
      if (typeof body.action === 'string' && body.action.startsWith('meeting_')) {
        return meetingAction(current, body, generate)
      }
      if (body.action === 'limits') {
        const {maxTaskCents,maxScopeCalls,maxRounds} = body
        if (!Number.isSafeInteger(maxTaskCents) || maxTaskCents < 1 || maxTaskCents > 100000 ||
          !Number.isSafeInteger(maxScopeCalls) || maxScopeCalls < 1 || maxScopeCalls > 60 ||
          !Number.isSafeInteger(maxRounds) || maxRounds < 1 || maxRounds > 4) throw new OfficeError('Check the cost, call and revision limits.',400)
        return {...current,maxTaskCents,maxScopeCalls,maxRounds}
      }
      if (body.action === 'budget') {
        const cents = body.monthlyBudgetCents
        if (!Number.isSafeInteger(cents) || cents < 0 || cents > 10000000) throw new OfficeError('Enter a valid monthly budget in US dollars.', 400)
        if (cents && !pricedModel(officeModel())) throw new OfficeError('The current model does not have a verified price.', 400)
        const previous = current.monthlyBudgetCents || 0
        const resumePaused = cents > previous || (cents === 0 && previous > 0)
        return { ...current, monthlyBudgetCents: cents, assignments: current.assignments.map(task =>
          resumePaused && task.pause && /daily limit|12 calls today|monthly budget/i.test(task.pause) ? { ...task, pause: null } : task) }
      }
      if (body.action === 'reference') {
        const references = current.references || []
        if (references.length >= 30) throw new OfficeError('The reference register is full.',409)
        return {...current,references:[...references,{source:textField(body.source,'Source',160),fact:textField(body.fact,'Approved information',800),at:at()}]}
      }
      if (body.action === 'strategy') {
        return { ...current, strategy: textField(body.strategy, 'Strategy', 4000) }
      }
      if (body.action === 'goals' || body.action === 'create') {
        if (current.assignments.length >= 40) throw new OfficeError('The pilot has room for 40 assignments.', 409)
        const names = body.action === 'goals' ? body.objectives : [textField(body.brief, 'Brief', 4000)]
        const evidence = body.evidence === undefined || body.evidence === '' ? '' : textField(body.evidence, 'Evidence', 12000)
        const assignment = newGoal(names, evidence)
        return { ...current, assignments: [assignment, ...current.assignments] }
      }
      if (body.action === 'chat') {
        if (!Object.hasOwn(roles, body.role)) throw new OfficeError('Select a teammate.', 400)
        const message = textField(body.message, 'Message', 4000)
        const conversation = current.chats[body.role] ?? []
        const assignments = sharedWork(current)
        const omarChat = body.role === 'omar' && !body.briefingOnly
        let matches = []
        if (body.assignmentId !== undefined) {
          const task = current.assignments.find(item => item.id === body.assignmentId)
          if (!omarChat || !task) throw new OfficeError('This assignment is unavailable for discussion.', 400)
          matches = [task]
        } else if (omarChat) {
          matches = findDiscussionTasks(current.assignments, message, conversation.at(-1))
        }
        const discussion = matches.length === 1 ? discussionInput(matches[0], message, current.strategy, conversation) : null
        const canCommission = omarChat && !matches.length
        let output
        if (body.role === 'omar' && body.briefingOnly === true) {
          output = officeBriefing(current)
        } else if (matches.length > 1) {
          output = { content: 'Which assignment shall I check?', choices: matches.map(task => task.id) }
        } else {
          output = await generate({
            companyContext, job: roles[body.role],
            instruction: 'Answer as the named teammate in clear British English. Speak naturally to Nabil, as a colleague. Start with the answer. Skip greetings, recaps and generic offers of help. For several points give one short line per point in the same order. For an office briefing cover today’s priority, blockers and decisions using the supplied records, including when there is nothing awaiting him. In a follow-up use the previous exchange. Usually use fewer than 75 words unless he asks for detail. For requests relating to your work, explain the next step you can take and ask a focused question only if needed. Use the supplied records and distinguish what you know from a proposal. Do not claim work happened without a recorded handover. Never invent or calculate project figures. Return content and a spokenSummary with the main takeaway and any decision in one or two short, complete sentences.' + (canCommission
              ? ' ' + gmInstruction
              : discussion ? ' Answer this question from the selected assignment. Compare the two most recent drafts when asked what changed. Attribute the reason to recorded feedback or say the reason is unrecorded. Ask for approval only at strategy_decision or awaiting_owner_review. A filed internal deliverable does not prove a business target was met. Treat a quality pass, recommendation and owner approval as different events. If the record or excerpt is insufficient, say precisely what is missing. This is a discussion of saved work. Omit assignmentBrief.'
              : ' This exchange is advisory. Use shared records for your answer.'),
            input: discussion ? discussion.input : {
              knowledge:sharedKnowledge(current),
              message, assignments, strategy: current.strategy,
              conversation: conversation.slice(-4).map(turn => ({
                message: turn.message.slice(0, 900), content: turn.content.slice(0, 1400),
              })),
            },
          }, discussion?.recordSource.id, false, matches[0]?.parentId || discussion?.recordSource.id)
        }
        const content = textField(output.content, 'Agent response', 10000)
        const work = canCommission ? commission(current.assignments, output.assignmentBrief, message, at()) : current.assignments
        const turn = {
          message, content, at: at(),
          recordSource: discussion?.recordSource,
          choices: output.choices,
          relatedAssignments: discussion ? [matches[0].id] : output.relatedAssignments,
          assignmentId: work === current.assignments ? undefined : work[0].id,
          spokenSummary: typeof output.spokenSummary === 'string' ? output.spokenSummary.trim().slice(0, 650) : undefined,
        }
        return { ...current, assignments: work, chats: { ...current.chats, [body.role]: [...conversation, turn].slice(-30) } }
      }

      const task = current.assignments.find(({ id }) => id === body.id)
      if (!task) throw new OfficeError('Assignment unavailable.', 404)
      if (body.action === 'followup') {
        if (current.assignments.length >= 120) throw new OfficeError('The task register is full.',409)
        const goal = newGoal([textField(body.brief,'Follow-up',1200)],(task.recommendation || task.proposals?.at(-1)?.summary || task.brief).slice(0,1800))
        return {...current,assignments:[{...goal,originId:task.id},...current.assignments]}
      }
      if (body.action === 'goal_decide' && task.kind === 'goal')
        return goalDecision(current,task,body.decision,textField(body.note || (body.decision === 'approve' ? 'Approved for internal work.' : ''),'Decision note',1500),at())
      let updated
      if (body.action === 'permission') {
        const note = task.approved?.permissions?.[body.index]
        if (!Number.isSafeInteger(body.index) || !note || task.clearances?.[body.index] || !['approve','decline'].includes(body.decision))
          throw new OfficeError('This permission is unavailable.',409)
        updated = {...task,clearances:{...task.clearances,[body.index]:{note,decision:body.decision,at:at()}}}
      } else if (body.action === 'plan_existing' && !task.kind && task.status !== 'completed') {
        const goal = newGoal([task.brief],task.evidence || '')
        updated = {...goal,id:task.id,legacyRecord:task}
      } else if (body.action === 'plan_followup' && task.status === 'suggested') {
        updated = {...task,status:'scoping'}
      } else if (body.action === 'strategy_evidence' && task.status === 'strategy_blocked') {
        const note = textField(body.note,'Information or revised direction',2000)
        updated = {...task,status:'proposing',history:[...task.history,{by:'owner',action:'supplied_evidence',note,at:at()}]}
      } else if (body.action === 'retry' && task.pause) {
        updated = { ...task, pause: null }
      } else if (body.action === 'run' && needsManagement(task)) {
        updated = task
      } else if (body.action === 'unblock' && ['blocked', 'quality_blocked'].includes(task.status)) {
        const evidence = textField(body.evidence, 'Evidence', 12000)
        if (task.evidence.length + evidence.length + (task.evidence ? 2 : 0) > 12000) {
          throw new OfficeError('Combined evidence must fit within 12,000 characters.', 400)
        }
        updated = supplyEvidence(task, evidence, at())
      } else if (body.action === 'decide' && task.status === 'awaiting_owner_review' && typeof body.accepted === 'boolean') {
        updated = recordOwnerDecision(task, { accepted: body.accepted, note: textField(body.note, 'Decision note', 2000), at: at() })
      } else {
        throw new OfficeError('This action is unavailable for the assignment.', 409)
      }
      return { ...current, assignments: current.assignments.map((assignment) => assignment.id === task.id ? updated : assignment) }
    })
    schedule(state)
    return reply({ ...state, usage: await usageSummary(store).catch(() => null), modelReady: officeProviderConfigured() })
  } catch (error) {
    return failure(error)
  }
}
