import { verifyAccessCode } from '../cookieAuth.js'

export async function isOfficeOwner(request) {
  const code = process.env.ADMIN_CODE
  if (!code) return false
  const cookie = request.cookies?.get?.('estate_admin')?.value
    ?? request.headers?.get?.('cookie')?.split(';').map(part => part.trim())
      .find(part => part.startsWith('estate_admin='))?.slice('estate_admin='.length)
  return verifyAccessCode(cookie, code)
}
