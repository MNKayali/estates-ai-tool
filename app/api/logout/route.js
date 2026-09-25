/**
 * POST /api/logout
 *
 * Clears the session cookie and the admin cookie in this browser. To sign a
 * user out everywhere, change their password or disable the account — both bump
 * the account's sessionVersion, which invalidates every outstanding cookie
 * (lib/session.js). `estate_access` (the retired shared-code cookie) is cleared
 * too, so old browsers do not carry it around.
 */
import { NextResponse } from 'next/server'
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session'

export async function POST() {
  const res = NextResponse.json({ success: true })
  res.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0))
  res.cookies.set('estate_admin', '', { path: '/', maxAge: 0 })
  res.cookies.set('estate_access', '', { path: '/', maxAge: 0 })
  return res
}
