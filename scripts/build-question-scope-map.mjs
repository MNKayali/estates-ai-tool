/**
 * build-question-scope-map.mjs
 *
 * Emits docs/questionnaire-scope-map.xlsx — the single mapping document for the
 * questionnaire → scope → engine chain.
 *
 * Everything in the output is DERIVED, not typed by hand:
 *  - the scope catalogue and its metadata come from the live NRM1 workbook
 *    (RATES_FILE_URL) via getScopeItems(), the same call the picker uses;
 *  - the percentage-rule conditions come from Tab 3 of that same workbook;
 *  - which answer keys each engine reads is grepped out of lib/*.js at run time;
 *  - the "today" visibility columns replay the picker's own four gates and the
 *    questionnaire's own three project-type gates, so a cell can never claim a
 *    behaviour the app does not have.
 *
 * The one hand-maintained table is QUESTIONS below: the visible numbering,
 * labels and show-conditions transcribed from app/questionnaire/page.jsx with a
 * `source` line reference against each row. If the questionnaire changes, that
 * table and the line references are what needs updating — re-run this script
 * afterwards so the map never drifts from the app.
 *
 * Usage:  node scripts/build-question-scope-map.mjs
 * Needs:  RATES_FILE_URL in .env.local (loaded manually, as scripts/baseline.mjs does).
 */
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { getScopeItems, fetchRatesWorkbook } from '../lib/costCalculator.js'
import { matchesBuildingUse, BUILDING_USE_TAGS } from '../lib/buildingUse.js'
import { PROJECT_TYPE_VALUES as PROJECT_TYPES, VISIBLE_GROUPS, priceableFor } from '../lib/projectTypes.js'
import { isQuestionShown, isQuestionRequired } from '../lib/questionSets.js'

// ── env ──────────────────────────────────────────────────────────────────────
const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim()
  }
}

// ── constants mirrored from the app (kept in one place here) ─────────────────
const FOLDED_CODES = new Set(['5.2L', '5.5', '5.8'])       // page.jsx:77
const REFURB_TYPES = ['Refurbishment', 'Fit-out', 'Extension'] // page.jsx:743 (isRefurb)
const STOREYS_TYPES = ['New Build', 'Refurbishment', 'Extension'] // page.jsx STOREYS_TYPES (Q1.2a / Q1.6 gate)

// lib/costCalculator.js:248 — legacy quantity keys the form no longer writes
const QTY_ALIASES = {
  '4.2': 'q2_2_bathrooms', '4.2-RES': 'q2_2_bathrooms', '4.2-COM': 'q2_2_bathrooms',
  '4.2-HG': 'q2_2_bathrooms', '4.2-HP': 'q2_2_bathrooms', '4.2-HC': 'q2_2_bathrooms',
  '4.3': 'q2_2_kitchens',
  '5.11': 'q1_5_pvKwp', '5.12': 'q1_5_battKwh', '5.15': 'q1_5_evNr',
  '5.19': 'q1_5_liftNr', '8.3': 'q1_5_carParksNr', '8.9': 'q1_5_extLightNr',
}

function itemNeedsQty(item) {           // page.jsx:80
  const pt = item?.pricingType
  return pt === 'per_nr' || pt === 'per_kwp' || pt === 'per_kwh' || pt === 'per_kw' ||
    (pt === 'per_item' && /^(number of|per )/i.test(item.qtyCapture || ''))
}

const ALWAYS = () => true

// Derived rather than retyped: none of the seven questions this labels (Q3.1,
// Q3.3, Q3.4, Q3.5, Q3.6, Q3.8, Q4.5) has a project-type gate on the question
// itself (only their OPTIONS or COPY vary — see the `cond` text below), so
// isQuestionRequired's answer is the same for every project type and
// 'Refurbishment' is as good a representative as any.
const req = key => (isQuestionRequired(key, 'Refurbishment') ? 'Yes' : 'No')

