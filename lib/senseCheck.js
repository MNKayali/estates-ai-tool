// Deterministic sense-check. Runs after both calculators, before AI call.
// Returns warnings[] consumed by callClaudeForProse.

const COST_BENCHMARKS = {
  refurbishment: { min: 40,  max: 600   },
  'new build':   { min: 900, max: 3500  },
  extension:     { min: 1000, max: 4000 },
  'fit-out':     { min: 250, max: 2500  },
  fitout:        { min: 250, max: 2500  },
  default:       { min: 30,  max: 5000  },
}

const PROGRAMME_BENCHMARKS = {
  S1: { min: 6,  max: 65  },
  S2: { min: 8,  max: 80  },
  S3: { min: 10, max: 100 },
  S4: { min: 15, max: 130 },
  S5: { min: 25, max: 160 },
  S6: { min: 35, max: 200 },
}

function getBenchmarkKey(projectType = '') {
  const pt = projectType.toLowerCase().trim()
  if (COST_BENCHMARKS[pt]) return pt
  for (const key of Object.keys(COST_BENCHMARKS)) {
    if (pt.includes(key)) return key
  }
  return 'default'
}

export function runSenseCheck(cost, programme) {
  const warnings = []

  // ── Cost per m² check ───────────────────────────────────────────────────────
  const gifa = cost.gifa || 1
  const bcisFactor = cost.bcisFactor || 1
  const bandFactor = cost.bandFactor || 1
  const actualPerSqm = cost.works.mid / gifa
  const normPerSqm = actualPerSqm / bcisFactor / bandFactor

  const key = getBenchmarkKey(cost.projectType)
  const bench = COST_BENCHMARKS[key]

  if (normPerSqm < bench.min) {
    warnings.push({
      code: 'COST_LOW',
      severity: 'medium',
      field: 'cost',
      message:
        `Works cost is £${Math.round(actualPerSqm)}/m² ` +
        `(£${Math.round(normPerSqm)}/m² normalised) — below the expected minimum ` +
        `of £${bench.min}/m² for ${cost.projectType}. ` +
        `Check that all applicable scope items have been selected and that no rate returned zero.`,
    })
  } else if (normPerSqm > bench.max) {
    warnings.push({
      code: 'COST_HIGH',
      severity: 'medium',
      field: 'cost',
      message:
        `Works cost is £${Math.round(actualPerSqm)}/m² ` +
        `(£${Math.round(normPerSqm)}/m² normalised) — above the expected maximum ` +
        `of £${bench.max}/m² for ${cost.projectType}. ` +
        `Review scope for double-counting or an unexpectedly high rate.`,
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

  const result = {
    warnings,
    hasWarnings: warnings.length > 0,
    costPerSqm: Math.round(actualPerSqm),
    normalisedCostPerSqm: Math.round(normPerSqm),
  }
  console.log('[Sense check]', JSON.stringify(result))
  return result
}
