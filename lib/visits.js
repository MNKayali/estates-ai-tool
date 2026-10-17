/**
 * lib/visits.js — the site's own visitor counts, for the admin dashboard.
 *
 * Cookieless: nothing is stored on the visitor's device. A visitor is counted
 * by a keyed hash of their IP address, browser string and the day, so the same
 * person is one visitor for one day and cannot be followed from one day to the
 * next (the hash changes at midnight UTC, and the IP itself is never stored).
 * The tracker (app/components/VisitTracker.jsx) posts to /api/track.
 *
 * Keys, one set per UTC day <d>, each kept for VISIT_TTL:
 *   stats:v:<d>              hash  views · visits · engagedMs · reports · signups
 *   stats:v:<d>:visitors     HyperLogLog of visitor hashes
 *   stats:v:<d>:qvisitors    HyperLogLog of visitors who opened the questionnaire
 *   stats:v:<d>:sources      hash  source → visits
 *   stats:v:<d>:signupsrc    hash  source → sign-ups
 *   stats:v:<d>:pages        hash  page → views
 *   stats:v:<d>:countries    hash  country code → visits
 *   stats:v:<d>:devices      hash  Desktop / Mobile / Tablet → visits
 *   visit:src:<visitor hash> where today's visitor first came from (2 days), so
 *                            a sign-up can be credited to its source
 *
 * Best effort throughout: a KV failure loses a count, never a page or a sign-up.
 */
import { kv } from '@vercel/kv'
import { createHash } from 'node:crypto'
import { clientIp } from './trial.js'
import { DIRECT, dayKey, lastDays, topRows, summarise } from './visitStats.js'

export const VISIT_TTL = 60 * 60 * 24 * 400   // about 13 months
const SOURCE_TTL = 60 * 60 * 24 * 2
const MAX_ENGAGED_MS = 30 * 60 * 1000          // one report of time on a page counts at most 30 min

const dayPrefix = d => `stats:v:${d}`

export function visitorHash(request, date = new Date()) {
  const salt = process.env.COOKIE_SECRET || 'development-only-visit-salt'
  const ua = request.headers.get('user-agent') || ''
  return createHash('sha256').update(`${salt}:visit:${dayKey(date)}:${clientIp(request)}:${ua}`).digest('hex').slice(0, 32)
}

async function bump(key, field, n = 1) {
  await kv.hincrby(key, field, n)
  await kv.expire(key, VISIT_TTL)
}

/**
 * One page view. `landing` marks the first page of a visit (arrived from
 * another site, a search, an app, or typed in), which is when the source,
 * country and device are counted.
 */
export async function recordView({ request, path, landing, source, country, device, date = new Date() }) {
  try {
    const d = dayKey(date)
    const p = dayPrefix(d)
    const vh = visitorHash(request, date)
    const jobs = [
      bump(p, 'views'),
      bump(`${p}:pages`, path),
      kv.pfadd(`${p}:visitors`, vh).then(() => kv.expire(`${p}:visitors`, VISIT_TTL)),
    ]
    if (path === '/questionnaire') {
      jobs.push(kv.pfadd(`${p}:qvisitors`, vh).then(() => kv.expire(`${p}:qvisitors`, VISIT_TTL)))
    }
    if (landing) {
      const src = source || DIRECT
      jobs.push(bump(p, 'visits'), bump(`${p}:sources`, src), bump(`${p}:devices`, device || 'Desktop'))
      if (country) jobs.push(bump(`${p}:countries`, country))
      // The first source of the day sticks, so a later direct reload does not
      // overwrite the search or link that brought them.
      jobs.push(src === DIRECT
        ? kv.set(`visit:src:${vh}`, src, { ex: SOURCE_TTL, nx: true })
        : kv.get(`visit:src:${vh}`).then(prev => (!prev || prev === DIRECT)
          ? kv.set(`visit:src:${vh}`, src, { ex: SOURCE_TTL })
          : null))
    }
    await Promise.all(jobs)
  } catch (e) {
    console.warn('[visits] recordView skipped:', e.message)
  }
}

