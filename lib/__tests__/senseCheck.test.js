import { describe, it, expect } from 'vitest'
import { budgetVerdict, runSenseCheck } from '../senseCheck.js'

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

// VAT recoverability is deliberately NOT asked — the question existed briefly
// as Q4.3a and was removed because it changed no cost, only this sentence. The
// budget is always compared against the estimate plus full VAT, at the rate the
// workbook's Tab 3 G row gives.
describe('budgetVerdict — VAT is always added at the workbook rate', () => {
  const cost = { total: { low: 100_000, high: 150_000 }, vatPct: 20 }
  it('grosses the estimate up by the full VAT rate', () => {
    const v = budgetVerdict({ q4_3_budget: 150_000 }, cost)
    expect(v.grossLow).toBe(120_000)
    expect(v.grossHigh).toBe(180_000)
    expect(v.note).toContain('incl. fees and VAT')
  })
  it('reads the rate from cost.vatPct rather than a hard-coded 20%', () => {
    const v = budgetVerdict({ q4_3_budget: 150_000 }, { ...cost, vatPct: 5 })
    expect(v.grossLow).toBe(105_000)
    expect(v.grossHigh).toBe(158_000)   // 157,500 rounded to the nearest £1,000
  })
  it('ignores any leftover VAT-position answer on a draft saved before the question was removed', () => {
    const withLegacy = budgetVerdict({ q4_3_budget: 150_000, q4_3a_vatPosition: 'Fully recoverable' }, cost)
    const without    = budgetVerdict({ q4_3_budget: 150_000 }, cost)
    expect(withLegacy).toEqual(without)
  })
})

// runSenseCheck is async and its signature is (cost, programme, answers) — cost
// first, not answers. It reads cost.gifa / bcisFactor / bandFactor / works.mid /
// projectType, and programme.sizeBandUsed / totalWeeks. It fetches the Benchmark
// Check sheet inside a try/catch, so a network failure degrades to "cost check
// skipped" rather than throwing.
describe('senseCheck — rate fallback diagnostic (internal only)', () => {
  const COST = {
    projectType: 'Other or mixed',
    gifa: 850, bcisFactor: 1, bandFactor: 1,
    works: { mid: 500_000 },
    total: { mid: 700_000, low: 630_000, high: 770_000 },
    rateFallbacks: ['1.1', '1.3'],
  }
  const PROGRAMME = { sizeBandUsed: 'S4', totalWeeks: 40 }
  const ANSWERS = { q1_3_buildingUse: 'Commercial offices' }

  it('raises an internal warning naming the codes', async () => {
    const r = await runSenseCheck(COST, PROGRAMME, ANSWERS)
    const w = r.warnings.find(x => x.code === 'RATE_FALLBACK')
    expect(w).toBeDefined()
    expect(w.internal).toBe(true)
    expect(w.message).toContain('1.1')
  })

  it('never lets the diagnostic reach the client', async () => {
    const r = await runSenseCheck(COST, PROGRAMME, ANSWERS)
    expect(r.clientWarnings.find(x => x.code === 'RATE_FALLBACK')).toBeUndefined()
  })

  it('raises nothing when no element used the fallback', async () => {
    const r = await runSenseCheck(
      { ...COST, projectType: 'Refurbishment', rateFallbacks: [] }, PROGRAMME, ANSWERS)
    expect(r.warnings.find(x => x.code === 'RATE_FALLBACK')).toBeUndefined()
  })
})

// Regression: the cost-per-m² check silently doing nothing.
//
// Sheet 8 has no "Fit-out | Education" row, lookupBenchmark() returns null with
// no fallback, and the else branch used to be a bare console.log. A 95 m² campus
// coffee shop priced at £189/m² — roughly 5–10× under the nearest comparable
// band — therefore raised no COST_LOW and was graded "A — High Confidence".
// These pin the rule that an absent check can never read as a passed check.
describe('senseCheck — benchmark coverage', () => {
  const PROGRAMME = { sizeBandUsed: 'S1', totalWeeks: 20 }
  // The real report's figures: 95 m², £18,000 works mid → £189/m².
  const COFFEE_SHOP = {
    projectType: 'Fit-out',
    gifa: 95, bcisFactor: 1, bandFactor: 1,
    works: { mid: 18_000 },
    total: { mid: 27_000, low: 25_000, high: 29_000 },
  }

  it('flags that the check did not run when no band matches the combination', async () => {
    const r = await runSenseCheck(COFFEE_SHOP, PROGRAMME, { q1_3_buildingUse: 'Education' })
    expect(r.benchmarkChecked).toBe(false)
    const w = r.warnings.find(x => x.code === 'BENCHMARK_MISSING')
    expect(w).toBeDefined()
    expect(w.internal).toBe(true)
    expect(w.message).toContain('Fit-out')
  })

  it('keeps the workbook gap out of the client-facing warnings', async () => {
    const r = await runSenseCheck(COFFEE_SHOP, PROGRAMME, { q1_3_buildingUse: 'Education' })
    expect(r.clientWarnings.find(x => x.code === 'BENCHMARK_MISSING')).toBeUndefined()
  })

  it('reports the check as having run when a band does match', async () => {
    // "Fit-out | Office/Commercial" is a real row in Sheet 8 (500–1200 £/m²).
    const r = await runSenseCheck(
      { ...COFFEE_SHOP, works: { mid: 80_000 } },   // £842/m² — inside the band
      PROGRAMME,
      { q1_3_buildingUse: 'Commercial offices' })
    expect(r.benchmarkChecked).toBe(true)
    expect(r.warnings.find(x => x.code === 'BENCHMARK_MISSING')).toBeUndefined()
    expect(r.expectedBand).not.toBeNull()
  })

  it('still raises COST_LOW when a band exists and the figure is under it', async () => {
    const r = await runSenseCheck(COFFEE_SHOP, PROGRAMME, { q1_3_buildingUse: 'Commercial offices' })
    expect(r.benchmarkChecked).toBe(true)
    expect(r.warnings.find(x => x.code === 'COST_LOW')).toBeDefined()
  })
})
