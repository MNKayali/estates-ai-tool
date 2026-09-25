/**
 * GET    /api/reports/[id] — the full report record from KV (cost, programme,
 *                            aiProse, answers).
 * DELETE /api/reports/[id] — delete a report from its owner's account.
 *
 * Protected by proxy.ts (signed-in users) and limited to the report's owner or
 * the admin by authoriseReport(); someone else's report answers 404, not 403,
 * so an id cannot be confirmed to exist.
 */
import { getReport, deleteReport } from '@/lib/kv'
import { authoriseReport } from '@/lib/auth'

const NOT_FOUND = 'Report not found. It may have been deleted, or it was an older report past its 90-day expiry.'

export async function GET(request, { params }) {
  const { id } = await params

  // Basic ID validation — 16-char hex string
  if (!id || !/^[0-9a-f]{16}$/.test(id)) {
    return Response.json({ error: 'Invalid report ID.' }, { status: 400 })
  }

  const data = await getReport(id)
  if (!data) return Response.json({ error: NOT_FOUND }, { status: 404 })

  const auth = await authoriseReport(request, data)
  if (auth.response) return auth.response

  return Response.json(data)
}

export async function DELETE(request, { params }) {
  const { id } = await params
  if (!id || !/^[0-9a-f]{16}$/.test(id)) {
    return Response.json({ error: 'Invalid report ID.' }, { status: 400 })
  }

  const data = await getReport(id)
  if (!data) return Response.json({ error: NOT_FOUND }, { status: 404 })

  const auth = await authoriseReport(request, data)
  if (auth.response) return auth.response
  // Only the owner deletes (the admin may view any report but not remove it),
  // and a report from before accounts had no owner to delete it.
  if (!data.ownerId || data.ownerId !== auth.user?.uid) {
    return Response.json({ error: 'Only the person who created this report can delete it.' }, { status: 403 })
  }

  const ok = await deleteReport(id, data.ownerId)
  if (!ok) return Response.json({ error: 'The report could not be deleted. Try again.' }, { status: 503 })
  return Response.json({ success: true })
}
