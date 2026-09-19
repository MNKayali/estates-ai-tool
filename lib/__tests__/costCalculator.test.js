import { describe, it, expect } from 'vitest'
import { calculateCost } from '../costCalculator.js'

/**
 * These fetch the real remote NRM1 workbook (RATES_FILE_URL) — there is no
 * offline fixture, matching scripts/baseline.mjs's own approach and for the
 * same reason: the thing under test is whether the percentage-rule matcher
 * picks the right Tab 3 row for a given answer, which only exists in the
 * live workbook. Slower than a mocked unit test, but a mock would just
 * re-encode today's expected values rather than catch a workbook edit that
 * silently changes them — which is exactly the failure mode these guard.
 *
 * Each test below pins down one of the two "general pattern shadows
 * specific" percentage-rule bugs found and fixed this session, so they can
 * never silently come back:
 */
const BASE = {
  q1_0_projectName: 'Test',
  q1_1_postcode: 'B29',
  q1_2_projectType: 'Refurbishment',
  q1_2_storeys: '2',
  q1_3_buildingUse: 'Commercial offices',
  q1_4_buildingAge: '1980–1999',
  q1_5_size: '850',
  q2_1_objective: 'Test scenario.',
  q2_2_scopeItems: ['0.5', '3.1', '3.2', '5.1', '5.2'],
  q2_2_quantities: {},
  q2_3_interventionLevel: 'Full systems replacement',
  q2_4_specLevel: 'Standard',
  q2_5_standards: '',
  q3_1_knownIssues: [],
  q3_3_surveys: ['Condition'],
  q3_4_planningConsents: 'No consent required',
  q3_5_accessConstraints: [],
  q3_6_occupation: 'Fully occupied',
  q4_5_designStage: 'Stage 0–1',
  q4_6_phasing: 'Single phase',
  q4_7_funding: 'Internal / commercial',
}

describe('costCalculator percentage rules — Tab 3 condition matching', () => {
  it('a listed building with full planning gets the 4% listed-building dev cost, not the general 3.5% full-planning rate', async () => {
    // Bug: the general "Full planning (3-4%, use 3.5%)" row's condition text
    // contains no "listed", but was tested first and its clause matched the
    // *answer* text's "full planning" substring regardless — so the more
    // specific 4% listed-building row was unreachable whenever the answer
    // also mentioned "full planning" (which the combined option always does).
    const cost = await calculateCost({
      ...BASE,
      q3_4_planningConsents: 'Full planning + Listed Building Consent',
    }, 0)
    expect(cost.percentages.devCosts).toBe(4)
  })

  it('the heritage +2pp fee uplift fires for a listed building even when it is not Pre-1900', async () => {
    // Bug: the rule is "Q1.4 = Pre-1900 OR Q3.4 includes Listed Building
    // Consent", but the Pre-1900 branch was tested first and returned on the
    // age test alone — so a listed 1980s building got no uplift at all.
    const listedNotPre1900 = await calculateCost({
      ...BASE,
      q1_4_buildingAge: '1980–1999',
      q3_4_planningConsents: 'Full planning + Listed Building Consent',
    }, 0)
    const neitherPre1900NorListed = await calculateCost({
      ...BASE,
      q1_4_buildingAge: '1980–1999',
      q3_4_planningConsents: 'No consent required',
    }, 0)
    expect(listedNotPre1900.percentages.fees - neitherPre1900NorListed.percentages.fees).toBe(2)
  })

  it('the heritage +2pp fee uplift still fires for a Pre-1900 building that is not listed (the general case, unaffected by the OR-condition fix)', async () => {
    const pre1900NotListed = await calculateCost({
      ...BASE,
      q1_4_buildingAge: 'Pre-1900',
      q3_4_planningConsents: 'No consent required',
    }, 0)
    const neitherPre1900NorListed = await calculateCost({
      ...BASE,
      q1_4_buildingAge: '1980–1999',
      q3_4_planningConsents: 'No consent required',
    }, 0)
    expect(pre1900NotListed.percentages.fees - neitherPre1900NorListed.percentages.fees).toBe(2)
  })

  it('a Pre-1900 AND listed building gets the uplift exactly once, not twice', async () => {
    const both = await calculateCost({
      ...BASE,
      q1_4_buildingAge: 'Pre-1900',
      q3_4_planningConsents: 'Full planning + Listed Building Consent',
    }, 0)
    const neither = await calculateCost({
      ...BASE,
      q1_4_buildingAge: '1980–1999',
      q3_4_planningConsents: 'No consent required',
    }, 0)
    expect(both.percentages.fees - neither.percentages.fees).toBe(2)
  })
})