/**
 * The questionnaire's question inventory, transcribed from
 * app/questionnaire/page.jsx. `shownFor` replays that file's ACTUAL gating —
 * as of the September 2026 question-gating slice there are seven project-type
 * gates (Q1.2a/Q1.6, Q1.4, Q2.3, Q2.4, Q3.2, Q5.1, Q5.2), each mirroring
 * lib/questionSets.js's isQuestionShown()/showsHeightQuestion() where the
 * question uses that helper rather than an inline array.
 */
const QUESTIONS = [
  // ── Section 1 — Project & Location ─────────────────────────────────────────
  { sec: 1, num: 'Q1.0',  key: 'q1_0_projectName',        label: 'Project title',                     control: 'Text',            required: 'Yes', cond: 'Always',                                       src: 'page.jsx:1105', shownFor: ALWAYS },
  { sec: 1, num: 'Q1.1',  key: 'q1_1_postcode',           label: 'Postcode',                          control: 'Text',            required: 'Yes', cond: 'Always',                                       src: 'page.jsx:1112', shownFor: ALWAYS },
  { sec: 1, num: 'Q1.1a', key: 'q1_1_bcisRegion',         label: 'BCIS region (confirm / override)',  control: 'Region picker',   required: 'No',  cond: 'Always (picker resolves as the postcode is typed)', src: 'page.jsx:1117', shownFor: ALWAYS },
  { sec: 1, num: 'Q1.2',  key: 'q1_2_projectType',        label: 'Project type',                      control: 'Select',          required: 'Yes', cond: 'Always',                                       src: 'page.jsx:1125', shownFor: ALWAYS },
  { sec: 1, num: 'Q1.2a', key: 'q1_2_storeys',            label: 'Number of storeys',                 control: 'Select (1–7+)',   required: 'No (defaults 1)', cond: "projectType is New Build, Refurbishment or Extension", src: 'page.jsx:1132', shownFor: pt => STOREYS_TYPES.includes(pt) },
  { sec: 1, num: 'Q1.3',  key: 'q1_3_buildingUse',        label: 'Building use',                      control: 'Select',          required: 'Yes', cond: 'Always',                                       src: 'page.jsx:1151', shownFor: ALWAYS },
  { sec: 1, num: '—',     key: 'q1_3_buildingUseOther',   label: 'Building use — other (describe)',   control: 'Text',            required: 'No',  cond: "q1_3_buildingUse === 'Other'",                 src: 'page.jsx:1167', shownFor: ALWAYS },
  { sec: 1, num: 'Q1.4',  key: 'q1_4_buildingAge',        label: 'Building age',                      control: 'Select (4 bands)', required: 'Yes when shown', cond: "isQuestionShown — hidden for New Build and External works only", src: 'page.jsx:1174', shownFor: pt => isQuestionShown('q1_4_buildingAge', pt) },
  { sec: 1, num: 'Q1.5',  key: 'q1_5_size',               label: 'Approximate size (GIFA m²) / site area (External Works)', control: 'Number', required: 'Yes', cond: 'Always (label varies by project type)', src: 'page.jsx:1185', shownFor: ALWAYS },
  { sec: 1, num: 'Q1.6',  key: 'q1_6_heightOver18m',      label: 'Building height (18 m or taller)',  control: 'Radio (Yes/No/Not sure)', required: 'No', cond: "projectType is New Build, Refurbishment or Extension (STOREYS_TYPES, same gate as Q1.2a) AND showsHeightQuestion(storeys) — storeys >= 5. NOTE: the Building Safety Act's higher-risk threshold is 18 m OR 7 storeys, whichever comes first, and storeys alone can't answer that (a 6-storey building with tall floor-to-floors can clear 18 m) — the question is offered from 5 storeys as a safety margin below the 7-storey trigger, not because 5 is itself a threshold", src: 'page.jsx:1197', shownFor: pt => STOREYS_TYPES.includes(pt) },

  // ── Section 2 — Project Scope ──────────────────────────────────────────────
  { sec: 2, num: 'Q2.1',  key: 'q2_1_objective',          label: 'Project objective',                 control: 'Textarea',        required: 'Yes', cond: 'Always',                                       src: 'page.jsx:1197', shownFor: ALWAYS },
  { sec: 2, num: 'Q2.3',  key: 'q2_3_interventionLevel',  label: 'Level of intervention',             control: 'Radio (4 tiers)', required: 'Yes when shown', cond: 'projectType is Refurbishment, Fit-out or Extension (asked BEFORE Q2.2 because it gates the tiles)', src: 'page.jsx:1203', shownFor: pt => REFURB_TYPES.includes(pt) },
  { sec: 2, num: 'Q2.2',  key: 'q2_2_scopeItems',         label: 'Scope of works (element picker)',   control: 'Tile multi-select', required: 'No', cond: 'Always (contents filtered — see sheet 4)',    src: 'page.jsx:1232', shownFor: ALWAYS },
  { sec: 2, num: 'Q2.2',  key: 'q2_2_wiring',             label: 'Wiring extent (derived from 5.8a / 5.8b tiles)', control: 'Derived', required: 'No', cond: 'Derived whenever a wiring tile is ticked', src: 'page.jsx:1270', shownFor: ALWAYS },
  { sec: 2, num: 'Q2.2',  key: 'q2_2_quantities',         label: 'Per-element quantities (count / kWp / kWh / kW)', control: 'Number (per tile)', required: 'No', cond: 'Shown under each ticked count-driven tile', src: 'page.jsx:1418', shownFor: ALWAYS },
  { sec: 2, num: 'Q2.2',  key: 'q2_2_additionalScope',    label: 'Other / specialist scope + approximate value', control: 'Textarea + number', required: 'No', cond: 'Always',                        src: 'page.jsx:1540', shownFor: ALWAYS },
  { sec: 2, num: 'Q2.4',  key: 'q2_4_specLevel',          label: 'Specification level',               control: 'Radio',           required: 'Yes when shown', cond: 'isQuestionShown — hidden for External works only (single rate column) and Demolition only (no specification standard); Basic option also hidden for New Build / Extension', src: 'page.jsx:1572', shownFor: pt => isQuestionShown('q2_4_specLevel', pt) },
  { sec: 2, num: 'Q2.5',  key: 'q2_5_standards',          label: 'Standards and compliance requirements', control: 'Checkbox group', required: 'No', cond: 'Always',                                   src: 'page.jsx:1608', shownFor: ALWAYS },
  { sec: 2, num: '—',     key: 'q2_5_standardsOther',     label: 'Standards — other (describe)',      control: 'Textarea',        required: 'No',  cond: "q2_5_standards includes 'Other'",              src: 'page.jsx:1614', shownFor: ALWAYS },

  // ── Section 3 — Condition & Constraints ────────────────────────────────────
  { sec: 3, num: 'Q3.1',  key: 'q3_1_knownIssues',        label: 'Known issues',                      control: 'Checkbox group',  required: req('q3_1_knownIssues'),  cond: 'Always — NO project-type gate on the question itself; option list (knownIssuesFor) varies by project type', src: 'page.jsx:1629', shownFor: ALWAYS },
  { sec: 3, num: 'Q3.2',  key: 'q3_2_previousWorks',      label: 'Previous works or relevant history', control: 'Textarea',       required: 'No',  cond: 'isQuestionShown — hidden for New Build and External works only', src: 'page.jsx:1636', shownFor: pt => isQuestionShown('q3_2_previousWorks', pt) },
  { sec: 3, num: 'Q3.3',  key: 'q3_3_surveys',            label: 'Surveys and reports available',     control: 'Checkbox group',  required: req('q3_3_surveys'),  cond: 'Always — NO project-type gate on the question itself; option list (surveysFor) varies by project type AND Q1.4 building age — asbestos options hidden once Q1.4 = Post-2000. Blank is read as "None" by the ENGINE (computeConfidence, checkCondition) but the form now requires an explicit answer — the ENGINE contract did not change, only what the form will let through', src: 'page.jsx:1641', shownFor: ALWAYS },
  { sec: 3, num: '—',     key: 'q3_3_surveysOther',       label: 'Surveys — other (describe)',        control: 'Textarea',        required: 'No',  cond: "q3_3_surveys includes 'Other'",                src: 'page.jsx:1649', shownFor: ALWAYS },
  { sec: 3, num: 'Q3.4',  key: 'q3_4_planningConsents',   label: 'Planning consent required',         control: 'Radio',           required: req('q3_4_planningConsents'),  cond: 'Always',                                       src: 'page.jsx:1658', shownFor: ALWAYS },
  { sec: 3, num: 'Q3.5',  key: 'q3_5_accessConstraints',  label: 'Access constraints',                control: 'Checkbox group',  required: req('q3_5_accessConstraints'),  cond: 'Always',                                       src: 'page.jsx:1664', shownFor: ALWAYS },
  { sec: 3, num: '—',     key: 'q3_5_accessConstraintsOther', label: 'Access constraints — other (describe)', control: 'Textarea', required: 'No', cond: "q3_5_accessConstraints includes 'Other'",      src: 'page.jsx:1671', shownFor: ALWAYS },
  { sec: 3, num: 'Q3.6',  key: 'q3_6_occupation',         label: 'Occupation during works',           control: 'Radio',           required: req('q3_6_occupation'),  cond: 'Always — NO project-type gate on the question itself; label/help text (occupationCopyFor) vary by project type', src: 'page.jsx:1680', shownFor: ALWAYS },
  { sec: 3, num: 'Q3.7',  key: 'q3_7_additionalContext',  label: 'Additional context',                control: 'Textarea',        required: 'No',  cond: 'Always',                                       src: 'page.jsx:1686', shownFor: ALWAYS },
  { sec: 3, num: 'Q3.8',  key: 'q3_8_siteContext',        label: 'Site and building context',         control: 'Checkbox group',  required: req('q3_8_siteContext'),  cond: 'Always',                                       src: 'page.jsx:1698', shownFor: ALWAYS },

  // ── Section 4 — Programme, Budget & Delivery ───────────────────────────────
  { sec: 4, num: 'Q4.1',  key: 'q4_1_targetDate',         label: 'Target completion date',            control: 'Radio + date',    required: 'No',  cond: 'Always',                                       src: 'page.jsx:1715', shownFor: ALWAYS },
  { sec: 4, num: 'Q4.2',  key: 'q4_0_startDate',          label: 'Expected project start',            control: 'Date',            required: 'No',  cond: 'Always (KEY says 4.0, LABEL says Q4.2 — deliberate)', src: 'page.jsx:1752', shownFor: ALWAYS },
  { sec: 4, num: 'Q4.3',  key: 'q4_3_budget',             label: 'Total budget, if you have one',     control: 'Number',          required: 'No',  cond: 'Always',                                       src: 'page.jsx:1773', shownFor: ALWAYS },
  { sec: 4, num: 'Q4.4',  key: 'q4_4_priorities',         label: 'What matters most (max 2, first = primary)', control: 'Checkbox group (max 2)', required: 'No', cond: 'Always',                      src: 'page.jsx:1791', shownFor: ALWAYS },
  { sec: 4, num: 'Q4.5',  key: 'q4_5_designStage',        label: 'Design stage already reached',      control: 'Radio',           required: req('q4_5_designStage'),  cond: 'Always',                                       src: 'page.jsx:1808', shownFor: ALWAYS },
  { sec: 4, num: 'Q4.6',  key: 'q4_6_phasing',            label: 'Single or phased delivery',         control: 'Select',          required: 'No (defaults Single phase)', cond: 'Always',               src: 'page.jsx:1814', shownFor: ALWAYS },
  { sec: 4, num: 'Q4.7',  key: 'q4_7_funding',            label: 'Funding source',                    control: 'Radio',           required: 'No',  cond: 'Always',                                       src: 'page.jsx:1823', shownFor: ALWAYS },
  { sec: 4, num: 'Q5.1',  key: 'q5_1_financialBenefit',   label: 'Financial benefit type',            control: 'Checkbox group',  required: 'No',  cond: 'isQuestionShown — hidden for Demolition only', src: 'page.jsx:1835', shownFor: pt => isQuestionShown('q5_1_financialBenefit', pt) },
  { sec: 4, num: 'Q5.2',  key: 'q5_2_annualBenefit',      label: 'Estimated annual benefit (£)',      control: 'Number',          required: 'No',  cond: 'q5_1 has a benefit and it is not "No direct financial return"; isQuestionShown also hides it entirely for Demolition only', src: 'page.jsx:1847', shownFor: pt => isQuestionShown('q5_2_annualBenefit', pt) },
  { sec: 4, num: 'Q6.1',  key: 'q6_2_instructions',       label: 'Additional report instructions',    control: 'Textarea',        required: 'No',  cond: 'Always (KEY says 6.2, LABEL says Q6.1 — deliberate)', src: 'page.jsx:1871', shownFor: ALWAYS },
]

