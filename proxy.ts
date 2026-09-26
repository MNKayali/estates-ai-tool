/**
 * proxy.ts  (Next.js 16 — replaces middleware.ts)
 *
 * Who may reach what (public free trial, September 2026 — the shared
 * ACCESS_CODE is retired):
 *
 * Cookies: projento_session (a user) · projento_trial (a free-trial visitor,
 * lib/trial.js) · estate_admin (admin area, ADMIN_CODE)
 *
 * - Open pages: /questionnaire and /report/[id] need no sign-in. A visitor
 *   arriving at the questionnaire without a session or trial cookie is given a
 *   trial cookie here, so every API call the page makes carries it. The report
 *   routes themselves decide who may see a report (authoriseReport in
 *   lib/auth.js: owner, the trial visitor who made it, or the admin).
 * - Account pages (/reports) → redirect to /login?from=<path> when signed out.
 * - Account APIs (my-reports, auth/me, change-password) → 401 JSON without a
 *   session.
 * - Caller APIs (generate-report, reports/*, report-pdf, compare,
 *   suggest-scope, feedback, warm-prose) → 401 JSON unless the request carries
 *   a session, a valid trial cookie or the admin cookie. Cheap first line only;
 *   each route checks its own rule (the trial allowance, report ownership,
 *   downloads need an account).
 * - Admin: /api/admin/* and /api/rates-check need the admin cookie.
 *   /api/admin/login is public (it issues the cookie). The /admin page itself
 *   is not gated here — it self-gates by calling the admin API.
 *
 * The session is checked against KV here (Next 16 runs proxy on Node), so a
 * disabled or deleted account or a changed password takes effect on the next
 * request. Fails closed: no KV, no COOKIE_SECRET in production, or any lookup
 * error means "not signed in". AUTH_OPEN=1 opens sign-in in development only
 * (scripts/dev-open.mjs).
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyAccessCode } from '@/lib/cookieAuth'
import { getSessionUser, getTrialId, isAdminRequest } from '@/lib/auth'
import { TRIAL_COOKIE, createTrialToken, sessionCookieOptions, TRIAL_MAX_AGE } from '@/lib/session'

const ACCOUNT_PAGES = ['/reports']
const ACCOUNT_API   = ['/api/my-reports', '/api/auth/me', '/api/auth/change-password']
// /api/warm-prose and /api/rates-check are gated because both are expensive to
// call, not because they return anything secret: warm-prose makes two real
// Anthropic requests (and is throttled globally in the route), and rates-check
// re-downloads both remote workbooks — admin only since the trial went public.
// report-pdf is here rather than with the account APIs so a trial visitor gets
// the route's own "create a free account" refusal (downloadRequiresAccount),
// which the page turns into the sign-up dialog.
const CALLER_API    = [
  '/api/generate-report', '/api/reports', '/api/report-pdf', '/api/compare',
  '/api/suggest-scope', '/api/feedback', '/api/warm-prose',
]
const ADMIN_API     = ['/api/rates-check']

function randomHex(bytes: number) {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('')
}

function adminRequired() {
  return NextResponse.json({ error: 'Admin authentication required.' }, { status: 401 })
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Admin API gate (distinct credential) ──────────────────────────────────
  // Evaluated first so admin endpoints never fall through to the user-session path.
  if (pathname.startsWith('/api/admin') && pathname !== '/api/admin/login') {
    const adminCode = process.env.ADMIN_CODE
    // Fail CLOSED when ADMIN_CODE is missing. An unset env var is the default
    // state of a fresh deployment, not an exotic edge case, and this branch
    // returns before the user-session gate below — so letting it through left the
    // admin API (every report's id and metadata, all free-text feedback, and a
    // config oracle naming which secrets are unset) open to the anonymous
    // internet. Dev convenience is kept, but only off production.
    if (!adminCode) {
      if (process.env.NODE_ENV !== 'production') return NextResponse.next()
      return NextResponse.json(
        { error: 'Admin area is not configured.' },
        { status: 401 }
      )
    }
    const adminCookie = request.cookies.get('estate_admin')?.value
    if (await verifyAccessCode(adminCookie, adminCode)) return NextResponse.next()
    return adminRequired()
  }

  if (ADMIN_API.some(p => pathname.startsWith(p))) {
    return (await isAdminRequest(request)) ? NextResponse.next() : adminRequired()
  }

  // ── The questionnaire: hand a new visitor a trial cookie ──────────────────
  if (pathname.startsWith('/questionnaire')) {
    if (await getTrialId(request)) return NextResponse.next()
    if (await getSessionUser(request)) return NextResponse.next()
    const res = NextResponse.next()
    const token = await createTrialToken(randomHex(8))
    if (token) res.cookies.set(TRIAL_COOKIE, token, { ...sessionCookieOptions(TRIAL_MAX_AGE), sameSite: 'lax' })
    return res
  }

  const isAccountPage = ACCOUNT_PAGES.some(p => pathname.startsWith(p))
  const isAccountApi  = ACCOUNT_API.some(p => pathname.startsWith(p))
  const isCallerApi   = CALLER_API.some(p => pathname.startsWith(p))
  if (!isAccountPage && !isAccountApi && !isCallerApi) return NextResponse.next()

  if (await getSessionUser(request)) return NextResponse.next()
  if (isCallerApi && await getTrialId(request)) return NextResponse.next()
  if (isCallerApi && await isAdminRequest(request)) return NextResponse.next()

  // Blocked — return 401 for API, redirect to /login for pages
  if (isAccountApi || isCallerApi) {
    return NextResponse.json(
      { error: 'Please sign in to continue.' },
      { status: 401 }
    )
  }

  const dest = request.nextUrl.clone()
  dest.pathname = '/login'
  dest.search = ''
  dest.searchParams.set('from', pathname)
  return NextResponse.redirect(dest)
}

export const config = {
  matcher: [
    '/questionnaire/:path*',
    '/reports/:path*',
    '/api/generate-report/:path*',
    '/api/reports/:path*',
    '/api/report-pdf/:path*',
    '/api/feedback/:path*',
    '/api/warm-prose/:path*',
    '/api/rates-check/:path*',
    '/api/compare/:path*',
    '/api/suggest-scope/:path*',
    '/api/my-reports/:path*',
    '/api/auth/me/:path*',
    '/api/auth/change-password/:path*',
    '/api/admin/:path*',
  ],
}
