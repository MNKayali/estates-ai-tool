// Numbers the app used to hold in its code now live in the workbooks (NRM1
// v5.21, Programme v4.7, October 2026). Each test pins one of them: the value
// is read from the workbook, and a workbook without it is refused rather than
// filled in from the code.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import * as XLSX from 'xlsx'
import { modelFromBytes, WorkbookRejectedError, REQUIRED_FACTORS } from '../nrmWorkbook.js'
import { calculateCost, worksValueBand, evaluatePercentageRules, SENSITIVITY_FACTORS } from '../costCalculator.js'
import {
  calculateProgramme, fetchProgrammeWorkbook, sizeBand, parseSizeBands, parseProgrammeBenchmarks, checkProgrammeWorkbook, REQUIRED_MODIFIERS,
} from '../programmeCalculator.js'
import { runSenseCheck } from '../senseCheck.js'
import { vatBasis, VAT_RECOVERY } from '../questionSets.js'

const bytes = () => new Uint8Array(fs.readFileSync(process.env.RATES_FILE_URL))
function mutated(fn) {
  const wb = XLSX.read(bytes(), { type: 'array', cellFormula: true })
  fn(wb.Sheets['3. Settings'])
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}
const rowOf = (ws, test) => XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).findIndex(test)
const blank = (ws, r, c) => { delete ws[XLSX.utils.encode_cell({ r, c })] }
const rejected = (b, pattern) => {
  let err
  try { modelFromBytes(b) } catch (e) { err = e }
  expect(err).toBeInstanceOf(WorkbookRejectedError)
  expect(err.problems.join('\n')).toMatch(pattern)
}

describe('NRM1 v5.21 — the rows that replaced numbers in code', () => {
  it('reads every one of them from the committed workbook', () => {
    const s = modelFromBytes(bytes()).settings
    for (const key of REQUIRED_FACTORS) expect(Number.isFinite(s.factors[key]?.value)).toBe(true)
    expect(s.factors.vat_partly_share.value).toBe(0.5)
    expect(s.rangeWidths.DEFAULT).toEqual({ low: 0.89, high: 1.11 })
    expect(s.confidence.BENCHMARK_BREACH).toMatchObject({ threshold: 0.3, cap: 'D', points: 0 })
  })

  it('refuses a workbook without vat_partly_share', () => {
    rejected(mutated(ws => blank(ws, rowOf(ws, r => r[0] === 'vat_partly_share'), 0)), /vat_partly_share/)
  })
  it('refuses a workbook without a cost-driver step', () => {
    rejected(mutated(ws => blank(ws, rowOf(ws, r => r[0] === 'sens_fees_pp'), 0)), /sens_fees_pp/)
  })
  it('refuses a workbook without the DEFAULT range width', () => {
    rejected(mutated(ws => blank(ws, rowOf(ws, r => r[0] === 'DEFAULT'), 0)), /range_widths has no DEFAULT/)
  })
  it('refuses a workbook without the BENCHMARK_BREACH threshold', () => {
    rejected(mutated(ws => blank(ws, rowOf(ws, r => r[0] === 'BENCHMARK_BREACH'), 3)), /BENCHMARK_BREACH/)
  })
  it('refuses an inflation (F) row without a cap', () => {
    rejected(mutated(ws => blank(ws, rowOf(ws, r => r[0] === 'F'), 5)), /F rows need a Cap/)
  })
  // October 2026: the backup percentages (prelims 8/10, OH&P 11, fees
  // 6–13.5, risk 5/10) were taken out of the code.
  it('refuses a prelims (A) or risk (E) BASE row without its cap', () => {
    rejected(mutated(ws => blank(ws, rowOf(ws, r => r[0] === 'A' && r[2] === 'BASE'), 5)), /A BASE needs an Adjust % and a Cap %/)
    rejected(mutated(ws => blank(ws, rowOf(ws, r => r[0] === 'E' && r[2] === 'BASE'), 5)), /E BASE needs an Adjust % and a Cap %/)
  })
  it('refuses OH&P (B) rows that leave a works value uncovered', () => {
    rejected(mutated(ws => blank(ws, rowOf(ws, r => r[0] === 'B' && /> £5M/i.test(r[3])), 0)), /B \(OH&P\) rows do not cover a works cost of £5,000,001/)
  })
  it('reads the report risk level limits from ▶ factors (v5.23) and refuses a workbook without them', async () => {
    const f = modelFromBytes(bytes()).settings.factors
    expect([f.risk_level_low_max.value, f.risk_level_medium_max.value]).toEqual([11, 13])
    const rules = modelFromBytes(bytes()).settings.percentageRules
    const level = (low, medium) => evaluatePercentageRules(rules, {}, 500_000, 60, 20, { riskLevelLimits: { low, medium } }).percentages.riskLevel
    expect([level(99, 99), level(0, 99), level(0, 0)]).toEqual(['Low', 'Medium', 'High'])
    expect(evaluatePercentageRules(rules, {}, 500_000, 60, 20).percentages.riskLevel).toBeNull()
    const cost = await calculateCost({
      q1_1_postcode: 'B29', q1_2_projectType: 'Refurbishment', q1_3_buildingUse: 'Education', q1_5_size: '800',
      q2_3_interventionLevel: 'Full systems replacement', q2_4_specLevel: 'Standard', q2_2_scopeItems: ['S-0039'],
    }, 60, 20)
    expect(['Low', 'Medium', 'High']).toContain(cost.percentages.riskLevel)
    rejected(mutated(ws => blank(ws, rowOf(ws, r => r[0] === 'risk_level_low_max'), 0)), /risk_level_low_max/)
    rejected(mutated(ws => { const r = rowOf(ws, x => x[0] === 'risk_level_medium_max'); ws[XLSX.utils.encode_cell({ r, c: 1 })] = { t: 'n', v: 5 } }), /risk_level_medium_max must be at least/)
  })
  it('refuses fee (C) BASE rows that leave a design stage uncovered', () => {
    rejected(mutated(ws => blank(ws, rowOf(ws, r => r[0] === 'C' && r[2] === 'BASE' && /Stage 3/.test(r[3])), 0)), /C \(fees\) BASE rows do not cover Stage 3/)
  })
})

