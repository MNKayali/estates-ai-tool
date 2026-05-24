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

/** Pick size band index (0=small, 1=medium, 2=large) for design stage table */
function designSizeBand(gifa) {
  if (gifa < 500) return 0
  if (gifa <= 2000) return 1
  return 2
}

/** Pick size band index (0–3) for construction duration table */
function constructionSizeBand(gifa) {
  if (gifa <= 250) return 0
  if (gifa <= 500) return 1
  if (gifa <= 1500) return 2
  return 3
}

// ─── Tab parsers ──────────────────────────────────────────────────────────────

function parseDesignStageTab(wb) {
  const ws = wb.Sheets['Design Stage Durations']
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  // Key rows by activity name (col 0)
  const table = {}
  for (const row of rows) {
    const name = String(row[0] || '').replace(/\n/g, ' ').trim()
    if (!name) continue
    table[name] = {
      small:  String(row[1] || '').trim(),
      medium: String(row[2] || '').trim(),
      large:  String(row[3] || '').trim(),
    }
  }
  return table
}

function parseRegulatoryTab(wb) {
  const ws = wb.Sheets['Regulatory & Procurement']
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const table = {}
  for (const row of rows) {
    const name = String(row[0] || '').replace(/\n/g, ' ').trim()
    if (!name) continue
    table[name] = {
      min: parseFloat(row[1]) || 0,
      max: parseFloat(row[2]) || 0,
    }
  }
  return table
}

function parseConstructionTab(wb) {
  const ws = wb.Sheets['Construction Duration']
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const table = []
  for (const row of rows) {
    const name = String(row[0] || '').replace(/\n/g, ' ').trim()
    if (!name || row[0] === row[4] || !row[1]) continue
    if (name.toLowerCase().includes('mandatory') || name.toLowerCase().includes('project type')) continue
    table.push({
      name,
      b0: String(row[1] || '').trim(), // <250m²
      b1: String(row[2] || '').trim(), // 250-500m²
      b2: String(row[3] || '').trim(), // 500-1500m²
      b3: String(row[4] || '').trim(), // 1500-3000m²
    })
  }
  return table
}

function parseProgrammeAssumptions(wb) {
  const ws = wb.Sheets['Programme Assumptions']
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const assumptions = []
  for (const row of rows) {
    const code = String(row[0] || '').trim()
    const text = String(row[1] || '').trim()
    if (code.startsWith('A') && text) assumptions.push(text)
  }
  return assumptions
}

// ─── Construction type selector ───────────────────────────────────────────────

