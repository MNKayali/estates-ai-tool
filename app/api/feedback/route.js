/**
 * /api/feedback
 *
 * POST — record an issue a user flagged from a report page. Stored in Vercel KV
 *        (capped list, 90-day TTL). Persistence is best-effort: if KV is not
 *        configured the endpoint still returns 200 so the user sees a success
 *        state, but `persisted` is false.
 *
 * There used to be a GET here too, reading the flagged issues back behind a
 * `?key=<ACCESS_CODE>` query parameter. Removed: a secret in a query string
 * lands in access logs, browser history and the Referer header, and the read
 * side was already fully redundant with `/api/admin/overview`, which serves
 * the same `listFeedback()` data properly gated by the `estate_admin` cookie
 * rather than a URL parameter.
 */
import { saveFeedback } from '@/lib/kv'
import { checkRateLimit, rateLimitedResponse } from '@/lib/rateLimit'
import { requireCaller } from '@/lib/auth'

// Mirror the options offered in the report-page modal. An unrecognised value is
// coerced to 'Other' rather than rejected, so the UI can evolve without 400s.
const CATEGORIES = ['Wrong numbers', 'Odd programme', 'Missing scope', 'Confusing UX', 'Other']

export async function POST(request) {
  // Low-value target, but an unbounded free-text submission endpoint is still
  // a cheap way to flood the capped feedback list in KV.
  const rl = await checkRateLimit('feedback', request, { requests: 10, window: '1 h' })
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSeconds)
  const caller = await requireCaller(request)
  if (caller.response) return caller.response

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
