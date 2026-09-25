// Re-runs the deterministic pipeline (no AI, no network) for every scenario's
// plan.json with the code and workbooks on this branch, and prints the facts
// the reviewers checked. Use it after a fix to see what moved.
//   node test-reports/_reference/rerun.mjs            (table)
//   node test-reports/_reference/rerun.mjs --json out.json   (answers + results)
import fs from 'node:fs'
import path from 'node:path'

process.env.RATES_FILE_URL ||= 'NRM1_Cost_Estimate_Tool_v5_2.xlsx'
process.env.PROGRAMME_FILE_URL ||= 'Estates_AI_Programme_v4_3.xlsx'
const { runDeterministicPipeline } = await import('../../lib/pipeline.js')
const { getScopeCatalogue } = await import('../../lib/costCalculator.js')
const { buildContext, typicalItemIds } = await import('../../lib/scopeEngine.js')
const { calcRoi, specShown, coverSubtitle } = await import('../../lib/reportContent.js')

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const ROOT = path.resolve(HERE, '..')
const KEY = {
  'Q1.0': 'q1_0_projectName', 'Q1.1': 'q1_1_postcode', 'Q1.2': 'q1_2_projectType', 'Q1.2a': 'q1_2_storeys',
  'Q1.3': 'q1_3_buildingUse', 'Q1.4': 'q1_4_buildingAge', 'Q1.5': 'q1_5_size', 'Q1.6': 'q1_6_heightOver18m',
  'Q2.1': 'q2_1_objective', 'Q2.2': 'q2_3_interventionLevel', 'Q2.4': 'q2_4_specLevel', 'Q2.5': 'q2_5_standards',
  'Q3.1': 'q3_1_knownIssues', 'Q3.2': 'q3_2_previousWorks', 'Q3.3': 'q3_3_surveys', 'Q3.4': 'q3_4_planningConsents',
  'Q3.5': 'q3_5_accessConstraints', 'Q3.6': 'q3_6_occupation', 'Q3.7': 'q3_7_additionalContext', 'Q3.8': 'q3_8_siteContext',
  'Q4.1': 'q4_1_targetDate', 'Q4.2': 'q4_0_startDate', 'Q4.3': 'q4_3_budget', 'Q4.4': 'q4_4_priorities',
  'Q4.5': 'q4_5_designStage', 'Q4.6': 'q4_6_phasing', 'Q4.7': 'q4_7_funding', 'Q5.1': 'q5_1_financialBenefit',
  'Q5.2': 'q5_2_annualBenefit', 'Q6.1': 'q6_2_instructions',
}

export async function answersFor(plan) {
  const a = {}
  for (const sec of Object.values(plan.sections)) for (const s of sec) {
    const k = KEY[s.q]; if (!k) continue
    a[k] = k === 'q2_5_standards' ? s.value.join(', ') : s.value
    if (s.other) a.q1_3_buildingUseOther = s.other
  }
  const cat = await getScopeCatalogue()
  const typical = plan.scope.typical ? typicalItemIds(cat, buildContext(cat, a)) : []
  a.q2_2_scopeItems = [...new Set([...typical, ...plan.scope.add])].filter(id => !plan.scope.remove.includes(id))
  a.q2_2_scopeOptions = {}
  for (const o of plan.scope.options) (a.q2_2_scopeOptions[o.id] ||= []).push(o.key)
  a.q2_2_quantities = Object.fromEntries(plan.scope.quantities.map(q => [q.key, q.qty]))
  if (plan.scope.method) a.q2_2_constructionMethod = plan.scope.method
  return a
}

const ids = fs.readdirSync(ROOT).filter(d => /^[A-Z]{2}-\d-/.test(d)).sort()
const out = []
for (const id of ids) {
  const plan = JSON.parse(fs.readFileSync(path.join(ROOT, id, 'plan.json'), 'utf8'))
  const answers = await answersFor(plan)
  const { cost, programme, senseCheck, confidence } = await runDeterministicPipeline(answers)
  const st = programme.stages.map(s => s.stage)
  const shortfall = senseCheck.clientWarnings.filter(w => w.code === 'BUDGET_SHORTFALL')
  out.push({
    id, answers,
    region: `${cost.bcisRegion} ${cost.bcisFactor}${cost.bcisDefaulted ? ' (DEFAULT)' : ''}`,
    total: `£${Math.round(cost.total.low / 1000)}k–£${Math.round(cost.total.high / 1000)}k`,
    grade: confidence.score,
    budget: senseCheck.budget.status,
    budgetWarningMatches: shortfall.every(w => w.message === senseCheck.budget.note) && (senseCheck.budget.status === 'insufficient') === (shortfall.length === 1),
    weeks: programme.totalWeeks,
    planning: st.includes('Planning') ? `yes (${programme.stages.find(s => s.stage === 'Planning').activity.match(/Stage \d/)?.[0]})` : 'no',
    gateway2: st.includes('BSR Gateway 2'),
    ecology: st.some(s => /ecolog/i.test(s)),
    financialCase: (r => (r ? (r.paybackYears ? `payback ${r.paybackYears}y` : 'benefit, no figure') : 'none'))(calcRoi(answers, cost)),
    spec: specShown(answers, cost) ? cost.specLevel : '—',
    cover: coverSubtitle(answers, cost),
  })
}
const j = process.argv.indexOf('--json')
if (j > 0) fs.writeFileSync(process.argv[j + 1], JSON.stringify(out, null, 1))
else console.table(out.map(({ answers, ...r }) => r))