// Keys an engine reads but the form no longer writes. Flagged so the map shows
// them rather than pretending the chain is clean.
const ORPHAN_KEYS = {
  q2_2_bathrooms:   'Legacy quantity key (4.2 family). Form now writes q2_2_quantities; kept as a fallback for drafts saved before that change.',
  q2_2_kitchens:    'Legacy quantity key (4.3). As above.',
  q1_5_pvKwp:       'Legacy quantity key (5.11 PV kWp). As above — note per_kwp reads this BEFORE the captured quantity.',
  q1_5_battKwh:     'Legacy quantity key (5.12 BESS kWh). As above — read before the captured quantity.',
  q1_5_evNr:        'Legacy quantity key (5.15 EV points). As above.',
  q1_5_liftNr:      'Legacy quantity key (5.19 lifts). As above.',
  q1_5_carParksNr:  'Legacy quantity key (8.3 parking bays). As above.',
  q1_5_extLightNr:  'Legacy quantity key (8.9 external lighting). As above.',
  q3_2_recentWorks: 'Legacy alias of q3_2_previousWorks read by the prose prompt.',
  q6_2_reportInstructions: 'Legacy alias of q6_2_instructions read by the prose prompt.',
  q4_7_fundingOther: 'Read by the prose prompt; the form has no "other funding" free-text field.',
  q6_1_sections:      'Removed question (report section include-list). Kept alive by resolveSectionFlags() for reports still in KV.',
  q6_1_excludeSections: 'Removed question (report section exclude-list). As above.',
  q6_1_reportSections:  'Removed question (legacy alias). As above.',
}

