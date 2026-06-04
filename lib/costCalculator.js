/**
 * costCalculator.js — Deterministic NRM1 cost engine.
 * All numbers come from the NRM1 Excel workbook fetched from GitHub.
 * The AI never sees this code and never touches these numbers.
 */
import * as XLSX from 'xlsx'

// ─── In-memory cache (10 min) ────────────────────────────────────────────────
let _cache = { wb: null, fetchedAt: 0 }

async function fetchRatesWorkbook() {
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

function parseRatesTable(wb) {
  const ws = wb.Sheets['2. Rates Reference Table']
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  // Header at row index 3 (0-based), data from index 4 onwards
  // Cols: 0=Grp, 1=Sub, 2=Element, 3=Unit, 4=RfbBasic, 5=RfbStd, 6=RfbHigh, 7=NBStd, 8=NBHigh, 9=ExtStd, 10=ExtHigh, 11=ExtWorks
  const elements = {}
  for (let i = 4; i < rows.length; i++) {
    const r = rows[i]
    const sub = String(r[1] || '').trim()
    if (!sub || typeof r[0] !== 'number') continue // skip banner rows
    elements[sub] = {
      code: sub,
      group: r[0],
      description: String(r[2] || '').trim(),
      unit: String(r[3] || '').trim(),
      rfbBasic: Number(r[4]) || 0,
      rfbStd:   Number(r[5]) || 0,
      rfbHigh:  Number(r[6]) || 0,
      nbStd:    Number(r[7]) || 0,
      nbHigh:   Number(r[8]) || 0,
      extStd:   Number(r[9]) || 0,
      extHigh:  Number(r[10]) || 0,
      extWorks: Number(r[11]) || 0,
    }
  }
  return elements
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

function parseProjectTypeMap(wb) {
  const ws = wb.Sheets['4. Project Type Map']
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const map = {}
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i]
    const type = String(r[0] || '').trim()
    if (!type) continue
    const groupsRaw = String(r[2] || '').trim()
    const groups = groupsRaw.split(',').map(g => {
      const n = parseInt(g.trim())
      return isNaN(n) ? null : n
    }).filter(g => g !== null)
    map[type] = { rateColumn: String(r[1] || '').trim(), groups, notes: String(r[3] || '') }
  }
  return map
}

function parseScopeItemMap(wb) {
  const ws = wb.Sheets['7. Scope Item Map']
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const map = {}
  for (let i = 4; i < rows.length; i++) {
    const r = rows[i]
    const item = String(r[0] || '').trim()
    if (!item) continue
    const codes = String(r[1] || '').split(',').map(c => c.trim()).filter(Boolean)
    map[item] = codes
  }
  return map
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
    if (region.postcodes.some(p => prefix === p || prefix.startsWith(p))) {
      return { factor: region.mid, region: region.region }
    }
  }
  // Default: West Midlands
  const wm = regions.find(r => r.region.includes('West Midlands'))
  return wm ? { factor: wm.mid, region: wm.region } : { factor: 0.94, region: 'West Midlands (default)' }
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

function getQuantity(code, unit, gifa, specialQtys) {
  switch (unit) {
    case 'm²':
      return gifa
    case 'Item':
      return 1   // all Item rates are lump sums — always quantity 1
    case 'Nr':
      if (code === '4.2')  return specialQtys.bathroomNr || 0
      if (code === '4.3')  return specialQtys.kitchenNr  || 0
      if (code === '5.15') return specialQtys.evNr       || 0
      if (code === '5.19') return specialQtys.liftNr     || 0
      if (code === '8.3')  return specialQtys.carParksNr || 0
      if (code === '8.9')  return specialQtys.extLightNr || 0
      return 0   // unknown Nr code — do not price
    case 'kWp': return specialQtys.pvKwp   || 0
    case 'kWh': return specialQtys.battKwh || 0
    default: return gifa
  }
}

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

