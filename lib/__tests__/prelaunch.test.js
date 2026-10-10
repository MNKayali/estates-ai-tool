// Pre-launch fixes from test batch 3 (October 2026): Q3.5 redesign and work
// windows, the VAT basis of the budget check, storeys for Demolition only /
// Other or mixed, and the Net zero default heating option.
import { describe, it, expect } from 'vitest'
import {
  ACCESS, WORK_WINDOW, accessFlags, migrateAccessAnswers, workWindow,
  vatBasis, VAT_RECOVERY, isQuestionShown, unansweredRequired,
} from '../questionSets.js'
import { scheduleInWindow } from '../programmeCalculator.js'
import { budgetVerdict } from '../senseCheck.js'
import { defaultOptionKeys } from '../scopeEngine.js'

describe('Q3.5 access flags', () => {
  it('reads the new labels', () => {
    const f = accessFlags({ q3_5_accessConstraints: [ACCESS.deliveries, ACCESS.tight, ACCESS.road] })
    expect(f).toMatchObject({ deliveries: true, tight: true, road: true, hours: false, shared: false, periods: false })
  })
  it('reads the old labels, so old drafts and reports keep their meaning', () => {
    const f = accessFlags({ q3_5_accessConstraints: ['Restricted working hours', 'Shared access with other occupiers',
      'Height or weight restrictions on site', 'Scaffold licence or highway encroachment required', 'Term-time only working'] })
    expect(f).toMatchObject({ hours: true, shared: true, tight: true, road: true, periods: true })
  })
  it('"No access constraints" wins over anything ticked beside it', () => {
    expect(Object.values(accessFlags({ q3_5_accessConstraints: [ACCESS.none, ACCESS.hours] })).some(Boolean)).toBe(false)
  })
  it('migrates old labels to new ones', () => {
    expect(migrateAccessAnswers(['Term-time only working', 'Restricted working hours'])).toEqual([ACCESS.periods, ACCESS.hours])
  })
})

describe('Q3.5a work window', () => {
  it('is asked only when "Works limited to certain periods" is ticked', () => {
    const base = { q1_2_projectType: 'Refurbishment', q3_5_accessConstraints: [ACCESS.periods] }
    expect(unansweredRequired(3, 'Refurbishment', base)).toContain('q3_5a_workWindow')
    expect(unansweredRequired(3, 'Refurbishment', { ...base, q3_5_accessConstraints: [ACCESS.hours] })).not.toContain('q3_5a_workWindow')
  })
  it('needs dates only for the date-based choices', () => {
    const a = { q3_5_accessConstraints: [ACCESS.periods], q3_5a_workWindow: WORK_WINDOW.except }
    expect(unansweredRequired(3, 'Refurbishment', a)).toContain('q3_5b_workPeriods')
    expect(unansweredRequired(3, 'Refurbishment', { ...a, q3_5a_workWindow: WORK_WINDOW.holidays })).not.toContain('q3_5b_workPeriods')
  })
  it('an old "Term-time only working" answer means holidays only', () => {
    expect(workWindow({ q3_5_accessConstraints: ['Term-time only working'] })).toEqual({ type: 'holidays', periods: [] })
  })
  it('ignores incomplete or reversed periods', () => {
    const w = workWindow({ q3_5_accessConstraints: [ACCESS.periods], q3_5a_workWindow: WORK_WINDOW.except,
      q3_5b_workPeriods: [{ from: '2027-12-01', to: '2027-11-01' }, { from: '2027-11-15', to: '2028-01-05' }, { from: '2027-06-01' }] })
    expect(w.periods).toEqual([{ from: '2027-11-15', to: '2028-01-05' }])
  })
})

