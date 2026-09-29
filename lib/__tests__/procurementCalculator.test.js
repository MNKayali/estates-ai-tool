import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import fs from 'node:fs'
import {
  calculateProcurement, fetchProcurementWorkbook, parseProcurementWorkbook, selectProcurement, levelFor, normaliseLabel,
} from '../procurementCalculator.js'
import { topPriority, publicClient, PRIORITY_OPTIONS } from '../questionSets.js'

/**
 * Runs against the committed Procurement Reference workbook
 * (vitest.setup.mjs points PROCUREMENT_FILE_URL at it). The six cases below
 * are pinned from the workbook as issued (v2.0, 28 September 2026) — if its
 * scores are edited, re-derive them on '4. Check' and update this table.
 */
const model = async () => parseProcurementWorkbook(await fetchProcurementWorkbook())
const run = (valueGBP, weeks, highRisks, priority, pub) =>
  calculateProcurement({ q4_4_priorities: [priority], q4_8_publicClient: pub }, { valueGBP, weeks, highRisks })
const pair = (x, k) => [x.preferred[k].name, x.preferred[k].score, x.alternative[k].name, x.alternative[k].score]

describe('procurementCalculator — the brief\'s six pinned cases', () => {
  it.each([
    [1, 3_500_000, 52, 5, 'Fixed / certain final cost', 'Yes',
      ['Design and build (single stage)', 9, 'Traditional', 8], ['Lump sum', 'Lump sum'],
      ['Framework — mini-competition', 10, 'Selective tender', 9]],
    [2, 3_500_000, 52, 5, 'Minimise disruption', 'Yes',
      ['Two-stage (PCSA)', 8, 'Design and build (single stage)', 7], ['Target cost', 'Target cost'],
      ['Framework — direct award', 9, 'Framework — mini-competition', 8]],
    [3, 300_000, 12, 0, 'Speed', 'Yes',
      ['Traditional', 6, 'Design and build (single stage)', 6], ['Lump sum', 'Lump sum'],
      ['Quotations', 9, 'Framework — direct award', 8]],
    [4, 8_000_000, 60, 5, 'Speed', 'Yes',
      ['Two-stage (PCSA)', 10, 'Construction management', 8], ['Target cost', 'Cost reimbursable'],
      ['Framework — direct award', 9, 'Framework — mini-competition', 8]],
    [5, 30_000_000, 90, 3, 'Design quality', 'Yes',
      ['Construction management', 9, 'Two-stage (PCSA)', 8], ['Cost reimbursable', 'Target cost'],
      ['Selective tender', 9, 'Framework — mini-competition', 8]],
    [6, 2_000_000, 40, 2, 'Lowest cost', 'No',
      ['Traditional', 9, 'Design and build (single stage)', 7], ['Lump sum', 'Lump sum'],
      ['Selective tender', 10, 'Open tender', 8]],
  ])('case %i', async (_n, v, w, r, p, pub, routes, models, markets) => {
    const x = await run(v, w, r, p, pub)
    expect(pair(x, 'route')).toEqual(routes)
    expect([x.preferred.model.name, x.alternative.model.name]).toEqual(models)
    expect(pair(x, 'routeToMarket')).toEqual(markets)
    expect(x.maxScore).toBe(10)
  })

  it('case 1 contracts: JCT by value level, NEC4 alongside', async () => {
    const x = await run(3_500_000, 52, 5, 'Fixed / certain final cost', 'Yes')
    expect(x.preferred.contract.jct).toBe('JCT Design and Build (DB); ICD where the contractor designs only part')
    expect(x.alternative.contract.jct).toBe('JCT Intermediate (IC); ICD where the contractor designs part (e.g. M&E)')
    expect(x.preferred.contract.nec4).toMatch(/^ECC Option A/)
    expect(x.drivers).toMatchObject({ valueLevel: 'V2 £1m to threshold', durationLevel: 'D2 27–52 wks', riskLevel: 'R3 High', priorityLevel: 'P2 Fixed/certain final cost', publicClient: true })
  })

  it('V3 and V4 both read the "above threshold" JCT column', async () => {
    const v3 = await run(8_000_000, 60, 5, 'Speed', 'Yes')
    const m = await model()
    expect(v3.preferred.contract.jct).toBe(m.contracts['PR3|CM3'].jct.V3)
    expect(m.contracts['PR3|CM3'].jct.V3).toBe(m.contracts['PR3|CM3'].jct.V4)
  })
})

