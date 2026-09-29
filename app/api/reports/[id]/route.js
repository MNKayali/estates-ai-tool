/**
 * GET    /api/reports/[id] — the full report record from KV (cost, programme,
 *                            aiProse, answers).
 * DELETE /api/reports/[id] — delete a report from its owner's account.
 *
 * Limited by loadReport() to the report's owner, the free-trial visitor
 * who made it (until an account claims it) and the admin; anyone else gets the
 * same 404 as for a missing report, so an id cannot be confirmed to exist.
 */
import { deleteReport } from '@/lib/kv'
import { loadReport } from '@/lib/auth'

export async function GET(request, { params }) {
  const { response, record } = await loadReport(request, (await params).id)
  return response || Response.json(record)
}

export async function DELETE(request, { params }) {
  const { id } = await params
  const { response, record: data, caller } = await loadReport(request, id)
  if (response) return response
  // Only the owner deletes (the admin may view any report but not remove it),
  // and a report from before accounts had no owner to delete it.
  if (!data.ownerId || data.ownerId !== caller.user?.uid) {
    return Response.json({ error: 'Only the person who created this report can delete it.' }, { status: 403 })
  }

  const ok = await deleteReport(id, data.ownerId)
  if (!ok) return Response.json({ error: 'The report could not be deleted. Try again.' }, { status: 503 })
  return Response.json({ success: true })
}
