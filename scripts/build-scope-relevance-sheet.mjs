/**
 * build-scope-relevance-sheet.mjs
 *
 * Emits docs/scope-relevance-TO-FILL.xlsx — the sheet that decides which scope
 * elements each project type offers by default, so Q2.2 stops showing ~100
 * tiles to everyone.
 *
 * It is PRE-FILLED with a suggestion rather than left blank, so the job is
 * correcting rather than authoring. The suggestion is derived, not invented:
 *
 *   N/A      the element has no rate in that project type's rate family, or its
 *            NRM1 group is not offered for that type — the picker could only
 *            ever exclude it
 *   Core     the element is in that type's existing "typical scope" preset,
 *            which is the list the "Use typical scope" button already applies
 *   Optional everything else that is priceable and visible
 *
 * The Min Lvl column carries the intervention-level dimension: it is the
 * workbook's own "Min Lvl" for each row, i.e. the lowest Q2.3 tier at which the
 * element becomes selectable on a refurbishment-family project. There is a
 * blank column beside it to override.
 *
 * Specification level is deliberately NOT a relevance dimension here — Q2.4
 * picks which RATE COLUMN is read for an element, not whether the element
 * applies. If that turns out to be wrong, say so and it becomes another axis.
 *
 * Usage:  node scripts/build-scope-relevance-sheet.mjs
 * Needs:  RATES_FILE_URL in .env.local
 */
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { getScopeItems } from '../lib/costCalculator.js'
import { BUILDING_USE_TAGS, matchesBuildingUse } from '../lib/buildingUse.js'
import { PROJECT_TYPE_VALUES, VISIBLE_GROUPS, priceableFor } from '../lib/projectTypes.js'

const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim()
  }
}

// The existing "typical scope" presets, transcribed from app/questionnaire/page.jsx.
// These are the only statement of "what a project of this type usually includes"
// that exists anywhere today, so they seed the Core suggestion.
const NEW_BUILD_SCOPE = ['1.1', '1.3', '2.1', '2.2', '2.3', '2.5', '2.6', '2.7', '2.8',
  '3.1', '3.2', '3.3', '4.1', '5.1', '5.2', '5.5', '5.3', '5.7', '5.8a', '5.8b', '5.8c', '8.1']
const REFURB_TIER_4 = ['0.2', '0.5', '2.7', '2.8', '3.1', '3.2', '3.3', '4.1', '5.1', '5.2',
  '5.5', '5.8a', '5.8b', '5.8c', '7.5']
const PRESET_BY_TYPE = {
  'New Build': NEW_BUILD_SCOPE,
  'Extension': NEW_BUILD_SCOPE,
  'Refurbishment': REFURB_TIER_4,
  'Fit-out': REFURB_TIER_4,
  'External works only': ['8.1', '8.2', '8.4', '8.7', '8.8'],
  'Demolition only': ['0.2', '0.5'],
  'Other or mixed': [],
}

const FOLDED_CODES = new Set(['5.2L', '5.5', '5.8'])

function suggestFor(item, pt) {
  if (!VISIBLE_GROUPS[pt]?.includes(item.group)) return 'N/A'
  if (!priceableFor(item, pt)) return 'N/A'
  if ((PRESET_BY_TYPE[pt] || []).includes(item.code)) return 'Core'
  return 'Optional'
}

const { groups } = await getScopeItems()
const items = groups.flatMap(g => g.items)
const groupLabel = Object.fromEntries(groups.map(g => [g.group, g.label]))
const USES = Object.keys(BUILDING_USE_TAGS)

const wb = XLSX.utils.book_new()
const NAVY = '1A2E4A'
const addSheet = (name, aoa, widths) => {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = widths.map(w => ({ wch: w }))
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }
  XLSX.utils.book_append_sheet(wb, ws, name)
}

