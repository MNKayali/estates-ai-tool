/**
 * GET /api/reports/[id]/docx
 *
 * Builds the Word report on download from the KV record. It used to be built
 * at finalise and stored in the record; embedding IBM Plex adds ~0.5–1 MB,
 * which risks the KV value-size limit, and building on demand means every
 * report (older ones included) gets the current design.
 *
 * Protected by proxy.ts (/api/reports/:path*) and limited to the report's owner
 * (or the admin) by authoriseReport().
 * SECURITY: never reference AI_API_KEY here.
 */
import { getReport } from '@/lib/kv'
import { buildReport } from '@/lib/reportBuilder'
import { authoriseReport } from '@/lib/auth'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request, { params }) {
  const { id } = await params
  if (!id || !/^[0-9a-f]{16}$/.test(id)) {
    return Response.json({ error: 'Invalid report ID.' }, { status: 400 })
  }
  const data = await getReport(id)
  if (!data) {
    return Response.json({ error: 'Report not found or expired. Reports are retained for 90 days.' }, { status: 404 })
  }
  const auth = await authoriseReport(request, data)
  if (auth.response) return auth.response
  if (data.status && data.status !== 'complete') {
    return Response.json({ error: 'This report is still being generated. Try again in a few seconds.' }, { status: 409 })
  }
  try {
    const buf = await buildReport({ ...data, reportId: id })
    const safeName = String(data.projectName || 'Report').replace(/[^a-z0-9 _-]/gi, '_')
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${safeName}_Stage1_Report.docx"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[report-docx] build failed:', err)
    return Response.json({ error: 'The Word file could not be created.' }, { status: 500 })
  }
}
