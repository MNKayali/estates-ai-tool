/**
 * GET /api/reports/[id]/status
 *
 * Cheap projection for the report page to poll when POST /prose comes back
 * 409 (every outstanding half locked by another tab/invocation). Deliberately
 * excludes cost, programme, aiProse and docx — the driver already has those
 * from its last successful fetch; this just answers "is it done yet".
 */
import { getReport } from '@/lib/kv'

export async function GET(request, { params }) {
  const { id } = await params
  if (!id || !/^[0-9a-f]{16}$/.test(id)) {
    return Response.json({ error: 'Invalid report ID.' }, { status: 400 })
  }

  const record = await getReport(id)
  if (!record) {
    return Response.json({ error: 'Report not found or expired.' }, { status: 404 })
  }

  const status = !record.status ? 'complete' : record.status
  return Response.json({
    reportId: id,
    status,
    ...(status !== 'complete' && { prose: {
      narrative: !record.prosePending?.narrative,
      risk: !record.prosePending?.risk,
    } }),
  })
}
