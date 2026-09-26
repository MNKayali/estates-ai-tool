/**
 * lib/trial.js — the anonymous free trial (server only).
 *
 * A visitor who has not signed up may generate TRIAL_LIMIT reports in total (a
 * flat limit, not per week). They are identified by a random id in the signed
 * `projento_trial` cookie (lib/session.js); the count lives in KV, never in the
 * browser:
 *
 *   trial:<tid>:count      reports generated (INCR), kept a year
 *   trial:<tid>:reports    set of their report ids, until claimed by an account
 *   trial:ip:<hash>        reports from one IP in a 30-day window (the backstop
 *                          against clearing cookies). The IP is stored only as a
 *                          keyed SHA-256, never in the clear.
 *   stats:trial:limitHit   set of visitor ids refused at the limit
 *   stats:trial:converted  set of those who then created an account
 *
 * The IP limit is deliberately generous: an NHS trust, a university or a
 * council puts hundreds of staff behind one address, and a tight per-IP rule
 * would lock out a whole organisation. It is a nudge, not a vault.
 *
 * A place is reserved atomically (INCR) before the report is generated and
 * given back if generation fails, so two simultaneous submits cannot both take
 * the last free report, and a failed generation does not count.
 *
 * Like lib/users.js these functions throw on a KV error; the caller decides
 * (generate-report refuses in production rather than run uncounted).
 */
import { kv } from '@vercel/kv'
import { createHash, randomBytes } from 'node:crypto'
import { claimReport } from './kv.js'

export const TRIAL_LIMIT = 3
export const TRIAL_IP_LIMIT = 15
const IP_WINDOW = 60 * 60 * 24 * 30      // 30 days
const COUNT_TTL = 60 * 60 * 24 * 365     // matches the cookie
const REPORTS_TTL = 60 * 60 * 24 * 91    // a day past the reports' own 90

const countKey = tid => `trial:${tid}:count`
const reportsKey = tid => `trial:${tid}:reports`

export function newTrialId() {
  return randomBytes(8).toString('hex')
}

export function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}

function ipKey(request) {
  const salt = process.env.COOKIE_SECRET || 'development-only-ip-salt'
  return `trial:ip:${createHash('sha256').update(`${salt}:${clientIp(request)}`).digest('hex').slice(0, 32)}`
}

/** `{ limit, used, remaining }` for a visitor (no id → nothing used yet). */
export async function trialStatus(tid) {
  const used = tid ? Number(await kv.get(countKey(tid))) || 0 : 0
  return { limit: TRIAL_LIMIT, used, remaining: Math.max(0, TRIAL_LIMIT - used) }
}

/**
 * Reserve one free report. Returns `{ ok: true, release }` — call release() if
 * the report is then not created — or `{ ok: false, reason }` with reason
 * 'visitor-limit' or 'ip-limit'.
 */
export async function reserveTrialReport(tid, request) {
  const ck = countKey(tid)
  const count = await kv.incr(ck)
  await kv.expire(ck, COUNT_TTL)
  if (count > TRIAL_LIMIT) {
    await kv.decr(ck)
    await kv.sadd('stats:trial:limitHit', tid)
    return { ok: false, reason: 'visitor-limit' }
  }
  const ik = ipKey(request)
  const ipCount = await kv.incr(ik)
  if (ipCount === 1) await kv.expire(ik, IP_WINDOW)
  if (ipCount > TRIAL_IP_LIMIT) {
    await Promise.all([kv.decr(ik), kv.decr(ck)])
    await kv.sadd('stats:trial:limitHit', tid)
    return { ok: false, reason: 'ip-limit' }
  }
  let released = false
  return {
    ok: true,
    async release() {
      if (released) return
      released = true
      await Promise.all([kv.decr(ck), kv.decr(ik)]).catch(e => console.warn('[trial] release failed:', e.message))
    },
  }
}

/** Remember which reports a visitor made, so an account can claim them later. */
export async function recordTrialReport(tid, reportId) {
  await kv.sadd(reportsKey(tid), reportId)
  await kv.expire(reportsKey(tid), REPORTS_TTL)
}

/**
 * Move a visitor's reports to an account (on sign-up or sign-in): each becomes
 * owned, loses its 90-day expiry and joins the account's list. `signedUp` marks
 * a trial conversion when the visitor had been refused at the limit. Returns
 * the number of reports claimed.
 */
export async function claimTrialReports(tid, uid, { signedUp = false } = {}) {
  if (!tid || !uid) return 0
  const ids = (await kv.smembers(reportsKey(tid))) || []
  let claimed = 0
  for (const id of ids) {
    if (await claimReport(id, tid, uid)) claimed++
  }
  await kv.del(reportsKey(tid))
  if (signedUp && await kv.sismember('stats:trial:limitHit', tid)) {
    await kv.sadd('stats:trial:converted', tid)
  }
  return claimed
}

/** Trial conversion counts for the admin dashboard. */
export async function trialStats() {
  const [limitHit, converted] = await Promise.all([
    kv.scard('stats:trial:limitHit'),
    kv.scard('stats:trial:converted'),
  ])
  return { limitHit: limitHit || 0, converted: converted || 0 }
}
