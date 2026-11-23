import { meetingAction } from '@/lib/office/meetings.mjs'
import { isOfficeOwner } from '@/lib/office/access'
import { buildBriefing, createAssignment, recordOwnerDecision, supplyEvidence } from '@/lib/office/assignment.mjs'
import { companyContext, roles } from '@/lib/office/roles.mjs'
import { runStage } from '@/lib/office/run-stage.mjs'
import { generateOfficeOutput, officeProviderConfigured } from '@/lib/office/provider.mjs'
import { OfficeError, officeStore, readOffice, reserveOfficeCall, updateOffice } from '@/lib/office/store.mjs'

export const maxDuration = 40
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
    return reply({ ...await readOffice(officeStore()), modelReady: officeProviderConfigured() })
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
    const generate = async (request) => {
      if (!officeProviderConfigured()) throw new OfficeError('The office model is not configured.', 503)
      await reserveOfficeCall(store)
      return generateOfficeOutput(request)
    }
    const state = await updateOffice(store, body.revision, async (current) => {
      if (typeof body.action === 'string' && body.action.startsWith('meeting_')) {
        return meetingAction(current, body, generate)
      }
      if (body.action === 'strategy') {
        return { ...current, strategy: textField(body.strategy, 'Strategy', 4000) }
      }
      if (body.action === 'create') {
        if (current.assignments.length >= 40) throw new OfficeError('The pilot has room for 40 assignments.', 409)
        const brief = textField(body.brief, 'Brief', 4000)
        const evidence = body.evidence === undefined || body.evidence === '' ? '' : textField(body.evidence, 'Evidence', 12000)
        const assignment = createAssignment({ id: crypto.randomUUID(), brief, evidence, at: at() })
        return { ...current, assignments: [assignment, ...current.assignments] }
      }
      if (body.action === 'chat') {
        if (!Object.hasOwn(roles, body.role)) throw new OfficeError('Select a teammate.', 400)
        const message = textField(body.message, 'Message', 4000)
        const conversation = current.chats[body.role] ?? []
        const summary = body.role === 'omar' ? Object.fromEntries(Object.entries(buildBriefing(current.assignments, {
          since: new Date(Date.now() - 86400000).toISOString(), strategy: current.strategy,
        })).map(([key, value]) => [key, Array.isArray(value) ? value.slice(0, 6).map(({ brief, status, delegation, history }) => ({
          brief: brief.slice(0, 500), status, owner: delegation?.specialist,
          latestNote: (history.at(-1)?.note ?? history.at(-1)?.reasons ?? '').slice(0, 500),
        })) : value])) : undefined
        const output = await generate({
          companyContext, job: roles[body.role],
          instruction: 'Answer the owner directly. Return an object with content. Explain evidence gaps and use only the supplied record for claims about office activity. A conversation does not change assignment records.',
          input: { message, summary, conversation: conversation.slice(-4) },
        })
        const content = textField(output.content, 'Agent response', 10000)
        return { ...current, chats: { ...current.chats, [body.role]: [...conversation, { message, content, at: at() }].slice(-30) } }
      }

      const task = current.assignments.find(({ id }) => id === body.id)
      if (!task) throw new OfficeError('Assignment unavailable.', 404)
      let updated
      if (body.action === 'run' && ['queued', 'assigned', 'revision_requested', 'awaiting_quality_review'].includes(task.status)) {
        if (task.history.length >= 25) throw new OfficeError('This assignment has reached the pilot revision limit.', 409)
        updated = await runStage(task, { generate, strategy: current.strategy })
      } else if (body.action === 'unblock' && task.status === 'blocked') {
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
    return reply({ ...state, modelReady: officeProviderConfigured() })
  } catch (error) {
    return failure(error)
  }
}
