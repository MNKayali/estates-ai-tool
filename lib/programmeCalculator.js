/**
 * programmeCalculator.js — Deterministic RIBA programme engine.
 * All durations and uplifts come from Estates_AI_Programme_v4_3.xlsx (ID-keyed, 6-band S1–S6).
 * The AI never touches these numbers.
 */
import * as XLSX from 'xlsx'
import { countMeItems } from './buildingUse.js'
import { hasSiteContext, isHigherRiskBuilding } from './siteContext.js'

let _cache = { wb: null, fetchedAt: 0 }

// Exported so /api/rates-check can share this cache rather than opening its own
// uncached download of the same file on every health check.
export async function fetchProgrammeWorkbook() {
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

// Workbook self-identification from the README sheet ("Version | v4.3 · June
// 2026 · ..."). Printed in the report's Estimate Basis for traceability.
function parseWorkbookVersion(wb) {
  try {
    const ws = wb.Sheets['README']
    if (!ws) return null
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    const row = rows.find(r => String(r[0] || '').trim().toLowerCase() === 'version')
    if (!row) return null
    const text = String(row[1] || '')
    const version = text.match(/v[\d][\d.]*/i)?.[0]
    const date = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/)?.[0]
    if (!version) return null
    return `Programme ${version}${date ? ` (${date})` : ''}`
  } catch {
    return null
  }
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

/**
 * FastTrack sheet — one row per acceleration lever. Cols: LeverID, Lever,
 * Trigger (when offered), Action on programme, Approx weeks saved, Trade-off.
 * Returns [] when the sheet is absent. FT1 (start point) is applied to the
 * headline programme elsewhere; the rest are OFFERED, never applied — the
 * report lists the ones whose trigger fires so the client can choose.
 */
function parseFastTrackTab(wb) {
  const ws = wb.Sheets['FastTrack']
  if (!ws) return []
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const levers = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const id = String(r[0] || '').trim()
    if (!/^FT\d+$/i.test(id)) continue
    levers.push({
      id: id.toUpperCase(),
      lever:      String(r[1] || '').trim(),
      trigger:    String(r[2] || '').trim(),
      action:     String(r[3] || '').trim(),
      weeksSaved: String(r[4] || '').trim(),
      tradeOff:   String(r[5] || '').trim(),
    })
  }
  return levers
}

/**
 * Procurement sheet — the decision table that picks route, contract form,
 * tender type and tender duration from the client's primary priority (Q4.4
 * first tick), the cost mid-point and the design stage reached. First
 * matching row wins, so the workbook orders rows specific → general.
 * Cols: Rule, Primary priority, Cost mid ≥ £, Cost mid < £, Design stage
 * reached, Route, Contract form, Tender type, Tender ID, Design
 * responsibility, Rationale. Returns [] when the sheet is absent, in which
 * case calculateProgramme falls back to the value-only logic it always had.
 */
function parseProcurementTab(wb) {
  const ws = wb.Sheets['Procurement']
  if (!ws) return []
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const table = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const rule = String(r[0] || '').trim()
    const route = String(r[5] || '').trim()
    if (!rule || !route) continue
    const num = v => { const n = Number(String(v).replace(/[£,\s]/g, '')); return Number.isFinite(n) && String(v).trim() !== '' ? n : null }
    table.push({
      rule,
      priority:     String(r[1] || 'Any').trim() || 'Any',
      minCost:      num(r[2]),
      maxCost:      num(r[3]),
      stage:        String(r[4] || 'Any').trim() || 'Any',
      route,
      contractForm: String(r[6] || '').trim(),
      tenderType:   String(r[7] || '').trim(),
      tenderId:     String(r[8] || '').trim().toUpperCase(),
      designResp:   String(r[9] || '').trim(),
      rationale:    String(r[10] || '').trim(),
    })
  }
  return table
}

// Stage number from a Q4.5 answer or a sheet token ("Stage 4", "Concept
// complete (Stage 2)"). null when none is named.
function stageNumber(text) {
  const m = String(text || '').toLowerCase().match(/stage\s*(\d)/)
  return m ? Number(m[1]) : null
}

function selectProcurementRow(table, primaryPriority, costMid, designStage) {
  const answered = stageNumber(designStage) ?? 0
  const prio = String(primaryPriority || '').trim().toLowerCase()
  for (const row of table) {
    const rowPrio = row.priority.toLowerCase()
    if (rowPrio !== 'any' && rowPrio !== prio) continue
    if (row.minCost != null && costMid < row.minCost) continue
    if (row.maxCost != null && costMid >= row.maxCost) continue
    if (row.stage.toLowerCase() !== 'any') {
      const need = stageNumber(row.stage)
      if (need != null && answered < need) continue
    }
    return row
  }
  return null
}

