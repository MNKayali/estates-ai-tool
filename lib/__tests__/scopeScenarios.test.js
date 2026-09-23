import { describe, it, expect } from 'vitest'
import { loadNrmWorkbook } from '../nrmWorkbook.js'
import {
  buildContext, typicalItemIds, resolveSelection, isOffered, isItemAvailable, isRelevant,
  defaultOptionKeys, indexCatalogue,
} from '../scopeEngine.js'
import { calculateCost } from '../costCalculator.js'
import { ensureSeedRisks } from '../prose.js'

/**
 * The seven test scenarios from "Scope of works — brief for Claude Code"
 * (23 September 2026). Each one fails on the v4.5 question map; each "Must
 * see" line in the brief is an expectation here. They run the same scope
 * engine the questionnaire runs and the same cost engine the report prices
 * with, against the v5.2 workbook in the repository.
 */
const cat = await loadNrmWorkbook()
const name = id => indexCatalogue(cat).byId.get(id).name
const BASE = {
  q1_0_projectName: 'Scenario', q1_1_postcode: 'B15',
  q3_3_surveys: ['Condition'], q3_4_planningConsents: 'No consent required',
  q3_6_occupation: 'Vacant or decanted', q4_5_designStage: 'Concept only (Stage 0–1)',
}
const typical = answers => typicalItemIds(cat, buildContext(cat, answers))
const lvl = n => cat.settings.interventionLevels.find(l => l.level === n).name


describe('Scenario 1 — toilet refurbishment (RF · Education · 1900–1979 · 60 m² · intervention 4)', () => {
  const A = () => ({ ...BASE, q1_2_projectType: 'Refurbishment', q1_3_buildingUse: 'Education', q1_4_buildingAge: '1900–1979', q1_5_size: '60', q2_3_interventionLevel: lvl(4) })

  it('"Use typical scope" ticks asbestos, strip-out, internal walls and doors, finishes and full M&E', () => {
    const ids = typical(A()).map(name)
    expect(ids).toEqual(expect.arrayContaining([
      'Asbestos removal', 'Strip-out', 'Internal walls', 'Internal doors',
      'Wall finishes', 'Floor finishes', 'Ceiling finishes',
      'Heating and hot water', 'Water and drainage', 'Ventilation', 'Power', 'Lighting', 'Emergency lighting', 'Fire alarm',
    ]))
  })

  it('lists Toilets first for education, and prices the refined 12 standard + 1 accessible with every m² item on 60 m²', async () => {
    const a = A()
    const ctx = buildContext(cat, a)
    expect(isRelevant(cat.items.find(i => i.name === 'Toilets'), ctx)).toBe(true)
    const toilets = cat.items.find(i => i.name === 'Toilets')
    const std = toilets.options.find(o => o.label === 'Standard').key
    const acc = toilets.options.find(o => o.label === 'Accessible').key
    const cost = await calculateCost({
      ...a,
      q2_2_scopeItems: [...typical(a), toilets.id],
      q2_2_scopeOptions: { [toilets.id]: [std, acc] },
      q2_2_quantities: { [std]: 12, [acc]: 1 },
    }, 0)
    const t = cost.lineItems.filter(l => l.code === toilets.id)
    expect(t.map(l => [l.option, l.qty, l.qtySource])).toEqual([['Standard', 12, 'user'], ['Accessible', 1, 'user']])
    const areaLines = cost.lineItems.filter(l => /^m²/.test(l.unit) && l.code !== 'PS')
    expect(areaLines.length).toBeGreaterThan(8)
    for (const l of areaLines) expect(l.qty, l.description).toBe(60)
  })
})