describe('costCalculator — BCIS location factor', () => {
  it('does not silently zero the location multiplier for an unrecognised postcode', async () => {
    const cost = await calculateCost({ ...BASE, q1_1_postcode: 'ZZ99' }, 0)
    expect(cost.bcisFactor).toBeGreaterThan(0)
  })
})

describe('costCalculator — Stage 2 professional fee condition matching', () => {
  // Pins the IBRB bug-fix-brief item 2/3 scenario alongside the two existing
  // "general pattern shadows specific" regressions above: Q4.5 = "Concept
  // complete (Stage 2)" must match the Tab 3 "Q4.5 = Stage 2 → 10–13% (use
  // 11.5%)" BASE row exactly, never the Stage 0–1 row (which used to swallow
  // it via a bare "stage" substring test) and never fall through to the
  // hard-coded fallback ladder (which would also happen to read 11.5% here,
  // masking the miss — see the M&E-heavy test below for why the fallback
  // must never fire silently).
  it('Q4.5 = "Concept complete (Stage 2)" matches the Stage 2 BASE row, not Stage 0–1 or the fallback ladder', async () => {
    const cost = await calculateCost({
      ...BASE,
      q2_2_scopeItems: ['3.1', '3.2'], // no M&E items — isolates the BASE row value
      q4_5_designStage: 'Concept complete (Stage 2)',
    }, 0)
    expect(cost.percentages.fees).toBe(11.5)
    expect(cost.unmatchedConditions).toEqual([])
  })

  it('an M&E-heavy scope (≥4 Group 5 items) adds the +1.5pp uplift on top of the matched Stage 2 base — this, not a fee-band flip, is why two otherwise-identical projects can show 11.5% vs 13%', async () => {
    const financeHeavy = await calculateCost({
      ...BASE,
      q2_2_scopeItems: ['5.1', '5.2', '5.7', '5.8a', '5.16'],
      q4_5_designStage: 'Concept complete (Stage 2)',
    }, 0)
    const finishesOnly = await calculateCost({
      ...BASE,
      q2_2_scopeItems: ['3.1', '3.2'],
      q4_5_designStage: 'Concept complete (Stage 2)',
    }, 0)
    expect(finishesOnly.percentages.fees).toBe(11.5)
    expect(financeHeavy.percentages.fees).toBe(13)
    expect(financeHeavy.unmatchedConditions).toEqual([])
  })
})

