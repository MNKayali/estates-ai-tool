/**
 * POST /api/admin/login
 *
 * Validates the admin code and sets a 30-day httpOnly `estate_admin` cookie.
 * This route is intentionally public (it is how you authenticate as admin) and
 * is excluded from the admin gate in proxy.ts. Mirrors /api/check-access but
 * against ADMIN_CODE and a separate cookie, so admin access is distinct from the
 * colleague ACCESS_CODE.
 */
import { NextResponse } from 'next/server'
import { signAccessCode } from '@/lib/cookieAuth'
import { checkRateLimit, rateLimitedResponse } from '@/lib/rateLimit'

export async function POST(request) {
  // Tighter than /api/check-access: the admin code is a higher-value target
  // (every report's id/metadata, all free-text feedback, and a config oracle
  // naming which secrets are unset).
  const rl = await checkRateLimit('admin-login', request, { requests: 5, window: '10 m' })
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSeconds)

  try {
    const { code } = await request.json()
    const validCode = process.env.ADMIN_CODE

    // No admin code configured. Off production this is dev convenience; ON
    // production it would hand an `estate_admin` cookie to anyone who POSTs here,
    // so it must fail closed — matching the gate in proxy.ts.
    if (!validCode) {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Admin area is not configured.' }, { status: 401 })
      }
      const res = NextResponse.json({ success: true })
      res.cookies.set('estate_admin', 'dev', {
        path: '/', httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
      })
      return res
    }

    if (!code || String(code).trim() !== validCode) {
      // Small delay to slow brute-force guessing
      await new Promise(r => setTimeout(r, 600))
      return NextResponse.json({ error: 'Invalid admin code' }, { status: 401 })
    }

    const token = await signAccessCode(validCode)
    const res = NextResponse.json({ success: true })
    res.cookies.set('estate_admin', token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })
    return res
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
}
