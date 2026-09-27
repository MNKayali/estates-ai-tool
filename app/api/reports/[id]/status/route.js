/**
 * GET /api/reports/[id]/status
 *
 * Cheap projection for the report page to poll when POST /prose comes back
 * 409 (every outstanding half locked by another tab/invocation). Deliberately
 * excludes cost, programme, aiProse and docx — the driver already has those
 * from its last successful fetch; this just answers "is it done yet".
 */
import { loadReport } from '@/lib/auth'

export async function GET(request, { params }) {
  const { id } = await params
  const { response, record } = await loadReport(request, id)
  if (response) return response

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