// ── Read me ──────────────────────────────────────────────────────────────────
addSheet('0. Read me', [
  ['Scope relevance — which elements each project type offers by default'],
  [`Generated ${new Date().toISOString().slice(0, 10)} by scripts/build-scope-relevance-sheet.mjs`],
  [],
  ['The problem this solves'],
  ['Q2.2 shows up to 98 tiles on a new build. Three NRM1 groups carry 76 of them: group 4 (fittings, 35 tiles), group 5 (M&E, 28) and group 8 (external works, 13).'],
  ['Once this sheet is filled, the picker shows the Core elements and folds everything Optional behind a "+N more" disclosure per group. Nothing is ever unreachable.'],
  [],
  ['What to do'],
  ['1.', 'Open sheet "1. Relevance". Columns H to N are one per project type and are ALREADY FILLED with a suggestion.'],
  ['2.', 'Correct the ones that are wrong. You are editing, not authoring — most rows will be right.'],
  ['3.', 'Only three values are valid. Anything else is treated as Optional.'],
  [],
  ['Value', 'Meaning', 'Effect on the picker'],
  ['Core', 'A project of this type usually includes this element', 'Shown by default, in its group'],
  ['Optional', 'Sometimes relevant — the user should be able to find it', 'Folded behind "+N more" in its group'],
  ['N/A', 'Cannot apply, or has no rate for this type', 'Not offered at all'],
  [],
  ['Where the suggestion came from'],
  ['N/A', 'Derived: the element has no rate in that type’s rate family, or its NRM1 group is not offered for that type. These are facts, not opinions — change one only if you intend to add a rate.'],
  ['Core', 'Derived: the element is in that type’s existing "Use typical scope" preset. That preset is deliberately conservative, so expect to promote things — external works especially, where it only picks site preparation.'],
  ['Optional', 'Everything else that is priceable and visible today.'],
  [],
  ['The intervention-level dimension'],
  ['Column F "Min Lvl" is the workbook’s own value: the lowest Q2.3 tier at which the element becomes selectable on a refurbishment-family project. 1 = fabric and finishes only, 4 = reconfiguration or full redesign.'],
  ['Column G is blank for you to override it. Leave blank to keep the workbook value.'],
  [],
  ['Specification level is deliberately NOT an axis here'],
  ['Q2.4 picks which rate COLUMN is read for an element, not whether the element applies. If you think spec level should also narrow the list, say so and it becomes another set of columns.'],
  [],
  ['Building use'],
  ['Column D shows the workbook’s Building Use tags, which already filter the picker independently. 62 of 112 rows are tagged "All", which is why that filter alone leaves so many tiles.'],
  ['Sheet "2. Today" shows how many tiles each combination currently produces, so you can see what the change is worth.'],
], [14, 62, 58])

// ── 1. Relevance (the fillable grid) ─────────────────────────────────────────
const relRows = [[
  'Code', 'Group', 'Element / description', 'Building Use tags', 'Pricing type',
  'Min Lvl (workbook)', 'Min Lvl (override)',
  ...PROJECT_TYPE_VALUES,
  'Notes',
]]
for (const it of items) {
  relRows.push([
    it.code, it.group, it.description,
    it.buildingUse || 'All',
    it.pricingType,
    it.minLvl || 1, '',
    ...PROJECT_TYPE_VALUES.map(pt => (FOLDED_CODES.has(it.code) ? 'n/a — folded into parent' : suggestFor(it, pt))),
    '',
  ])
}
addSheet('1. Relevance', relRows,
  [10, 7, 58, 30, 16, 17, 17, ...PROJECT_TYPE_VALUES.map(() => 15), 40])

// ── 2. Today (what the change is worth) ──────────────────────────────────────
const todayRows = [['Building use', ...PROJECT_TYPE_VALUES]]
const countFor = (pt, use) => items.filter(it =>
  !FOLDED_CODES.has(it.code) &&
  VISIBLE_GROUPS[pt]?.includes(it.group) &&
  priceableFor(it, pt) &&
  (use === null || matchesBuildingUse(it.buildingUse, use))).length
todayRows.push(['Any (wildcard — the worst case)', ...PROJECT_TYPE_VALUES.map(pt => countFor(pt, null))])
for (const u of USES) todayRows.push([u, ...PROJECT_TYPE_VALUES.map(pt => countFor(pt, u))])
todayRows.push([])
todayRows.push(['If your sheet marks these Core, the default view becomes:'])
todayRows.push(['(fill sheet 1, re-run this script, and this row fills in)'])
addSheet('2. Today', todayRows, [34, ...PROJECT_TYPE_VALUES.map(() => 16)])

// ── 3. Where the tiles are ───────────────────────────────────────────────────
const grpRows = [['Group', 'Label', 'Elements', ...PROJECT_TYPE_VALUES.map(pt => `Shown: ${pt}`)]]
for (const g of groups) {
  grpRows.push([
    g.group, groupLabel[g.group], g.items.length,
    ...PROJECT_TYPE_VALUES.map(pt => g.items.filter(it =>
      !FOLDED_CODES.has(it.code) && VISIBLE_GROUPS[pt]?.includes(it.group) && priceableFor(it, pt)).length),
  ])
}
addSheet('3. Where the tiles are', grpRows, [8, 40, 10, ...PROJECT_TYPE_VALUES.map(() => 15)])

const out = path.join(process.cwd(), 'docs', 'scope-relevance-TO-FILL.xlsx')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
console.log(`Wrote ${out}`)
console.log(`  ${items.length} elements x ${PROJECT_TYPE_VALUES.length} project types`)
const counts = { Core: 0, Optional: 0, 'N/A': 0 }
for (const it of items) for (const pt of PROJECT_TYPE_VALUES) {
  if (FOLDED_CODES.has(it.code)) continue
  counts[suggestFor(it, pt)]++
}
console.log(`  pre-filled suggestion: ${counts.Core} Core, ${counts.Optional} Optional, ${counts['N/A']} N/A`)
