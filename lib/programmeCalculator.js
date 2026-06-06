/**
 * programmeCalculator.js — Deterministic RIBA programme engine.
 * All durations and uplifts come from Estates_AI_Programme_v4_3.xlsx (ID-keyed, 6-band S1–S6).
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

// ─── Size band ────────────────────────────────────────────────────────────────

function sizeBand(gifa) {
  if (gifa < 150)  return 'S1'
  if (gifa <= 250) return 'S2'
  if (gifa <= 500) return 'S3'
  if (gifa <= 1500) return 'S4'
  if (gifa <= 3000) return 'S5'
  return 'S6'
}

// ─── Tab parsers ──────────────────────────────────────────────────────────────

/**
 * Durations sheet — ID-keyed, cols: ID, Phase, Activity, S1_Lo, S1_Hi, S2_Lo, S2_Hi, …
 * Returns { [id]: { activity, S1:{lo,hi}, S2:{lo,hi}, … } }
 */
function parseDurationsTab(wb) {
  const ws = wb.Sheets['Durations']
  if (!ws) throw new Error('Programme workbook missing "Durations" sheet')
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const table = {}
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const id = String(r[0] || '').trim()
    if (!id || id.length > 20) continue  // skip section header rows
    table[id] = {
      id,
      activity: String(r[2] || '').trim(),
      S1: { lo: Number(r[3]) || 0, hi: Number(r[4]) || 0 },
      S2: { lo: Number(r[5]) || 0, hi: Number(r[6]) || 0 },
      S3: { lo: Number(r[7]) || 0, hi: Number(r[8]) || 0 },
      S4: { lo: Number(r[9]) || 0, hi: Number(r[10]) || 0 },
      S5: { lo: Number(r[11]) || 0, hi: Number(r[12]) || 0 },
      S6: { lo: Number(r[13]) || 0, hi: Number(r[14]) || 0 },
    }
  }
  return table
}

/**
 * Construction sheet — ID-keyed, same S1–S6 band structure.
 * Returns { [id]: { name, S1:{lo,hi}, …, S6:{lo,hi} } }
 */
function parseConstructionTab(wb) {
  const ws = wb.Sheets['Construction']
  if (!ws) throw new Error('Programme workbook missing "Construction" sheet')
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const table = {}
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const id = String(r[0] || '').trim()
    if (!id) continue
    table[id] = {
      id,
      name: String(r[1] || '').trim(),
      S1: { lo: Number(r[2]) || 0,  hi: Number(r[3]) || 0 },
      S2: { lo: Number(r[4]) || 0,  hi: Number(r[5]) || 0 },
      S3: { lo: Number(r[6]) || 0,  hi: Number(r[7]) || 0 },
      S4: { lo: Number(r[8]) || 0,  hi: Number(r[9]) || 0 },
      S5: { lo: Number(r[10]) || 0, hi: Number(r[11]) || 0 },
      S6: { lo: Number(r[12]) || 0, hi: Number(r[13]) || 0 },
    }
  }
  return table
}

/**
 * Modifiers sheet — ID-keyed.
 * Returns { [id]: { modifier, type, value } }
 */
function parseModifiersTab(wb) {
  const ws = wb.Sheets['Modifiers']
  if (!ws) throw new Error('Programme workbook missing "Modifiers" sheet')
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const table = {}
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const id = String(r[0] || '').trim()
    if (!id) continue
    table[id] = { id, modifier: String(r[1] || '').trim(), type: String(r[3] || '').trim(), value: r[4] }
  }
  return table
}

// ─── Mid-point helpers ────────────────────────────────────────────────────────

function bandMid(entry, band) {
  if (!entry || !entry[band]) return 0
  const { lo, hi } = entry[band]
  if (!lo && !hi) {
    // Only fall back for S5/S6 where cells may be blank (e.g. CX1 — extension doesn't apply at very large scale).
    // S1–S4 zeros are intentional (e.g. GW3 = 0 for small projects) and must not be overridden.
    if (band !== 'S5' && band !== 'S6') return 0
    const fallbackOrder = ['S4', 'S3', 'S2', 'S1']
    for (const fb of fallbackOrder) {
      const fbv = entry[fb]
      if (fbv && (fbv.lo || fbv.hi)) return (fbv.lo + fbv.hi) / 2
    }
    return 0
  }
  return (lo + hi) / 2
}

