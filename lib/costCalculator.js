/**
 * costCalculator.js — Deterministic NRM1 cost engine.
 * All numbers come from the NRM1 Excel workbook fetched from GitHub.
 * The AI never sees this code and never touches these numbers.
 */
import * as XLSX from 'xlsx'
import { matchesBuildingUse, countMeItems } from './buildingUse.js'
import { isHigherRiskBuilding } from './siteContext.js'
import { usesRateFallback } from './projectTypes.js'

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
      // Col 19 (T) "Source" — where the rate came from and when (e.g. "BCIS
      // 2Q26"). Added September 2026; blank in workbooks that predate it and
      // reported as "unsourced" in the Estimate Basis rather than hidden.
      source: String(r[19] || '').trim(),
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

// Tab 1 "Base date" row (col A = "Base date", col B = e.g. "2Q 2026") — the
// quarter the rates are current at. Printed in the Estimate Basis as the
// estimate base date. A QS reads the base date as the date of the RATES, never
// the date the report happened to be generated, so it must come from the
// workbook. null when the row is absent (pre-September-2026 workbooks).
function parseBaseDate(wb) {
  try {
    const ws = wb.Sheets['1. Instructions']
    if (!ws) return null
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    const row = rows.find(r => String(r[0] || '').trim().toLowerCase() === 'base date')
    const val = row ? String(row[1] || '').trim() : ''
    return val || null
  } catch {
    return null
  }
}

// Tab "9. Range Widths" — low/high factors per deterministic confidence grade
// (A–D). Replaces the flat ±11% that used to be applied regardless of how much
// was known about the project. Returns null when the sheet is absent so the
// caller can fall back explicitly.
function parseRangeWidths(wb) {
  const ws = wb.Sheets['9. Range Widths']
  if (!ws) return null
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const widths = {}
  for (const r of rows) {
    const grade = String(r[0] || '').trim().toUpperCase()
    const low = Number(r[1]), high = Number(r[2])
    if (!/^[A-D]$/.test(grade)) continue
    if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high <= 0) continue
    widths[grade] = { low, high }
  }
  return Object.keys(widths).length > 0 ? widths : null
}

// Explicit fallback — the range every report carried before the Range Widths
// sheet existed. Used only when the sheet is absent or has no row for the
// grade; never edited here to "tune" the range (edit the workbook).
const LEGACY_RANGE = { low: 0.89, high: 1.11 }

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

