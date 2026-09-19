import { describe, it, expect } from 'vitest'
import { runDeterministicPipeline } from '../pipeline.js'

// Workbook-backed (RATES_FILE_URL / PROGRAMME_FILE_URL), like the calculator
// tests. Pins the one sequence generate-report and /api/compare both run.
const BASE = {
  q1_0_projectName: 'Pipeline',
  q1_1_postcode: 'B29',
  q1_2_projectType: 'Refurbishment',
  q1_2_storeys: '2',
  q1_3_buildingUse: 'Commercial offices',
  q1_4_buildingAge: '1980–1999',
  q1_5_size: '850',
  q2_1_objective: 'Pipeline scenario.',
  q2_2_scopeItems: ['0.5', '3.1', '3.2', '5.1', '5.2', '5.8a'],
  q2_2_quantities: {},
  q2_3_interventionLevel: 'Full systems replacement',
  q2_4_specLevel: 'Standard',
  q3_1_knownIssues: [],
  q3_3_surveys: ['None'],
  q3_4_planningConsents: 'No consent required',
  q3_5_accessConstraints: [],
  q3_6_occupation: 'Fully occupied',
  q4_3_budget: '600000',
  q4_5_designStage: 'Concept only (Stage 0–1)',
  q4_6_phasing: 'Single phase',
  q4_7_funding: 'Internal / commercial',
}

describe('runDeterministicPipeline', () => {
  it('runs cost → programme → cost → sense check → confidence → range pass → budget, and the final cost carries the grade it was ranged with', async () => {
    const { cost, programme, senseCheck, confidence } = await runDeterministicPipeline(BASE)
    expect(programme.totalWeeks).toBeGreaterThan(0)
    expect(cost.rangeApplied.grade).toBe(confidence.score)
    // The inflation band was evaluated with the programme known (second and third passes).
    expect(cost.trace.inflation.length).toBeGreaterThan(0)
    // Budget verdict is recomputed from the FINAL (ranged) cost.
    expect(senseCheck.budget.status).not.toBe('none')
    expect(senseCheck.budget.grossLow).toBe(Math.round(cost.total.low * (1 + cost.vatPct / 100) / 1000) * 1000)
  })

  it('a spec-level variant moves the works cost but not the postcode, scope or programme inputs', async () => {
    const std = await runDeterministicPipeline(BASE)
    const high = await runDeterministicPipeline({ ...BASE, q2_4_specLevel: 'High' })
    expect(high.cost.works.mid).toBeGreaterThan(std.cost.works.mid)
    expect(high.cost.bcisRegion).toBe(std.cost.bcisRegion)
    expect(high.cost.lineItems.map(l => l.code)).toEqual(std.cost.lineItems.map(l => l.code))
  })
})