// ─── Modifier lookups ─────────────────────────────────────────────────────────

function getDesignMultiplier(modTab, answers) {
  const pt = (answers.q1_2_projectType || '').toLowerCase()
  if (pt.includes('new build') || pt.includes('external') || pt.includes('demolition')) {
    return Number(modTab['Q23-NB']?.value) || 1.0
  }
  const iv = (answers.q2_3_interventionLevel || '').toLowerCase()
  if (iv.includes('fabric'))          return Number(modTab['Q23-1']?.value) || 0.5
  if (iv.includes('minor'))           return Number(modTab['Q23-2']?.value) || 0.7
  if (iv.includes('reconfiguration')) return Number(modTab['Q23-4']?.value) || 1.3
  return Number(modTab['Q23-3']?.value) || 1.0
}

function getOccupationUplift(modTab, occupation) {
  const occ = occupation.toLowerCase()
  if (occ.includes('fully occupied')) return Number(modTab['OCC-1']?.value) || 0.30
  if (occ.includes('partial'))        return Number(modTab['OCC-2']?.value) || 0.20
  return 0
}

function getAccessUplift(modTab, accessConstraints) {
  const ac = accessConstraints.map(a => a.toLowerCase())
  const acc2Triggers = ['no vehicle access', 'term-time']
  const acc1Triggers = ['restricted', 'shared access', 'height', 'scaffold']
  if (ac.some(a => acc2Triggers.some(t => a.includes(t))))
    return Number(modTab['ACC-2']?.value) || 0.175
  if (ac.some(a => acc1Triggers.some(t => a.includes(t))))
    return Number(modTab['ACC-1']?.value) || 0.10
  return 0
}

function getGrantGovernanceWeeks(modTab) {
  const raw = String(modTab['FN-1']?.value || '4-8')
  const parts = raw.split('-').map(Number).filter(Boolean)
  return parts.length === 2 ? Math.round((parts[0] + parts[1]) / 2) : 6
}

// ─── Construction type selector ───────────────────────────────────────────────

function selectConstructionId(projectType, specLevel, scopeItems, storeys, buildingUse) {
  const pt    = projectType.toLowerCase()
  const bu    = (buildingUse || '').toLowerCase()
  const scope = (scopeItems || []).map(s => String(s).toLowerCase())
  const hasHighSpec = specLevel === 'High'

  if (pt.includes('new build')) {
    if (bu.includes('healthcare') || bu.includes('clinical')) return 'CN2'
    if (bu.includes('industrial') || bu.includes('warehouse')) return 'CN3'
    return 'CN1'
  }
  if (pt.includes('demolition'))     return 'CD1'
  if (pt.includes('external works')) return 'CE1'
  if (pt.includes('extension'))
    return (Number(storeys) > 1) ? 'CX2' : 'CX1'

  const hasLab = scope.some(s =>
    s === '4.4' || s.includes('lab') || s.includes('clinical') ||
    s.includes('healthcare') || s.includes('data centre'))
  if (hasLab) return 'CS1'

  if (pt.includes('fit-out') || pt.includes('fit out'))
    return hasHighSpec ? 'CF1' : 'CF2'

  const isMeCode    = s => /^5\./.test(s)
  const isMeKeyword = s =>
    s.includes('heating') || s.includes('ventil') || s.includes('electric') ||
    s.includes('plumb')   || s.includes('air conditioning') || s.includes('gas') ||
    s.includes('sprinkler') || s.includes('emergency') || s.includes('fire alarm')
  if (scope.filter(s => isMeCode(s) || isMeKeyword(s)).length >= 3) return 'CR1'

  const hasFabric = scope.some(s =>
    /^2\./.test(s) || s.includes('roof') || s.includes('facade') ||
    s.includes('window') || s.includes('waterproof'))
  if (hasFabric) return 'CR2'

  return hasHighSpec ? 'CF1' : 'CF2'
}

// ─── Programme assumptions ────────────────────────────────────────────────────

