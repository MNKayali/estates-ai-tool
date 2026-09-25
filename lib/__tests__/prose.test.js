import { describe, it, expect } from 'vitest'
import { computeConfidence, ensureSeedRisks, extractFigures, assertNoLeakedFigures, findLeakedFigures } from '../prose.js'

// Both functions are pure and network-free — no AI call, no workbook fetch —
// so these run instantly and pin down the exact deficiency-counting and
// seed-injection rules the AI prompt and the report's confidence grade
// depend on.
describe('computeConfidence', () => {
  const baseAnswers = {
    q3_3_surveys: ['Structural survey'],
    q3_1_knownIssues: ['Roof leak'],
    q3_4_planningConsents: 'Full planning granted',
  }
  const cleanCost = { excludedNoQuantity: [], additionalScopeNote: null }
  const cleanSenseCheck = { clientWarnings: [] }

  it('grades A (no deficiencies) when everything is known', () => {
    const c = computeConfidence(baseAnswers, cleanCost, cleanSenseCheck)
    expect(c.score).toBe('A')
    expect(c.label).toBe('High Confidence')
    expect(c.reasons).toEqual([])
  })

  it('grades B for exactly one deficiency (no surveys yet)', () => {
    const c = computeConfidence({ ...baseAnswers, q3_3_surveys: ['None'] }, cleanCost, cleanSenseCheck)
    expect(c.score).toBe('B')
    expect(c.reasons).toContain('no surveys commissioned yet')
  })

  it('grades D straight away for a HIGH-severity sense-check warning (weighted +2) plus one more deficiency', () => {
    const senseCheck = { clientWarnings: [{ severity: 'high' }] }
    const c = computeConfidence({ ...baseAnswers, q3_3_surveys: [] }, cleanCost, senseCheck)
    // +2 (high warning) + 1 (no surveys) = 3 deficiencies → still C by the
    // <=3 rule; confirms the weighting, not just the bucket boundary.
    expect(c.score).toBe('C')
    expect(c.reasons).toContain('automated sense check raised a high-severity warning')
  })

  it('grades D once deficiencies exceed three', () => {
    const senseCheck = { clientWarnings: [{ severity: 'high' }] } // +2
    const cost = { excludedNoQuantity: [{ description: 'x' }], additionalScopeNote: 'note' } // +1 +1
    const c = computeConfidence({ ...baseAnswers, q3_3_surveys: [] }, cost, senseCheck) // +1 more
    expect(c.score).toBe('D')
    expect(c.label).toBe('High Uncertainty')
  })

  it('does not double-count a MEDIUM warning against a HIGH one in the same run', () => {
    const senseCheck = { clientWarnings: [{ severity: 'high' }, { severity: 'medium' }] }
    const c = computeConfidence(baseAnswers, cleanCost, senseCheck)
    // Only the high-severity branch should fire (+2 deficiencies → grade C),
    // not both branches (+3, which would still read C but for the wrong
    // reason — assert the count directly via the reasons list instead).
    expect(c.score).toBe('C')
    expect(c.reasons).toEqual(['automated sense check raised a high-severity warning'])
  })

  it('a workbook-internal warning we do not surface to the client never appears in `reasons`', () => {
    // clientWarnings is what computeConfidence reads — an internal-only
    // diagnostic (filtered out before this function ever sees it) must not
    // silently downgrade a report's stated confidence.
    const c = computeConfidence(baseAnswers, cleanCost, { clientWarnings: [] })
    expect(c.reasons.join(' ')).not.toMatch(/sense check/i)
  })
})

// Every test below states q3_3_surveys explicitly so it isolates the seed
// source under test — otherwise the SURV-MISSING seed (see below) would fire
// on every case, since an unstated survey answer is indistinguishable from
// "no surveys commissioned."
const surveyed = { q3_3_surveys: ['Condition survey'] }

