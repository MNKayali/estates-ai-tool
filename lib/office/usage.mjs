import { OfficeError } from './store.mjs'
import { generateOfficeOutput, officeModel } from './provider.mjs'

// Anthropic standard USD rates per million tokens, stored as nanodollars per
// token to keep Redis totals integral. No prompt caching is requested.
const haiku = new Set(['claude-haiku-4-5-20251001', 'claude-haiku-4-5'])
export const pricedModel = model => haiku.has(model)
const maxHold = 200000 * 1000 + 2200 * 5000
const prefix = 'projento:office:v1:'
const monthKey = date => prefix + 'usage:' + date.toISOString().slice(0, 7)
const dailyKey = date => prefix + 'calls:' + date.toISOString().slice(0, 10)
const reserve = `
local office = cjson.decode(redis.call('get', KEYS[1]) or '{}')
local budget = tonumber(office.monthlyBudgetCents or 0) * 10000000
local held = tonumber(redis.call('hget', KEYS[2], 'held') or 0)
local spent = tonumber(redis.call('hget', KEYS[2], 'spent') or 0)
if budget > 0 then
  if ARGV[3] ~= '1' then return -3 end
  if ARGV[2] == 'background' then budget = math.floor(budget * 0.8) end
  if spent + held + tonumber(ARGV[1]) > budget then return -2 end
elseif tonumber(redis.call('get', KEYS[3]) or 0) >= 12 then return -1 end
if ARGV[5] == '1' then
  if ARGV[3] ~= '1' then return -3 end
  local scope = redis.call('hmget', KEYS[4], 'spent', 'held', 'calls')
  if tonumber(scope[3] or 0) >= tonumber(office.maxScopeCalls or 18) then return -4 end
  if tonumber(scope[1] or 0) + tonumber(scope[2] or 0) + tonumber(ARGV[1]) > tonumber(office.maxTaskCents or 100) * 10000000 then return -5 end
  redis.call('hincrby', KEYS[4], 'held', ARGV[1])
  redis.call('hincrby', KEYS[4], 'calls', 1)
end
redis.call('incr', KEYS[3])
redis.call('expire', KEYS[3], 172800)
redis.call('hsetnx', KEYS[2], 'since', ARGV[4])
redis.call('hincrby', KEYS[2], 'held', ARGV[1])
redis.call('hincrby', KEYS[2], 'calls', 1)
return 1`

const settle = `
if not redis.call('set', KEYS[2], '1', 'NX', 'EX', 86400) then return 0 end
redis.call('hincrby', KEYS[1], 'held', -tonumber(ARGV[1]))
redis.call('hincrby', KEYS[1], 'spent', ARGV[2])
for i = 7, #ARGV do
  local scope = ARGV[i]
  redis.call('hincrby', KEYS[1], scope .. ':calls', 1)
  redis.call('hincrby', KEYS[1], scope .. ':tokens', ARGV[3])
  redis.call('hincrby', KEYS[1], scope .. ':ms', ARGV[4])
  redis.call('hincrby', KEYS[1], scope .. ':cost', ARGV[2])
  redis.call('hincrby', KEYS[1], scope .. ':unknown', ARGV[5])
  redis.call('hincrby', KEYS[1], scope .. ':failed', ARGV[6])
end
if #KEYS == 3 then
  redis.call('hincrby', KEYS[3], 'held', -tonumber(ARGV[1]))
  redis.call('hincrby', KEYS[3], 'spent', ARGV[2])
end
return 1`

export function priceUsage(usage, model) {
  if (!usage || !Number.isSafeInteger(usage.input_tokens) || !Number.isSafeInteger(usage.output_tokens)) return null
  const input = usage.input_tokens, output = usage.output_tokens
  const cached = usage.cache_read_input_tokens ?? 0, written = usage.cache_creation_input_tokens ?? 0
  const hourly = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0
  if (![input, output, cached, written, hourly].every(value => Number.isSafeInteger(value) && value >= 0) || hourly > written) return null
  return { tokens: input + output + cached + written, cost: pricedModel(model)
    ? input * 1000 + output * 5000 + cached * 100 + (written - hourly) * 1250 + hourly * 2000 : null }
}

export async function trackedReply(store, request, { role, taskId, scopeId = taskId, background = false }) {
  const date = new Date()
  const key = monthKey(date)
  const model = officeModel()
  const hold = pricedModel(model) ? maxHold : 0
  const scopeKey = prefix + 'scope:' + (scopeId || 'chat')
  const result = await store.eval(reserve, [prefix + 'state', key, dailyKey(date), scopeKey],
    [hold, background ? 'background' : 'conversation', pricedModel(model) ? 1 : 0, date.toISOString(), taskId ? 1 : 0])
  if (result === -1) throw new OfficeError('The office has used its 12 calls today. Quick briefing is available. A monthly budget can be set under Usage.', 429)
  if (result === -2) throw new OfficeError(background ? 'Team work paused to protect your monthly budget and conversation allowance.' : 'There is insufficient monthly budget for another reply. Quick briefing is available.', 429)
  if (result === -4) throw new OfficeError('Call limit reached for this work. Review the record before changing its allowance.',429)
  if (result === -5) throw new OfficeError('The cost limit for this work cannot cover another reply.',429)
  if (result !== 1) throw new OfficeError('Pricing for this model must be confirmed before using a monthly budget.', 503)
  const start = Date.now()
  let measured, failed = true, rejected = false
  try {
    const output = await generateOfficeOutput(request, (usage, actualModel) => { measured = priceUsage(usage, actualModel || model) })
    failed = false
    return output
  } catch (error) {
    rejected = error.providerRejected === true
    throw error
  } finally {
    const known = rejected || measured?.cost != null
    const keys = [key, prefix + 'settled:' + crypto.randomUUID()]
    if (taskId) keys.push(scopeKey)
    const args = [known ? hold : 0, measured?.cost ?? 0, measured?.tokens ?? 0, Date.now() - start,
      known ? 0 : 1, failed ? 1 : 0, 'office', 'role.' + role]
    if (taskId) args.push('task.' + taskId)
    try { await store.eval(settle, keys, args) } catch { await store.eval(settle, keys, args) }
  }
}

export async function usageSummary(store) {
  const date = new Date()
  const [metrics, callsToday] = await Promise.all([store.hgetall(monthKey(date)), store.get(dailyKey(date))])
  return { month: date.toISOString().slice(0, 7), metrics: metrics ?? {}, callsToday: Number(callsToday ?? 0), model: officeModel(), priced: pricedModel(officeModel()) }
}