describe('scheduleInWindow', () => {
  const start = new Date('2027-03-01T00:00:00Z')    // a Monday
  const summer = [['07-22', '09-01']]
  it('fits a 5-week job into the summer holiday, after waiting for it', () => {
    const r = scheduleInWindow(start, 0, 5, { type: 'holidays', periods: [] }, summer)
    expect(r.wait).toBeGreaterThan(18)              // March → late July
    expect(r.elapsed).toBe(5)
    expect(r.short).toBe(0)
  })
  it('spreads a long job over several summers', () => {
    const r = scheduleInWindow(start, 0, 10, { type: 'holidays', periods: [] }, summer)
    expect(r.elapsed).toBeGreaterThan(52)
  })
  it('pauses over an "except" period', () => {
    const w = { type: 'except', periods: [{ from: '2027-03-15', to: '2027-03-28' }] }
    const r = scheduleInWindow(start, 0, 4, w)
    expect(r.wait).toBe(0)
    expect(r.elapsed).toBe(6)                        // 2 weeks blocked inside the run
  })
  it('reports a shortfall when an "only within" window is too short', () => {
    const w = { type: 'only', periods: [{ from: '2027-03-01', to: '2027-03-21' }] }
    const r = scheduleInWindow(start, 0, 8, w)
    expect(r.worked).toBe(3)
    expect(r.short).toBe(5)
  })
  it('without a holiday calendar it leaves the construction continuous', () => {
    expect(scheduleInWindow(start, 0, 5, { type: 'holidays', periods: [] }, [])).toMatchObject({ elapsed: 5, noCalendar: true })
  })
})

describe('VAT basis of the budget check', () => {
  const cost = { total: { low: 1000000, mid: 1100000, high: 1300000 }, vatPct: 20, vatPartlyShare: 0.5 }
  it('new-build homes are zero-rated: no VAT counted', () => {
    const a = { q1_2_projectType: 'New Build', q1_3_buildingUse: 'Residential', q4_3_budget: 1250000 }
    expect(vatBasis(a).share).toBe(0)
    const v = budgetVerdict(a, cost)
    expect(v.grossLow).toBe(1000000)
    expect(v.note).toMatch(/zero-rated/)
  })
  it('a client who recovers VAT carries none; partly carries half; not sure carries all', () => {
    const a = { q1_2_projectType: 'Refurbishment', q1_3_buildingUse: 'Education', q4_3_budget: 1250000 }
    expect(budgetVerdict({ ...a, q4_3a_vatRecovery: VAT_RECOVERY.full }, cost).grossLow).toBe(1000000)
    expect(budgetVerdict({ ...a, q4_3a_vatRecovery: VAT_RECOVERY.partly }, cost).grossLow).toBe(1100000)
    expect(budgetVerdict({ ...a, q4_3a_vatRecovery: VAT_RECOVERY.unsure }, cost).grossLow).toBe(1200000)
    expect(budgetVerdict(a, cost).grossLow).toBe(1200000)
  })
})

describe('storeys', () => {
  it('Demolition only and Other or mixed ask storeys; Fit-out and External works do not', () => {
    expect(isQuestionShown('q1_2_storeys', 'Demolition only')).toBe(true)
    expect(isQuestionShown('q1_2_storeys', 'Other or mixed')).toBe(true)
    expect(isQuestionShown('q1_2_storeys', 'Fit-out')).toBe(false)
    expect(isQuestionShown('q1_2_storeys', 'External works only')).toBe(false)
  })
  it('Demolition only never asks the height question', () => {
    expect(unansweredRequired(1, 'Demolition only', { q1_2_projectType: 'Demolition only', q1_2_storeys: '9' })).not.toContain('q1_6_heightOver18m')
  })
})

describe('Net zero default option', () => {
  const item = {
    id: 'X', pick: 'One', shownOn: ['RF'], uses: ['ALL'], preOn: [],
    options: [
      { key: 'X-01', label: 'Gas', isDefault: true, defaultFor: [], netZeroDefault: false, preLevels: [3], availFrom: 1, priceableFor: { RF: true } },
      { key: 'X-02', label: 'ASHP', isDefault: false, defaultFor: [], netZeroDefault: true, preLevels: [], availFrom: 1, priceableFor: { RF: true } },
    ],
  }
  const ctx = (standards) => ({ PT: 'RF', USE: 'OFF', usesLevel: true, LEVEL: 3, answers: { q2_5_standards: standards } })
  it('the level pre-tick (gas) is the default without Net zero', () => {
    expect(defaultOptionKeys(item, ctx('BREEAM'))).toEqual(['X-01'])
  })
  it('Net zero ticked: the NETZERO option (heat pump) wins', () => {
    expect(defaultOptionKeys(item, ctx('BREEAM, Net zero'))).toEqual(['X-02'])
  })
})