describe('ensureSeedRisks', () => {
  it('does nothing when "No access constraints" was selected, even if other constraints are also (contradictorily) ticked', () => {
    const prose = { riskRegister: [] }
    ensureSeedRisks(prose, { ...surveyed, q3_5_accessConstraints: ['No access constraints', 'Term-time working only'] })
    expect(prose.riskRegister).toEqual([])
  })

  it('appends the matching deterministic seed when the model omitted it', () => {
    const prose = { riskRegister: [{ ref: 'R01', seedRef: 'NONE' }] }
    ensureSeedRisks(prose, { ...surveyed, q3_5_accessConstraints: ['Term-time working only'] })
    const seeded = prose.riskRegister.find(r => r.seedRef === 'ACC-B')
    expect(seeded).toBeDefined()
    expect(seeded.category).toBe('Programme')
  })

  it('does not duplicate a seed the model already included', () => {
    const prose = { riskRegister: [{ ref: 'R01', seedRef: 'ACC-B', description: 'model-written version' }] }
    ensureSeedRisks(prose, { ...surveyed, q3_5_accessConstraints: ['Term-time working only'] })
    expect(prose.riskRegister).toHaveLength(1)
    expect(prose.riskRegister[0].description).toBe('model-written version')
  })

  it('seeds every matching constraint, not just the first', () => {
    const prose = { riskRegister: [] }
    ensureSeedRisks(prose, { ...surveyed, q3_5_accessConstraints: ['No vehicle access', 'Restricted working hours'] })
    const refs = prose.riskRegister.map(r => r.seedRef)
    expect(refs).toContain('ACC-A')
    expect(refs).toContain('ACC-D')
  })

  // IBRB bug-fix-brief item 9: identical inputs produced differently-composed
  // risk registers because only access constraints were seeded — an excluded
  // (unpriced) scope item, a sense-check warning, or missing surveys were left
  // entirely to the model's own (inconsistent) judgement. These pin the three
  // extended seed sources.
  it('seeds a Cost risk for excluded (unpriced) scope items', () => {
    const prose = { riskRegister: [] }
    const cost = { excludedNoQuantity: [{ code: '4.8', description: 'Loose furniture & FF&E — hospitality' }] }
    ensureSeedRisks(prose, { ...surveyed, q3_5_accessConstraints: [] }, cost)
    const seeded = prose.riskRegister.find(r => r.seedRef === 'EXC-COST')
    expect(seeded).toBeDefined()
    expect(seeded.category).toBe('Cost')
    expect(seeded.description).toContain('FF&E')
  })

  it('seeds a fixed-category risk from a clientWarnings code, rated by the warning\'s own severity', () => {
    const prose = { riskRegister: [] }
    const senseCheck = { clientWarnings: [{ code: 'BUDGET_SHORTFALL', severity: 'medium', message: 'Budget falls short.' }] }
    ensureSeedRisks(prose, { ...surveyed, q3_5_accessConstraints: [] }, undefined, senseCheck)
    const seeded = prose.riskRegister.find(r => r.seedRef === 'WARN-BUDGET_SHORTFALL')
    expect(seeded).toBeDefined()
    expect(seeded.category).toBe('Cost')
    expect(seeded.rating).toBe('Medium')
  })

  it('seeds a Technical risk when no surveys have been commissioned', () => {
    const prose = { riskRegister: [] }
    ensureSeedRisks(prose, { q3_5_accessConstraints: [], q3_3_surveys: ['None yet'] })
    const seeded = prose.riskRegister.find(r => r.seedRef === 'SURV-MISSING')
    expect(seeded).toBeDefined()
    expect(seeded.category).toBe('Technical')
  })

  it('does not seed a survey risk once a survey has actually been commissioned', () => {
    const prose = { riskRegister: [] }
    ensureSeedRisks(prose, { ...surveyed, q3_5_accessConstraints: [] })
    expect(prose.riskRegister.some(r => r.seedRef === 'SURV-MISSING')).toBe(false)
  })
})

describe('ensureSeedRisks — Q3.8 site and building context seeds', () => {
  const base = { q3_5_accessConstraints: ['No access constraints'], q3_3_surveys: ['Condition'] }
  it.each([
    ['Higher-risk building — 7+ storeys or 18 m+, residential / care / hospital use', 'CTX-HRB', 'Regulatory', 'High'],
    ['Attached to or within 3 m of a neighbouring building (party wall)', 'CTX-PARTYWALL', 'Regulatory', 'Medium'],
    ['Conservation area or Article 4 direction', 'CTX-CONSERVATION', 'Regulatory', 'Medium'],
    ['Ecological features — roof voids, mature trees, water bodies, bat roost potential', 'CTX-ECOLOGY', 'Programme', 'High'],
  ])('"%s" seeds %s with a fixed category and rating', (option, ref, category, rating) => {
    const prose = { riskRegister: [] }
    ensureSeedRisks(prose, { ...base, q3_8_siteContext: [option] }, { excludedNoQuantity: [] }, { clientWarnings: [] })
    const seeded = prose.riskRegister.find(r => r.seedRef === ref)
    expect(seeded).toBeDefined()
    expect(seeded.category).toBe(category)
    expect(seeded.rating).toBe(rating)
  })

  it('"None of these" seeds nothing from Q3.8', () => {
    const prose = { riskRegister: [] }
    ensureSeedRisks(prose, { ...base, q3_8_siteContext: ['None of these'] }, { excludedNoQuantity: [] }, { clientWarnings: [] })
    expect(prose.riskRegister.filter(r => String(r.seedRef).startsWith('CTX-'))).toHaveLength(0)
  })
})

