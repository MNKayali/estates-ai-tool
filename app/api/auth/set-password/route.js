/**
 * GET  /api/auth/set-password?kind=invite|reset&token=… — is this link still valid?
 * POST /api/auth/set-password { kind, token, password } — set the password from
 *      an invite or reset link, then sign the user in.
 *
 * Public: the one-time token is the credential. It is used up on success, and
 * setting a password signs out every other session for the account.
 */
import { NextResponse } from 'next/server'
import { checkRateLimit, rateLimitedResponse } from '@/lib/rateLimit'
import { peekLinkToken, consumeLinkToken, getUser, setPassword, passwordProblem, recordLogin } from '@/lib/users'
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from '@/lib/session'

const EXPIRED = 'This link has expired or has already been used. Ask for a new one.'

export async function GET(request) {
  const rl = await checkRateLimit('set-password', request, { requests: 30, window: '10 m' })
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSeconds)
  const url = new URL(request.url)
  try {
    const uid = await peekLinkToken(url.searchParams.get('kind'), url.searchParams.get('token'))
    const user = uid ? await getUser(uid) : null
    if (!user || user.status === 'disabled') return NextResponse.json({ valid: false, error: EXPIRED })
    return NextResponse.json({ valid: true, email: user.email, name: user.name })
  } catch (e) {
    console.error('[set-password] check failed:', e.message)
    return NextResponse.json({ valid: false, error: 'This link could not be checked. Try again shortly.' }, { status: 503 })
  }
}

export async function POST(request) {
  const rl = await checkRateLimit('set-password', request, { requests: 30, window: '10 m' })
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSeconds)

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  const problem = passwordProblem(body?.password)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  try {
    // Validate first, consume only when the account can take the password, so
    // a disabled account's link is not burnt by the attempt.
    const peeked = await peekLinkToken(body?.kind, body?.token)
    const existing = peeked ? await getUser(peeked) : null
    if (!existing || existing.status === 'disabled') return NextResponse.json({ error: EXPIRED }, { status: 400 })

    const uid = await consumeLinkToken(body.kind, body.token)
    if (uid !== existing.uid) return NextResponse.json({ error: EXPIRED }, { status: 400 })

    const user = await setPassword(uid, body.password)
    const token = await createSessionToken({ uid: user.uid, ver: user.sessionVersion })
    if (!token) return NextResponse.json({ error: 'Sign-in is not configured on this server.' }, { status: 503 })
    await recordLogin(user.uid).catch(() => {})

    const res = NextResponse.json({ success: true })
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions())
    return res
  } catch (e) {
    console.error('[set-password] failed:', e.message)
    return NextResponse.json({ error: 'The password could not be saved. Try again shortly.' }, { status: 503 })
  }
}
