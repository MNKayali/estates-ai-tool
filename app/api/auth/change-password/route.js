/**
 * POST /api/auth/change-password { currentPassword, newPassword }
 *
 * For a signed-in user (proxy.ts). Signs out every other session and re-issues
 * this browser's cookie.
 */
import { NextResponse } from 'next/server'
import { checkRateLimit, rateLimitedResponse } from '@/lib/rateLimit'
import { getSessionUser, unauthorisedResponse, DEV_USER } from '@/lib/auth'
import { verifyPassword, setPassword, passwordProblem } from '@/lib/users'
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from '@/lib/session'

export async function POST(request) {
  const rl = await checkRateLimit('change-password', request, { requests: 5, window: '10 m' })
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSeconds)

  const user = await getSessionUser(request)
  if (!user) return unauthorisedResponse()
  if (user === DEV_USER) return NextResponse.json({ error: 'Not available with sign-in switched off.' }, { status: 400 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  if (!(await verifyPassword(String(body?.currentPassword || ''), user.passwordHash))) {
    return NextResponse.json({ error: 'Your current password is not correct.' }, { status: 400 })
  }
  const problem = passwordProblem(body?.newPassword)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  try {
    const updated = await setPassword(user.uid, body.newPassword)
    const token = await createSessionToken({ uid: updated.uid, ver: updated.sessionVersion })
    const res = NextResponse.json({ success: true })
    if (token) res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions())
    return res
  } catch (e) {
    console.error('[change-password] failed:', e.message)
    return NextResponse.json({ error: 'The password could not be saved. Try again shortly.' }, { status: 503 })
  }
}