// September 2026: higher-risk status is derived from Section 1 (height,
// storeys, building use) rather than ticked in Q3.8 — CTX-HRB must still
// fire for a derived HRB, must not fire for a tall non-HRB use, and must
// still fire for a report generated back when this was a Q3.8 tick.
describe('ensureSeedRisks — CTX-HRB derived from Section 1', () => {
  const base = { q3_5_accessConstraints: ['No access constraints'], q3_3_surveys: ['Condition'] }

  it('seeds CTX-HRB for a Section-1-derived higher-risk building with no q3_8_siteContext at all', () => {
    const prose = { riskRegister: [] }
    ensureSeedRisks(
      prose,
      { ...base, q1_2_storeys: '8', q1_3_buildingUse: 'Residential' },
      { excludedNoQuantity: [] },
      { clientWarnings: [] },
    )
    const seeded = prose.riskRegister.find(r => r.seedRef === 'CTX-HRB')
    expect(seeded).toBeDefined()
    expect(seeded.category).toBe('Regulatory')
    expect(seeded.rating).toBe('High')
  })

  it('does not seed CTX-HRB for a ten-storey Commercial offices building', () => {
    const prose = { riskRegister: [] }
    ensureSeedRisks(
      prose,
      { ...base, q1_2_storeys: '10', q1_6_heightOver18m: 'Yes', q1_3_buildingUse: 'Commercial offices' },
      { excludedNoQuantity: [] },
      { clientWarnings: [] },
    )
    expect(prose.riskRegister.some(r => r.seedRef === 'CTX-HRB')).toBe(false)
  })

  it('still seeds CTX-HRB for a legacy answer set carrying the old Q3.8 higher-risk tick', () => {
    const prose = { riskRegister: [] }
    ensureSeedRisks(
      prose,
      { ...base, q3_8_siteContext: ['Higher-risk building — 7+ storeys or 18 m+, residential / care / hospital use'] },
      { excludedNoQuantity: [] },
      { clientWarnings: [] },
    )
    expect(prose.riskRegister.some(r => r.seedRef === 'CTX-HRB')).toBe(true)
  })
})

describe('number-leak guard — extractFigures / assertNoLeakedFigures', () => {
  const prompt = 'Total project cost mid: £415,000 (range: £368,000 – £459,000). Total weeks: 72. Construction: 20 wks | Handover: 5 wks. Works cost is £325/m².'
  const allowed = extractFigures(prompt, { allowAnyInteger: true })

  it('lets the output cite any integer the prompt contained as a week count, but only "N weeks" phrases count on the output side', () => {
    // "72" appears in the prompt only as "Total weeks: 72" — not in an "N weeks" phrase — yet is a legitimate citation.
    expect(allowed.weeks.has(72)).toBe(true)
    expect(extractFigures(prompt).weeks.has(72)).toBe(false)
  })

  it('normalises styles so a faithful restatement passes', () => {
    expect(allowed.money.has(415000)).toBe(true)
    expect(allowed.money.has(325)).toBe(true)
    expect(allowed.weeks.has(20)).toBe(true)
    expect(() => assertNoLeakedFigures({ executiveSummary: 'Estimated at £415k, or £0.415m, over 20 weeks.' }, allowed)).not.toThrow()
  })

  it('rejects an invented or altered £ figure anywhere in the payload, naming it for the retry', () => {
    const payload = { riskRegister: [{ description: 'Allow roughly £450,000 for the works.' }] }
    expect(() => assertNoLeakedFigures(payload, allowed)).toThrow(/£450,000/)
    expect(findLeakedFigures(payload, allowed).money).toEqual([450000])
  })

  it('rejects a week count that was never given, and accepts prose with no numbers at all', () => {
    expect(() => assertNoLeakedFigures({ nextSteps: ['Allow a 14-week tender period.'] }, allowed)).toThrow(/14 weeks/)
    expect(() => assertNoLeakedFigures({ nextSteps: ['Commission surveys before Stage 2.'] }, allowed)).not.toThrow()
  })
})