const ENGINE_FILES = [
  ['Cost',        'lib/costCalculator.js'],
  ['Programme',   'lib/programmeCalculator.js'],
  ['Sense check', 'lib/senseCheck.js'],
  ['Site context','lib/siteContext.js'],
  ['AI prose',    'lib/prose.js'],
  ['Word report', 'lib/reportBuilder.js'],
  ['Shared text', 'lib/reportShared.js'],
  ['Web report',  'app/report/ReportRenderer.jsx'],
]

function keysReadBy(file) {
  const src = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
  return new Set(src.match(/q[0-9]_[0-9a-zA-Z]*_[A-Za-z]+/g) || [])
}

// ── build ────────────────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new()
const addSheet = (name, aoa, widths) => {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = widths.map(w => ({ wch: w }))
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }
  XLSX.utils.book_append_sheet(wb, ws, name)
}

const engineKeys = Object.fromEntries(ENGINE_FILES.map(([label, file]) => [label, keysReadBy(file)]))
const CALC_ENGINES = ['Cost', 'Programme', 'Sense check', 'Site context']

function impactOf(key) {
  const movesNumber = CALC_ENGINES.some(e => engineKeys[e].has(key))
  const inWords = ['AI prose', 'Word report', 'Shared text', 'Web report'].some(e => engineKeys[e].has(key))
  if (movesNumber) return 'CHANGES A NUMBER — hiding this changes cost and/or programme'
  if (inWords) return 'Wording only — hiding this changes what the report says, not what it costs'
  return 'Read by nothing — captured but unused'
}