// PROG-FLOAT "+1 wk per 13 wks" → 13. 0 when the row is absent or unparseable
// (no float applied — the pre-September-2026 behaviour).
function getFloatEveryWeeks(modTab) {
  const raw = String(modTab['PROG-FLOAT']?.value || '')
  const m = raw.match(/per\s*(\d+)/i)
  return m ? Number(m[1]) : 0
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

function selectConstructionId(projectType, specLevel, scopeItems, storeys, buildingUse, interventionLevel, meItemCount) {
  const pt    = projectType.toLowerCase()
  const bu    = (buildingUse || '').toLowerCase()
  const il    = (interventionLevel || '').toLowerCase()
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

  // Fabric/finishes-only or minor services → always CF2 (not M&E Replacement)
  if (il.includes('fabric and finishes') || il.includes('finishes with minor')) return 'CF2'

  // Exclude 5.20 (BWIC — auto-added whenever any Group 5 item is present, not a standalone system)
  const isMeCode    = s => /^5\./.test(s) && s !== '5.20'
  const isMeKeyword = s =>
    s.includes('heating') || s.includes('ventil') || s.includes('electric') ||
    s.includes('plumb')   || s.includes('air conditioning') || s.includes('gas') ||
    s.includes('sprinkler') || s.includes('emergency') || s.includes('fire alarm')
  // NRM1 v5.2: one item (Heating and hot water) replaces three v4.5 codes, so
  // the scope engine's own Group 5 item count is used when it is given.
  const meTotal = meItemCount ?? scope.filter(s => isMeCode(s) || isMeKeyword(s)).length
  if (meTotal >= 3) return 'CR1'

  const hasFabric = scope.some(s =>
    /^2\./.test(s) || s.includes('roof') || s.includes('facade') ||
    s.includes('window') || s.includes('waterproof'))
  if (hasFabric) return 'CR2'

  // Group 1 (1.1–1.4 substructure) has no test above and falls through to
  // here. That was previously unreachable for any project type able to price
  // it — New Build and Extension both return earlier, and every other type
  // had substructure hidden by priceableFor(). The project-type-axis slice
  // makes group 1 reachable on "Other or mixed" via the new-build rate
  // fallback (lib/projectTypes.js), so a mixed project with foundations now
  // lands here and gets a Fit-Out — Basic/Cat A construction duration: the
  // Construction sheet has no row for a mixed project (only CN/CX/CR/CF/CS/
  // CE/CD), and inventing one in code would violate the no-numbers-in-code
  // rule. Recorded as a known gap, not fixed — see CLAUDE.md and the spec's
  // "Not in this slice" table.
  return hasHighSpec ? 'CF1' : 'CF2'
}

// ─── Programme assumptions ────────────────────────────────────────────────────

function buildProgrammeAssumptions(answers, result) {
  const occupation  = answers.q3_6_occupation || ''
  const gifa        = Number(answers.q1_5_size) || 100
  const projectType = answers.q1_2_projectType || 'Refurbishment'
  const {
    tenderWeeks, costMidPoint, occupationUplift, accessUplift,
    planningRequired, bcRequired, surveyWeeks, s2Done, startStageLabel,
    floatWeeks = 0, floatEvery = 0, totalWeeksBestCase, procRow, primaryPriority,
    startDateAssumed = true, startLabel = 'the report date',
  } = result

  let occupationNote = 'No occupation uplift applied — building vacant or not applicable.'
  if (occupation.toLowerCase().includes('fully occupied'))
    occupationNote = `A ${Math.round(occupationUplift * 100)}% construction duration uplift has been applied for full occupation — phasing, noise and dust management, and increased supervision.`
  else if (occupation.toLowerCase().includes('partial'))
    occupationNote = `A ${Math.round(occupationUplift * 100)}% construction duration uplift has been applied for partial occupation — section-by-section handover and phased access.`

  // Access-constraint uplift (ACC-1/ACC-2 from the Modifiers sheet) was applied
  // to construction duration exactly like the occupation uplift above, but was
  // only ever surfaced in the Construction stage's own row notes — never in
  // this assumptions list, so a report could show a 30% occupation uplift here
  // and nowhere mention the access-constraint uplift that was also applied.
  const accessNote = accessUplift > 0
    ? `A ${Math.round(accessUplift * 100)}% construction duration uplift has been applied for access constraints (Q3.5) — the highest single applicable tier only; access-constraint uplifts are never stacked with each other.`
    : 'No access-constraint uplift applied — no qualifying restriction was identified from Q3.5.'

  const costMid = costMidPoint || 500000
  const procNote = procRow
    ? `Procurement route selected from the Procurement decision table (rule ${procRow.rule}): ${procRow.route}, ${procRow.contractForm}, ${procRow.tenderType || 'tender type as stated'} — chosen for a £${Math.round(costMid / 1000)}k mid-point${primaryPriority ? ` and a primary priority of "${primaryPriority}"` : ''}. ${procRow.rationale}`.trim()
    : costMid >= 100000
      ? `Procurement threshold rule: total project cost mid-point (£${Math.round(costMid / 1000)}k) exceeds £100,000 — formal competitive tender of approximately ${tenderWeeks} weeks applied.`
      : `Procurement threshold rule: total project cost mid-point (£${Math.round(costMid / 1000)}k) is below £100,000 — three competitive quotations, approximately ${tenderWeeks} weeks applied.`
  const floatNote = floatWeeks > 0
    ? `A programme float of ${floatWeeks} week(s) (1 week per ${floatEvery} weeks of critical path, Modifiers PROG-FLOAT) is included in the headline programme. The best-case programme without float is ${totalWeeksBestCase} weeks; the client should plan around the with-float figure.`
    : 'No programme float is included — the headline programme is a best-case critical path with no contingency for slippage.'

  return [
    'Programme durations are indicative only and based on information provided at RIBA Stage 0–1. Actual durations to be confirmed at Stage 2 once surveys, design scope, and procurement strategy are finalised.',
    'Durations assume client decision-making within the gateway periods shown. Delays to client sign-off will extend the programme accordingly.',
    ...(planningRequired
      ? ['Planning determination periods are based on statutory LPA timescales. No allowance has been made for objections, committee referral, or appeals.']
      : ['Planning consent is not required for these works based on the stated route (Q3.4). This is a statement about planning only — see the separate building control note below.']),
    // Planning consent and Building Control (Building Regulations) approval are
    // two independent regimes; a permitted-development or "no consent required"
    // planning answer says nothing about whether Building Regulations apply.
    // This used to be asserted as one combined sentence — "no statutory planning
    // or building control consent is required" — purely from the Q3.4 planning
    // answer, which is wrong whenever the works involve structural alteration,
    // drainage, ventilation/extract, fire safety, or a change of use: those
    // remain notifiable under Building Regulations regardless of the planning
    // route, and this tool has no dedicated question that actually establishes
    // building control status. Never assert its absence; say it is unconfirmed.
    ...(bcRequired
      ? ['Building control approval: LABC Full Plans route assumed (5–8 weeks), running in parallel with Stage 4. A private RBCA (3–5 weeks) should be considered for programme-critical projects — decision to be confirmed by the PM at Stage 2.']
      : ['Building control (Building Regulations) status has not been established by this questionnaire and must not be assumed from the planning answer above — structural work, drainage, ventilation/extract, fire safety and change-of-use works are commonly notifiable even under permitted development. Confirm building control applicability with a Building Control Body at Stage 2 before proceeding.']),
    `Construction duration is benchmarked against ${gifa} m² ${projectType} at standard productivity rates. Actual duration to be confirmed at Stage 2 by the appointed contractor.`,
    occupationNote,
    accessNote,
    // "Surveys shown at the start of Stage 2" is only true when Stage 2 is
    // actually still in the programme — a project starting at Stage 3+ (FT1,
    // design already reached) has no Stage 2 row at all, so this used to
    // assert a milestone that does not exist in that programme.
    ...(surveyWeeks > 0
      ? [s2Done
          ? `Surveys are identified as required but not yet commissioned. As the design stage reached (${startStageLabel || 'a later stage'}) means Stage 2 is not shown, commissioning surveys immediately is a gateway condition before the remaining programme proceeds.`
          : 'Surveys shown at the start of Stage 2 are identified as required but not yet commissioned. Commissioning surveys before Stage 2 commences is a gateway condition.']
      : []),
    startDateAssumed
      ? `Calendar dates assume the programme starts on the report date (${startLabel}) — no expected start was given at Q4.0. Week 0 is Stage 1 Gateway approval; every date shifts with the actual start.`
      : `Calendar dates run from the stated expected start of ${startLabel} (Q4.0), taken as Stage 1 Gateway approval (Week 0). A later start shifts every date accordingly.`,
    floatNote,
    procNote,
    'Handover (RIBA Stage 6) includes commissioning, snagging, and Practical Completion. The defects liability period is not shown — it begins at Practical Completion and is typically 12 months.',
  ]
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * @param {object} [opts]
 * @param {object} [opts.scope]  cost.scopeSummary from the cost engine: the v4.5
 *   codes each ticked v5.2 item replaces plus the item names (`tokens`), and a
 *   true Group 5 item count (`meItemCount`). This engine's scope tests are
 *   written against v4.5 codes and keywords, so the summary keeps them meaning
 *   what they meant. Without it (older callers) the raw answer is read.
 */
export async function calculateProgramme(answers, costMidpoint, opts = {}) {
  const wb     = await fetchProgrammeWorkbook()
  const durTab = parseDurationsTab(wb)
  const conTab = parseConstructionTab(wb)
  const modTab = parseModifiersTab(wb)
  const ftTab  = parseFastTrackTab(wb)
  const procTab = parseProcurementTab(wb)

  const gifa              = Number(answers.q1_5_size) || 100
  const projectType       = answers.q1_2_projectType || 'Refurbishment'
  const interventionLevel = answers.q2_3_interventionLevel || 'Full systems replacement'
  const scopeItems        = opts.scope?.tokens || answers.q2_2_scopeItems || []
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
  // Read the band's START year rather than substring-matching its label. The old
  // version tested for the literal tokens "1945" and "1980–2000", so relabelling
  // a Q1.4 option — which is a presentation change — silently moved buildings
  // onto a different survey path. Parsing the year makes the label free to
  // change and handles both the current bands and any saved from older drafts.
  // "Pre-1900" is special-cased because its only 4-digit token is the boundary
  // itself, not the start of the band.
  const ageStartYear = age.includes('Pre-1900')
    ? 1899
    : (Number((age.match(/\d{4}/) || [])[0]) || null)
  const isPreMinus1980 = ageStartYear !== null && ageStartYear < 1980
  const isPreMinus2000 = ageStartYear !== null && ageStartYear < 2000
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
    stages.push({ stage: 'Asbestos Survey', activity: useRd ? 'Refurbishment/Demolition Survey' : 'Management Survey', weeks: wks, parallel: true, notes: 'Pre-design — parallel with Stage 2–3' })
  }

  if (hasStructural && !isNewBuild) {
    const wks = Math.ceil(dur('SV3', 2))
    surveyWeeks = Math.max(surveyWeeks, wks)
    stages.push({ stage: 'Structural Survey', activity: 'Independent structural inspection', weeks: wks, parallel: true, notes: 'Pre-design — parallel with Stage 2–3' })
  }

  if (isRefurb) {
    const wks = Math.ceil(dur('SV4', 2))
    surveyWeeks = Math.max(surveyWeeks, wks)
    stages.push({ stage: 'Condition Survey', activity: 'Building condition survey', weeks: wks, parallel: true, notes: 'Pre-design — parallel with other surveys' })
  }

  if (isNewBuild || isExtension) {
    const wks = Math.ceil(dur('SV5', 2))
    surveyWeeks = Math.max(surveyWeeks, wks)
    stages.push({ stage: 'Topographic Survey', activity: 'Topographic and measured building survey', weeks: wks, parallel: true, notes: 'Pre-design' })
  }

  const hasBrownfield = knownIssues.some(i => i.toLowerCase().includes('contaminated'))
  if (isNewBuild || isExtension || hasBrownfield) {
    const wks = Math.ceil(dur('SV6', 4))
    surveyWeeks = Math.max(surveyWeeks, wks)
    stages.push({ stage: 'Ground Investigation', activity: 'Ground investigation and geotechnical report', weeks: wks, parallel: true, notes: 'Pre-design — parallel with other surveys' })
  }

  // Ecology / bat survey (SV7, September 2026). Triggered by the Q3.8 ecology
  // option, or by roof works on a pre-2000 building — roof voids are the
  // classic roost. Emergence surveys can only be done May–September, so a
  // missed window is a whole-year slip; the seed in lib/prose.js carries that.
  // Only priced from the workbook row: no SV7 row → no stage, no duration.
  // v4.5 roof (2.3) and fabric/envelope repairs (7.2), or any v5.2 item named
  // for a roof ("Roof", "Roof terrace and green roof").
  const hasRoofScope = scopeItems.some(s => ['2.3', '7.2'].includes(String(s)) || /roof/i.test(String(s)))
  const ecologyTriggered = hasSiteContext(answers, 'ecology') || (hasRoofScope && isPreMinus2000 && !isNewBuild)
  if (ecologyTriggered && durTab['SV7']) {
    const wks = Math.ceil(dur('SV7', 0))
    if (wks > 0) {
      surveyWeeks = Math.max(surveyWeeks, wks)
      stages.push({ stage: 'Ecology Survey', activity: 'Ecology / bat survey', weeks: wks, parallel: true, notes: 'Pre-design — seasonal (emergence surveys May–September only)' })
    }
  }

  // ── Design stages ────────────────────────────────────────────────────────────
  const meCount = opts.scope?.meItemCount ?? countMeItems(scopeItems)
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

  // ── FastTrack FT1: start point = design stage already reached ────────────────
  // The Programme workbook's FastTrack sheet (lever FT1) specifies: when design
  // is already past Stage 1, remove the completed design stages from the critical
  // path and start the programme at the next stage. A completed stage drops its
  // own design weeks, its trailing client gateway, and any consent that runs in
  // parallel with it (planning ∥ Stage 3, Building Control ∥ Stage 4). Without
  // this, a project that has paid for completed design still gets the full
  // Stage 2–4 duration — contradicting the reduced professional-fee % the cost
  // engine already applies for the same answer.
  const ds = (answers.q4_5_designStage || '').toLowerCase()
  const s4Done = ds.includes('stage 4') || ds.includes('technical')
  const s3Done = s4Done || ds.includes('stage 3') || ds.includes('developed')
  const s2Done = s3Done || ds.includes('stage 2') || ds.includes('concept complete')
  if (s2Done) s2Weeks = 0
  if (s3Done) s3Weeks = 0
  if (s4Done) s4Weeks = 0
  // Trailing gateways drop with their stage; consents drop when their parallel
  // stage is complete (handled below where planningWks / bcWks are set).
  const gw2 = s2Done ? 0 : gatewayWks
  const gw3 = s3Done ? 0 : gateway3Wks
  const gw4 = s4Done ? 0 : gatewayWks

  // One-line explanation for the report + prompt (empty when nothing skipped).
  let programmeStartNote = ''
  if (s2Done) {
    const reachedLabel = answers.q4_5_designStage || ''
    const startStage = s4Done ? 'tender / procurement' : s3Done ? 'Stage 4 (Technical Design)' : 'Stage 3 (Developed Design)'
    const completedRange = s4Done ? 'Stages 2–4' : s3Done ? 'Stages 2–3' : 'Stage 2'
    programmeStartNote = `Design stage reached: ${reachedLabel} — ${completedRange} treated as already complete and removed from the programme; remaining work starts at ${startStage}. Assumes the existing design is sound, reusable, and that statutory consents have progressed in step with the design.`
  }

  // ── Consent flags (govern planning / building-control wording) ────────────────
  const pl = planningType.toLowerCase()
  const planningRequired = pl.includes('full planning') || pl.includes('prior approval') ||
                           pl.includes('change of use') || pl.includes('unsure') ||
                           pl.includes('pre-application')
  const bcRequired = !pl.includes('permitted development') && !pl.includes('no consent')

  if (!s2Done) {
    stages.push({ stage: 'Stage 2',  activity: 'Concept Design', weeks: s2Weeks, notes: 'Includes surveys at start of stage' })
    stages.push({ stage: 'Gateway',  activity: 'Client Review — Stage 2', weeks: gw2, notes: 'Client sign-off' })
  }
  if (!s3Done) {
    stages.push({ stage: 'Stage 3',  activity: planningRequired ? 'Developed Design — planning application submitted at start of stage' : 'Developed Design', weeks: s3Weeks, notes: planningRequired ? 'Planning application submitted at start; determination runs in parallel' : 'Full developed design — no planning consent required' })
  }

  // ── Planning (parallel with Stage 3) ─────────────────────────────────────────
  // Skipped when Stage 3 is already complete (FT1) — consent assumed progressed
  // in step with the developed design.
  let planningWks  = 0
  let planningNote = ''

  if (s3Done) {
    // no planning rows — handled by programmeStartNote
  } else if (pl.includes('full planning') && pl.includes('listed')) {
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
    stages.push({ stage: 'Planning', activity: 'Planning consent determination (parallel with Stage 3)', weeks: planningWks, parallel: true, notes: planningNote })
    if (planningOverrunWks > 0) {
      stages.push({ stage: 'Planning — wait', activity: 'Awaiting LPA determination — Stage 4 on hold', weeks: planningOverrunWks,
        notes: `Planning determination extends ${planningOverrunWks} wk(s) beyond Stage 3. Stage 4 cannot start until consent is received.` })
    }
  }

  if (gw3 > 0) {
    stages.push({ stage: 'Gateway', activity: 'Client Review — Stage 3', weeks: gw3, notes: 'Client sign-off' })
  }
  if (!s4Done) {
    stages.push({ stage: 'Stage 4', activity: bcRequired ? 'Technical Design — building control submission at start of stage' : 'Technical Design — full construction information', weeks: s4Weeks, notes: bcRequired ? 'Full construction information; BC runs in parallel' : 'Full construction information' })
  }

  // ── Building Control (parallel with Stage 4) ──────────────────────────────────
  // Skipped when Stage 4 is already complete (FT1) — approval assumed progressed
  // in step with the technical design.
  let bcWks = 0
  if (bcRequired && !s4Done) {
    bcWks = Math.ceil(dur('BC1', 7))
    stages.push({ stage: 'Building Control', activity: 'LABC Full Plans submission (parallel with Stage 4)', weeks: bcWks, parallel: true,
      notes: 'Runs in parallel with Stage 4. Private RBCA (3–5 wks) is an option for programme-critical projects.' })
  }
  const bcOverrunWks = Math.max(0, bcWks - s4Weeks)
  if (bcOverrunWks > 0) {
    stages.push({ stage: 'Building Control — wait', activity: 'Awaiting BC approval — tender on hold', weeks: bcOverrunWks,
      notes: `BC approval extends ${bcOverrunWks} wk(s) beyond Stage 4. Tender cannot start until approval received.` })
  }

  if (gw4 > 0) {
    stages.push({ stage: 'Gateway', activity: 'Client Review — Stage 4', weeks: gw4, notes: 'Client sign-off' })
  }

  // ── Building Safety Act Gateway 2 (BS1, September 2026) ───────────────────
  // A higher-risk building cannot start construction until the Building
  // Safety Regulator approves the Gateway 2 application, which follows the
  // technical design. Sequential on the critical path between Stage 4 and
  // tender award; duration from the Durations row only (no row → no stage).
  let bsaWks = 0
  if (isHigherRiskBuilding(answers) && durTab['BS1']) {
    bsaWks = Math.ceil(dur('BS1', 0))
    if (bsaWks > 0) {
      stages.push({ stage: 'BSR Gateway 2', activity: 'Building Safety Regulator — Gateway 2 approval (higher-risk building)', weeks: bsaWks,
        notes: 'Statutory determination after technical design; construction cannot start without approval. Determinations frequently exceed the statutory period.' })
    }
  }

  // ── Tender / Procurement ──────────────────────────────────────────────────────
  const costMid    = costMidpoint || 500000
  const priorities = Array.isArray(answers.q4_4_priorities) ? answers.q4_4_priorities : []
  const primaryPriority = priorities[0] || ''

  // The Procurement sheet (September 2026) decides route, contract form,
  // tender type and tender duration from the primary priority × cost band ×
  // design stage. The block after it is the ORIGINAL value-only logic, kept
  // verbatim as the fallback for a workbook without the sheet — the app never
  // guesses a route from thin air, and never chooses one in code once the
  // sheet exists.
  const procRow = procTab.length > 0 ? selectProcurementRow(procTab, primaryPriority, costMid, answers.q4_5_designStage) : null

  let tenderWks, procurementRoute, tenderNote, contractForm, tenderType, designResponsibility, procurementRationale
  if (procRow) {
    const tenderId = /^TN[123]$/.test(procRow.tenderId) ? procRow.tenderId : (costMid >= 100000 ? 'TN1' : 'TN2')
    tenderWks        = Math.round(dur(tenderId, tenderId === 'TN2' ? 5 : 12))
    procurementRoute = procRow.route
    contractForm     = procRow.contractForm
    tenderType       = procRow.tenderType
    designResponsibility = procRow.designResp
    procurementRationale = procRow.rationale
    tenderNote = `${procRow.route} — Procurement table rule ${procRow.rule}` +
      `${primaryPriority ? ` (primary priority: ${primaryPriority})` : ''} at a £${Math.round(costMid / 1000)}k mid-point (${tenderWks} weeks, ${tenderId})`
  } else {
    tenderWks        = Math.round(costMid >= 100000 ? dur('TN1', 12) : dur('TN2', 5))
    procurementRoute = costMid >= 100000 ? 'Traditional — Single Stage Tender' : 'Direct Award — 3 Quotations'
    tenderNote       = costMid >= 100000
      ? `Formal competitive tender — total project cost exceeds £100,000 threshold (${tenderWks} weeks)`
      : `Three quotations — total project cost under £100,000 (${tenderWks} weeks)`
    // Contract form used to be left entirely to the AI's own judgement (the
    // prompt only offered examples, "e.g. JCT Minor Works 2024, JCT Standard
    // Building Contract 2024"), with no value threshold given — so it could
    // recommend JCT Minor Works at a higher mid-point than another report
    // recommended the (normally larger-value) Standard Building Contract at.
    // Deterministic like procurementRoute above, so the AI states it rather
    // than choosing it. Bands follow standard UK industry practice.
    contractForm = costMid < 250_000
      ? 'JCT Minor Works Building Contract 2024'
      : costMid < 1_000_000
        ? 'JCT Intermediate Building Contract 2024'
        : 'JCT Standard Building Contract 2024'
    tenderType = costMid >= 100000 ? 'Single stage' : 'Direct award'
    designResponsibility = 'Client design team'
    procurementRationale = ''
  }
  stages.push({ stage: 'Tender / Procurement', activity: procurementRoute, weeks: tenderWks, notes: tenderNote })

  // ── Construction ──────────────────────────────────────────────────────────────
  const conId       = selectConstructionId(projectType, specLevel, scopeItems, answers.q1_2_storeys, answers.q1_3_buildingUse, answers.q2_3_interventionLevel, opts.scope?.meItemCount)
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
    // Modifiers FN-1 applies to "Procurement/Pre-start": governance approval
    // happens before the tender is committed, which is also where the
    // milestones have always counted it. It used to be appended after
    // handover in the stage list, so once calendar dates were added the row
    // sat in the wrong year. Inserted before Tender so the two agree.
    const tenderIdx = stages.findIndex(s => s.stage === 'Tender / Procurement')
    const govStage = { stage: 'Governance', activity: 'Grant governance approval', weeks: grantGovernanceWks, notes: procurementNote }
    if (tenderIdx >= 0) stages.splice(tenderIdx, 0, govStage)
    else stages.push(govStage)
  }

  // ── Totals ─────────────────────────────────────────────────────────────────────
  // Surveys run concurrently with design (do not extend total); planningOverrun and bcOverrun are sequential waits
  const designWeeks = s2Weeks + gw2 + s3Weeks + gw3 + s4Weeks + gw4
  const criticalPathWeeks = designWeeks + planningOverrunWks + bcOverrunWks + bsaWks + tenderWks + conWks + phasingExtraWks + hoWks + grantGovernanceWks

  // ── Programme float (Modifiers PROG-FLOAT) ─────────────────────────────────
  // The workbook has always carried "+1 wk per 13 wks — report a best-case (no
  // float) and a with-float programme", but the code never applied it, so the
  // single headline number was the optimistic one. The headline is now the
  // with-float figure (the conservative one a client should plan around) and
  // the best case is reported alongside it. Everything downstream that reads
  // totalWeeks — inflation bands, the target-date check — sees the float.
  const floatEvery  = getFloatEveryWeeks(modTab)
  const floatWeeks  = floatEvery > 0 ? Math.ceil(criticalPathWeeks / floatEvery) : 0
  const totalWeeksBestCase = criticalPathWeeks
  const totalWeeks  = criticalPathWeeks + floatWeeks
  if (floatWeeks > 0) {
    stages.push({ stage: 'Programme float', activity: 'Float / contingency across the critical path', weeks: floatWeeks,
      notes: `${floatWeeks} wk(s) at 1 week per ${floatEvery} weeks of critical path (Modifiers PROG-FLOAT). Best case without float: ${totalWeeksBestCase} weeks.` })
  }

  // ── FastTrack levers (offered, never applied) ──────────────────────────────
  // FT1 (start point) is already applied above. Each remaining lever's trigger
  // is evaluated deterministically here from the same answers; the ones that
  // fire are listed in the report as options with their trade-off. The
  // headline programme is never shortened by them — that is the client's call.
  const wantsSpeed   = priorities.some(p => String(p).toLowerCase().includes('speed'))
  const wantsQuality = priorities.some(p => String(p).toLowerCase().includes('design quality'))
  const surveysHeld  = (Array.isArray(answers.q3_3_surveys) ? answers.q3_3_surveys : []).map(s => String(s).toLowerCase())
  const surveyStageNames = stages.filter(s => s.parallel && /survey|investigation/i.test(s.stage)).map(s => s.stage.toLowerCase())
  const surveyMatch = surveysHeld.some(h =>
    surveyStageNames.some(n =>
      (h.includes('asbestos') && n.includes('asbestos')) ||
      (h.includes('structural') && n.includes('structural')) ||
      (h.includes('condition') && n.includes('condition')) ||
      (h.includes('topographic') && n.includes('topographic')) ||
      (h.includes('ground') && n.includes('ground'))))
  const FT_TRIGGERS = {
    FT2:  () => surveyMatch,
    FT3:  () => wantsSpeed && planningRequired && !s3Done,
    FT4:  () => wantsSpeed && tenderWks > 0,
    FT5:  () => wantsSpeed && bcRequired && !s4Done,
    FT6:  () => wantsSpeed && hasDemo,
    FT7:  () => meCount >= 4 || hasSpecialist,
    FT8:  () => wantsSpeed && (gw2 + gw3 + gw4) > 0,
    FT9:  () => pl.includes('permitted development'),
    FT10: () => wantsSpeed && wantsQuality && costMid >= 100000,
  }
  const fastTrackOptions = ftTab
    .filter(l => l.id !== 'FT1' && FT_TRIGGERS[l.id] && FT_TRIGGERS[l.id]())
    .map(l => ({ id: l.id, lever: l.lever, action: l.action, weeksSaved: l.weeksSaved, tradeOff: l.tradeOff }))

  // ── Programme start date and calendar dates (September 2026) ───────────────
  // Q4.0 gives the start; absent, the generation date is assumed (and said so).
  // Sequential stages run back to back; parallel stages are anchored to the
  // stage they run alongside (surveys at week 0, planning with Stage 3,
  // building control with Stage 4). Dates are ISO strings so both renderers
  // format them identically via lib/reportShared.js.
  const rawStart = String(answers.q4_0_startDate || '').trim()
  const parsedStart = /^\d{4}-\d{2}-\d{2}$/.test(rawStart) ? new Date(rawStart + 'T00:00:00Z') : null
  const startDateAssumed = !parsedStart || Number.isNaN(parsedStart.getTime())
  const startDate = startDateAssumed ? new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z') : parsedStart
  const isoAtWeek = w => new Date(startDate.getTime() + w * 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const fmtWeekDate = w => new Date(isoAtWeek(w) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  {
    let cursor = 0
    const startOf = {}
    for (const s of stages) {
      if (s.parallel) continue
      s.startWeek = cursor
      s.endWeek = cursor + (s.weeks || 0)
      startOf[s.stage] = s.startWeek
      cursor = s.endWeek
    }
    for (const s of stages) {
      if (!s.parallel) continue
      const anchor = /planning/i.test(s.stage) ? (startOf['Stage 3'] ?? 0)
        : /building control/i.test(s.stage) ? (startOf['Stage 4'] ?? 0)
        : 0
      s.startWeek = anchor
      s.endWeek = anchor + (s.weeks || 0)
    }
    for (const s of stages) {
      s.startDate = isoAtWeek(s.startWeek)
      s.endDate = isoAtWeek(s.endWeek)
    }
  }

  // ── Target date feasibility ───────────────────────────────────────────────────
  let targetStatus = 'no-date'
  let targetNote   = 'No target completion date has been specified.'
  const targetDate = answers.q4_1_targetDate

  if (targetDate && targetDate !== 'No specific deadline') {
    const target   = new Date(targetDate)
    const earliest = new Date(startDate)
    earliest.setDate(earliest.getDate() + totalWeeks * 7)
    if (target >= earliest) {
      targetStatus = 'achievable'
      const bufferWeeks = Math.round((target - earliest) / (7 * 24 * 3600 * 1000))
      targetNote = `The target date of ${target.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} is achievable from a ${startDateAssumed ? 'assumed' : 'stated'} start of ${fmtWeekDate(0)}, with a programme buffer of approximately ${bufferWeeks} weeks.`
    } else {
      targetStatus = 'at-risk'
      const shortfallWeeks = Math.round((earliest - target) / (7 * 24 * 3600 * 1000))
      targetNote = `The target date of ${target.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} is not achievable from a ${startDateAssumed ? 'assumed' : 'stated'} start of ${fmtWeekDate(0)}. The ${totalWeeks}-week programme completes around ${fmtWeekDate(totalWeeks)}, approximately ${shortfallWeeks} weeks beyond the target.`
    }
  }

  // ── Milestones ────────────────────────────────────────────────────────────────
  // Completed design stages (FT1) are omitted — only milestones for work that is
  // actually in the programme are shown. The opening milestone names the first
  // remaining stage.
  const startStageLabel = !s2Done ? 'Stage 2 commences'
    : !s3Done ? 'Stage 3 commences (Stage 2 already complete)'
    : !s4Done ? 'Stage 4 commences (Stages 2–3 already complete)'
    : 'Tender commences (design already complete)'
  const milestones = [
    surveyWeeks > 0 && !s2Done
      ? `Week 0: Project Start — ${startStageLabel}; pre-design surveys commissioned in parallel`
      : `Week 0: Project Start — ${startStageLabel}`
  ]
  if (surveyWeeks > 0 && !s2Done) milestones.push(`Week ${surveyWeeks}: Pre-design surveys complete (concurrent with Stage 2)`)
  let w = 0
  w += s2Weeks
  if (!s2Done) milestones.push(`Week ${w}: Stage 2 Concept Design complete`)
  w += gw2 + s3Weeks
  if (!s3Done) milestones.push(`Week ${w}: Stage 3 Developed Design complete${planningRequired ? ' — Planning decision expected' : ''}`)
  w += planningOverrunWks + gw3 + s4Weeks + bcOverrunWks + gw4 + grantGovernanceWks
  if (bsaWks > 0) {
    milestones.push(`Week ${w}: Stage 4 Technical Design complete — Gateway 2 application submitted to the Building Safety Regulator`)
    w += bsaWks
    milestones.push(`Week ${w}: Gateway 2 approval — Tender issued`)
  } else if (!s4Done) milestones.push(`Week ${w}: Stage 4 Technical Design complete — Tender issued`)
  else milestones.push(`Week ${w}: Tender issued`)
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
  if (floatWeeks > 0) milestones.push(`Week ${w + floatWeeks}: Programme completion including ${floatWeeks} week(s) float`)
  // "Week 12: …" → "Week 12 (7 Dec 2026): …" — dates from the Q4.0 start.
  for (let i = 0; i < milestones.length; i++) {
    milestones[i] = milestones[i].replace(/^Week (\d+):/, (_, n) => `Week ${n} (${fmtWeekDate(Number(n))}):`)
  }

  const assumptions = buildProgrammeAssumptions(answers, {
    totalWeeks, constructionWeeks: conWks, procurementRoute,
    tenderWeeks: tenderWks, costMidPoint: costMid, occupationUplift, accessUplift,
    planningRequired, bcRequired, surveyWeeks, s2Done, startStageLabel,
    floatWeeks, floatEvery, totalWeeksBestCase, procRow, primaryPriority,
    startDateAssumed, startLabel: fmtWeekDate(0),
  })
  if (bsaWks > 0) assumptions.push(`Higher-risk building (Q3.8): a ${bsaWks}-week Building Safety Regulator Gateway 2 approval period is included on the critical path between technical design and tender. This is the statutory minimum; recent determinations have commonly taken longer, and the programme should be re-based once the BSR's current performance is known.`)
  if (stages.some(s => s.stage === 'Ecology Survey')) assumptions.push('An ecology / bat survey is shown in parallel with early design. Emergence surveys can only be carried out between May and September; if the project start falls outside that window the survey, and any licence it leads to, can delay works by up to a year.')
  // Surface the FT1 start-point decision at the top of the assumptions list.
  if (programmeStartNote) assumptions.unshift(programmeStartNote)

  return {
    stages,
    totalWeeks,
    totalWeeksBestCase,
    floatWeeks,
    startDate: isoAtWeek(0),
    startDateAssumed,
    endDate: isoAtWeek(totalWeeks),
    fastTrackOptions,
    tenderType,
    designResponsibility,
    procurementRationale,
    procurementSource: procRow ? `Procurement table rule ${procRow.rule}` : 'value threshold (no Procurement sheet)',
    surveyWeeks,
    designWeeks,
    tenderWeeks: tenderWks,
    constructionWeeks: conWks,
    handoverWeeks: hoWks,
    planningWeeks: planningWks,
    bcWeeks: bcWks,
    bsaGatewayWeeks: bsaWks,
    bcOverrunWeeks: bcOverrunWks,
    planningOverrunWeeks: planningOverrunWks,
    targetStatus,
    targetNote,
    procurementRoute,
    contractForm,
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
    workbookVersion: parseWorkbookVersion(wb),
    programmeStartNote,
  }
}