describe('procurementCalculator — workbook reading', () => {
  it('reads 15 options, 11 contract rows and the four weights', async () => {
    const m = await model()
    expect(m.options).toHaveLength(15)
    expect(Object.keys(m.contracts)).toHaveLength(11)
    expect(m.weights).toEqual({ value: 1, duration: 1, risk: 1, priority: 2 })
    expect(m.threshold).toEqual({ inclVat: 5_193_000, exclVat: 4_327_500 })
  })

  it('finds a priority level for every Q4.4 option, whatever the spacing around "/"', async () => {
    const m = await model()
    for (const o of PRIORITY_OPTIONS) expect(m.drivers.priority.some(p => normaliseLabel(p.answer) === normaliseLabel(o))).toBe(true)
    expect(normaliseLabel('Fixed / certain final cost')).toBe(normaliseLabel('Fixed/certain final cost'))
  })

  it('rejects a file saved without recalculating (a formula with no value)', () => {
    const wb = XLSX.read(fs.readFileSync('Projento_Procurement_Reference.xlsx'), { type: 'buffer' })
    delete wb.Sheets['1. Drivers'].D28.v
    expect(() => parseProcurementWorkbook(wb)).toThrow(/D28 is a formula with no saved value/)
  })

  it('rejects a level name with no matching score column', () => {
    const wb = XLSX.read(fs.readFileSync('Projento_Procurement_Reference.xlsx'), { type: 'buffer' })
    wb.Sheets['1. Drivers'].C2.v = 'V1 Under one million'
    expect(() => parseProcurementWorkbook(wb)).toThrow(/no score column headed "V1 Under one million"/)
  })

  it('throws a workbook error for a missing route + model contract, never guesses', async () => {
    const m = await model()
    const contracts = { ...m.contracts }
    delete contracts['PR2|CM1']
    expect(() => selectProcurement({ ...m, contracts }, { valueGBP: 3_500_000, weeks: 52, highRisks: 5, priority: 'Fixed / certain final cost', publicClient: true }))
      .toThrow(/no row for PR2\|CM1/)
  })
})

