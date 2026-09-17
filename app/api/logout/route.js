/**
 * POST /api/logout
 *
 * Clears the `estate_access` and `estate_admin` cookies. There was previously
 * no way to revoke either 30-day cookie short of clearing browser data
 * manually — relevant on a shared machine, or simply to switch which access
 * code a browser is using without waiting for ACCESS_CODE to be rotated.
 *
 * Both cookies are HMAC-signed tokens of the current ACCESS_CODE/ADMIN_CODE
 * (lib/cookieAuth.js), not session IDs — there is nothing server-side to
 * invalidate, so this only ever affects the browser that calls it. Clearing
 * both unconditionally is harmless even for a caller who only ever held one:
 * deleting a cookie that was never set is a no-op.
 */
import { NextResponse } from 'next/server'

export async function POST() {
  const res = NextResponse.json({ success: true })
  res.cookies.set('estate_access', '', { path: '/', maxAge: 0 })
  res.cookies.set('estate_admin', '', { path: '/', maxAge: 0 })
  return res
}