describe('costCalculator — scope reconciliation invariant', () => {
  it('prices Group 3 finishes only when they are actually ticked — not as a hidden unconditional auto-include', async () => {
    const noFinishes = await calculateCost({
      ...BASE,
      q2_2_scopeItems: ['5.1', '5.2'],
    }, 0)
    expect(noFinishes.lineItems.some(li => li.code.startsWith('3.'))).toBe(false)

    const withFinishes = await calculateCost({
      ...BASE,
      q2_2_scopeItems: ['5.1', '5.2', '3.1', '3.2', '3.3'],
    }, 0)
    expect(withFinishes.lineItems.map(li => li.code)).toEqual(
      expect.arrayContaining(['3.1', '3.2', '3.3'])
    )
  })

  it('a ticked count-driven item with no quantity is excluded with a reason, never silently dropped', async () => {
    const cost = await calculateCost({
      ...BASE,
      q2_2_scopeItems: ['3.1', '5.19'], // 5.19 = Lifts, per_nr — needs q1_5_liftNr / q2_2_quantities
      q2_2_quantities: {},
    }, 0)
    expect(cost.lineItems.some(li => li.code === '5.19')).toBe(false)
    const excluded = cost.excludedNoQuantity.find(e => e.code === '5.19')
    expect(excluded).toBeDefined()
    expect(excluded.reason).toMatch(/no quantity/i)
  })

  it('every declared auto-include carries a reason, and the soft-strip/BWIC codes are not silently priced beyond what is declared', async () => {
    const cost = await calculateCost({
      ...BASE,
      q1_2_projectType: 'Fit-out',
      q2_2_scopeItems: ['5.1', '5.2'],
    }, 0)
    const codes = cost.autoIncludes.map(a => a.code)
    expect(codes).toEqual(expect.arrayContaining(['0.5', '5.20']))
    for (const a of cost.autoIncludes) expect(a.reason).toBeTruthy()
  })

  it('does not throw the reconciliation invariant for a normal mixed scope (wiring consolidation + plumbing supersede)', async () => {
    await expect(calculateCost({
      ...BASE,
      q2_2_scopeItems: ['3.1', '5.1', '5.1b', '5.8a', '5.8b'],
      q2_2_wiring: '5.8',
    }, 0)).resolves.toBeTruthy()
  })
})

describe('costCalculator — percentage rule trace (build-up table)', () => {
  it('records every fired Tab 3 rule for prelims and the entries foot to the applied percentage', async () => {
    const cost = await calculateCost({
      ...BASE,
      q3_6_occupation: 'Fully occupied',
      q3_5_accessConstraints: ['Restricted working hours'],
    }, 0)
    const entries = cost.trace.prelims
    // Base + fully occupied + restricted hours, in the order Tab 3 lists them.
    expect(entries.length).toBeGreaterThanOrEqual(3)
    expect(entries[0].label.toLowerCase()).toContain('base')
    expect(entries.some(e => /fully occupied/i.test(e.label))).toBe(true)
    expect(entries.some(e => /restricted working/i.test(e.label))).toBe(true)
    const sum = entries.reduce((s, e) => s + e.pct, 0)
    expect(sum).toBeCloseTo(cost.percentages.prelims, 5)
  })

  it('every traced code foots to its applied percentage, caps included', async () => {
    // Pile on enough risk triggers to hit the E cap so the negative cap entry is exercised.
    const cost = await calculateCost({
      ...BASE,
      q3_3_surveys: ['None'],
      q3_1_knownIssues: ['Unsure — surveys needed', 'Asbestos known or suspected', 'Contaminated land', 'Structural concerns', 'Damp or water ingress'],
      q4_1_targetDate: '2030-01-01',
      q3_6_occupation: 'Fully occupied',
    }, 0)
    for (const [key, pctKey] of [['prelims', 'prelims'], ['ohp', 'ohp'], ['fees', 'fees'], ['devCosts', 'devCosts'], ['risk', 'risk'], ['contingency', 'contingency'], ['inflation', 'inflation']]) {
      const sum = (cost.trace[key] || []).reduce((s, e) => s + e.pct, 0)
      expect(sum, key).toBeCloseTo(cost.percentages[pctKey], 5)
    }
    expect(cost.trace.risk.some(e => /^Capped at/.test(e.label))).toBe(true)
  })
})