describe('procurementCalculator — selection rules', () => {
  it('drops an option scored X at any driver level (Construction management and Quotations above V1)', async () => {
    const x = selectProcurement(await model(), { valueGBP: 500_000, weeks: 20, highRisks: 0, priority: 'Speed', publicClient: false })
    const y = selectProcurement(await model(), { valueGBP: 2_000_000, weeks: 20, highRisks: 0, priority: 'Speed', publicClient: false })
    const names = r => [r.preferred, r.alternative].flatMap(s => [s.route.id, s.routeToMarket.id])
    expect(names(x)).not.toContain('PR4')
    expect(names(y)).not.toContain('RM1')
  })

  it('matches Works with routes by exact ID, not substring', async () => {
    const m = await model()
    // A perfect-scoring model that works only with a "PR10" must never be
    // picked for PR1 — a substring match on the raw cell would pick it.
    const allTwos = Object.fromEntries(Object.keys(m.options[0].scores).map(k => [k, 2]))
    const cm9 = { ...m.options.find(o => o.id === 'CM1'), id: 'CM9', name: 'Fake', index: -1, worksWith: ['PR10'], scores: allTwos }
    const x = selectProcurement({ ...m, options: [...m.options, cm9] }, { valueGBP: 2_000_000, weeks: 40, highRisks: 2, priority: 'Lowest cost', publicClient: false })
    expect(x.preferred.route.id).toBe('PR1')
    expect(x.preferred.model.id).not.toBe('CM9')
  })

  it('breaks a tie in favour of the earlier row (case 3: Traditional and D&B both 6)', async () => {
    const x = await run(300_000, 12, 0, 'Speed', 'Yes')
    expect(x.preferred.route.score).toBe(x.alternative.route.score)
    expect(x.preferred.route.id).toBe('PR1')
  })

  it.each([
    ['No', ['RM4', 'RM5'], null],
    ['Yes', ['RM6'], null],
    ['', ['RM4', 'RM5', 'RM6'], null],
  ])('client filter — public %j excludes %j', async (pub, excluded) => {
    const m = await model()
    // Every value/duration/risk/priority combination, so no single case hides a leak.
    const seen = new Set()
    for (const valueGBP of [500_000, 2_000_000, 8_000_000, 30_000_000])
      for (const weeks of [12, 40, 80])
        for (const highRisks of [0, 2, 5])
          for (const priority of PRIORITY_OPTIONS) {
            const x = selectProcurement(m, { valueGBP, weeks, highRisks, priority, publicClient: publicClient({ q4_8_publicClient: pub }) })
            seen.add(x.preferred.routeToMarket.id)
            seen.add(x.alternative.routeToMarket.id)
          }
    for (const id of excluded) expect(seen.has(id)).toBe(false)
  })

  it('leaves the priority term out when nothing is ticked, and says so', async () => {
    const x = selectProcurement(await model(), { valueGBP: 2_000_000, weeks: 40, highRisks: 2, priority: '', publicClient: true })
    expect(x.drivers.priorityLevel).toBeNull()
    expect(x.maxScore).toBe(6)
  })

  it('gives each route to market a Programme tender period', async () => {
    const q = await run(300_000, 12, 0, 'Speed', 'Yes')
    expect(q.preferred.routeToMarket).toMatchObject({ id: 'RM1', tenderId: 'TN2' })
    expect(q.alternative.routeToMarket).toMatchObject({ id: 'RM5', tenderId: 'TN3' })
    const s = await run(2_000_000, 40, 2, 'Lowest cost', 'No')
    expect(s.preferred.routeToMarket).toMatchObject({ id: 'RM3', tenderId: 'TN1' })
  })
})

describe('procurementCalculator — level boundaries', () => {
  it.each([
    ['value', 999_999, 'V1'], ['value', 1_000_000, 'V2'], ['value', 4_327_500, 'V3'], ['value', 20_000_000, 'V4'],
    ['duration', 26, 'D1'], ['duration', 27, 'D2'], ['duration', 52, 'D2'], ['duration', 53, 'D3'],
    ['risk', 1, 'R1'], ['risk', 2, 'R2'], ['risk', 4, 'R3'],
  ])('%s %d → %s', async (driver, x, code) => {
    const m = await model()
    expect(levelFor(m.drivers[driver], x).code).toBe(code)
  })
})

describe('top priority and client type from the answers', () => {
  it('takes rank 1 of Q4.4, which is ranked in the client\'s order, not the option list\'s', () => {
    expect(topPriority({ q4_4_priorities: ['Speed', 'Lowest cost'] })).toBe('Speed')
    expect(topPriority({ q4_4_priorities: ['Lowest cost', 'Speed', 'Design quality'] })).toBe('Lowest cost')
    expect(topPriority({ q4_4_priorities: ['Speed'] })).toBe('Speed')
    expect(topPriority({})).toBe('')
  })

  it('only rank 1 moves the recommendation — ranks 2 and 3 do not score', async () => {
    const m = await model()
    const run = priorities => selectProcurement(m, { valueGBP: 2_000_000, weeks: 40, highRisks: 2, priority: topPriority({ q4_4_priorities: priorities }), publicClient: true })
    const a = run(['Speed', 'Lowest cost', 'Design quality'])
    const b = run(['Speed', 'Flexibility'])
    expect(b.preferred).toEqual(a.preferred)
    expect(b.alternative).toEqual(a.alternative)
    expect(run(['Lowest cost', 'Speed']).drivers.priority).toBe('Lowest cost')
  })

  it('reads the client type as true / false / unknown', () => {
    expect(publicClient({ q4_8_publicClient: 'Yes' })).toBe(true)
    expect(publicClient({ q4_8_publicClient: 'No' })).toBe(false)
    expect(publicClient({})).toBeNull()
  })
})