// ── Sheet 0 — Read me ────────────────────────────────────────────────────────
addSheet('0. Read me', [
  ['Estates AI — questionnaire / scope / engine map'],
  [`Generated ${new Date().toISOString().slice(0, 10)} by scripts/build-question-scope-map.mjs`],
  [],
  ['How to read this workbook'],
  ['Every "TODAY" column is derived by replaying the app\'s own logic. Nothing in those columns is an opinion.'],
  ['Every "TARGET" column is blank and is yours to fill in. That is the decision record for the remap.'],
  [],
  ['Sheet', 'What it is', 'What you do with it'],
  ['1. Questions',        'Every answer key: label, control, required, and the exact condition under which it is asked today.', 'Fill the TARGET columns with the rule you want.'],
  ['2. Q x ProjectType',  'Question × the 8 Q1.2 project types. TODAY block = what the app does now.',                          'Mark each TARGET cell Show or Hide.'],
  ['3. ScopeItems',       'The full NRM1 element catalogue with the metadata the picker filters on.',                            'Reference. Read alongside sheet 4.'],
  ['4. Scope x ProjectType', 'Every element × the 8 project types. TODAY = what the picker shows now (worst case: wildcard building use).', 'Mark each TARGET cell Core / Optional / N/A.'],
  ['5. EngineReads',      'Which engine reads which answer key, and whether hiding it would move a number.',                     'GUARDRAIL — check before hiding anything in sheet 2.'],
  ['6. Tab3 Conditions',  'Every NRM1 percentage rule and the question number its condition text quotes.',                       'GUARDRAIL — these strings are matched literally; renumbering breaks them.'],
  [],
  ['Two things to know before you start'],
  ['1.', 'There are seven project-type gates in the whole questionnaire (Q1.2a, Q1.6, Q1.4, Q2.3, Q2.4, Q3.2, Q5.1, Q5.2) — see lib/questionSets.js. Everything else is asked of everyone, though several (Q3.1, Q3.3, Q3.6) vary their OPTIONS or COPY by project type without hiding the question itself.'],
  ['2.', 'The NRM1 Tab 3 conditions quote visible question numbers verbatim ("Q3.6 = Fully occupied throughout"). Changing a visible number in the UI without changing the workbook silently breaks the rule that reads it. Sheet 6 lists every one.'],
], [16, 62, 60])

