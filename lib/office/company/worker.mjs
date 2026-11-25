import { readOffice, updateOffice } from '../store.mjs'
import { company, daily } from './records.mjs'
import { agentStep } from './agents.mjs'
import { available, applyResult, claim, statusLine } from './work.mjs'
import { paidReply } from './allowance.mjs'
import { readSources } from './sources.mjs'

export async function changeCompany(store, change) {
  for (let i = 0; ; i++) {
    try {
      return await updateOffice(store, null, (state) => {
        const c = company(state)
        change(c)
        return { ...state, company: c }
      })
    } catch (e) {
      if (e.status !== 409 || i >= 12) throw e
      await new Promise((r) => setTimeout(r, 40 + i * 25))
    }
  }
}
export async function runCompany(
  store,
  { reply = (r, q) => paidReply(store, r, q), sources = readSources, clock = Date.now } = {}
) {
  const start = clock()
  const perform = async (snapshot, j) => {
    async function commit(fn) {
      await changeCompany(store, (c) => {
        const live = c.jobs.find((t) => t.id === j.id)
        if (live?.lease?.token === j.lease.token) fn(c, live)
      })
    }
    try {
      const evidence = j.stage === 'produce' ? await sources(snapshot.agents[j.agent].tools) : {}
      const output = await agentStep(snapshot, j, reply, evidence)
      await commit((c, live) => applyResult(c, live, output, evidence))
    } catch (e) {
      await commit((c, live) => statusLine(c, live, e))
    }
  }
  while (clock() - start < 200000) {
    const state = await readOffice(store)
    if (!state.company || !available(state.company).length) return
    let batch = []
    const saved = await changeCompany(store, (c) => {
      batch = claim(c)
    })
    if (!batch.length) return
    await Promise.all(batch.map((j) => perform(saved.company, j)))
  }
}
export async function scheduledRun(store) {
  const state = await readOffice(store)
  if (!state.company) return
  await changeCompany(store, (c) => daily(c))
  await runCompany(store)
}
