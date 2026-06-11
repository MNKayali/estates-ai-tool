/**
 * /api/feedback
 *
 * POST — record an issue a user flagged from a report page. Stored in Vercel KV
 *        (capped list, 90-day TTL). Persistence is best-effort: if KV is not
 *        configured the endpoint still returns 200 so the user sees a success
 *        state, but `persisted` is false.
 *
 * GET  — read back the flagged issues (newest first). Gated by a ?key= query
 *        matching ACCESS_CODE so a colleague who reaches the endpoint with their
 *        access cookie still cannot read everyone else's submissions. When
 *        ACCESS_CODE is unset (local dev) the key check is skipped.
 *
 * The cookie gate in proxy.ts already blocks anonymous internet traffic; the
 * ?key= check is a second factor for the read side only.
 */
import { saveFeedback, listFeedback } from '@/lib/kv'

// Mirror the options offered in the report-page modal. An unrecognised value is
// coerced to 'Other' rather than rejected, so the UI can evolve without 400s.
const CATEGORIES = ['Wrong numbers', 'Odd programme', 'Missing scope', 'Confusing UX', 'Other']

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const message = String(body?.message ?? '').trim()
  if (!message) {
    return Response.json({ error: 'A description of the issue is required.' }, { status: 400 })
  }

  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null)

  const entry = {
    reportId:    str(body.reportId, 32),
    projectName: str(body.projectName, 200),
    category:    CATEGORIES.includes(body.category) ? body.category : 'Other',
    message:     message.slice(0, 4000),
    url:         str(body.url, 500),
    userAgent:   (request.headers.get('user-agent') || '').slice(0, 300),
    submittedAt: new Date().toISOString(),
  }

  const persisted = await saveFeedback(entry)
  return Response.json({ ok: true, persisted })
}

export async function GET(request) {
  const adminKey = process.env.ACCESS_CODE
  if (adminKey) {
    const key = new URL(request.url).searchParams.get('key')
    if (key !== adminKey) {
      return Response.json({ error: 'Unauthorised. Append ?key=<ACCESS_CODE>.' }, { status: 401 })
    }
  }

  const items = await listFeedback()
  return Response.json({ count: items.length, items })
}
