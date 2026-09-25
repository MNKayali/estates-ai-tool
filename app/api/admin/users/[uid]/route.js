/**
 * POST /api/admin/users/[uid] { action }
 *   'disable'    — block sign-in and sign the user out everywhere
 *   'enable'     — undo 'disable'
 *   'link'       — a fresh set-password link: an invite link while the person
 *                  has not set a password yet, else a 1-hour reset link.
 *                  Emailed when Resend is configured, always returned.
 *
 * Gated by proxy.ts (estate_admin cookie vs ADMIN_CODE).
 */
import { getUser, setDisabled, createLinkToken, publicUser } from '@/lib/users'
import { sendEmail, inviteEmail, resetEmail, appOrigin } from '@/lib/email'

export async function POST(request, { params }) {
  const { uid } = await params
  if (!/^[0-9a-f]{16}$/.test(uid || '')) return Response.json({ error: 'Invalid user.' }, { status: 400 })

  let action = ''
  try { action = (await request.json())?.action } catch { /* handled below */ }

  try {
    const user = await getUser(uid)
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 })

    if (action === 'disable' || action === 'enable') {
      const updated = await setDisabled(uid, action === 'disable')
      return Response.json({ user: publicUser(updated) })
    }

    if (action === 'link') {
      if (user.status === 'disabled') return Response.json({ error: 'Enable the account first.' }, { status: 400 })
      const kind = user.passwordHash ? 'reset' : 'invite'
      const token = await createLinkToken(kind, uid)
      const link = `${appOrigin()}/set-password?kind=${kind}&token=${token}`
      const message = kind === 'invite' ? inviteEmail({ name: user.name, link }) : resetEmail({ name: user.name, link })
      const emailed = await sendEmail({ to: user.email, ...message })
      return Response.json({ user: publicUser(user), link, kind, emailed })
    }

    return Response.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (e) {
    console.error('[admin/users/uid] failed:', e.message)
    return Response.json({ error: 'The change could not be saved.' }, { status: 503 })
  }
}
