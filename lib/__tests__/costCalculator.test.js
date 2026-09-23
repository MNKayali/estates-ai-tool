import { describe, it, expect } from 'vitest'
import { calculateCost } from '../costCalculator.js'

/**
 * These read the real NRM1 v5.2 workbook (the copy in the repository — see
 * vitest.setup.mjs). The thing under test is whether the percentage-rule
 * matcher picks the right '3. Settings' ▶ percentage_rules row for a given
 * answer, which only exists in the workbook; a mock would just re-encode
 * today's expected values rather than catch a workbook edit that silently
 * changes them — which is exactly the failure mode these guard.
 *
 * BASE and several tests below still tick v4.5 codes ('0.5', '3.1', '5.8a').
 * That is deliberate: they now also exercise the translation of old drafts and
 * KV reports through 'Replaces old codes', and every percentage they pin must
 * come out the same through it.
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
  it('prices Group 3 finishes only when they are actually ticked — never as a hidden auto-include', async () => {
    const noFinishes = await calculateCost({ ...BASE, q2_2_scopeItems: ['S-0040', 'S-0039'] }, 0)
    expect(noFinishes.lineItems.some(li => li.group === 3)).toBe(false)

    const withFinishes = await calculateCost({ ...BASE, q2_2_scopeItems: ['S-0040', 'S-0039', 'S-0021', 'S-0022', 'S-0023'] }, 0)
    expect(withFinishes.lineItems.map(li => li.code)).toEqual(expect.arrayContaining(['S-0021', 'S-0022', 'S-0023']))
  })

  it('an item whose quantity rule is ENTER is excluded with a reason until the user gives a quantity', async () => {
    // Showers (S-0026) has no reliable estimate in the workbook.
    const none = await calculateCost({ ...BASE, q2_2_scopeItems: ['S-0021', 'S-0026'], q2_2_quantities: {} }, 0)
    expect(none.lineItems.some(li => li.code === 'S-0026')).toBe(false)
    const excluded = none.excludedNoQuantity.find(e => e.code === 'S-0026')
    expect(excluded).toBeDefined()
    expect(excluded.reason).toMatch(/no quantity/i)

    const given = await calculateCost({ ...BASE, q2_2_scopeItems: ['S-0021', 'S-0026'], q2_2_quantities: { 'S-0026-01': 6 } }, 0)
    const line = given.lineItems.find(li => li.code === 'S-0026')
    expect(line).toMatchObject({ qty: 6, qtySource: 'user' })
  })

  it("builder's work is the only automatic line: declared with the workbook's reason, and only when a Group 5 line is priced", async () => {
    const services = await calculateCost({ ...BASE, q1_2_projectType: 'Fit-out', q2_2_scopeItems: ['S-0040', 'S-0039'] }, 0)
    expect(services.autoIncludes.map(a => a.code)).toEqual(['S-0083'])
    for (const a of services.autoIncludes) expect(a.reason).toMatch(/group 5/i)
    // Strip-out is a tickable item in v5.2, no longer a silent auto-include.
    expect(services.lineItems.some(li => li.code === 'S-0003')).toBe(false)

    const finishesOnly = await calculateCost({ ...BASE, q2_2_scopeItems: ['S-0021'] }, 0)
    expect(finishesOnly.autoIncludes).toEqual([])
  })

  it('an item not offered for the project type is recorded as an adjustment, never silently dropped', async () => {
    // Foundations are not 'Shown on' Refurbishment.
    const cost = await calculateCost({ ...BASE, q2_2_scopeItems: ['S-0021', 'S-0008'] }, 0)
    expect(cost.lineItems.some(li => li.code === 'S-0008')).toBe(false)
    expect(cost.adjustments.find(a => a.code === 'S-0008')?.reason).toMatch(/not offered/i)
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

  it('widens the range for a worse grade from ▶ range_widths (skips with a message if the workbook has no such table)', async ({ skip }) => {
    const a = await calculateCost(BASE, 0, 0, { rangeGrade: 'A' })
    if (!a.rangeApplied.fromWorkbook) {
      skip("No ▶ range_widths table on '3. Settings' yet (optional in NRM1 v5.2) — the legacy ±11% range applies")
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

describe('getScopeCatalogue — what the questionnaire is sent', () => {
  it('carries every rule the picker needs and no rates or price sources', async () => {
    const { getScopeCatalogue } = await import('../costCalculator.js')
    const cat = await getScopeCatalogue()
    expect(cat.items.length).toBeGreaterThan(80)
    for (const it of cat.items) {
      for (const o of it.options) {
        expect(o).not.toHaveProperty('rows')
        expect(o).not.toHaveProperty('rates')
        expect(typeof o.priceableFor).toBe('object')
      }
    }
    const byId = Object.fromEntries(cat.items.map(i => [i.id, i]))
    // Foundations price for new build only; strip-out for refurbishment only.
    expect(byId['S-0008'].options[0].priceableFor).toMatchObject({ NB: true, RF: false })
    expect(byId['S-0003'].options[0].priceableFor).toMatchObject({ RF: true, NB: false })
    // Q2.4: new build has no Basic column, so only Standard and High are offered.
    expect(cat.settings.projectTypes.find(p => p.code === 'NB').specLevels).toEqual(['Standard', 'High'])
    expect(cat.settings.projectTypes.find(p => p.code === 'RF').specLevels).toEqual(['Basic', 'Standard', 'High'])
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

describe('costCalculator — Q3.3 surveys: blank behaves as "None"', () => {
  // Q3.3 is optional. Blank used to mean two different things at once:
  // computeConfidence downgraded the grade for having no surveys, while the
  // Tab 3 matcher required the literal "None" and so skipped the risk uplift.
  it('an omitted answer and an explicit "None" produce identical percentages', async () => {
    const omitted = await calculateCost({ ...BASE, q3_3_surveys: undefined }, 0)
    const empty   = await calculateCost({ ...BASE, q3_3_surveys: [] }, 0)
    const none    = await calculateCost({ ...BASE, q3_3_surveys: ['None'] }, 0)
    expect(omitted.percentages).toEqual(none.percentages)
    expect(empty.percentages).toEqual(none.percentages)
  })

  it('and both still differ from a project that actually holds a survey', async () => {
    const none = await calculateCost({ ...BASE, q3_3_surveys: [] }, 0)
    const held = await calculateCost({ ...BASE, q3_3_surveys: ['Condition'] }, 0)
    expect(none.percentages.risk).toBeGreaterThan(held.percentages.risk)
    const fired = none.trace.risk.some(e => /q3\.3/i.test(e.label))
    expect(fired).toBe(true)
  })
})

// September 2026 — "Other or mixed" ('Per component' on ▶ project_types) prices
// from the refurbishment columns, falling back to new build where those are
// zero — the permanent design since the mixed area split was dropped. Without
// the fallback a mixed project silently carries no foundations.
describe('cost — Other or mixed rate fallback', () => {
  const MIXED  = { ...BASE, q1_2_projectType: 'Other or mixed', q2_2_scopeItems: ['S-0008', 'S-0009', 'S-0021'] }
  const REFURB = { ...BASE, q2_2_scopeItems: ['S-0021'] }

  it('prices substructure on Other or mixed from the new-build column', async () => {
    const cost = await calculateCost(MIXED, 0)
    const codes = cost.lineItems.map(l => l.code)
    expect(codes).toContain('S-0008')
    expect(codes).toContain('S-0009')
    for (const l of cost.lineItems) if (l.code === 'S-0008' || l.code === 'S-0009') expect(l.lineMid).toBeGreaterThan(0)
    expect(cost.rateFallbacks).toEqual(expect.arrayContaining(['S-0008', 'S-0009']))
  })

  it('leaves an item that has a refurbishment rate on the refurbishment column', async () => {
    const mixed  = await calculateCost(MIXED, 0)
    const refurb = await calculateCost(REFURB, 0)
    const pick = c => c.lineItems.find(l => l.code === 'S-0021')?.rate
    expect(pick(mixed)).toBeGreaterThan(0)
    // Mixed has no level of intervention, refurbishment does (band 1.0 at level 3),
    // so the two rates are the same refurbishment figure.
    expect(pick(mixed)).toBe(pick(refurb))
    expect(mixed.rateFallbacks).not.toContain('S-0021')
  })

  it('Solar PV on External works only prices at the Ext Works rate (filled in workbook v5.3) from the kWp the user gives', async () => {
    const cost = await calculateCost({ ...BASE, q1_2_projectType: 'External works only', q1_5_size: '2500', q2_2_scopeItems: ['S-0055'], q2_2_quantities: { 'S-0055-01': 50 } }, 0)
    const pv = cost.lineItems.find(l => l.code === 'S-0055')
    expect(pv).toMatchObject({ qty: 50, qtySource: 'user' })
    expect(pv.lineMid).toBeGreaterThan(0)
  })
})
