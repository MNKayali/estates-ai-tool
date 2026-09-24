/**
 * lib/reportContent.js — everything the report derives from the data, shared
 * by BOTH renderers (app/report/doc/* for screen + PDF, lib/docx/* for Word):
 * rounding, titles, cleaned text, risks, programme, cost and scope lines, and
 * the page layout. Pure: no React, no node-only imports. If the two outputs
 * must say or decide the same thing, it lives here, never in a renderer.
 */
import { LIMITS, PAGE, TABLES } from './reportStyle.js'
import {
  fmtDate, NRM1_GROUP_LABELS, UNVERIFIED_MARK, belowLineRows, scopeAssumptionLines,
  applicableExclusions, resolveSectionFlags,
} from './reportShared.js'

// ─── Money ───────────────────────────────────────────────────────────────────
export const roundingStep = scaleTotal => ((Number(scaleTotal) || 0) < 100000 ? 100 : 1000)

export function money(n, scaleTotal, { symbol = true } = {}) {
  const step = roundingStep(scaleTotal)
  const v = Math.round((Number(n) || 0) / step) * step
  return `${symbol ? '£' : ''}${v.toLocaleString('en-GB')}`
}

export function compactMoney(n) {
  const v = Number(n) || 0
  if (v >= 1_000_000) return `£${(Math.round(v / 10000) / 100).toFixed(2)}m`
  return money(v, v)
}

export function coverCostRange(cost) {
  const lo = cost?.total?.low, hi = cost?.total?.high
  if (!(hi >= 1_000_000)) return `${money(lo, hi)} – ${money(hi, hi)}`
  return `${compactMoney(lo)} – ${compactMoney(hi)}`
}

export const vatPct = cost => (cost?.vatPct > 0 ? cost.vatPct : 20)

// ─── Text ────────────────────────────────────────────────────────────────────
const Q_PAREN = /\s*\((?:see\s+)?Q\d+(?:\.\d+)?[a-z]?\)/gi
const Q_LEAD = /\bQ\d+(?:\.\d+)?[a-z]?\s*(?:=|includes|has)\s*/gi
const Q_BARE = /\s*\bQ\d+\.\d+[a-z]?\b/g

/** Questionnaire numbers mean nothing to a report reader; strip them. */
export function cleanReportText(s) {
  return String(s ?? '').replace(Q_PAREN, '').replace(Q_LEAD, '').replace(Q_BARE, '').replace(/\s{2,}/g, ' ').trim()
}

const cut = (s, max) => {
  if (s.length <= max) return s
  const c = s.slice(0, max)
  return `${c.slice(0, Math.max(c.lastIndexOf(' '), 1)).replace(/[,;:·—-]+$/, '')}…`
}

export function coverTitle(answers) {
  const t = String(answers?.q1_0_projectName || '').trim() || 'Feasibility study'
  return cut(t, LIMITS.titleChars.max)
}

export const coverTitleSize = title => (String(title).length <= LIMITS.titleChars.full ? 'full' : 'long')

export function shortTitle(answers, max = 40) {
  const t = coverTitle(answers).replace(/^(refurbishment|new build|extension|fit-out|demolition)\s*(of|—|–|-)\s*/i, '')
  return cut(t, max)
}

export function coverSubtitle(answers, cost) {
  const district = String(answers?.q1_1_postcode || '').trim().split(/\s+/)[0].toUpperCase()
  const place = [cost?.bcisRegion, district].filter(Boolean).join(', ')
  const gifa = Number(cost?.gifa) > 0 ? `${Number(cost.gifa).toLocaleString('en-GB')} m² GIFA` : ''
  return [place, answers?.q1_3_buildingUse, gifa].filter(Boolean).join(' · ')
}

export function titleLooksThin(title, postcode) {
  const t = String(title || '').trim()
  const pc = String(postcode || '').trim().toLowerCase()
  if (!t) return true
  if (pc && t.toLowerCase().replace(/\s+/g, '') === pc.replace(/\s+/g, '')) return true
  return t.split(/\s+/).length < 3
}

// ─── Dates and labels ────────────────────────────────────────────────────────
const asDate = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d }
export const fmtLongDate = iso => asDate(iso)?.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) || ''
export function fmtMonthYear(iso) {
  const d = asDate(iso)
  return d ? `${d.toLocaleDateString('en-GB', { month: 'short' })} ${String(d.getFullYear()).slice(2)}` : ''
}
export const confidenceWord = label => String(label || '').replace(/\s*confidence\s*$/i, '').trim() || 'Moderate'

