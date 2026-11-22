import { roles, companyContext } from './roles.mjs'
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
  let updated
  if (body.action === 'meeting_end') {
    updated = { ...meeting, status: 'ended', endedAt: now }
  } else {
    if (meeting.turns.length >= 40) throw new OfficeError('End this meeting and start another to continue.', 409)
    let turn
    if (body.action === 'meeting_message') {
      if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 4000) {
        throw new OfficeError('Enter a message of up to 4,000 characters.', 400)
      }
      turn = { role: 'owner', content: body.message.trim(), at: now }
    } else if (body.action === 'meeting_turn') {
      if (!meeting.participants.includes(body.role)) throw new OfficeError('Choose a participant in this meeting.', 400)
      const output = await generate({
        job: roles[body.role], companyContext,
        instruction: 'You are speaking in an office meeting. Respond to the owner and other participants, noting agreement, disagreements, evidence gaps and proposed next steps. Return JSON with content, at most 2,000 characters. Use only supplied evidence. Proposals require a separate owner decision and do not change assignments.',
        input: {
          topic: meeting.topic, participants: meeting.participants, strategy: current.strategy,
          discussion: meeting.turns.slice(-8),
          assignments: current.assignments.slice(0, 8).map(({ brief, status }) => ({ brief: brief.slice(0, 500), status })),
        },
      })
      if (typeof output.content !== 'string' || !output.content.trim() || output.content.length > 2000) {
        throw new OfficeError('The teammate could not provide a valid meeting response. You can try again.', 502)
      }
      turn = { role: body.role, content: output.content.trim(), at: now }
    } else {
      throw new OfficeError('Unknown meeting action.', 400)
    }
    updated = { ...meeting, turns: [...meeting.turns, turn] }
  }
  return { ...current, meetings: meetings.map(item => item.id === meeting.id ? updated : item) }
}
