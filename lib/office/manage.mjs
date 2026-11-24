import { OfficeError, readOffice, updateOffice } from './store.mjs'
import { runStage } from './run-stage.mjs'
import { sharedWork } from './roles.mjs'

import { authorisedDelivery, closeDeliveredGoals, planStage, planningStages, sharedKnowledge } from './goals.mjs'

const active = new Set(['queued', 'assigned', 'in_progress', 'revision_requested', 'awaiting_quality_review', 'with_gm'])
export const needsManagement = task => !task.pause && (task.kind === 'goal' ? planningStages.includes(task.status) : task.kind === 'delivery' && active.has(task.status))

async function saveStage(store, before, next) {
  // A chat may hold the office lock while waiting for a model reply. Keep the
  // generated result and merge it into the latest office record on release.
  for (let attempt = 0; ; attempt++) {
    try {
      await updateOffice(store, null, current => {
        const saved = current.assignments.find(task => task.id === before.id)
        if (!saved || saved.history.length !== before.history.length || saved.status !== before.status || saved.pause !== before.pause) {
          throw new OfficeError('Assignment already moved on.', 412)
        }
        return { ...current, assignments: closeDeliveredGoals(current.assignments.map(task => task.id === before.id ? next : task)) }
      })
      return
    } catch (error) {
      if (error.status !== 409 || attempt >= 35) throw error
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
}

export async function manageAssignment(store, id, generate) {
  const key = 'projento:office:v1:manager:' + id
  const token = crypto.randomUUID()
  if (!await store.set(key, token, { nx: true, ex: 260 })) return
  try {
    const start = Date.now()
    while (Date.now() - start < 180000) {
      const state = await readOffice(store)
      const task = state.assignments.find(item => item.id === id)
      if (!task || !needsManagement(task)) return
      if (task.kind === 'delivery' && !authorisedDelivery(task,state)) return
      let next
      try {
        if (task.history.length >= 25) throw new OfficeError('The team needs a new direction after several revisions.', 409)
        const knowledge = sharedKnowledge(state)
        if (task.kind === 'goal') next = await planStage(task,{generate,knowledge,maxRounds:state.maxRounds ?? 2})
        else {
          const parent = state.assignments.find(t=>t.id === task.parentId)
          if (task.history.filter(e=>e.action === 'delivered').length >= (state.maxRounds ?? 2) && task.status === 'revision_requested') throw new OfficeError('Revision limit reached. Review the feedback before authorising further work.',409)
          next = await runStage(task, {generate, strategy: parent.approved.summary, officeWork: sharedWork(state).slice(0,5), knowledge})
          if (next.status === 'awaiting_owner_review') next = {...next,status:'completed',history:[...next.history,{by:'omar',action:'filed',at:new Date().toISOString(),note:'Internal result filed following Emma’s review.'}]}
        }
      } catch (error) {
        next = { ...task, pause: error instanceof OfficeError ? error.message : 'The team could not finish this step. The previous handovers are saved.' }
      }
      await saveStage(store, task, next)
    }
  } finally {
    await store.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0", [key], [token])
  }
}
