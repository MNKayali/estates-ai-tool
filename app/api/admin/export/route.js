/**
 * GET /api/admin/export?days=90&format=json|csv
 *
 * The admin's usage data as a file to keep or hand to an AI: `json` (default)
 * is the whole anonymised picture with an explanation of every figure
 * (lib/analyticsExport.js); `csv` is the day-by-day table for a spreadsheet.
 * `days` is 7–365 (visit counts are kept about 13 months). Gated by proxy.ts
 * (estate_admin cookie), like every /api/admin route.
 */
import { listReports, listFeedback, reportStats, countUserReports } from '@/lib/kv'
import { listUsers } from '@/lib/users'
import { trialStats } from '@/lib/trial'
import { weeklyUsage } from '@/lib/usageStats'
import { visitStats } from '@/lib/visits'
import { buildAnalyticsExport, toCsv, DAILY_COLUMNS } from '@/lib/analyticsExport'
import { dayKey } from '@/lib/visitStats'

export async function GET(request) {
  const params = new URL(request.url).searchParams
  const days = Math.min(365, Math.max(7, Math.round(Number(params.get('days')) || 90)))
  const format = params.get('format') === 'csv' ? 'csv' : 'json'
  const stamp = dayKey()

  const visits = await visitStats({ days })
  if (format === 'csv') {
    return new Response(toCsv(visits?.daily || [], DAILY_COLUMNS), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="projento-daily-${days}d-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  const [reports, feedback, reportWeeks, users, trial] = await Promise.all([
    listReports(),
    listFeedback(),
    reportStats(),
    listUsers().catch(() => []),
    trialStats().catch(() => null),
  ])
  const counts = await Promise.all(users.map(u => countUserReports(u.uid).catch(() => null)))
  const withCounts = users.map((u, i) => ({ ...u, reportCount: counts[i] }))
  const weeks = weeklyUsage({ users, reportWeeks, weeks: Math.ceil(days / 7) })

  const body = buildAnalyticsExport({ visits, weeks, trial, users: withCounts, reports, feedback })
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="projento-analytics-${days}d-${stamp}.json"`,
      'Cache-Control': 'no-store',
    },
  })
}
