/**
 * GET /api/auth/me — the signed-in user's name and email (proxy.ts requires a
 * session). Used by the page headers.
 */
import { getSessionUser, unauthorisedResponse } from '@/lib/auth'
import { publicUser } from '@/lib/users'

export async function GET(request) {
  const user = await getSessionUser(request)
  if (!user) return unauthorisedResponse()
  return Response.json({ user: publicUser(user) })
}
