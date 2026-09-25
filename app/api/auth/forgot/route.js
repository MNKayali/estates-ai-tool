/**
 * POST /api/auth/forgot { email }
 *
 * Emails a one-hour password-reset link if the address has an account. Always
 * answers the same way, so it cannot be used to find out who has an account.
 * With no email service configured it says so, and the admin issues the link.
 */
import { checkRateLimit, rateLimitedResponse } from '@/lib/rateLimit'
import { getUserByEmail, createLinkToken, normaliseEmail } from '@/lib/users'
import { emailEnabled, sendEmail, resetEmail, appOrigin } from '@/lib/email'

export async function POST(request) {
  const rl = await checkRateLimit('forgot', request, { requests: 5, window: '1 h' })
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSeconds)

  if (!emailEnabled()) return Response.json({ emailEnabled: false })

  let email = ''
  try { email = normaliseEmail((await request.json())?.email) } catch { /* same answer */ }

  const perAccount = await checkRateLimit('forgot-email', request, { requests: 3, window: '1 h', key: email || 'blank' })
  if (email && perAccount.allowed) {
    try {
      const user = await getUserByEmail(email)
      if (user && user.status !== 'disabled') {
        const token = await createLinkToken('reset', user.uid)
        const link = `${appOrigin()}/set-password?kind=reset&token=${token}`
        await sendEmail({ to: user.email, ...resetEmail({ name: user.name, link }) })
      }
    } catch (e) {
      console.error('[forgot] failed:', e.message)
    }
  }
  return Response.json({ emailEnabled: true, sent: true })
}
