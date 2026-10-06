import { describe, it, expect } from 'vitest'
import { calculateCost } from '../costCalculator.js'

const BASE = {
  q1_0_projectName: 'T', q1_1_postcode: 'B29', q1_2_projectType: 'Refurbishment', q1_2_storeys: '2',
  q1_3_buildingUse: 'Commercial offices', q1_4_buildingAge: '1980–1999', q1_5_size: '850',
  q2_1_objective: 'T', q2_2_scopeItems: ['S-0021', 'S-0022'],
  q2_3_interventionLevel: 'Full systems replacement', q2_4_specLevel: 'Standard',
  q3_1_knownIssues: [], q3_3_surveys: ['Condition'], q3_4_planningConsents: 'No consent required',
  q3_5_accessConstraints: ['No access constraints'], q3_6_occupation: 'Vacant or decanted',
  q4_5_designStage: 'Stage 0–1', q4_6_phasing: 'Single phase', q4_7_funding: 'Internal / commercial',
}
const prelims = async (over, weeks = 30) => (await calculateCost({ ...BASE, ...over }, weeks)).percentages.prelims

describe('prelims: 7–11% outside London, higher in London', () => {
  it('a relaxed, vacant job with no restrictions sits at the 7% floor', async () => {
    expect(await prelims({})).toBe(7)
  })
  it('occupation, restricted hours and a long programme approach the 11% ceiling', async () => {
    expect(await prelims({ q3_6_occupation: 'Fully occupied', q3_5_accessConstraints: ['Restricted working hours', 'Shared access with other occupiers'] }, 100)).toBe(10.5)
  })
  it('a condensed programme (hard deadline, speed first) pushes prelims up', async () => {
    const relaxed = await prelims({})
    const hard = await prelims({ q4_1_targetDate: '2027-09-01' })
    const speed = await prelims({ q4_4_priorities: ['Speed'] })
    expect(hard).toBe(relaxed + 1.5)
    expect(speed).toBe(relaxed + 1)
    expect(await prelims({ q4_1_targetDate: '2027-09-01', q4_4_priorities: ['Speed'], q3_6_occupation: 'Fully occupied' }, 100)).toBeLessThanOrEqual(11)
  })
  it('London is higher, and may exceed the 11% cap', async () => {
    const outside = await prelims({})
    expect(await prelims({ q1_1_postcode: 'BR1' })).toBe(outside + 2)          // Outer London
    expect(await prelims({ q1_1_postcode: 'EC1' })).toBe(outside + 3)          // Inner London
    const heavy = { q1_1_postcode: 'EC1', q3_6_occupation: 'Fully occupied', q3_5_accessConstraints: ['Restricted working hours'], q4_1_targetDate: '2027-09-01' }
    expect(await prelims(heavy, 100)).toBeGreaterThan(11)
    expect(await prelims(heavy, 100)).toBeLessThanOrEqual(14)
  })
})
