/**
 * build-question-map.mjs
 *
 * Emits docs/question-map.xlsx — one sheet per question showing its options,
 * and one sheet linking them together.
 *
 * Written 22 September 2026 after the group-by-group review turned into more
 * confusion than it removed. The point of this file is to be READ, not argued
 * with in chat: one question per sheet, plain English, no code numbers in the
 * places where they are not needed.
 *
 * Level of works (Q2.2 / "Min Lvl") is DELIBERATELY ABSENT. It was an axis on
 * the previous sheet and the user judged it wrong. The question still exists in
 * the form and still sets the band multiplier; it is simply not a relevance
 * axis here, and no scope row is gated on it in this proposal.
 *
 * Groups 0-4 carry the decisions taken in that review. Groups 5-8 have NOT been
 * reviewed yet and are reproduced as they stand, renamed into plain English
 * only. The Status column says which is which, so nothing is presented as
 * agreed that was not.
 *
 * Usage:  node scripts/build-question-map.mjs
 * Needs:  RATES_FILE_URL in .env.local
 */
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { getScopeItems } from '../lib/costCalculator.js'
import { PROJECT_TYPES, PROJECT_TYPE_VALUES, VISIBLE_GROUPS, priceableFor } from '../lib/projectTypes.js'
import { PRICING_BASIS } from './nrm1-elements.mjs'

const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim()
  }
}

const AGREED = 'Agreed'
const PROPOSED = 'Proposed — for your review'
const UNREVIEWED = 'Not reviewed yet'
const UNCHANGED = 'Unchanged'

