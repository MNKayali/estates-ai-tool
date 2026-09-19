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

describe('programmeCalculator — programme float (Modifiers PROG-FLOAT)', () => {
  it('adds one week of float per 13 weeks of critical path and reports the best case alongside the headline', async () => {
    const p = await calculateProgramme({ ...BASE, q1_5_size: '850' }, 500_000)
    expect(p.floatWeeks).toBe(Math.ceil(p.totalWeeksBestCase / 13))
    expect(p.totalWeeks).toBe(p.totalWeeksBestCase + p.floatWeeks)
    expect(p.stages.some(s => s.stage === 'Programme float' && s.weeks === p.floatWeeks)).toBe(true)
    expect(p.assumptions.join(' ')).toMatch(/programme float of \d+ week/i)
  })
})

describe('programmeCalculator — FastTrack levers are offered, never applied', () => {
  it('offers the Speed-triggered levers when Speed is a priority, and none of them when it is not', async () => {
    const calm = await calculateProgramme({ ...BASE, q1_5_size: '850', q4_4_priorities: ['Design quality'] }, 500_000)
    const fast = await calculateProgramme({ ...BASE, q1_5_size: '850', q4_4_priorities: ['Speed'] }, 500_000)
    const ids = fast.fastTrackOptions.map(o => o.id)
    expect(ids).toEqual(expect.arrayContaining(['FT4', 'FT8']))
    expect(ids).not.toContain('FT1')
    expect(calm.fastTrackOptions.map(o => o.id)).not.toContain('FT4')
    // Offering a lever must not shorten the headline programme.
    expect(fast.totalWeeks).toBe(calm.totalWeeks)
  })
})

describe('programmeCalculator — procurement decision table', () => {
  it('falls back to the value-only route and contract bands when the Procurement sheet is absent, and reads the sheet when present', async () => {
    const p = await calculateProgramme({ ...BASE, q1_5_size: '850', q4_4_priorities: ['Speed'] }, 2_000_000)
    expect(typeof p.tenderType).toBe('string')
    expect(typeof p.designResponsibility).toBe('string')
    if (p.procurementSource.startsWith('Procurement table')) {
      // Sheet present: Speed-first at £2m should not land on the plain traditional route.
      expect(p.procurementRoute).not.toBe('Traditional — Single Stage Tender')
      expect(p.procurementRationale.length).toBeGreaterThan(0)
    } else {
      expect(p.procurementRoute).toBe('Traditional — Single Stage Tender')
      expect(p.contractForm).toBe('JCT Standard Building Contract 2024')
      expect(p.tenderType).toBe('Single stage')
    }
  })
})

describe('programmeCalculator — Q3.8 site context (BSR Gateway 2, ecology survey)', () => {
  const HRB = 'Higher-risk building — 7+ storeys or 18 m+, residential / care / hospital use'
  it('adds the Gateway 2 stage on the critical path for a higher-risk building once the BS1 row exists (skips until the workbook is updated)', async ({ skip }) => {
    const plain = await calculateProgramme({ ...BASE, q1_5_size: '2000', q1_2_storeys: '7' }, 3_000_000)
    const hrb = await calculateProgramme({ ...BASE, q1_5_size: '2000', q1_2_storeys: '7', q3_8_siteContext: [HRB] }, 3_000_000)
    if (!hrb.stages.some(s => s.stage === 'BSR Gateway 2')) {
      expect(hrb.bsaGatewayWeeks).toBe(0)
      skip('Durations row BS1 not present in the live workbook yet — see docs/workbook-changes-sept-2026.md')
      return
    }
    expect(hrb.bsaGatewayWeeks).toBeGreaterThan(0)
    expect(hrb.totalWeeksBestCase - plain.totalWeeksBestCase).toBe(hrb.bsaGatewayWeeks)
    expect(hrb.milestones.join(' ')).toMatch(/Gateway 2/)
    expect(hrb.assumptions.join(' ')).toMatch(/Gateway 2/)
  })

  it('never invents a Gateway 2 or ecology duration in code — without the workbook rows the programme is unchanged', async () => {
    const plain = await calculateProgramme({ ...BASE, q1_5_size: '850' }, 500_000)
    const ctx = await calculateProgramme({ ...BASE, q1_5_size: '850', q3_8_siteContext: [HRB, 'Ecological features — roof voids, mature trees, water bodies, bat roost potential'] }, 500_000)
    const hasRows = ctx.stages.some(s => s.stage === 'BSR Gateway 2' || s.stage === 'Ecology Survey')
    if (!hasRows) expect(ctx.totalWeeks).toBe(plain.totalWeeks)
    else expect(ctx.totalWeeks).toBeGreaterThanOrEqual(plain.totalWeeks)
  })
})

describe('programmeCalculator — start date and calendar dates (Q4.0)', () => {
  it('anchors every stage and milestone to the stated start date and tests the target date from it', async () => {
    const p = await calculateProgramme({ ...BASE, q1_5_size: '850', q4_0_startDate: '2027-01-04', q4_1_targetDate: '2027-06-01' }, 500_000)
    expect(p.startDate).toBe('2027-01-04')
    expect(p.startDateAssumed).toBe(false)
    const first = p.stages.find(s => !s.parallel)
    expect(first.startWeek).toBe(0)
    expect(first.startDate).toBe('2027-01-04')
    const last = [...p.stages].reverse().find(s => !s.parallel)
    expect(last.endWeek).toBe(p.totalWeeks)
    expect(p.endDate).toBe(last.endDate)
    expect(p.milestones[0]).toMatch(/^Week 0 \(4 Jan 2027\):/)
    // A June 2027 target for a programme starting January 2027 that runs >60 weeks is not achievable.
    expect(p.targetStatus).toBe('at-risk')
    expect(p.targetNote).toMatch(/stated start of 4 Jan 2027/)
    expect(p.assumptions.join(' ')).toMatch(/stated expected start of 4 Jan 2027/)
  })

  it('assumes the report date when Q4.0 is blank, and says so', async () => {
    const p = await calculateProgramme({ ...BASE, q1_5_size: '850' }, 500_000)
    expect(p.startDateAssumed).toBe(true)
    expect(p.startDate).toBe(new Date().toISOString().slice(0, 10))
    expect(p.assumptions.join(' ')).toMatch(/assume the programme starts on the report date/)
  })
})
