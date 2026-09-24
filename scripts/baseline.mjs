/**
 * scripts/baseline.mjs
 *
 * Deterministic regression harness for the cost and programme engines.
 *
 * Why it calls the calculators directly instead of POSTing to /api/generate-report:
 * the thing under test is the arithmetic, and the HTTP route adds ~27s of AI prose
 * per scenario plus API spend for output this harness would throw away. Straight
 * calls run the whole matrix in seconds and are perfectly reproducible, which is
 * what "prove the numbers did not move" needs.
 *
 * Usage:
 *   node scripts/baseline.mjs save <label>     write scripts/__baseline__/<label>.json
 *   node scripts/baseline.mjs diff <a> <b>     compare two saved runs
 *   node scripts/baseline.mjs show <label>     print a saved run as a table
 *
 * Workflow for a change that must not move any number:
 *   node scripts/baseline.mjs save before
 *   ...make the change...
 *   node scripts/baseline.mjs save after
 *   node scripts/baseline.mjs diff before after      → expect "IDENTICAL"
 *
 * For a change that SHOULD move numbers, diff still prints every delta so the
 * expected ones can be eyeballed and the unexpected ones caught.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { calculateCost } from '../lib/costCalculator.js'
import { calculateProgramme } from '../lib/programmeCalculator.js'
import { runSenseCheck } from '../lib/senseCheck.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(HERE, '__baseline__')

// .env.local is not loaded for a bare `node` run — the calculators need the
// workbook URLs, so parse it the same way Next would.
for (const line of fs.readFileSync(path.join(HERE, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}

// ─── Scenario matrix ─────────────────────────────────────────────────────────
// A shared baseline plus per-scenario overrides. Kept explicit rather than
// generated so each row states what it is actually pinning down.
const BASE = {
  q1_0_projectName: 'Baseline',
  q1_1_postcode: 'B29',
  q1_2_projectType: 'Refurbishment',
  q1_2_storeys: '2',
  q1_3_buildingUse: 'Commercial offices',
  q1_4_buildingAge: '1945–1980',
  q1_5_size: '850',
  q2_1_objective: 'Baseline scenario.',
  q2_2_scopeItems: ['0.5', '3.1', '3.2', '5.1', '5.2', '5.8a', '7.1'],
  q2_2_quantities: {},
  q2_3_interventionLevel: 'Full systems replacement',
  q2_4_specLevel: 'Standard',
  q2_5_standards: '',
  q3_1_knownIssues: [],
  q3_3_surveys: ['Condition'],
  q3_4_planningConsents: 'No consent required',
  q3_5_accessConstraints: [],
  q3_6_occupation: 'Currently vacant',
  q4_1_targetDate: 'No specific deadline',
  q4_3_budget: '',
  q4_5_designStage: 'Concept only (Stage 0–1)',
  q4_6_phasing: 'Single phase',
  q4_7_funding: 'Internal / commercial',
}

const SCENARIOS = [
  ['refurb-baseline',            {}],

  // Project types — each selects a different rate-column family and construction row.
  ['type-newbuild',              { q1_2_projectType: 'New Build', q1_4_buildingAge: '', q2_3_interventionLevel: '' }],
  ['type-fitout',                { q1_2_projectType: 'Fit-out', q2_2_scopeItems: ['3.1', '3.2', '5.8b'] }],
  ['type-extension',             { q1_2_projectType: 'Extension' }],
  ['type-externalworks',         { q1_2_projectType: 'External works only', q2_2_scopeItems: ['8.1', '8.3'], q2_2_quantities: { '8.3': '12' } }],
  ['type-otherormixed-substruct', { q1_2_projectType: 'Other or mixed', q2_2_scopeItems: ['1.1', '1.3', '3.1'] }],

  // Spec level — High ≈ x2 vs Standard on refurb; Basic is a no-op on new build.
  ['spec-basic-refurb',          { q2_4_specLevel: 'Basic' }],
  ['spec-high-refurb',           { q2_4_specLevel: 'High' }],
  ['spec-basic-newbuild',        { q1_2_projectType: 'New Build', q1_4_buildingAge: '', q2_3_interventionLevel: '', q2_4_specLevel: 'Basic' }],
  ['spec-standard-newbuild',     { q1_2_projectType: 'New Build', q1_4_buildingAge: '', q2_3_interventionLevel: '', q2_4_specLevel: 'Standard' }],

  // Intervention level — band factor 0.80/0.90/1.00/1.15 and design multiplier.
  ['level-fabric',               { q2_3_interventionLevel: 'Fabric and finishes only', q2_2_scopeItems: ['3.1', '3.2'] }],
  ['level-minor',                { q2_3_interventionLevel: 'Finishes with minor services', q2_2_scopeItems: ['3.1', '3.2', '5.8b'] }],
  ['level-reconfig',             { q2_3_interventionLevel: 'Reconfiguration or full redesign' }],

  // Design stage — the professional-fees ladder, 13.5 / 11.5 / 8.5 / 6.
  ['stage-0-1',                  { q4_5_designStage: 'Concept only (Stage 0–1)' }],
  ['stage-2',                    { q4_5_designStage: 'Concept complete (Stage 2)' }],
  ['stage-3',                    { q4_5_designStage: 'Developed design (Stage 3)' }],
  ['stage-4',                    { q4_5_designStage: 'Technical complete (Stage 4)' }],

  // Planning — gates the whole of code D, and the planning overrun.
  ['planning-none',              { q3_4_planningConsents: 'No consent required' }],
  ['planning-full',              { q3_4_planningConsents: 'Full planning' }],
  ['planning-listed',            { q3_4_planningConsents: 'Full planning + Listed Building Consent' }],
  ['planning-listed-modern',     { q3_4_planningConsents: 'Full planning + Listed Building Consent', q1_4_buildingAge: '1945–1980' }],
  ['planning-changeofuse',       { q3_4_planningConsents: 'Change of use' }],
  ['planning-pd',                { q3_4_planningConsents: 'Permitted development' }],
  ['planning-unsure',            { q3_4_planningConsents: 'Unsure (pre-application advice)' }],

  // Heritage — the C +2pp rule.
  ['age-pre1900',                { q1_4_buildingAge: 'Pre-1900' }],
  ['age-pre1900-listed',         { q1_4_buildingAge: 'Pre-1900', q3_4_planningConsents: 'Full planning + Listed Building Consent' }],

  // BCIS regions — the silent West Midlands fallback lives here.
  ['bcis-london',                { q1_1_postcode: 'EC1' }],
  ['bcis-scotland',              { q1_1_postcode: 'EH1' }],
  ['bcis-unmatched',             { q1_1_postcode: 'ZZ99' }],
  // The explicit region override: an unmatched prefix must stop silently
  // defaulting to West Midlands once the user has confirmed a region.
  ['bcis-override-london',       { q1_1_postcode: 'ZZ99', q1_1_bcisRegion: 'Inner London' }],
  ['bcis-override-beats-prefix', { q1_1_postcode: 'B29', q1_1_bcisRegion: 'Inner London' }],
  ['bcis-override-unknown',      { q1_1_postcode: 'B29', q1_1_bcisRegion: 'Atlantis' }],

  // Risk (code E) adds and the 10% cap.
  ['risk-asbestos',              { q3_1_knownIssues: ['Asbestos known or suspected'] }],
  ['risk-nosurveys',             { q3_3_surveys: ['None'] }],
  // Isolates the two "no surveys" rules: D +0.5 (needs a consent to be required)
  // and E +2. Only the D one currently fires.
  ['risk-nosurveys-planning',    { q3_3_surveys: ['None'], q3_4_planningConsents: 'Full planning' }],
  ['risk-unsure-only',           { q3_1_knownIssues: ['Unsure — surveys needed'] }],
  ['risk-capped',                { q3_1_knownIssues: ['Unsure — surveys needed', 'Asbestos known or suspected', 'Contaminated land', 'Structural concerns'], q3_3_surveys: ['None'] }],

  // Prelims (code A) adds and the 10% cap.
  ['occ-fully',                  { q3_6_occupation: 'Fully occupied' }],
  ['occ-partially',              { q3_6_occupation: 'Partially occupied' }],
  ['occ-vacant',                 { q3_6_occupation: 'Currently vacant' }],
  ['occ-decant',                 { q3_6_occupation: 'Full decant' }],
  ['occ-na',                     { q3_6_occupation: 'Not applicable' }],

  // Access — cost (A) and programme (ACC-1/ACC-2) tiers.
  ['access-restricted',          { q3_5_accessConstraints: ['Restricted working hours'] }],
  ['access-shared',              { q3_5_accessConstraints: ['Shared access with other occupiers'] }],
  ['access-both-lowtier',        { q3_5_accessConstraints: ['Restricted working hours', 'Shared access with other occupiers'] }],
  ['access-novehicle',           { q3_5_accessConstraints: ['No vehicle access or restricted deliveries'] }],
  ['access-termtime',            { q3_5_accessConstraints: ['Term-time only working'] }],

  // Programme levers.
  ['phasing-multiple',           { q4_6_phasing: 'Multiple phases' }],
  ['funding-grant',              { q4_7_funding: 'Grant or public funding' }],
  ['funding-notconfirmed',       { q4_7_funding: 'Not yet confirmed' }],
  ['funding-other',              { q4_7_funding: 'Other' }],

  // BREEAM (C +1pp) via free-text substring.
  ['breeam-typed',               { q2_5_standards: 'BREEAM Excellent' }],
  ['breeam-paraphrased',         { q2_5_standards: 'sustainability to funder standard' }],

  // Storeys — footprint/upper-floor reallocation.
  ['storeys-1-newbuild',         { q1_2_projectType: 'New Build', q1_4_buildingAge: '', q2_3_interventionLevel: '', q1_2_storeys: '1', q2_2_scopeItems: ['1.1', '2.2', '2.3', '3.1'] }],
  ['storeys-3-newbuild',         { q1_2_projectType: 'New Build', q1_4_buildingAge: '', q2_3_interventionLevel: '', q1_2_storeys: '3', q2_2_scopeItems: ['1.1', '2.2', '2.3', '3.1'] }],

  // Size bands S1–S6.
  ['size-s1',                    { q1_5_size: '120' }],
  ['size-s3',                    { q1_5_size: '400' }],
  ['size-s6',                    { q1_5_size: '5000' }],

  // Budget verdict.
  ['budget-sufficient',          { q4_3_budget: '5000000' }],
  ['budget-insufficient',        { q4_3_budget: '100000' }],

  // ── Lossless-reduction pairs ───────────────────────────────────────────────
  // Each new option label must price identically to the old label(s) it replaces.
  // Compare within a single run: old and new rows should agree exactly.
  ['occ-OLD-vacant',             { q3_6_occupation: 'Currently vacant' }],
  ['occ-OLD-decant',             { q3_6_occupation: 'Full decant' }],
  ['occ-OLD-na',                 { q3_6_occupation: 'Not applicable' }],
  ['occ-NEW-vacantdecanted',     { q3_6_occupation: 'Vacant or decanted' }],

  ['age-OLD-1900-1945',          { q1_4_buildingAge: '1900–1945' }],
  ['age-OLD-1945-1980',          { q1_4_buildingAge: '1945–1980' }],
  ['age-NEW-1900-1979',          { q1_4_buildingAge: '1900–1979' }],
  ['age-OLD-1980-2000',          { q1_4_buildingAge: '1980–2000' }],
  ['age-NEW-1980-1999',          { q1_4_buildingAge: '1980–1999' }],
  ['age-post2000',               { q1_4_buildingAge: 'Post-2000' }],

  ['fund-OLD-other',             { q4_7_funding: 'Other' }],
  ['fund-NEW-notconfirmed',      { q4_7_funding: 'Not yet confirmed' }],

  // Surveys — every non-'None' combination must be numerically identical.
  ['surveys-one',                { q3_3_surveys: ['Condition'] }],
  ['surveys-many',               { q3_3_surveys: ['Asbestos register', 'Structural', 'Condition', 'Topographic', 'Energy audit'] }],
  ['surveys-none-option',        { q3_3_surveys: ['None'] }],
  ['surveys-empty',              { q3_3_surveys: [] }],
]

async function runScenario(overrides) {
  const answers = { ...BASE, ...overrides }
  const c1 = await calculateCost(answers, 0)
  const programme = await calculateProgramme(answers, c1.total.mid, { scope: c1.scopeSummary })
  const cost = await calculateCost(answers, programme.totalWeeks, programme.constructionWeeks)
  const sense = await runSenseCheck(cost, programme, answers)
  return {
    cost: {
      works: cost.works, construction: cost.construction, total: cost.total, vat: cost.vat,
      bcisFactor: cost.bcisFactor, bcisRegion: cost.bcisRegion, bcisDefaulted: cost.bcisDefaulted,
      bandFactor: cost.bandFactor, percentages: cost.percentages,
      lineItemCount: (cost.lineItems || []).length,
      lineTotals: Object.fromEntries((cost.lineItems || []).map(li => [li.rateKey || li.code, li.lineMid])),
      excludedNoQuantity: (cost.excludedNoQuantity || []).map(e => e.code ?? e.description),
      unmatchedConditions: cost.unmatchedConditions || [],
    },
    programme: {
      totalWeeks: programme.totalWeeks, surveyWeeks: programme.surveyWeeks,
      designWeeks: programme.designWeeks, tenderWeeks: programme.tenderWeeks,
      constructionWeeks: programme.constructionWeeks, handoverWeeks: programme.handoverWeeks,
      planningWeeks: programme.planningWeeks, bcWeeks: programme.bcWeeks,
      sizeBandUsed: programme.sizeBandUsed, designMultiplier: programme.designMultiplier,
      procurementRoute: programme.procurementRoute, targetStatus: programme.targetStatus,
      constructionType: programme.constructionType,
      stages: (programme.stages || []).map(s => `${s.stage}=${s.weeks}`),
    },
    sense: {
      budgetStatus: sense?.budget?.status ?? null,
      clientWarningCodes: (sense?.clientWarnings || []).map(w => w.code).sort(),
      allWarningCodes: (sense?.warnings || []).map(w => w.code).sort(),
    },
  }
}

async function captureAll() {
  const out = {}
  for (const [name, overrides] of SCENARIOS) {
    try {
      out[name] = await runScenario(overrides)
    } catch (e) {
      out[name] = { error: e.message }
    }
  }
  return out
}

// ─── Diffing ─────────────────────────────────────────────────────────────────
function flatten(obj, prefix = '', acc = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, acc)
    else acc[key] = Array.isArray(v) ? JSON.stringify(v) : v
  }
  return acc
}

function diff(a, b) {
  const rows = []
  const names = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
  for (const name of names) {
    if (!a[name]) { rows.push({ name, field: '(scenario added)', from: '—', to: '—' }); continue }
    if (!b[name]) { rows.push({ name, field: '(scenario removed)', from: '—', to: '—' }); continue }
    const fa = flatten(a[name]), fb = flatten(b[name])
    for (const key of [...new Set([...Object.keys(fa), ...Object.keys(fb)])].sort()) {
      if (String(fa[key]) !== String(fb[key])) {
        rows.push({ name, field: key, from: fa[key], to: fb[key] })
      }
    }
  }
  return rows
}

// ─── CLI ─────────────────────────────────────────────────────────────────────
const [cmd, argA, argB] = process.argv.slice(2)
const file = label => path.join(OUT_DIR, `${label}.json`)

if (cmd === 'save') {
  if (!argA) { console.error('usage: node scripts/baseline.mjs save <label>'); process.exit(1) }
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const data = await captureAll()
  fs.writeFileSync(file(argA), JSON.stringify(data, null, 2))
  const failed = Object.entries(data).filter(([, v]) => v.error)
  console.log(`saved ${Object.keys(data).length} scenarios → scripts/__baseline__/${argA}.json`)
  if (failed.length) {
    console.log(`\n${failed.length} scenario(s) threw:`)
    for (const [n, v] of failed) console.log(`  ${n}: ${v.error}`)
  }
} else if (cmd === 'diff') {
  if (!argA || !argB) { console.error('usage: node scripts/baseline.mjs diff <a> <b>'); process.exit(1) }
  const a = JSON.parse(fs.readFileSync(file(argA), 'utf8'))
  const b = JSON.parse(fs.readFileSync(file(argB), 'utf8'))
  const rows = diff(a, b)
  if (!rows.length) { console.log(`IDENTICAL — ${argA} and ${argB} agree on every field of every scenario.`); process.exit(0) }
  console.log(`${rows.length} difference(s) between ${argA} and ${argB}:\n`)
  let last = null
  for (const r of rows) {
    if (r.name !== last) { console.log(`\n${r.name}`); last = r.name }
    console.log(`  ${r.field.padEnd(42)} ${String(r.from).padStart(14)}  →  ${String(r.to)}`)
  }
  process.exit(1)
} else if (cmd === 'show') {
  const d = JSON.parse(fs.readFileSync(file(argA), 'utf8'))
  for (const [name, v] of Object.entries(d)) {
    if (v.error) { console.log(`${name.padEnd(26)} ERROR ${v.error}`); continue }
    const p = v.cost.percentages
    console.log(
      `${name.padEnd(26)} total ${String(v.cost.total.mid).padStart(9)} | bcis ${v.cost.bcisFactor} | band ${v.cost.bandFactor} | ` +
      `A${p.prelims} B${p.ohp} C${p.fees} D${p.devCosts} E${p.risk} F${p.inflation} H${p.contingency} | ` +
      `${v.programme.totalWeeks}w (con ${v.programme.constructionWeeks})`
    )
  }
} else {
  console.error('usage: node scripts/baseline.mjs <save|diff|show> ...')
  process.exit(1)
}
