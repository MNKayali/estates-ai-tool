// Batch-3 analysis: runs each scenario's plan through the deterministic
// pipeline (or reads a saved live report record with --live dir) and compares
// cost / programme with the scenario's "Independent benchmark" section.
//   node --import ./test-reports/_reference/alias.mjs test-reports/_reference/analyse.mjs [--live dir] [--json out] [id ...]
import fs from 'node:fs'
import path from 'node:path'

process.env.RATES_FILE_URL ||= 'NRM1_Cost_Estimate_Tool_v5_2.xlsx'
process.env.PROGRAMME_FILE_URL ||= 'Estates_AI_Programme_v4_3.xlsx'
process.env.PROCUREMENT_FILE_URL ||= 'Projento_Procurement_Reference.xlsx'
const { runDeterministicPipeline } = await import('../../lib/pipeline.js')
const { getScopeCatalogue } = await import('../../lib/costCalculator.js')
const { buildContext, typicalItemIds } = await import('../../lib/scopeEngine.js')

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const ROOT = path.resolve(HERE, '..')
const KEY = {
  'Q1.0': 'q1_0_projectName', 'Q1.1': 'q1_1_postcode', 'Q1.2': 'q1_2_projectType', 'Q1.2a': 'q1_2_storeys',
  'Q1.3': 'q1_3_buildingUse', 'Q1.4': 'q1_4_buildingAge', 'Q1.5': 'q1_5_size', 'Q1.6': 'q1_6_heightOver18m',
  'Q2.1': 'q2_1_objective', 'Q2.2': 'q2_3_interventionLevel', 'Q2.4': 'q2_4_specLevel', 'Q2.5': 'q2_5_standards',
  'Q3.1': 'q3_1_knownIssues', 'Q3.2': 'q3_2_previousWorks', 'Q3.3': 'q3_3_surveys', 'Q3.4': 'q3_4_planningConsents',
  'Q3.5': 'q3_5_accessConstraints', 'Q3.6': 'q3_6_occupation', 'Q3.7': 'q3_7_additionalContext', 'Q3.8': 'q3_8_siteContext',
  'Q4.1': 'q4_1_targetDate', 'Q4.2': 'q4_0_startDate', 'Q4.3': 'q4_3_budget', 'Q4.4': 'q4_4_priorities',
  'Q4.5': 'q4_5_designStage', 'Q4.6': 'q4_6_phasing', 'Q4.6a': 'q4_6a_phaseCount', 'Q4.6b': 'q4_6b_phaseGapWeeks',
  'Q4.7': 'q4_7_funding', 'Q4.8': 'q4_8_publicClient', 'Q5.1': 'q5_1_financialBenefit', 'Q5.2': 'q5_2_annualBenefit',
  'Q6.1': 'q6_2_instructions',
}

async function answersFor(plan, extra = {}) {
  const a = {}
  for (const sec of Object.values(plan.sections)) for (const s of sec) {
    const k = KEY[s.q]; if (!k) continue
    a[k] = k === 'q2_5_standards' ? s.value.join(', ') : s.value
    if (s.other && s.q === 'Q1.3') a.q1_3_buildingUseOther = s.other
  }
  Object.assign(a, extra)
  const cat = await getScopeCatalogue()
  const typical = plan.scope.typical ? typicalItemIds(cat, buildContext(cat, a)) : []
  a.q2_2_scopeItems = [...new Set([...typical, ...plan.scope.add])].filter(id => !plan.scope.remove.includes(id))
  a.q2_2_scopeOptions = {}
  for (const o of plan.scope.options) (a.q2_2_scopeOptions[o.id] ||= []).push(o.key)
  a.q2_2_quantities = Object.fromEntries(plan.scope.quantities.map(q => [q.key, q.qty]))
  if (plan.scope.method) a.q2_2_constructionMethod = plan.scope.method
  return a
}

function benchmark(md) {
  const sec = md.split(/^## Independent benchmark.*$/m)[1]?.split(/^## /m)[0] || ''
  const num = s => Number(s.replace(/[£,]/g, ''))
  const m2 = sec.match(/\*\*£([\d,]+)–£([\d,]+)\/m²\*\*/)
  const wk = sec.match(/Construction[^*]*\*\*(\d+)–(\d+) weeks\*\*/)
  return { m2: m2 ? [num(m2[1]), num(m2[2])] : null, weeks: wk ? [Number(wk[1]), Number(wk[2])] : null }
}

const args = process.argv.slice(2)
const flag = n => { const i = args.indexOf(n); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v }
const liveDir = flag('--live'), jsonOut = flag('--json'), overlayFile = flag('--overlay')
const overlay = overlayFile ? JSON.parse(fs.readFileSync(overlayFile, 'utf8')) : {}
const ids = args.length ? args : fs.readdirSync(ROOT).filter(d => /^[A-Z]{2}-[789]-/.test(d)).sort()
const k = n => n == null ? '–' : `£${Math.round(n / 1000).toLocaleString('en-GB')}k`
const rows = [], full = []
for (const id of ids) {
  const plan = JSON.parse(fs.readFileSync(path.join(ROOT, id, 'plan.json'), 'utf8'))
  const bench = benchmark(fs.readFileSync(path.join(ROOT, id, 'scenario.md'), 'utf8'))
  let r
  if (liveDir) {
    const f = path.join(liveDir, `${id}.json`)
    if (!fs.existsSync(f)) { console.log(`no live record for ${id}`); continue }
    r = JSON.parse(fs.readFileSync(f, 'utf8'))
  } else {
    r = await runDeterministicPipeline(await answersFor(plan, overlay[id]))
  }
  const { cost, programme: p, senseCheck: sc, confidence, procurement } = r
  const gifa = Number(cost.gifa) || Number(plan.sections[1].find(s => s.q === 'Q1.5')?.value) || 0
  const conM2 = gifa ? Math.round(cost.construction.mid / gifa) : null
  const conWks = p.constructionWeeks
  const flagRange = (v, rg) => !rg || v == null ? '' : v < rg[0] * 0.85 ? ' LOW' : v > rg[1] * 1.15 ? ' HIGH' : ' ok'
  const st = (p.stages || []).map(s => s.stage)
  rows.push({
    id,
    region: `${cost.bcisRegion} ${cost.bcisFactor}`,
    'con £/m²': `${conM2}${flagRange(conM2, bench.m2)}`,
    bench: bench.m2 ? `${bench.m2[0]}–${bench.m2[1]}` : '',
    construction: k(cost.construction.mid),
    total: `${k(cost.total.low)}–${k(cost.total.high)}`,
    budget: sc?.budget?.status || '–',
    grade: confidence?.score,
    'con wks': `${conWks}${flagRange(conWks, bench.weeks)}`,
    'bench wks': bench.weeks ? `${bench.weeks[0]}–${bench.weeks[1]}` : '',
    'total wks': p.totalWeeks,
    band: p.sizeBandUsed,
    target: p.targetStatus || '–',
    plan: p.planningStatus,
    gw2: st.includes('BSR Gateway 2') ? 'Y' : '',
    eco: st.some(s => /ecolog/i.test(s)) ? 'Y' : '',
    phases: p.phaseCount > 1 ? `${p.phaseCount}×${p.phaseWeeks}+${p.phaseGapWeeks}` : '',
    proc: procurement?.preferred?.route || procurement?.preferred?.name || '–',
  })
  full.push({ id, gifa, bench, r })
}
console.table(rows)
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(full, null, 1))
