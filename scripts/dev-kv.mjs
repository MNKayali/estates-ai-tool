/**
 * scripts/dev-kv.mjs — `next dev` with real sign-in, the free trial and the
 * admin gate, backed by an in-memory stand-in for Upstash (Vercel KV).
 *
 * scripts/dev-open.mjs opens every gate, which is right for checking the report
 * but cannot show accounts, the free trial or who may see which report. This
 * starts a tiny server speaking the subset of the Upstash REST protocol the app
 * uses (lib/kv.js, lib/users.js, lib/trial.js), points KV_REST_API_URL at it
 * and runs `next dev` exactly as gated as production:
 *
 *   - sign-up, sign-in, sessions, the trial allowance and report ownership are real;
 *   - the admin code is `local-admin` (set ADMIN_CODE yourself to change it);
 *   - rate limiting fails open (the stand-in has no Lua), as it does on a KV outage;
 *   - everything is lost when the script stops. Never used in production.
 *
 * Extra arguments (e.g. --port 3001) go straight to `next dev`. The KV port is
 * DEV_KV_PORT (default 8079).
 */
import http from 'node:http'
import { spawn } from 'node:child_process'

const store = new Map()     // key → string | Set | Map | array
const expiry = new Map()    // key → epoch ms

function alive(k) {
  const t = expiry.get(k)
  if (t && t <= Date.now()) { store.delete(k); expiry.delete(k) }
  return store.has(k)
}
const b64 = v => Buffer.from(String(v)).toString('base64')
function encode(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return v
  if (v === 'OK') return 'OK'
  if (Array.isArray(v)) return v.map(encode)
  return b64(v)
}
const num = k => (alive(k) ? Number(store.get(k)) || 0 : 0)
const set = k => (alive(k) ? store.get(k) : new Set())
const hash = k => (alive(k) ? store.get(k) : new Map())
const list = k => (alive(k) ? store.get(k) : [])

function run([cmd, ...a]) {
  const c = String(cmd).toUpperCase()
  const k = a[0]
  switch (c) {
    case 'PING': return 'PONG'
    case 'GET': return alive(k) ? store.get(k) : null
    case 'SET': {
      const opts = a.slice(2).map(String)
      const up = opts.map(o => o.toUpperCase())
      if (up.includes('NX') && alive(k)) return null
      store.set(k, String(a[1]))
      const ex = up.indexOf('EX'), px = up.indexOf('PX')
      if (ex >= 0) expiry.set(k, Date.now() + Number(opts[ex + 1]) * 1000)
      else if (px >= 0) expiry.set(k, Date.now() + Number(opts[px + 1]))
      else expiry.delete(k)
      return 'OK'
    }
    case 'GETDEL': { const v = alive(k) ? store.get(k) : null; store.delete(k); expiry.delete(k); return v }
    case 'DEL': { let n = 0; for (const key of a) { if (alive(key)) n++; store.delete(key); expiry.delete(key) } return n }
    case 'EXPIRE': if (!alive(k)) return 0; expiry.set(k, Date.now() + Number(a[1]) * 1000); return 1
    case 'TTL': return !alive(k) ? -2 : expiry.has(k) ? Math.ceil((expiry.get(k) - Date.now()) / 1000) : -1
    case 'INCR': case 'DECR': case 'INCRBY': {
      const n = num(k) + (c === 'DECR' ? -1 : c === 'INCRBY' ? Number(a[1]) : 1)
      const keepTtl = alive(k)
      store.set(k, String(n)); if (!keepTtl) expiry.delete(k)
      return n
    }
    case 'SADD': { const s = set(k); let n = 0; for (const m of a.slice(1)) if (!s.has(String(m))) { s.add(String(m)); n++ } store.set(k, s); return n }
    case 'SREM': { const s = set(k); let n = 0; for (const m of a.slice(1)) if (s.delete(String(m))) n++; return n }
    case 'SMEMBERS': return [...set(k)]
    case 'SISMEMBER': return set(k).has(String(a[1])) ? 1 : 0
    case 'SCARD': return set(k).size
    case 'HSET': { const h = hash(k); let n = 0; for (let i = 1; i < a.length; i += 2) { if (!h.has(String(a[i]))) n++; h.set(String(a[i]), String(a[i + 1])) } store.set(k, h); return n }
    case 'HGETALL': return [...hash(k)].flat()
    case 'HDEL': { const h = hash(k); let n = 0; for (const f of a.slice(1)) if (h.delete(String(f))) n++; return n }
    case 'HLEN': return hash(k).size
    case 'HINCRBY': { const h = hash(k); const n = (Number(h.get(String(a[1]))) || 0) + Number(a[2]); h.set(String(a[1]), String(n)); store.set(k, h); return n }
    case 'LPUSH': { const l = list(k); l.unshift(...a.slice(1).map(String).reverse()); store.set(k, l); return l.length }
    case 'LTRIM': { const l = list(k); const end = Number(a[2]); store.set(k, l.slice(Number(a[1]), end < 0 ? l.length + end + 1 : end + 1)); return 'OK' }
    case 'LRANGE': { const l = list(k); const end = Number(a[2]); return l.slice(Number(a[1]), end < 0 ? l.length + end + 1 : end + 1) }
    case 'LLEN': return list(k).length
    default: throw new Error(`ERR dev-kv does not implement ${c}`)
  }
}

const kvPort = Number(process.env.DEV_KV_PORT) || 8079
http.createServer((req, res) => {
  let body = ''
  req.on('data', d => { body += d })
  req.on('end', () => {
    const b64mode = req.headers['upstash-encoding'] === 'base64'
    const reply = r => (b64mode ? { ...r, result: encode(r.result) } : r)
    const one = cmd => { try { return reply({ result: run(cmd) }) } catch (e) { return { error: e.message } } }
    let out
    try {
      const parsed = JSON.parse(body || '[]')
      if (req.url.startsWith('/pipeline') || req.url.startsWith('/multi-exec')) out = parsed.map(one)
      else out = one(parsed)
    } catch (e) {
      out = { error: e.message }
    }
    const failed = !Array.isArray(out) && out.error
    res.writeHead(failed ? 400 : 200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(out))
  })
}).listen(kvPort, '127.0.0.1', () => {
  console.log(`[dev-kv] in-memory KV on http://127.0.0.1:${kvPort} — admin code: ${process.env.ADMIN_CODE || 'local-admin'}`)
  const env = {
    ...process.env,
    KV_REST_API_URL: `http://127.0.0.1:${kvPort}`,
    KV_REST_API_TOKEN: 'dev-kv',
    ADMIN_CODE: process.env.ADMIN_CODE || 'local-admin',
    AUTH_OPEN: '',
    RATES_FILE_URL: process.env.RATES_FILE_URL || 'NRM1_Cost_Estimate_Tool_v5_2.xlsx',
    PROGRAMME_FILE_URL: process.env.PROGRAMME_FILE_URL || 'Estates_AI_Programme_v4_3.xlsx',
  }
  const child = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['next', 'dev', ...process.argv.slice(2)],
    { stdio: 'inherit', env, shell: process.platform === 'win32' },
  )
  child.on('exit', code => process.exit(code ?? 0))
})