// ── Sheet 1 — Questions ──────────────────────────────────────────────────────
const qRows = [[
  'Step', 'Step name', 'Visible №', 'Answer key', 'Label', 'Control', 'Required',
  'Shown when (TODAY)', 'Source',
  ...ENGINE_FILES.map(([label]) => `Reads: ${label}`),
  'Impact if not asked',
  'TARGET — shown when', 'TARGET — notes',
]]
const STEP_NAMES = { 1: 'Project & Location', 2: 'Project Scope', 3: 'Condition & Constraints', 4: 'Programme, Budget & Delivery' }
for (const q of QUESTIONS) {
  qRows.push([
    q.sec, STEP_NAMES[q.sec], q.num, q.key, q.label, q.control, q.required, q.cond, q.src,
    ...ENGINE_FILES.map(([label]) => (engineKeys[label].has(q.key) ? 'Y' : '')),
    impactOf(q.key), '', '',
  ])
}
qRows.push([])
qRows.push(['LEGACY / ORPHAN KEYS — read by an engine but never written by the current form'])
for (const [key, note] of Object.entries(ORPHAN_KEYS)) {
  qRows.push(['—', '—', '—', key, note, '—', '—', 'Never asked', '—',
    ...ENGINE_FILES.map(([label]) => (engineKeys[label].has(key) ? 'Y' : '')),
    impactOf(key), '', ''])
}
addSheet('1. Questions', qRows,
  [5, 24, 9, 26, 46, 20, 12, 52, 15, ...ENGINE_FILES.map(() => 12), 58, 34, 34])

