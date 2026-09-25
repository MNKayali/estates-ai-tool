/**
 * lib/auth.js — who is making this request, and may they see this report.
 *
 * Used by proxy.ts (the gate) and by route handlers that need the user's id
 * (generate-report stamps the owner; report routes check ownership). A token is
 * only honoured while its account exists, is active, and its sessionVersion
 * matches the one in KV — so a password change or a disabled account takes
 * effect on the next request, not at cookie expiry.
 *
 * AUTH_OPEN=1 (development only, set by scripts/dev-open.mjs) skips sign-in and
 * treats every request as a local developer account, so local verification and
 * scripts/make-sample.mjs work without KV. It is ignored in production.
 */
import { SESSION_COOKIE, verifySessionToken } from './session.js'
import { verifyAccessCode } from './cookieAuth.js'
import { getUser } from './users.js'

export const DEV_USER = Object.freeze({
  uid: 'dev', email: 'dev@localhost', name: 'Local developer', status: 'active', sessionVersion: 0,
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

/**
 * True when the request carries a valid admin cookie. Fails closed in
 * production when ADMIN_CODE is unset (matching proxy.ts).
 */
export async function isAdminRequest(request) {
  const code = process.env.ADMIN_CODE
  if (!code) return process.env.NODE_ENV !== 'production'
  return verifyAccessCode(readCookie(request, 'estate_admin'), code)
}

/**
 * A report with an owner is visible to that owner and to the admin. A report
 * from before accounts existed (no ownerId — generated under the shared access
 * code, and expiring within 90 days) stays visible to any signed-in user, as it
 * was to any code holder.
 */
export function canViewReport(user, record, isAdmin = false) {
  if (!record) return false
  if (isAdmin) return true
  if (!user) return false
  if (!record.ownerId) return true
  return record.ownerId === user.uid
}

/** Standard 401 for an API route reached without a valid session. */
export function unauthorisedResponse() {
  return Response.json({ error: 'Please sign in to continue.' }, { status: 401 })
}

/**
 * Report-route guard: returns `{ user, isAdmin }` when the caller may see the
 * record, else a Response to return (401 signed out, 404 someone else's — a
 * 403 would confirm the id exists).
 */
export async function authoriseReport(request, record) {
  const [user, isAdmin] = await Promise.all([getSessionUser(request), isAdminRequest(request)])
  if (!user && !isAdmin) return { response: unauthorisedResponse() }
  if (!canViewReport(user, record, isAdmin)) {
    return { response: Response.json({ error: 'Report not found.' }, { status: 404 }) }
  }
  return { user, isAdmin }
}
