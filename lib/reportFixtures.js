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
  return r
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
