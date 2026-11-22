import { authOpen, getSessionUser } from '../auth.js'

export async function isOfficeOwner(request) {
  const ownerId = process.env.OFFICE_OWNER_UID
  if (!ownerId || authOpen()) return false
  const user = await getSessionUser(request)
  return user?.uid === ownerId
}