// ── Sheet 2 — Q x ProjectType ────────────────────────────────────────────────
const qxRows = [[
  'Visible №', 'Answer key', 'Label', 'Impact if not asked',
  ...PROJECT_TYPES.map(pt => `TODAY: ${pt}`),
  '',
  ...PROJECT_TYPES.map(pt => `TARGET: ${pt}`),
]]
for (const q of QUESTIONS) {
  qxRows.push([
    q.num, q.key, q.label, impactOf(q.key),
    ...PROJECT_TYPES.map(pt => (q.shownFor(pt) ? 'Show' : 'Hidden')),
    '',
    ...PROJECT_TYPES.map(() => ''),
  ])
}
addSheet('2. Q x ProjectType', qxRows,
  [9, 26, 46, 58, ...PROJECT_TYPES.map(() => 15), 3, ...PROJECT_TYPES.map(() => 15)])

// ── workbook-derived sheets ──────────────────────────────────────────────────
const { groups } = await getScopeItems()
const groupLabel = Object.fromEntries(groups.map(g => [g.group, g.label]))
const allItems = groups.flatMap(g => g.items)
const USES = Object.keys(BUILDING_USE_TAGS)

// ── Sheet 3 — ScopeItems ─────────────────────────────────────────────────────
const siRows = [[
  'Code', 'Group', 'Group label', 'Element / description', 'Unit', 'Pricing type',
  'Min Lvl (refurb tier gate)', 'Building Use tags (workbook col D)',
  'Rate: Refurb', 'Rate: New Build', 'Rate: Extension', 'Rate: Ext Works',
  'Needs a quantity?', 'Has its own tile?', 'Legacy quantity key',
  'Hidden for these building uses',
]]
for (const it of allItems) {
  const hiddenUses = USES.filter(u => !matchesBuildingUse(it.buildingUse, u))
  siRows.push([
    it.code, it.group, groupLabel[it.group], it.description, it.unit, it.pricingType,
    it.minLvl || 1, it.buildingUse || '(blank — never hidden)',
    it.priceable?.refurb ? 'Y' : '', it.priceable?.newBuild ? 'Y' : '',
    it.priceable?.extension ? 'Y' : '', it.priceable?.externalWorks ? 'Y' : '',
    itemNeedsQty(it) ? 'Yes' : '',
    FOLDED_CODES.has(it.code) ? 'No — folded into its parent tile' : 'Yes',
    QTY_ALIASES[it.code] || '',
    hiddenUses.length === USES.length ? 'ALL (unreachable)' : hiddenUses.join(', '),
  ])
}
addSheet('3. ScopeItems', siRows,
  [10, 7, 38, 60, 8, 16, 12, 34, 12, 13, 12, 12, 14, 30, 18, 46])

// ── Sheet 4 — Scope x ProjectType ────────────────────────────────────────────
// TODAY is computed at the picker's worst case: a wildcard building use (Mixed
// use / Other / blank) and the top intervention tier, i.e. the most tiles the
// user can ever be shown. The building-use and tier gates are reported as their
// own columns rather than folded in, so a hidden cell has exactly one reason.
const sxRows = [[
  'Code', 'Group', 'Element / description', 'Has its own tile?',
  ...PROJECT_TYPES.map(pt => `TODAY: ${pt}`),
  '',
  ...PROJECT_TYPES.map(pt => `TARGET: ${pt}`),
]]
for (const it of allItems) {
  sxRows.push([
    it.code, it.group, it.description,
    FOLDED_CODES.has(it.code) ? 'No — folded' : 'Yes',
    ...PROJECT_TYPES.map(pt => {
      if (FOLDED_CODES.has(it.code)) return 'n/a — folded'
      if (!VISIBLE_GROUPS[pt].includes(it.group)) return 'Hidden — group off'
      if (!priceableFor(it, pt)) return 'Hidden — no rate'
      return 'Shown'
    }),
    '',
    ...PROJECT_TYPES.map(() => ''),
  ])
}
// Footer: how many tiles each project type actually shows, at the worst case.
sxRows.push([])
sxRows.push(['TILE COUNT (wildcard building use — the most anyone is ever shown)', '', '', '',
  ...PROJECT_TYPES.map(pt => allItems.filter(it =>
    !FOLDED_CODES.has(it.code) && VISIBLE_GROUPS[pt].includes(it.group) && priceableFor(it, pt)).length)])