export function reportReference(reportId, data) {
  if (reportId) return String(reportId).slice(0, 8).toUpperCase()
  return data?.sample ? 'SAMPLE' : 'DRAFT'
}

// ─── Moved from both renderers (they had two copies) ─────────────────────────
const RISK_RANK = { High: 3, Medium: 2, Low: 1 }
export function deriveCostRiskLevel(cost, aiProse) {
  const costRisks = (aiProse?.riskRegister || []).filter(r => r.category === 'Cost' && RISK_RANK[r.rating])
  if (costRisks.length === 0) return cost?.percentages?.riskLevel || 'Medium'
  return costRisks.reduce((worst, r) => (RISK_RANK[r.rating] > RISK_RANK[worst] ? r.rating : worst), 'Low')
}

export function calcRoi(answers, cost) {
  const annual = Number(answers?.q5_2_annualBenefit) || 0
  const low = cost?.total?.low || 0
  const high = cost?.total?.high || 0
  if (!annual || !low || !high) return null
  const mid = Math.round(((low + high) / 2) / 1000) * 1000
  return { annual, mid, paybackYears: Math.round((mid / annual) * 10) / 10 }
}

// ─── Risk register ───────────────────────────────────────────────────────────
export const RAG_CLASS = Object.freeze({ High: 'high', Medium: 'med', Low: 'low' })

const riskKey = r => {
  if (r.seedRef && r.seedRef !== 'NONE') return `seed:${r.seedRef}`
  if (r.ref && !/^R\d+$/.test(r.ref)) return `seed:${r.ref}`
  return `text:${String(r.description || '').toLowerCase().slice(0, 60)}`
}

/** The register as printed: de-duplicated, High → Low (stable), capped, renumbered R01…, cleaned. */
export function prepareRisks(register, max = LIMITS.maxRisks) {
  const seen = new Set()
  const kept = []
  for (const r of register || []) {
    const k = riskKey(r)
    if (seen.has(k)) continue
    seen.add(k)
    kept.push(r)
  }
  const ordered = kept
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (RISK_RANK[b.r.rating] || 0) - (RISK_RANK[a.r.rating] || 0) || a.i - b.i)
    .map(x => x.r)
    .slice(0, max)
  const risks = ordered.map((r, i) => ({
    ...r,
    ref: `R${String(i + 1).padStart(2, '0')}`,
    description: cleanReportText(r.description),
    mitigation: cleanReportText(r.mitigation),
  }))
  const counts = { High: 0, Medium: 0, Low: 0 }
  for (const r of risks) if (counts[r.rating] != null) counts[r.rating]++
  return { risks, counts, dropped: kept.length - risks.length }
}

// ─── Programme ───────────────────────────────────────────────────────────────
export function stageCategory(s) {
  if (s?.parallel) return 'parallel'
  const n = String(s?.stage || '').toLowerCase()
  if (/float/.test(n)) return 'float'
  if (/handover/.test(n)) return 'handover'
  if (/construction|phase/.test(n)) return 'construction'
  if (/tender|procurement/.test(n)) return 'tender'
  if (/governance/.test(n)) return 'governance'
  return 'design'
}

export const SEGMENT_KEY_LABELS = Object.freeze({
  design: 'Design & approvals', governance: 'Governance', tender: 'Tender',
  construction: 'Construction', handover: 'Handover', float: 'Float',
})

const wks = s => s?.weeks ?? s?.durationWks ?? 0
const NARROW_PCT = 8

export function overviewSegments(programme) {
  const total = programme?.totalWeeks || 0
  const out = []
  for (const s of programme?.stages || []) {
    if (s.parallel || !wks(s)) continue
    const category = stageCategory(s)
    const last = out[out.length - 1]
    if (last && last.category === category) {
      last.weeks += wks(s)
      last.endWeek = s.endWeek ?? last.endWeek + wks(s)
      continue
    }
    const startWeek = s.startWeek ?? (last ? last.endWeek : 0)
    out.push({ category, label: SEGMENT_KEY_LABELS[category], weeks: wks(s), startWeek, endWeek: s.endWeek ?? startWeek + wks(s) })
  }
  const cons = out.filter(x => x.category === 'construction')
  if (cons.length > 1) cons.forEach((c, i) => { c.label = `Construction ${i + 1}` })
  for (const x of out) {
    x.pct = total ? (x.weeks / total) * 100 : 0
    x.narrow = x.pct < NARROW_PCT
  }
  return out
}

