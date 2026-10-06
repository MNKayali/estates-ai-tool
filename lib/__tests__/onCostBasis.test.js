import { describe, it, expect } from 'vitest'
import { calculateCost } from '../costCalculator.js'
import { budgetVerdict } from '../senseCheck.js'
import { projectCostRows } from '../reportContent.js'

const ANSWERS = {
  q1_0_projectName: 'T', q1_1_postcode: 'B29', q1_2_projectType: 'Refurbishment', q1_2_storeys: '2',
  q1_3_buildingUse: 'Commercial offices', q1_4_buildingAge: '1980–1999', q1_5_size: '850',
  q2_1_objective: 'T', q2_2_scopeItems: ['0.5', '3.1', '3.2', '5.1', '5.2'],
  q2_3_interventionLevel: 'Full systems replacement', q2_4_specLevel: 'Standard',
}

describe('NRM1 on-cost basis', () => {
  it('prices OH&P on works + prelims, and risk, contingency and inflation down the chain', async () => {
    const c = await calculateCost(ANSWERS, 40)
    const p = c.percentages
    const r1k = n => Math.round(n / 1000) * 1000
    for (const k of ['low', 'mid', 'high']) {
      const w = c.works[k], x = c.onCosts[k]
      expect(x.prelims).toBe(r1k(w * p.prelims / 100))
      expect(x.ohp).toBe(r1k((w + x.prelims) * p.ohp / 100))
      expect(x.con).toBe(w + x.prelims + x.ohp)
      expect(x.base).toBe(x.con + x.fees + x.dev)
      expect(x.risk).toBe(r1k(x.base * p.risk / 100))
      expect(x.cont).toBe(r1k(x.base * p.contingency / 100))
      expect(x.infl).toBe(r1k((x.base + x.risk + x.cont) * p.inflation / 100))
      expect(c.construction[k]).toBe(x.con)
      expect(c.total[k]).toBe(x.limit + x.infl + c.belowLine[k])
    }
  })
  it('report rows come from the engine, so the table foots', async () => {
    const c = await calculateCost(ANSWERS, 40)
    const rows = projectCostRows(c)
    const sum = k => rows.filter(r => r.kind === 'row' && r.label !== 'Works cost').reduce((t, r) => t + r[k], 0)
    expect(c.works.mid && sum('low') + c.works.low).toBe(c.total.low)
    expect(sum('high') + c.works.high).toBe(c.total.high)
  })
})

describe('budget position', () => {
  // FEBD83A5-style: gross range 4,055k–4,955k (mid 4,505k), budget 4.9m
  const cost = { total: { low: 3_379_000, mid: 3_754_000, high: 4_129_000 }, vatPct: 20 }
  it('covers the mid-point but is short at the top', () => {
    const v = budgetVerdict({ q4_3_budget: 4_900_000 }, cost)
    expect(v.status).toBe('tight')
    expect(v.position).toBe('mid')
    expect(v.headroomMid).toBe(4_900_000 - 4_505_000)
    expect(v.headroomHigh).toBe(4_900_000 - 4_955_000)
    expect(Math.round(v.coverage * 100)).toBe(94)
    expect(v.note).toMatch(/covers the mid-point/)
    expect(v.note).not.toMatch(/lower end/)
  })
  it('is achievable only toward the lower end below the mid-point', () => {
    const v = budgetVerdict({ q4_3_budget: 4_300_000 }, cost)
    expect(v.position).toBe('lower')
    expect(v.note).toMatch(/only toward the lower end/)
  })
})

describe('sensitivity drivers and exclusions', () => {
  it('lists up to five drivers, biggest first, each a positive change', async () => {
    const c = await calculateCost(ANSWERS, 40)
    expect(c.sensitivity.length).toBeGreaterThan(0)
    expect(c.sensitivity.length).toBeLessThanOrEqual(5)
    const d = c.sensitivity.map(x => x.delta)
    expect(d).toEqual([...d].sort((a, b) => b - a))
    expect(d.every(x => x > 0)).toBe(true)
  })
  it('drops land and (when vacant) decant from exclusions; labels decant as a client cost', async () => {
    const { costExclusionLines } = await import('../reportContent.js')
    const c = await calculateCost(ANSWERS, 40)
    const occupied = costExclusionLines(c, { q3_6_occupation: 'Partially occupied' }).join(' | ')
    expect(occupied).toMatch(/Client cost, not in this estimate: decant/)
    expect(occupied).not.toMatch(/Land, legal/)
    expect(occupied).toMatch(/Legal fees and statutory/)
    expect(costExclusionLines(c, { q3_6_occupation: 'Vacant or decanted' }).join(' | ')).not.toMatch(/decant/i)
  })
})
