/**
 * lib/pipeline.js — the deterministic Phase 1 sequence as one function.
 *
 * generate-report runs exactly this, and so does the scenario-comparison
 * route (three or four times over on varied answers), so the two can never
 * disagree. No AI, no KV, no network beyond the cached workbooks.
 *
 * Order, and why (the procurement route sets the tender period, which moves
 * total weeks, inflation, the budget check and so the High risks that choose
 * the route — a loop, broken by running each step once in this order):
 *
 *   1. cost (no programme yet) → programme → cost with the programme's weeks.
 *      Procurement Value is this pass's construction mid-point, and Duration
 *      is the programme's construction-only weeks — neither depends on the
 *      tender period, so neither changes below.
 *   2. sense check → confidence → High risk seeds (the Risk driver).
 *   3. procurement (lib/procurementCalculator.js).
 *   4. programme again with the preferred route to market's tender period →
 *      cost with the new weeks → sense check and confidence again (the
 *      programme warnings and budget now describe the final programme) →
 *      cost with the confidence-linked range → budget refresh.
 *
 * The High-risk count is taken at step 2 and not recomputed after step 4: the
 * recommendation is stated for those drivers (they are printed with it).
 */
import { calculateCost } from './costCalculator.js'
import { calculateProgramme } from './programmeCalculator.js'
import { calculateProcurement } from './procurementCalculator.js'
import { runSenseCheck, refreshBudget } from './senseCheck.js'
import { computeConfidence, countHighSeeds } from './prose.js'

// Tags a failure with the step that raised it, for the route's error message
// and Sentry tag.
async function step(name, fn) {
  try {
    return await fn()
  } catch (e) {
    if (e && typeof e === 'object' && !e.pipelineStep) e.pipelineStep = name
    throw e
  }
}

export async function runDeterministicPipeline(answers) {
  const cost0 = await step('cost', () => calculateCost(answers, 0))
  if (!cost0.lineItems || cost0.lineItems.length === 0) {
    const e = new Error('Cost calculator returned no line items. Check scope inputs and workbook connection.')
    e.pipelineStep = 'cost'
    throw e
  }
  const scope = cost0.scopeSummary

  // 1. Value and Duration
  const draftProgramme = await step('programme', () => calculateProgramme(answers, cost0.total.mid, { scope }))
  const cost1 = await step('cost', () => calculateCost(answers, draftProgramme.totalWeeks, draftProgramme.constructionWeeks))

  // 2. Risk
  const draftCheck = await step('senseCheck', () => runSenseCheck(cost1, draftProgramme, answers))
  const highRisks = countHighSeeds(answers, cost1, draftCheck)

  // 3. Procurement — contract-sum level: works + preliminaries + OH&P
  // (cost.construction), excluding fees, client risk and VAT.
  const procurement = await step('procurement', () => calculateProcurement(answers, {
    valueGBP: cost1.construction.mid,
    weeks: draftProgramme.constructionWeeks,
    highRisks,
  }))

  // 4. The final programme, with the recommended tender period
  const programme = await step('programme', () => calculateProgramme(answers, cost0.total.mid, { scope, procurement }))
  let cost = await step('cost', () => calculateCost(answers, programme.totalWeeks, programme.constructionWeeks))
  const senseCheck = await step('senseCheck', () => runSenseCheck(cost, programme, answers))
  const confidence = computeConfidence(answers, cost, senseCheck)
  cost = await step('cost', () => calculateCost(answers, programme.totalWeeks, programme.constructionWeeks, { rangeGrade: confidence.score }))
  refreshBudget(senseCheck, answers, cost)
  return { cost, programme, senseCheck, confidence, procurement }
}
