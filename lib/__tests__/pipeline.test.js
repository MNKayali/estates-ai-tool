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

// NRM1 v5.2 stopped asking level of intervention for Extension (brief decision
// 2), but an Extension draft saved before then still carries the answer. The
// cost engine ignored it while the programme still read it, so a stale
// "Fabric and finishes only" (Q23-1, ×0.5) shortened the design stages of a
// project whose cost was priced with no level at all.
describe('runDeterministicPipeline — level of intervention only where the project type uses one', () => {
  const EXT = {
    ...BASE,
    q1_2_projectType: 'Extension',
    q1_2_storeys: '1',
    q1_5_size: '300',
    q2_2_scopeItems: ['S-0008', 'S-0009', 'S-0011', 'S-0015', 'S-0016', 'S-0021'],
  }

  it('a stale answer on an Extension changes neither the cost nor the programme', async () => {
    const without = await runDeterministicPipeline({ ...EXT, q2_3_interventionLevel: undefined })
    const stale = await runDeterministicPipeline({ ...EXT, q2_3_interventionLevel: 'Fabric and finishes only' })
    expect(stale.cost.interventionLevel).toBeNull()
    expect(stale.cost.scopeSummary.interventionLevel).toBeNull()
    expect(stale.cost.total).toEqual(without.cost.total)
    expect(stale.programme.designMultiplier).toBe(without.programme.designMultiplier)
    expect(stale.programme.designWeeks).toBe(without.programme.designWeeks)
    expect(stale.programme.totalWeeks).toBe(without.programme.totalWeeks)
  })

  it('Refurbishment still takes its design duration from the level chosen', async () => {
    const fabric = await runDeterministicPipeline({ ...BASE, q2_3_interventionLevel: 'Fabric and finishes only' })
    const full = await runDeterministicPipeline({ ...BASE, q2_3_interventionLevel: 'Full systems replacement' })
    expect(fabric.cost.scopeSummary.interventionLevel).toBe('Fabric and finishes only')
    expect(fabric.programme.designMultiplier).toBeLessThan(full.programme.designMultiplier)
  })
})