// ── Groups 0-4: the outcome of the review ────────────────────────────────────
// [code, item, priced on, building use, status, note]
const REVIEWED = [
  // Group 0 — Facilitating works
  [0, '0.1', 'Asbestos and hazardous material removal', 'Every floor (GIFA)', 'All', AGREED, 'Renamed — it is asbestos 95% of the time'],
  [0, '0.2', 'Demolition and structural alterations', 'Every floor (GIFA)', 'All', UNCHANGED, ''],
  [0, '0.3', 'Contaminated land remediation', 'Every floor (GIFA)', 'All', AGREED, 'Stays on GIFA by your decision. Set the rate assuming a typical site-to-building ratio'],
  [0, '0.4', 'Ground stabilisation', 'Every floor (GIFA)', 'All', UNCHANGED, 'Already covers underpinning and piling'],
  [0, '0.5', 'Strip out existing finishes and fittings', 'Every floor (GIFA)', 'All', AGREED, 'Renamed. Now also offered on Fit-out, which could not reach it before'],
  [0, '0.6', 'Tree removal and arboricultural works', 'Per tree', 'All', AGREED, 'New'],
  [0, '0.7', 'Diversion of existing underground services', 'Lump sum', 'All', AGREED, 'New'],
  [0, '0.8', 'Temporary works and propping', 'Every floor (GIFA)', 'All', AGREED, 'New'],

  // Group 1 — Substructure
  [1, '1.1', 'Standard foundations (strip or pad)', 'One floor (footprint)', 'All', UNCHANGED, ''],
  [1, '1.2', 'Piled foundations', 'One floor (footprint)', 'All', UNCHANGED, ''],
  [1, '1.3', 'Ground floor slab', 'One floor (footprint)', 'All', AGREED, 'Renamed. Rate should include excavation and sub-base — state it in the workbook notes'],
  [1, '1.4', 'Basement excavation and structure', 'One floor (footprint)', 'All', UNCHANGED, ''],

  // Group 2 — Superstructure
  [2, '2.1', 'Structural frame', 'Every floor (GIFA)', 'All', UNCHANGED, ''],
  [2, '2.2', 'Upper floors', 'Upper floors only', 'All', UNCHANGED, ''],
  [2, '2.3', 'Roof structure and covering', 'One floor (footprint)', 'All', UNCHANGED, 'Includes roof waterproofing'],
  [2, '2.4', 'Stairs and ramps', 'Every floor (GIFA)', 'All', UNCHANGED, ''],
  [2, '2.5', 'External walls and facade', 'Every floor (GIFA)', 'All', UNCHANGED, ''],
  [2, '2.6', 'Windows and external doors', 'Every floor (GIFA)', 'All', UNCHANGED, ''],
  [2, '2.7', 'Internal walls and partitions', 'Every floor (GIFA)', 'All', UNCHANGED, 'Do not double-count with finishes'],
  [2, '2.8', 'Internal doors and ironmongery', 'Every floor (GIFA)', 'All', UNCHANGED, ''],
  [2, '2.9', 'Wet area tanking and waterproofing', 'Every floor (GIFA)', 'All', AGREED, 'Split from the old combined row. Bathrooms, showers, wet rooms'],
  [2, '2.10', 'Basement tanking and below-ground waterproofing', 'One floor (footprint)', 'All', AGREED, 'New — split from 2.9. Needs its own, much higher rate'],

  // Group 3 — Internal finishes
  [3, '3.1', 'Wall finishes', 'Every floor (GIFA)', 'All', UNCHANGED, ''],
  [3, '3.2', 'Floor finishes', 'Every floor (GIFA)', 'All', AGREED, 'Tanking removed from this row — 2.9 owns it'],
  [3, '3.3', 'Ceiling finishes', 'Every floor (GIFA)', 'All', UNCHANGED, ''],

  // Group 4 — Fittings and equipment. 35 rows become 14.
  [4, '4.1', 'Built-in joinery and fittings', 'Every floor (GIFA)', 'All', UNCHANGED, ''],
  [4, '4.2-RES', 'Bathroom or ensuite', 'Per bathroom', 'Residential, Student, Hospitality', PROPOSED, 'Absorbs the hotel guest-room row'],
  [4, '4.2-COM', 'Washroom or WC — including cubicles, vanity and dryers', 'Per WC', 'Non-Residential', PROPOSED, 'Absorbs four rows that all priced the same toilet'],
  [4, '4.3-RES', 'Domestic kitchen', 'Per kitchen', 'Residential, Student', PROPOSED, 'Split from the old combined kitchen row'],
  [4, '4.3-NR', 'Tea point or kitchenette', 'Per unit', 'Non-Residential', PROPOSED, 'NOT a catering kitchen — see 4.34'],
  [4, '4.5', 'Wayfinding and signage', 'Every floor (GIFA)', 'All', UNCHANGED, ''],
  [4, '4.22', 'Audio-visual and presentation systems', 'Every floor (GIFA)', 'Office, Education, Commercial', PROPOSED, 'Now priced per m² rather than counted'],
  [4, '4.33', 'Loose furniture and FF&E', 'Every floor (GIFA)', 'All', PROPOSED, 'Absorbs four rows. NOTE: your Tab 8 benchmarks probably exclude loose furniture — decide whether to keep this at all'],
  [4, '4.34', 'Catering and hospitality equipment', 'Every floor (GIFA)', 'Hospitality, Education, Healthcare', PROPOSED, 'Kitchen equipment, extract canopy, bar and servery, cold store. Food prepared for sale or service'],
  [4, '4.35', 'Retail fit-out equipment', 'Every floor (GIFA)', 'Retail', PROPOSED, 'Display units, sales counters, fitting rooms, security tagging'],
  [4, '4.36', 'Laboratory and teaching equipment', 'Every floor (GIFA)', 'Education, Healthcare', PROPOSED, 'Benching and fume cupboards'],
  [4, '4.37', 'Clinical equipment and fittings', 'Every floor (GIFA)', 'Healthcare', PROPOSED, 'Clinical furniture and medical gas'],
  [4, '4.38', 'Industrial handling and storage', 'Every floor (GIFA)', 'Industrial', PROPOSED, 'Racking, dock levellers, roller shutters, cranes'],
  [4, '4.39', 'Sports and leisure equipment', 'Every floor (GIFA)', 'Sports', PROPOSED, 'Gym equipment, spectator seating, lockers'],
]