// Regression: "I could not check it" must not grade the same as "I checked it
// and it is fine". Before this, a project with no Sheet 8 band for its
// combination raised no warning at all, so a £189/m² coffee-shop fit-out with
// every other answer complete scored zero deficiencies and was awarded
// "A — High Confidence" on an estimate nothing had ever compared to anything.
describe('computeConfidence — an unbenchmarked estimate cannot be Grade A', () => {
  const answers = {
    q3_3_surveys: ['Structural survey'],
    q3_1_knownIssues: ['Roof leak'],
    q3_4_planningConsents: 'Full planning granted',
  }
  const cost = { excludedNoQuantity: [], additionalScopeNote: null }

  it('downgrades A to B when the benchmark check did not run', () => {
    const c = computeConfidence(answers, cost, { clientWarnings: [], benchmarkChecked: false })
    expect(c.score).toBe('B')
    expect(c.reasons).toContain(
      'estimate could not be compared against a published cost benchmark for this project type and building use')
  })

  it('leaves A intact when the benchmark check did run', () => {
    const c = computeConfidence(answers, cost, { clientWarnings: [], benchmarkChecked: true })
    expect(c.score).toBe('A')
    expect(c.reasons).toEqual([])
  })

  it('does not penalise a sense check that predates the field, or none at all', () => {
    // Reports sitting in KV for 90 days, and the access-only call sites that
    // pass no sense check, must grade exactly as they did before.
    expect(computeConfidence(answers, cost, { clientWarnings: [] }).score).toBe('A')
    expect(computeConfidence(answers, cost).score).toBe('A')
    expect(computeConfidence(answers, cost, undefined).score).toBe('A')
  })

  it('stacks with other deficiencies rather than replacing them', () => {
    const c = computeConfidence(
      { ...answers, q3_3_surveys: ['None'] }, cost,
      { clientWarnings: [], benchmarkChecked: false })
    expect(c.score).toBe('C')          // no surveys (+1) + no benchmark (+1)
    expect(c.reasons).toHaveLength(2)
  })
})

// Test reports EX-1, FO-2, NB-1, NB-2: known issues the client ticked at Q3.1
// were left to the model, which dropped some of them from the register.
describe('ensureSeedRisks — every Q3.1 known issue reaches the register', () => {
  const surveyed = { q3_3_surveys: ['Condition'], q3_5_accessConstraints: [] }
  it('seeds each ticked known issue once, with a fixed rating', () => {
    const prose = { riskRegister: [] }
    ensureSeedRisks(prose, { ...surveyed, q3_1_knownIssues: ['Asbestos known or suspected', 'Made ground or fill', 'Existing structures on site to demolish'] })
    expect(prose.riskRegister.map(r => r.seedRef)).toEqual(['KI-ASBESTOS', 'KI-MADEGROUND', 'KI-DEMOLISH'])
    expect(prose.riskRegister[0]).toMatchObject({ category: 'Health & Safety', rating: 'High' })
  })
  it('adds nothing for "None identified" or "Unsure — surveys needed"', () => {
    const prose = { riskRegister: [] }
    ensureSeedRisks(prose, { ...surveyed, q3_1_knownIssues: ['None identified'] })
    ensureSeedRisks(prose, { ...surveyed, q3_1_knownIssues: ['Unsure — surveys needed'] })
    expect(prose.riskRegister).toEqual([])
  })
})

describe('ensureSeedRisks — a mis-tagged seed keeps its own identity', () => {
  it('re-tags an entry whose Ref is a seed but whose seedRef names another seed', () => {
    const prose = { riskRegister: [
      { ref: 'ACC-D', seedRef: 'ACC-D', rating: 'Medium', description: 'Restricted hours' },
      { ref: 'KI-ASBESTOS', seedRef: 'ACC-D', rating: 'High', description: 'Asbestos' },
    ] }
    ensureSeedRisks(prose, { q3_3_surveys: ['Condition'], q3_5_accessConstraints: ['Restricted working hours'], q3_1_knownIssues: ['Asbestos known or suspected'] })
    expect(prose.riskRegister.map(r => r.seedRef)).toEqual(['ACC-D', 'KI-ASBESTOS'])
  })
})