function selectConstructionRow(projectType, specLevel, scopeItems, buildingUse) {
  const pt = projectType.toLowerCase()
  const bu = (buildingUse || '').toLowerCase()
  const scope = (scopeItems || []).map(s => s.toLowerCase())

  const hasLab = scope.some(s => s.includes('lab') || s.includes('clinical') || s.includes('healthcare') || s.includes('data centre'))
  const hasHighSpec = specLevel === 'High'
  const hasFabric = scope.some(s => s.includes('roof') || s.includes('facade') || s.includes('window') || s.includes('waterproof'))
  const hasMeOnly = scope.every(s =>
    s.includes('heating') || s.includes('ventil') || s.includes('electric') || s.includes('plumb') ||
    s.includes('air conditioning') || s.includes('gas') || s.includes('sprinkler') ||
    s.includes('emergency') || s.includes('fire alarm')
  ) && scope.length > 0

  if (pt.includes('new build')) return 'New Build — Standard Commercial'
  if (pt.includes('demolition')) return 'Enabling Works / Demolition Only'
  if (pt.includes('external works')) return 'External Works Only'
  if (pt.includes('renewable')) return 'External Works Only'

  if (pt.includes('extension')) {
    // Determine storeys from building info or scope
    return 'Extension — Single Storey' // default; multi-storey if storeys > 1
  }

  // Refurbishment / Fit-out
  if (hasLab) return 'Specialist Fit-Out — Labs / Healthcare'
  if (pt.includes('fit-out') || pt.includes('fit out')) {
    return hasHighSpec ? 'Internal Fit-Out — Cat B / High Spec' : 'Internal Fit-Out — Basic / Cat A'
  }

  // Refurbishment
  if (hasMeOnly) return 'Refurbishment — M&E Replacement'
  if (hasFabric) return 'Refurbishment — Fabric / Envelope'
  return hasHighSpec ? 'Internal Fit-Out — Cat B / High Spec' : 'Internal Fit-Out — Basic / Cat A'
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function calculateProgramme(answers, costMidpoint) {
  const wb = await fetchProgrammeWorkbook()
  const designTab = parseDesignStageTab(wb)
  const regTab    = parseRegulatoryTab(wb)
  const conTab    = parseConstructionTab(wb)
  const stdAssumptions = parseProgrammeAssumptions(wb)

  const gifa = Number(answers.q1_5_size) || 100
  const projectType = answers.q1_2_projectType || 'Refurbishment'
  const interventionLevel = answers.q2_3_interventionLevel || 'Full refurbishment'
  const scopeItems = answers.q2_2_scopeItems || []
  const knownIssues = answers.q3_1_knownIssues || []
  const age = answers.q1_4_buildingAge || ''
  const occupation = answers.q3_6_occupation || ''
  const accessConstraints = answers.q3_5_accessConstraints || []
  const planningType = answers.q3_4_planningConsents || 'No consent required'
  const specLevel = answers.q2_4_specLevel || 'Standard'

  const dBand = designSizeBand(gifa)
  const cBand = constructionSizeBand(gifa)
  const bandKey = ['small', 'medium', 'large'][dBand]

  // ── Design duration multiplier from Q2.3 ─────────────────────────────────
  let designMultiplier = 1.0
  const lv = interventionLevel.toLowerCase()
  if (lv.includes('light')) designMultiplier = 0.7
  else if (lv.includes('strip')) designMultiplier = 1.3

  // ── Pre-design surveys ─────────────────────────────────────────────────────
  const stages = []
  let surveyWeeks = 0

  const isPreMinus1980 = age.includes('Pre-1900') || age.includes('1900') || age.includes('1945') || age.includes('1980')
  const isPreMinus2000 = isPreMinus1980 || age.includes('1980–2000')
  const hasDemo = scopeItems.some(s => s.toLowerCase().includes('demolition') || s.toLowerCase().includes('structural alterations'))
  const hasAsbestos = knownIssues.some(i => i.toLowerCase().includes('asbestos'))
  const hasStructural = knownIssues.some(i => i.toLowerCase().includes('structural')) ||
                        scopeItems.some(s => s.toLowerCase().includes('structural'))
  const isNewBuild = projectType.toLowerCase().includes('new build')
  const isExtension = projectType.toLowerCase().includes('extension')
  const isRefurb = !isNewBuild && !isExtension && !projectType.toLowerCase().includes('external') &&
                   !projectType.toLowerCase().includes('demolition') && !projectType.toLowerCase().includes('renewable')

  // Asbestos survey
  if (isPreMinus2000 && !isNewBuild) {
    const useRdSurvey = hasDemo || hasAsbestos || isPreMinus1980
    const key = useRdSurvey
      ? 'Asbestos Survey — Refurb / Demolition'
      : 'Asbestos Survey — Management'
    const entry = designTab[key]
    if (entry) {
      const r = parseRange(entry[bandKey])
      const wks = Math.ceil(r.mid)
      surveyWeeks += wks
      stages.push({ stage: 'Asbestos Survey', activity: useRdSurvey ? 'Refurbishment/Demolition Survey' : 'Management Survey', durationWks: wks, notes: 'Pre-design — parallel with mobilisation' })
    }
  }

  // Structural survey
  if (hasStructural && !isNewBuild) {
    const entry = designTab['Structural Survey']
    if (entry) {
      const r = parseRange(entry[bandKey])
      const wks = Math.ceil(r.mid)
      surveyWeeks = Math.max(surveyWeeks, wks) // surveys run in parallel
      stages.push({ stage: 'Structural Survey', activity: 'Independent structural inspection', durationWks: wks, notes: 'Pre-design' })
    }
  }

  // Condition survey (refurb only, no existing documents assumed at Stage 1)
  if (isRefurb) {
    const entry = designTab['Condition Survey']
    if (entry) {
      const r = parseRange(entry[bandKey])
      const wks = Math.ceil(r.mid)
      surveyWeeks = Math.max(surveyWeeks, wks)
      stages.push({ stage: 'Condition Survey', activity: 'Building condition survey', durationWks: wks, notes: 'Pre-design — parallel with other surveys' })
    }
  }

  // Topographic/measured survey (always for new build / extension, conditional for refurb)
  if (isNewBuild || isExtension) {
    const entry = designTab['Topographic / Measured Building Survey']
    if (entry) {
      const r = parseRange(entry[bandKey])
      const wks = Math.ceil(r.mid)
      surveyWeeks = Math.max(surveyWeeks, wks)
      stages.push({ stage: 'Topographic Survey', activity: 'Topographic and measured building survey', durationWks: wks, notes: 'Pre-design' })
    }
  }

  // Ground investigation (new build, extension, brownfield, contaminated)
  const hasBrownfield = knownIssues.some(i => i.toLowerCase().includes('contaminated'))
  if (isNewBuild || isExtension || hasBrownfield) {
    const wks = 4 // midpoint of 3–6 weeks (Ground Investigation row has no data in the sheet)
    surveyWeeks = Math.max(surveyWeeks, wks)
    stages.push({ stage: 'Ground Investigation', activity: 'Ground investigation and geotechnical report', durationWks: wks, notes: 'Pre-design — parallel with other surveys' })
  }

  if (surveyWeeks === 0) surveyWeeks = 0 // No surveys triggered

  // ── Stage 2: Concept Design ────────────────────────────────────────────────
  const s2Entry = designTab['Stage 2 — Concept Design  (includes surveys at start)'] ||
                  designTab[Object.keys(designTab).find(k => k.includes('Stage 2') && k.includes('Concept'))] ||
                  { small: '6 – 8', medium: '8 – 12', large: '12 – 18' }
  const s2Base = parseRange(s2Entry[bandKey])
  let s2Weeks = s2Base.mid * designMultiplier

  // Stage 2 uplifts
  if (hasStructural) {
    const uplift = designTab[Object.keys(designTab).find(k => k.includes('Stage 2 Uplift') && k.includes('Structural'))]
    if (uplift) s2Weeks += parseRange(uplift[bandKey]).mid
  }
  if (age.includes('Pre-1900')) {
    const uplift = designTab[Object.keys(designTab).find(k => k.includes('Stage 2 Uplift') && k.includes('Listed'))]
    if (uplift) s2Weeks += parseRange(uplift[bandKey]).mid
  }
  s2Weeks = Math.ceil(s2Weeks)

  // ── Stage 3: Developed Design ─────────────────────────────────────────────
  const s3Entry = designTab[Object.keys(designTab).find(k => k.includes('Stage 3') && k.includes('Developed'))] ||
                  { small: '5 – 7', medium: '7 – 11', large: '10 – 14' }
  const s3Base = parseRange(s3Entry[bandKey])
  let s3Weeks = s3Base.mid * designMultiplier

  // Stage 3 uplifts
  const meCount = scopeItems.filter(s =>
    ['heating', 'ventil', 'air conditioning', 'electrical', 'plumb', 'sprinkler', 'gas'].some(kw => s.toLowerCase().includes(kw))
  ).length
  if (meCount >= 4) {
    const uplift = designTab[Object.keys(designTab).find(k => k.includes('Stage 3 Uplift') && k.includes('M&E'))]
    if (uplift) s3Weeks += parseRange(uplift[bandKey]).mid
  }
  const hasSpecialist = scopeItems.some(s => s.toLowerCase().includes('lab') || s.toLowerCase().includes('clinical') || s.toLowerCase().includes('data centre'))
  if (hasSpecialist) {
    const uplift = designTab[Object.keys(designTab).find(k => k.includes('Stage 3 Uplift') && k.includes('Specialist'))]
    if (uplift) s3Weeks += parseRange(uplift[bandKey]).mid
  }
  s3Weeks = Math.ceil(s3Weeks)

  // ── Stage 4: Technical Design ─────────────────────────────────────────────
  const s4Entry = designTab[Object.keys(designTab).find(k => k.includes('Stage 4') && k.includes('Technical'))] ||
                  { small: '5 – 8', medium: '8 – 13', large: '12 – 20' }
  const s4Base = parseRange(s4Entry[bandKey])
  let s4Weeks = s4Base.mid * designMultiplier

  if (meCount >= 4 || hasSpecialist) {
    const uplift = designTab[Object.keys(designTab).find(k => k.includes('Stage 4 Uplift'))]
    if (uplift) s4Weeks += parseRange(uplift[bandKey]).mid
  }
  s4Weeks = Math.ceil(s4Weeks)

  // Client gateway (+2 weeks after each stage)
  const gatewayWks = 2

  stages.push({ stage: 'Stage 2', activity: 'Concept Design', durationWks: s2Weeks, notes: 'Includes surveys at start of stage' })
  stages.push({ stage: 'Gateway', activity: 'Client Review — Stage 2', durationWks: gatewayWks, notes: 'Client sign-off' })
  stages.push({ stage: 'Stage 3', activity: 'Developed Design (planning application runs here)', durationWks: s3Weeks, notes: 'Planning application submitted at start' })
  stages.push({ stage: 'Gateway', activity: 'Client Review — Stage 3', durationWks: gatewayWks, notes: 'Client sign-off' })
  stages.push({ stage: 'Stage 4', activity: 'Technical Design (building control submission)', durationWks: s4Weeks, notes: 'Full construction information' })
  stages.push({ stage: 'Gateway', activity: 'Client Review — Stage 4', durationWks: gatewayWks, notes: 'Client sign-off' })

  // ── Planning ───────────────────────────────────────────────────────────────
  let planningWks = 0
  let planningNote = ''
  const pl = planningType.toLowerCase()
  if (pl.includes('full planning') && pl.includes('listed')) {
    const entry = regTab[Object.keys(regTab).find(k => k.includes('Listed Building Consent'))]
    planningWks = entry ? Math.ceil((entry.min + entry.max) / 2) : 10
    planningNote = 'Dual consent — Full Planning and Listed Building Consent run concurrently where possible'
  } else if (pl.includes('full planning')) {
    const entry = regTab[Object.keys(regTab).find(k => k.includes('Full Planning Permission'))]
    planningWks = entry ? Math.ceil((entry.min + entry.max) / 2) : 10
    planningNote = 'Statutory determination period — parallel with Stage 3 design'
  } else if (pl.includes('prior approval')) {
    const entry = regTab[Object.keys(regTab).find(k => k.includes('Prior Approval'))]
    planningWks = entry ? Math.ceil((entry.min + entry.max) / 2) : 6
    planningNote = 'Prior approval — shorter statutory period'
  } else if (pl.includes('change of use')) {
    const entry = regTab[Object.keys(regTab).find(k => k.includes('Change of Use'))]
    planningWks = entry ? Math.ceil((entry.min + entry.max) / 2) : 10
    planningNote = 'Change of use consent — same statutory period as full planning'
  } else if (pl.includes('unsure') || pl.includes('pre-application')) {
    const entry = regTab[Object.keys(regTab).find(k => k.includes('Pre-Application'))]
    planningWks = entry ? Math.ceil((entry.min + entry.max) / 2) : 5
    planningNote = 'Pre-application advice recommended before formal submission'
  }
  // Permitted development / no consent = 0 weeks

  if (planningWks > 0) {
    stages.push({ stage: 'Planning', activity: 'Planning consent determination', durationWks: planningWks, notes: planningNote })
  }

  // ── Building Control ───────────────────────────────────────────────────────
  const hasProgrammePressure = !!(answers.q4_1_targetDate) && answers.q4_1_targetDate !== 'No specific deadline'
  let bcWks = 0
  if (!pl.includes('permitted development') && !pl.includes('no consent')) {
    const bcEntry = hasProgrammePressure
      ? regTab[Object.keys(regTab).find(k => k.includes('Private RBCA'))]
      : regTab[Object.keys(regTab).find(k => k.includes('Local Authority') && k.includes('Full Plans'))]
    if (bcEntry) bcWks = Math.ceil((bcEntry.min + bcEntry.max) / 2)
    else bcWks = 6
  }
  if (bcWks > 0) {
    stages.push({ stage: 'Building Control', activity: hasProgrammePressure ? 'RBCA Full Plans submission' : 'LABC Full Plans submission', durationWks: bcWks, notes: 'Stage 3/4 boundary' })
  }

  // ── Tender / Procurement ──────────────────────────────────────────────────
  const costMid = costMidpoint || 500000
  let tenderWks = 0
  let procurementRoute = 'Traditional (fixed price)'
  let tenderNote = ''
  if (costMid > 100000) {
    const entry = regTab[Object.keys(regTab).find(k => k.includes('Formal Competitive Tender'))]
    tenderWks = entry ? Math.ceil((entry.min + entry.max) / 2) : 11
    tenderNote = 'Formal competitive tender — works cost exceeds £100,000 threshold'
    procurementRoute = 'Traditional — Single Stage Tender'
  } else {
    const entry = regTab[Object.keys(regTab).find(k => k.includes('3 Quotations'))]
    tenderWks = entry ? Math.ceil((entry.min + entry.max) / 2) : 5
    tenderNote = 'Three quotations — works cost under £100,000'
    procurementRoute = 'Direct Award — 3 Quotations'
  }
  stages.push({ stage: 'Tender', activity: procurementRoute, durationWks: tenderWks, notes: tenderNote })

  // ── Construction ───────────────────────────────────────────────────────────
  const conTypeName = selectConstructionRow(projectType, specLevel, scopeItems, answers.q1_3_buildingUse)
  const conRowEntry = conTab.find(r => r.name.toLowerCase().includes(conTypeName.toLowerCase().substring(0, 20)))
  const conBandKeys = ['b0', 'b1', 'b2', 'b3']
  const conRangeStr = conRowEntry ? conRowEntry[conBandKeys[cBand]] : '10 – 16'
  const conRange = parseRange(conRangeStr)
  let conWks = conRange.mid

  // Occupation uplift
  let occupationUplift = 0
  if (occupation.toLowerCase().includes('fully occupied')) occupationUplift = 0.30
  else if (occupation.toLowerCase().includes('partially')) occupationUplift = 0.20

  // Access restriction uplifts
  if (accessConstraints.some(a => a.toLowerCase().includes('term-time'))) conWks *= 1.175
  else if (accessConstraints.some(a => a.toLowerCase().includes('restricted hours'))) conWks *= 1.125

  conWks = Math.ceil(conWks * (1 + occupationUplift))
  stages.push({ stage: 'Construction', activity: `RIBA Stage 5 — ${conTypeName}`, durationWks: conWks, notes: occupationUplift > 0 ? `Uplift applied: ${Math.round(occupationUplift * 100)}% for occupied works` : 'Full decant / vacant — no uplift' })

  // ── Handover ──────────────────────────────────────────────────────────────
  const hoRange = conTab.find(r => r.name.toLowerCase().includes('handover'))
  const hoStr = hoRange ? hoRange[conBandKeys[Math.min(cBand, 3)]] : '2 – 4'
  const hoWks = Math.ceil(parseRange(hoStr).mid)
  stages.push({ stage: 'Handover', activity: 'RIBA Stage 6 — Commissioning, snagging, Practical Completion', durationWks: hoWks, notes: 'Defects liability period begins at Practical Completion' })

  // ── Totals ────────────────────────────────────────────────────────────────
  const designWeeks = s2Weeks + gatewayWks + s3Weeks + gatewayWks + s4Weeks + gatewayWks
  const totalWeeks = surveyWeeks + designWeeks + tenderWks + conWks + hoWks

  // ── Target date feasibility ───────────────────────────────────────────────
  let targetStatus = 'no-date'
  let targetNote = 'No target completion date has been specified.'
  const targetDate = answers.q4_1_targetDate

  if (targetDate && targetDate !== 'No specific deadline') {
    const target = new Date(targetDate)
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

  // Build milestones list
  const milestones = [
    'Week 0: Project Start — Stage 1 Gateway approval',
  ]
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
    targetStatus,
    targetNote,
    procurementRoute,
    milestones,
    standardAssumptions: stdAssumptions,
    occupationUplift: Math.round(occupationUplift * 100),
    constructionType: conTypeName,
  }
}
