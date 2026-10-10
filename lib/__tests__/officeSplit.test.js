// Industrial / warehouse new build and extensions (owner, 10 Oct 2026; NRM1
// v5.22): the floor is split into offices & welfare (Q1.3a, suggested by the
// workbook's office_share) and the main space (Q1.3b). Fit-out items are
// measured on the offices; services also on a production floor; no rate moves.
import { describe, it, expect } from 'vitest'
import { calculateCost } from '../costCalculator.js'
import { loadNrmWorkbook } from '../nrmWorkbook.js'
import { officeSplitLine } from '../reportShared.js'
import { asksOfficeSplit, isQuestionRequired, unansweredRequired, MAIN_SPACE } from '../questionSets.js'

const SHED = {
  q1_1_postcode: 'WF1', q1_2_projectType: 'New Build', q1_2_storeys: '1', q1_3_buildingUse: 'Industrial / warehouse',
  q1_5_size: '12500', q2_4_specLevel: 'Standard',
  q2_2_scopeItems: ['S-0011', 'S-0018', 'S-0022', 'S-0039', 'S-0046'],   // frame, internal walls, floor finishes, heating, lighting
}
const qty = (cost, id) => cost.lineItems.filter(l => l.code === id).reduce((t, l) => t + l.qty, 0)

describe('workbook v5.22 — the split lives in the NRM1 workbook', () => {
  it('holds the suggestion and the two inputs', async () => {
    const s = (await loadNrmWorkbook()).settings
    expect(s.ratios.find(r => r.key === 'office_share' && r.use === 'ALL')?.value).toBe(0.1)
    expect(s.inputs.OFFICES.default).toBe('GIFA * r.office_share')
    expect(s.inputs.PRODUCTION.default).toBe('0')
  })
})

describe('pricing the split', () => {
  it('blank share: fit-out and services on the suggested 10%, the shell and lighting on the whole floor', async () => {
    const c = await calculateCost({ ...SHED, q1_3b_mainSpace: MAIN_SPACE.storage }, 60, 36)
    expect(qty(c, 'S-0018')).toBe(1250)
    expect(qty(c, 'S-0022')).toBe(1250)
    expect(qty(c, 'S-0039')).toBe(1250)
    expect(qty(c, 'S-0011')).toBe(12500)
    expect(qty(c, 'S-0046')).toBe(12500)
    expect(c.officeSplit).toMatchObject({ gifa: 12500, offices: 1250, suggested: true })
  })
  it('factory: services also cover the production floor; partitions and finishes do not', async () => {
    const c = await calculateCost({ ...SHED, q1_3b_mainSpace: MAIN_SPACE.factory }, 60, 36)
    expect(qty(c, 'S-0039')).toBe(12500)
    expect(qty(c, 'S-0018')).toBe(1250)
  })
  it("the client's share replaces the suggestion", async () => {
    const c = await calculateCost({ ...SHED, q1_3a_officeShare: '20', q1_3b_mainSpace: MAIN_SPACE.storage }, 60, 36)
    expect(qty(c, 'S-0018')).toBe(2500)
    expect(c.officeSplit.suggested).toBe(false)
  })
  it('leaves every other case on GIFA: another use, or an industrial refurbishment', async () => {
    const school = await calculateCost({ ...SHED, q1_3_buildingUse: 'Education' }, 60, 36)
    expect(qty(school, 'S-0018')).toBe(12500)
    expect(school.officeSplit).toBeNull()
    const refurb = await calculateCost({ ...SHED, q1_2_projectType: 'Refurbishment', q2_3_interventionLevel: 'Full systems replacement', q1_4_buildingAge: '1980–1999' }, 60, 36)
    expect(qty(refurb, 'S-0039')).toBe(12500)
    expect(refurb.officeSplit).toBeNull()
  })
})

describe('the questions and the assumption line', () => {
  it('asks Q1.3a / Q1.3b only for Industrial / warehouse on New build and Extension; Q1.3b is required there', () => {
    expect(asksOfficeSplit(SHED)).toBe(true)
    expect(asksOfficeSplit({ ...SHED, q1_2_projectType: 'Extension' })).toBe(true)
    expect(asksOfficeSplit({ ...SHED, q1_2_projectType: 'Refurbishment' })).toBe(false)
    expect(asksOfficeSplit({ ...SHED, q1_3_buildingUse: 'Retail' })).toBe(false)
    expect(isQuestionRequired('q1_3a_officeShare', 'New Build')).toBe(false)
    expect(unansweredRequired(1, 'New Build', SHED)).toContain('q1_3b_mainSpace')
    expect(unansweredRequired(1, 'New Build', { ...SHED, q1_3_buildingUse: 'Retail' })).not.toContain('q1_3b_mainSpace')
  })
  it('says what was assumed, and whose figure it is', () => {
    const base = { gifa: 12500, offices: 1250, mainSpace: MAIN_SPACE.storage, suggested: true }
    expect(officeSplitLine({ officeSplit: base })).toBe('Industrial building: 10% of the floor (1,250 m²) is priced as offices and welfare with full fit-out; the remaining 11,250 m² as storage / warehouse (structure, envelope, lighting, fire alarm and drainage). Suggested split — change it if you know the real one.')
    expect(officeSplitLine({ officeSplit: { ...base, mainSpace: MAIN_SPACE.factory, suggested: false } })).toMatch(/factory \/ production space .* Split as stated by the client\.$/)
    expect(officeSplitLine({})).toBe('')
  })
})
