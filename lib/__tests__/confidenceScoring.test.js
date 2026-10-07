import { describe, it, expect } from 'vitest'
import { calculateCost } from '../costCalculator.js'
import { computeConfidence } from '../prose.js'

// Lakeside S&F as reviewed in report FEBD83A5: a partly occupied 1960s
// refurbishment, management and condition surveys only, strip-out.
const LAKESIDE = {
  q1_0_projectName: 'Lakeside', q1_1_postcode: 'CV4 7AL', q1_2_projectType: 'Refurbishment', q1_2_storeys: '3',
  q1_3_buildingUse: 'Residential', q1_4_buildingAge: '1960–1979', q1_5_size: '3600',
  q2_3_interventionLevel: 'Full systems replacement', q2_4_specLevel: 'Standard',
  q2_2_scopeItems: ['S-0003', 'S-0021', 'S-0022', 'S-0023', 'S-0025', 'S-0027', 'S-0040', 'S-0045', 'S-0046', 'S-0049', 'S-0052'],
  q2_2_quantities: { 'S-0025-01': 50, 'S-0027-01': 50 },
  q3_1_knownIssues: ['Ageing or inadequate M&E'], q3_3_surveys: ['Asbestos management survey', 'Condition'],
  q3_4_planningConsents: 'No consent required', q3_5_accessConstraints: ['Restricted working hours'],
  q3_6_occupation: 'Partially occupied', q4_5_designStage: 'Concept complete (Stage 2)',
}
// A vacant new build with its site surveys done and the design past Stage 2.
const CLEAN_NEW_BUILD = {
  q1_0_projectName: 'NB', q1_1_postcode: 'B15', q1_2_projectType: 'New Build', q1_2_storeys: '2',
  q1_3_buildingUse: 'Commercial offices', q1_5_size: '800', q2_4_specLevel: 'Standard',
  q2_2_scopeItems: ['S-0008', 'S-0011', 'S-0021'], q2_2_quantities: {},
  q3_1_knownIssues: ['None known'], q3_3_surveys: ['Topographic', 'Ground investigation'],
  q3_4_planningConsents: 'Full planning', q3_6_occupation: 'Vacant or decanted',
  q4_5_designStage: 'Concept complete (Stage 2)',
}
const grade = async a => computeConfidence(a, await calculateCost(a, 100), { clientWarnings: [], benchmarkChecked: true })

describe('confidence grade from the workbook ▶ confidence table', () => {
  it('Lakeside is no better than C, and says why', async () => {
    const c = await grade(LAKESIDE)
    expect(['C', 'D']).toContain(c.score)
    expect(c.factors.map(f => f.key)).toEqual(expect.arrayContaining(['EXISTING_BUILDING', 'NO_RD_SURVEY', 'OCCUPIED_PARTIAL']))
    expect(c.reasons.length).toBe(c.factors.length)
  })
  it('a design not yet past Stage 0–1 is capped at B', async () => {
    const c = await grade({ ...CLEAN_NEW_BUILD, q4_5_designStage: 'Concept only (Stage 0–1)' })
    expect(c.score >= 'B').toBe(true)
    expect(c.factors.map(f => f.key)).toContain('STAGE_0_1')
  })
  it('an existing building with neither a condition nor an R&D survey is capped at C', async () => {
    const c = await grade({ ...LAKESIDE, q3_3_surveys: ['Fire risk assessment'], q3_6_occupation: 'Vacant or decanted', q1_4_buildingAge: '2000–2019' })
    expect(c.score >= 'C').toBe(true)
  })
  it('a clean, surveyed new build can still be A', async () => {
    const c = await grade(CLEAN_NEW_BUILD)
    expect(c.points).toBeLessThanOrEqual(1)
    expect(c.score).toBe('A')
  })
})

describe('the report shows what set the grade', () => {
  it('prints the scored factors in the cost assumptions', async () => {
    const { costAssumptionLines, confidenceFactorsLine } = await import('../reportContent.js')
    const cost = await calculateCost(LAKESIDE, 100)
    const c = computeConfidence(LAKESIDE, cost, { clientWarnings: [], benchmarkChecked: true })
    const line = confidenceFactorsLine(c, cost)
    expect(line).toMatch(new RegExp(`for a Grade ${c.score} estimate, scored on: `))
    expect(line).toMatch(/existing building/)
    expect(line).not.toMatch(/\(refurbishment, fit-out/)
    expect(costAssumptionLines(cost, LAKESIDE, c)).toContain(line)
    expect(confidenceFactorsLine({ score: 'B', reasons: ['old'] })).toBe('')
  })
})
