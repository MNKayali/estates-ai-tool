/**
 * lib/usageStats.js — pure helpers for the admin dashboard's usage figures.
 */

/** ISO-8601 week label, e.g. "2026-W39". */
export function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/**
 * The last `weeks` ISO weeks, oldest first, each with sign-ups (from the
 * accounts' createdAt) and reports created by account holders and by
 * free-trial visitors (from the weekly counters in lib/kv.js).
 */
export function weeklyUsage({ users = [], reportWeeks = {}, now = new Date(), weeks = 12 }) {
  const labels = []
  for (let i = weeks - 1; i >= 0; i--) {
    const label = isoWeek(new Date(now.getTime() - i * 7 * 86400000))
    if (!labels.includes(label)) labels.push(label)
  }
  const signups = {}
  for (const u of users) {
    const t = Date.parse(u?.createdAt)
    if (!Number.isFinite(t)) continue
    const w = isoWeek(new Date(t))
    signups[w] = (signups[w] || 0) + 1
  }
  return labels.map(week => ({
    week,
    signups: signups[week] || 0,
    userReports: reportWeeks[week]?.user || 0,
    trialReports: reportWeeks[week]?.anon || 0,
  }))
}
