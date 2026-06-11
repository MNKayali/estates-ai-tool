/**
 * costCalculator.js — Deterministic NRM1 cost engine.
 * All numbers come from the NRM1 Excel workbook fetched from GitHub.
 * The AI never sees this code and never touches these numbers.
 */
import * as XLSX from 'xlsx'
import { matchesBuildingUse, countMeItems } from './buildingUse.js'

// ─── In-memory cache (10 min) ────────────────────────────────────────────────
let _cache = { wb: null, fetchedAt: 0 }

export async function fetchRatesWorkbook() {
  const now = Date.now()
  if (_cache.wb && now - _cache.fetchedAt < 10 * 60 * 1000) return _cache.wb
  const url = process.env.RATES_FILE_URL
  if (!url) throw new Error('RATES_FILE_URL environment variable not set')
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Failed to fetch NRM1 workbook: HTTP ${res.status}`)
  const buf = await res.arrayBuffer()
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
  _cache = { wb, fetchedAt: now }
  return wb
}

// ─── Tab parsers ─────────────────────────────────────────────────────────────

// NRM1 v4.5 "2. Master Cost Table" — header at row index 3, data from index 4.
// Cols: 0 Code · 1 NRM1 Ref · 2 Grp · 3 Building Use · 4 Element/Description ·
//       5 Unit · 6 Pricing Type · 7 Min Lvl · 8 Quantity to capture ·
//       9 Rfb Basic · 10 Rfb Std · 11 Rfb High · 12 NB Std · 13 NB High ·
//       14 Ext Std · 15 Ext High · 16 Ext Works · 17 BCIS (Yes/No) · 18 Notes
// Group banner rows have Code beginning "GROUP n - ..." — captured for labels, skipped as elements.
function parseMasterCostTable(wb) {
  const ws = wb.Sheets['2. Master Cost Table']
  if (!ws) throw new Error('NRM1 workbook missing sheet "2. Master Cost Table"')
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const elements = {}
  const groupLabels = {}
  for (let i = 4; i < rows.length; i++) {
    const r = rows[i]
    const code = String(r[0] || '').trim()
    if (!code) continue
    if (/^GROUP/i.test(code)) {
      const m = code.match(/^GROUP\s+(\d+)/i)
      if (m) groupLabels[Number(m[1])] = code.replace(/\s+/g, ' ').trim()
      continue
    }
    const group = Number(r[2])
    elements[code] = {
      code,
      nrm1ref: String(r[1] || '').trim(),
      group: Number.isFinite(group) ? group : 0,
      buildingUse: String(r[3] || '').trim(),
      description: String(r[4] || '').trim(),
      unit: String(r[5] || '').trim(),
      pricingType: String(r[6] || '').trim(),
      minLvl: Number(r[7]) || 1,
      qtyCapture: String(r[8] || '').trim(),
      rfbBasic: Number(r[9]) || 0,
      rfbStd:   Number(r[10]) || 0,
      rfbHigh:  Number(r[11]) || 0,
      nbStd:    Number(r[12]) || 0,
      nbHigh:   Number(r[13]) || 0,
      extStd:   Number(r[14]) || 0,
      extHigh:  Number(r[15]) || 0,
      extWorks: Number(r[16]) || 0,
      bcis: String(r[17] || '').trim().toLowerCase() === 'yes',
      notes: String(r[18] || '').trim(),
    }
  }
  return { elements, groupLabels }
}

function parsePercentageRules(wb) {
  const ws = wb.Sheets['3. Percentage Rules']
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const rules = []
  for (let i = 4; i < rows.length; i++) {
    const r = rows[i]
    const code = String(r[0] || '').trim()
    if (!code || !r[2]) continue
    rules.push({
      code,
      addition: String(r[1] || '').trim(),
      type: String(r[2] || '').trim(),
      adjustPct: Number(r[3]) || 0,
      capPct: Number(r[4]) || 0,
      condition: String(r[5] || '').trim(),
    })
  }
  return rules
}

function parseSpecLevelMap(wb) {
  const ws = wb.Sheets['5. Spec Level Map']
  if (!ws) return { bandFactors: {}, designMultipliers: {} }
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const bandFactors = {}
  const designMultipliers = {}
  for (const row of rows) {
    const label = String(row[0] || '').trim()
    if (!label || label.startsWith('Q2.') || label.startsWith('TWO') || label.startsWith('SPEC') || label.startsWith('*') || label.startsWith('UPDATE')) continue
    const bm = String(row[1] || '').match(/×\s*([\d.]+)/)
    if (bm) bandFactors[label] = parseFloat(bm[1])
    const dm = String(row[3] || '').match(/×\s*([\d.]+)/)
    if (dm) designMultipliers[label] = parseFloat(dm[1])
  }
  return { bandFactors, designMultipliers }
}

function parseBcisFactors(wb) {
  const ws = wb.Sheets['6. BCIS Location Factors']
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const regions = []
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i]
    const region = String(r[0] || '').trim()
    if (!region) continue
    const postcodes = String(r[1] || '').split(',').map(p => p.trim()).filter(Boolean)
    regions.push({
      region: region.replace(' ★ DEFAULT', '').trim(),
      postcodes,
      low: Number(r[2]) || 0,
      high: Number(r[3]) || 0,
      mid: Number(r[4]) || 0,
    })
  }
  return regions
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getBcis(postcode, regions) {
  const prefix = (postcode || '').trim().toUpperCase().replace(/\d.*$/, '').trim()
  for (const region of regions) {
    if (region.postcodes.some(p => prefix === p)) {
      return { factor: region.mid, region: region.region, matched: true }
    }
  }
  // Default: West Midlands. `matched: false` is surfaced as a sense-check
  // warning — a typo'd postcode silently priced at 0.94 would understate
  // a London project by ~30%.
  const wm = regions.find(r => r.region.includes('West Midlands'))
  return wm
    ? { factor: wm.mid, region: wm.region, matched: false }
    : { factor: 0.94, region: 'West Midlands (default)', matched: false }
}

// Workbook self-identification, read from "1. Instructions" (e.g. "NRM1 COST
// ESTIMATE TOOL - v4.5" / "... May 2026 ..."). Printed in the report's
// Estimate Basis so every figure is traceable to a rates issue.
function parseWorkbookVersion(wb) {
  try {
    const ws = wb.Sheets['1. Instructions']
    if (!ws) return null
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    const title = String(rows[0]?.[0] || '')
    const version = title.match(/v[\d][\d.]*/i)?.[0]
    const date = String(rows[1]?.[0] || '').match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/)?.[0]
    if (!version) return null
    return `NRM1 ${version}${date ? ` (${date})` : ''}`
  } catch {
    return null
  }
}

function getRateForElement(el, projectType, specLevel) {
  const pt = projectType.toLowerCase()
  if (pt.includes('new build')) {
    return specLevel === 'High' ? el.nbHigh : el.nbStd
  }
  if (pt.includes('extension')) {
    return specLevel === 'High' ? el.extHigh : el.extStd
  }
  if (pt.includes('external works')) {
    return el.extWorks
  }
  if (pt.includes('demolition') || pt.includes('renewable')) {
    if (specLevel === 'High') return el.rfbHigh
    if (specLevel === 'Basic') return el.rfbBasic
    return el.rfbStd
  }
  // Refurbishment, Fit-out, Mixed
  if (specLevel === 'High') return el.rfbHigh
  if (specLevel === 'Basic') return el.rfbBasic
  return el.rfbStd
}

// Legacy quantity fields — so drafts saved before the generic q2_2_quantities
// map still price. New items read q2_2_quantities[code] directly.
const QTY_ALIASES = {
  '4.2': 'q2_2_bathrooms', '4.2-RES': 'q2_2_bathrooms', '4.2-COM': 'q2_2_bathrooms',
  '4.2-HG': 'q2_2_bathrooms', '4.2-HP': 'q2_2_bathrooms', '4.2-HC': 'q2_2_bathrooms',
  '4.3': 'q2_2_kitchens',
  '5.11': 'q1_5_pvKwp', '5.12': 'q1_5_battKwh', '5.15': 'q1_5_evNr',
  '5.19': 'q1_5_liftNr', '8.3': 'q1_5_carParksNr', '8.9': 'q1_5_extLightNr',
}

// A per_item row needs a captured count (rather than a lump sum of 1) only when
// its "Quantity to capture" text is a count, e.g. "Number of kitchens" (4.10).
function perItemNeedsCount(qtyCapture) {
  return /^(number of|per )/i.test(qtyCapture || '')
}

// Quantity is driven by Pricing Type (v4.5), not the unit string.
function getQuantity(el, gifa, answers) {
  const quantities = answers.q2_2_quantities || {}
  const captured = () => {
    const generic = Number(quantities[el.code])
    if (generic > 0) return generic
    const alias = QTY_ALIASES[el.code]
    return alias ? (Number(answers[alias]) || 0) : 0
  }
  // Storeys drive footprint-based elements. Defaults to 1 (single storey →
  // footprint = GIFA, upper floors = 0). Q1.2a value "6+" arrives as "6".
  const storeys = Math.max(1, Math.floor(Number(answers.q1_2_storeys) || 1))
  switch (el.pricingType) {
    case 'gifa_rate': return gifa
    // Substructure (Group 1) and roof (2.3) relate to the building footprint,
    // not the whole GIFA — so a multi-storey building does not multiply them up.
    case 'footprint_rate':   return gifa / storeys
    // Upper floors (2.2) are everything above the ground floor: GIFA − footprint.
    case 'upperfloors_rate': return gifa * (storeys - 1) / storeys
    case 'per_kwp':   return Number(answers.q1_5_pvKwp)   || captured()
    case 'per_kwh':   return Number(answers.q1_5_battKwh) || captured()
    case 'per_nr':    return captured()
    case 'per_item':  return perItemNeedsCount(el.qtyCapture) ? captured() : 1
    default:
      // An unrecognised (or blank) Pricing Type means a workbook data error.
      // Skip the element (qty 0) and surface it, rather than silently pricing
      // it at full GIFA — which would massively overstate the estimate.
      console.warn(`[costCalculator] Unknown pricingType "${el.pricingType}" for element ${el.code} — element skipped`)
      return 0
  }
}

// Pricing types whose quantity is an area (m²) and therefore carry the Q2.3
// band multiplier and (where flagged) BCIS. Footprint/upper-floor rates behave
// exactly like GIFA rates for those purposes — only the quantity differs.
const AREA_PRICING_TYPES = new Set(['gifa_rate', 'footprint_rate', 'upperfloors_rate'])

function isGroup0Triggered(scopeItems, knownIssues, interventionLevel) {
  // Handle both legacy text labels and new NRM1 codes (0.x)
  const hasGroup0Code = (scopeItems || []).some(s => /^0\./.test(s))
  const hasDemo = (scopeItems || []).some(s =>
    s === 'Demolition and strip-out' ||
    s === 'Ground remediation or enabling works' ||
    s === 'Structural alterations or new openings'
  )
  const hasAsbestos = (knownIssues || []).some(i =>
    i.toLowerCase().includes('asbestos') || i.toLowerCase().includes('contaminated')
  )
  return (
    interventionLevel === 'Reconfiguration or full redesign' ||
    hasGroup0Code ||
    hasDemo ||
    hasAsbestos
  )
}


// ─── Percentage rules evaluation ─────────────────────────────────────────────

function evaluatePercentageRules(rules, answers, worksTotal, programmeWeeks, constructionWeeks = 0) {
  const scopeItems = answers.q2_2_scopeItems || []
  const knownIssues = answers.q3_1_knownIssues || []
  const accessConstraints = answers.q3_5_accessConstraints || []

  // Trading premises are inherently time-restricted: works in a live shop, café or
  // hotel must fit around opening hours, so restricted working hours apply even if
  // the user did not tick Q3.5. Drives the Code-A prelims uplift below.
  const RESTRICTED_USES = new Set(['Retail', 'Hospitality / leisure'])
  const inferredRestricted = RESTRICTED_USES.has(answers.q1_3_buildingUse || '')

  // Handle both legacy string and new array for planning consents
  const _planning = answers.q3_4_planningConsents
  const planningStr = Array.isArray(_planning) ? _planning.join(' | ') : (_planning || '')

  // Handle both legacy string and new array for surveys
  const _surveys = answers.q3_3_surveys
  const surveysArr = Array.isArray(_surveys) ? _surveys : (_surveys ? [_surveys] : [])
  const noSurveys = surveysArr.includes('None') || surveysArr.includes('None yet') || _surveys === 'None yet'

  // Workbook rule conditions whose text matched none of the evaluator branches
  // below. A reworded Tab 3 condition would otherwise silently evaluate false
  // (and the percentage silently change), breaking the "edit the workbook, not
  // the code" guarantee — so unmatched conditions are surfaced via senseCheck.
  const unmatchedConditions = new Set()

  // `weeksOverride` lets a caller evaluate the duration-band conditions against a
  // component-specific span (e.g. weeks-to-tender or construction-only weeks)
  // instead of the full programme. Defaults to the full programme length.
  function checkCondition(condition, weeksOverride) {
    const c = condition.toLowerCase()
    const pw = weeksOverride != null ? weeksOverride : (programmeWeeks || 0)
    if (c.includes('fully occupied throughout') || c.includes('q3.6 = fully occupied'))
      return (answers.q3_6_occupation || '').toLowerCase().includes('fully occupied') ||
             (answers.q3_6_occupation || '').toLowerCase().includes('fully occupied')
    if (c.includes('partially occupied') || c.includes('q3.6 = partially'))
      return (answers.q3_6_occupation || '').toLowerCase().includes('partially')
    if (c.includes('restricted working hours'))
      return inferredRestricted ||
             accessConstraints.some(a => a.toLowerCase().includes('restricted working'))
    if (c.includes('shared access'))
      return accessConstraints.some(a => a.toLowerCase().includes('shared access'))
    if (c.includes('programme duration > 18'))
      return (programmeWeeks || 0) > 78 // 18 months ≈ 78 weeks
    if (c.includes('≥4 m&e') || c.includes('4 m&e') || c.includes('m&e-heavy'))
      return countMeItems(scopeItems) >= 4
    if (c.includes('breeam'))
      return String(answers.q2_5_standards || '').toLowerCase().includes('breeam')
    if (c.includes('pre-1900'))
      return (answers.q1_4_buildingAge || '').includes('Pre-1900')
    if (c.includes('full planning + listed') || c.includes('listed building consent'))
      return planningStr.toLowerCase().includes('listed')
    if (c.includes('full planning') && !c.includes('listed'))
      return planningStr.toLowerCase().includes('full planning')
    if (c.includes('change of use'))
      return planningStr.toLowerCase().includes('change of use')
    if (c.includes('prior approval'))
      return planningStr.toLowerCase().includes('prior approval')
    if (c.includes('permitted development') && !c.includes('no consent'))
      return planningStr.toLowerCase().includes('permitted development')
    if (c.includes('unsure') && c.includes('pre-application'))
      return planningStr.toLowerCase().includes('unsure')
    if (c.includes('q3.3 = no surveys') || c.includes('no surveys yet'))
      return noSurveys
    if (c.includes('q3.1 = unsure') || c.includes('surveys needed'))
      return knownIssues.some(i => i.toLowerCase().includes('unsure'))
    if (c.includes('asbestos known'))
      return knownIssues.some(i => i.toLowerCase().includes('asbestos'))
    if (c.includes('contaminated land'))
      return knownIssues.some(i => i.toLowerCase().includes('contaminated'))
    if (c.includes('structural concerns'))
      return knownIssues.some(i => i.toLowerCase().includes('structural'))
    if (c.includes('ageing') && c.includes('m&e'))
      return knownIssues.some(i => i.toLowerCase().includes('ageing') || i.toLowerCase().includes('aging'))
    if (c.includes('drainage issues'))
      return knownIssues.some(i => i.toLowerCase().includes('drainage'))
    if (c.includes('damp') || c.includes('water ingress'))
      return knownIssues.some(i => i.toLowerCase().includes('damp') || i.toLowerCase().includes('water ingress'))
    if (c.includes('fire safety'))
      return knownIssues.some(i => i.toLowerCase().includes('fire safety'))
    if (c.includes('hard deadline') || c.includes('specific date'))
      return !!(answers.q4_1_targetDate) && answers.q4_1_targetDate !== 'No specific deadline'
    if (c.includes('works cost < £1m') || c.includes('< £1m'))
      return worksTotal < 1_000_000
    if (c.includes('£1m–£5m') || c.includes('£1m-£5m'))
      return worksTotal >= 1_000_000 && worksTotal <= 5_000_000
    if (c.includes('> £5m'))
      return worksTotal > 5_000_000
    if (c.includes('stage 0') || c.includes('stage 0–1'))
      return (answers.q4_5_designStage || '').toLowerCase().includes('stage 0')
    if (c.includes('stage 2') && !c.includes('stage 2–4') && !c.includes('0'))
      return (answers.q4_5_designStage || '').toLowerCase().includes('stage 2')
    if (c.includes('stage 3'))
      return (answers.q4_5_designStage || '').toLowerCase().includes('stage 3')
    if (c.includes('stage 4'))
      return (answers.q4_5_designStage || '').toLowerCase().includes('stage 4')
    if (c.includes('0–6 months') || c.includes('0 – 6'))
      return pw <= 26
    if (c.includes('6–12 months') || c.includes('6 – 12'))
      return pw > 26 && pw <= 52
    if (c.includes('12–18') || c.includes('12 – 18'))
      return pw > 52 && pw <= 78
    if (c.includes('18+') || c.includes('18 months →'))
      return pw > 78
    if (c.includes('≤ 6 months') || c.includes('<= 6'))
      return pw <= 26
    if (c.includes('6–12') && c.includes('construction'))
      return pw > 26 && pw <= 52
    if (c.includes('12–18') && c.includes('construction'))
      return pw > 52 && pw <= 78
    if (c.includes('18–24') || c.includes('18 – 24'))
      return pw > 78 && pw <= 104
    if (c.includes('24+') && c.includes('construction'))
      return pw > 104
    if (c.includes('always 5%') || c.includes('fixed'))
      return true
    if (c.includes('base'))
      return true // BASE rows are always active
    if (condition.trim()) {
      unmatchedConditions.add(condition.trim())
      console.warn(`[costCalculator] Percentage rule condition matched no evaluator branch: "${condition.trim()}" — rule treated as not applicable`)
    }
    return false
  }

  // ── Code A: Prelims ──────────────────────────────────────────────────────
  const aRules = rules.filter(r => r.code === 'A')
  const aBase = aRules.find(r => r.type === 'BASE')
  let aTotal = aBase ? aBase.adjustPct : 8
  const aCap = aBase ? aBase.capPct : 10
  for (const r of aRules.filter(r => r.type === 'ADD')) {
    if (checkCondition(r.condition)) aTotal += r.adjustPct
  }
  const prelims = Math.min(aTotal, aCap)

  // ── Code B: OH&P ─────────────────────────────────────────────────────────
  const bRules = rules.filter(r => r.code === 'B' && r.type === 'RANGE')
  let ohp = 11 // default < £1M
  for (const r of bRules) {
    if (checkCondition(r.condition)) { ohp = r.adjustPct; break }
  }

  // ── Code C: Professional Fees ────────────────────────────────────────────
  const cRules = rules.filter(r => r.code === 'C')
  const cBase = cRules.find(r => r.type === 'BASE' && checkCondition(r.condition))
  // Explicit design-stage fallback — workbook BASE row is authoritative when matched.
  // The hard-coded ladder below (6 / 8.5 / 11.5 / 13.5%) fires ONLY when no Tab 3
  // BASE row matches the design stage; it is a safety net, not the primary source.
  let cTotal
  if (cBase) {
    cTotal = cBase.adjustPct
  } else {
    const ds = (answers.q4_5_designStage || '').toLowerCase()
    if (ds.includes('stage 4') || ds.includes('technical')) cTotal = 6
    else if (ds.includes('stage 3') || ds.includes('developed')) cTotal = 8.5
    else if (ds.includes('stage 2') || ds.includes('concept complete')) cTotal = 11.5
    else cTotal = 13.5
  }
  for (const r of cRules.filter(r => r.type === 'ADD')) {
    if (checkCondition(r.condition)) cTotal += r.adjustPct
  }

  // ── Code D: Developer & Project Costs ────────────────────────────────────
  const dRules = rules.filter(r => r.code === 'D')
  // NRM1 Tab 3 has no D row for "no consent" — default must be 0, not 3.
  let dTotal = 0
  const planningAnswer = String(answers.q3_4_planningConsents || '').toLowerCase()
  const hasPlanning = planningAnswer !== '' && planningAnswer !== 'none' && !planningAnswer.includes('no consent')
  if (hasPlanning) {
    const dBase = dRules.find(r => r.type === 'BASE' && checkCondition(r.condition))
    if (dBase) dTotal = dBase.adjustPct
    for (const r of dRules.filter(r => r.type === 'ADD')) {
      if (checkCondition(r.condition)) dTotal += r.adjustPct
    }
  }

  // ── Code E: Risk Allowance ────────────────────────────────────────────────
  const eRules = rules.filter(r => r.code === 'E')
  const eBase = eRules.find(r => r.type === 'BASE')
  let eTotal = eBase ? eBase.adjustPct : 5
  const eCap = eBase ? eBase.capPct : 10
  for (const r of eRules.filter(r => r.type === 'ADD')) {
    if (checkCondition(r.condition)) eTotal += r.adjustPct
  }
  const risk = Math.min(eTotal, eCap)

  // ── Code H: Contingency ────────────────────────────────────────────────────
  const hRule = rules.find(r => r.code === 'H' && r.type === 'FIXED')
  const contingency = hRule ? hRule.adjustPct : 5

  // ── Code F: Inflation ──────────────────────────────────────────────────────
  // Inflation has two components, each keyed to its OWN span — not the full
  // programme. The tender-delay rows are evaluated against weeks-to-tender, and
  // the construction rows against construction-only weeks, via checkCondition's
  // weeksOverride. (On the first pass constructionWeeks is 0; the cost is re-run
  // after the programme is known.)
  const fRules = rules.filter(r => r.code === 'F')
  const fCap = fRules[0]?.capPct || 12
  // Time to tender ≈ everything up to construction (design + survey + procurement).
  const weeksToTender = Math.max(0, (programmeWeeks || 0) - constructionWeeks - 2)
  const tenderDelayRules = fRules.filter(r => r.condition.toLowerCase().includes('tender'))
  let tenderInflation = 0
  for (const r of tenderDelayRules) {
    if (checkCondition(r.condition, weeksToTender)) { tenderInflation = r.adjustPct; break }
  }
  // Construction mid-point component
  const constructionRules = fRules.filter(r => r.condition.toLowerCase().includes('construction'))
  let constructionInflation = 0
  for (const r of constructionRules) {
    if (checkCondition(r.condition, constructionWeeks)) { constructionInflation = r.adjustPct; break }
  }
  const inflation = Math.min(tenderInflation + constructionInflation, fCap)

  // ── Risk level badge ──────────────────────────────────────────────────────
  // Presentation-only RAG banding of the (workbook-derived) risk %. These
  // thresholds are a display convenience, not a priced figure.
  const riskLevel = risk <= 6 ? 'Low' : risk <= 8 ? 'Medium' : 'High'

  return {
    percentages: { prelims, ohp, fees: cTotal, devCosts: dTotal, risk, contingency, inflation, riskLevel },
    unmatchedConditions: [...unmatchedConditions],
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function calculateCost(answers, programmeWeeks, constructionWeeks = 0) {
  const wb = await fetchRatesWorkbook()
  const { elements } = parseMasterCostTable(wb)
  const rules = parsePercentageRules(wb)
  const bcisRegions = parseBcisFactors(wb)
  const specData = parseSpecLevelMap(wb)

  const gifa = Number(answers.q1_5_size) || 100
  const projectType = answers.q1_2_projectType || 'Refurbishment'
  const specLevel = answers.q2_4_specLevel || 'Standard'
  const interventionLevel = answers.q2_3_interventionLevel || 'Full systems replacement'
  const scopeItems = answers.q2_2_scopeItems || []
  const knownIssues = answers.q3_1_knownIssues || []

  const { factor: bcisFactor, region: bcisRegion, matched: bcisMatched } = getBcis(answers.q1_1_postcode, bcisRegions)
  const bandFactor = specData.bandFactors[interventionLevel] ?? 1.0
  const designMultiplier = specData.designMultipliers[interventionLevel] ?? 1.0

  // ── Collect element codes from ticked scope items ─────────────────────────
  // In v4.5 each Master Cost Table row IS its own selectable code, so the ticked
  // scope items are the codes directly (no label→code map, no combined ranges).
  const elementCodes = new Set(scopeItems)

  // Add wiring scope — only if within the current intervention tier
  const WIRING_MIN_TIER = { '5.8': 3, '5.8a': 3, '5.8b': 2, '5.8c': 2 }
  const INTERVENTION_TIER_MAP = {
    'fabric and finishes only': 1,
    'finishes with minor services': 2,
    'full systems replacement': 3,
    'reconfiguration or full redesign': 4,
  }
  const currentTier = INTERVENTION_TIER_MAP[(interventionLevel || '').toLowerCase()] || 3
  const wiringChoice = answers.q2_2_wiring
  if (wiringChoice && wiringChoice !== 'none' && (WIRING_MIN_TIER[wiringChoice] || 1) <= currentTier) {
    // Mutex guard: ensure only one of 5.8/5.8a/5.8b ends up in the set
    ;['5.8', '5.8a', '5.8b'].forEach(c => elementCodes.delete(c))
    elementCodes.add(wiringChoice)
  }
  // Mutex validation: if somehow scope already has >1 wiring code, throw
  const wiringCodesPresent = ['5.8', '5.8a', '5.8b'].filter(c => elementCodes.has(c))
  if (wiringCodesPresent.length > 1) {
    throw new Error(`Select only one electrical wiring option (Full rewire / 1st fix / 2nd fix). Found: ${wiringCodesPresent.join(', ')}`)
  }

  // Mutex guard: 5.1 (full plumbing, includes 2nd fix) supersedes 5.1b (2nd fix only)
  if (elementCodes.has('5.1') && elementCodes.has('5.1b')) {
    elementCodes.delete('5.1b')
  }

  // ── Building-use guard ────────────────────────────────────────────────────
  // Defensive: the picker already filters items by Q1.3 building use, but a
  // stale/forged code must never be priced. Applied BEFORE the BWIC step so a
  // hidden M&E item cannot trigger a phantom Builder's Work (5.20) line.
  const buildingUse = answers.q1_3_buildingUse || ''
  const buildingUseHidden = []
  for (const c of [...elementCodes]) {
    const el = elements[c]
    if (el && !matchesBuildingUse(el.buildingUse, buildingUse)) {
      elementCodes.delete(c)
      buildingUseHidden.push(c)
    }
  }

  // Always include Group 3 (internal finishes)
  ;['3.1', '3.2', '3.3'].forEach(c => elementCodes.add(c))

  // Soft strip-out is unavoidable on any refurb/fit-out — finishes and fittings
  // must come out before new ones go in. Auto-include it (the workbook scales the
  // rate by the Q2.3 band factor, so a fabric-only strip costs less than a full
  // systems strip). It is exempt from the Group 0 trigger gate below.
  const SOFT_STRIP_CODE = '0.5'
  const STRIP_PROJECT_TYPES = new Set(['Refurbishment', 'Fit-out'])
  if (STRIP_PROJECT_TYPES.has(projectType) && elements[SOFT_STRIP_CODE]) {
    elementCodes.add(SOFT_STRIP_CODE)
  }

  // Include Group 5 BWIC only if a real Group 5 element survives filtering
  const hasGroup5 = [...elementCodes].some(c => c.startsWith('5.'))
  if (hasGroup5) elementCodes.add('5.20')

  // Filter out Group 0 unless triggered
  const group0Triggered = isGroup0Triggered(scopeItems, knownIssues, interventionLevel)
  const pricedCodes = [...elementCodes].filter(c => {
    const el = elements[c]
    if (!el) return false
    // Soft strip is always priced for refurb/fit-out; the rest of Group 0
    // (demolition, asbestos, contamination) still depends on its trigger.
    if (el.group === 0) return group0Triggered || c === SOFT_STRIP_CODE
    return true
  })

  // Count-driven pricing types need a quantity from the user; if none is given
  // the element prices at zero and is dropped. Track those so the report can say
  // the item was selected but excluded for want of a quantity (rather than
  // silently vanishing from the estimate).
  const COUNT_DRIVEN = new Set(['per_nr', 'per_kwp', 'per_kwh'])
  const isCountDriven = el =>
    COUNT_DRIVEN.has(el.pricingType) ||
    (el.pricingType === 'per_item' && perItemNeedsCount(el.qtyCapture))
  const excludedNoQuantity = []

  // ── Price each element ────────────────────────────────────────────────────
  const lineItems = []
  let worksTotal = 0

  for (const code of pricedCodes) {
    const el = elements[code]
    if (!el) continue
    const baseRate = getRateForElement(el, projectType, specLevel)
    if (baseRate === 0) continue // rate is 0 for this project type/spec
    // Band (Q2.3 intervention) applies only to GIFA-rated items; BCIS applies
    // where the workbook says so (col 17). Nr/Item/kWp/kWh follow those flags.
    const effectiveBandFactor = AREA_PRICING_TYPES.has(el.pricingType) ? bandFactor : 1.0
    const effectiveBcisFactor = el.bcis ? bcisFactor : 1.0
    const midRate = baseRate * effectiveBcisFactor * effectiveBandFactor
    const qty = getQuantity(el, gifa, answers)
    if (qty === 0) {
      if (isCountDriven(el)) {
        excludedNoQuantity.push({ code, description: el.description })
        console.warn(`[costCalculator] Element ${code} (${el.description}) selected but no quantity provided — excluded from estimate`)
      }
      continue
    }
    const lineMid = midRate * qty
    const lineLow = lineMid * 0.89
    const lineHigh = lineMid * 1.11
    lineItems.push({
      code,
      group: el.group,
      description: el.description,
      unit: el.unit,
      rate: Math.round(midRate * 100) / 100,
      rateLow: Math.round(midRate * 0.89 * 100) / 100,
      rateHigh: Math.round(midRate * 1.11 * 100) / 100,
      qty: Math.round(qty * 10) / 10,
      lineMid: Math.round(lineMid),
      lineLow: Math.round(lineLow),
      lineHigh: Math.round(lineHigh),
    })
    worksTotal += lineMid
  }

  // Sort by group then code
  lineItems.sort((a, b) => a.group - b.group || a.code.localeCompare(b.code))

  // q2_2_additionalScope: optional provisional sum for specialist/other scope
  const additionalScope = answers.q2_2_additionalScope
  let additionalScopeNote = null
  if (additionalScope?.text) {
    const approxVal = Number(additionalScope.approxValue) || 0
    if (approxVal > 0) {
      lineItems.push({
        code: 'PS',
        group: 99,
        description: `Provisional sum — Specialist/Other scope: ${additionalScope.text}`,
        unit: 'Item',
        rate: approxVal,
        rateLow: approxVal,
        rateHigh: approxVal,
        qty: 1,
        lineMid: approxVal,
        lineLow: approxVal,
        lineHigh: approxVal,
      })
      worksTotal += approxVal
    } else {
      additionalScopeNote = `Specialist/Other scope noted (no budget provided — excluded from this estimate pending further information): ${additionalScope.text}`
    }
  }

  const r1k = n => Math.round(n / 1000) * 1000
  const worksMid  = r1k(worksTotal)
  // Derive low/high from the line-item sums so WorksTable total always matches
  // the ConstructionTable "Works Cost" row (both round the same base values).
  const worksLow  = r1k(lineItems.reduce((s, i) => s + i.lineLow,  0))
  const worksHigh = r1k(lineItems.reduce((s, i) => s + i.lineHigh, 0))

  // ── Percentage additions ──────────────────────────────────────────────────
  const { percentages: pct, unmatchedConditions } = evaluatePercentageRules(rules, answers, worksMid, programmeWeeks, constructionWeeks)

  // Each displayed component is rounded to the nearest £1,000, and every subtotal
  // / total is the SUM of its already-rounded components. This guarantees the
  // report tables foot exactly (Works + Prelims + O&P = Construction Cost, etc.)
  // in every column, since the renderers round each cell the same way (f1k).
  const prelimsMid = r1k(worksMid  * pct.prelims / 100)
  const prelimsLow = r1k(worksLow  * pct.prelims / 100)
  const prelimsHigh= r1k(worksHigh * pct.prelims / 100)
  const ohpMid     = r1k(worksMid  * pct.ohp / 100)
  const ohpLow     = r1k(worksLow  * pct.ohp / 100)
  const ohpHigh    = r1k(worksHigh * pct.ohp / 100)

  const conMid     = worksMid  + prelimsMid  + ohpMid
  const conLow     = worksLow  + prelimsLow  + ohpLow
  const conHigh    = worksHigh + prelimsHigh + ohpHigh

  const feesMid    = r1k(conMid  * pct.fees / 100)
  const feesLow    = r1k(conLow  * pct.fees / 100)
  const feesHigh   = r1k(conHigh * pct.fees / 100)
  const devMid     = r1k(conMid  * pct.devCosts / 100)
  const devLow     = r1k(conLow  * pct.devCosts / 100)
  const devHigh    = r1k(conHigh * pct.devCosts / 100)
  const riskMid    = r1k(worksMid  * pct.risk / 100)
  const riskLow    = r1k(worksLow  * pct.risk / 100)
  const riskHigh   = r1k(worksHigh * pct.risk / 100)
  const contMid    = r1k(worksMid  * pct.contingency / 100)
  const contLow    = r1k(worksLow  * pct.contingency / 100)
  const contHigh   = r1k(worksHigh * pct.contingency / 100)
  const inflMid    = r1k(worksMid  * pct.inflation / 100)
  const inflLow    = r1k(worksLow  * pct.inflation / 100)
  const inflHigh   = r1k(worksHigh * pct.inflation / 100)

  const totalMid   = conMid  + feesMid  + devMid  + riskMid  + contMid  + inflMid
  const totalLow   = conLow  + feesLow  + devLow  + riskLow  + contLow  + inflLow
  const totalHigh  = conHigh + feesHigh + devHigh + riskHigh + contHigh + inflHigh
  const vatMid     = r1k(totalMid * 0.20)

  return {
    lineItems,
    bcisFactor,
    bcisRegion,
    gifa,
    specLevel,
    interventionLevel,
    bandFactor,
    designMultiplier,
    projectType,
    additionalScopeNote,
    excludedNoQuantity,
    buildingUseHidden,
    bcisDefaulted: !bcisMatched,
    unmatchedConditions,
    workbookVersion: parseWorkbookVersion(wb),
    percentages: pct,
    works:        { mid: worksMid, low: worksLow, high: worksHigh },
    construction: { mid: conMid,   low: conLow,   high: conHigh },
    total:        { mid: totalMid, low: totalLow, high: totalHigh },
    vat:          vatMid,
    breakdown: {
      prelims: prelimsMid,
      ohp:     ohpMid,
      fees:    feesMid,
      devCosts: devMid,
      risk:    riskMid,
      contingency: contMid,
      inflation:   inflMid,
    },
  }
}

// ─── Scope-item catalogue (drives the questionnaire picker) ──────────────────
// Returns the Master Cost Table grouped by NRM1 group, with the metadata the
// client needs to filter by building use + project type + intervention level.
export async function getScopeItems() {
  const wb = await fetchRatesWorkbook()
  const { elements, groupLabels } = parseMasterCostTable(wb)
  const byGroup = {}
  for (const el of Object.values(elements)) {
    ;(byGroup[el.group] ||= []).push({
      code: el.code,
      group: el.group,
      description: el.description,
      unit: el.unit,
      pricingType: el.pricingType,
      minLvl: el.minLvl,
      qtyCapture: el.qtyCapture,
      buildingUse: el.buildingUse,
    })
  }
  const groups = Object.keys(byGroup)
    .map(Number)
    .sort((a, b) => a - b)
    .map(g => ({
      group: g,
      label: groupLabels[g] || `GROUP ${g}`,
      items: byGroup[g].sort((a, b) =>
        a.code.localeCompare(b.code, undefined, { numeric: true })),
    }))
  return { groups }
}

