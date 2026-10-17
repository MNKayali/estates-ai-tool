/**
 * lib/visitStats.js — pure helpers for the admin dashboard's visitor figures
 * (lib/visits.js stores them). No KV, no node-only imports: the tests run them
 * directly and the client tracker shares nothing with them but the shape.
 */

// Hosts (or utm_source values) → the name the admin sees. First match wins,
// so the more specific entries (Gemini before Google) come first.
const SOURCES = [
  [/(^|\.)gemini\.google\./, 'Gemini'],
  [/(^|\.)mail\.google\.|(^|\.)outlook\.(live|office|office365)\.|(^|\.)mail\.yahoo\.|^email$|^newsletter$/, 'Email'],
  [/(^|\.)google\.|^google$/, 'Google'],
  [/(^|\.)bing\.|^bing$/, 'Bing'],
  [/(^|\.)duckduckgo\.|^duckduckgo$/, 'DuckDuckGo'],
  [/(^|\.)ecosia\./, 'Ecosia'],
  [/(^|\.)yahoo\./, 'Yahoo'],
  [/(^|\.)linkedin\.|(^|\.)lnkd\.in$|^linkedin$/, 'LinkedIn'],
  [/(^|\.)facebook\.|(^|\.)fb\.|^facebook$|^fb$/, 'Facebook'],
  [/(^|\.)instagram\.|^instagram$/, 'Instagram'],
  [/(^|\.)t\.co$|(^|\.)twitter\.|(^|\.)x\.com$|^twitter$|^x$/, 'X (Twitter)'],
  [/(^|\.)youtube\.|(^|\.)youtu\.be$|^youtube$/, 'YouTube'],
  [/(^|\.)reddit\.|^reddit$/, 'Reddit'],
  [/(^|\.)chatgpt\.com$|(^|\.)openai\.com$|^chatgpt$/, 'ChatGPT'],
  [/(^|\.)perplexity\.ai$|^perplexity$/, 'Perplexity'],
  [/(^|\.)claude\.ai$|^claude$/, 'Claude'],
  [/(^|\.)copilot\.microsoft\.com$|^copilot$/, 'Copilot'],
  [/(^|\.)whatsapp\.|(^|\.)wa\.me$|^whatsapp$/, 'WhatsApp'],
]

export const DIRECT = 'Direct'

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
}

/**
 * Where a visit came from: the campaign tag (utm_source) when the link carried
 * one, else the referring site, else Direct (typed, bookmarked, or a link from
 * an app that sends no referrer). A link from this site itself is Direct too.
 */
export function classifySource({ referrer = '', utmSource = '', ownHost = '' } = {}) {
  const utm = String(utmSource || '').trim().toLowerCase().replace(/[^a-z0-9 ._-]/g, '').slice(0, 40)
  if (utm) {
    const known = SOURCES.find(([re]) => re.test(utm))
    return known ? known[1] : utm
  }
  const host = hostOf(referrer)
  const own = String(ownHost || '').toLowerCase().replace(/^www\./, '').replace(/:\d+$/, '')
  if (!host || (own && host === own)) return DIRECT
  const known = SOURCES.find(([re]) => re.test(host))
  return known ? known[1] : host.slice(0, 60)
}

/**
 * A page address without its query, with report ids and tokens folded so one
 * page is one row ("/report/[id]"), and anything odd cut short.
 */
export function normalisePath(path) {
  let p = String(path || '/').split(/[?#]/)[0] || '/'
  if (!p.startsWith('/')) p = '/' + p
  p = p.split('/').map(seg => (/^[A-Za-z0-9_-]{12,}$/.test(seg) && /\d/.test(seg) ? '[id]' : seg)).join('/')
  if (p.length > 1) p = p.replace(/\/+$/, '')
  return p.slice(0, 80)
}

/** Pages the tracker leaves out: the admin's own visits and dev-only pages. */
export function isUntrackedPath(path) {
  return /^\/(admin|report-fixture)(\/|$)/.test(String(path || ''))
}

export function deviceOf(ua = '') {
  const s = String(ua)
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(s)) return 'Tablet'
  if (/Mobi|iPhone|iPod|Android|BlackBerry|Opera Mini|IEMobile/i.test(s)) return 'Mobile'
  return 'Desktop'
}

export function isBot(ua = '') {
  return !ua || /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|embedly|monitor|curl|wget|python|node-fetch|axios|vercel/i.test(ua)
}

/** UTC day label, e.g. "2026-10-17". */
export function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

/** The last `days` day labels, oldest first. */
export function lastDays(days, now = new Date()) {
  const out = []
  for (let i = days - 1; i >= 0; i--) out.push(dayKey(new Date(now.getTime() - i * 86400000)))
  return out
}

/** Add up several `{ name: count }` hashes and return the top `limit` as rows, largest first. */
export function topRows(hashes, limit = 10) {
  const sum = {}
  for (const h of hashes) {
    for (const [k, v] of Object.entries(h || {})) sum[k] = (sum[k] || 0) + (Number(v) || 0)
  }
  return Object.entries(sum)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
}

/**
 * Headline figures for a run of days. `days` holds each day's counter hash
 * ({ views, visits, engagedMs, reports }) and `signups` that day's sign-ups.
 * `visitors` is the unique count over the whole run (HyperLogLog union),
 * passed in because it cannot be added up from the daily figures.
 */
export function summarise({ days = [], visitors = 0, questionnaireVisitors = 0 }) {
  const t = { views: 0, visits: 0, engagedMs: 0, reports: 0, signups: 0 }
  for (const d of days) for (const k of Object.keys(t)) t[k] += Number(d?.[k]) || 0
  return {
    visitors,
    questionnaireVisitors,
    visits: t.visits,
    views: t.views,
    reports: t.reports,
    signups: t.signups,
    avgVisitSeconds: t.visits ? Math.round(t.engagedMs / t.visits / 1000) : null,
    pagesPerVisit: t.visits ? Math.round((t.views / t.visits) * 10) / 10 : null,
    signupRate: visitors ? Math.round((t.signups / visitors) * 1000) / 10 : null,
  }
}
