/**
 * proxy.ts  (Next.js 16 — replaces middleware.ts)
 *
 * Guards all protected routes with an access-code cookie.
 * Set ACCESS_CODE in your environment variables (Vercel or .env.local).
 * If ACCESS_CODE is not set, all routes pass through (development mode).
 *
 * Cookie name: estate_access  (colleague access)  ·  estate_admin (admin area)
 * Protected pages  → redirect to /access on failure
 * Protected API    → return 401 JSON on failure
 *
 * Admin: /api/admin/* is gated separately against ADMIN_CODE (estate_admin
 * cookie). /api/admin/login is public (it issues the cookie). The /admin page
 * itself is not gated here — it self-gates by calling the admin API and showing
 * a login form on 401, so the bare shell leaks no data.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyAccessCode } from '@/lib/cookieAuth'

const PROTECTED_PAGES = ['/questionnaire', '/report']
// /api/warm-prose and /api/rates-check are gated because both are expensive to
// call, not because they return anything secret: warm-prose makes two real
// Anthropic requests and can hold a function open for ~50s, and rates-check
// re-downloads both remote workbooks. Left open, either one is a cheap way for an
// anonymous caller to burn API credit, exhaust function concurrency, or get the
// deployment rate-limited by the workbook host — which would take the cost and
// programme calculators down with it.
const PROTECTED_API   = [
  '/api/generate-report', '/api/reports', '/api/report-pdf', '/api/feedback',
  '/api/warm-prose', '/api/rates-check',
]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Admin API gate (distinct credential) ──────────────────────────────────
  // Evaluated first so admin endpoints never fall through to the access-code path.
  if (pathname.startsWith('/api/admin') && pathname !== '/api/admin/login') {
    const adminCode = process.env.ADMIN_CODE
    // Fail CLOSED when ADMIN_CODE is missing. An unset env var is the default
    // state of a fresh deployment, not an exotic edge case, and this branch
    // returns before the ACCESS_CODE gate below — so letting it through left the
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

  const validCode = process.env.ACCESS_CODE

  // If ACCESS_CODE is not configured, pass through (local dev without the var set)
  if (!validCode) return NextResponse.next()

  const cookieVal = request.cookies.get('estate_access')?.value

  if (await verifyAccessCode(cookieVal, validCode)) return NextResponse.next()

  // Blocked — return 401 for API, redirect to /access for pages
  if (isProtectedApi) {
    return NextResponse.json(
      { error: 'Unauthorised. Enter your access code at /access.' },
      { status: 401 }
    )
  }

  const dest = request.nextUrl.clone()
  dest.pathname = '/access'
  dest.searchParams.set('from', pathname)
  return NextResponse.redirect(dest)
}

export const config = {
  matcher: [
    '/questionnaire/:path*',
    '/report/:path*',
    '/api/generate-report/:path*',
    '/api/reports/:path*',
    '/api/report-pdf/:path*',
    '/api/feedback/:path*',
    '/api/warm-prose/:path*',
    '/api/rates-check/:path*',
    '/api/admin/:path*',
  ],
}
