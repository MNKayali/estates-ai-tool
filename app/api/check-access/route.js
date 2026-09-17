/**
 * POST /api/check-access
 * Validates the access code and sets a 30-day httpOnly cookie.
 * This route is intentionally public (it is how you get authenticated).
 */
import { NextResponse } from 'next/server'
import { signAccessCode } from '@/lib/cookieAuth'
import { checkRateLimit, rateLimitedResponse } from '@/lib/rateLimit'

export async function POST(request) {
  // Guards repeated guessing at the shared colleague code. The 600ms delay
  // below slows a single script down; this bounds how many attempts an IP
  // gets at all, regardless of how patient the attacker is.
  const rl = await checkRateLimit('check-access', request, { requests: 10, window: '10 m' })
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSeconds)

  try {
    const { code } = await request.json()
    const validCode = process.env.ACCESS_CODE

    // No code configured → dev mode, let through. (This mirrors proxy.ts, which
    // passes every route through when ACCESS_CODE is unset — documented dev
    // behaviour.) `secure` is set from NODE_ENV like the real branch below: this
    // path is exactly the one that runs if the env var is ever missing in
    // production, and it must not ship a non-Secure cookie to real users.
    if (!validCode) {
      const res = NextResponse.json({ success: true })
      res.cookies.set('estate_access', 'dev', {
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
      return NextResponse.json({ error: 'Invalid access code' }, { status: 401 })
    }

    const token = await signAccessCode(validCode)
    const res = NextResponse.json({ success: true })
    res.cookies.set('estate_access', token, {
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
