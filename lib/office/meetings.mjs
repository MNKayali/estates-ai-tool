import { commission, gmInstruction } from './commission.mjs'
import { roles, companyContext, sharedWork } from './roles.mjs'
import { OfficeError } from './store.mjs'

export async function meetingAction(current, body, generate) {
  const meetings = current.meetings ?? []
  const now = new Date().toISOString()
  if (body.action === 'meeting_create') {
    if (meetings.length >= 20) throw new OfficeError('The pilot has room for 20 meetings.', 409)
    if (typeof body.topic !== 'string' || !body.topic.trim() || body.topic.length > 4000) {
      throw new OfficeError('Enter a meeting topic of up to 4,000 characters.', 400)
    }
    if (!Array.isArray(body.participants) || body.participants.length < 1 || body.participants.length > 5
      || new Set(body.participants).size !== body.participants.length
      || body.participants.some(role => !Object.hasOwn(roles, role))) {
      throw new OfficeError('Choose between one and five teammates.', 400)
    }
    return { ...current, meetings: [...meetings, {
      id: crypto.randomUUID(), topic: body.topic.trim(), participants: body.participants,
      status: 'open', turns: [], createdAt: now,
    }] }
  }
  const meeting = meetings.find(item => item.id === body.id)
  if (!meeting || meeting.status !== 'open') throw new OfficeError('This meeting is unavailable or has ended.', 409)
  let assignments = current.assignments
  let updated
  if (body.action === 'meeting_end') {
    updated = { ...meeting, status: 'ended', endedAt: now }
  } else {
    if (meeting.turns.length >= 40) throw new OfficeError('End this meeting and start another to continue.', 409)
    const turns = [...meeting.turns]
    let turn
    if (body.action === 'meeting_message' || body.action === 'meeting_ask') {
      if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 4000) {
        throw new OfficeError('Enter a message of up to 4,000 characters.', 400)
      }
      turn = { role: 'owner', content: body.message.trim(), at: now }
      if (body.action === 'meeting_ask') {
        if (turns.length >= 39) throw new OfficeError('Start another meeting to ask for a reply.', 409)
        turns.push(turn)
      }
    }
    if (body.action === 'meeting_turn' || body.action === 'meeting_ask') {
      if (!meeting.participants.includes(body.role)) throw new OfficeError('Choose a participant in this meeting.', 400)
      const output = await generate({
        job: roles[body.role], companyContext,
        instruction: 'You are speaking in an office meeting. Speak naturally in British English. Answer the latest point first. Respond in one or two short sentences, or one brief line per point. Refer to prior contributions when relevant. Skip greetings and repetition. Only ask a question when a decision or missing detail is essential. Return content of at most 2,000 characters and a spokenSummary giving the takeaway in one or two sentences. Use only supplied evidence. Only Nabil approves final work.' + (body.action === 'meeting_ask' && body.role === 'omar' ? ' ' + gmInstruction : ' Give advice within your role.'),
        input: {
          topic: meeting.topic, participants: meeting.participants, strategy: current.strategy,
          discussion: turns.slice(-8),
          assignments: sharedWork(current),
        },
      })
      if (typeof output.content !== 'string' || !output.content.trim() || output.content.length > 2000) {
        throw new OfficeError('The teammate could not provide a valid meeting response. You can try again.', 502)
      }
      if (body.action === 'meeting_ask' && body.role === 'omar') {
        assignments = commission(assignments, output.assignmentBrief, body.message, now)
      }
      turn = { role: body.role, content: output.content.trim(), spokenSummary: typeof output.spokenSummary === 'string' ? output.spokenSummary.trim().slice(0, 650) : undefined, at: now }
    } else if (body.action !== 'meeting_message') {
      throw new OfficeError('Unknown meeting action.', 400)
    }
    updated = { ...meeting, turns: [...turns, turn] }
  }
  return { ...current, assignments, meetings: meetings.map(item => item.id === meeting.id ? updated : item) }
}
