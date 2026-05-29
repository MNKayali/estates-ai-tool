/**
 * programmeCalculator.js — Deterministic RIBA programme engine.
 * All durations come from the Programme Duration Reference Excel workbook.
 * The AI never touches these numbers.
 */
import * as XLSX from 'xlsx'

let _cache = { wb: null, fetchedAt: 0 }

async function fetchProgrammeWorkbook() {
  const now = Date.now()
  if (_cache.wb && now - _cache.fetchedAt < 10 * 60 * 1000) return _cache.wb
  const url = process.env.PROGRAMME_FILE_URL
  if (!url) throw new Error('PROGRAMME_FILE_URL environment variable not set')
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Failed to fetch Programme workbook: HTTP ${res.status}`)
  const buf = await res.arrayBuffer()
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
  _cache = { wb, fetchedAt: now }
  return wb
}

// ─── Parse helpers ────────────────────────────────────────────────────────────

/** Parse "X – Y" range string → { lo, hi, mid } in weeks */
function parseRange(str) {
  if (!str || str === '—' || str === '') return { lo: 0, hi: 0, mid: 0 }
  const clean = String(str).replace(/\+\s*/, '').trim()
  const parts = clean.split(/\s*[–-]\s*/)
  if (parts.length === 2) {
    const lo = parseFloat(parts[0]) || 0
    const hi = parseFloat(parts[1]) || 0
    return { lo, hi, mid: (lo + hi) / 2 }
  }
  const n = parseFloat(clean) || 0
  return { lo: n, hi: n, mid: n }
}

/** Pick size band index (0=verySmall, 1=small, 2=medium, 3=large) */
function designSizeBand(gifa) {
  if (gifa < 150) return 0
  if (gifa < 500) return 1
  if (gifa <= 2000) return 2
  return 3
}

/** Pick size band index (0–4) for construction duration */
function constructionSizeBand(gifa) {
  if (gifa < 150) return 0    // very small < 150 m²
  if (gifa <= 250) return 1   // up to 250 m²
  if (gifa <= 500) return 2   // 250–500 m²
  if (gifa <= 1500) return 3  // 500–1,500 m²
  return 4                    // 1,500–3,000 m²
}

// ─── Tab parsers ──────────────────────────────────────────────────────────────

/**
 * Unified durations table — covers design stages, regulatory periods, and procurement.
 * Sheet: "Durations"
 * Cols: 0=Activity, 1=Very Small, 2=Small, 3=Medium, 4=Large, 5=Unit, 6=Notes
 */
function parseDurationsTab(wb) {
  const ws = wb.Sheets['Durations']
  if (!ws) throw new Error('Programme workbook missing "Durations" sheet')
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const table = {}
  for (const row of rows) {
    const name = String(row[0] || '').trim()
    if (!name) continue
    table[name] = {
      verySmall: String(row[1] || '').trim(),
      small:     String(row[2] || '').trim(),
      medium:    String(row[3] || '').trim(),
      large:     String(row[4] || '').trim(),
    }
  }
  return table
}

/**
 * Construction duration table.
 * Sheet: "Construction"
 * Cols: 0=Project Type, 1=Very Small, 2=Up to 250, 3=250-500, 4=500-1500, 5=1500-3000
 */
function parseConstructionTab(wb) {
  const ws = wb.Sheets['Construction']
  if (!ws) throw new Error('Programme workbook missing "Construction" sheet')
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const table = []
  for (const row of rows) {
    const name = String(row[0] || '').trim()
    if (!name || !row[1]) continue
    table.push({
      name,
      b0: String(row[1] || '').trim(),
      b1: String(row[2] || '').trim(),
      b2: String(row[3] || '').trim(),
      b3: String(row[4] || '').trim(),
      b4: String(row[5] || '').trim(),
    })
  }
  return table
}

// ─── Computed programme assumptions ──────────────────────────────────────────

function buildProgrammeAssumptions(answers, result) {
  const occupation  = answers.q3_6_occupation || ''
  const gifa        = Number(answers.q1_5_size) || 100
  const projectType = answers.q1_2_projectType || 'Refurbishment'
  const { tenderWeeks, costMidPoint } = result

  let occupationNote = 'No occupation uplift applied — building vacant or not applicable.'
  if (occupation.toLowerCase().includes('fully occupied'))
    occupationNote = 'A 30% construction duration uplift has been applied for full occupation — phasing, noise and dust management, and increased supervision.'
  else if (occupation.toLowerCase().includes('partial'))
    occupationNote = 'A 20% construction duration uplift has been applied for partial occupation — section-by-section handover and phased access.'

  const costMid = costMidPoint || 500000
  const procNote = costMid >= 100000
    ? `Procurement threshold rule: construction cost mid-point (£${Math.round(costMid / 1000)}k) exceeds £100,000 — formal competitive tender of approximately ${tenderWeeks} weeks applied.`
    : `Procurement threshold rule: construction cost mid-point (£${Math.round(costMid / 1000)}k) is below £100,000 — three competitive quotations, approximately ${tenderWeeks} weeks applied.`

  return [
    'Programme durations are indicative only and based on information provided at RIBA Stage 0–1. Actual durations to be confirmed at Stage 2 once surveys, design scope, and procurement strategy are finalised.',
    'Durations assume client decision-making within the gateway periods shown. Delays to client sign-off will extend the programme accordingly.',
    'Planning determination periods are based on statutory LPA timescales. No allowance has been made for objections, committee referral, or appeals.',
    'Building control approval: LABC Full Plans route assumed (5–8 weeks), running in parallel with Stage 4. A private RBCA (3–5 weeks) should be considered for programme-critical projects — decision to be confirmed by the PM at Stage 2.',
    `Construction duration is benchmarked against ${gifa} m² ${projectType} at standard productivity rates. Actual duration to be confirmed at Stage 2 by the appointed contractor.`,
    occupationNote,
    'Surveys shown at the start of Stage 2 are identified as required but not yet commissioned. Commissioning surveys before Stage 2 commences is a gateway condition.',
    'The programme does not show calendar dates. Durations are from a notional project start (Week 0 = Stage 1 Gateway approval).',
    procNote,
    'Handover (RIBA Stage 6) includes commissioning, snagging, and Practical Completion. The defects liability period is not shown — it begins at Practical Completion and is typically 12 months.',
  ]
}

// ─── Construction type selector ───────────────────────────────────────────────
// Returns an exact row name matching the Construction sheet

function selectConstructionRow(projectType, specLevel, scopeItems, storeys, buildingUse) {
  const pt    = projectType.toLowerCase()
  const bu    = (buildingUse || '').toLowerCase()
  const scope = (scopeItems || []).map(s => s.toLowerCase())
  const hasHighSpec = specLevel === 'High'

  // ── New Build — differentiated by building use ────────────────────────────────
  if (pt.includes('new build')) {
    if (bu.includes('healthcare') || bu.includes('clinical'))
      return 'New Build — Healthcare / Specialist'
    if (bu.includes('industrial') || bu.includes('warehouse'))
      return 'New Build — Industrial / Warehouse'
    return 'New Build — Standard'   // offices, education, residential, retail, mixed
  }

  // ── Other deterministic types ─────────────────────────────────────────────────
  if (pt.includes('demolition'))     return 'Demolition / Enabling'
  if (pt.includes('external works')) return 'External Works'

  if (pt.includes('extension'))
    return (Number(storeys) > 1) ? 'Extension — Multi-Storey' : 'Extension — Single Storey'

  // ── Scope-driven (Refurbishment, Fit-out, Renewable Energy, Mixed) ────────────

  // Specialist rooms always override everything else
  const hasLab = scope.some(s =>
    s === '4.4' || s.includes('lab') || s.includes('clinical') ||
    s.includes('healthcare') || s.includes('data centre'))
  if (hasLab) return 'Specialist — Labs / Healthcare'

  // Fit-out: spec level drives Cat A vs Cat B — M&E is part of the fit-out, not separate
  if (pt.includes('fit-out') || pt.includes('fit out'))
    return hasHighSpec ? 'Fit-Out — Cat B / High Spec' : 'Fit-Out — Basic / Cat A'

  // Renewable Energy, Refurbishment, Mixed: scope analysis
  // (Renewable Energy typically has 3+ M&E items → M&E Replacement)
  const isMeCode    = s => /^5\./.test(s)
  const isMeKeyword = s =>
    s.includes('heating') || s.includes('ventil') || s.includes('electric') ||
    s.includes('plumb')   || s.includes('air conditioning') || s.includes('gas') ||
    s.includes('sprinkler') || s.includes('emergency') || s.includes('fire alarm')
  if (scope.filter(s => isMeCode(s) || isMeKeyword(s)).length >= 3)
    return 'Refurb — M&E Replacement'

  const hasFabric = scope.some(s =>
    /^2\./.test(s) || s.includes('roof') || s.includes('facade') ||
    s.includes('window') || s.includes('waterproof'))
  if (hasFabric) return 'Refurb — Fabric / Envelope'

  // Default: Refurb with minor works, Mixed with light scope
  return hasHighSpec ? 'Fit-Out — Cat B / High Spec' : 'Fit-Out — Basic / Cat A'
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function calculateProgramme(answers, costMidpoint) {
  const wb     = await fetchProgrammeWorkbook()
  const durTab = parseDurationsTab(wb)
  const conTab = parseConstructionTab(wb)

  const gifa             = Number(answers.q1_5_size) || 100
  const projectType      = answers.q1_2_projectType || 'Refurbishment'
  const interventionLevel = answers.q2_3_interventionLevel || 'Full systems replacement'
  const scopeItems       = answers.q2_2_scopeItems || []
  const knownIssues      = answers.q3_1_knownIssues || []
  const age              = answers.q1_4_buildingAge || ''
  const occupation       = answers.q3_6_occupation || ''
  const accessConstraints = answers.q3_5_accessConstraints || []
  const _planningRaw     = answers.q3_4_planningConsents
  const planningType     = Array.isArray(_planningRaw)
    ? (_planningRaw.length ? _planningRaw.join(' | ') : 'No consent required')
    : (_planningRaw || 'No consent required')
  const specLevel        = answers.q2_4_specLevel || 'Standard'

  const dBand   = designSizeBand(gifa)
  const cBand   = constructionSizeBand(gifa)
  const bandKey = ['verySmall', 'small', 'medium', 'large'][dBand]

  // Helper: get mid-point weeks from a Durations row, with fallback
  const dur = (key, fallback = 0) => {
    const entry = durTab[key]
    if (!entry) return fallback
    return parseRange(entry[bandKey]).mid || fallback
  }

  // ── Q2.3 design duration multiplier ─────────────────────────────────────────
  const designMultiplierMap = {
    'Fabric and finishes only':         0.50,
    'Finishes with minor services':     0.70,
    'Full systems replacement':         1.00,
    'Reconfiguration or full redesign': 1.30,
  }
  const designMultiplier = designMultiplierMap[interventionLevel] ?? 1.0

  // ── Derived flags ────────────────────────────────────────────────────────────
  const isPreMinus1980 = age.includes('Pre-1900') || age.includes('1900') || age.includes('1945') || age.includes('1980')
  const isPreMinus2000 = isPreMinus1980 || age.includes('1980–2000')
  const hasDemo      = scopeItems.some(s => s === '0.2' || s.toLowerCase().includes('demolition') || s.toLowerCase().includes('structural alterations'))
  const hasAsbestos  = knownIssues.some(i => i.toLowerCase().includes('asbestos'))
  const hasStructural = knownIssues.some(i => i.toLowerCase().includes('structural')) ||
                        scopeItems.some(s => s === '7.1' || s.toLowerCase().includes('structural'))
  const isNewBuild   = projectType.toLowerCase().includes('new build')
  const isExtension  = projectType.toLowerCase().includes('extension')
  const isRefurb     = !isNewBuild && !isExtension &&
                       !projectType.toLowerCase().includes('external') &&
                       !projectType.toLowerCase().includes('demolition') &&
                       !projectType.toLowerCase().includes('renewable')

  // ── Pre-design surveys ───────────────────────────────────────────────────────
  const stages = []
  let surveyWeeks = 0

  // Asbestos
  if (isPreMinus2000 && !isNewBuild) {
    const useRd = hasDemo || hasAsbestos || isPreMinus1980
    const key   = useRd ? 'Asbestos — R&D Survey' : 'Asbestos — Management'
    const wks   = Math.ceil(dur(key, 2))
    surveyWeeks += wks
    stages.push({ stage: 'Asbestos Survey', activity: useRd ? 'Refurbishment/Demolition Survey' : 'Management Survey', weeks: wks, notes: 'Pre-design — parallel with mobilisation' })
  }

  // Structural survey
  if (hasStructural && !isNewBuild) {
    const wks = Math.ceil(dur('Structural Survey', 2))
    surveyWeeks = Math.max(surveyWeeks, wks)
    stages.push({ stage: 'Structural Survey', activity: 'Independent structural inspection', weeks: wks, notes: 'Pre-design' })
  }

  // Condition survey (refurb only)
  if (isRefurb) {
    const wks = Math.ceil(dur('Condition Survey', 2))
    surveyWeeks = Math.max(surveyWeeks, wks)
    stages.push({ stage: 'Condition Survey', activity: 'Building condition survey', weeks: wks, notes: 'Pre-design — parallel with other surveys' })
  }

  // Topographic survey (new build / extension)
  if (isNewBuild || isExtension) {
    const wks = Math.ceil(dur('Topographic Survey', 2))
    surveyWeeks = Math.max(surveyWeeks, wks)
    stages.push({ stage: 'Topographic Survey', activity: 'Topographic and measured building survey', weeks: wks, notes: 'Pre-design' })
  }

  // Ground investigation
  const hasBrownfield = knownIssues.some(i => i.toLowerCase().includes('contaminated'))
  if (isNewBuild || isExtension || hasBrownfield) {
    const wks = Math.ceil(dur('Ground Investigation', 4))
    surveyWeeks = Math.max(surveyWeeks, wks)
    stages.push({ stage: 'Ground Investigation', activity: 'Ground investigation and geotechnical report', weeks: wks, notes: 'Pre-design — parallel with other surveys' })
  }

  // ── Design stages ────────────────────────────────────────────────────────────
  // M&E and specialist flags used for Stage 3/4 uplifts
  const meCount = scopeItems.filter(s =>
    /^5\./.test(s) ||
    ['heating', 'ventil', 'air conditioning', 'electrical', 'plumb', 'sprinkler', 'gas']
      .some(kw => s.toLowerCase().includes(kw))
  ).length
  const hasSpecialist = scopeItems.some(s =>
    s === '4.4' || s === '6.2' ||
    s.toLowerCase().includes('lab') || s.toLowerCase().includes('clinical') || s.toLowerCase().includes('data centre'))

  // Stage 2
  let s2Weeks = dur('Stage 2 — Concept Design', 3) * designMultiplier
  if (hasStructural)           s2Weeks += dur('Stage 2 Uplift — Structural', 0)
  if (age.includes('Pre-1900')) s2Weeks += dur('Stage 2 Uplift — Listed Building', 0)
  s2Weeks = Math.ceil(s2Weeks)

  // Stage 3
  let s3Weeks = dur('Stage 3 — Developed Design', 5) * designMultiplier
  if (meCount >= 4)    s3Weeks += dur('Stage 3 Uplift — M&E Heavy', 0)
  if (hasSpecialist)   s3Weeks += dur('Stage 3 Uplift — Specialist', 0)
  s3Weeks = Math.ceil(s3Weeks)

  // Stage 4
  let s4Weeks = dur('Stage 4 — Technical Design', 5) * designMultiplier
  if (meCount >= 4 || hasSpecialist) s4Weeks += dur('Stage 4 Uplift — M&E / Specialist', 0)
  s4Weeks = Math.ceil(s4Weeks)

  // Client gateway (from Excel — 1 wk Very Small, 2 wks all others)
  const gatewayWks = Math.ceil(dur('Client Gateway', gifa < 150 ? 1 : 2))

  stages.push({ stage: 'Stage 2',  activity: 'Concept Design', weeks: s2Weeks, notes: 'Includes surveys at start of stage' })
  stages.push({ stage: 'Gateway',  activity: 'Client Review — Stage 2', weeks: gatewayWks, notes: 'Client sign-off' })
  stages.push({ stage: 'Stage 3',  activity: 'Developed Design — planning application submitted at start of stage', weeks: s3Weeks, notes: 'Planning application submitted at start; determination runs in parallel' })

  // ── Planning (calculated here; pushed immediately after Stage 3) ──────────────
  // Planning runs IN PARALLEL with Stage 3. If determination extends beyond Stage 3
  // a sequential "wait" period is added before Stage 4 can start.
  let planningWks = 0
  let planningNote = ''
  const pl = planningType.toLowerCase()

  if (pl.includes('full planning') && pl.includes('listed')) {
    planningWks  = Math.ceil(dur('Planning — Listed Building Consent', 11))
    planningNote = 'Dual consent — Full Planning and Listed Building Consent run concurrently where possible; parallel with Stage 3 design'
  } else if (pl.includes('full planning')) {
    planningWks  = Math.ceil(dur('Planning — Full Permission', 11))
    planningNote = 'Statutory 8-week determination period — parallel with Stage 3 design'
  } else if (pl.includes('prior approval')) {
    planningWks  = Math.ceil(dur('Planning — Prior Approval', 6))
    planningNote = 'Prior approval — shorter statutory period; parallel with Stage 3 design'
  } else if (pl.includes('change of use')) {
    planningWks  = Math.ceil(dur('Planning — Change of Use', 11))
    planningNote = 'Change of use consent — same statutory period as full planning; parallel with Stage 3 design'
  } else if (pl.includes('unsure') || pl.includes('pre-application')) {
    planningWks  = Math.ceil(dur('Planning — Pre-Application', 5))
    planningNote = 'Pre-application advice recommended before formal submission; parallel with Stage 3 design'
  }

  // Planning overrun: weeks by which determination extends beyond Stage 3 design
  const planningOverrunWks = planningWks > 0 ? Math.max(0, planningWks - s3Weeks) : 0

  if (planningWks > 0) {
    stages.push({ stage: 'Planning', activity: 'Planning consent determination (parallel with Stage 3)', weeks: planningWks, notes: planningNote })
    if (planningOverrunWks > 0) {
      stages.push({ stage: 'Planning — wait', activity: 'Awaiting LPA determination — Stage 4 on hold', weeks: planningOverrunWks,
        notes: `Planning determination extends ${planningOverrunWks} wk(s) beyond Stage 3. Stage 4 cannot start until consent is received.` })
    }
  }

  stages.push({ stage: 'Gateway',  activity: 'Client Review — Stage 3', weeks: gatewayWks, notes: 'Client sign-off' })
  stages.push({ stage: 'Stage 4',  activity: 'Technical Design — building control submission at start of stage', weeks: s4Weeks, notes: 'Full construction information; BC runs in parallel' })

  // ── Building Control (parallel with Stage 4) ──────────────────────────────────
  // LABC is the standard route. RBCA noted in assumptions as option for critical projects.
  let bcWks = 0
  if (!pl.includes('permitted development') && !pl.includes('no consent')) {
    bcWks = Math.ceil(dur('Building Control — LABC', 7))
    stages.push({ stage: 'Building Control', activity: 'LABC Full Plans submission (parallel with Stage 4)', weeks: bcWks,
      notes: 'Runs in parallel with Stage 4. Private RBCA (3–5 wks) is an option for programme-critical projects.' })
  }
  // BC overrun: if approval takes longer than Stage 4, the overrun delays tender
  const bcOverrunWks = Math.max(0, bcWks - s4Weeks)
  if (bcOverrunWks > 0) {
    stages.push({ stage: 'Building Control — wait', activity: 'Awaiting BC approval — tender on hold', weeks: bcOverrunWks,
      notes: `BC approval extends ${bcOverrunWks} wk(s) beyond Stage 4. Tender cannot start until approval received.` })
  }

  stages.push({ stage: 'Gateway',  activity: 'Client Review — Stage 4', weeks: gatewayWks, notes: 'Client sign-off' })

  // ── Tender / Procurement ──────────────────────────────────────────────────────
  const costMid       = costMidpoint || 500000
  const tenderKey     = costMid >= 100000 ? 'Tender — Formal Competitive' : 'Tender — 3 Quotations'
  const tenderRange   = parseRange((durTab[tenderKey] || {})[bandKey] || (costMid >= 100000 ? '10–12' : '4–6'))
  const tenderWks     = Math.round(tenderRange.mid)
  const procurementRoute = costMid >= 100000 ? 'Traditional — Single Stage Tender' : 'Direct Award — 3 Quotations'
  const tenderNote    = costMid >= 100000
    ? `Formal competitive tender — works cost exceeds £100,000 threshold (${tenderRange.lo}–${tenderRange.hi} weeks)`
    : `Three quotations — works cost under £100,000 (${tenderRange.lo}–${tenderRange.hi} weeks)`
  stages.push({ stage: 'Tender / Procurement', activity: procurementRoute, weeks: tenderWks, notes: tenderNote })

  // ── Construction ──────────────────────────────────────────────────────────────
  const conTypeName  = selectConstructionRow(projectType, specLevel, scopeItems, answers.q1_2_storeys, answers.q1_3_buildingUse)
  const conRowEntry  = conTab.find(r => r.name === conTypeName)
  const conBandKeys  = ['b0', 'b1', 'b2', 'b3', 'b4']
  const conRangeStr  = conRowEntry ? conRowEntry[conBandKeys[cBand]] : '10 – 16'
  const conRange     = parseRange(conRangeStr)
  let conWks = conRange.mid

  // Occupation uplift
  let occupationUplift = 0
  if (occupation.toLowerCase().includes('fully occupied'))  occupationUplift = 0.30
  else if (occupation.toLowerCase().includes('partial'))    occupationUplift = 0.20

  // Access restriction uplifts
  if (accessConstraints.some(a => a.toLowerCase().includes('term-time')))  conWks *= 1.175
  else if (accessConstraints.some(a => a.toLowerCase().includes('restricted'))) conWks *= 1.125

  conWks = Math.ceil(conWks * (1 + occupationUplift))
  stages.push({ stage: 'Construction', activity: `RIBA Stage 5 — ${conTypeName}`, weeks: conWks,
    notes: occupationUplift > 0 ? `Uplift applied: ${Math.round(occupationUplift * 100)}% for occupied works` : 'Full decant / vacant — no uplift' })

  // ── Handover ──────────────────────────────────────────────────────────────────
  const hoRowEntry = conTab.find(r => r.name === 'Handover')
  const hoStr      = hoRowEntry ? hoRowEntry[conBandKeys[Math.min(cBand, 4)]] : '2 – 4'
  const hoWks      = Math.ceil(parseRange(hoStr).mid)
  stages.push({ stage: 'Handover', activity: 'RIBA Stage 6 — Commissioning, snagging, Practical Completion', weeks: hoWks,
    notes: 'Defects liability period begins at Practical Completion' })

  // ── Phased delivery (Q4.6) ───────────────────────────────────────────────────
  // q4_7_phasing: 'Single phase' | '2 phases' | '3 or more phases'
  const phasingAnswer = answers.q4_7_phasing || 'Single phase'
  let phasingNote = ''
  let phasingExtraWks = 0
  if (phasingAnswer === '2 phases') {
    // Each phase roughly equal — allow a mobilisation gap between phases (4 weeks)
    phasingExtraWks = conWks + 4
    phasingNote = `2-phase delivery: construction programme shown (${conWks} wks) is per phase. Allow an additional ${phasingExtraWks} weeks for Phase 2 construction and re-mobilisation, bringing total construction to approximately ${conWks + phasingExtraWks} weeks.`
    stages.push({ stage: 'Phase 2 Construction', activity: 'Phase 2 — construction and re-mobilisation', weeks: phasingExtraWks, notes: 'Phase sizes assumed equal at Stage 0–1. Confirm split at Stage 2.' })
  } else if (phasingAnswer === '3 or more phases') {
    phasingExtraWks = (conWks + 4) * 2
    phasingNote = `3+ phase delivery: construction programme shown (${conWks} wks) is for Phase 1. Total construction duration across all phases estimated at approximately ${conWks + phasingExtraWks} weeks. Phase programme to be confirmed at Stage 2.`
    stages.push({ stage: 'Phase 2 & 3+ Construction', activity: 'Phases 2 and beyond — construction and re-mobilisation', weeks: phasingExtraWks, notes: 'Phase sizes assumed equal at Stage 0–1. Confirm split at Stage 2.' })
  }

  // ── Funding governance ────────────────────────────────────────────────────────
  const fundingSource = answers.q4_9_funding || ''
  let grantGovernanceWks = 0
  let procurementNote    = ''
  if (fundingSource === 'Grant or public funding') {
    grantGovernanceWks = 4
    procurementNote    = 'Grant or public funding — formal competitive procurement required regardless of value.'
    stages.push({ stage: 'Governance', activity: 'Grant governance approval', weeks: grantGovernanceWks, notes: procurementNote })
  }

  // ── Totals ─────────────────────────────────────────────────────────────────────
  const designWeeks = s2Weeks + gatewayWks + s3Weeks + gatewayWks + s4Weeks + gatewayWks
  const totalWeeks  = surveyWeeks + designWeeks + planningOverrunWks + bcOverrunWks + tenderWks + conWks + phasingExtraWks + hoWks + grantGovernanceWks

  // ── Target date feasibility ───────────────────────────────────────────────────
  let targetStatus = 'no-date'
  let targetNote   = 'No target completion date has been specified.'
  const targetDate = answers.q4_1_targetDate

  if (targetDate && targetDate !== 'No specific deadline') {
    const target  = new Date(targetDate)
    const earliest = new Date()
    earliest.setDate(earliest.getDate() + totalWeeks * 7)
    if (target >= earliest) {
      targetStatus = 'achievable'
      const bufferWeeks = Math.round((target - earliest) / (7 * 24 * 3600 * 1000))
      targetNote = `The target date of ${target.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} is achievable with a programme buffer of approximately ${bufferWeeks} weeks.`
    } else {
      targetStatus = 'at-risk'
      const shortfallWeeks = Math.round((earliest - target) / (7 * 24 * 3600 * 1000))
      targetNote = `The target date of ${target.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} is not achievable. The minimum realistic programme is ${totalWeeks} weeks from project start, approximately ${shortfallWeeks} weeks beyond the target.`
    }
  }

  // ── Milestones ────────────────────────────────────────────────────────────────
  const milestones = ['Week 0: Project Start — Stage 1 Gateway approval']
  let w = surveyWeeks
  if (surveyWeeks > 0) milestones.push(`Week ${w}: Pre-design surveys complete — Stage 2 commences`)
  w += s2Weeks
  milestones.push(`Week ${w}: Stage 2 Concept Design complete`)
  w += gatewayWks + s3Weeks
  milestones.push(`Week ${w}: Stage 3 Developed Design complete — Planning decision expected`)
  w += gatewayWks + s4Weeks + gatewayWks
  milestones.push(`Week ${w}: Stage 4 Technical Design complete — Tender issued`)
  w += tenderWks
  milestones.push(`Week ${w}: Contractor appointed — construction commences`)
  w += conWks
  milestones.push(`Week ${w}: Practical Completion`)
  w += hoWks
  milestones.push(`Week ${w}: Project Close-out — Defects liability period begins`)

  const assumptions = buildProgrammeAssumptions(answers, {
    totalWeeks,
    constructionWeeks: conWks,
    procurementRoute,
    tenderWeeks: tenderWks,
    costMidPoint: costMid,
  })

  return {
    stages,
    totalWeeks,
    surveyWeeks,
    designWeeks,
    tenderWeeks: tenderWks,
    constructionWeeks: conWks,
    handoverWeeks: hoWks,
    planningWeeks: planningWks,
    bcWeeks: bcWks,
    bcOverrunWeeks: bcOverrunWks,
    planningOverrunWeeks: planningOverrunWks,
    targetStatus,
    targetNote,
    procurementRoute,
    milestones,
    assumptions,
    standardAssumptions: assumptions,
    occupationUplift: Math.round(occupationUplift * 100),
    constructionType: conTypeName,
    grantGovernanceWeeks: grantGovernanceWks,
    procurementNote,
    phasingNote,
    phasingExtraWeeks: phasingExtraWks,
  }
}
