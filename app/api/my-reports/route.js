/**
 * GET /api/my-reports — the signed-in user's report summaries, newest first.
 */
import { getSessionUser, unauthorisedResponse } from '@/lib/auth'
import { listUserReports } from '@/lib/kv'

export async function GET(request) {
  const user = await getSessionUser(request)
  if (!user) return unauthorisedResponse()
  return Response.json({ reports: await listUserReports(user.uid) })
}
