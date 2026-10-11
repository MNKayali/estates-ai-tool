// Builds the full answers for each batch-4 scenario, checks them against what
// the form allows, runs the deterministic pipeline offline and writes
// answers.json (for the live run) and offline.json.
//   node --import ./test-reports/_reference/alias.mjs test-reports/batch4/build.mjs
import fs from 'node:fs'
process.env.RATES_FILE_URL ||= 'NRM1_Cost_Estimate_Tool_v5_2.xlsx'
process.env.PROGRAMME_FILE_URL ||= 'Estates_AI_Programme_v4_3.xlsx'
process.env.PROCUREMENT_FILE_URL ||= 'Projento_Procurement_Reference.xlsx'
const { SCENARIOS } = await import('./scenarios.mjs')
const { runDeterministicPipeline } = await import('../../lib/pipeline.js')
const { getScopeCatalogue } = await import('../../lib/costCalculator.js')
const { buildContext, typicalItemIds, isShown, offeredOptions } = await import('../../lib/scopeEngine.js')
const Q = await import('../../lib/questionSets.js')

const cat = await getScopeCatalogue()
const DIR = 'test-reports/batch4'
const out = {}, offline = []
for (const s of SCENARIOS) {
  const a = { ...s.answers }
  const problems = []
  const pt = a.q1_2_projectType
  for (const k of Object.keys(a)) {
    const sec = Number(k[1])
    if (Q.QUESTIONS_BY_SECTION[sec]?.includes(k) && !Q.isQuestionShown(k, pt)) delete a[k]
  }
  if (!Q.asksOfficeSplit(a)) { delete a.q1_3a_officeShare; delete a.q1_3b_mainSpace }
  if (!(Number(a.q4_3_budget) > 0) || Q.isZeroRatedNewBuild(a)) delete a.q4_3a_vatRecovery
  const issues = Q.knownIssuesFor(pt)
  for (const v of a.q3_1_knownIssues || []) if (!issues.includes(v)) problems.push(`Q3.1 "${v}" not offered`)
  const surveys = Q.surveysFor(pt, a.q1_4_buildingAge)
  for (const v of a.q3_3_surveys || []) if (!surveys.includes(v)) problems.push(`Q3.3 "${v}" not offered`)
  for (const v of a.q3_5_accessConstraints || []) if (!Q.ACCESS_OPTIONS.includes(v)) problems.push(`Q3.5 "${v}"`)

  const ctx = buildContext(cat, a)
  const typical = s.scope.typical ? typicalItemIds(cat, ctx) : []
  a.q2_2_scopeItems = [...new Set([...typical, ...(s.scope.add || [])])].filter(id => !(s.scope.remove || []).includes(id))
  for (const id of a.q2_2_scopeItems) {
    const it = cat.items.find(i => i.id === id)
    if (!it || !isShown(it, ctx)) problems.push(`scope ${id} not shown`)
    else if (!offeredOptions(it, ctx).length) problems.push(`scope ${id} no priced option`)
  }
  a.q2_2_scopeOptions = Object.fromEntries(Object.entries(s.scope.opt || {}).map(([k, v]) => [k, [v]]))
  a.q2_2_quantities = { ...(s.scope.qty || {}) }
  for (const sec of [1, 2, 3, 4]) {
    const miss = Q.unansweredRequired(sec, pt, a)
    if (miss.length) problems.push(`S${sec} missing ${miss.join(', ')}`)
  }
  let r
  try { r = await runDeterministicPipeline(a) } catch (e) { problems.push('pipeline: ' + e.message) }
  const enter = (r?.cost.excludedNoQuantity || []).map(x => `${x.rateKey || x.code} ${x.name || ''} (${x.reason})`)
  out[s.id] = a
  offline.push({ id: s.id, problems, enter,
    construction: r && Math.round(r.cost.construction?.mid ?? 0),
    total: r && [Math.round(r.cost.total.low), Math.round(r.cost.total.high)],
    weeks: r?.programme.totalWeeks, grade: r?.confidence.score })
}
fs.writeFileSync(`${DIR}/answers.json`, JSON.stringify(out, null, 1))
fs.writeFileSync(`${DIR}/offline.json`, JSON.stringify(offline, null, 1))
for (const o of offline) console.log(o.id, o.problems.length ? 'PROBLEMS ' + o.problems.join(' | ') : 'ok', o.enter.length ? 'EXCLUDED ' + o.enter.join(' | ') : '', o.total?.map(x => Math.round(x / 1000) + 'k').join('–'), o.weeks + 'w', o.grade)
