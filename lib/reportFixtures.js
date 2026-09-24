/**
 * lib/reportFixtures.js — report fixtures for tests and
 * scripts/check-report-fit.mjs, built from the sample so they stay realistic.
 * worstCaseReport fills every prose slot to its PROSE_LIMITS maximum;
 * longScopeReport doubles the scope past one works page.
 */
const WORDS = ['programme', 'works', 'client', 'access', 'survey', 'design', 'planning', 'contractor']
const words = n => `${Array.from({ length: n }, (_, i) => WORDS[i % WORDS.length]).join(' ')}.`
const clone = o => JSON.parse(JSON.stringify(o))

export function worstCaseReport(sample) {
  const r = clone(sample)
  r.answers.q1_0_projectName = 'Refurbishment and extension of the North Wing Science Laboratories, Example University Campus'
  r.aiProse = {
    ...r.aiProse,
    executiveSummary: words(130),
    keyFindings: Array.from({ length: 5 }, () => words(35)),
    scopeAssumptions: Array.from({ length: 4 }, () => words(35)),
    costNarrative: words(65),
    roiNarrative: words(60),
    constraints: Array.from({ length: 5 }, () => ({ category: 'Programme', title: words(5).replace('.', ''), text: words(35) })),
    nextSteps: Array.from({ length: 5 }, () => words(40)),
    riskRegister: Array.from({ length: 10 }, (_, i) => ({
      ref: `R${i + 1}`, seedRef: 'NONE', category: 'Programme', likelihood: 'High', impact: 'High',
      rating: i < 4 ? 'High' : 'Medium', description: words(25), mitigation: words(20),
    })),
    procurementNarrative: words(70),
    procurementConsiderations: Array.from({ length: 3 }, () => words(35)),
    procurementConflicts: [words(30), words(30)],
  }
  return r
}

export function longScopeReport(sample) {
  const r = clone(sample)
  const base = r.cost.lineItems
  r.cost.lineItems = [...base, ...base.map(l => ({ ...l, code: `${l.code}b`, description: `${l.description} (phase 2)` }))]
  return r
}