describe('costCalculator — confidence-linked range width', () => {
  it('applies the legacy ±11% when no rangeGrade is given', async () => {
    const cost = await calculateCost(BASE, 0)
    expect(cost.rangeApplied).toMatchObject({ grade: null, low: 0.89, high: 1.11, fromWorkbook: false })
  })

  it('widens the range for a worse grade once the Range Widths sheet exists (skips with a message until the workbook is updated)', async ({ skip }) => {
    const a = await calculateCost(BASE, 0, 0, { rangeGrade: 'A' })
    if (!a.rangeApplied.fromWorkbook) {
      skip('Tab "9. Range Widths" not present in the live workbook yet — see docs/workbook-changes-sept-2026.md')
      return
    }
    const d = await calculateCost(BASE, 0, 0, { rangeGrade: 'D' })
    expect(d.total.high - d.total.low).toBeGreaterThan(a.total.high - a.total.low)
    expect(d.total.mid).toBe(a.total.mid)   // the range never moves the mid-point
  })
})

describe('costCalculator — base date, rate source and VAT rate from the workbook', () => {
  it('exposes vatPct from the Tab 3 G row and prices the reference VAT line from it', async () => {
    const cost = await calculateCost(BASE, 0)
    expect(cost.vatPct).toBe(20)
    expect(cost.vat).toBe(Math.round(cost.total.mid * cost.vatPct / 100 / 1000) * 1000)
  })

  it('carries a source string (possibly empty) on every priced line and a baseDate field (null until the workbook row exists)', async () => {
    const cost = await calculateCost(BASE, 0)
    for (const li of cost.lineItems.filter(l => l.code !== 'PS')) expect(typeof li.source).toBe('string')
    expect(cost.baseDate === null || typeof cost.baseDate === 'string').toBe(true)
  })
})

describe('getScopeItems — priceable flags drive the picker', () => {
  it('flags each row by the rate-column family the calculator would read, so an unpriceable tile is never offered', async () => {
    const { getScopeItems } = await import('../costCalculator.js')
    const { groups } = await getScopeItems()
    const all = groups.flatMap(g => g.items)
    const byCode = Object.fromEntries(all.map(i => [i.code, i]))
    // 5.8a is refurb-only (NB/Ext columns 0); 1.1 foundations is new-build/extension only.
    expect(byCode['5.8a'].priceable).toMatchObject({ refurb: true, newBuild: false, extension: false })
    expect(byCode['1.1'].priceable).toMatchObject({ refurb: false, newBuild: true, extension: true })
    // 5.1b: blank rates in v4.5 → not priceable anywhere until the workbook is filled
    // (docs/workbook-changes-sept-2026.md). Once filled, refurb flips to true —
    // either way it must never be offered for a new build.
    expect(byCode['5.1b'].priceable.newBuild).toBe(false)
    // No rates leak through the scope-items payload.
    for (const it of all) for (const k of ['rfbStd', 'rfbBasic', 'rfbHigh', 'nbStd', 'extStd', 'extWorks']) expect(it).not.toHaveProperty(k)
  })
})

describe('costCalculator — Q3.8 higher-risk building rules', () => {
  const HRB = 'Higher-risk building — 7+ storeys or 18 m+, residential / care / hospital use'
  it('applies the Tab 3 "higher-risk" C/D/E rows when present, and changes nothing when they are absent', async () => {
    const plain = await calculateCost({ ...BASE, q3_4_planningConsents: 'Full planning' }, 0)
    const hrb   = await calculateCost({ ...BASE, q3_4_planningConsents: 'Full planning', q3_8_siteContext: [HRB] }, 0)
    const fired = Object.values(hrb.trace).flat().filter(e => /higher-risk/i.test(e.label))
    if (fired.length === 0) {
      // Workbook rows not added yet (docs/workbook-changes-sept-2026.md) — the
      // engine must not conjure an uplift from code.
      expect(hrb.percentages).toEqual(plain.percentages)
      return
    }
    expect(hrb.percentages.fees).toBeGreaterThan(plain.percentages.fees)
    expect(hrb.unmatchedConditions).toEqual(plain.unmatchedConditions)  // the token is recognised, never "unmatched"
  })
})
