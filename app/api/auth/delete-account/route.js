/**
 * POST /api/auth/delete-account { password }
 *
 * For a signed-in user (proxy.ts): deletes their own account, every report in
 * it and every signed-in session (deleteUser in lib/users.js — the same
 * deletion the admin's Users panel runs). The password is asked again so a
 * browser left signed in cannot be emptied by someone else. Clears this
 * browser's session cookie; the trial cookie stays, as on sign-out.
 */
import { NextResponse } from 'next/server'
import { checkRateLimit, rateLimitedResponse } from '@/lib/rateLimit'
import { getSessionUser, unauthorisedResponse, DEV_USER } from '@/lib/auth'
import { verifyPassword, deleteUser } from '@/lib/users'
import { sessionCookieOptions, SESSION_COOKIE } from '@/lib/session'

export async function POST(request) {
  const rl = await checkRateLimit('delete-account', request, { requests: 5, window: '10 m' })
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSeconds)

  const user = await getSessionUser(request)
  if (!user) return unauthorisedResponse()
  if (user === DEV_USER) return NextResponse.json({ error: 'Not available with sign-in switched off.' }, { status: 400 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  if (!(await verifyPassword(String(body?.password || ''), user.passwordHash))) {
    return NextResponse.json({ error: 'Your password is not correct.' }, { status: 400 })
  }

  try {
    const { reportsDeleted } = await deleteUser(user.uid)
    const res = NextResponse.json({ deleted: true, reportsDeleted })
    res.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0))
    return res
  } catch (e) {
    console.error('[delete-account] failed:', e.message)
    return NextResponse.json({ error: 'Your account could not be deleted. Try again shortly, or email us.' }, { status: 503 })
  }
}
