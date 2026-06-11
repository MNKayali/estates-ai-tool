/**
 * GET /api/admin/overview
 *
 * Single aggregated payload for the admin dashboard: configuration presence
 * (booleans only — never values), usage counts, the report index, and recent
 * feedback. Gated by proxy.ts (estate_admin cookie vs ADMIN_CODE); when
 * ADMIN_CODE is unset the gate passes through for local dev.
 *
 * Workbook health is NOT included here — the dashboard calls the existing open
 * /api/rates-check directly for that.
 */
import { listReports, countReports, listFeedback } from '@/lib/kv'

export async function GET() {
  const config = {
    aiKey:        !!process.env.AI_API_KEY,
    ratesUrl:     !!process.env.RATES_FILE_URL,
    programmeUrl: !!process.env.PROGRAMME_FILE_URL,
    accessCode:   !!process.env.ACCESS_CODE,
    cookieSecret: !!process.env.COOKIE_SECRET,
    adminCode:    !!process.env.ADMIN_CODE,
    sentryDsn:    !!process.env.NEXT_PUBLIC_SENTRY_DSN,
    kv:           !!process.env.KV_REST_API_URL,
  }

  const [reports, reportCount, feedback] = await Promise.all([
    listReports(),
    countReports(),
    listFeedback(),
  ])

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const reportsLast7d = reports.filter(r => {
    const t = Date.parse(r?.generatedAt)
    return Number.isFinite(t) && t >= sevenDaysAgo
  }).length

  return Response.json({
    config,
    counts: {
      reports:       reportCount,
      reportsLast7d,
      feedback:      feedback.length,
    },
    reports,
    feedback,
  })
}
