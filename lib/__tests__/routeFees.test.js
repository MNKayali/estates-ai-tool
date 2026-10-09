import { describe, it, expect } from 'vitest'
import { calculateCost } from '../costCalculator.js'
import { projectCostRows } from '../reportContent.js'

const BASE = {
  q1_0_projectName: 'T', q1_1_postcode: 'B29', q1_2_projectType: 'Refurbishment', q1_2_storeys: '2',
  q1_3_buildingUse: 'Commercial offices', q1_4_buildingAge: '1980–1999', q1_5_size: '850',
  q2_2_scopeItems: ['S-0021', 'S-0022'], q2_3_interventionLevel: 'Full systems replacement', q2_4_specLevel: 'Standard',
  q3_3_surveys: ['Condition'], q3_4_planningConsents: 'No consent required', q3_6_occupation: 'Vacant or decanted',
  q4_5_designStage: 'Concept complete (Stage 2)', q4_6_phasing: 'Single phase', q4_7_funding: 'Internal / commercial',
}
const run = (route, over = {}) => calculateCost({ ...BASE, ...over }, 100, 40, { constructionMid: '2028-01-01', procurementRoute: route })

describe('professional fees by procurement route (workbook v5.18)', () => {
  it('traditional leaves fees on the design-stage ladder', async () => {
    const t = await run('Traditional')
    const none = await run(null)
    expect(t.percentages.fees).toBe(none.percentages.fees)
    expect(t.percentages.contractorDesign).toBe(0)
  })
  it('design and build: client fees −3 points, contractor\'s design 2% as its own row', async () => {
    const t = await run('Traditional'), d = await run('Design and build (single stage)')
    expect(d.percentages.fees).toBe(t.percentages.fees - 3)
    expect(d.percentages.contractorDesign).toBe(2)
    expect(d.trace.fees.some(e => /^design and build: contractor does Stage 4$/.test(e.label))).toBe(true)
    const rows = projectCostRows(d)
    const design = rows.find(r => r.label === "Contractor's design")
    expect(design.rate).toBe('2% of construction')
    const sum = k => rows.filter(r => r.kind === 'row' && r.label !== 'Works cost').reduce((s, r) => s + r[k], 0)
    expect(sum('low') + d.works.low).toBe(d.total.low)
  })
  it('two-stage: −1.5 points and 1% contractor\'s design', async () => {
    const t = await run('Traditional'), p = await run('Two-stage (PCSA)')
    expect(p.percentages.fees).toBe(t.percentages.fees - 1.5)
    expect(p.percentages.contractorDesign).toBe(1)
  })
  it('changes nothing once the client has finished Stage 4', async () => {
    const over = { q4_5_designStage: 'Technical design complete (Stage 4)' }
    const t = await run('Traditional', over), d = await run('Design and build (single stage)', over)
    expect(d.percentages.fees).toBe(t.percentages.fees)
    expect(d.percentages.contractorDesign).toBe(0)
  })
})