export function selectMilestones(programme) {
  const seq = (programme?.stages || []).filter(s => !s.parallel && wks(s) > 0)
  if (!seq.length) return []
  const cat = stageCategory
  const cons = seq.filter(s => cat(s) === 'construction')
  const firstCon = cons[0], lastCon = cons[cons.length - 1]
  const lastDesign = [...seq].reverse().find(s => cat(s) === 'design' && (!firstCon || (s.endWeek ?? 0) <= (firstCon.startWeek ?? Infinity)))
  const firstPC = seq.find(s => cat(s) === 'handover')
  const phased = !!(firstPC && lastCon && (lastCon.startWeek ?? 0) >= (firstPC.endWeek ?? Infinity))
  const ms = []
  const add = (label, date, week) => ms.push({ label, date, week })
  add(`Project start (${seq[0].stage})`, seq[0].startDate, seq[0].startWeek ?? 0)
  if (lastDesign) add('Design complete', lastDesign.endDate, lastDesign.endWeek)
  if (firstCon) add('Start on site', firstCon.startDate, firstCon.startWeek)
  if (firstPC) add(phased ? 'Phase 1 practical completion' : 'Practical completion', firstPC.endDate, firstPC.endWeek)
  if (phased) add('Final phase complete', lastCon.endDate, lastCon.endWeek)
  else if (!firstPC && lastCon) add('Construction complete', lastCon.endDate, lastCon.endWeek)
  add('Programme complete', programme.endDate, programme.totalWeeks)
  const kept = ms.length > LIMITS.milestonesMax ? [...ms.slice(0, LIMITS.milestonesMax - 1), ms[ms.length - 1]] : ms
  return kept.map((m, i) => ({
    id: `M${i + 1}`, ...m,
    missedTarget: i === kept.length - 1 && programme.targetStatus === 'at-risk',
  }))
}

const TICK_GAP = 0.09
export function milestoneTickClass(ms, i, totalWeeks) {
  if (i === 0) return 'first'
  if (i === ms.length - 1) return 'last'
  const gap = (a, b) => (totalWeeks ? Math.abs(b.week - a.week) / totalWeeks : 1)
  const nextClose = gap(ms[i], ms[i + 1]) < TICK_GAP
  const prevClose = gap(ms[i - 1], ms[i]) < TICK_GAP && milestoneTickClass(ms, i - 1, totalWeeks) !== 'down'
  return nextClose || prevClose ? 'down' : ''
}

export function targetPct(programme, answers) {
  const t = answers?.q4_1_targetDate
  if (!t || t === 'No specific deadline' || !programme?.startDate || !programme?.totalWeeks) return null
  const weeks = (new Date(t) - new Date(programme.startDate)) / (7 * 86400000)
  const pct = (weeks / programme.totalWeeks) * 100
  return pct > 0 && pct < 100 ? pct : null
}

export function programmeDetailRows(programme) {
  const stages = programme?.stages || []
  const rows = []
  const surveys = stages.filter(s => s.parallel && /survey/i.test(s.stage))
  if (surveys.length) {
    const starts = surveys.map(s => s.startDate).filter(Boolean).sort()
    const ends = surveys.map(s => s.endDate).filter(Boolean).sort()
    rows.push({ stage: 'Surveys', activity: surveys.map(s => s.activity || s.stage).join('; '), start: starts[0], end: ends[ends.length - 1], weeks: Math.max(...surveys.map(wks)), parallel: true })
  }
  for (const s of stages) {
    if (s.parallel && /survey/i.test(s.stage)) continue
    const prev = rows[rows.length - 1]
    if (/^gateway$/i.test(String(s.stage).trim()) && prev && !prev.parallel && /^stage /i.test(prev.stage)) {
      prev.activity = `${prev.activity}, incl. ${wks(s)}-wk client review`
      prev.weeks += wks(s)
      prev.end = s.endDate
      continue
    }
    rows.push({ stage: s.stage, activity: s.activity, start: s.startDate, end: s.endDate, weeks: wks(s), parallel: !!s.parallel })
  }
  return rows
}

const NUMBER_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight']