describe('cost engine — values come from the workbook', () => {
  const answers = {
    q1_1_postcode: 'B29', q1_2_projectType: 'Refurbishment', q1_3_buildingUse: 'Education', q1_5_size: '800',
    q2_3_interventionLevel: 'Full systems replacement', q2_4_specLevel: 'Standard', q2_2_scopeItems: ['S-0039'],
  }
  it('carries the VAT partly-recovered share and prices the what-if steps from ▶ factors', async () => {
    const s = modelFromBytes(bytes()).settings
    const cost = await calculateCost(answers, 60, 20)
    expect(cost.vatPartlyShare).toBe(s.factors.vat_partly_share.value)
    const fees = cost.sensitivity.find(d => d.label === 'Professional fees')
    if (fees) expect(fees.change).toBe(`+${s.factors[SENSITIVITY_FACTORS.feesPp].value} points`)
    expect(cost.rangeApplied).toMatchObject({ low: s.rangeWidths.DEFAULT.low, high: s.rangeWidths.DEFAULT.high, fromWorkbook: false })
  })
  it('reads the OH&P value bands from the rule text, both ends of a range included', () => {
    const lt = worksValueBand('Works cost < £1M → 10–12% (use 11%)')
    const mid = worksValueBand('Works cost £1M–£5M → 9–10% (use 9.5%)')
    const gt = worksValueBand('Works cost > £5M → 8–9% (use 8.5%)')
    expect([lt(999_999), lt(1_000_000)]).toEqual([true, false])
    expect([mid(999_999), mid(1_000_000), mid(5_000_000), mid(5_000_001)]).toEqual([false, true, true, false])
    expect([gt(5_000_000), gt(5_000_001)]).toEqual([false, true])
    expect(worksValueBand('Works cost < £750k → 12%')(749_000)).toBe(true)
    expect(worksValueBand('Q3.6 = Fully occupied throughout')).toBeNull()
  })
  it('prices fees for an unanswered design stage from the workbook Stage 0–1 row, not a code ladder', () => {
    const rules = modelFromBytes(bytes()).settings.percentageRules
    const stage01 = rules.find(r => r.code === 'C' && r.type === 'BASE' && /stage 0/i.test(r.condition))
    const { percentages, trace } = evaluatePercentageRules(rules, { ...answers, q4_5_designStage: '' }, 500_000, 60, 20)
    expect(trace.fees[0]).toMatchObject({ label: stage01.condition, pct: stage01.adjustPct })
    expect(percentages.fees).toBeGreaterThanOrEqual(stage01.adjustPct)
    expect(JSON.stringify(trace)).not.toMatch(/fallback/i)
  })
  it('measures time to tender from the week construction starts, with no weeks taken off in code', () => {
    const rules = modelFromBytes(bytes()).settings.percentageRules
    const label = opts => evaluatePercentageRules(rules, answers, 500_000, 60, 20, opts).trace.inflation.map(t => t.label).join(' ')
    expect(label({ weeksToConstruction: 31 })).toMatch(/\(31 wks to tender\)/)
    expect(label({})).toMatch(/\(40 wks to tender\)/)
  })
  it('counts the partly-recovered VAT share the workbook gives, and refuses without one', () => {
    const a = { q4_3a_vatRecovery: VAT_RECOVERY.partly }
    expect(vatBasis(a, 0.25).share).toBe(0.25)
    expect(() => vatBasis(a)).toThrow(/vat_partly_share/)
  })
})

