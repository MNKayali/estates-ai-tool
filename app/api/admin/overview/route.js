/**
 * GET /api/admin/overview
 *
 * Single aggregated payload for the admin dashboard: configuration presence
 * (booleans only — never values), visitor figures for the last 30 days
 * (lib/visits.js), usage counts, weekly usage (sign-ups, reports
 * by account holders and by free-trial visitors), trial conversion, every
 * account (for the Users panel, so it needs no second request) and the most
 * recent feedback. The report list itself is on /admin/reports
 * (/api/admin/reports) — only its counts are here, so the dashboard stays
 * small however many reports there are. Gated by proxy.ts (estate_admin cookie vs
 * ADMIN_CODE); when ADMIN_CODE is unset the gate passes through for local dev.
 *
 * Workbook health is NOT included here — the dashboard calls /api/rates-check
 * (admin-only) for that.
 */
import { reportCounts, listFeedback, reportStats, countUserReports } from '@/lib/kv'
import { listUsers, publicUser } from '@/lib/users'
import { trialStats } from '@/lib/trial'
import { weeklyUsage } from '@/lib/usageStats'
import { emailEnabled } from '@/lib/email'
import { visitStats } from '@/lib/visits'

// The dashboard shows the latest few; the export has them all.
const RECENT_FEEDBACK = 10

export async function GET() {
  const config = {
    aiKey:        !!process.env.AI_API_KEY,
    ratesUrl:     !!process.env.RATES_FILE_URL,
    programmeUrl: !!process.env.PROGRAMME_FILE_URL,
    procurementUrl: !!process.env.PROCUREMENT_FILE_URL,
    cookieSecret: !!process.env.COOKIE_SECRET,
    adminCode:    !!process.env.ADMIN_CODE,
    sentryDsn:    !!process.env.NEXT_PUBLIC_SENTRY_DSN,
    kv:           !!process.env.KV_REST_API_URL,
    email:        emailEnabled(),
  }

  const [reports, feedback, reportWeeks, users, trial, visits] = await Promise.all([
    reportCounts(),
    listFeedback(),
    reportStats(),
    listUsers().catch(() => []),
    trialStats().catch(() => ({ limitHit: 0, converted: 0 })),
    visitStats({ days: 30 }),
  ])
  const userReports = await Promise.all(users.map(u => countUserReports(u.uid)))

  return Response.json({
    config,
    counts: {
      reports:       reports.total,
      reportsLast7d: reports.recent,
      feedback:      feedback.length,
      users:         users.length,
    },
    usage: {
      weeks: weeklyUsage({ users, reportWeeks }),
      trial,
    },
    visits,
    users: users.map((u, i) => ({ ...publicUser(u), reportCount: userReports[i] })),
    emailEnabled: config.email,
    feedback: feedback.slice(0, RECENT_FEEDBACK),
  })
}
