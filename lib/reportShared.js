/**
 * lib/reportShared.js — text and row builders shared by BOTH report renderers.
 *
 * app/report/ReportRenderer.jsx (client, HTML/PDF) and lib/reportBuilder.js
 * (server, .docx) are two implementations of the same report and have drifted
 * before. Anything here is pure data-in, strings/rows-out with no React and no
 * node-only imports, so it can be imported by either side and the two outputs
 * cannot disagree on it.
 */

// ─── Percentage build-up (cost.trace) ────────────────────────────────────────
// One row per Tab 3 rule that fired, grouped by addition code, followed by the
// applied total as a subtotal row so the reader can foot each percentage.
export const BUILD_UP_CODES = [
  ['prelims',     'A', "Contractor's Preliminaries"],
  ['ohp',         'B', 'Overheads & Profit'],
  ['fees',        'C', 'Professional Fees'],
  ['devCosts',    'D', 'Developer & Project Costs'],
  ['risk',        'E', 'Risk Allowance'],
  ['contingency', 'H', 'Client Contingency'],
  ['inflation',   'F', 'Inflation Allowance'],
]

export function buildUpRows(cost) {
  const trace = cost?.trace || {}
  const p = cost?.percentages || {}
  const rows = []
  for (const [key, code, title] of BUILD_UP_CODES) {
    const entries = trace[key] || []
    if (entries.length === 0 && !(p[key] > 0)) continue
    for (const e of entries) rows.push({ code, title: '', label: e.label, pct: e.pct, subtotal: false })
    rows.push({ code, title, label: `Applied ${title} (${code})`, pct: p[key] ?? 0, subtotal: true })
  }
  return rows
}

export const fmtSignedPct = n => `${n > 0 ? '+' : ''}${Math.round(n * 100) / 100}%`
export const fmtPlainPct  = n => `${Math.round(n * 100) / 100}%`

// Compact text form for the AI prompt — the model may reference these rules
// but never chooses or alters them.
export function buildUpPromptLines(cost) {
  const lines = []
  for (const [key, code, title] of BUILD_UP_CODES) {
    const entries = cost?.trace?.[key] || []
    if (entries.length === 0) continue
    const parts = entries.map(e => `${e.label} ${fmtSignedPct(e.pct)}`).join('; ')
    lines.push(`${title} (${code}) = ${fmtPlainPct(cost.percentages?.[key] ?? 0)}: ${parts}`)
  }
  return lines
}

// ─── Estimate Basis sentences ────────────────────────────────────────────────
export function rangeSentence(cost) {
  const r = cost?.rangeApplied
  if (!r) return 'The range shown reflects benchmark rate uncertainty only.'
  const lowPct = Math.round((1 - r.low) * 100), highPct = Math.round((r.high - 1) * 100)
  return r.fromWorkbook && r.grade
    ? `The range shown (−${lowPct}% / +${highPct}% around the mid-point) is set by the deterministic confidence grade ${r.grade} from the NRM1 workbook's Range Widths table — the less that is known about the project, the wider the range.`
    : `The range shown (−${lowPct}% / +${highPct}% around the mid-point) reflects benchmark rate uncertainty only.`
}

export function baseDateLabel(cost) {
  return cost?.baseDate || 'the workbook issue date'
}

export function rateSourcesSentence(cost) {
  const items = (cost?.lineItems || []).filter(li => li.code !== 'PS')
  if (items.length === 0) return null
  const sources = [...new Set(items.map(li => String(li.source || '').trim()).filter(Boolean))]
  const unsourced = items.filter(li => !String(li.source || '').trim()).length
  if (sources.length === 0) {
    return `Rate sources: not recorded against individual rates in this workbook issue — all ${items.length} priced lines are unsourced benchmark rates pending calibration.`
  }
  return `Rate sources: ${sources.join('; ')}${unsourced > 0 ? ` (${unsourced} of ${items.length} priced lines unsourced)` : ''}.`
}

// ─── Optional section flags (Q6.1) ───────────────────────────────────────────
// September 2026: Q6.1 became "sections to leave out" (`q6_1_excludeSections`)
// and the cost estimate is never optional — a feasibility report with no cost
// section was a contradiction. Reports already in KV (90-day tail) and old
// drafts still carry the previous include-list (`q6_1_sections` /
// `q6_1_reportSections`), which is honoured when no exclude-list is present.
// Both renderers call this so the on-screen, PDF and .docx section sets — and
// therefore the section numbers — always agree.
export const EXCLUDABLE_REPORT_SECTIONS = [
  'ROI & Financial Case', 'Procurement Recommendation', 'Constraints Summary',
]
export function resolveSectionFlags(answers, roi) {
  const excl = answers?.q6_1_excludeSections
  let showROI, showProc, showCon
  if (Array.isArray(excl)) {
    showROI  = !excl.includes('ROI & Financial Case')
    showProc = !excl.includes('Procurement Recommendation')
    showCon  = !excl.includes('Constraints Summary')
  } else {
    const chosen = answers?.q6_1_sections || answers?.q6_1_reportSections
    const opt = Array.isArray(chosen) && chosen.length > 0
      ? chosen
      : ['Order of Cost Estimate (NRM1)', 'ROI & Financial Case', 'Procurement Recommendation', 'Constraints Summary']
    showROI  = opt.includes('ROI & Financial Case')
    showProc = opt.includes('Procurement Recommendation')
    showCon  = opt.includes('Constraints Summary')
  }
  return { showCost: true, showROI: !!roi && showROI, showProc, showCon }
}

// ─── Programme dates ─────────────────────────────────────────────────────────
// ISO date string → "12 Mar 2027". Both renderers print programme dates with
// this so the .docx and the page never disagree on a format.
export function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
export function stageDateRange(stage) {
  if (!stage?.startDate || !stage?.endDate) return ''
  return `${fmtDate(stage.startDate)} – ${fmtDate(stage.endDate)}`
}

// ─── Programme headline ──────────────────────────────────────────────────────
// "72 weeks" plus, when a float was applied, the best case it was built from.
export function programmeHeadline(programme) {
  const total = programme?.totalWeeks
  if (total == null) return '—'
  const fl = programme?.floatWeeks || 0
  const best = programme?.totalWeeksBestCase
  return fl > 0 && best != null
    ? `${total} weeks (best case ${best} weeks + ${fl} weeks float)`
    : `${total} weeks`
}

// FastTrack levers whose trigger fired — offered, never applied.
// The workbook's "Approx weeks saved" cell is sometimes a plain range
// ("6 – 10") and sometimes prose ("0 on critical path; de-risks"). Only the
// former gets "weeks" appended; the latter is quoted as written.
function savingPhrase(weeksSaved) {
  const s = String(weeksSaved || '').trim()
  if (!s) return ''
  return /^[\d\s–—-]+$/.test(s) ? ` Approx. saving ${s} weeks.` : ` Weeks saved: ${s}.`
}
export function fastTrackLines(programme) {
  return (programme?.fastTrackOptions || []).map(o =>
    `${o.id} — ${o.lever}: ${o.action}${savingPhrase(o.weeksSaved)}${o.tradeOff ? ` Trade-off: ${o.tradeOff}` : ''}`)
}
