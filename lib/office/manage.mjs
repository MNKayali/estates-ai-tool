import { OfficeError, readOffice, updateOffice } from './store.mjs'
import { runStage } from './run-stage.mjs'
import { sharedWork } from './roles.mjs'

const active = new Set(['queued', 'assigned', 'in_progress', 'revision_requested', 'awaiting_quality_review', 'with_gm'])
export const needsManagement = task => active.has(task.status) && !task.pause

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
        return { ...current, assignments: current.assignments.map(task => task.id === before.id ? next : task) }
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
      let next
      try {
        if (task.history.length >= 25) throw new OfficeError('The team needs a new direction after several revisions.', 409)
        next = await runStage(task, { generate, strategy: state.strategy, officeWork: sharedWork(state).slice(0, 8) })
      } catch (error) {
        next = { ...task, pause: error instanceof OfficeError ? error.message : 'The team could not finish this step. The previous handovers are saved.' }
      }
      await saveStage(store, task, next)
    }
  } finally {
    await store.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0", [key], [token])
  }
}
