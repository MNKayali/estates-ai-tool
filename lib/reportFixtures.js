/**
 * lib/reportFixtures.js — report fixtures for tests and
 * scripts/check-report-fit.mjs, built from the sample so they stay realistic.
 * worstCaseReport fills every prose slot to its PROSE_LIMITS maximum;
 * longScopeReport doubles the scope past one works page.
 */
import { PROSE_LIMITS as L } from './proseSchema.js'

const WORDS = ['programme', 'works', 'client', 'access', 'survey', 'design', 'planning', 'contractor']
const words = n => `${Array.from({ length: n }, (_, i) => WORDS[i % WORDS.length]).join(' ')}.`
const clone = o => JSON.parse(JSON.stringify(o))

// The longest cells in the Procurement Reference workbook v2.0 (a JCT cell of
// 116 characters, an NEC4 cell of 102), on both sides of the table.
const LONG_OPTION = { score: 9, whatItIs: '', bestWhen: '', watchOuts: '' }
const LONG_SIDE = {
  route: { ...LONG_OPTION, id: 'PR2', name: 'Design and build (single stage)' },
  model: { ...LONG_OPTION, id: 'CM2', name: 'Guaranteed maximum price (GMP)' },
  contract: {
    key: 'PR1|CM4',
    jct: 'JCT Measured Term Contract (MTC) for a programme of small works; otherwise SBC with Approximate Quantities (SBC/AQ)',
    nec4: 'PSC for the construction manager and ECC for each trade package; or ECC Option F (management contract)',
    notes: '',
  },
  routeToMarket: { ...LONG_OPTION, id: 'RM4', name: 'Framework — mini-competition', tenderId: 'TN3' },
}
export const WORST_PROCUREMENT = Object.freeze({
  drivers: {
    valueGBP: 3_500_000, valueLevel: 'V2 £1m to threshold', weeks: 52, durationLevel: 'D2 27–52 wks',
    highRisks: 5, riskLevel: 'R3 High', priority: 'Funder/compliance requirement', priorityLevel: 'P7 Funder/compliance requirement', publicClient: null,
  },
  preferred: LONG_SIDE,
  alternative: LONG_SIDE,
  maxScore: 10,
})

export function worstCaseReport(sample) {
  const r = clone(sample)
  r.answers.q1_0_projectName = 'Refurbishment and extension of the North Wing Science Laboratories, Example University Campus'
  r.procurement = clone(WORST_PROCUREMENT)
  r.aiProse = {
    ...r.aiProse,
    executiveSummary: words(L.executiveSummary.words[1]),
    keyFindings: Array.from({ length: L.keyFindings.count[1] }, () => words(L.keyFindings.words[1])),
    scopeAssumptions: Array.from({ length: L.scopeAssumptions.count[1] }, () => words(L.scopeAssumptions.words[1])),
    costNarrative: words(L.costNarrative.words[1]),
    roiNarrative: words(L.roiNarrative.words[1]),
    constraints: Array.from({ length: L.constraints.count[1] }, () => ({ category: 'Programme', title: words(L.constraints.fields.title[1]).replace('.', ''), text: words(L.constraints.fields.text[1]) })),
    nextSteps: Array.from({ length: L.nextSteps.count[1] }, () => words(L.nextSteps.words[1])),
    riskRegister: Array.from({ length: 10 }, (_, i) => ({
      ref: `R${i + 1}`, seedRef: 'NONE', category: 'Programme', likelihood: 'High', impact: 'High',
      rating: i < 4 ? 'High' : 'Medium', description: words(L.riskRegister.fields.description[1]), mitigation: words(L.riskRegister.fields.mitigation[1]),
    })),
    procurementNarrative: words(L.procurementNarrative.words[1]),
    procurementConsiderations: Array.from({ length: L.procurementConsiderations.count[1] }, () => words(L.procurementConsiderations.words[1])),
    procurementConflicts: Array.from({ length: L.procurementConflicts.count[1] }, () => words(L.procurementConflicts.words[1])),
  }
  crowdCostPage(r)
  crowdProgrammePage(r)
  return r
}