// Rows that leave the picker. Keep them in the workbook so reports already
// stored in KV can still print their descriptions; simply stop offering them.
const RETIRED = {
  '4.2-HG': '4.2-RES', '4.2-HP': '4.2-COM', '4.2-HC': '4.2-COM',
  '4.31-NR': '4.2-COM', '4.32-HOH': '4.2-COM', '5.30-NR': '4.2-COM',
  '4.3': '4.3-RES / 4.3-NR',
  '4.6': '4.33', '4.7': '4.33', '4.8': '4.33', '4.9': '4.33',
  '4.10': '4.34', '4.11': '4.34', '4.12': '4.34', '4.16': '4.34',
  '4.24': '4.35', '4.25': '4.35', '4.26': '4.35', '4.27': '4.35',
  '4.20': '4.36', '4.21': '4.36',
  '4.18': '4.37', '4.19': '4.37',
  '4.13': '4.38', '4.14': '4.38', '4.15': '4.38', '4.17': '4.38',
  '4.28': '4.39', '4.29': '4.39', '4.30': '4.39',
  '4.4': 'the Other / specialist box already in the form',
}

// Plain-English names for groups 5-8, which have NOT been reviewed. Renaming is
// the only change: no row is merged, split, added or removed here.
const PLAIN_NAMES = {
  '5.1': 'Plumbing and above-ground drainage',
  '5.1b': 'Plumbing and heating — final connections only',
  '5.2': 'Heating and hot water',
  '5.2L': 'Boiler replacement — like for like',
  '5.3': 'Ventilation and air handling',
  '5.4': 'Cooling and air conditioning',
  '5.5': 'Gas supply',
  '5.6': 'Sprinklers and fire suppression',
  '5.7': 'Main electrical supply and distribution',
  '5.7a': 'Power distribution around the building',
  '5.8': 'Electrical installation — power and lighting',
  '5.8a': 'Electrical rewiring — cables only',
  '5.8b': 'Electrical — new sockets and switches only',
  '5.8c': 'New lighting and controls',
  '5.9a': 'Fire alarm and detection',
  '5.9b': 'Emergency lighting',
  '5.10': 'External lighting on the building',
  '5.11': 'Solar panels (PV)',
  '5.12': 'Battery storage',
  '5.13': 'Electricity supply upgrade',
  '5.14': 'Building energy management system',
  '5.15': 'Electric vehicle charging',
  '5.16': 'Data cabling and IT infrastructure',
  '5.18': 'Security — access control and CCTV',
  '5.19': 'Lifts',
  '5.20': 'Cutting and making good for services',
  '5.21': 'Compressed air',
  '5.23': 'Process drainage and grease trap',
  '5.24': 'Process ventilation and fume extraction',
  '5.25': 'Standby generator',
  '5.26': 'Uninterruptible power supply',
  '5.27': 'Nurse call',
  '5.29': 'Precision cooling for server or plant rooms',
  '6.1': 'Prefabricated or modular units',
  '6.2': 'Mezzanine floor',
  '6.3': 'Modular bathroom or WC pod',
  '6.4': 'Cleanroom',
  '7.1': 'Structural repairs — repair, not replacement',
  '7.2': 'Fabric repairs — repair, not replacement',
  '7.3': 'Damp proof course treatment',
  '7.4': 'Services overhaul — repair, not replacement',
  '7.5': 'Making good after building works',
  '8.1': 'Site preparation and clearance',
  '8.2': 'Roads, paths and hard paving',
  '8.3': 'Car parking',
  '8.4': 'Surface water drainage',
  '8.5': 'Foul drainage connections',
  '8.6': 'External utility services',
  '8.7': 'Soft landscaping',
  '8.8': 'Fences, gates and boundary walls',
  '8.9': 'External lighting across the site',
  '8.10': 'HGV hardstanding and turning area',
  '8.11': 'Cycle storage and shelters',
  '8.12': 'Bin store and waste enclosure',
  '8.13': 'Roof terrace and green roof',
}

