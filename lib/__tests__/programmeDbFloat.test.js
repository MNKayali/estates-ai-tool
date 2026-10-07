import { describe, it, expect } from 'vitest'
import { calculateProgramme } from '../programmeCalculator.js'
import { selectMilestones } from '../reportContent.js'

const ANSWERS = {
  q1_0_projectName: 'T', q1_1_postcode: 'B29', q1_2_projectType: 'Refurbishment', q1_2_storeys: '2',
  q1_4_buildingAge: '1980–1999', q1_5_size: '3600', q2_3_interventionLevel: 'Full systems replacement',
  q3_3_surveys: ['Condition'], q3_4_planningConsents: 'No consent required', q3_5_accessConstraints: [],
  q3_6_occupation: 'Fully occupied', q4_5_designStage: 'Stage 0–1', q4_6_phasing: 'Single phase',
  q4_7_funding: 'Internal / commercial', q4_0_startDate: '2027-01-04',
}
const DB = { preferred: { route: { name: 'Design and build (single stage)' }, routeToMarket: { name: 'Selective tender', tenderId: 'TN1' }, contract: { jct: 'JCT DB' } } }
const TRAD = { preferred: { route: { name: 'Traditional (single stage)' }, routeToMarket: { name: 'Selective tender', tenderId: 'TN1' }, contract: { jct: 'JCT SBC' } } }
const order = p => p.stages.filter(s => !s.parallel).map(s => s.stage)

describe('design and build ordering', () => {
  it('tenders before Stage 4 and gives Stage 4 to the contractor', async () => {
    const p = await calculateProgramme(ANSWERS, 3_000_000, { procurement: DB })
    const o = order(p)
    expect(o.indexOf('Tender / Procurement')).toBeLessThan(o.indexOf('Stage 4'))
    expect(p.stages.find(s => s.stage === 'Stage 4').activity).toMatch(/contractor design/i)
  })
  it('keeps traditional order for a traditional route, and the same total either way', async () => {
    const t = await calculateProgramme(ANSWERS, 3_000_000, { procurement: TRAD })
    const d = await calculateProgramme(ANSWERS, 3_000_000, { procurement: DB })
    const o = order(t)
    expect(o.indexOf('Stage 4')).toBeLessThan(o.indexOf('Tender / Procurement'))
    expect(d.totalWeeks).toBe(t.totalWeeks)
  })
})

describe('float and completion', () => {
  it('puts float before Practical Completion, which falls at the end of the programme', async () => {
    const p = await calculateProgramme(ANSWERS, 3_000_000, { procurement: TRAD })
    const o = order(p)
    expect(p.floatWeeks).toBeGreaterThan(0)
    expect(o.indexOf('Programme float')).toBeLessThan(o.indexOf('Handover'))
    expect(o[o.length - 1]).toBe('Handover')
    const pc = selectMilestones(p).find(m => /practical completion/i.test(m.label))
    expect(pc.week).toBe(p.totalWeeks)
    expect(p.milestones.join(' ')).toMatch(new RegExp(`Week ${p.totalWeeks} \(.*\): Practical Completion`))
  })
})

describe('asbestos survey type', () => {
  it('strip-out needs a refurbishment & demolition survey, not a management survey', async () => {
    const p = await calculateProgramme({ ...ANSWERS, q1_4_buildingAge: '1980–1999', q2_2_scopeItems: ['S-0003'] }, 3_000_000, { scope: { tokens: ['Strip-out'], meItemCount: 0 } })
    const s = p.stages.find(x => x.stage === 'Asbestos Survey')
    expect(s?.activity).toMatch(/Refurbishment\/Demolition/)
  })
})
