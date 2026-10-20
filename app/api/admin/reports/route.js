/**
 * GET  /api/admin/reports?kind=all|account|trial|legacy&q=&page=1
 *      One page of the report index (newest first), with the owner's email,
 *      plus how many reports there are of each kind. Read by /admin/reports.
 * POST /api/admin/reports { ids: [...] }      — delete these reports
 * POST /api/admin/reports { kind: 'legacy' }  — delete every report from the
 *      access-code era (no account, no free trial): since sign-up went public
 *      nobody but the admin can open them.
 *
 * A deleted report also leaves its owner's My reports. Gated by proxy.ts
 * (estate_admin cookie vs ADMIN_CODE).
 */
import { listReports, adminDeleteReport } from '@/lib/kv'
import { listUsers } from '@/lib/users'

export const maxDuration = 60

const PAGE_SIZE = 50
const MAX_DELETE = 1000
const ID = /^[A-Za-z0-9_-]{8,64}$/

// Who a report belongs to, from its index entry.
function reportKind(r) {
  if (r?.ownerId) return 'account'
  if (r?.trial) return 'trial'
  return 'legacy'
}

export async function GET(request) {
  const url = new URL(request.url)
  const kind = url.searchParams.get('kind') || 'all'
  const q = (url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 100)
  const page = Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1)

  const [reports, users] = await Promise.all([listReports(), listUsers().catch(() => [])])
  const emailOf = new Map(users.map(u => [u.uid, u.email]))

  const counts = { all: reports.length, account: 0, trial: 0, legacy: 0 }
  for (const r of reports) counts[reportKind(r)]++

  const matches = reports.filter(r => {
    if (kind !== 'all' && reportKind(r) !== kind) return false
    if (!q) return true
    return [r.projectName, r.projectType, r.buildingUse, emailOf.get(r.ownerId)]
      .some(v => String(v || '').toLowerCase().includes(q))
  })
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE))
  const shown = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(r => ({
    ...r,
    kind: reportKind(r),
    ownerEmail: r.ownerId ? emailOf.get(r.ownerId) || null : null,
  }))

  return Response.json({ reports: shown, total: matches.length, page, pages, counts })
}

export async function POST(request) {
  let body
  try { body = (await request.json()) || {} } catch { return Response.json({ error: 'Bad request' }, { status: 400 }) }

  const index = await listReports()
  let targets
  if (body.kind === 'legacy') {
    targets = index.filter(r => reportKind(r) === 'legacy')
  } else if (Array.isArray(body.ids)) {
    const wanted = new Set(body.ids.filter(id => typeof id === 'string' && ID.test(id)).slice(0, MAX_DELETE))
    targets = index.filter(r => wanted.has(r.reportId))
  } else {
    return Response.json({ error: 'Say which reports to delete.' }, { status: 400 })
  }

  let deleted = 0
  let skipped = 0
  // Ten at a time: the KV client pipelines concurrent calls, so a few hundred
  // reports finish well inside the function's time limit.
  for (let i = 0; i < targets.length; i += 10) {
    const results = await Promise.all(targets.slice(i, i + 10).map(r =>
      // An access-code report that has since been given an owner or a trial
      // visitor is not legacy any more; the bulk clean-up leaves it alone.
      adminDeleteReport(r.reportId, r.ownerId, { onlyUnowned: body.kind === 'legacy' })))
    for (const result of results) {
      if (result === 'skipped') skipped++
      else if (result) deleted++
    }
  }
  return Response.json({ deleted, skipped })
}