const FOLDED = new Set(['5.2L', '5.5', '5.8'])

const { groups } = await getScopeItems()
const live = groups.flatMap(g => g.items)
const byCode = Object.fromEntries(live.map(i => [i.code, i]))
const groupLabel = Object.fromEntries(groups.map(g => [g.group, g.label]))

// Build the full proposed list: reviewed rows, then groups 5-8 as they stand.
const rows = [...REVIEWED]
for (const it of live) {
  if (it.group < 5) continue
  if (RETIRED[it.code]) continue
  rows.push([
    it.group, it.code,
    PLAIN_NAMES[it.code] || it.description,
    PRICING_BASIS[it.pricingType] || it.pricingType || '',
    it.buildingUse || 'All',
    UNREVIEWED,
    FOLDED.has(it.code) ? 'Folded into another row — never shown as its own tile' : '',
  ])
}

const wb = XLSX.utils.book_new()
const add = (name, aoa, widths) => {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = widths.map(w => ({ wch: w }))
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }
  XLSX.utils.book_append_sheet(wb, ws, name)
}

// ── 0. Read me ───────────────────────────────────────────────────────────────
add('0. Read me', [
  ['Question map — what each question asks, and how the answers connect'],
  [`Generated ${new Date().toISOString().slice(0, 10)}`],
  [],
  ['The sheets'],
  ['1. Q1.2 Project type', 'The seven options, and which scope groups each one shows'],
  ['2. Q1.3 Building use', 'The ten options'],
  ['3. Q2.4 Specification level', 'The three options'],
  ['4. Q2.3 Scope items', 'The proposed list, simplified. One row per tile the user would see'],
  ['5. The link', 'Every scope item against every project type: Core, Optional or N/A'],
  ['6. Retired rows', 'What was removed from the proposed list, and what replaced it'],
  [],
  ['Level of works has been removed'],
  ['It was an axis on the previous sheet. It is gone from this one. No scope row in this proposal is gated on it.'],
  [],
  ['Only two questions decide the price'],
  ['Q2.3', 'What the user actually ticks'],
  ['Q2.4', 'Specification level — which rate column is read'],
  ['Q1.2 and Q1.3 decide what the user is OFFERED. They never decide the price on their own.'],
  [],
  ['The Status column on sheet 4'],
  [AGREED, 'You and I agreed this in conversation'],
  [UNCHANGED, 'As it stands today, and nothing suggested against it'],
  [PROPOSED, 'My proposal. Group 4 only. Nothing here is decided'],
  [UNREVIEWED, 'Groups 5 to 8. Reproduced as they stand, renamed into plain English only. No row merged, split, added or removed'],
], [30, 96])

// ── 1. Q1.2 Project type ─────────────────────────────────────────────────────
const groupsSeen = pt => (VISIBLE_GROUPS[pt] || []).map(g => `${g} ${groupLabel[g] || ''}`.trim()).join(' · ')
add('1. Q1.2 Project type', [
  ['Option', 'What it means', 'Scope groups this option shows'],
  ...PROJECT_TYPES.map(t => [t.value, t.help, groupsSeen(t.value)]),
], [24, 62, 96])