function buildProgrammeAssumptions(answers, result) {
  const occupation  = answers.q3_6_occupation || ''
  const gifa        = Number(answers.q1_5_size) || 100
  const projectType = answers.q1_2_projectType || 'Refurbishment'
  const { tenderWeeks, costMidPoint, occupationUplift } = result

  let occupationNote = 'No occupation uplift applied — building vacant or not applicable.'
  if (occupation.toLowerCase().includes('fully occupied'))
    occupationNote = `A ${Math.round(occupationUplift * 100)}% construction duration uplift has been applied for full occupation — phasing, noise and dust management, and increased supervision.`
  else if (occupation.toLowerCase().includes('partial'))
    occupationNote = `A ${Math.round(occupationUplift * 100)}% construction duration uplift has been applied for partial occupation — section-by-section handover and phased access.`

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

// ─── Main export ──────────────────────────────────────────────────────────────

export async function calculateProgramme(answers, costMidpoint) {
  const wb     = await fetchProgrammeWorkbook()
  const durTab = parseDurationsTab(wb)
  const conTab = parseConstructionTab(wb)
  const modTab = parseModifiersTab(wb)

  const gifa              = Number(answers.q1_5_size) || 100
  const projectType       = answers.q1_2_projectType || 'Refurbishment'
  const interventionLevel = answers.q2_3_interventionLevel || 'Full systems replacement'
  const scopeItems        = answers.q2_2_scopeItems || []
  const knownIssues       = answers.q3_1_knownIssues || []
  const age               = answers.q1_4_buildingAge || ''
  const occupation        = answers.q3_6_occupation || ''
  const accessConstraints = answers.q3_5_accessConstraints || []
  const planningType      = answers.q3_4_planningConsents || 'No consent required'
  const specLevel         = answers.q2_4_specLevel || 'Standard'

  const band = sizeBand(gifa)

  // Design multiplier from Modifiers sheet (owned by Programme, not NRM1)
  const designMultiplier = getDesignMultiplier(modTab, answers)

  // Helper: mid-point for a Durations ID at current band
  const dur = (id, fallback = 0) => {
    const entry = durTab[id]
    if (!entry) return fallback
    return bandMid(entry, band) || fallback
  }

  // Helper: mid-point for a Construction ID at current band
  const conDur = (id, fallback = 10) => {
    const entry = conTab[id]
    if (!entry) return fallback
    return bandMid(entry, band) || fallback
  }

  // ── Derived flags ────────────────────────────────────────────────────────────
  const isPreMinus1980 = age.includes('Pre-1900') || age.includes('1900') || age.includes('1945') || age.includes('1980')
  const isPreMinus2000 = isPreMinus1980 || age.includes('1980–2000') || age.includes('1980-2000')
  const hasDemo       = scopeItems.some(s => s === '0.2' || String(s).toLowerCase().includes('demolition') || String(s).toLowerCase().includes('structural alterations'))
  const hasAsbestos   = knownIssues.some(i => i.toLowerCase().includes('asbestos'))
  const hasStructural = knownIssues.some(i => i.toLowerCase().includes('structural')) ||
                        scopeItems.some(s => s === '7.1' || String(s).toLowerCase().includes('structural'))
  const isNewBuild    = projectType.toLowerCase().includes('new build')
  const isExtension   = projectType.toLowerCase().includes('extension')
  const isRefurb      = !isNewBuild && !isExtension &&
                        !projectType.toLowerCase().includes('external') &&
                        !projectType.toLowerCase().includes('demolition') &&
                        !projectType.toLowerCase().includes('renewable')

  // ── Pre-design surveys ───────────────────────────────────────────────────────
  const stages = []
  let surveyWeeks = 0

  if (isPreMinus2000 && !isNewBuild) {
    const useRd = hasDemo || hasAsbestos || isPreMinus1980
    const id    = useRd ? 'SV2' : 'SV1'
    const wks   = Math.ceil(dur(id, 2))
    surveyWeeks = Math.max(surveyWeeks, wks)
    stages.push({ stage: 'Asbestos Survey', activity: useRd ? 'Refurbishment/Demolition Survey' : 'Management Survey', weeks: wks, notes: 'Pre-design — parallel with Stage 2–3' })
  }

  if (hasStructural && !isNewBuild) {
    const wks = Math.ceil(dur('SV3', 2))
    surveyWeeks = Math.max(surveyWeeks, wks)
    stages.push({ stage: 'Structural Survey', activity: 'Independent structural inspection', weeks: wks, notes: 'Pre-design — parallel with Stage 2–3' })
  }

  if (isRefurb) {
    const wks = Math.ceil(dur('SV4', 2))
    surveyWeeks = Math.max(surveyWeeks, wks)
    stages.push({ stage: 'Condition Survey', activity: 'Building condition survey', weeks: wks, notes: 'Pre-design — parallel with other surveys' })
  }

  if (isNewBuild || isExtension) {
    const wks = Math.ceil(dur('SV5', 2))
    surveyWeeks = Math.max(surveyWeeks, wks)
    stages.push({ stage: 'Topographic Survey', activity: 'Topographic and measured building survey', weeks: wks, notes: 'Pre-design' })
  }

  const hasBrownfield = knownIssues.some(i => i.toLowerCase().includes('contaminated'))
  if (isNewBuild || isExtension || hasBrownfield) {
    const wks = Math.ceil(dur('SV6', 4))
    surveyWeeks = Math.max(surveyWeeks, wks)
    stages.push({ stage: 'Ground Investigation', activity: 'Ground investigation and geotechnical report', weeks: wks, notes: 'Pre-design — parallel with other surveys' })
  }

  // ── Design stages ────────────────────────────────────────────────────────────
  const meCount = scopeItems.filter(s =>
    /^5\./.test(String(s)) ||
    ['heating', 'ventil', 'air conditioning', 'electrical', 'plumb', 'sprinkler', 'gas']
      .some(kw => String(s).toLowerCase().includes(kw))
  ).length
  const hasSpecialist = scopeItems.some(s =>
    s === '4.4' || s === '6.2' ||
    String(s).toLowerCase().includes('lab') || String(s).toLowerCase().includes('clinical') || String(s).toLowerCase().includes('data centre'))

  // Stage 2
  let s2Weeks = dur('DS2', 3) * designMultiplier
  if (hasStructural)             s2Weeks += dur('DS2a', 0)
  if (age.includes('Pre-1900'))  s2Weeks += dur('DS2b', 0)
  s2Weeks = Math.ceil(s2Weeks)

  // Stage 3
  let s3Weeks = dur('DS3', 5) * designMultiplier
  if (meCount >= 4)   s3Weeks += dur('DS3a', 0)
  if (hasSpecialist)  s3Weeks += dur('DS3b', 0)
  s3Weeks = Math.ceil(s3Weeks)

  // Stage 4
  let s4Weeks = dur('DS4', 5) * designMultiplier
  if (meCount >= 4 || hasSpecialist) s4Weeks += dur('DS4a', 0)
  s4Weeks = Math.ceil(s4Weeks)

  // Gateways — read from workbook; GW3 is 0 for S1/S2 (workbook encodes this)
  const gatewayWks  = Math.ceil(dur('GW', 2))
  const gateway3Wks = Math.ceil(dur('GW3', 0))  // 0 for S1/S2, 2 for S3+

  stages.push({ stage: 'Stage 2',  activity: 'Concept Design', weeks: s2Weeks, notes: 'Includes surveys at start of stage' })
  stages.push({ stage: 'Gateway',  activity: 'Client Review — Stage 2', weeks: gatewayWks, notes: 'Client sign-off' })
  stages.push({ stage: 'Stage 3',  activity: 'Developed Design — planning application submitted at start of stage', weeks: s3Weeks, notes: 'Planning application submitted at start; determination runs in parallel' })

  // ── Planning (parallel with Stage 3) ─────────────────────────────────────────
  let planningWks  = 0
  let planningNote = ''
  const pl = planningType.toLowerCase()

  if (pl.includes('full planning') && pl.includes('listed')) {
    // Combined: use the longer of PL1/PL2 (both are same in v4.3, use PL1)
    planningWks  = Math.ceil(dur('PL1', 11))
    planningNote = 'Dual consent — Full Planning and Listed Building Consent run concurrently where possible; parallel with Stage 3 design'
  } else if (pl.includes('full planning')) {
    planningWks  = Math.ceil(dur('PL1', 11))
    planningNote = 'Statutory 8-week determination period — parallel with Stage 3 design'
  } else if (pl.includes('prior approval')) {
    planningWks  = Math.ceil(dur('PL3', 6))
    planningNote = 'Prior approval — shorter statutory period; parallel with Stage 3 design'
  } else if (pl.includes('change of use')) {
    planningWks  = Math.ceil(dur('PL4', 11))
    planningNote = 'Change of use consent — same statutory period as full planning; parallel with Stage 3 design'
  } else if (pl.includes('unsure') || pl.includes('pre-application')) {
    planningWks  = Math.ceil(dur('PL5', 5))
    planningNote = 'Pre-application advice recommended before formal submission; parallel with Stage 3 design'
  }

  const planningOverrunWks = planningWks > 0 ? Math.max(0, planningWks - s3Weeks) : 0

  if (planningWks > 0) {
    stages.push({ stage: 'Planning', activity: 'Planning consent determination (parallel with Stage 3)', weeks: planningWks, notes: planningNote })
    if (planningOverrunWks > 0) {
      stages.push({ stage: 'Planning — wait', activity: 'Awaiting LPA determination — Stage 4 on hold', weeks: planningOverrunWks,
        notes: `Planning determination extends ${planningOverrunWks} wk(s) beyond Stage 3. Stage 4 cannot start until consent is received.` })
    }
  }

  if (gateway3Wks > 0) {
    stages.push({ stage: 'Gateway', activity: 'Client Review — Stage 3', weeks: gateway3Wks, notes: 'Client sign-off' })
  }
  stages.push({ stage: 'Stage 4', activity: 'Technical Design — building control submission at start of stage', weeks: s4Weeks, notes: 'Full construction information; BC runs in parallel' })

  // ── Building Control (parallel with Stage 4) ──────────────────────────────────
  let bcWks = 0
  if (!pl.includes('permitted development') && !pl.includes('no consent')) {
    bcWks = Math.ceil(dur('BC1', 7))
    stages.push({ stage: 'Building Control', activity: 'LABC Full Plans submission (parallel with Stage 4)', weeks: bcWks,
      notes: 'Runs in parallel with Stage 4. Private RBCA (3–5 wks) is an option for programme-critical projects.' })
  }
  const bcOverrunWks = Math.max(0, bcWks - s4Weeks)
  if (bcOverrunWks > 0) {
    stages.push({ stage: 'Building Control — wait', activity: 'Awaiting BC approval — tender on hold', weeks: bcOverrunWks,
      notes: `BC approval extends ${bcOverrunWks} wk(s) beyond Stage 4. Tender cannot start until approval received.` })
  }

  stages.push({ stage: 'Gateway', activity: 'Client Review — Stage 4', weeks: gatewayWks, notes: 'Client sign-off' })

  // ── Tender / Procurement ──────────────────────────────────────────────────────
  const costMid         = costMidpoint || 500000
  const tenderWks       = Math.round(costMid >= 100000 ? dur('TN1', 12) : dur('TN2', 5))
  const procurementRoute = costMid >= 100000 ? 'Traditional — Single Stage Tender' : 'Direct Award — 3 Quotations'
  const tenderNote      = costMid >= 100000
    ? `Formal competitive tender — works cost exceeds £100,000 threshold (${tenderWks} weeks)`
    : `Three quotations — works cost under £100,000 (${tenderWks} weeks)`
  stages.push({ stage: 'Tender / Procurement', activity: procurementRoute, weeks: tenderWks, notes: tenderNote })

  // ── Construction ──────────────────────────────────────────────────────────────
  const conId       = selectConstructionId(projectType, specLevel, scopeItems, answers.q1_2_storeys, answers.q1_3_buildingUse)
  const conName     = conTab[conId]?.name || conId
  let   conWks      = conDur(conId, 16)

  // Access uplift — applies highest applicable tier only (ACC-1 or ACC-2, not stacked)
  const accessUplift    = getAccessUplift(modTab, accessConstraints)
  // Occupation uplift from Modifiers sheet
  const occupationUplift = getOccupationUplift(modTab, occupation)

  conWks = Math.ceil(conWks * (1 + accessUplift) * (1 + occupationUplift))

  let occupationNote = ''
  if (occupationUplift > 0)
    occupationNote = `${Math.round(occupationUplift * 100)}% uplift for occupation; ${Math.round(accessUplift * 100)}% for access constraints`
  else if (accessUplift > 0)
    occupationNote = `${Math.round(accessUplift * 100)}% uplift for access constraints`

  stages.push({ stage: 'Construction', activity: `RIBA Stage 5 — ${conName}`, weeks: conWks,
    notes: occupationNote || 'Full decant / vacant — no uplift' })

  // ── Handover ──────────────────────────────────────────────────────────────────
  const hoWks = Math.ceil(conDur('CH1', 3))
  stages.push({ stage: 'Handover', activity: 'RIBA Stage 6 — Commissioning, snagging, Practical Completion', weeks: hoWks,
    notes: 'Defects liability period begins at Practical Completion' })

  // ── Phased delivery — read uplift from Modifiers PH-1 ────────────────────────
  const phasingAnswer    = answers.q4_6_phasing || 'Single phase'
  let phasingNote        = ''
  let phasingExtraWks    = 0
  if (phasingAnswer.toLowerCase().includes('multiple')) {
    const phUplift     = Number(modTab['PH-1']?.value) || 0.15
    phasingExtraWks    = Math.ceil(conWks * (1 + phUplift) + 4) // subsequent phase + re-mobilisation
    phasingNote        = `Multiple phases: construction shown (${conWks} wks) is per phase. Allow an additional ${phasingExtraWks} weeks for subsequent phase(s) including re-mobilisation. Phase split to be confirmed at Stage 2.`
    stages.push({ stage: 'Phase 2+ Construction', activity: 'Subsequent phases — construction and re-mobilisation', weeks: phasingExtraWks, notes: 'Phase sizes assumed equal at Stage 0–1. Confirm split at Stage 2.' })
  }

  // ── Funding governance — read from Modifiers FN-1 ────────────────────────────
  const fundingSource      = answers.q4_7_funding || ''
  let grantGovernanceWks   = 0
  let procurementNote      = ''
  if (fundingSource.toLowerCase().includes('grant') || fundingSource.toLowerCase().includes('public')) {
    grantGovernanceWks = getGrantGovernanceWeeks(modTab)
    procurementNote    = 'Grant or public funding — formal competitive procurement required regardless of value.'
    stages.push({ stage: 'Governance', activity: 'Grant governance approval', weeks: grantGovernanceWks, notes: procurementNote })
  }

  // ── Totals ─────────────────────────────────────────────────────────────────────
  // Surveys run concurrently with design (do not extend total); planningOverrun and bcOverrun are sequential waits
  const designWeeks = s2Weeks + gatewayWks + s3Weeks + gateway3Wks + s4Weeks + gatewayWks
  const totalWeeks  = designWeeks + planningOverrunWks + bcOverrunWks + tenderWks + conWks + phasingExtraWks + hoWks + grantGovernanceWks

  // ── Target date feasibility ───────────────────────────────────────────────────
  let targetStatus = 'no-date'
  let targetNote   = 'No target completion date has been specified.'
  const targetDate = answers.q4_1_targetDate

  if (targetDate && targetDate !== 'No specific deadline') {
    const target   = new Date(targetDate)
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
  const milestones = [
    surveyWeeks > 0
      ? 'Week 0: Project Start — Stage 2 commences; pre-design surveys commissioned in parallel'
      : 'Week 0: Project Start — Stage 2 commences'
  ]
  if (surveyWeeks > 0) milestones.push(`Week ${surveyWeeks}: Pre-design surveys complete (concurrent with Stage 2)`)
  let w = 0
  w += s2Weeks
  milestones.push(`Week ${w}: Stage 2 Concept Design complete`)
  w += gatewayWks + s3Weeks
  milestones.push(`Week ${w}: Stage 3 Developed Design complete — Planning decision expected`)
  w += planningOverrunWks + gateway3Wks + s4Weeks + bcOverrunWks + gatewayWks + grantGovernanceWks
  milestones.push(`Week ${w}: Stage 4 Technical Design complete — Tender issued`)
  w += tenderWks
  milestones.push(`Week ${w}: Contractor appointed — construction commences`)
  w += conWks + phasingExtraWks
  milestones.push(`Week ${w}: Practical Completion`)
  w += hoWks
  milestones.push(`Week ${w}: Project Close-out — Defects liability period begins`)

  milestones.sort((a, b) => {
    const wa = parseInt(a.match(/^Week (\d+)/)?.[1] ?? '0', 10)
    const wb = parseInt(b.match(/^Week (\d+)/)?.[1] ?? '0', 10)
    return wa - wb
  })

  const assumptions = buildProgrammeAssumptions(answers, {
    totalWeeks, constructionWeeks: conWks, procurementRoute,
    tenderWeeks: tenderWks, costMidPoint: costMid, occupationUplift,
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
    accessUplift: Math.round(accessUplift * 100),
    constructionType: conName,
    grantGovernanceWeeks: grantGovernanceWks,
    procurementNote,
    phasingNote,
    phasingExtraWeeks: phasingExtraWks,
    designMultiplier,
    sizeBandUsed: band,
  }
}