describe('Programme v4.7 — size bands and the programme check come from Modifiers', () => {
  it('reads SB-S1…SB-S7 with their < / ≤ boundaries', async () => {
    const wb = await fetchProgrammeWorkbook()
    const mod = XLSX.utils.sheet_to_json(wb.Sheets.Modifiers, { header: 1, defval: '' })
    const tab = Object.fromEntries(mod.slice(1).map(r => [String(r[0]).trim(), { value: r[4] }]))
    const bands = parseSizeBands(tab)
    const cases = [[149, 'S1'], [150, 'S2'], [250, 'S2'], [251, 'S3'], [1500, 'S4'], [3000, 'S5'], [10000, 'S6'], [10001, 'S7']]
    for (const [m2, band] of cases) expect(sizeBand(m2, bands)).toBe(band)
    expect(parseProgrammeBenchmarks(tab).S1).toEqual({ min: 6, max: 65 })
  })
  it('refuses a workbook missing a size band, a programme check or a required duration row', () => {
    const tabs = { durTab: {}, conTab: {}, modTab: {}, bands: [null], benchmarks: {} }
    expect(() => checkProgrammeWorkbook(tabs)).toThrow(/TN1.*CH1.*SB-S1.*PB-S1/s)
  })
  it('refuses a workbook missing a modifier the engine reads (no backup values in code)', async () => {
    const wb = await fetchProgrammeWorkbook()
    const mod = XLSX.utils.sheet_to_json(wb.Sheets.Modifiers, { header: 1, defval: '' })
    const full = Object.fromEntries(mod.slice(1).map(r => [String(r[0]).trim(), { value: r[4] }]))
    const without = id => { const t = { ...full }; delete t[id]; return t }
    const tabs = modTab => ({ durTab: {}, conTab: {}, modTab, bands: [], benchmarks: {} })
    let err
    try { checkProgrammeWorkbook(tabs(full)) } catch (e) { err = e.message }
    expect(err).not.toMatch(/Modifiers (Q23|OCC|ACC|PH|FN|PROG)/)
    for (const id of REQUIRED_MODIFIERS) expect(() => checkProgrammeWorkbook(tabs(without(id)))).toThrow(new RegExp(`Modifiers has no ${id} row`))
    expect(() => checkProgrammeWorkbook(tabs(without('FN-1')))).toThrow(/FN-1/)
    expect(() => checkProgrammeWorkbook(tabs(without('PROG-FLOAT')))).toThrow(/PROG-FLOAT/)
  })
  it('passes the band envelope to the sense check, which no longer holds one', async () => {
    const a = {
      q1_1_postcode: 'B29', q1_2_projectType: 'Refurbishment', q1_3_buildingUse: 'Education', q1_5_size: '100',
      q2_3_interventionLevel: 'Full systems replacement', q2_4_specLevel: 'Standard', q2_2_scopeItems: ['S-0039'], q4_5_designStage: 'Stage 0–1',
    }
    const p = await calculateProgramme(a, 200_000)
    expect(p.programmeBenchmark).toEqual({ min: 6, max: 65 })
    const cost = await calculateCost(a, p.totalWeeks, p.constructionWeeks)
    await expect(runSenseCheck(cost, p, a)).resolves.toBeTruthy()
    await expect(runSenseCheck(cost, { ...p, programmeBenchmark: undefined }, a)).rejects.toThrow(/benchmark/)
  })
})
