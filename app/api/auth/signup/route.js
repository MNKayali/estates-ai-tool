/**
 * POST /api/auth/signup { email, password, name?, acceptTerms }
 *
 * Public sign-up: creates an active account, signs this browser in (30-day
 * session cookie) and moves any reports made on this browser's free trial into
 * the account (so the person who signed up to download a report can download
 * that report). No email is sent and none is verified in v1.
 *
 * Rate-limited per IP. Unlike sign-in, it says when an email already has an
 * account — a sign-up form cannot avoid that without email verification.
 */
import { NextResponse } from 'next/server'
import { checkRateLimit, rateLimitedResponse } from '@/lib/rateLimit'
import { createAccount, normaliseEmail, isValidEmail, passwordProblem } from '@/lib/users'
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from '@/lib/session'
import { getTrialId } from '@/lib/auth'
import { claimTrialReports } from '@/lib/trial'

export async function POST(request) {
  const rl = await checkRateLimit('signup', request, { requests: 10, window: '10 m' })
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSeconds)

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  const email = normaliseEmail(body?.email)
  const password = typeof body?.password === 'string' ? body.password : ''
  const name = String(body?.name || '').trim().slice(0, 80)

  if (!isValidEmail(email)) return NextResponse.json({ error: 'Enter a valid email address.', field: 'email' }, { status: 400 })
  const pwProblem = passwordProblem(password)
  if (pwProblem) return NextResponse.json({ error: pwProblem, field: 'password' }, { status: 400 })
  if (body?.acceptTerms !== true) {
    return NextResponse.json({ error: 'Please accept the Terms and Privacy Notice to create an account.', field: 'acceptTerms' }, { status: 400 })
  }

  let user
  try {
    user = await createAccount({ email, name, password })
  } catch (e) {
    if (e.message === 'exists') {
      return NextResponse.json({ error: 'An account with this email already exists. Sign in instead.', field: 'email', exists: true }, { status: 409 })
    }
    console.error('[signup] create failed:', e.message)
    return NextResponse.json({ error: 'Sign-up is unavailable right now. Try again shortly.' }, { status: 503 })
  }

  const token = await createSessionToken({ uid: user.uid, ver: user.sessionVersion || 0 })
  if (!token) {
    console.error('[signup] COOKIE_SECRET is not set — refusing to issue a session in production')
    return NextResponse.json({ error: 'Sign-up is not configured on this server.' }, { status: 503 })
  }

  let claimed = 0
  try {
    claimed = await claimTrialReports(await getTrialId(request), user.uid, { signedUp: true })
  } catch (e) {
    console.warn('[signup] claiming trial reports failed:', e.message)
  }

  const res = NextResponse.json({ success: true, name: user.name, claimed })
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions())
  return res
}
