/**
 * proxy.ts  (Next.js 16 — replaces middleware.ts)
 *
 * Guards all protected routes with an access-code cookie.
 * Set ACCESS_CODE in your environment variables (Vercel or .env.local).
 * If ACCESS_CODE is not set, all routes pass through (development mode).
 *
 * Cookie name: estate_access
 * Protected pages  → redirect to /access on failure
 * Protected API    → return 401 JSON on failure
 */
import { NextRequest, NextResponse } from 'next/server'

const PROTECTED_PAGES = ['/questionnaire', '/report']
const PROTECTED_API   = ['/api/generate-report', '/api/reports']

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isProtectedPage = PROTECTED_PAGES.some(p => pathname.startsWith(p))
  const isProtectedApi  = PROTECTED_API.some(p => pathname.startsWith(p))

  if (!isProtectedPage && !isProtectedApi) return NextResponse.next()

  const validCode = process.env.ACCESS_CODE

  // If ACCESS_CODE is not configured, pass through (local dev without the var set)
  if (!validCode) return NextResponse.next()

  const cookieVal = request.cookies.get('estate_access')?.value

  if (cookieVal === validCode) return NextResponse.next()

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
  ],
}
