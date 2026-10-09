/**
 * lib/consistency.js — rule-based checks that the finished report agrees with
 * itself (run once both prose halves exist; pure, no network).
 *
 * The engines compute every number and the prose is checked for invented
 * figures elsewhere (assertNoLeakedFigures). These checks catch the other
 * failure: text that is individually plausible but contradicts the register,
 * the programme or the procurement choice. Findings are warnings stored on the
 * report record (`consistency`); none blocks a report.
 */
import { procurementNameProblems } from './prose.js'
import { prepareRisks } from './reportContent.js'

const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
const strings = v => typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []

export function checkConsistency({ programme, procurement, aiProse, budget } = {}) {
  const issues = []
  const add = (code, message) => issues.push({ code, severity: 'warning', message })
  const prose = aiProse || {}
  const text = strings({ ...prose, riskRegister: undefined }).join(' \n ')
  const { counts } = prepareRisks(prose.riskRegister)

  // Risk counts quoted in text must match the register as printed.
  for (const m of text.matchAll(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:risks?\s+)?(?:are\s+)?rated\s+high\b/gi)) {
    const n = WORDS[m[1].toLowerCase()] ?? Number(m[1])
    if (n !== counts.High) add('RISK_COUNT', `Text says ${n} risk(s) rated High; the register has ${counts.High}.`)
  }

  // Route-specific terms must follow the preferred route.
  for (const p of procurementNameProblems({ ...prose }, procurement)) add('ROUTE_TERMS', p)

  // Every RIBA stage the text refers to must exist in the programme.
  const stages = programme?.stages || []
  const present = new Set(stages.map(s => String(s.stage).match(/^Stage (\d)/i)?.[1]).filter(Boolean))
  const mentioned = new Set([...(text + ' ' + strings(prose.riskRegister).join(' ')).matchAll(/\bStage ([234])\b/g)].map(m => m[1]))
  for (const n of mentioned) if (!present.has(n)) add('STAGE_REFERENCE', `Text refers to Stage ${n}, which is not in the programme.`)

  // No check on award vs start on site: the owner chose (4 Oct 2026) not to
  // show a mobilisation period at feasibility, so it would flag every report.

  // Float before completion.
  const fi = stages.findIndex(s => s.stage === 'Programme float'), hi = stages.findIndex(s => s.stage === 'Handover')
  if (fi >= 0 && hi >= 0 && fi > hi) add('FLOAT_AFTER_COMPLETION', 'Programme float sits after Practical Completion.')

  // Budget wording must match the verdict.
  if (budget?.position === 'mid' && /only (?:if|toward|towards) .*lower end|lower end only/i.test(text)) {
    add('BUDGET_WORDING', 'Text says the budget works only at the lower end, but it covers the mid-point.')
  }

  // Asbestos survey type.
  const survey = stages.find(s => s.stage === 'Asbestos Survey')
  if (survey && /management/i.test(survey.activity) && /refurbishment (?:and|&) demolition|\bR&D\b/i.test(strings(prose.riskRegister).join(' ') + text)) {
    add('SURVEY_TYPE', 'Programme shows an asbestos management survey but the text calls for a refurbishment and demolition survey.')
  }
  return issues
}