for (const u of USES) {
  sxRows.push([`TILE COUNT — ${u}`, '', '', '',
    ...PROJECT_TYPES.map(pt => allItems.filter(it =>
      !FOLDED_CODES.has(it.code) && VISIBLE_GROUPS[pt].includes(it.group) &&
      priceableFor(it, pt) && matchesBuildingUse(it.buildingUse, u)).length)])
}
addSheet('4. Scope x ProjectType', sxRows,
  [10, 7, 60, 16, ...PROJECT_TYPES.map(() => 18), 3, ...PROJECT_TYPES.map(() => 15)])

// ── Sheet 5 — EngineReads ────────────────────────────────────────────────────
const knownKeys = new Set(QUESTIONS.map(q => q.key))
const allKeys = new Set([...knownKeys, ...Object.keys(ORPHAN_KEYS),
  ...ENGINE_FILES.flatMap(([label]) => [...engineKeys[label]])])
const erRows = [[
  'Answer key', 'Asked as', 'Label / note',
  ...ENGINE_FILES.map(([label]) => label),
  'Impact if not asked',
]]
for (const key of [...allKeys].sort()) {
  const q = QUESTIONS.find(x => x.key === key)
  erRows.push([
    key,
    q ? q.num : 'NOT ASKED',
    q ? q.label : (ORPHAN_KEYS[key] || 'Referenced in code; not a current question'),
    ...ENGINE_FILES.map(([label]) => (engineKeys[label].has(key) ? 'Y' : '')),
    impactOf(key),
  ])
}
addSheet('5. EngineReads', erRows,
  [26, 12, 72, ...ENGINE_FILES.map(() => 13), 58])

// ── Sheet 6 — Tab 3 conditions ───────────────────────────────────────────────
const ratesWb = await fetchRatesWorkbook()
const t3 = XLSX.utils.sheet_to_json(ratesWb.Sheets['3. Percentage Rules'], { header: 1, defval: '' })
// A visible number can carry several keys (Q2.2 is the picker, the derived
// wiring answer, the per-element quantities and the free-text scope), so this
// collects all of them rather than letting the last one win.
const keysForNum = {}
for (const q of QUESTIONS) if (/^Q\d/.test(q.num)) (keysForNum[q.num] ||= []).push(q.key)
const t3Rows = [[
  'Rule code', 'Addition', 'Type', 'Adjust %', 'Cap %', 'Condition text (quoted in the report)',
  'Question numbers quoted', 'Answer keys those numbers resolve to', 'Safe to renumber?',
]]
for (let i = 4; i < t3.length; i++) {
  const r = t3[i]
  const code = String(r[0] || '').trim()
  if (!code || !r[2]) continue
  const condition = String(r[5] || '').trim()
  const nums = [...new Set(condition.match(/Q\d+\.\d+[a-z]?/g) || [])]
  t3Rows.push([
    code, String(r[1] || '').trim(), String(r[2] || '').trim(),
    Number(r[3]) || 0, Number(r[4]) || 0, condition,
    nums.join(', '),
    nums.map(n => (keysForNum[n] || ['(NO CURRENT QUESTION WITH THIS NUMBER)']).join(' + ')).join(', '),
    nums.length ? 'NO — the workbook quotes these numbers literally' : 'Yes — no question number quoted',
  ])
}
addSheet('6. Tab3 Conditions', t3Rows, [12, 30, 10, 10, 9, 72, 22, 40, 44])

// ── write ────────────────────────────────────────────────────────────────────
const out = path.join(process.cwd(), 'docs', 'questionnaire-scope-map.xlsx')
fs.mkdirSync(path.dirname(out), { recursive: true })
// The SheetJS CDN build has no fs wired into the ESM entry, so XLSX.writeFile
// is unavailable here — same reason scripts read with readFileSync + XLSX.read.
fs.writeFileSync(out, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
console.log(`Wrote ${out}`)
console.log(`  questions: ${QUESTIONS.length} (+${Object.keys(ORPHAN_KEYS).length} legacy keys)`)
console.log(`  scope elements: ${allItems.length}`)
console.log(`  Tab 3 rules: ${t3Rows.length - 1}`)
