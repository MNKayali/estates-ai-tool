// Deterministic sense-check. Runs after both calculators, before AI call.
// Returns warnings[] consumed by callClaudeForProse.
//
// Cost benchmarks are NOT hard-coded — they are read from the NRM1 workbook's
// '3. Settings' ▶ benchmarks table (expected blended WORKS £/m² by project type
// code × building use code). Editing a benchmark means editing the workbook,
// not this file.

import { getBenchmarkContext } from './costCalculator.js'

// Programme benchmarks remain in code — there is no programme-benchmark sheet in
// the NRM1 workbook (the programme workbook is keyed differently). Size-band wide
// envelopes only, used to catch a missing survey / design / tender period.
const PROGRAMME_BENCHMARKS = {
  S1: { min: 6,  max: 65  },
  S2: { min: 8,  max: 80  },
  S3: { min: 10, max: 100 },
  S4: { min: 15, max: 130 },
  S5: { min: 25, max: 160 },
  S6: { min: 35, max: 200 },
}

// ─── Budget verdict ───────────────────────────────────────────────────────────
// Deterministic comparison of the user's stated budget (Q4.3, defined as the
// TOTAL including all fees and VAT) against the gross estimate range. Gross =
// total (excl. VAT) × 1.2, matching the 20% VAT the cost engine already applies.
// Mirrors the target-date achievability pattern in programmeCalculator.js.
// Exported so route.js can put the verdict in the prompt and the report, while
// runSenseCheck raises the shortfall warning from the same source of truth.
export function budgetVerdict(answers, cost) {
  const budget = Number(answers?.q4_3_budget) || 0
  const low  = cost?.total?.low
  const high = cost?.total?.high
  if (!budget || !low || !high) return { status: 'none' }

  // VAT rate comes from the NRM1 workbook's G row (via cost.vatPct), never a
  // literal. Recoverability is NOT asked: a question for it existed briefly as
  // Q4.3a and was removed because it changed no cost, only this sentence. The
  // budget is therefore compared against the estimate plus full VAT, which is
  // the conservative reading and what Q4.3's own help text tells the user to
  // include.
  const vatPct = Number.isFinite(Number(cost?.vatPct)) && Number(cost?.vatPct) > 0 ? Number(cost.vatPct) : 20
  const grossFactor = 1 + vatPct / 100
  const vatNote = 'incl. fees and VAT'

  const r1k = n => Math.round(n / 1000) * 1000
  const grossLow  = r1k(low  * grossFactor)
  const grossHigh = r1k(high * grossFactor)
  const f = n => `£${Math.round(n).toLocaleString('en-GB')}`

  if (budget >= grossHigh) {
    const margin = budget - grossHigh
    return {
      status: 'sufficient', budget, grossLow, grossHigh, margin, grossFactor,
      note: `The stated budget of ${f(budget)} (${vatNote}) is sufficient against the estimated gross range of ${f(grossLow)} – ${f(grossHigh)}, with headroom of approximately ${f(margin)} above the top of the range.`,
    }
  }
  if (budget >= grossLow) {
    return {
      status: 'tight', budget, grossLow, grossHigh, grossFactor,
      note: `The stated budget of ${f(budget)} (${vatNote}) falls within the estimated gross range of ${f(grossLow)} – ${f(grossHigh)} but does not cover the upper end; it is achievable only if the project prices toward the lower end of the range.`,
    }
  }
  const shortfall = grossLow - budget
  return {
    status: 'insufficient', budget, grossLow, grossHigh, shortfall, grossFactor,
    note: `The stated budget of ${f(budget)} (${vatNote}) is below the estimated gross range of ${f(grossLow)} – ${f(grossHigh)}, a shortfall of approximately ${f(shortfall)} against even the lower end. Scope, specification or budget will need to be revisited.`,
  }
}

/**
 * Re-judges the budget against the FINAL cost and brings the BUDGET_SHORTFALL
 * warning into line with it. runSenseCheck() runs before the last,
 * confidence-linked range pass (the grade it feeds decides that range), so its
 * shortfall warning describes a range the report never prints. Without this,
 * the stale warning reached the AI prompt and the risk register, and a report
 * could say "£2,000 shortfall" beside a budget box saying the budget fits.
 * The confidence grade is not recomputed: it is what set the final range.
 */
export function refreshBudget(senseCheck, answers, cost) {
  const budget = budgetVerdict(answers, cost)
  const fresh = budget.status === 'insufficient'
    ? [{ code: 'BUDGET_SHORTFALL', severity: 'medium', field: 'cost', message: budget.note }]
    : []
  senseCheck.budget = budget
  senseCheck.warnings = [...(senseCheck.warnings || []).filter(w => w.code !== 'BUDGET_SHORTFALL'), ...fresh]
  senseCheck.clientWarnings = senseCheck.warnings.filter(w => !w.internal)
  senseCheck.hasWarnings = senseCheck.warnings.length > 0
  senseCheck.hasClientWarnings = senseCheck.clientWarnings.length > 0
  return senseCheck
}

