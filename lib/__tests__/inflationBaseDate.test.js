import { describe, it, expect } from 'vitest'
import { calculateCost } from '../costCalculator.js'
import { runDeterministicPipeline, constructionMidDate } from '../pipeline.js'
import { percentageLines } from '../reportContent.js'

const BASE = {
  q1_0_projectName: 'T', q1_1_postcode: 'B29', q1_2_projectType: 'Refurbishment', q1_2_storeys: '2',
  q1_3_buildingUse: 'Commercial offices', q1_4_buildingAge: '1980–1999', q1_5_size: '850',
  q2_2_scopeItems: ['S-0021', 'S-0022'], q2_3_interventionLevel: 'Full systems replacement', q2_4_specLevel: 'Standard',
  q3_3_surveys: ['Condition'], q3_4_planningConsents: 'No consent required', q3_6_occupation: 'Vacant or decanted',
  q4_5_designStage: 'Concept complete (Stage 2)', q4_6_phasing: 'Single phase', q4_7_funding: 'Internal / commercial',
}

describe('inflation from the rate base date (workbook v5.17)', () => {
  it('compounds 3.5% a year from 15 Aug 2026 to mid-construction', async () => {
    const c = await calculateCost(BASE, 100, 40, { constructionMid: '2028-07-03' })
    const years = (new Date('2028-07-03') - new Date('2026-08-15')) / (365.25 * 86400000)
    expect(c.percentages.inflation).toBeCloseTo(Math.round((Math.pow(1.035, years) - 1) * 1000) / 10, 5)
    expect(c.percentages.inflation).toBeCloseTo(6.7, 1)
    expect(c.baseDate).toBe('Q3 2026')
    expect(c.inflationBasis).toMatchObject({ baseDate: '2026-08-15', annualPct: 3.5, constructionMid: '2028-07-03' })
  })
  it('caps at 12%', async () => {
    const c = await calculateCost(BASE, 300, 100, { constructionMid: '2031-01-01' })
    expect(c.percentages.inflation).toBe(12)
  })
  it('the build-up line says where it was measured from and to', async () => {
    const c = await calculateCost(BASE, 100, 40, { constructionMid: '2028-07-03' })
    const line = percentageLines(c).find(l => l.name === 'Inflation')
    expect(line.text).toMatch(/^3\.5% a year from the rate base date \(Q3 2026\) to mid-construction \(Jul 2028\), \d+(\.\d)? months$/)
  })
  it('the pipeline measures to the programme\'s own construction mid-point', async () => {
    const { cost, programme } = await runDeterministicPipeline({ ...BASE, q4_0_startDate: '2027-01-04', q4_4_priorities: [] })
    const mid = constructionMidDate(programme)
    expect(mid).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(cost.inflationBasis.constructionMid).toBe(mid)
    expect(cost.percentages.inflation).toBeGreaterThan(0)
  })
})
