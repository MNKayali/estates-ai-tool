/**
 * build-scope-relevance-sheet.mjs
 *
 * Emits docs/scope-relevance-TO-FILL.xlsx — the one document that maps every
 * scope element against the three things that decide whether the user is
 * offered it: Q1.2 project type, Q1.3 building use, and Q2.2 level of works.
 *
 * Nothing here decides PRICE. Price comes only from what the user ticks in Q2.3
 * and the specification level in Q2.4. This sheet decides what reaches the
 * tick-list in the first place.
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
 * MERGE MODE is automatic: if the output file already exists, every answered
 * cell in it is carried forward before the new suggestion is applied, so the
 * sheet can be filled in today and regenerated later without losing the work.
 * Rows that have since left the workbook are dropped with a printed warning.
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
import { CODE_TO_NRM1, NRM1, PRICING_BASIS } from './nrm1-elements.mjs'

const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim()
  }
}

const OUT = path.join(process.cwd(), 'docs', 'scope-relevance-TO-FILL.xlsx')

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
const FOLDED_NOTE = 'n/a — folded into parent'

const LEVEL_NAMES = {
  1: '1 Fabric and finishes only',
  2: '2 Finishes with minor services',
  3: '3 Full systems replacement',
  4: '4 Reconfiguration or full redesign',
}

function suggestFor(item, pt) {
  if (!VISIBLE_GROUPS[pt]?.includes(item.group)) return 'N/A'
  if (!priceableFor(item, pt)) return 'N/A'
  if ((PRESET_BY_TYPE[pt] || []).includes(item.code)) return 'Core'
  return 'Optional'
}

// ── Merge: read whatever the user has already filled in ──────────────────────
// Keyed by code, by COLUMN HEADER rather than index, so adding a column here
// never silently shifts someone's answers into the wrong field.
const MERGED_COLUMNS = [
  'Building use (override)', 'Min Lvl (override)', 'Notes', ...PROJECT_TYPE_VALUES,
]
function readExistingAnswers() {
  if (!fs.existsSync(OUT)) return { answers: {}, found: 0 }
  let wb
  try {
    wb = XLSX.read(fs.readFileSync(OUT), { type: 'buffer' })
  } catch (e) {
    console.warn(`  ! could not read the existing sheet (${e.message}) — starting fresh`)
    return { answers: {}, found: 0 }
  }
  const ws = wb.Sheets['1. Relevance']
  if (!ws) return { answers: {}, found: 0 }
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (rows.length < 2) return { answers: {}, found: 0 }
  const header = rows[0].map(h => String(h).trim())
  const codeIdx = header.indexOf('Code')
  if (codeIdx < 0) return { answers: {}, found: 0 }
  const answers = {}
  let found = 0
  for (const r of rows.slice(1)) {
    const code = String(r[codeIdx] || '').trim()
    if (!code) continue
    const kept = {}
    for (const col of MERGED_COLUMNS) {
      const i = header.indexOf(col)
      if (i < 0) continue
      const v = String(r[i] ?? '').trim()
      if (v && v !== FOLDED_NOTE) kept[col] = v
    }
    if (Object.keys(kept).length) { answers[code] = kept; found++ }
  }
  return { answers, found }
}

const { answers: prior, found: priorRows } = readExistingAnswers()

const { groups } = await getScopeItems()
const items = groups.flatMap(g => g.items)
const groupLabel = Object.fromEntries(groups.map(g => [g.group, g.label]))
const USES = Object.keys(BUILDING_USE_TAGS)
const liveCodes = new Set(items.map(i => i.code))
const orphaned = Object.keys(prior).filter(c => !liveCodes.has(c))

const wb = XLSX.utils.book_new()
const addSheet = (name, aoa, widths) => {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = widths.map(w => ({ wch: w }))
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }
  XLSX.utils.book_append_sheet(wb, ws, name)
}

// ── Read me ──────────────────────────────────────────────────────────────────
addSheet('0. Read me', [
  ['Scope relevance — which elements each project type offers, and how each one is priced'],
  [`Generated ${new Date().toISOString().slice(0, 10)} by scripts/build-scope-relevance-sheet.mjs`],
  [],
  ['What this sheet decides — and what it does NOT'],
  ['It decides what reaches the Q2.3 tick-list. It does NOT decide price.'],
  ['Price comes only from what the user actually ticks in Q2.3, and the specification level in Q2.4.'],
  [],
  ['The problem this solves'],
  ['Q2.3 shows up to 98 tiles on a new build. Three NRM1 groups carry 76 of them: group 4 (fittings, 35 tiles), group 5 (M&E, 34) and group 8 (external works, 13).'],
  ['Once this sheet is filled, the picker shows the Core elements and folds everything Optional behind a "+N more" disclosure per group. Nothing is ever unreachable.'],
  [],
  ['What to do'],
  ['1.', 'Open sheet "1. Relevance". The project-type columns are ALREADY FILLED with a suggestion.'],
  ['2.', 'Correct the ones that are wrong. You are editing, not authoring — most rows will be right.'],
  ['3.', 'Only three values are valid. Anything else is treated as Optional.'],
  [],
  ['Value', 'Meaning', 'Effect on the picker'],
  ['Core', 'A project of this type usually includes this element', 'Shown by default, in its group'],
  ['Optional', 'Sometimes relevant — the user should be able to find it', 'Folded behind "+N more" in its group'],
  ['N/A', 'Cannot apply, or has no rate for this type', 'Not offered at all'],
  [],
  ['Core is NOT pre-ticked. It only decides where the tile sits on the page. Nothing reaches the price except by the user ticking it.'],
  [],
  ['Where the suggestion came from'],
  ['N/A', 'Derived: the element has no rate in that type’s rate family, or its NRM1 group is not offered for that type. These are facts, not opinions — change one only if you intend to add a rate.'],
  ['Core', 'Derived: the element is in that type’s existing "Use typical scope" preset. That preset is deliberately conservative, so expect to promote things — external works especially, where it only picks site preparation.'],
  ['Optional', 'Everything else that is priceable and visible today.'],
  [],
  ['The three columns that are yours to change'],
  ['Building use (override)', 'Which Q1.3 building uses this element applies to. "All" means any. Leave blank to keep the workbook value.'],
  ['', 'Building use will DEMOTE a Core element to Optional when it does not match — it will never hide it. That is the fix for the bar counter being unreachable in a university coffee shop.'],
  ['Min Lvl (override)', 'The lowest Q2.2 Level of Works at which this element becomes available. 1 = always available. Leave blank to keep the workbook value.'],
  ['', 'Min Lvl only applies to Refurbishment, Fit-out and Extension. New Build, External works only, Demolition only and Other or mixed ignore it entirely.'],
  ['Notes', 'Anything you want recorded against the row. Carried forward when this sheet is regenerated.'],
  [],
  ['The "Priced on" column is read-only, and is worth checking'],
  ['Every floor (GIFA)', 'Charged across the whole building. Right for finishes, partitions, services, facade.'],
  ['One floor (footprint)', 'Charged on GIFA ÷ storeys. Right for roof, foundations, ground slab — you only have one of each.'],
  ['Upper floors only', 'Charged on GIFA × (storeys − 1) ÷ storeys. Right for suspended upper floor structure.'],
  ['Per unit / Lump sum', 'A count or a single figure, not an area.'],
  ['A wrong basis is as costly as a wrong relevance: 2.9 tanking was charged across every floor of the building when it only applies to one.'],
  [],
  ['Specification level is deliberately NOT an axis here'],
  ['Q2.4 picks which rate COLUMN is read for an element, not whether the element applies.'],
  [],
  ['Regenerating this sheet is safe'],
  ['Re-running the script carries every answer forward automatically. Fill it in as you go.'],
], [16, 62, 58])

// ── 1. Relevance (the fillable grid) ─────────────────────────────────────────
const relHeader = [
  'Code', 'Group', 'Element / description', 'Priced on', 'NRM1 Ref', 'NRM1 element',
  'Building Use (workbook)', 'Building use (override)',
  'Min Lvl (workbook)', 'Min Lvl (override)',
  ...PROJECT_TYPE_VALUES,
  'Notes',
]
const relRows = [relHeader]
for (const it of items) {
  const [ref = '', ] = CODE_TO_NRM1[it.code] || []
  const keep = prior[it.code] || {}
  const folded = FOLDED_CODES.has(it.code)
  relRows.push([
    it.code, it.group, it.description,
    PRICING_BASIS[it.pricingType] || it.pricingType || '',
    ref, NRM1[ref] || '',
    it.buildingUse || 'All',
    keep['Building use (override)'] || '',
    LEVEL_NAMES[it.minLvl || 1] || (it.minLvl || 1),
    keep['Min Lvl (override)'] || '',
    ...PROJECT_TYPE_VALUES.map(pt =>
      folded ? FOLDED_NOTE : (keep[pt] || suggestFor(it, pt))),
    keep['Notes'] || '',
  ])
}
addSheet('1. Relevance', relRows,
  [10, 7, 52, 22, 11, 40, 26, 26, 30, 18, ...PROJECT_TYPE_VALUES.map(() => 15), 40])

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
todayRows.push(['Core once this sheet is applied — how many tiles the user sees first:'])
todayRows.push(['Any (wildcard)', ...PROJECT_TYPE_VALUES.map(pt =>
  items.filter(it => !FOLDED_CODES.has(it.code) &&
    ((prior[it.code] || {})[pt] || suggestFor(it, pt)) === 'Core').length)])
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

// ── 4. Level of works ────────────────────────────────────────────────────────
// The Min Lvl axis, as a list rather than buried in one column, so it can be
// reviewed on its own. Only the three refurbishment-family types use it.
const lvlRows = [['Level of works (Q2.2)', 'Elements available at this level and below', 'Applies to']]
for (const lvl of [1, 2, 3, 4]) {
  lvlRows.push([
    LEVEL_NAMES[lvl],
    items.filter(it => !FOLDED_CODES.has(it.code) && (it.minLvl || 1) <= lvl).length,
    'Refurbishment, Fit-out, Extension only',
  ])
}
lvlRows.push([])
lvlRows.push(['Elements that first become available at each level:'])
for (const lvl of [1, 2, 3, 4]) {
  const newly = items.filter(it => !FOLDED_CODES.has(it.code) && (it.minLvl || 1) === lvl)
  lvlRows.push([LEVEL_NAMES[lvl], newly.length, newly.map(i => i.code).join(', ')])
}
addSheet('4. Level of works', lvlRows, [34, 42, 90])

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))

console.log(`Wrote ${OUT}`)
console.log(`  ${items.length} elements x ${PROJECT_TYPE_VALUES.length} project types`)
if (priorRows) console.log(`  merged answers carried forward from ${priorRows} existing row(s)`)
if (orphaned.length) console.warn(`  ! dropped ${orphaned.length} row(s) no longer in the workbook: ${orphaned.join(', ')}`)
const counts = { Core: 0, Optional: 0, 'N/A': 0 }
for (const it of items) {
  if (FOLDED_CODES.has(it.code)) continue
  for (const pt of PROJECT_TYPE_VALUES) {
    const v = (prior[it.code] || {})[pt] || suggestFor(it, pt)
    if (v in counts) counts[v]++
  }
}
console.log(`  ${counts.Core} Core, ${counts.Optional} Optional, ${counts['N/A']} N/A`)
