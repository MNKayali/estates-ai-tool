/**
 * GET /api/admin/overview
 *
 * Single aggregated payload for the admin dashboard: configuration presence
 * (booleans only — never values), usage counts, weekly usage (sign-ups, reports
 * by account holders and by free-trial visitors), trial conversion, the report
 * index, and recent feedback. Gated by proxy.ts (estate_admin cookie vs
 * ADMIN_CODE); when ADMIN_CODE is unset the gate passes through for local dev.
 *
 * Workbook health is NOT included here — the dashboard calls /api/rates-check
 * (admin-only) for that.
 */
import { listReports, countReports, listFeedback, reportStats } from '@/lib/kv'
import { listUsers } from '@/lib/users'
import { trialStats } from '@/lib/trial'
import { weeklyUsage } from '@/lib/usageStats'
import { emailEnabled } from '@/lib/email'

export async function GET() {
  const config = {
    aiKey:        !!process.env.AI_API_KEY,
    ratesUrl:     !!process.env.RATES_FILE_URL,
    programmeUrl: !!process.env.PROGRAMME_FILE_URL,
    cookieSecret: !!process.env.COOKIE_SECRET,
    adminCode:    !!process.env.ADMIN_CODE,
    sentryDsn:    !!process.env.NEXT_PUBLIC_SENTRY_DSN,
    kv:           !!process.env.KV_REST_API_URL,
    email:        emailEnabled(),
  }

  const [reports, reportCount, feedback, reportWeeks, users, trial] = await Promise.all([
    listReports(),
    countReports(),
    listFeedback(),
    reportStats(),
    listUsers().catch(() => []),
    trialStats().catch(() => ({ limitHit: 0, converted: 0 })),
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
      users:         users.length,
    },
    usage: {
      weeks: weeklyUsage({ users, reportWeeks }),
      trial,
    },
    reports,
    feedback,
  })
}