export function programmeNarrativeLines(programme) {
  if (!programme) return []
  const stages = programme.stages || []
  const seq = stages.filter(s => !s.parallel)
  const lines = []
  const surveys = stages.some(s => s.parallel && /survey/i.test(s.stage))
  if (programme.startDate && seq[0]) {
    lines.push(`Starts ${fmtDate(programme.startDate)} at ${seq[0].stage}${programme.startDateAssumed ? ' (assumed; no start date was given)' : ''}${surveys ? '; surveys run alongside design and are not on the critical path' : ''}.`)
  }
  const gateways = stages.filter(s => /^gateway$/i.test(String(s.stage).trim())).length
  const gov = programme.grantGovernanceWeeks || 0
  if (gateways || gov) {
    const parts = [gateways ? `${NUMBER_WORDS[gateways] || gateways} client review gateway${gateways > 1 ? 's' : ''}` : '', gov ? `a ${gov}-week governance approval` : ''].filter(Boolean)
    const text = parts.join(' and ')
    lines.push(`${text.charAt(0).toUpperCase()}${text.slice(1)} sit on the critical path before tender.`)
  }
  const start = selectMilestones(programme).find(m => m.label === 'Start on site')
  if (programme.procurementRoute) {
    lines.push(`Procurement: ${programme.procurementRoute}${programme.tenderWeeks ? ` over ${programme.tenderWeeks} weeks` : ''}${start ? `, contractor appointed ${fmtDate(start.date)}` : ''}.`)
  }
  const cons = seq.filter(s => stageCategory(s) === 'construction')
  if (cons.length > 1) lines.push(`Construction is phased: ${cons.map(c => `${wks(c)} weeks`).join(', then ')}, including re-mobilisation between phases.`)
  else if (cons.length === 1) lines.push(`Construction takes ${wks(cons[0])} weeks${programme.occupationUplift > 0 ? ', including an allowance for working around occupants' : ''}.`)
  if (programme.floatWeeks > 0) lines.push(`${programme.floatWeeks} weeks of float are included; the best case is ${programme.totalWeeksBestCase} weeks.`)
  lines.push(programme.planningWeeks > 0
    ? `A ${programme.planningWeeks}-week planning determination gates technical design.`
    : 'No planning application is assumed; building control approval runs alongside technical design.')
  return lines.slice(0, LIMITS.listMax)
}

// ─── Works cost ──────────────────────────────────────────────────────────────
export const groupTitle = li => `${li.group === 99 ? '' : `${li.group} · `}${li.groupLabel || NRM1_GROUP_LABELS[li.group] || `Group ${li.group}`}`

export function worksRows(cost) {
  const rows = []
  let g
  for (const li of cost?.lineItems || []) {
    if (li.group !== g) { rows.push({ type: 'group', group: li.group, label: groupTitle(li) }); g = li.group }
    rows.push({ type: 'line', item: li })
  }
  return rows
}

export const worksTableMode = cost => (worksRows(cost).length <= LIMITS.worksRowsPerPage ? 'lines' : 'groups')

export function worksGroupRows(cost) {
  const m = new Map()
  for (const li of cost?.lineItems || []) {
    const r = m.get(li.group) || { group: li.group, label: groupTitle(li), count: 0, low: 0, high: 0 }
    r.count++
    r.low += li.lineLow || 0
    r.high += li.lineHigh || 0
    m.set(li.group, r)
  }
  return [...m.values()]
}

export function appendixChunks(cost) {
  const rows = worksRows(cost)
  const out = []
  for (let i = 0; i < rows.length; i += LIMITS.appendixRowsPerPage) out.push(rows.slice(i, i + LIMITS.appendixRowsPerPage))
  return out
}

