import { expect, it, vi } from 'vitest'
import { manageAssignment } from '../office/manage.mjs'
import { newGoal, goalDecision } from '../office/goals.mjs'
import { createAssignment } from '../office/assignment.mjs'

vi.mock('@vercel/kv', () => ({ createClient: vi.fn() }))

function memoryStore(state) {
  const values = new Map([['projento:office:v1:state', state]])
  return {
    get: async key => values.get(key),
    set: async (key, value, { nx }) => {
      if (nx && values.has(key)) return null
      values.set(key, value)
      return 'OK'
    },
    eval: async (_, [lock, key], [token, json]) => {
      if (values.get(lock) !== token) return 0
      if (key) values.set(key, JSON.parse(json))
      values.delete(lock)
      return 1
    },
  }
}

const sample = {
  content:'Trial a clearer evidence note before changing the report template.', assumptions:'A sample can be shared internally.',
  tradeoff:'Test a note first. A template rebuild would cost more before the wording is proven.',
  permissions:['Publish the reviewed note on the company website.'],
  objectivePlans:[{baseline:'No reader test recorded',target:'A reviewer can identify the evidence gap',actions:[
    {lead:'daniel',brief:'Draft an evidence note',criteria:'Explain the missing survey',deadline:'Within one working day of approval'}]}],
}
const getState = store => store.get('projento:office:v1:state')
const responses = {scoping:{consultations:[{role:'sarah',question:'What would a reader need to know?'}]},
  researching:{content:'Readers need a clear distinction between a survey and an assumption.'}}
it('persists each handover, checks both versions, and authorises internal delivery only after the owner decision',async()=>{
  const goal = newGoal(['Make early report assumptions clearer'],'The example has no measured survey.')
  const store = memoryStore({revision:0,assignments:[goal]})
  const generate = vi.fn(async ({role,instruction,input})=>{
    if (instruction.startsWith('Choose one')) return responses.scoping
    if (role === 'sarah') return responses.researching
    if (instruction.startsWith('Produce the best')) {
      expect(input.research[0].content).toContain('survey')
      return sample
    }
    if (input.proposal) return {verdict:input.proposal.version === 1 ? 'REVISE':'PASS',reasons:'State the source of the assumption.'}
    if (role === 'daniel') return {content:'The source is an owner assumption pending a measured survey.'}
    if (role === 'emma') return {verdict:'PASS',reasons:'The note identifies the outstanding survey.'}
    return {content:'The evidence note is ready for internal use. Reader impact remains unmeasured.'}
  })
  await Promise.all([manageAssignment(store,goal.id,generate),manageAssignment(store,goal.id,generate)])
  const state = await getState(store)
  const ready = state.assignments[0]
  expect(ready.status).toBe('strategy_decision')
  expect(ready.proposals).toHaveLength(2)
  expect(ready.strategyReview.version).toBe(2)
  expect(state.assignments).toHaveLength(1)
  expect(generate.mock.calls.map(([r])=>r.role)).toEqual(['omar','sarah','omar','emma','omar','emma'])
  expect(()=>goalDecision(state,{...ready,strategyReview:{...ready.strategyReview,version:1}},'approve','OK','now')).toThrow('review')
  for (const decision of ['reject','revise']) expect(goalDecision(state,ready,decision,'Change scope','now').assignments).toHaveLength(1)
  const approved = goalDecision(state,ready,'approve','Internal only','now')
  const running = memoryStore(approved)
  await manageAssignment(running,approved.assignments[0].id,generate)
  const [filed,parent] = (await getState(running)).assignments
  expect(filed.status).toBe('completed')
  expect(filed.review.version).toBe(filed.deliverable.version)
  expect(parent.status).toBe('filed')
  expect(parent.clearances).toBeUndefined()
  expect(()=>goalDecision({assignments:[parent]},parent,'approve','','now')).toThrow('review')
})


it('does not execute historical, orphaned or unapproved work and pauses on a failed consultation',async()=>{
  const legacy = createAssignment({id:'old',brief:'Legacy',at:'then'})
  const orphan = {...legacy,id:'orphan',kind:'delivery',parentId:'missing'}
  const goal = newGoal(['Assess report clarity'])
  const store = memoryStore({revision:0,assignments:[goal,legacy,orphan]})
  const generate = vi.fn().mockResolvedValueOnce(responses.scoping).mockRejectedValue(new Error('unavailable'))
  for (const id of ['old','orphan',goal.id,goal.id]) await manageAssignment(store,id,generate)
  const saved = (await getState(store)).assignments[0]
  expect(saved.status).toBe('consulting')
  expect(saved.requests[0].role).toBe('sarah')
  expect(saved.pause).toBeTruthy()
  expect(generate).toHaveBeenCalledTimes(2)
})

it('assigns each approved action to its own objective within a consolidated strategy', async () => {
  const goal = newGoal(['Clarify survey assumptions', 'Define a reader trial'])
  const generate = vi.fn(async request => {
    if (request.role === 'sarah') return responses.researching
    if (request.role === 'emma') return {verdict:'PASS', reasons:'Both outcomes have owners and evidence criteria.'}
    if (!request.input.research) return responses.scoping
    return {...sample, objectivePlans: [sample.objectivePlans[0], {
      baseline:'No trial recorded', target:'A reusable reader question',
      actions:[{lead:'sarah',brief:'Prepare the reader question',criteria:'Check comprehension without coaching.',deadline:'Following the wording review'}],
    }]}
  })
  const store = memoryStore({revision:0,assignments:[goal]})
  await manageAssignment(store,goal.id,generate)
  const state = await getState(store)
  const approved = goalDecision(state,state.assignments[0],'approve','Trial internally','now')
  const deliveries = approved.assignments.filter(t=>t.kind === 'delivery')
  expect(deliveries.map(t=>[t.objectiveIndex,t.delegation.specialist,t.approvedVersion])).toEqual([[0,'daniel',1],[1,'sarah',1]])
  expect(deliveries.every(t=>t.parentId === goal.id)).toBe(true)
})