function countMeItems(scopeItems) {
  const meKeywords = [
    'heating', 'ventilation', 'air conditioning', 'air handling', 'cooling',
    'plumbing', 'sprinkler', 'fire suppression', 'gas installation',
    'electrical', 'wiring', 'lighting', 'emergency lighting', 'fire alarm',
    'external lighting', 'solar', 'pv', 'renewable', 'battery',
    'grid connection', 'dno', 'bems', 'energy management', 'ev charging',
  ]
  return (scopeItems || []).filter(item =>
    // NRM1 Group 5 codes (5.x) are all M&E — count them directly
    /^5\./.test(item) ||
    meKeywords.some(kw => item.toLowerCase().includes(kw))
  ).length
}

// Combined NRM1 code groups: one checkbox = multiple rate rows
const COMBINED_CODES = {
  '1.1-1.3': ['1.1', '1.2', '1.3'],
  '2.1-2.2': ['2.1', '2.2'],
  '8.4':     ['8.4', '8.5'],   // drainage tick covers surface water (8.4) + foul drainage (8.5)
}

// ─── Percentage rules evaluation ─────────────────────────────────────────────

function evaluatePercentageRules(rules, answers, worksTotal, programmeWeeks) {
  const scopeItems = answers.q2_2_scopeItems || []
  const knownIssues = answers.q3_1_knownIssues || []
  const accessConstraints = answers.q3_5_accessConstraints || []

  // Handle both legacy string and new array for planning consents
  const _planning = answers.q3_4_planningConsents
  const planningStr = Array.isArray(_planning) ? _planning.join(' | ') : (_planning || '')

  // Handle both legacy string and new array for surveys
  const _surveys = answers.q3_3_surveys
  const surveysArr = Array.isArray(_surveys) ? _surveys : (_surveys ? [_surveys] : [])
  const noSurveys = surveysArr.includes('None') || surveysArr.includes('None yet') || _surveys === 'None yet'

  function checkCondition(condition) {
    const c = condition.toLowerCase()
    if (c.includes('fully occupied throughout') || c.includes('q3.6 = fully occupied'))
      return (answers.q3_6_occupation || '').toLowerCase().includes('fully occupied') ||
             (answers.q3_6_occupation || '').toLowerCase().includes('fully occupied')
    if (c.includes('partially occupied') || c.includes('q3.6 = partially'))
      return (answers.q3_6_occupation || '').toLowerCase().includes('partially')
    if (c.includes('restricted working hours'))
      return accessConstraints.some(a => a.toLowerCase().includes('restricted working'))
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
      return (programmeWeeks || 100) <= 26
    if (c.includes('6–12 months') || c.includes('6 – 12'))
      return (programmeWeeks || 0) > 26 && (programmeWeeks || 0) <= 52
    if (c.includes('12–18') || c.includes('12 – 18'))
      return (programmeWeeks || 0) > 52 && (programmeWeeks || 0) <= 78
    if (c.includes('18+') || c.includes('18 months →'))
      return (programmeWeeks || 0) > 78
    if (c.includes('≤ 6 months') || c.includes('<= 6'))
      return (programmeWeeks || 0) <= 26
    if (c.includes('6–12') && c.includes('construction'))
      return (programmeWeeks || 0) > 26 && (programmeWeeks || 0) <= 52
    if (c.includes('12–18') && c.includes('construction'))
      return (programmeWeeks || 0) > 52 && (programmeWeeks || 0) <= 78
    if (c.includes('18–24') || c.includes('18 – 24'))
      return (programmeWeeks || 0) > 78 && (programmeWeeks || 0) <= 104
    if (c.includes('24+') && c.includes('construction'))
      return (programmeWeeks || 0) > 104
    if (c.includes('always 5%') || c.includes('fixed'))
      return true
    if (c.includes('base'))
      return true // BASE rows are always active
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
  let cTotal = cBase ? cBase.adjustPct : 13.5
  for (const r of cRules.filter(r => r.type === 'ADD')) {
    if (checkCondition(r.condition)) cTotal += r.adjustPct
  }

  // ── Code D: Developer & Project Costs ────────────────────────────────────
  const dRules = rules.filter(r => r.code === 'D')
  const dBase = dRules.find(r => r.type === 'BASE' && checkCondition(r.condition))
  let dTotal = dBase ? dBase.adjustPct : 3
  for (const r of dRules.filter(r => r.type === 'ADD')) {
    if (checkCondition(r.condition)) dTotal += r.adjustPct
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
  const fRules = rules.filter(r => r.code === 'F')
  const fCap = fRules[0]?.capPct || 12
  // Tender delay component (time to tender ≈ design + survey weeks, rough estimate)
  const weeksToTender = Math.max(0, (programmeWeeks || 0) - (answers._constructionWeeks || 0) - 2)
  const monthsToTender = weeksToTender / 4.33
  const tenderDelayRules = fRules.filter(r => r.condition.toLowerCase().includes('tender'))
  let tenderInflation = 0
  for (const r of tenderDelayRules) {
    if (checkCondition(r.condition)) { tenderInflation = r.adjustPct; break }
  }
  // Construction mid-point component
  const constructionWeeks = answers._constructionWeeks || 0
  const constructionRules = fRules.filter(r => r.condition.toLowerCase().includes('construction'))
  let constructionInflation = 0
  for (const r of constructionRules) {
    if (checkCondition(r.condition)) { constructionInflation = r.adjustPct; break }
  }
  const inflation = Math.min(tenderInflation + constructionInflation, fCap)

  // ── Risk level badge ──────────────────────────────────────────────────────
  const riskLevel = risk <= 6 ? 'Low' : risk <= 8 ? 'Medium' : 'High'

  return { prelims, ohp, fees: cTotal, devCosts: dTotal, risk, contingency, inflation, riskLevel }
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function calculateCost(answers, programmeWeeks) {
  const wb = await fetchRatesWorkbook()
  const elements = parseRatesTable(wb)
  const rules = parsePercentageRules(wb)
  const scopeMap = parseScopeItemMap(wb)
  const bcisRegions = parseBcisFactors(wb)
  const specData = parseSpecLevelMap(wb)

  const gifa = Number(answers.q1_5_size) || 100
  const projectType = answers.q1_2_projectType || 'Refurbishment'
  const specLevel = answers.q2_4_specLevel || 'Standard'
  const interventionLevel = answers.q2_3_interventionLevel || 'Full systems replacement'
  const scopeItems = answers.q2_2_scopeItems || []
  const knownIssues = answers.q3_1_knownIssues || []

  const { factor: bcisFactor, region: bcisRegion } = getBcis(answers.q1_1_postcode, bcisRegions)
  const bandFactor = specData.bandFactors[interventionLevel] ?? 1.0
  const designMultiplier = specData.designMultipliers[interventionLevel] ?? 1.0

  // Special quantities from questionnaire
  const specialQtys = {
    pvKwp:       Number(answers.q1_5_pvKwp)      || 0,
    battKwh:     Number(answers.q1_5_battKwh)    || 0,
    evNr:        Number(answers.q1_5_evNr)       || 0,
    liftNr:      Number(answers.q1_5_liftNr)     || 0,
    carParksNr:  Number(answers.q1_5_carParksNr) || 0,
    extLightNr:  Number(answers.q1_5_extLightNr) || 0,
    bathroomNr:  Number(answers.q2_2_bathrooms)  || 0,
    kitchenNr:   Number(answers.q2_2_kitchens)   || 0,
  }

  // ── Collect element codes from ticked scope items ─────────────────────────
  const elementCodes = new Set()

  for (const item of scopeItems) {
    if (COMBINED_CODES[item]) {
      // Combined range like '1.1-1.3' → expand to individual codes
      COMBINED_CODES[item].forEach(c => elementCodes.add(c))
    } else {
      const codes = scopeMap[item]
      if (codes) {
        codes.forEach(c => elementCodes.add(c))
      } else {
        // Item is a direct NRM1 code — bypass Tab 7 lookup
        elementCodes.add(item)
      }
    }
  }

  // Add wiring scope (mutually exclusive 5.8 / 5.8a / 5.8b) from dedicated field
  const wiringChoice = answers.q2_2_wiring
  if (wiringChoice && wiringChoice !== 'none') {
    // Mutex guard: ensure only one of 5.8/5.8a/5.8b ends up in the set
    ;['5.8', '5.8a', '5.8b'].forEach(c => elementCodes.delete(c))
    elementCodes.add(wiringChoice)
  }
  // Mutex validation: if somehow scope already has >1 wiring code, throw
  const wiringCodesPresent = ['5.8', '5.8a', '5.8b'].filter(c => elementCodes.has(c))
  if (wiringCodesPresent.length > 1) {
    throw new Error(`Select only one electrical wiring option (Full rewire / 1st fix / 2nd fix). Found: ${wiringCodesPresent.join(', ')}`)
  }

  // Always include Group 3 (internal finishes)
  ;['3.1', '3.2', '3.3'].forEach(c => elementCodes.add(c))

  // Include Group 5 BWIC if any Group 5 element present
  const hasGroup5 = [...elementCodes].some(c => c.startsWith('5.'))
  if (hasGroup5) elementCodes.add('5.20')

  // Filter out Group 0 unless triggered
  const group0Triggered = isGroup0Triggered(scopeItems, knownIssues, interventionLevel)
  const finalCodes = [...elementCodes].filter(c => {
    const el = elements[c]
    if (!el) return false
    if (el.group === 0) return group0Triggered
    return true
  })

  // ── Price each element ────────────────────────────────────────────────────
  const lineItems = []
  let worksTotal = 0

  for (const code of finalCodes) {
    const el = elements[code]
    if (!el) continue
    const baseRate = getRateForElement(el, projectType, specLevel)
    if (baseRate === 0) continue // rate is 0 for this project type/spec
    // Band factor only applies to m² rates; Item/Nr rates are fixed
    const effectiveBandFactor = el.unit === 'm²' ? bandFactor : 1.0
    const midRate = baseRate * bcisFactor * effectiveBandFactor
    const qty = getQuantity(code, el.unit, gifa, specialQtys)
    if (qty === 0) continue
    const lineMid = midRate * qty
    const lineLow = lineMid * 0.89
    const lineHigh = lineMid * 1.11
    lineItems.push({
      code,
      group: el.group,
      description: el.description,
      unit: el.unit,
      rate: Math.round(midRate * 100) / 100,
      rateLow: Math.round(baseRate * bcisFactor * effectiveBandFactor * 0.89 * 100) / 100,
      rateHigh: Math.round(baseRate * bcisFactor * effectiveBandFactor * 1.11 * 100) / 100,
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
  const pct = evaluatePercentageRules(rules, answers, worksMid, programmeWeeks)

  const prelimsMid = r1k(worksMid * pct.prelims / 100)
  const ohpMid     = r1k(worksMid * pct.ohp / 100)
  const conMid     = r1k(worksMid + prelimsMid + ohpMid)
  const conLow     = r1k(worksLow * (1 + pct.prelims / 100 + pct.ohp / 100))
  const conHigh    = r1k(worksHigh * (1 + pct.prelims / 100 + pct.ohp / 100))

  const feesMid    = r1k(conMid * pct.fees / 100)
  const devMid     = r1k(conMid * pct.devCosts / 100)
  const riskMid    = r1k(worksMid * pct.risk / 100)
  const contMid    = r1k(worksMid * pct.contingency / 100)
  const inflMid    = r1k(worksMid * pct.inflation / 100)

  const totalMid   = r1k(conMid + feesMid + devMid + riskMid + contMid + inflMid)
  const totalLow   = r1k(conLow + r1k(conLow * pct.fees / 100) + r1k(conLow * pct.devCosts / 100)
                          + r1k(worksLow * pct.risk / 100) + r1k(worksLow * pct.contingency / 100)
                          + r1k(worksLow * pct.inflation / 100))
  const totalHigh  = r1k(conHigh + r1k(conHigh * pct.fees / 100) + r1k(conHigh * pct.devCosts / 100)
                          + r1k(worksHigh * pct.risk / 100) + r1k(worksHigh * pct.contingency / 100)
                          + r1k(worksHigh * pct.inflation / 100))
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