// ── 2. Q1.3 Building use ─────────────────────────────────────────────────────
add('2. Q1.3 Building use', [
  ['Option', 'Effect'],
  ['Residential', 'Shows residential items; hides non-residential ones'],
  ['Student accommodation (PBSA / halls)', 'Treated as residential'],
  ['Commercial offices', 'Shows office and commercial items'],
  ['Education', 'Shows education items'],
  ['Healthcare', 'Shows healthcare items'],
  ['Retail', 'Shows retail items'],
  ['Industrial / warehouse', 'Shows industrial items'],
  ['Hospitality / leisure', 'Shows hospitality and sports items'],
  ['Mixed use', 'No restriction — shows everything'],
  ['Other', 'No restriction — shows everything'],
  [],
  ['Proposed change to how this works'],
  ['Today building use REMOVES an item the user can never then find. That is why a bar counter was unreachable in a university coffee shop.'],
  ['Proposed: building use only moves an item from Core to Optional. It never removes it.'],
], [40, 92])

// ── 3. Q2.4 Specification level ──────────────────────────────────────────────
add('3. Q2.4 Specification level', [
  ['Option', 'What it means', 'Rate column read'],
  ['Basic', 'Minimum compliance, budget materials, functional finish. Student accommodation, back of house, warehouses.', 'Rfb Basic / NB Std'],
  ['Standard', 'Good commercial standard, durable mid-range materials. Typical offices, education, general academic space.', 'Rfb Std / NB Std'],
  ['High', 'Flagship or premium. High-end finishes, bespoke joinery, enhanced services. Boardrooms, reception, prestige.', 'Rfb High / NB High'],
  [],
  ['This question is doing more work than most scope tiles.'],
  ['The Basic to High spread is 10x on built-in joinery, 4.5x on ventilation, 4.4x on floor finishes, 3.7x on external walls.'],
], [14, 100, 24])

// ── 4. Q2.3 Scope items ──────────────────────────────────────────────────────
add('4. Q2.3 Scope items', [
  ['Group', 'Group name', 'Code', 'Item the user sees', 'Priced on', 'Building use', 'Status', 'Note'],
  ...rows.map(([g, code, item, priced, use, status, note]) =>
    [g, groupLabel[g] || '', code, item, priced, use, status, note]),
], [7, 30, 10, 54, 22, 34, 26, 96])

// ── 5. The link ──────────────────────────────────────────────────────────────
// Core / Optional / N/A per project type. Derived where the code still exists
// in the workbook; for proposed new rows it follows the group's own visibility.
const relevance = (code, group, pt) => {
  if (!VISIBLE_GROUPS[pt]?.includes(group)) return 'N/A'
  const it = byCode[code]
  if (it) return priceableFor(it, pt) ? 'Optional' : 'N/A'
  return 'Optional'                  // proposed row, no rate yet — offerable
}
add('5. The link', [
  ['Code', 'Item', 'Building use', ...PROJECT_TYPE_VALUES, 'Your notes'],
  ...rows.map(([g, code, item, , use]) =>
    [code, item, use, ...PROJECT_TYPE_VALUES.map(pt => relevance(code, g, pt)), '']),
], [10, 54, 34, ...PROJECT_TYPE_VALUES.map(() => 15), 40])

// ── 6. Retired rows ──────────────────────────────────────────────────────────
add('6. Retired rows', [
  ['Code', 'What it was', 'Replaced by'],
  ...Object.entries(RETIRED).map(([code, by]) =>
    [code, byCode[code]?.description || '(not in the workbook)', by]),
  [],
  ['These stay in the workbook so reports already generated can still print their descriptions. They are simply no longer offered.'],
], [12, 56, 46])

const dest = path.join(process.cwd(), 'docs', 'question-map.xlsx')
fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.writeFileSync(dest, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))

const counts = rows.reduce((a, r) => { a[r[5]] = (a[r[5]] || 0) + 1; return a }, {})
console.log(`Wrote ${dest}`)
console.log(`  ${rows.length} scope rows proposed (was ${live.length})`)
for (const [k, v] of Object.entries(counts)) console.log(`    ${v}  ${k}`)
console.log(`  ${Object.keys(RETIRED).length} rows retired`)
