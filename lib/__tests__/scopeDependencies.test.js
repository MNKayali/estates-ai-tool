import { describe, it, expect } from 'vitest'
import { calculateCost, getScopeCatalogue } from '../costCalculator.js'
import { suggestedItemIds, buildContext } from '../scopeEngine.js'
import { scopeGapLines } from '../reportShared.js'

const ANSWERS = {
  q1_0_projectName: 'Flats', q1_1_postcode: 'CV4', q1_2_projectType: 'Refurbishment', q1_2_storeys: '3',
  q1_3_buildingUse: 'Residential', q1_4_buildingAge: '1980–1999', q1_5_size: '3600',
  q2_3_interventionLevel: 'Full systems replacement', q2_4_specLevel: 'Standard',
  // Strip-out, floor finishes, bathrooms, kitchens, power
  q2_2_scopeItems: ['S-0003', 'S-0022', 'S-0025', 'S-0027', 'S-0045'],
  q2_2_quantities: { 'S-0025-01': 50, 'S-0027-01': 50 },
}

describe('scope dependencies (workbook SUGGEST rules, all projects)', () => {
  it('flags the items the chosen scope depends on when they are not ticked', async () => {
    const c = await calculateCost(ANSWERS, 100)
    const missing = c.scopeGaps.dependencies.map(d => d.name)
    expect(missing).toEqual(expect.arrayContaining(['Ventilation', 'Fire stopping', 'Emergency lighting', 'Internal doors', 'Asbestos removal']))
    const vent = c.scopeGaps.dependencies.find(d => d.name === 'Ventilation')
    expect(vent.because).toEqual(expect.arrayContaining(['Bathrooms and en-suites', 'Kitchens']))
    expect(scopeGapLines(c).join(' ')).toMatch(/normally needed with it: .*ventilation \(with/)
  })
  it('does not flag an item once it is ticked', async () => {
    const c = await calculateCost({ ...ANSWERS, q2_2_scopeItems: [...ANSWERS.q2_2_scopeItems, 'S-0041', 'S-0020'] }, 100)
    const missing = c.scopeGaps.dependencies.map(d => d.name)
    expect(missing).not.toContain('Ventilation')
    expect(missing).not.toContain('Fire stopping')
  })
  it('drops a "No" attribute from the line description', async () => {
    const c = await calculateCost(ANSWERS, 100)
    const floor = c.lineItems.find(l => l.code === 'S-0022')
    expect(floor.description).toBe('Floor finishes')
  })
})
