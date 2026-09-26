/**
 * POST /api/auth/login { email, password }
 *
 * Checks the password and sets the 30-day session cookie. Public (it is how you
 * sign in). Rate-limited per IP and per email address, and a wrong email takes
 * as long as a wrong password, so the response never reveals whether an account
 * exists.
 */
import { NextResponse } from 'next/server'
import { checkRateLimit, rateLimitedResponse } from '@/lib/rateLimit'
import { getUserByEmail, verifyPassword, burnPasswordCheck, recordLogin, normaliseEmail } from '@/lib/users'
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from '@/lib/session'
import { getTrialId } from '@/lib/auth'
import { claimTrialReports } from '@/lib/trial'

const WRONG = 'That email and password do not match an account.'

export async function POST(request) {
  const rl = await checkRateLimit('login', request, { requests: 10, window: '10 m' })
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSeconds)

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  const email = normaliseEmail(body?.email)
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!email || !password) return NextResponse.json({ error: WRONG }, { status: 401 })

  const perAccount = await checkRateLimit('login-email', request, { requests: 10, window: '1 h', key: email })
  if (!perAccount.allowed) return rateLimitedResponse(perAccount.retryAfterSeconds)

  let user
  try {
    user = await getUserByEmail(email)
  } catch (e) {
    console.error('[login] user lookup failed:', e.message)
    return NextResponse.json({ error: 'Sign-in is unavailable right now. Try again shortly.' }, { status: 503 })
  }

  const ok = user?.passwordHash
    ? await verifyPassword(password, user.passwordHash)
    : await burnPasswordCheck(password)
  if (!ok) return NextResponse.json({ error: WRONG }, { status: 401 })

  if (user.status === 'disabled') {
    return NextResponse.json({ error: 'This account has been disabled. Contact your administrator.' }, { status: 403 })
  }

  const token = await createSessionToken({ uid: user.uid, ver: user.sessionVersion || 0 })
  if (!token) {
    console.error('[login] COOKIE_SECRET is not set — refusing to issue a session in production')
    return NextResponse.json({ error: 'Sign-in is not configured on this server.' }, { status: 503 })
  }
  await recordLogin(user.uid).catch(() => {})

  // Reports made on this browser's free trial move into the account.
  let claimed = 0
  try {
    claimed = await claimTrialReports(await getTrialId(request), user.uid)
  } catch (e) {
    console.warn('[login] claiming trial reports failed:', e.message)
  }

  const res = NextResponse.json({ success: true, name: user.name, claimed })
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions())
  return res
}
