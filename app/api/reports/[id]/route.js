/**
 * GET /api/reports/[id]
 *
 * Fetches a previously generated report from Vercel KV by its 16-char hex ID.
 * Protected by middleware (estate_access cookie required).
 * Returns the full report payload as JSON (cost, programme, aiProse, answers, docx).
 * Reports expire after 90 days.
 */
import { getReport } from '@/lib/kv'

export async function GET(request, { params }) {
  const { id } = await params

  // Basic ID validation — 16-char hex string
  if (!id || !/^[0-9a-f]{16}$/.test(id)) {
    return Response.json({ error: 'Invalid report ID.' }, { status: 400 })
  }

  const data = await getReport(id)

  if (!data) {
    return Response.json(
      { error: 'Report not found or expired. Reports are retained for 90 days.' },
      { status: 404 }
    )
  }

  return Response.json(data)
}
