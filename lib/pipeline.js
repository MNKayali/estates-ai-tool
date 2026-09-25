/**
 * lib/pipeline.js — the deterministic Phase 1 sequence as one function.
 *
 * generate-report runs exactly this (cost → programme → cost with weeks →
 * sense check → confidence → cost with the confidence-linked range → budget
 * verdict). The scenario-comparison route needs the same sequence three times
 * over on varied answers, and must not drift from the report it sits under,
 * so both call this. No AI, no KV, no network beyond the cached workbooks —
 * about a second per run.
 */
import { calculateCost } from './costCalculator.js'
import { calculateProgramme } from './programmeCalculator.js'
import { runSenseCheck, refreshBudget } from './senseCheck.js'
import { computeConfidence } from './prose.js'

export async function runDeterministicPipeline(answers) {
  let cost = await calculateCost(answers, 0)
  const programme = await calculateProgramme(answers, cost.total.mid, { scope: cost.scopeSummary })
  cost = await calculateCost(answers, programme.totalWeeks, programme.constructionWeeks)
  const senseCheck = await runSenseCheck(cost, programme, answers)
  const confidence = computeConfidence(answers, cost, senseCheck)
  cost = await calculateCost(answers, programme.totalWeeks, programme.constructionWeeks, { rangeGrade: confidence.score })
  refreshBudget(senseCheck, answers, cost)
  return { cost, programme, senseCheck, confidence }
}
