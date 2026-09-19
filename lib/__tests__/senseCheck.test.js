import { describe, it, expect } from 'vitest'
import { budgetVerdict } from '../senseCheck.js'

// budgetVerdict is pure and network-free — no workbook fetch involved — so
// these run instantly and exercise the exact boundary arithmetic (gross =
// total × 1.2 for the 20% VAT the cost engine applies elsewhere, rounded to
// the nearest £1,000) rather than just re-running the whole pipeline.
describe('budgetVerdict', () => {
  it('returns status "none" when no budget was stated', () => {
    const cost = { total: { low: 100_000, high: 150_000 } }
    expect(budgetVerdict({}, cost)).toEqual({ status: 'none' })
  })

  it('returns status "none" when the cost range is missing (partial pipeline state)', () => {
    expect(budgetVerdict({ q4_3_budget: 500_000 }, {})).toEqual({ status: 'none' })
  })

  it('is "sufficient" when the budget clears the gross high end, with the correct margin', () => {
    // gross = [100k, 150k] × 1.2 = [120k, 180k]; budget 200k clears 180k by 20k
    const cost = { total: { low: 100_000, high: 150_000 } }
    const v = budgetVerdict({ q4_3_budget: 200_000 }, cost)
    expect(v.status).toBe('sufficient')
    expect(v.grossLow).toBe(120_000)
    expect(v.grossHigh).toBe(180_000)
    expect(v.margin).toBe(20_000)
    expect(v.note).toContain('sufficient')
  })

  it('is "tight" when the budget sits inside the gross range but not at the top', () => {
    // gross = [120k, 180k]; budget 150k is inside, below the high end
    const cost = { total: { low: 100_000, high: 150_000 } }
    const v = budgetVerdict({ q4_3_budget: 150_000 }, cost)
    expect(v.status).toBe('tight')
    expect(v.grossLow).toBe(120_000)
    expect(v.grossHigh).toBe(180_000)
  })

  it('is "insufficient" when the budget falls below the gross low end, with the correct shortfall', () => {
    // gross = [120k, 180k]; budget 100k is short of 120k by 20k
    const cost = { total: { low: 100_000, high: 150_000 } }
    const v = budgetVerdict({ q4_3_budget: 100_000 }, cost)
    expect(v.status).toBe('insufficient')
    expect(v.shortfall).toBe(20_000)
    expect(v.note).toContain('below the estimated gross range')
  })

  it('treats the boundary (budget exactly at grossHigh) as sufficient, not tight', () => {
    const cost = { total: { low: 100_000, high: 150_000 } }
    const v = budgetVerdict({ q4_3_budget: 180_000 }, cost)
    expect(v.status).toBe('sufficient')
    expect(v.margin).toBe(0)
  })

  it('treats the boundary (budget exactly at grossLow) as tight, not insufficient', () => {
    const cost = { total: { low: 100_000, high: 150_000 } }
    const v = budgetVerdict({ q4_3_budget: 120_000 }, cost)
    expect(v.status).toBe('tight')
  })
})

describe('budgetVerdict — VAT position (Q4.3a)', () => {
  const cost = { total: { low: 100_000, high: 150_000 }, vatPct: 20 }
  it('compares a fully-recoverable client against the net estimate', () => {
    const v = budgetVerdict({ q4_3_budget: 150_000, q4_3a_vatPosition: 'Fully recoverable' }, cost)
    expect(v.grossLow).toBe(100_000)
    expect(v.grossHigh).toBe(150_000)
    expect(v.status).toBe('sufficient')
    expect(v.note).toContain('fully recoverable')
  })
  it('grosses up by only the unrecovered share for partial recovery', () => {
    const v = budgetVerdict({ q4_3_budget: 150_000, q4_3a_vatPosition: 'Partially recoverable', q4_3a_vatRecoverablePct: '50' }, cost)
    expect(v.grossLow).toBe(110_000)    // 100k × (1 + 0.2 × 0.5)
    expect(v.grossHigh).toBe(165_000)
    expect(v.note).toContain('unrecovered 50% of VAT')
  })
  it('defaults to non-recoverable (full VAT) when the question is unanswered, and reads the rate from cost.vatPct', () => {
    const v = budgetVerdict({ q4_3_budget: 150_000 }, { ...cost, vatPct: 5 })
    expect(v.grossLow).toBe(105_000)
    expect(v.grossHigh).toBe(158_000)   // 157,500 rounded to the nearest £1,000
  })
})
