/**
 * GET  /api/admin/users — every account (no password hashes), with its report count.
 * POST /api/admin/users { name, email } — invite someone: creates the account
 *      and a 7-day set-password link, emailed when Resend is configured and
 *      always returned so the admin can pass it on by hand.
 *
 * Gated by proxy.ts (estate_admin cookie vs ADMIN_CODE).
 */
import { listUsers, createUser, createLinkToken, publicUser, normaliseEmail, isValidEmail } from '@/lib/users'
import { emailEnabled, sendEmail, inviteEmail, appOrigin } from '@/lib/email'
import { countUserReports } from '@/lib/kv'

export async function GET() {
  try {
    const users = await listUsers()
    const counts = await Promise.all(users.map(u => countUserReports(u.uid)))
    return Response.json({
      users: users.map((u, i) => ({ ...publicUser(u), reportCount: counts[i] })),
      emailEnabled: emailEnabled(),
    })
  } catch (e) {
    console.error('[admin/users] list failed:', e.message)
    return Response.json({ error: 'Users could not be loaded (is KV configured?).' }, { status: 503 })
  }
}

export async function POST(request) {
  let body
  try { body = await request.json() } catch { return Response.json({ error: 'Bad request' }, { status: 400 }) }
  const email = normaliseEmail(body?.email)
  const name = String(body?.name || '').trim()
  if (!isValidEmail(email)) return Response.json({ error: 'Enter a valid email address.' }, { status: 400 })
  if (!name) return Response.json({ error: 'Enter the person’s name.' }, { status: 400 })

  try {
    const user = await createUser({ email, name })
    const token = await createLinkToken('invite', user.uid)
    const link = `${appOrigin()}/set-password?kind=invite&token=${token}`
    const emailed = await sendEmail({ to: user.email, ...inviteEmail({ name: user.name, link }) })
    return Response.json({ user: publicUser(user), link, emailed })
  } catch (e) {
    if (e.message === 'exists') return Response.json({ error: 'That email already has an account.' }, { status: 409 })
    console.error('[admin/users] invite failed:', e.message)
    return Response.json({ error: 'The account could not be created (is KV configured?).' }, { status: 503 })
  }
}
