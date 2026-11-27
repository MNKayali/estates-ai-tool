import { companyContext, roles } from './roles.mjs'
import { field, newGoal, sharedKnowledge } from './goals.mjs'
import { OfficeError, readOffice, updateOffice } from './store.mjs'

export async function meetingStep(state, meeting, generate) {
  const participants = meeting.participants
  const sequence = ['omar', ...participants.filter(id=>id !== 'omar')]
  const role = sequence[meeting.turns.filter(t=>t.role !== 'owner').length]
  const request = (speaker,instruction) => generate({role:speaker, job:roles[speaker], companyContext, instruction,
    input:{topic:meeting.topic,participants,knowledge:sharedKnowledge(state),discussion:meeting.turns.map(t=>({role:t.role,content:t.content.slice(0,1800)})).slice(-10)}},meeting.id)
  let updated
  let assignments = state.assignments
  if (role && meeting.status === 'running') {
    const output = await request(role,role === 'omar' ? 'Chair this business meeting. Frame the specific decision and evidence. Ask the invited disciplines a focused question. Return content in two sentences.' : 'Contribute your own assessment to the chair. Respond to a specific point already raised, independently challenge assumptions, and recommend an action in your remit. Return content in two to four sentences.')
    updated = {...meeting,turns:[...meeting.turns,{role,content:field(output.content,'meeting contribution',2000),at:new Date().toISOString()}]}
  } else {
    const output = await request('omar','Close this meeting using only the recorded contributions. Return content (a short summary), recommendations, differences (unresolved disagreements), decisions (owner decisions) and followUps (each with lead and a specific internal brief). Return empty arrays where nothing was agreed. Distinguish a suggested action from completed work.')
    const list = (v,label) => {
      if (!Array.isArray(v) || v.length > 4) throw new OfficeError('Incomplete meeting minutes.',502)
      return v.map(s=>field(s,label,800))
    }
    if (!Array.isArray(output.followUps) || output.followUps.length > 3) throw new OfficeError('Invalid meeting follow-ups.',502)
    const summary = field(output.content,'meeting summary',1500)
    const followUps = output.followUps.map(a=>{
      if (!['sarah','daniel','ahmed'].includes(a.lead)) throw new OfficeError('Invalid action owner.',502)
      const task = newGoal([field(a.brief,'follow-up',800)],summary)
      return {...task,status:'suggested',meetingId:meeting.id,suggestedLead:a.lead}
    })
    if (assignments.length + followUps.length > 120) throw new OfficeError('Task register full.',409)
    assignments = [...followUps,...assignments]
    updated = {...meeting,status:'ended',endedAt:new Date().toISOString(),minutes:{summary,recommendations:list(output.recommendations,'recommendation'),
      differences:list(output.differences,'disagreement'),decisions:list(output.decisions,'decision'),actions:followUps.map(t=>({id:t.id,lead:t.suggestedLead,brief:t.brief}))}}
  }
  return {...state,assignments,meetings:state.meetings.map(m=>m.id === meeting.id ? updated : m)}
}

export async function chairMeeting(store,id,generate) {
  const key = 'projento:office:v1:chair:'+id
  const token = crypto.randomUUID()
  if (!await store.set(key,token,{nx:true,ex:250})) return
  try {
    for (let i=0;i<6;i++) {
      const current = await readOffice(store)
      const before = current.meetings?.find(m=>m.id === id)
      if (before?.status !== 'running' || before.pause) return
      try {
        await updateOffice(store,null,async state=>{
          const meeting = state.meetings.find(m=>m.id === id)
          if (meeting.status !== 'running' || meeting.pause) return state
          try { return await meetingStep(state,meeting,generate) }
          catch (error) { return {...state,meetings:state.meetings.map(m=>m.id === id ? {...m,pause:error instanceof OfficeError ? error.message : 'Meeting interrupted. Earlier contributions are saved.'} : m)} }
        })
      } catch (error) { if (error.status === 409) return; throw error }
    }
  } finally {
    await store.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0",[key],[token])
  }
}
