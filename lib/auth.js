/**
 * lib/auth.js — who is making this request, and may they see this report.
 *
 * Used by proxy.ts (the gate) and by route handlers that need the caller
 * (generate-report stamps the owner or the trial visitor; report routes check
 * ownership). A session token is only honoured while its account exists, is
 * active, and its sessionVersion matches the one in KV — so a password change,
 * a disabled or a deleted account takes effect on the next request, not at
 * cookie expiry.
 *
 * Three kinds of caller: a signed-in user (projento_session), a free-trial
 * visitor (projento_trial — lib/trial.js) and the admin (estate_admin). A
 * report is visible to its owner, to the trial visitor who made it until an
 * account claims it, and to the admin. Anyone else — including any visitor to a
 * report from before accounts existed, which has neither — gets a 404.
 *
 * AUTH_OPEN=1 (development only, set by scripts/dev-open.mjs) skips sign-in and
 * treats every request as a local developer account, so local verification and
 * scripts/make-sample.mjs work without KV. It is ignored in production.
 */
import { SESSION_COOKIE, TRIAL_COOKIE, verifySessionToken, verifyTrialToken } from './session.js'
import { verifyAccessCode } from './cookieAuth.js'
import { getUser } from './users.js'

export const DEV_USER = Object.freeze({
  uid: 'dev', email: 'dev@localhost', name: 'Local developer', status: 'active', sessionVersion: 0, tier: 'free',
})

export function authOpen() {
  return process.env.NODE_ENV !== 'production' && process.env.AUTH_OPEN === '1'
}

function readCookie(request, name) {
  const fromApi = request?.cookies?.get?.(name)?.value
  if (fromApi !== undefined) return fromApi
  const header = request?.headers?.get?.('cookie') || ''
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return undefined
}

/**
 * The signed-in, active user for this request, or null. Never throws: a KV
 * failure means "not signed in", which fails closed.
 */
export async function getSessionUser(request) {
  if (authOpen()) return DEV_USER
  const payload = await verifySessionToken(readCookie(request, SESSION_COOKIE))
  if (!payload) return null
  try {
    const user = await getUser(payload.uid)
    if (!user || user.status !== 'active') return null
    if ((user.sessionVersion || 0) !== payload.ver) return null
    return user
  } catch (e) {
    console.warn('[auth] session lookup failed:', e.message)
    return null
  }
}

/** The free-trial visitor id from a valid trial cookie, or null. */
export async function getTrialId(request) {
  return verifyTrialToken(readCookie(request, TRIAL_COOKIE))
}

/**
 * True when the request carries a valid admin cookie. Fails closed in
 * production when ADMIN_CODE is unset (matching proxy.ts).
 */
export async function isAdminRequest(request) {
  const code = process.env.ADMIN_CODE
  if (!code) return process.env.NODE_ENV !== 'production'
  return verifyAccessCode(readCookie(request, 'estate_admin'), code)
}

/** `{ user, trialId, isAdmin }` for this request — any of them may be empty. */
export async function getCaller(request) {
  const [user, trialId, isAdmin] = await Promise.all([
    getSessionUser(request), getTrialId(request), isAdminRequest(request),
  ])
  return { user, trialId, isAdmin }
}

/**
 * A report with an owner is visible to that owner; an unclaimed free-trial
 * report to the visitor who made it; the admin sees everything. A report from
 * before accounts existed has neither owner nor visitor, so only the admin can
 * open it (with public sign-up, "any signed-in user" would mean anyone).
 */
export function canViewReport(user, record, isAdmin = false, trialId = null) {
  if (!record) return false
  if (isAdmin) return true
  if (record.ownerId) return !!user && record.ownerId === user.uid
  if (record.anonId) return !!trialId && record.anonId === trialId
  return false
}

/** Standard 401 for an API route reached without a valid session. */
export function unauthorisedResponse() {
  return Response.json({ error: 'Please sign in to continue.' }, { status: 401 })
}

export const REPORT_NOT_FOUND = 'Report not found. It may have been deleted or expired, or it belongs to another account.'

/**
 * The 404 every report route gives both for a report that does not exist and
 * for one the caller may not see, so an id is never confirmed. `signIn` tells a
 * signed-out caller that signing in may help — it depends on the caller only.
 */
export function reportNotFoundResponse(user) {
  return Response.json({ error: REPORT_NOT_FOUND, signIn: !user }, { status: 404 })
}

/**
 * Report-route guard: returns `{ user, trialId, isAdmin }` when the caller may
 * see the record, else `{ response }` — always a 404 (see above).
 */
export async function authoriseReport(request, record) {
  const caller = await getCaller(request)
  if (!canViewReport(caller.user, record, caller.isAdmin, caller.trialId)) {
    return { response: reportNotFoundResponse(caller.user) }
  }
  return caller
}

/**
 * PDF and Word downloads need an account: a free-trial visitor can read their
 * report on screen, and signing up unlocks the files. Returns a 401 carrying
 * `signupRequired` for the page to open the sign-up dialog, or null.
 */
export function downloadRequiresAccount({ user, isAdmin }) {
  if (user || isAdmin) return null
  return Response.json(
    { error: 'Create a free account to download reports as PDF or Word.', signupRequired: true },
    { status: 401 },
  )
}

/**
 * For routes open to signed-in users and free-trial visitors alike (compare,
 * suggest-scope, feedback, warm-prose): the caller, or `{ response }` — a 401
 * when the request carries neither cookie.
 */
export async function requireCaller(request) {
  const caller = await getCaller(request)
  if (!caller.user && !caller.trialId && !caller.isAdmin) {
    return { response: Response.json({ error: 'Please reload the page and try again.' }, { status: 401 }) }
  }
  return caller
}