// The fullest programme page: every survey, planning and building control
// alongside design, both waits, governance, Gateway 2 and float (modelled on
// live test report 0EF2ACBA, which ran 53 px into its footer).
function crowdProgrammePage(r) {
  const start = new Date('2027-04-05T00:00:00Z')
  const iso = w => new Date(start.getTime() + w * 7 * 86400000).toISOString().slice(0, 10)
  const seq = [
    ['Stage 2', 'Concept Design', 4], ['Gateway', 'Client Review — Stage 2', 2],
    ['Stage 3', 'Developed Design — planning application submitted at start of stage', 9],
    ['Planning — wait', 'Awaiting LPA determination — Stage 4 on hold', 2], ['Gateway', 'Client Review — Stage 3', 2],
    ['Stage 4', 'Technical Design — building control submission at start of stage', 8],
    ['Building Control — wait', 'Awaiting BC approval — tender on hold', 2], ['Gateway', 'Client Review — Stage 4', 2],
    ['BSR Gateway 2', 'Building Safety Regulator — Gateway 2 approval (higher-risk building)', 12],
    ['Governance', 'Grant governance approval', 6], ['Tender / Procurement', 'Traditional — Selective tender', 12],
    ['Construction', 'RIBA Stage 5 — Extension — Multi-Storey (3 phases)', 40],
    ['Programme float', 'Float / contingency across the critical path', 9],
    ['Handover', 'RIBA Stage 6 — Snagging, Practical Completion and move-in', 2],
  ]
  const stages = []
  let w = 0
  for (const [stage, activity, weeks] of seq) {
    stages.push({ stage, activity, weeks, startWeek: w, endWeek: w + weeks, startDate: iso(w), endDate: iso(w + weeks) })
    w += weeks
  }
  const at = name => stages.find(s => s.stage === name).startWeek
  const par = (stage, activity, weeks, anchor) => ({ stage, activity, weeks, parallel: true, startWeek: anchor, endWeek: anchor + weeks, startDate: iso(anchor), endDate: iso(anchor + weeks) })
  stages.push(
    par('Asbestos Survey', 'Refurbishment/Demolition Survey', 3, 0), par('Topographic Survey', 'Topographic and measured building survey', 3, 0),
    par('Ground Investigation', 'Ground investigation and geotechnical report', 6, 0), par('Ecology Survey', 'Ecology / bat survey', 3, 0),
    par('Structural Survey', 'Structural survey', 2, 0),
    par('Planning', 'Planning consent determination (parallel with Stage 3)', 11, at('Stage 3')),
    par('Building Control', 'LABC Full Plans submission (parallel with Stage 4)', 10, at('Stage 4')),
  )
  Object.assign(r.programme, {
    stages, totalWeeks: w, totalWeeksBestCase: w - 9, floatWeeks: 9, startDate: iso(0), endDate: iso(w),
    planningWeeks: 11, planningAlongside: 'Stage 3', grantGovernanceWeeks: 6, occupationUplift: 15,
    procurementRoute: 'Traditional — Selective tender', tenderWeeks: 12,
  })
}

// The fullest project-cost page the engine can produce: a contractor's-design
// row and a developer-costs row in the table, a long prelims build-up, every
// confidence factor, a long scope-gap line and a scope assumption. Totals need
// not foot here — the fit check only measures the page.
function crowdCostPage(r) {
  const c = r.cost
  if (!c?.onCosts) return
  const p = c.percentages
  p.contractorDesign = 2
  p.devCosts = p.devCosts > 0 ? p.devCosts : 3.5
  c.breakdown = { ...c.breakdown, devCosts: c.breakdown?.devCosts || 1, contractorDesign: 1 }
  for (const k of ['low', 'mid', 'high']) {
    c.onCosts[k] = { ...c.onCosts[k], design: c.onCosts[k].design || 50000, dev: c.onCosts[k].dev || 90000 }
  }
  c.trace = {
    ...c.trace,
    prelims: [
      { code: 'A', label: 'Base 7% — vacant, no restrictions, relaxed programme', pct: 7 },
      ...['Q3.6 = Fully occupied throughout', 'Q3.5 includes Restricted working hours', 'Q3.5 includes Shared access with other occupiers',
        'Programme duration > 18 months', 'Q2.3 has ≥4 M&E items (complex services)', 'Q4.1 = Hard deadline (condensed programme)',
        'Q4.4 top priority = Speed (condensed programme)', 'Region = Inner London']
        .map(label => ({ code: 'A', label, pct: 1 })),
    ],
    devCosts: c.trace?.devCosts?.length ? c.trace.devCosts : [{ code: 'D', label: 'Q3.4 = Full planning (3–4%, use 3.5%)', pct: 3.5 }],
  }
  c.scopeGaps = { dependencies: ['Fire stopping', 'Emergency lighting', 'Asbestos removal', 'Ventilation', 'Internal doors'].map((name, i) => ({ id: `S-90${i}`, name, because: ['Strip-out'] })), typical: [] }
  c.scopeEffects = { ...(c.scopeEffects || {}), assumptions: [{ item: 'Catering kitchen', text: 'extract canopy and grease trap included' }] }
  r.confidence = {
    score: 'D', label: 'High Uncertainty', points: 9, cappedBy: null,
    factors: ['design at Stage 0–1', 'no condition survey', 'no asbestos R&D survey (pre-2000 building)', 'existing building', 'built before 1980',
      'fully occupied during works', 'risks rated High', 'few client-confirmed quantities', 'sense-check warnings', 'quantities estimated from typical ratios']
      .map((label, i) => ({ key: `F${i}`, label, points: 1 })),
  }
}

export function longScopeReport(sample) {
  const r = clone(sample)
  const base = r.cost.lineItems
  // Split every line into two phases so the works total still reconciles.
  const half = l => ({ ...l, qty: l.qty / 2, lineLow: l.lineLow / 2, lineHigh: l.lineHigh / 2, lineMid: (l.lineMid || 0) / 2 })
  r.cost.lineItems = [...base.map(half), ...base.map(l => ({ ...half(l), code: `${l.code}b`, description: `${l.description} (phase 2)` }))]
  return r
}
