import { describe, it, expect } from 'vitest'
import sample from './fixtures/sample-report-2026-09-23.json'
import { longScopeReport } from '../reportFixtures.js'
import {
  worksRows, worksTableMode, worksGroupRows, appendixChunks, lineQty, lineBasisWord, projectCostRows,
  percentageLines, accuracyStatement, costAssumptionLines, costExclusionLines, costIntroText, money,
  scopeStatement, coverFactRows, standardsList, buildingUseLabel,
} from '../reportContent.js'

const C = sample.cost

describe('works cost page', () => {
  it('lists every line under its group and fits on one page', () => {
    const rows = worksRows(C)
    expect(rows.filter(r => r.type === 'line')).toHaveLength(20)
    expect(rows.filter(r => r.type === 'group')).toHaveLength(5)
    expect(worksTableMode(C)).toBe('lines')
    const toilet = C.lineItems.find(l => l.description === 'Toilets — Accessible')
    expect(lineQty(toilet)).toBe('3 nr')
    expect(lineBasisWord(toilet)).toBe('client figure')
  })
  it('switches a long scope to group rows plus Appendix A', () => {
    const long = longScopeReport(sample).cost
    expect(worksTableMode(long)).toBe('groups')
    const groups = worksGroupRows(long)
    expect(groups.reduce((a, g) => a + g.count, 0)).toBe(40)
    expect(appendixChunks(long).length).toBeGreaterThanOrEqual(2)
  })
  it('explains the table in one short paragraph', () => {
    const t = costIntroText(C)
    expect(t).toMatch(/standard-specification refurbishment/)
    expect(t.length).toBeLessThan(520)
  })
})

describe('project cost page', () => {
  it('builds the summary table with rates, a construction subtotal, the total and VAT', () => {
    const rows = projectCostRows(C)
    const byLabel = Object.fromEntries(rows.map(r => [r.label, r]))
    expect(byLabel["Contractor's preliminaries (A)"].rate).toBe('10% of works')
    expect(money(byLabel["Contractor's preliminaries (A)"].low, C.total.high)).toBe('£101,000')
    expect(byLabel['Construction cost'].kind).toBe('subtotal')
    expect(byLabel['Professional fees (C)'].rate).toBe('16% of construction')
    expect(rows.at(-2)).toMatchObject({ label: 'Total project cost (excl. VAT)', kind: 'total', low: 1600000 })
    expect(rows.at(-1).kind).toBe('ref')
  })
  it('explains each percentage in plain words, no question numbers', () => {
    const lines = percentageLines(C)
    expect(lines.map(l => l.name)).toEqual(['Preliminaries', 'Overheads and profit', 'Professional fees', 'Risk', 'Contingency', 'Inflation'])
    expect(lines[0].text).toBe('8% base, plus 1% for partially occupied, 0.5% for restricted working hours, 0.5% for programme duration > 18 months')
    expect(lines[4].text).toBe('fixed for every report')
    expect(lines.map(l => l.text).join(' ')).not.toMatch(/Q\d/)
  })
  it('states accuracy once and caps assumptions and exclusions at six', () => {
    expect(accuracyStatement(C)).toMatch(/−11% \/ \+11%/)
    const a = costAssumptionLines(C)
    const e = costExclusionLines(C, sample.answers)
    expect(a.length).toBeLessThanOrEqual(6)
    expect(e.length).toBeLessThanOrEqual(6)
    expect(e[0]).toMatch(/^VAT/)
  })
})

describe('project cost page — the table foots (test reports DM-1, DM-2, DM-3)', () => {
  // A small project: rows used to print at £100 steps from unrounded
  // percentages while the engine's totals were built from £1,000-rounded lines.
  const small = {
    works: { low: 18_000, mid: 22_000, high: 29_000 },
    construction: { low: 22_000, mid: 27_000, high: 35_000 },
    total: { low: 28_000, mid: 34_000, high: 44_000 },
    percentages: { prelims: 9, ohp: 11, fees: 11, devCosts: 3.5, risk: 6, contingency: 5, inflation: 2.5, vat: 20 },
    breakdown: { devCosts: 1000 },
  }
  const rows = projectCostRows(small)
  const sum = (from, to, k) => rows.slice(from, to).reduce((a, r) => a + r[k], 0)
  it('prelims and OH&P add to construction', () => {
    for (const k of ['low', 'high']) expect(sum(0, 3, k)).toBe(small.construction[k])
  })
  it('every percentage row is a whole £1,000, as the engine rounds it', () => {
    for (const r of rows.filter(r => r.kind === 'row' && r.label !== 'Works cost')) {
      expect(r.low % 1000).toBe(0)
      expect(r.high % 1000).toBe(0)
    }
  })
})

describe('percentage build-up — a cap reads as a cap (test report EW-2)', () => {
  it('prints "capped at 10%" instead of "-1% for capped at 10%"', () => {
    const cost = {
      percentages: { prelims: 10 },
      trace: { prelims: [
        { code: 'A', label: 'Base', pct: 8 }, { code: 'A', label: 'Fully occupied', pct: 2 },
        { code: 'A', label: 'Programme duration > 18 months', pct: 1 }, { code: 'A', label: 'Capped at 10%', pct: -1 },
      ] },
    }
    expect(percentageLines(cost)[0].text).toBe('8% base, plus 2% for fully occupied, 1% for programme duration > 18 months, capped at 10%')
  })
})

describe('what the client chose, and only that (test reports EW, DM, FO-3, RF-1/2/3, DM-2, OM-2)', () => {
  const ew = { ...C, projectType: 'External works only', interventionLevel: null, gifa: 0, specLevel: 'Standard' }
  it('no specification or floor area where Q2.4 was not asked and there is no GIFA', () => {
    expect(scopeStatement(ew, { q1_2_projectType: 'External works only' })).toMatch(/^External works only: \d+ priced scope items\.$/)
    expect(costIntroText(ew, {})).not.toMatch(/specification|0 m²/)
    expect(costAssumptionLines(ew, {}).join(' ')).not.toMatch(/specification/)
    expect(coverFactRows({}, ew).map(r => r[0])).toEqual(['Project type'])
  })
  it('names the specification when the client chose one', () => {
    expect(coverFactRows({ q2_4_specLevel: 'Standard' }, C).map(r => r[0])).toContain('Specification')
    expect(scopeStatement(C, { q2_4_specLevel: 'Standard' })).toMatch(/standard specification/)
  })
  it('lists the standards the client needs, with the Other text', () => {
    const line = scopeStatement(C, { q2_4_specLevel: 'Standard', q2_5_standards: 'BREEAM, Net zero, Other', q2_5_standardsOther: 'Passivhaus' })
    expect(line).toMatch(/standards: BREEAM, Net zero, Passivhaus\.$/)
    expect(standardsList({ q2_5_standards: 'None' })).toEqual([])
  })
  it('shows the "Other" building use description', () => {
    expect(buildingUseLabel({ q1_3_buildingUse: 'Other', q1_3_buildingUseOther: 'Former bus depot' })).toBe('Former bus depot')
    expect(buildingUseLabel({ q1_3_buildingUse: 'Retail' })).toBe('Retail')
  })
})

describe('quantities with a named unit (test reports EW-1, EW-2)', () => {
  it('prints "8 trees" and "1 charger", not "nr trees"', () => {
    expect(lineQty({ qty: 8, unit: 'nr trees' })).toBe('8 trees')
    expect(lineQty({ qty: 1, unit: 'nr chargers' })).toBe('1 charger')
    expect(lineQty({ qty: 12, unit: 'nr' })).toBe('12 nr')
  })
})
