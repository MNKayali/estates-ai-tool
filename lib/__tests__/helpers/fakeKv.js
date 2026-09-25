/**
 * In-memory stand-in for the subset of @vercel/kv the account code uses.
 * `ex` is recorded but not enforced; tests that need expiry delete the key.
 */
export function createFakeKv() {
  const store = new Map()
  const ttl = new Map()
  const clone = v => (v === undefined ? null : JSON.parse(JSON.stringify(v)))
  return {
    store, ttl,
    async get(k) { return store.has(k) ? clone(store.get(k)) : null },
    async set(k, v, opts = {}) {
      if (opts.nx && store.has(k)) return null
      store.set(k, clone(v))
      if (opts.ex) ttl.set(k, opts.ex); else ttl.delete(k)
      return 'OK'
    },
    async getdel(k) { const v = store.has(k) ? clone(store.get(k)) : null; store.delete(k); return v },
    async del(k) { const had = store.delete(k); ttl.delete(k); return had ? 1 : 0 },
    async sadd(k, m) { const s = new Set(store.get(k) || []); s.add(m); store.set(k, [...s]); return 1 },
    async smembers(k) { return clone(store.get(k) || []) },
    async hset(k, obj) { store.set(k, { ...(store.get(k) || {}), ...clone(obj) }); return 1 },
    async hgetall(k) { const h = store.get(k); return h && Object.keys(h).length ? clone(h) : null },
    async hdel(k, f) { const h = { ...(store.get(k) || {}) }; delete h[f]; store.set(k, h); return 1 },
    async lpush(k, v) { store.set(k, [clone(v), ...(store.get(k) || [])]); return 1 },
    async ltrim() { return 'OK' },
    async expire(k, s) { ttl.set(k, s); return 1 },
  }
}