const fmtQty = n => {
  const v = Number(n)
  if (!Number.isFinite(v)) return String(n ?? '')
  return (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString('en-GB')
}
export const lineQty = li => (li.unit === 'band' ? 'lump sum' : `${fmtQty(li.qty)} ${li.unit || ''}`.trim())
export const lineBasisWord = li => (li.qtySource === 'user' ? 'client figure' : li.qtySource ? 'estimated' : '')

const lineMid = li => li.lineMid ?? ((li.lineLow || 0) + (li.lineHigh || 0)) / 2

/** Page 6 intro when there is no AI cost narrative yet (pending or legacy). */
export function costIntroText(cost) {
  if (!cost) return ''
  const lines = (cost.lineItems || []).filter(l => l.code !== 'PS')
  const user = lines.filter(l => l.qtySource === 'user').length
  const est = lines.length - user
  const gifa = Number(cost.gifa || 0).toLocaleString('en-GB')
  const byGroup = new Map()
  for (const l of lines) {
    const k = l.groupLabel || NRM1_GROUP_LABELS[l.group] || `Group ${l.group}`
    byGroup.set(k, (byGroup.get(k) || 0) + lineMid(l))
  }
  const works = cost.works?.mid || [...byGroup.values()].reduce((a, b) => a + b, 0)
  const top = [...byGroup.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
  const share = works ? Math.round((top.reduce((a, [, v]) => a + v, 0) / works) * 100) : 0
  const topText = top.map(([g]) => g.toLowerCase()).join(' and ')
  return [
    `Each ticked scope item is priced at the NRM1 benchmark rate for a ${String(cost.specLevel || 'standard').toLowerCase()}-specification ${String(cost.projectType || '').toLowerCase()}, adjusted by the ${cost.bcisRegion} location factor (${cost.bcisFactor}).`,
    user ? `${est} quantities are estimated from the ${gifa} m² floor area and ${user} are the client's own figures.` : `Quantities are estimated from the ${gifa} m² floor area.`,
    top.length ? `${topText.charAt(0).toUpperCase()}${topText.slice(1)} account for ${share}% of the works cost.` : '',
    'The next page adds preliminaries, fees and allowances to reach the total project cost.',
  ].filter(Boolean).join(' ')
}

// ─── Project cost ────────────────────────────────────────────────────────────
const pctTxt = n => `${Math.round((Number(n) || 0) * 100) / 100}%`

export function projectCostRows(cost) {
  if (!cost) return []
  const p = cost.percentages || {}
  const w = cost.works || {}, c = cost.construction || {}, t = cost.total || {}
  const of = (base, pc) => ({ low: (base.low || 0) * (pc || 0) / 100, high: (base.high || 0) * (pc || 0) / 100 })
  const rows = [
    { label: 'Works cost', rate: 'from the works cost table', low: w.low, high: w.high, kind: 'row' },
    { label: "Contractor's preliminaries (A)", rate: `${pctTxt(p.prelims)} of works`, ...of(w, p.prelims), kind: 'row' },
    { label: 'Overheads and profit (B)', rate: `${pctTxt(p.ohp)} of works`, ...of(w, p.ohp), kind: 'row' },
    { label: 'Construction cost', rate: '', low: c.low, high: c.high, kind: 'subtotal' },
    { label: 'Professional fees (C)', rate: `${pctTxt(p.fees)} of construction`, ...of(c, p.fees), kind: 'row' },
  ]
  if ((cost.breakdown?.devCosts || 0) > 0) rows.push({ label: 'Developer and project costs (D)', rate: `${pctTxt(p.devCosts)} of construction`, ...of(c, p.devCosts), kind: 'row' })
  rows.push(
    { label: 'Risk allowance (E)', rate: `${pctTxt(p.risk)} of works`, ...of(w, p.risk), kind: 'row' },
    { label: 'Client contingency (H)', rate: `${pctTxt(p.contingency)} of works`, ...of(w, p.contingency), kind: 'row' },
  )
  if ((p.inflation || 0) > 0) rows.push({ label: 'Inflation allowance (F)', rate: `${pctTxt(p.inflation)} of works`, ...of(w, p.inflation), kind: 'row' })
  for (const b of belowLineRows(cost)) rows.push({ label: b.label, rate: b.basis, low: b.low, high: b.high, kind: 'row' })
  const vat = vatPct(cost)
  rows.push(
    { label: 'Total project cost (excl. VAT)', rate: '', low: t.low, high: t.high, kind: 'total' },
    { label: `VAT at ${vat}%, for reference (recoverability to be confirmed)`, rate: `${vat}%`, low: (t.low || 0) * vat / 100, high: (t.high || 0) * vat / 100, kind: 'ref' },
  )
  return rows
}

const PCT_NAMES = [
  ['prelims', 'Preliminaries'], ['ohp', 'Overheads and profit'], ['fees', 'Professional fees'],
  ['devCosts', 'Developer and project costs'], ['risk', 'Risk'], ['contingency', 'Contingency'], ['inflation', 'Inflation'],
]

export function plainRule(label) {
  let s = cleanReportText(label).replace(/\s*→.*$/, '').replace(/\s*\(use [^)]*\)/i, '').replace(/\s*—\s*no developer costs applied/i, '').trim()
  if (/^[A-Z][a-z]/.test(s)) s = s.charAt(0).toLowerCase() + s.slice(1)
  return s
}

export function percentageLines(cost) {
  const trace = cost?.trace
  if (!trace) return []
  const out = []
  for (const [key, name] of PCT_NAMES) {
    const applied = cost.percentages?.[key]
    if (!(applied > 0)) continue
    const entries = trace[key] || []
    let text
    if (entries.length === 1 && /^always\b/i.test(entries[0].label)) text = 'fixed for every report'
    else if (entries.length === 1 && entries[0].pct === applied && !/^(base|baseline)\b/i.test(entries[0].label)) text = `the standard rate for ${plainRule(entries[0].label)}`
    else {
      const parts = entries.map(e => (/^(base|baseline)\b/i.test(e.label) ? `${pctTxt(e.pct)} base` : `${pctTxt(e.pct)} for ${plainRule(e.label)}`))
      text = parts.length > 1 ? `${parts[0]}, plus ${parts.slice(1).join(', ')}` : (parts[0] || '')
    }
    out.push({ name, pct: pctTxt(applied), text })
  }
  return out.slice(0, LIMITS.listMax)
}

export function accuracyStatement(cost) {
  const r = cost?.rangeApplied
  if (!r) return 'Low and high show the benchmark rate range; at Stage 0–1 the outturn cost can move further as the design develops.'
  const lo = Math.round((1 - r.low) * 100), hi = Math.round((r.high - 1) * 100)
  return `Low and high are −${lo}% / +${hi}% around the mid-point${r.grade ? `, the range for a Grade ${r.grade} estimate` : ''}; at Stage 0–1 the outturn cost can move further as the design develops.`
}

export function costAssumptionLines(cost) {
  if (!cost) return []
  const lines = (cost.lineItems || []).filter(l => l.code !== 'PS')
  const userLines = lines.filter(l => l.qtySource === 'user')
  const out = [
    `National benchmark rates adjusted by the ${cost.bcisRegion} location factor (${cost.bcisFactor}); not measured quantities.${cost.bcisDefaulted ? ' The postcode matched no region, so a default factor was used.' : ''}`,
    lines.length > userLines.length ? `Estimated quantities are derived from the ${Number(cost.gifa || 0).toLocaleString('en-GB')} m² floor area and confirmed at Stage 2.` : null,
    userLines.length ? `Client figures are used for ${userLines.slice(0, 3).map(l => `${l.description} (${lineQty(l)})`).join(', ')}${userLines.length > 3 ? ' and others' : ''}.` : null,
    `Rates are for a ${String(cost.specLevel || 'standard').toLowerCase()} specification${cost.interventionLevel ? ` and ${String(cost.interventionLevel).toLowerCase()}` : ''}.`,
    accuracyStatement(cost),
    lines.some(l => l.aiEstimate) ? `Lines marked ${UNVERIFIED_MARK} use rates still to be verified against project examples.` : null,
    ...scopeAssumptionLines(cost),
  ].filter(Boolean)
  return out.slice(0, LIMITS.listMax)
}

const EXCLUSIONS = [
  ['vat', 'VAT (recoverability to be confirmed by the client)'],
  ['ffe', 'Loose furniture, fittings and AV equipment'],
  ['decant', 'Decant, removals and temporary accommodation'],
  ['land', 'Land, legal fees and statutory charges beyond planning'],
  ['asbestos', 'Asbestos removal beyond the risk allowance'],
  ['ground', 'Unforeseen ground or structural conditions'],
  ['party', 'Party wall awards and neighbourly matters'],
  ['archaeology', 'Archaeological investigation'],
]

export function costExclusionLines(cost, answers) {
  const groups = new Set((cost?.lineItems || []).map(i => i.group))
  const groundworks = groups.has(0) || groups.has(1) || groups.has(8)
  const partyWall = (answers?.q3_8_siteContext || []).some(x => /party wall/i.test(x))
  let list = EXCLUSIONS.filter(([k]) => (k !== 'archaeology' || groundworks) && (k !== 'party' || partyWall)).map(([, t]) => t)
  if (partyWall) list = [list[0], 'Party wall awards and neighbourly matters', ...list.slice(1).filter(t => !/^Party wall/.test(t))]
  return applicableExclusions(list, cost).slice(0, LIMITS.listMax)
}

// ─── Scope ───────────────────────────────────────────────────────────────────
export function scopeStatement(cost) {
  if (!cost) return ''
  const n = (cost.lineItems || []).filter(l => l.code !== 'PS').length
  return `${cost.projectType || 'Project'}${cost.interventionLevel ? ` (${String(cost.interventionLevel).toLowerCase()})` : ''} of ${Number(cost.gifa || 0).toLocaleString('en-GB')} m² GIFA, ${String(cost.specLevel || 'standard').toLowerCase()} specification, ${n} priced scope item${n === 1 ? '' : 's'}.`
}

export function scopeGroups(cost) {
  const m = new Map()
  for (const li of cost?.lineItems || []) {
    if (li.code === 'PS') continue
    const label = li.groupLabel || NRM1_GROUP_LABELS[li.group] || `Group ${li.group}`
    const g = m.get(label) || { label, items: [] }
    const name = li.qtySource === 'user' && li.unit === 'nr' ? `${li.description} (${fmtQty(li.qty)})` : li.description
    if (!g.items.includes(name)) g.items.push(name)
    m.set(label, g)
  }
  return [...m.values()].map(g => (g.items.length > LIMITS.scopeItemsPerGroup
    ? { ...g, items: [...g.items.slice(0, LIMITS.scopeItemsPerGroup - 1), `and ${g.items.length - LIMITS.scopeItemsPerGroup + 1} more (see the cost table)`] }
    : g))
}

export function notInScopeLines(cost) {
  const items = cost?.lineItems || []
  const groups = new Set(items.map(l => l.group))
  const names = items.map(l => `${l.item || ''} ${l.description || ''}`.toLowerCase())
  const out = []
  if (!names.some(n => /roof/.test(n))) out.push('Roof replacement or recovering')
  if (!names.some(n => /structur|frame/.test(n))) out.push('Structural alterations')
  if (!groups.has(1)) out.push('Substructure and new foundations')
  if (!groups.has(8)) out.push('External works and landscaping')
  if (!names.some(n => /loose furniture|ff&e/.test(n))) out.push('Loose furniture and AV equipment')
  out.push('Decant accommodation and removals')
  return out.slice(0, LIMITS.listMax)
}

export function notPricedLines(cost) {
  const out = [
    ...(cost?.excludedNoQuantity || []).map(e => `${e.description}: not priced (${cleanReportText(e.reason || 'quantity to be confirmed')}).`),
    ...(cost?.adjustments || []).map(a => `${a.item || a.description || a.code}: not priced (${cleanReportText(a.reason)}).`),
    ...(cost?.additionalScopeNote ? [cleanReportText(cost.additionalScopeNote)] : []),
  ]
  return out.length > LIMITS.notPricedMax
    ? [...out.slice(0, LIMITS.notPricedMax - 1), `And ${out.length - LIMITS.notPricedMax + 1} more selected items not priced.`]
    : out
}

// ─── Late sections: sharing pages ────────────────────────────────────────────
// Heights in CSS px on the 794 px page, matching app/report/doc/report.css.
// Deliberately a little generous; scripts/check-report-fit.mjs proves the real render fits.
export const EST = Object.freeze({
  band: 64, h3: 34, figs: 92, kvRow: 34, paraLine: 20, listLine: 19.5, listGap: 4,
  tableHead: 32, rowPad: 13, rowLine: 18.5, blockGap: 10, charsPerLine: 98,
})

export function estimateHeight(blocks) {
  let h = 0
  for (const b of blocks) {
    if (b.band) h += EST.band
    else if (b.h3) h += EST.h3
    else if (b.figs) h += EST.figs
    else if (b.kv) h += EST.kvRow * b.kv + EST.blockGap
    else if (b.para != null) h += Math.max(1, Math.ceil(String(b.para).length / EST.charsPerLine)) * EST.paraLine + EST.blockGap
    else if (b.list) h += b.list.reduce((a, t) => a + Math.ceil(String(t).length / (EST.charsPerLine - 4)) * EST.listLine + EST.listGap, 0) + (b.list.length ? EST.blockGap : 0)
    else if (b.table) {
      h += EST.tableHead + b.table.rows.reduce((a, cells) => a + EST.rowPad + EST.rowLine * Math.max(...cells.map((c, i) =>
        Math.ceil(String(c).length / Math.max(8, EST.charsPerLine * 1.07 * b.table.widths[i])))), 0)
    }
  }
  return Math.ceil(h)
}

export function lateSectionBlocks(key, data) {
  const a = data?.aiProse || {}
  if (key === 'roi') return [{ band: 1 }, { figs: 1 }, { para: a.roiNarrative || '' }]
  if (key === 'procurement') return [
    { band: 1 }, { kv: 3 }, { para: a.procurementNarrative || '' },
    ...(a.procurementConsiderations?.length ? [{ h3: 1 }, { list: a.procurementConsiderations }] : []),
    ...(a.procurementConflicts?.length ? [{ list: a.procurementConflicts }] : []),
  ]
  if (key === 'constraints') return [
    { band: 1 },
    { table: { widths: TABLES.constraints, rows: (a.constraints || []).map(c => [c.category, c.title, c.text]) } },
  ]
  return [{ band: 1 }]
}

/**
 * Two late sections share a page: split at the middle when each fits its half
 * ('top' / 'bottom'); otherwise the second follows the first ('flow') when both
 * fit the page; otherwise each takes its own page ('full', or 'top' when it
 * could still share with the next one).
 */
export function layoutLateSections(sections) {
  const pages = []
  let open = null // { h, slots } of a page with one section on it
  const bottomHalf = PAGE.bodyPx - PAGE.halfSlotPx
  for (const s of sections) {
    const h = estimateHeight(s.blocks)
    if (open) {
      const [first] = open.slots
      if (open.h <= PAGE.halfSlotPx && h <= bottomHalf) {
        first.slot = 'top'
        open.slots.push({ key: s.key, slot: 'bottom' })
        open = null
        continue
      }
      if (open.h + PAGE.slotGapPx + h <= PAGE.bodyPx) {
        first.slot = 'flow'
        open.slots.push({ key: s.key, slot: 'flow' })
        open = null
        continue
      }
      open = null
    }
    const slots = [{ key: s.key, slot: h <= PAGE.halfSlotPx ? 'top' : 'full' }]
    pages.push(slots)
    open = h < PAGE.bodyPx - PAGE.slotGapPx ? { h, slots } : null
  }
  return pages
}

// ─── Page map ────────────────────────────────────────────────────────────────
export function buildPageMap(data, { isPending = false } = {}) {
  const { answers, cost, aiProse } = data || {}
  const roi = calcRoi(answers, cost)
  const { showROI, showProc, showCon } = resolveSectionFlags(answers, roi)
  const late = []
  if (showROI) late.push({ key: 'roi' })
  if (showProc) late.push({ key: 'procurement' })
  if (showCon && (aiProse?.constraints?.length || isPending)) late.push({ key: 'constraints' })
  let sn = 5
  const numbers = {}
  for (const s of late) { numbers[s.key] = ++sn; s.blocks = lateSectionBlocks(s.key, data) }
  const nextNo = sn + 1
  const pages = ['cover', 'summary', 'scope', 'risk', 'programme', 'costWorks', 'costSummary'].map(kind => ({ kind }))
  for (const slots of layoutLateSections(late)) pages.push({ kind: 'late', slots: slots.map(s => ({ ...s, no: numbers[s.key] })) })
  pages.push({ kind: 'last', no: nextNo })
  if (worksTableMode(cost) === 'groups') {
    const chunks = appendixChunks(cost)
    chunks.forEach((rows, i) => pages.push({ kind: 'appendix', rows, part: i + 1, parts: chunks.length }))
  }
  return { pages, ctx: { short: shortTitle(answers), totalPages: pages.length, roi, nextNo } }
}

// ─── Last page ───────────────────────────────────────────────────────────────
export const DISCLAIMER = 'This report was produced at RIBA Stage 0–1 from benchmark cost and programme data. All figures are indicative and will change as surveys, design and procurement progress. It is not a formal cost plan and must not be used for a financial commitment without review by a Chartered Quantity Surveyor. Programme durations assume standard productivity and client decisions within the gateway periods shown.'

export function dataSourcesSentence(cost, programme) {
  const parts = [cost?.workbookVersion && `cost data ${cost.workbookVersion}`, programme?.workbookVersion && `programme data ${programme.workbookVersion}`].filter(Boolean)
  return parts.length ? `Sources: ${parts.join('; ')}.` : ''
}