export async function runSenseCheck(cost, programme, answers = {}) {
  const warnings = []

  // ── Cost per m² check (▶ benchmarks) ───────────────────────────────────────
  const gifa = cost.gifa || 1
  const bcisFactor = cost.bcisFactor || 1
  const bandFactor = cost.bandFactor || 1
  const actualPerSqm = cost.works.mid / gifa
  const normPerSqm = actualPerSqm / bcisFactor / bandFactor

  let bench = null
  let benchUnavailable = null   // set when the sheet itself could not be read
  try {
    const { bands, pt, use } = await getBenchmarkContext({ q1_2_projectType: cost.projectType, q1_3_buildingUse: answers.q1_3_buildingUse })
    const band = bands.find(b => b.pt === pt && b.use === use)
    if (band) bench = { low: band.low, high: band.high, projectType: cost.projectType, buildingUse: answers.q1_3_buildingUse }
  } catch (e) {
    benchUnavailable = e.message
    console.warn('[Sense check] Benchmark table unavailable — cost check skipped:', e.message)
  }

  if (bench) {
    if (normPerSqm < bench.low) {
      warnings.push({
        code: 'COST_LOW',
        severity: 'medium',
        field: 'cost',
        message:
          `Works cost is £${Math.round(actualPerSqm)}/m² ` +
          `(£${Math.round(normPerSqm)}/m² normalised) — below the expected range ` +
          `of £${bench.low}–£${bench.high}/m² for ${bench.projectType} / ${bench.buildingUse}. ` +
          `Check that all applicable scope items have been selected and that no rate returned zero.`,
      })
    } else if (normPerSqm > bench.high) {
      // Benchmark guidance: small high-density spaces (e.g. a WC block) can
      // legitimately exceed per-m² bands — treat as a review flag, not a fail.
      warnings.push({
        code: 'COST_HIGH',
        severity: 'medium',
        field: 'cost',
        message:
          `Works cost is £${Math.round(actualPerSqm)}/m² ` +
          `(£${Math.round(normPerSqm)}/m² normalised) — above the expected range ` +
          `of £${bench.low}–£${bench.high}/m² for ${bench.projectType} / ${bench.buildingUse}. ` +
          `This is a review flag, not a fault: small high-density spaces (e.g. a WC block) can ` +
          `legitimately exceed per-m² bands. Verify scope for double-counting before relying on the figure.`,
      })
    }
    // within band → no warning
  } else {
    // The cost check did NOT run. Until September 2026 this was a bare
    // console.log on a server nobody reads, which made "I checked it and it is
    // fine" and "I could not check it at all" look identical to every consumer
    // — the report, the prompt and the confidence grade. A 95 m² coffee shop
    // priced at £189/m² (roughly 5–10× too low) was consequently graded
    // "A — High Confidence", because with no benchmark there was no COST_LOW to
    // drag the grade down. An absent check must never read as a passed check.
    //
    // Flagged `internal` for the same reason as RULE_UNMATCHED: the cause is a
    // gap in OUR workbook (▶ benchmarks has no row for this combination), not
    // anything about the client's project, so it stays out of the prose prompt
    // and the client-facing warning list. The consequence still reaches the
    // client, via the confidence deficiency computeConfidence() raises from
    // `benchmarkChecked` — worded as a limitation of the estimate rather than
    // as an engineering diagnostic.
    warnings.push({
      code: 'BENCHMARK_MISSING',
      severity: 'medium',
      internal: true,
      field: 'cost',
      message: benchUnavailable
        ? `Benchmark table could not be read (${benchUnavailable}) — the cost-per-m² check did not run. ` +
          `The estimate has not been validated against any published band.`
        : `'3. Settings' ▶ benchmarks has no band for "${cost.projectType}" / "${answers.q1_3_buildingUse || '(none)'}" — ` +
          `the cost-per-m² check did not run at £${Math.round(actualPerSqm)}/m². ` +
          `Add the row to the NRM1 workbook so this combination is checked.`,
    })
    console.warn('[Sense check] No benchmark band for', cost.projectType, '/', answers.q1_3_buildingUse,
      '— cost check SKIPPED at', Math.round(actualPerSqm), '/m². Confidence capped.')
  }

  // ── BCIS postcode check ─────────────────────────────────────────────────────
  // The cost engine silently falls back to the West Midlands factor when the
  // postcode prefix matches no BCIS region — flag it so a typo'd postcode
  // cannot misprice a project unnoticed.
  if (cost.bcisDefaulted) {
    warnings.push({
      code: 'POSTCODE_UNMATCHED',
      severity: 'medium',
      field: 'cost',
      message:
        // Client-facing (it reaches the risk register): says what was assumed
        // and what to do, not how the lookup works (test report EW-3).
        `The postcode "${answers.q1_1_postcode || ''}" was not recognised, so the estimate uses the ` +
        `${cost.bcisRegion} regional cost factor (${cost.bcisFactor}). ` +
        `Confirm the site location: a different region would change the estimate by up to 25%.`,
    })
  }

  // ── Percentage-rule condition check ─────────────────────────────────────────
  // Conditions in the workbook's Tab 3 that matched no evaluator branch were
  // treated as not applicable. Usually means a condition was reworded in the
  // workbook — the rule silently stops firing until the wording is aligned.
  //
  // Flagged `internal`: this reports a defect in our own workbook/evaluator, not
  // anything about the client's project. It must stay out of the prose prompt and
  // the confidence grade — left in, the AI dutifully wrote it up as a client-
  // facing risk register entry ("percentage-rule condition ... was not
  // recognised"), which is an engineering diagnostic in a professional
  // deliverable. It remains in the returned result and the server log so it is
  // still visible to us.
  if ((cost.unmatchedConditions || []).length > 0) {
    warnings.push({
      code: 'RULE_UNMATCHED',
      severity: 'medium',
      internal: true,
      field: 'cost',
      message:
        `${cost.unmatchedConditions.length} percentage-rule condition(s) in the NRM1 workbook were not recognised ` +
        `and were treated as not applicable: ${cost.unmatchedConditions.map(c => `"${c}"`).join('; ')}. ` +
        `The affected percentage additions may be understated — align the workbook condition wording.`,
    })
  }

  // ── Rate fallback diagnostic ────────────────────────────────────────────────
  // Internal only. "Other or mixed" prices from the refurbishment columns and
  // falls back to new build where there is no refurbishment rate, so the
  // estimate can span two rate families. Deliberately NOT shown to the client
  // (decision, 21 September 2026) — it is a maintainer diagnostic, the same
  // way RULE_UNMATCHED is.
  const fallbacks = cost?.rateFallbacks || []
  if (fallbacks.length > 0) {
    warnings.push({
      code: 'RATE_FALLBACK',
      internal: true,
      message: `${fallbacks.length} element(s) priced from the new build column because the applicable rate family had no rate: ${fallbacks.join(', ')}.`,
    })
  }

  // ── Programme weeks check ───────────────────────────────────────────────────
  const sizeBand = programme.sizeBandUsed || 'S2'
  const pb = PROGRAMME_BENCHMARKS[sizeBand] || PROGRAMME_BENCHMARKS.S2
  const totalWeeks = programme.totalWeeks

  if (totalWeeks < pb.min) {
    warnings.push({
      code: 'PROG_SHORT',
      severity: 'high',
      field: 'programme',
      message:
        `Programme of ${totalWeeks} weeks is shorter than the expected minimum ` +
        `(${pb.min} weeks) for a ${sizeBand} project. ` +
        `A survey, design stage, or procurement period may be missing.`,
    })
  } else if (totalWeeks > pb.max) {
    warnings.push({
      code: 'PROG_LONG',
      severity: 'low',
      field: 'programme',
      message:
        `Programme of ${totalWeeks} weeks exceeds the typical maximum ` +
        `(${pb.max} weeks) for a ${sizeBand} project. ` +
        `This may be appropriate for complex or phased projects.`,
    })
  }

  // ── Budget shortfall check ──────────────────────────────────────────────────
  const budget = budgetVerdict(answers, cost)
  if (budget.status === 'insufficient') {
    warnings.push({
      code: 'BUDGET_SHORTFALL',
      severity: 'medium',
      field: 'cost',
      message: budget.note,
    })
  }

  // `warnings` stays complete for the log and any admin view. `clientWarnings` is
  // the subset safe to put in front of the AI and therefore the client — callers
  // building the prose prompt or grading confidence must use that one.
  const clientWarnings = warnings.filter(w => !w.internal)

  const result = {
    warnings,
    hasWarnings: warnings.length > 0,
    clientWarnings,
    hasClientWarnings: clientWarnings.length > 0,
    costPerSqm: Math.round(actualPerSqm),
    normalisedCostPerSqm: Math.round(normPerSqm),
    expectedBand: bench ? { low: bench.low, high: bench.high, key: `${bench.projectType} / ${bench.buildingUse}` } : null,
    // Did the cost-per-m² comparison actually happen? Read by computeConfidence()
    // in lib/prose.js — an unchecked estimate cannot be graded A. Kept as its own
    // boolean rather than inferred from `expectedBand === null` so the meaning is
    // explicit at both ends and a future band-lookup change cannot silently
    // decouple the two.
    benchmarkChecked: !!bench,
    budget,
  }
  console.log('[Sense check]', JSON.stringify(result))
  return result
}