function getBcis(postcode, regions, explicitRegion) {
  // An explicit Q1.1 region wins. The questionnaire only asks for one when the
  // postcode prefix matched nothing, so this is the user confirming the location
  // rather than the silent default below deciding for them.
  if (explicitRegion) {
    // `mid > 0` guards against a footnote row in Tab 6 being sent back as a
    // region: a zero factor would silently wipe the location adjustment off
    // every BCIS-flagged line rather than adjusting it.
    const chosen = regions.find(r => r.region === explicitRegion && r.mid > 0)
    if (chosen) return { factor: chosen.mid, region: chosen.region, matched: true }
  }
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

function getRateForElement(el, projectType, specLevel, onFallback) {
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
  // Refurbishment, Fit-out, Demolition only, Other or mixed
  const refurbRate = specLevel === 'High' ? el.rfbHigh
    : specLevel === 'Basic' ? el.rfbBasic
    : el.rfbStd
  if (refurbRate > 0) return refurbRate

  // "Other or mixed" spans new and existing work but can only pick one family.
  // Four substructure elements, ground stabilisation and HGV hardstanding have
  // no refurbishment rate, so without this a mixed project carries no
  // foundations at all and says nothing about it. 92 elements carry a rate in
  // both families, so this branch cannot change a figure that already priced.
  if (usesRateFallback(projectType)) {
    const nb = specLevel === 'High' ? el.nbHigh : el.nbStd
    if (nb > 0) {
      if (onFallback) onFallback(el.code)
      return nb
    }
  }
  return refurbRate
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
    // Heat-pump plant (5.2H) — capacity in kW, no BCIS, no band, like per_kwp.
    case 'per_kw':    return captured()
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

  // Handle both legacy string and new array for surveys.
  //
  // An EMPTY answer counts as "none". Q3.3 is optional, and blank used to mean
  // two different things at once: computeConfidence() downgraded the grade for
  // having no surveys, while this matcher required the literal "None" and so
  // skipped the workbook's +2pp risk and +0.5pp developer-cost rows. A report
  // could therefore say "Grade C — no surveys commissioned" while pricing the
  // project as though surveys were in hand. The two now agree, without forcing
  // the user to answer.
  const _surveys = answers.q3_3_surveys
  const surveysArr = Array.isArray(_surveys) ? _surveys : (_surveys ? [_surveys] : [])
  const noSurveys = surveysArr.length === 0 ||
    surveysArr.includes('None') || surveysArr.includes('None yet') || _surveys === 'None yet'

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
    // ── Heritage / planning ───────────────────────────────────────────────────
    // These branches test substrings of the CONDITION text to work out which rule
    // they are looking at, then test the ANSWER. Three bugs lived here, all the
    // same shape: a general pattern was reached before a specific one and answered
    // for it. Order below is deliberate — most specific first.
    const isPre1900      = (answers.q1_4_buildingAge || '').includes('Pre-1900')
    const planningLower  = planningStr.toLowerCase()
    const hasListed      = planningLower.includes('listed')
    const hasFullPlanning = planningLower.includes('full planning')

    // Q3.8 site/building context (September 2026). A higher-risk building
    // under the Building Safety Act 2022 (7+ storeys / 18 m+ with residential,
    // care or hospital use) carries Gateway 2 duties and fees; the workbook's
    // C/D/E rows for it key on the token "higher-risk". Tested before the
    // planning branches so a condition that also mentions planning wording
    // can't be claimed by them first.
    if (c.includes('higher-risk') || c.includes('higher risk building'))
      return isHigherRiskBuilding(answers)

    // "Q1.4 = Pre-1900 OR Q3.4 includes Listed Building Consent" is a single rule
    // spanning two questions. It must be matched before the bare pre-1900 branch,
    // which used to swallow it and answer on age alone — so a listed 1960s
    // building got no heritage uplift at all.
    if (c.includes('pre-1900') && c.includes('listed'))
      return isPre1900 || hasListed
    if (c.includes('pre-1900'))
      return isPre1900
    if (c.includes('full planning + listed') || c.includes('listed building consent'))
      return hasListed
    // The plain "Full planning" row must not claim a listed answer: the listed
    // answer string contains "full planning", so this row (3.5%) was matching
    // first and shadowing the dedicated listed rows (4%).
    if (c.includes('full planning'))
      return hasFullPlanning && !hasListed
    if (c.includes('change of use'))
      return planningStr.toLowerCase().includes('change of use')
    if (c.includes('prior approval'))
      return planningStr.toLowerCase().includes('prior approval')
    if (c.includes('permitted development') && !c.includes('no consent'))
      return planningStr.toLowerCase().includes('permitted development')
    if (c.includes('unsure') && c.includes('pre-application'))
      return planningStr.toLowerCase().includes('unsure')
    // Every Q3.3 rule in Tab 3 is about whether any survey exists, so key on the
    // question number. This has to come before the Q3.1 branch below: the E rule
    // is worded "Q3.3 = None — surveys needed", and the generic 'surveys needed'
    // test used to catch it and answer from q3_1_knownIssues instead. That was
    // wrong in both directions — a project with no surveys missed its +2pp, and a
    // project with "Unsure" counted the same +2pp twice.
    if (c.includes('q3.3'))
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
    // Design-stage fee rows (Tab 3, code C BASE) name a RIBA stage in their
    // condition text — "Q4.5 = Stage 0–1 → 12–15% (use 13.5%)", "Q4.5 = Stage 2 →
    // 10–13% (use 11.5%)", and so on — and Q4.5's answers carry the same token
    // ("Concept complete (Stage 2)"). Parse the stage out of both and compare the
    // numbers, rather than substring-matching the whole condition: the previous
    // guard rejected any condition containing a "0", which the "10–13%" in the
    // Stage 2 row tripped. That row therefore never fired and the fee silently
    // fell through to the hard-coded ladder below — the workbook value was
    // ignored, and the miss surfaced as a spurious RULE_UNMATCHED warning.
    const condStage = c.match(/stage\s*(\d)\s*(?:[–—-]\s*(\d))?/)
    if (condStage) {
      const answerStage = (answers.q4_5_designStage || '')
        .toLowerCase().match(/stage\s*(\d)\s*(?:[–—-]\s*(\d))?/)
      if (!answerStage) return false
      // A condition may name a range ("Stage 0–1"); the answer matches when its
      // first stage number falls inside that range.
      const lo = Number(condStage[1])
      const hi = condStage[2] !== undefined ? Number(condStage[2]) : lo
      const answered = Number(answerStage[1])
      return answered >= lo && answered <= hi
    }
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

  // ── Rule trace ────────────────────────────────────────────────────────────
  // Every rule that contributes to a percentage is recorded here, in the order
  // it was applied, with the workbook's own condition text as the label. The
  // report renders this as a build-up table ("8% base + 2% fully occupied +
  // 0.5% restricted hours = 10.5%") so a reader can audit each percentage
  // against Tab 3 instead of trusting a bare total. Caps are recorded as a
  // negative final entry so each list still sums to the applied figure.
  const trace = { prelims: [], ohp: [], fees: [], devCosts: [], risk: [], contingency: [], inflation: [] }
  const hit = (key, code, label, pct) => trace[key].push({ code, label: String(label || '').trim(), pct })
  const capped = (key, code, total, cap) => {
    if (total > cap) hit(key, code, `Capped at ${cap}%`, Math.round((cap - total) * 100) / 100)
  }

  // ── Code A: Prelims ──────────────────────────────────────────────────────
  const aRules = rules.filter(r => r.code === 'A')
  const aBase = aRules.find(r => r.type === 'BASE')
  let aTotal = aBase ? aBase.adjustPct : 8
  hit('prelims', 'A', aBase ? aBase.condition : 'Base (fallback — no BASE row in workbook)', aTotal)
  const aCap = aBase ? aBase.capPct : 10
  for (const r of aRules.filter(r => r.type === 'ADD')) {
    if (checkCondition(r.condition)) { aTotal += r.adjustPct; hit('prelims', 'A', r.condition, r.adjustPct) }
  }
  capped('prelims', 'A', aTotal, aCap)
  const prelims = Math.min(aTotal, aCap)

  // ── Code B: OH&P ─────────────────────────────────────────────────────────
  const bRules = rules.filter(r => r.code === 'B' && r.type === 'RANGE')
  let ohp = 11 // default < £1M
  let bHit = null
  for (const r of bRules) {
    if (checkCondition(r.condition)) { ohp = r.adjustPct; bHit = r; break }
  }
  hit('ohp', 'B', bHit ? bHit.condition : 'Default < £1M (fallback — no RANGE row matched)', ohp)

  // ── Code C: Professional Fees ────────────────────────────────────────────
  const cRules = rules.filter(r => r.code === 'C')
  const cBase = cRules.find(r => r.type === 'BASE' && checkCondition(r.condition))
  // Explicit design-stage fallback — workbook BASE row is authoritative when matched.
  // The hard-coded ladder below (6 / 8.5 / 11.5 / 13.5%) fires ONLY when no Tab 3
  // BASE row matches the design stage; it is a safety net, not the primary source.
  let cTotal
  if (cBase) {
    cTotal = cBase.adjustPct
    hit('fees', 'C', cBase.condition, cTotal)
  } else {
    const ds = (answers.q4_5_designStage || '').toLowerCase()
    if (ds.includes('stage 4') || ds.includes('technical')) cTotal = 6
    else if (ds.includes('stage 3') || ds.includes('developed')) cTotal = 8.5
    else if (ds.includes('stage 2') || ds.includes('concept complete')) cTotal = 11.5
    else cTotal = 13.5
    hit('fees', 'C', `Design-stage fee ladder (fallback — no BASE row matched "${answers.q4_5_designStage || 'Stage 0–1'}")`, cTotal)
  }
  for (const r of cRules.filter(r => r.type === 'ADD')) {
    if (checkCondition(r.condition)) { cTotal += r.adjustPct; hit('fees', 'C', r.condition, r.adjustPct) }
  }

  // ── Code D: Developer & Project Costs ────────────────────────────────────
  const dRules = rules.filter(r => r.code === 'D')
  // NRM1 Tab 3 has no D row for "no consent" — default must be 0, not 3.
  let dTotal = 0
  const planningAnswer = String(answers.q3_4_planningConsents || '').toLowerCase()
  const hasPlanning = planningAnswer !== '' && planningAnswer !== 'none' && !planningAnswer.includes('no consent')
  if (hasPlanning) {
    const dBase = dRules.find(r => r.type === 'BASE' && checkCondition(r.condition))
    if (dBase) { dTotal = dBase.adjustPct; hit('devCosts', 'D', dBase.condition, dBase.adjustPct) }
    for (const r of dRules.filter(r => r.type === 'ADD')) {
      if (checkCondition(r.condition)) { dTotal += r.adjustPct; hit('devCosts', 'D', r.condition, r.adjustPct) }
    }
  } else {
    hit('devCosts', 'D', 'No planning consent required (Q3.4) — no developer costs applied', 0)
  }

  // ── Code E: Risk Allowance ────────────────────────────────────────────────
  const eRules = rules.filter(r => r.code === 'E')
  const eBase = eRules.find(r => r.type === 'BASE')
  let eTotal = eBase ? eBase.adjustPct : 5
  hit('risk', 'E', eBase ? eBase.condition : 'Baseline (fallback — no BASE row in workbook)', eTotal)
  const eCap = eBase ? eBase.capPct : 10
  for (const r of eRules.filter(r => r.type === 'ADD')) {
    if (checkCondition(r.condition)) { eTotal += r.adjustPct; hit('risk', 'E', r.condition, r.adjustPct) }
  }
  capped('risk', 'E', eTotal, eCap)
  const risk = Math.min(eTotal, eCap)

  // ── Code H: Contingency ────────────────────────────────────────────────────
  const hRule = rules.find(r => r.code === 'H' && r.type === 'FIXED')
  const contingency = hRule ? hRule.adjustPct : 5
  hit('contingency', 'H', hRule ? hRule.condition : 'Fixed 5% (fallback — no FIXED row in workbook)', contingency)

  // ── Code G: VAT (reference only) ──────────────────────────────────────────
  // Read from the workbook's G row rather than a 0.20 literal so the VAT rate
  // lives in exactly one place. Never added to the total — the report shows it
  // for reference, and budgetVerdict() uses it to gross up the estimate
  // against a budget stated inclusive of VAT.
  const gRule = rules.find(r => r.code === 'G')
  const vatPct = gRule && gRule.adjustPct > 0 ? gRule.adjustPct : 20

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
    if (checkCondition(r.condition, weeksToTender)) {
      tenderInflation = r.adjustPct
      hit('inflation', 'F', `${r.condition} (${weeksToTender} wks to tender)`, r.adjustPct)
      break
    }
  }
  // Construction mid-point component
  const constructionRules = fRules.filter(r => r.condition.toLowerCase().includes('construction'))
  let constructionInflation = 0
  for (const r of constructionRules) {
    if (checkCondition(r.condition, constructionWeeks)) {
      constructionInflation = r.adjustPct
      hit('inflation', 'F', `${r.condition} (${constructionWeeks} wks construction)`, r.adjustPct)
      break
    }
  }
  capped('inflation', 'F', tenderInflation + constructionInflation, fCap)
  const inflation = Math.min(tenderInflation + constructionInflation, fCap)

  // ── Risk level badge ──────────────────────────────────────────────────────
  // Presentation-only RAG banding of the (workbook-derived) risk %. These
  // thresholds are a display convenience, not a priced figure.
  const riskLevel = risk <= 6 ? 'Low' : risk <= 8 ? 'Medium' : 'High'

  return {
    percentages: { prelims, ohp, fees: cTotal, devCosts: dTotal, risk, contingency, inflation, riskLevel },
    vatPct,
    trace,
    unmatchedConditions: [...unmatchedConditions],
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * @param {object} answers            questionnaire answers
 * @param {number} programmeWeeks     total programme weeks (0 on the first pass)
 * @param {number} constructionWeeks  construction-only weeks (0 on the first pass)
 * @param {object} [opts]
 * @param {string} [opts.rangeGrade]  deterministic confidence grade (A–D). When
 *   given and Tab "9. Range Widths" has a row for it, that row's low/high
 *   factors set the estimate range; otherwise the legacy ±11% applies. The
 *   grade is only known after the sense check, so generate-report runs the
 *   cost a final time with it once confidence has been computed.
 */
export async function calculateCost(answers, programmeWeeks, constructionWeeks = 0, opts = {}) {
  const wb = await fetchRatesWorkbook()
  const { elements } = parseMasterCostTable(wb)
  const rules = parsePercentageRules(wb)
  const bcisRegions = parseBcisFactors(wb)
  const specData = parseSpecLevelMap(wb)
  const rangeWidths = parseRangeWidths(wb)
  const rangeGrade = opts.rangeGrade ? String(opts.rangeGrade).toUpperCase() : null
  const rangeFromWorkbook = !!(rangeGrade && rangeWidths?.[rangeGrade])
  const range = rangeFromWorkbook ? rangeWidths[rangeGrade] : LEGACY_RANGE

  const gifa = Number(answers.q1_5_size) || 100
  const projectType = answers.q1_2_projectType || 'Refurbishment'
  const specLevel = answers.q2_4_specLevel || 'Standard'
  const interventionLevel = answers.q2_3_interventionLevel || 'Full systems replacement'
  const scopeItems = answers.q2_2_scopeItems || []
  const knownIssues = answers.q3_1_knownIssues || []

  const { factor: bcisFactor, region: bcisRegion, matched: bcisMatched } =
    getBcis(answers.q1_1_postcode, bcisRegions, answers.q1_1_bcisRegion)
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

  // Every code deleted from `elementCodes` after this point without being
  // priced or landing in `excludedNoQuantity` must be recorded here with a
  // reason — this is what the reconciliation check at the end of the function
  // verifies against. A ticked code that silently disappears from both this
  // list and the estimate is exactly the "phantom lines" / "silently dropped
  // item" failure class this tracking exists to catch.
  const adjustments = []

  const wiringPresentBefore = ['5.8', '5.8a', '5.8b'].filter(c => elementCodes.has(c))
  if (wiringChoice && wiringChoice !== 'none' && (WIRING_MIN_TIER[wiringChoice] || 1) <= currentTier) {
    // Mutex guard: ensure only one of 5.8/5.8a/5.8b ends up in the set
    ;['5.8', '5.8a', '5.8b'].forEach(c => elementCodes.delete(c))
    elementCodes.add(wiringChoice)
    for (const c of wiringPresentBefore) {
      if (c !== wiringChoice) adjustments.push({ code: c, reason: `combined into ${wiringChoice} (single wiring selection)` })
    }
  }
  // Mutex validation: if somehow scope already has >1 wiring code, throw
  const wiringCodesPresent = ['5.8', '5.8a', '5.8b'].filter(c => elementCodes.has(c))
  if (wiringCodesPresent.length > 1) {
    throw new Error(`Select only one electrical wiring option (Full rewire / 1st fix / 2nd fix). Found: ${wiringCodesPresent.join(', ')}`)
  }

  // Mutex guard: 5.1 (full plumbing, includes 2nd fix) supersedes 5.1b (2nd fix only)
  if (elementCodes.has('5.1') && elementCodes.has('5.1b')) {
    elementCodes.delete('5.1b')
    adjustments.push({ code: '5.1b', reason: 'superseded by 5.1 (full plumbing already includes 2nd fix)' })
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
      adjustments.push({ code: c, reason: `not applicable to building use "${buildingUse || 'unspecified'}"` })
    }
  }

  // Declared, reasoned auto-includes — anything added here beyond the ticked
  // scope MUST be listed in `autoIncludes` with a stated rule (never a silent
  // addition). Internal finishes (Group 3) used to be force-added unconditionally
  // here regardless of what was ticked, which priced wall/floor/ceiling finishes
  // into every single estimate even when the user never selected them — Group 3
  // is already a normal tickable section of the scope picker, so it is now
  // priced only when actually selected, like every other element.
  const autoIncludes = []

  // Soft strip-out is unavoidable on any refurb/fit-out — finishes and fittings
  // must come out before new ones go in. Auto-include it (the workbook scales the
  // rate by the Q2.3 band factor, so a fabric-only strip costs less than a full
  // systems strip). It is exempt from the Group 0 trigger gate below.
  const SOFT_STRIP_CODE = '0.5'
  const STRIP_PROJECT_TYPES = new Set(['Refurbishment', 'Fit-out'])
  if (STRIP_PROJECT_TYPES.has(projectType) && elements[SOFT_STRIP_CODE] && !elementCodes.has(SOFT_STRIP_CODE)) {
    elementCodes.add(SOFT_STRIP_CODE)
    autoIncludes.push({ code: SOFT_STRIP_CODE, reason: `Soft strip-out of existing finishes and fittings is required before new ${projectType.toLowerCase()} finishes are installed — auto-included, not offered as a separate tick.` })
  }

  // Include Group 5 BWIC only if a real Group 5 element survives filtering
  const hasGroup5 = [...elementCodes].some(c => c.startsWith('5.'))
  if (hasGroup5 && !elementCodes.has('5.20')) {
    elementCodes.add('5.20')
    autoIncludes.push({ code: '5.20', reason: 'Builder\'s Work In Connection is required whenever any Group 5 M&E element is priced — auto-included, not offered as a separate tick.' })
  }

  // Filter out Group 0 unless triggered
  const group0Triggered = isGroup0Triggered(scopeItems, knownIssues, interventionLevel)
  const notInMasterTable = []
  const pricedCodes = [...elementCodes].filter(c => {
    const el = elements[c]
    if (!el) {
      if (scopeItems.includes(c)) notInMasterTable.push(c)
      return false
    }
    // Soft strip is always priced for refurb/fit-out; the rest of Group 0
    // (demolition, asbestos, contamination) still depends on its trigger.
    if (el.group === 0) return group0Triggered || c === SOFT_STRIP_CODE
    return true
  })

  // Count-driven pricing types need a quantity from the user; if none is given
  // the element prices at zero and is dropped. Track those so the report can say
  // the item was selected but excluded for want of a quantity (rather than
  // silently vanishing from the estimate).
  const COUNT_DRIVEN = new Set(['per_nr', 'per_kwp', 'per_kwh', 'per_kw'])
  const isCountDriven = el =>
    COUNT_DRIVEN.has(el.pricingType) ||
    (el.pricingType === 'per_item' && perItemNeedsCount(el.qtyCapture))
  const KNOWN_PRICING_TYPES = new Set(['gifa_rate', 'footprint_rate', 'upperfloors_rate', 'per_kwp', 'per_kwh', 'per_kw', 'per_nr', 'per_item'])
  const excludedNoQuantity = notInMasterTable.map(code => ({
    code, description: code, reason: 'not present in the NRM1 Master Cost Table (renamed or removed code)',
  }))

  // ── Price each element ────────────────────────────────────────────────────
  const lineItems = []
  let worksTotal = 0
  // Codes that priced from the new-build column because their own family had
  // no rate. Internal diagnostic only — never shown to the client. See Task 6.
  const rateFallbacks = []

  for (const code of pricedCodes) {
    const el = elements[code]
    if (!el) continue
    // An unrecognised/blank Pricing Type is a workbook data error — surface it
    // rather than silently pricing at 0 (isCountDriven would never catch this,
    // since it isn't in the count-driven set, so it used to vanish untracked).
    if (!KNOWN_PRICING_TYPES.has(el.pricingType)) {
      excludedNoQuantity.push({ code, description: el.description, reason: `unrecognised Pricing Type "${el.pricingType || '(blank)'}" in the workbook` })
      console.warn(`[costCalculator] Unknown pricingType "${el.pricingType}" for element ${code} — element skipped`)
      continue
    }
    const baseRate = getRateForElement(el, projectType, specLevel, code => rateFallbacks.push(code))
    if (baseRate === 0) {
      // A ticked code with no applicable rate column for this project type/spec
      // must still be accounted for (see the reconciliation invariant below) —
      // an auto-include (0.5/5.20) hitting this is silently dropped as before,
      // since it was never ticked and has nothing to reconcile against.
      if (scopeItems.includes(code)) {
        excludedNoQuantity.push({ code, description: el.description, reason: 'no applicable rate for this project type/specification level' })
      }
      continue
    }
    // Band (Q2.3 intervention) applies only to GIFA-rated items; BCIS applies
    // where the workbook says so (col 17). Nr/Item/kWp/kWh follow those flags.
    const effectiveBandFactor = AREA_PRICING_TYPES.has(el.pricingType) ? bandFactor : 1.0
    const effectiveBcisFactor = el.bcis ? bcisFactor : 1.0
    const midRate = baseRate * effectiveBcisFactor * effectiveBandFactor
    const qty = getQuantity(el, gifa, answers)
    if (qty === 0) {
      // A ticked code must always be accounted for (see the reconciliation
      // invariant below), even when its quantity is a *derived* zero rather
      // than a missing user-provided count — e.g. "2.2 Upper floors"
      // (upperfloors_rate = GIFA×(storeys−1)/storeys) is legitimately zero on
      // a single-storey building. This used to only track count-driven items
      // (per_nr/per_kwp/per_kwh/counted per_item), so a ticked area-derived
      // item with a genuinely zero quantity vanished from the estimate with
      // no trace at all.
      if (scopeItems.includes(code)) {
        excludedNoQuantity.push({
          code, description: el.description,
          reason: isCountDriven(el) ? 'selected but no quantity provided' : 'quantity computes to zero for this building (e.g. no upper floors on a single-storey building)',
        })
        console.warn(`[costCalculator] Element ${code} (${el.description}) selected but quantity is zero — excluded from estimate`)
      }
      continue
    }
    const lineMid = midRate * qty
    const lineLow = lineMid * range.low
    const lineHigh = lineMid * range.high
    lineItems.push({
      code,
      group: el.group,
      description: el.description,
      unit: el.unit,
      source: el.source,
      rate: Math.round(midRate * 100) / 100,
      rateLow: Math.round(midRate * range.low * 100) / 100,
      rateHigh: Math.round(midRate * range.high * 100) / 100,
      qty: Math.round(qty * 10) / 10,
      lineMid: Math.round(lineMid),
      lineLow: Math.round(lineLow),
      lineHigh: Math.round(lineHigh),
    })
    worksTotal += lineMid
  }

  // ── Scope reconciliation invariant ────────────────────────────────────────
  // Priced element codes MUST equal (ticked codes) ∪ (declared auto-includes).
  // Every ticked code must end up either priced, in excludedNoQuantity with a
  // reason, or in `adjustments` with a reason (combined/superseded/hidden) —
  // there is no other way for a ticked code to leave the estimate. A code that
  // matches none of these is a costCalculator defect (a filter or guard that
  // silently drops scope without recording why), not a user input problem, so
  // this throws rather than producing a report with an unexplained gap.
  const pricedCodeSet = new Set(lineItems.map(li => li.code))
  const accountedForCodes = new Set([
    ...pricedCodeSet,
    ...excludedNoQuantity.map(e => e.code),
    ...adjustments.map(a => a.code),
  ])
  const unreconciled = scopeItems.filter(c => !accountedForCodes.has(c))
  if (unreconciled.length > 0) {
    throw new Error(
      `Scope reconciliation invariant violated: ticked code(s) ${unreconciled.join(', ')} were neither priced, ` +
      `excluded with a reason, nor adjusted with a declared reason. This is a costCalculator defect.`
    )
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
  const { percentages: pct, vatPct, trace, unmatchedConditions } = evaluatePercentageRules(rules, answers, worksMid, programmeWeeks, constructionWeeks)

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
  const vatMid     = r1k(totalMid * vatPct / 100)

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
    rateFallbacks,
    buildingUseHidden,
    autoIncludes,
    adjustments,
    bcisDefaulted: !bcisMatched,
    unmatchedConditions,
    workbookVersion: parseWorkbookVersion(wb),
    baseDate: parseBaseDate(wb),
    // Which range factors were applied and why — printed in the Estimate Basis.
    rangeApplied: { grade: rangeGrade, low: range.low, high: range.high, fromWorkbook: rangeFromWorkbook },
    vatPct,
    trace,
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
      // Which rate-column families carry a non-zero rate for this row — the
      // same columns getRateForElement() reads per project type. The picker
      // hides a tile the calculator could only ever exclude as "no applicable
      // rate" (5.1b, whose rates were blank, used to be ticked by the tier-2
      // preset and then reported as "selected but excluded"). No rates leave
      // the server; only the booleans do.
      priceable: {
        refurb:        el.rfbStd > 0 || el.rfbHigh > 0 || el.rfbBasic > 0,
        newBuild:      el.nbStd > 0 || el.nbHigh > 0,
        extension:     el.extStd > 0 || el.extHigh > 0,
        externalWorks: el.extWorks > 0,
      },
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

/**
 * BCIS regions for the questionnaire, straight from Tab 6.
 *
 * Q1.1 used to be free text resolved silently server-side: an unrecognised
 * prefix fell back to West Midlands (0.94) with only a sense-check warning, so a
 * mistyped Inner London postcode (1.25) understated the whole estimate by ~25%
 * and still produced a confident-looking report. Serving the regions lets the
 * questionnaire resolve the prefix as the user types, show which factor it
 * landed on, and ask for the region explicitly when nothing matches — the user
 * confirms the assumption instead of never seeing it.
 *
 * Postcode prefixes are returned so the match happens client-side with no
 * round-trip per keystroke; the factor is authoritative on the server either way.
 */
export async function getBcisRegions() {
  const wb = await fetchRatesWorkbook()
  return parseBcisFactors(wb)
    // Tab 6 carries footnote rows below the data ("Use the Mid factor for a
    // single-factor estimate. Source: BCIS…"), and parseBcisFactors treats any
    // row with a non-empty first cell as a region. Server-side they are inert —
    // no postcode prefix ever matches them — but offered in a picker a user
    // could select one and zero the BCIS multiplier. A real region has at least
    // one postcode prefix and a positive factor.
    .filter(r => r.mid > 0 && r.postcodes.length > 0)
    .map(r => ({ region: r.region, postcodes: r.postcodes, factor: r.mid }))
    .sort((a, b) => a.region.localeCompare(b.region))
}

