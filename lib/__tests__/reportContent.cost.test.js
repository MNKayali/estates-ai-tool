import { describe, it, expect } from 'vitest'
import sample from '../../public/sample/report.json'
import { longScopeReport } from '../reportFixtures.js'
import {
  worksRows, worksTableMode, worksGroupRows, appendixChunks, lineQty, lineBasisWord, projectCostRows,
  percentageLines, accuracyStatement, costAssumptionLines, costExclusionLines, costIntroText, money,
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