describe('workbook v5.20 quantity rules', async () => {
  const { calculateCost } = await import('../costCalculator.js')
  it('paving deducts the car parking the client entered', async () => {
    const a = { q1_2_projectType: 'External works only', q1_3_buildingUse: 'Healthcare', q1_1_postcode: 'NG7', q1_5_size: '6500',
      q2_2_scopeItems: ['S-0073', 'S-0074'], q2_2_quantities: { 'S-0074-01': '50' } }
    const cost = await calculateCost(a, 0)
    const paving = cost.lineItems.find(l => l.item === 'Roads, paths and paving')
    expect(paving.qty).toBeCloseTo(6500 * 0.6 - 50 * 25, 0)
  })
  it('on an Extension, demolition needs the area demolished (not the new floor area)', async () => {
    const a = { q1_2_projectType: 'Extension', q1_3_buildingUse: 'Hospitality / leisure', q1_1_postcode: 'EH1', q1_5_size: '2400',
      q1_4_buildingAge: 'Pre-1900', q1_2_storeys: '4', q2_4_specLevel: 'High', q2_2_scopeItems: ['S-0002'] }
    const cost = await calculateCost(a, 0)
    expect(cost.lineItems.find(l => l.item === 'Demolition of existing building')).toBeUndefined()
    expect(cost.excludedNoQuantity.some(e => /Demolition/.test(e.description || e.item || ''))).toBe(true)
  })
  it('Scotland uses a mid factor inside its own range', async () => {
    const a = { q1_2_projectType: 'Refurbishment', q1_3_buildingUse: 'Commercial offices', q1_1_postcode: 'EH1', q1_5_size: '1000',
      q2_3_interventionLevel: 'Fabric and finishes only', q2_4_specLevel: 'Standard', q2_2_scopeItems: ['S-0021'] }
    expect((await calculateCost(a, 0)).bcisFactor).toBe(0.965)
  })
})

describe('VAT basis guard on the AI text', async () => {
  const { vatBasisProblems, vatGuardFor } = await import('../prose.js')
  const cost = { total: { low: 623000, mid: 777000, high: 1049000 } }
  const guard = vatGuardFor({ q4_3_budget: '850000' }, cost, { budget: { vatShare: 1 } })
  it('rejects comparing the VAT-inclusive budget with the excl.-VAT mid-point', () => {
    expect(vatBasisProblems({ r: ['Budget of £850,000 sits below the mid-point estimate of £777,000.'] }, guard)).toHaveLength(1)
  })
  it('rejects calling the excl.-VAT total "including VAT"', () => {
    expect(vatBasisProblems({ k: 'Total project cost including fees and VAT is £777,000.' }, guard)).toHaveLength(1)
  })
  it('accepts the right wording', () => {
    expect(vatBasisProblems({ k: 'Total project cost is £777,000 excluding VAT; the budget of £850,000 is tight against the gross range.' }, guard)).toHaveLength(0)
  })
  it('does not apply when no VAT is counted (zero-rated or recovered)', () => {
    const g0 = vatGuardFor({ q4_3_budget: '850000' }, cost, { budget: { vatShare: 0 } })
    expect(vatBasisProblems({ r: 'Budget of £850,000 is above the mid-point of £777,000.' }, g0)).toHaveLength(0)
  })
})

describe('Procurement Reference v2.1', async () => {
  const fs = await import('node:fs')
  const XLSX = await import('xlsx')
  const { parseProcurementWorkbook, selectProcurement } = await import('../procurementCalculator.js')
  const m = parseProcurementWorkbook(XLSX.read(fs.readFileSync('Projento_Procurement_Reference.xlsx'), { type: 'buffer' }))
  const models = pt => {
    const x = selectProcurement(m, { valueGBP: 600000, weeks: 20, highRisks: 3, priority: 'Lowest cost', publicClient: false, projectType: pt })
    return [x.preferred.model.name, x.alternative.model.name]
  }
  it('offers Remeasurement only on External works only', () => {
    expect(models('Demolition only')).not.toContain('Remeasurement')
    expect(models('Refurbishment')).not.toContain('Remeasurement')
  })
})