describe('Scenario 2 — decoration only (RF · Education · Post-2000 · 800 m² · intervention 1)', () => {
  const A = { ...BASE, q1_2_projectType: 'Refurbishment', q1_3_buildingUse: 'Education', q1_4_buildingAge: 'Post-2000', q1_5_size: '800', q2_3_interventionLevel: lvl(1) }

  it('ticks only strip-out and finishes, greys out Group 5 and leaves asbestos unticked', () => {
    expect(typical(A).map(name).sort()).toEqual(['Ceiling finishes', 'Floor finishes', 'Strip-out', 'Wall finishes'])
    const ctx = buildContext(cat, A)
    const g5 = cat.items.filter(i => i.groupNum === 5 && isOffered(i, ctx))
    expect(g5.length).toBeGreaterThan(10)
    for (const it of g5) expect(isItemAvailable(it, ctx), it.name).toBe(false)
  })
})

describe('Scenario 3 — new-build teaching block (NB · Education · 4,000 m² · 3 storeys)', () => {
  const A = { ...BASE, q1_2_projectType: 'New Build', q1_3_buildingUse: 'Education', q1_5_size: '4000', q1_2_storeys: '3', q2_4_specLevel: 'Standard' }

  it('ticks all core groups without level of intervention; footprint 1,333 m²; toilets estimated; one lift; ASHP full system, no kW', async () => {
    const ctx = buildContext(cat, A)
    expect(ctx.usesLevel).toBe(false)
    const ids = typical(A)
    const groups = new Set(ids.map(id => indexCatalogue(cat).byId.get(id).groupNum))
    for (const g of [1, 2, 3, 4, 5, 8]) expect(groups.has(g), `group ${g}`).toBe(true)

    const cost = await calculateCost({ ...A, q2_2_scopeItems: ids }, 0)
    expect(cost.inputs.FOOTPRINT).toBeCloseTo(1333.33, 1)
    expect(cost.interventionLevel).toBeNull()
    const toilets = cost.lineItems.filter(l => l.item === 'Toilets')
    expect(toilets.length).toBeGreaterThan(0)
    for (const l of toilets) expect(l.qtySource).toBe('estimate')
    expect(cost.lineItems.find(l => l.item === 'Lifts')?.qty).toBe(1)
    const heat = cost.lineItems.find(l => l.item === 'Heating and hot water')
    expect(heat.option).toBe('System: Air source heat pump · Scope: Full system')
    expect(heat.unit).toBe('m²')
  })
})

describe('Scenario 4 — boiler to heat pump swap (RF · Education · 3,000 m² · intervention 3)', () => {
  const A = { ...BASE, q1_2_projectType: 'Refurbishment', q1_3_buildingUse: 'Education', q1_4_buildingAge: '1980–1999', q1_5_size: '3000', q2_3_interventionLevel: lvl(3) }

  it('keeps Heating as ASHP plant only and raises the DNO capacity and radiator sizing entries in the risk handling', async () => {
    const heating = cat.items.find(i => i.name === 'Heating and hot water')
    const plant = heating.options.find(o => o.label === 'System: Air source heat pump · Scope: Plant only')
    // At level 3 the drop-downs start on the like-for-like gas boiler (decision 3).
    expect(defaultOptionKeys(heating, buildContext(cat, A))).toEqual([heating.options.find(o => o.label === 'System: Gas boiler · Scope: Full system').key])

    const answers = { ...A, q2_2_scopeItems: [heating.id], q2_2_scopeOptions: { [heating.id]: [plant.key] } }
    const cost = await calculateCost(answers, 0)
    expect(cost.lineItems.find(l => l.code === heating.id).option).toBe(plant.label)
    const risks = cost.scopeEffects.risks.map(r => r.text)
    expect(risks).toEqual(expect.arrayContaining(['electrical capacity and DNO check', 'existing radiators may need upsizing']))

    const prose = { riskRegister: [] }
    ensureSeedRisks(prose, answers, cost, null)
    const seeded = prose.riskRegister.filter(r => r.seedRef.startsWith('SCOPE-'))
    expect(seeded.map(r => r.description).join(' ')).toMatch(/DNO/)
    expect(seeded.map(r => r.description).join(' ')).toMatch(/radiators/)
  })
})

