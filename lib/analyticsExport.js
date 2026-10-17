/**
 * lib/analyticsExport.js — the admin's "Export for AI" file: every usage figure
 * the dashboard holds, in one JSON document that explains itself, so it can be
 * kept for later and handed to an AI (or a person) to look for improvements.
 *
 * Anonymised on purpose: no names, emails, project names, report ids, IP
 * addresses or page addresses with ids in them. Users are numbered (U001…) and
 * reports carry only what kind of project they were. Pure — the route
 * (app/api/admin/export) reads KV and passes everything in.
 */

export const EXPORT_VERSION = 1

const ABOUT = {
  what: 'Usage data exported from the Projento admin dashboard (RIBA Stage 0–1 feasibility reports for UK capital projects). Anonymised: no names, emails, project names or IP addresses.',
  howCounted: [
    'visitor: one person (network address + browser) on one UTC day, counted without cookies; the same person on two days counts twice in daily rows but once in a period total',
    'visit: arriving on the site from outside it (a search, a link, an app, or typing the address)',
    'source: the utm_source tag on the link if present, else the referring site, else Direct; Unknown = a sign-up whose visit was not seen (another device, an older account)',
    'avgVisitSeconds: total on-screen time divided by visits',
    'questionnaireVisitors: visitors who opened the questionnaire',
    'reports: reports created (counted when the figures are calculated, before the text is written)',
    'trial: visitors without an account get 3 free reports; limitHit = reached the limit, converted = then created an account',
  ],
  limits: [
    'Counting of visits, sources, pages and daily reports started on 17 October 2026; earlier days show 0.',
    'Report details (project type, building use, region, size, confidence) exist only for reports finished after the same date.',
    'Bots, the admin area and visits from the admin are not counted.',
  ],
  suggestedQuestions: [
    'Which sources bring visitors who go on to create reports or sign up, and which bring visitors who leave?',
    'Where in the journey (visit → questionnaire → report → sign-up) do most people drop off, and what might help?',
    'Which project types and building uses are most requested, and does that suggest where to improve rates or add content?',
    'What do the feedback messages have in common?',
    'How is usage changing week on week?',
  ],
}

const round1 = n => (n == null ? null : Math.round(n * 10) / 10)

const byJoined = users => [...users].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
const userNumber = i => `U${String(i + 1).padStart(3, '0')}`

/** Account rows without who they are: a number (oldest first), when, how active, where from. */
export function anonymiseUsers(users = []) {
  return byJoined(users).map((u, i) => ({
    user: userNumber(i),
    joined: u.createdAt ? String(u.createdAt).slice(0, 10) : null,
    lastActive: (u.lastActiveAt || u.lastLoginAt) ? String(u.lastActiveAt || u.lastLoginAt).slice(0, 10) : null,
    status: u.status || null,
    tier: u.tier || 'free',
    source: u.source || null,
    reports: u.reportCount ?? null,
  }))
}

/** Report rows: what kind of project, never whose or what it was called. */
export function anonymiseReports(reports = [], users = []) {
  const userNo = new Map(byJoined(users).map((u, i) => [u.uid, userNumber(i)]))
  return reports.map(r => ({
    date: r.generatedAt ? String(r.generatedAt).slice(0, 10) : null,
    by: r.ownerId ? (userNo.get(r.ownerId) || 'account') : r.trial ? 'free trial' : 'unknown',
    projectType: r.projectType || null,
    buildingUse: r.buildingUse || null,
    region: r.region || null,
    gifaM2: r.gifa || null,
    costMidGBP: r.totalMid ?? null,
    costPerM2GBP: r.totalMid && r.gifa ? Math.round(r.totalMid / r.gifa) : null,
    totalWeeks: r.totalWeeks ?? null,
    confidence: r.confidence ?? null,
    consistencyFlags: Array.isArray(r.checks) ? r.checks.map(c => c.code) : null,
  }))
}

/** Feedback: the category, the message and when — not who, which report or which page. */
export function anonymiseFeedback(feedback = []) {
  return feedback.map(f => ({
    date: f.submittedAt ? String(f.submittedAt).slice(0, 10) : null,
    category: f.category || 'Other',
    message: String(f.message || '').slice(0, 2000),
  }))
}

export function buildAnalyticsExport({ visits, weeks = [], trial = null, users = [], reports = [], feedback = [], generatedAt = new Date() }) {
  const t = visits?.totals || null
  return {
    exportVersion: EXPORT_VERSION,
    generatedAt: generatedAt.toISOString(),
    period: visits ? { days: visits.days, from: visits.daily?.[0]?.date || null, to: visits.daily?.at(-1)?.date || null } : null,
    about: ABOUT,
    headline: t && {
      ...t,
      pagesPerVisit: round1(t.pagesPerVisit),
      accounts: users.length,
      trialLimitHit: trial?.limitHit ?? null,
      trialConverted: trial?.converted ?? null,
    },
    journey: t && [
      { step: 'Visitors', people: t.visitors },
      { step: 'Opened the questionnaire', people: t.questionnaireVisitors },
      { step: 'Reports created', people: t.reports },
      { step: 'Sign-ups', people: t.signups },
    ],
    sources: visits?.sources || [],
    pages: visits?.pages || [],
    countries: visits?.countries || [],
    devices: visits?.devices || [],
    daily: visits?.daily || [],
    weekly: weeks,
    users: anonymiseUsers(users),
    reports: anonymiseReports(reports, users),
    feedback: anonymiseFeedback(feedback),
  }
}

/** Rows to CSV (Excel-friendly: header row, quoted where needed, CRLF). */
export function toCsv(rows, columns) {
  const cell = v => {
    if (v == null) return ''
    // A leading = + - @ would run as a formula in Excel: an apostrophe keeps it text.
    const s = typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : String(v)
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [columns.map(c => cell(c.label)).join(','), ...rows.map(r => columns.map(c => cell(r[c.key])).join(','))].join('\r\n') + '\r\n'
}

export const DAILY_COLUMNS = [
  { key: 'date', label: 'Day' },
  { key: 'visitors', label: 'Visitors' },
  { key: 'visits', label: 'Visits' },
  { key: 'views', label: 'Page views' },
  { key: 'reports', label: 'Reports' },
  { key: 'signups', label: 'Sign-ups' },
]
