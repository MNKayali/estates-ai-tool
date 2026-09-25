/**
 * proxy.ts  (Next.js 16 — replaces middleware.ts)
 *
 * Guards protected routes with a signed-in user session (lib/session.js,
 * lib/auth.js). Accounts are invite-only and replaced the shared ACCESS_CODE in
 * September 2026.
 *
 * Cookies: projento_session (a user) · estate_admin (admin area, ADMIN_CODE)
 * Protected pages  → redirect to /login?from=<path> on failure
 * Protected API    → return 401 JSON on failure
 *
 * The session is checked against KV here (Next 16 runs proxy on Node), so a
 * disabled account or a changed password takes effect on the next request.
 * Fails closed: no KV, no COOKIE_SECRET in production, or any lookup error means
 * "not signed in". AUTH_OPEN=1 opens it in development only (scripts/dev-open.mjs).
 *
 * Report pages, report APIs and /api/rates-check also accept the admin cookie,
 * so the admin can open any report and see workbook health from the dashboard;
 * the report routes themselves then check the report's owner (authoriseReport
 * in lib/auth.js).
 *
 * Admin: /api/admin/* is gated separately against ADMIN_CODE (estate_admin
 * cookie). /api/admin/login is public (it issues the cookie). The /admin page
 * itself is not gated here — it self-gates by calling the admin API and showing
 * a login form on 401, so the bare shell leaks no data.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyAccessCode } from '@/lib/cookieAuth'
import { getSessionUser, isAdminRequest } from '@/lib/auth'

const PROTECTED_PAGES = ['/questionnaire', '/report', '/reports']
// /api/warm-prose and /api/rates-check are gated because both are expensive to
// call, not because they return anything secret: warm-prose makes two real
// Anthropic requests and can hold a function open for ~50s, and rates-check
// re-downloads both remote workbooks. Left open, either one is a cheap way for an
// anonymous caller to burn API credit, exhaust function concurrency, or get the
// deployment rate-limited by the workbook host — which would take the cost and
// programme calculators down with it.
const PROTECTED_API   = [
  '/api/generate-report', '/api/reports', '/api/report-pdf', '/api/feedback',
  '/api/warm-prose', '/api/rates-check', '/api/compare', '/api/suggest-scope',
  '/api/my-reports', '/api/auth/me', '/api/auth/change-password',
]
// Where the admin cookie is accepted in place of a user session: any report
// (the dashboard's "View" links) and the workbook health check it displays.
const ADMIN_ALLOWED_PATHS = ['/report/', '/api/reports/', '/api/report-pdf/', '/api/rates-check']

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
    return NextResponse.json(
      { error: 'Admin authentication required.' },
      { status: 401 }
    )
  }

  const isProtectedPage = PROTECTED_PAGES.some(p => pathname.startsWith(p))
  const isProtectedApi  = PROTECTED_API.some(p => pathname.startsWith(p))

  if (!isProtectedPage && !isProtectedApi) return NextResponse.next()

  if (await getSessionUser(request)) return NextResponse.next()
  if (ADMIN_ALLOWED_PATHS.some(p => pathname.startsWith(p)) && await isAdminRequest(request)) {
    return NextResponse.next()
  }

  // Blocked — return 401 for API, redirect to /login for pages
  if (isProtectedApi) {
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
    '/report/:path*',
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