describe('Scenario 5 — car-park EV scheme (EW · 2,500 m² external area)', () => {
  const A = { ...BASE, q1_2_projectType: 'External works only', q1_3_buildingUse: 'Commercial offices', q1_5_size: '2500' }

  it('offers Solar PV, supply upgrade and EV charging with no floor area, and raises the DNO entry', async () => {
    const ctx = buildContext(cat, A)
    const byName = n => cat.items.find(i => i.name === n)
    for (const n of ['Solar PV', 'Electricity supply upgrade', 'EV charging']) expect(isOffered(byName(n), ctx), n).toBe(true)

    const ev = byName('EV charging'), supply = byName('Electricity supply upgrade')
    const r = resolveSelection(cat, { ...A, q2_2_scopeItems: [ev.id, supply.id] })
    expect(r.inputs.GIFA).toBe(0)
    expect(r.inputs.EXT_AREA).toBe(2500)
    expect(r.effects.risks.map(x => x.text)).toContain('DNO capacity check')
    // "RATE: Electricity supply upgrade one band up" moves the default size up.
    const supplyLine = r.items.find(c => c.item.id === supply.id)
    expect(supplyLine.lines[0].option.label).toBe('Size: Large')

    const cost = await calculateCost({ ...A, q2_2_scopeItems: [ev.id, supply.id] }, 0)
    expect(cost.lineItems.map(l => l.item)).toEqual(expect.arrayContaining(['EV charging', 'Electricity supply upgrade']))
  })
})

describe('Scenario 6 — flats refurbishment (RF · Residential · 3,000 m² · 4 storeys · intervention 2)', () => {
  const A = { ...BASE, q1_2_projectType: 'Refurbishment', q1_3_buildingUse: 'Residential', q1_4_buildingAge: '1980–1999', q1_5_size: '3000', q1_2_storeys: '4', q2_3_interventionLevel: lvl(2) }

  it('starts Power, Lighting and Heating on their level-2 options, and estimates bathrooms from floor area before the refinement to 50', async () => {
    const r = resolveSelection(cat, { ...A, q2_2_scopeItems: typical(A) })
    const opt = n => r.items.find(c => c.item.name === n)?.lines[0].option.label
    expect(opt('Power')).toBe('Scope: Second fix only')
    expect(opt('Lighting')).toBe('Scope: Replace fittings only')
    expect(opt('Heating and hot water')).toBe('System: Gas boiler · Scope: Radiators and controls only')

    const bath = cat.items.find(i => i.name === 'Bathrooms and en-suites')
    const est = resolveSelection(cat, { ...A, q2_2_scopeItems: [bath.id] }).items[0].lines[0]
    expect(est).toMatchObject({ qty: 45, qtySource: 'estimate' })   // ROUND(3000 / 80 × 1.2)
    const key = est.optionKey
    const cost = await calculateCost({ ...A, q2_2_scopeItems: [bath.id], q2_2_quantities: { [key]: 50 } }, 0)
    expect(cost.lineItems.find(l => l.code === bath.id)).toMatchObject({ qty: 50, qtySource: 'user' })
  })
})

describe('Scenario 7 — demolition only (DM · 1980–1999 · 1,500 m²)', () => {
  const A = { ...BASE, q1_2_projectType: 'Demolition only', q1_3_buildingUse: 'Commercial offices', q1_4_buildingAge: '1980–1999', q1_5_size: '1500' }

  it('ticking Group 0 ticks Demolition (1,500 m²) and Asbestos; site clearance and fences are reachable', async () => {
    const ctx = buildContext(cat, A)
    const g0 = typicalItemIds(cat, ctx, { groupNum: 0 }).map(name).sort()
    expect(g0).toEqual(['Asbestos removal', 'Demolition of existing building'])
    for (const n of ['Site clearance and preparation', 'Fences, gates and walls']) {
      expect(isOffered(cat.items.find(i => i.name === n), ctx), n).toBe(true)
    }
    const cost = await calculateCost({ ...A, q2_2_scopeItems: typicalItemIds(cat, ctx, { groupNum: 0 }) }, 0)
    expect(cost.lineItems.find(l => l.item === 'Demolition of existing building')?.qty).toBe(1500)
  })
})
