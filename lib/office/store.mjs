import { createClient } from '@vercel/kv'

const stateKey = 'projento:office:v1:state'
const lockKey = 'projento:office:v1:lock'
const unlock = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0"
const save = "if redis.call('get', KEYS[1]) == ARGV[1] then redis.call('set', KEYS[2], ARGV[2]); redis.call('del', KEYS[1]); return 1 end return 0"

export class OfficeError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

export function officeStore() {
  const url = (process.env.OFFICE_KV_REST_API_URL || process.env.KV_REST_API_URL)
  const token = (process.env.OFFICE_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN)
  if (!url || !token) throw new OfficeError('Private office storage is not configured.', 503)
  return createClient({ url, token, retry: false, cache: 'no-store', signal: () => AbortSignal.timeout(2500) })
}

export async function readOffice(store) {
  return await store.get(stateKey) ?? { revision: 0, assignments: [], chats: {}, strategy: '' }
}

export async function updateOffice(store, expectedRevision, change) {
  const token = crypto.randomUUID()
  if (!await store.set(lockKey, token, { nx: true, ex: 55 })) {
    throw new OfficeError('Another office action is running. Refresh and try again.', 409)
  }
  try {
    const state = await readOffice(store)
    if (expectedRevision !== null && state.revision !== expectedRevision) {
      throw new OfficeError('The office has changed. Refresh and try again.', 409)
    }
    const next = { ...await change(state), revision: state.revision + 1 }
    if (!await store.eval(save, [lockKey, stateKey], [token, JSON.stringify(next)])) {
      throw new OfficeError('The office action expired before it could be saved.', 409)
    }
    return next
  } finally {
    await store.eval(unlock, [lockKey], [token]).catch(() => {})
  }
}
