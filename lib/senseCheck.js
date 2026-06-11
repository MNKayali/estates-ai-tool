// Deterministic sense-check. Runs after both calculators, before AI call.
// Returns warnings[] consumed by callClaudeForProse.
//
// Cost benchmarks are NOT hard-coded — they are read from the NRM1 workbook
// sheet "8. Benchmark Check" (expected blended WORKS £/m² by Q1.2 × Q1.3).
// Editing a benchmark means editing the workbook, not this file.

import * as XLSX from 'xlsx'
import { fetchRatesWorkbook } from './costCalculator.js'
import { BUILDING_USE_TAGS } from './buildingUse.js'

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

// ─── Sheet 8 "Benchmark Check" parser ────────────────────────────────────────
// Cols: 0 Project Type (Q1.2) · 1 Building Use (Q1.3) · 2 Expected Low £/m² ·
//       3 Expected High £/m². Banner/note/header rows are skipped because a data
//       row is the only kind with numeric Low AND High in cols 2–3.
function parseBenchmarkCheck(wb) {
  const ws = wb.Sheets['8. Benchmark Check']
  if (!ws) return []
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const bands = []
  for (const r of rows) {
    const projectType = String(r[0] || '').trim()
    const buildingUse = String(r[1] || '').trim()
    const low = Number(r[2])
    const high = Number(r[3])
    if (!projectType || !buildingUse) continue
    if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high <= 0) continue
    bands.push({ projectType, buildingUse, low, high })
  }
  return bands
}

// Q1.2 answer ←→ Sheet 8 "Project Type" cell. Normalise to alpha-only and accept
// either-direction containment so "Fit-out" ↔ "fit out" etc. still line up.
function benchTypeMatches(sheetType, q12) {
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '')
  const a = norm(sheetType), b = norm(q12)
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a))
}

// Q1.3 answer ←→ Sheet 8 "Building Use" cell, via the shared BUILDING_USE_TAGS
// map (the same tags the scope picker and cost engine use). Wildcard/unknown
// uses (Mixed use, Other) have no tags → no specific band → cost check skipped.
function benchUseMatches(sheetUse, q13) {
  const tags = BUILDING_USE_TAGS[q13]
  if (!tags) return false
  const toks = String(sheetUse || '').toLowerCase().split(/[^a-z]+/).filter(Boolean)
  return toks.some(t => tags.some(tag => t.includes(tag) || tag.includes(t)))
}

function lookupBenchmark(bands, projectType, buildingUse) {
  return bands.find(b =>
    benchTypeMatches(b.projectType, projectType) &&
    benchUseMatches(b.buildingUse, buildingUse)
  ) || null
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

  const r1k = n => Math.round(n / 1000) * 1000
  const grossLow  = r1k(low  * 1.2)
  const grossHigh = r1k(high * 1.2)
  const f = n => `£${Math.round(n).toLocaleString('en-GB')}`

  if (budget >= grossHigh) {
    const margin = budget - grossHigh
    return {
      status: 'sufficient', budget, grossLow, grossHigh, margin,
      note: `The stated budget of ${f(budget)} (incl. fees and VAT) is sufficient against the estimated gross range of ${f(grossLow)} – ${f(grossHigh)}, with headroom of approximately ${f(margin)} above the top of the range.`,
    }
  }
  if (budget >= grossLow) {
    return {
      status: 'tight', budget, grossLow, grossHigh,
      note: `The stated budget of ${f(budget)} (incl. fees and VAT) falls within the estimated gross range of ${f(grossLow)} – ${f(grossHigh)} but does not cover the upper end; it is achievable only if the project prices toward the lower end of the range.`,
    }
  }
  const shortfall = grossLow - budget
  return {
    status: 'insufficient', budget, grossLow, grossHigh, shortfall,
    note: `The stated budget of ${f(budget)} (incl. fees and VAT) is below the estimated gross range of ${f(grossLow)} – ${f(grossHigh)}, a shortfall of approximately ${f(shortfall)} against even the lower end. Scope, specification or budget will need to be revisited.`,
  }
}

export async function runSenseCheck(cost, programme, answers = {}) {
  const warnings = []

  // ── Cost per m² check (Sheet 8) ─────────────────────────────────────────────
  const gifa = cost.gifa || 1
  const bcisFactor = cost.bcisFactor || 1
  const bandFactor = cost.bandFactor || 1
  const actualPerSqm = cost.works.mid / gifa
  const normPerSqm = actualPerSqm / bcisFactor / bandFactor

  let bench = null
  try {
    const wb = await fetchRatesWorkbook()
    const bands = parseBenchmarkCheck(wb)
    bench = lookupBenchmark(bands, cost.projectType, answers.q1_3_buildingUse || '')
  } catch (e) {
    console.warn('[Sense check] Benchmark sheet unavailable — cost check skipped:', e.message)
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
      // Sheet 8 guidance: small high-density spaces (e.g. a WC block) can
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
    console.log('[Sense check] No benchmark band for', cost.projectType, '/', answers.q1_3_buildingUse, '— cost check skipped.')
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
        `Postcode "${answers.q1_1_postcode || ''}" did not match any BCIS region — ` +
        `the estimate defaults to ${cost.bcisRegion} (location factor ${cost.bcisFactor}). ` +
        `Verify the postcode: a different region would change all location-adjusted rates.`,
    })
  }

  // ── Percentage-rule condition check ─────────────────────────────────────────
  // Conditions in the workbook's Tab 3 that matched no evaluator branch were
  // treated as not applicable. Usually means a condition was reworded in the
  // workbook — the rule silently stops firing until the wording is aligned.
  if ((cost.unmatchedConditions || []).length > 0) {
    warnings.push({
      code: 'RULE_UNMATCHED',
      severity: 'medium',
      field: 'cost',
      message:
        `${cost.unmatchedConditions.length} percentage-rule condition(s) in the NRM1 workbook were not recognised ` +
        `and were treated as not applicable: ${cost.unmatchedConditions.map(c => `"${c}"`).join('; ')}. ` +
        `The affected percentage additions may be understated — align the workbook condition wording.`,
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

  const result = {
    warnings,
    hasWarnings: warnings.length > 0,
    costPerSqm: Math.round(actualPerSqm),
    normalisedCostPerSqm: Math.round(normPerSqm),
    expectedBand: bench ? { low: bench.low, high: bench.high, key: `${bench.projectType} / ${bench.buildingUse}` } : null,
    budget,
  }
  console.log('[Sense check]', JSON.stringify(result))
  return result
}
