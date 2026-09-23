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

// ─── Optional section flags (legacy answers only) ────────────────────────────
// There is no longer a question asking which sections to include or leave out.
// It went through an include-list (`q6_1_sections`) and then an exclude-list
// (`q6_1_excludeSections`) before being removed: it asked the user to decide
// something before they had seen a report, and the two genuinely conditional
// sections already hide themselves when they have no data.
//
// This function stays because reports generated under either scheme live in KV
// for 90 days and must keep rendering the way they were generated. With neither
// key present — every new report — everything is included. Both renderers call
// it so the on-screen, PDF and .docx section sets, and therefore the section
// numbers, always agree.
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

// ─── NRM1 v5.2 scope lines ───────────────────────────────────────────────────
// Every priced line carries where its quantity came from (the client's figure
// or the workbook's estimate), whether its rate is marked "AI estimate –
// verify", and its BCIS element split. Reports generated before v5.2 have none
// of these fields; every helper here returns '' / null / [] for them so an old
// KV report renders exactly as it did.

/** Standard NRM1 element group names, for the works-by-group total. */
export const NRM1_GROUP_LABELS = {
  0: 'Facilitating works', 1: 'Substructure', 2: 'Superstructure', 3: 'Internal finishes',
  4: 'Fittings, furnishings and equipment', 5: 'Services', 6: 'Prefabricated buildings',
  7: 'Work to existing buildings', 8: 'External works', 12: 'Other development and project costs',
}

/** Works-table group banner: the workbook's own group name where the line carries one. */
export function groupHeading(item, fallbackNames = {}) {
  if (item?.groupLabel) return item.group === 99 ? String(item.groupLabel).toUpperCase() : `GROUP ${item.group} — ${String(item.groupLabel).toUpperCase()}`
  return fallbackNames[item?.group] || `GROUP ${item?.group}`
}

export const UNVERIFIED_MARK = '†'

const fmtQty = n => {
  const v = Number(n)
  if (!Number.isFinite(v)) return String(n ?? '')
  return (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString('en-GB')
}

/** "≈ 40 nr · estimated" / "12 nr · your figure" under each line's name. */
export function lineBasis(item) {
  if (!item || item.code === 'PS' || !item.qtySource) return ''
  const unit = item.unit && item.unit !== 'band' ? ` ${item.unit}` : ''
  const qty = item.unit === 'band' ? 'lump sum' : `${fmtQty(item.qty)}${unit}`
  const basis = item.qtySource === 'user'
    ? `${qty} · your figure`
    : `${item.unit === 'band' ? '' : '≈ '}${qty} · estimated`
  return `${basis}${item.aiEstimate ? ` · ${UNVERIFIED_MARK} unverified rate` : ''}`
}

/** Estimate Basis: how the quantities were arrived at. */
export function quantityBasisSentence(cost) {
  const lines = [...(cost?.lineItems || []), ...(cost?.belowLine?.items || [])].filter(li => li.code !== 'PS' && li.qtySource)
  if (lines.length === 0) return null
  const user = lines.filter(li => li.qtySource === 'user').length
  const est = lines.length - user
  const parts = []
  if (est > 0) parts.push(`${est} of ${lines.length} priced lines are estimated by the NRM1 workbook's quantity rules from the floor area, footprint, external works area and typical ratios (marked "estimated" in the cost table)`)
  if (user > 0) parts.push(`${user} use the client's own figures`)
  return `Quantities: ${parts.join('; ')}. Any estimated quantity can be replaced with the real figure in the questionnaire ("I know this") and the estimate re-run.`
}

/** Estimate Basis: lines priced on rates the workbook marks as unverified. */
export function unverifiedRatesSentence(cost) {
  const lines = [...(cost?.lineItems || []), ...(cost?.belowLine?.items || [])].filter(li => li.code !== 'PS')
  const flagged = lines.filter(li => li.aiEstimate)
  if (flagged.length === 0) return null
  return `${UNVERIFIED_MARK} ${flagged.length} of ${lines.length} priced lines use a rate marked "AI estimate – verify" in the NRM1 workbook (${[...new Set(flagged.map(li => li.item || li.description))].join(', ')}). Treat these as unverified until they are checked against real project examples.`
}

/** Estimate Basis: works cost totalled by NRM1 element group, from each line's BCIS split. */
export function bcisGroupSentence(cost) {
  const totals = cost?.bcisTotals
  if (!Array.isArray(totals) || totals.length === 0) return null
  const byGroup = new Map()
  for (const t of totals) byGroup.set(t.group, (byGroup.get(t.group) || 0) + t.amount)
  const f1k = n => `£${(Math.round(n / 1000) * 1000).toLocaleString('en-GB')}`
  const parts = [...byGroup.entries()].sort((a, b) => a[0] - b[0])
    .filter(([, amt]) => Math.round(amt / 1000) > 0)
    .map(([g, amt]) => `${g} ${NRM1_GROUP_LABELS[g] || `Group ${g}`} ${f1k(amt)}`)
  return parts.length ? `Works cost by NRM1 element group (each line split by its BCIS element shares): ${parts.join(' · ')}.` : null
}

/** Rows for the project cost table: lines priced below the construction total (NRM1 group 12). */
export function belowLineRows(cost) {
  const b = cost?.belowLine
  if (!b || !(b.mid > 0)) return []
  return [{
    label: `Other development costs — ${(b.items || []).map(li => li.description).join(', ')} (NRM1 group 12)`,
    basis: 'Below construction',
    low: b.low, high: b.high,
  }]
}

/** Cost assumptions the scope itself raised ('When selected' ASSUME effects, one-band-up rate changes, modular construction). */
export function scopeAssumptionLines(cost) {
  const out = (cost?.scopeEffects?.assumptions || []).map(a => {
    const t = String(a.text || '').trim()
    return `${a.item}: ${t.charAt(0).toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? '' : '.'}`
  })
  if (cost?.constructionMethod === 'Modular') out.push('Modular construction selected: substructure, superstructure and internal finishes are priced with the NRM1 workbook\'s modular factor.')
  return out
}

/** The band-position sentence, which only applies where level of intervention was asked. */
export function bandFactorSentence(cost) {
  if (!cost) return ''
  if (cost.interventionLevel === null) return 'No band position factor applies — level of intervention is only asked for refurbishment and fit-out projects.'
  return `Band position factor of ${cost.bandFactor} applied (${cost.interventionLevel}).`
}

/** Standard exclusions that the priced scope has in fact included are dropped. */
export function applicableExclusions(list, cost) {
  const names = (cost?.lineItems || []).map(li => String(li.item || li.description || '').toLowerCase())
  return list.filter(e => !(/loose furniture/i.test(e) && names.some(n => n.includes('loose furniture'))))
}
