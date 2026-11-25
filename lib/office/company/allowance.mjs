import { generateOfficeOutput, officeModel } from '../provider.mjs'
import { pricedModel, priceUsage } from '../usage.mjs'

const reserve = `
local c = cjson.decode(redis.call('get',KEYS[1])).company
local agent = c.agents[ARGV[1]]
local limits = {c.monthlyCents, agent.dailyCents, agent.monthlyCents}
for i = 1, 3 do
  local totals = redis.call('hmget',KEYS[i+1],'spent','held')
  if tonumber(totals[1] or 0)+tonumber(totals[2] or 0)+tonumber(ARGV[2]) > limits[i]*10000000 then return i end
end
for i=2,4 do redis.call('hincrby',KEYS[i],'held',ARGV[2]) end
return 0`
const settle = `
if not redis.call('set', KEYS[4],1,'NX','EX',604800) then return 0 end
for i=1,3 do
  redis.call('hincrby',KEYS[i],'held',-tonumber(ARGV[1]))
  redis.call('hincrby',KEYS[i],'spent',ARGV[2])
  redis.call('hincrby',KEYS[i],'calls',1)
  redis.call('hincrby',KEYS[i],'tokens',ARGV[3])
end
return 1`

export async function paidReply(store, role, request) {
  const model = officeModel()
  if (!pricedModel(model))
    throw Object.assign(new Error('The configured model needs a verified price.'), { manual: true })
  const date = new Date()
  const day = date.toISOString().slice(0, 10),
    month = day.slice(0, 7)
  const prefix = 'projento:office:v1:'
  const keys = [
    prefix + 'usage:' + month,
    prefix + 'agent:' + role + ':' + day,
    prefix + 'agent:' + role + ':' + month
  ]
  // Conservative reservation for the entire supported input window and response.
  const hold = 211000000
  const limit = await store.eval(reserve, [prefix + 'state', ...keys], [role, hold])
  if (limit) {
    const boundary = new Date(date)
    boundary.setUTCHours(0, 0, 0, 0)
    if (limit === 2) boundary.setUTCDate(boundary.getUTCDate() + 1)
    else {
      boundary.setUTCDate(1)
      boundary.setUTCMonth(boundary.getUTCMonth() + 1)
    }
    const reason = [
      '',
      'the office monthly allowance',
      'the agent’s daily allowance',
      'the agent’s monthly allowance'
    ][limit]
    throw Object.assign(new Error('There is insufficient room in ' + reason + ' for another reply.'), {
      resume: boundary.toISOString(),
      budget: true
    })
  }
  let measured,
    rejected = false
  try {
    return await generateOfficeOutput(request, (usage, actual) => {
      measured = priceUsage(usage, actual || model)
    })
  } catch (e) {
    rejected = Boolean(e.providerRejected)
    throw e
  } finally {
    const known = rejected || measured?.cost != null
    const args = [known ? hold : 0, measured?.cost || 0, measured?.tokens || 0]
    const settlement = [...keys, prefix + 'company-settlement:' + crypto.randomUUID()]
    try {
      await store.eval(settle, settlement, args)
    } catch {
      await store.eval(settle, settlement, args)
    }
  }
}
