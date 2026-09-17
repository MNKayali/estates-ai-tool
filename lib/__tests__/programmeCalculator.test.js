import { describe, it, expect } from 'vitest'
import { calculateProgramme } from '../programmeCalculator.js'

/**
 * Fetches the real remote Programme workbook (PROGRAMME_FILE_URL) — see the
 * file header in costCalculator.test.js for why there is no offline mock.
 *
 * sizeBand(gifa): <150→S1 · ≤250→S2 · ≤500→S3 · ≤1500→S4 · ≤3000→S5 · >3000→S6
 * (documented in CLAUDE.md). One unified band scheme drives both design and
 * construction durations, so getting a boundary wrong silently mis-prices an
 * entire programme, not just one row.
 */
const BASE = {
  q1_0_projectName: 'Test',
  q1_1_postcode: 'B29',
  q1_2_projectType: 'Refurbishment',
  q1_2_storeys: '2',
  q1_4_buildingAge: '1980–1999',
  q2_3_interventionLevel: 'Full systems replacement',
  q3_3_surveys: ['Condition'],
  q3_4_planningConsents: 'No consent required',
  q3_5_accessConstraints: [],
  q3_6_occupation: 'Fully occupied',
  q4_5_designStage: 'Stage 0–1',
  q4_6_phasing: 'Single phase',
  q4_7_funding: 'Internal / commercial',
}

describe('programmeCalculator — size band boundaries', () => {
  it.each([
    // <150→S1 is an *exclusive* upper bound — 150 itself falls to the next
    // bracket (≤250→S2), not S1. Only a value strictly below 150 is S1.
    [149, 'S1'],
    [150, 'S2'], [250, 'S2'],
    [251, 'S3'], [500, 'S3'],
    [501, 'S4'], [1500, 'S4'],
    [1501, 'S5'], [3000, 'S5'],
    [3001, 'S6'],
  ])('GIFA %i m² selects band %s', async (gifa, expectedBand) => {
    const programme = await calculateProgramme({ ...BASE, q1_5_size: String(gifa) }, 500_000)
    expect(programme.sizeBandUsed).toBe(expectedBand)
  })

  it('a larger size band never produces a shorter total programme than a smaller one, all else equal', async () => {
    const small = await calculateProgramme({ ...BASE, q1_5_size: '200' }, 300_000)
    const large = await calculateProgramme({ ...BASE, q1_5_size: '2000' }, 2_000_000)
    expect(large.totalWeeks).toBeGreaterThanOrEqual(small.totalWeeks)
  })
})

describe('programmeCalculator — access-constraint uplift (ACC-1 / ACC-2)', () => {
  it('applies the ACC-1 tier for restricted hours / shared access, and states it in the assumptions', async () => {
    const noAccess = await calculateProgramme({ ...BASE, q1_5_size: '300', q3_5_accessConstraints: [] }, 500_000)
    const restricted = await calculateProgramme({
      ...BASE, q1_5_size: '300',
      q3_5_accessConstraints: ['Restricted working hours', 'Shared access with other occupiers'],
    }, 500_000)
    expect(restricted.accessUplift).toBe(10)
    expect(restricted.constructionWeeks).toBeGreaterThan(noAccess.constructionWeeks)
    expect(restricted.assumptions.join(' ')).toMatch(/10% construction duration uplift.*access constraints/i)
  })

  it('applies the higher ACC-2 tier for no-vehicle-access / term-time, never stacked with ACC-1', async () => {
    const both = await calculateProgramme({
      ...BASE, q1_5_size: '300',
      q3_5_accessConstraints: ['Restricted working hours', 'No vehicle access or restricted deliveries'],
    }, 500_000)
    expect(both.accessUplift).toBeGreaterThan(10) // ACC-2 tier only, higher than ACC-1's 10 — not stacked with it
    expect(both.accessUplift).toBeLessThan(20)
  })

  it('states no access uplift when no qualifying constraint is selected', async () => {
    const none = await calculateProgramme({ ...BASE, q1_5_size: '300', q3_5_accessConstraints: ['No access constraints'] }, 500_000)
    expect(none.accessUplift).toBe(0)
    expect(none.assumptions.join(' ')).toMatch(/No access-constraint uplift applied/i)
  })
})

describe('programmeCalculator — planning vs building control are stated independently', () => {
  it('never asserts building control is not required purely from a permitted-development planning answer', async () => {
    const programme = await calculateProgramme({
      ...BASE, q1_5_size: '85', q1_2_projectType: 'Fit-out',
      q3_4_planningConsents: 'Permitted development',
    }, 300_000)
    const text = programme.assumptions.join(' ')
    expect(text).not.toMatch(/no statutory planning or building control consent is required/i)
    expect(text).toMatch(/building control.*has not been established/i)
  })
})