/** Time the page was on screen, sent when the visitor leaves it. */
export async function recordEngagement({ ms, date = new Date() }) {
  const n = Math.round(Number(ms))
  if (!Number.isFinite(n) || n < 500) return
  try {
    await bump(dayPrefix(dayKey(date)), 'engagedMs', Math.min(n, MAX_ENGAGED_MS))
  } catch (e) {
    console.warn('[visits] recordEngagement skipped:', e.message)
  }
}

/** Where the person making this request came from today (or yesterday), else null. */
export async function sourceForRequest(request, now = new Date()) {
  try {
    for (const date of [now, new Date(now.getTime() - 86400000)]) {
      const src = await kv.get(`visit:src:${visitorHash(request, date)}`)
      if (src) return String(src)
    }
  } catch (e) {
    console.warn('[visits] sourceForRequest skipped:', e.message)
  }
  return null
}

/** Count a sign-up against its source (and in the day's total). */
export async function recordSignup(source, date = new Date()) {
  try {
    const p = dayPrefix(dayKey(date))
    await Promise.all([bump(p, 'signups'), bump(`${p}:signupsrc`, source || 'Unknown')])
  } catch (e) {
    console.warn('[visits] recordSignup skipped:', e.message)
  }
}

/** A report created (Phase 1), for the daily funnel. */
export async function recordReportDay(date = new Date()) {
  try {
    await bump(dayPrefix(dayKey(date)), 'reports')
  } catch (e) {
    console.warn('[visits] recordReportDay skipped:', e.message)
  }
}

/**
 * Everything the admin dashboard shows for the last `days` days: headline
 * figures for the whole run and the last 7 days, a row per day, and the top
 * sources (with sign-ups), pages, countries and devices. Null without KV.
 */
export async function visitStats({ days = 30, now = new Date() } = {}) {
  try {
    const labels = lastDays(days, now)
    const last7 = labels.slice(-7)
    const read = (suffix) => Promise.all(labels.map(d => kv.hgetall(`${dayPrefix(d)}${suffix}`).then(h => h || {})))
    const [daily, sources, signupSrc, pages, countries, devices, perDayVisitors,
      visitors, visitors7, qvisitors, qvisitors7] = await Promise.all([
      read(''), read(':sources'), read(':signupsrc'), read(':pages'), read(':countries'), read(':devices'),
      Promise.all(labels.map(d => kv.pfcount(`${dayPrefix(d)}:visitors`))),
      kv.pfcount(...labels.map(d => `${dayPrefix(d)}:visitors`)),
      kv.pfcount(...last7.map(d => `${dayPrefix(d)}:visitors`)),
      kv.pfcount(...labels.map(d => `${dayPrefix(d)}:qvisitors`)),
      kv.pfcount(...last7.map(d => `${dayPrefix(d)}:qvisitors`)),
    ])
    const signupsBySource = Object.fromEntries(topRows(signupSrc, 100).map(r => [r.name, r.count]))
    const sourceRows = topRows(sources, 12).map(r => ({ ...r, signups: signupsBySource[r.name] || 0 }))
    // A source that brought sign-ups but no counted visit (e.g. "Unknown") still shows.
    for (const [name, n] of Object.entries(signupsBySource)) {
      if (!sourceRows.some(r => r.name === name)) sourceRows.push({ name, count: 0, signups: n })
    }
    return {
      days,
      totals: summarise({ days: daily, visitors: Number(visitors) || 0, questionnaireVisitors: Number(qvisitors) || 0 }),
      totals7: summarise({ days: daily.slice(-7), visitors: Number(visitors7) || 0, questionnaireVisitors: Number(qvisitors7) || 0 }),
      daily: labels.map((date, i) => ({
        date,
        visitors: Number(perDayVisitors[i]) || 0,
        visits: Number(daily[i].visits) || 0,
        views: Number(daily[i].views) || 0,
        reports: Number(daily[i].reports) || 0,
        signups: Number(daily[i].signups) || 0,
      })),
      sources: sourceRows,
      pages: topRows(pages, 10),
      countries: topRows(countries, 10),
      devices: topRows(devices, 3),
    }
  } catch (e) {
    console.warn('[visits] visitStats failed:', e.message)
    return null
  }
}
