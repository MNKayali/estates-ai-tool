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

export function worstCaseReport(sample) {
  const r = clone(sample)
  r.answers.q1_0_projectName = 'Refurbishment and extension of the North Wing Science Laboratories, Example University Campus'
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
  return r
}

export function longScopeReport(sample) {
  const r = clone(sample)
  const base = r.cost.lineItems
  // Split every line into two phases so the works total still reconciles.
  const half = l => ({ ...l, qty: l.qty / 2, lineLow: l.lineLow / 2, lineHigh: l.lineHigh / 2, lineMid: (l.lineMid || 0) / 2 })
  r.cost.lineItems = [...base.map(half), ...base.map(l => ({ ...half(l), code: `${l.code}b`, description: `${l.description} (phase 2)` }))]
  return r
}
