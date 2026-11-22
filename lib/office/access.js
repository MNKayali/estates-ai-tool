import { verifyAccessCode } from '../cookieAuth.js'
import { authOpen, getSessionUser } from '../auth.js'

export async function isOfficeOwner(request) {
  const email = process.env.OFFICE_OWNER_EMAIL?.trim().toLowerCase()
  if (!email || authOpen()) return false
  const user = await getSessionUser(request)
  if (!user?.email || user.email.trim().toLowerCase() !== email || !process.env.ADMIN_CODE) return false
  const cookie = request.cookies?.get?.('estate_admin')?.value
    ?? request.headers?.get?.('cookie')?.split(';').map(part => part.trim())
      .find(part => part.startsWith('estate_admin='))?.slice('estate_admin='.length)
  return verifyAccessCode(cookie, process.env.ADMIN_CODE)
}
