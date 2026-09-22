/**
 * build-nrm1-reference-map.mjs
 *
 * Emits docs/nrm1-reference-map.xlsx — the real RICS NRM1 element reference for
 * every row in the Master Cost Table, so column B ("NRM1 Ref") can stop being a
 * copy of column A.
 *
 * Why it matters: the GROUPS (0–8) already are NRM1 group elements, but the
 * sub-numbering is this app's own. Without a true reference the rates cannot be
 * checked against BCIS elemental cost analyses, which are published at NRM1
 * element level, and a QS reading the report sees an order they do not know.
 *
 * Where our group and NRM1's disagree the mapping follows NRM1 and says so in
 * the "Group differs" column — that is the whole point of a reference column.
 * Our own code and group are NOT changed by any of this; the picker, the cost
 * engine and every stored report keep working exactly as they do now.
 *
 * Usage:  node scripts/build-nrm1-reference-map.mjs
 * Needs:  RATES_FILE_URL in .env.local
 */
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'

const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim()
  }
}

// ── The NRM1 element list (RICS New Rules of Measurement 1) ──────────────────
const NRM1 = {
  '0.1': 'Toxic/hazardous material removal',
  '0.2': 'Major demolition works',
  '0.3': 'Temporary support to adjacent structures',
  '0.4': 'Specialist groundworks',
  '0.5': 'Temporary diversion works',
  '0.6': 'Extraordinary site investigation works',
  '1.1.1': 'Substructure — standard foundations',
  '1.1.2': 'Substructure — specialist foundations',
  '1.1.3': 'Substructure — lowest floor construction',
  '1.1.4': 'Substructure — basement excavation',
  '1.1.5': 'Substructure — basement retaining walls',
  '2.1': 'Frame',
  '2.2': 'Upper floors',
  '2.3': 'Roof',
  '2.4': 'Stairs and ramps',
  '2.5': 'External walls',
  '2.6': 'Windows and external doors',
  '2.7': 'Internal walls and partitions',
  '2.8': 'Internal doors',
  '3.1': 'Wall finishes',
  '3.2': 'Floor finishes',
  '3.3': 'Ceiling finishes',
  '4.1.1': 'General fittings, furnishings and equipment',
  '4.1.2': 'Domestic kitchen fittings and equipment',
  '4.1.3': 'Special purpose fittings, furnishings and equipment',
  '4.1.4': 'Signs/notices',
  '4.1.6': 'Barriers and handrails',
  '5.1': 'Sanitary installations',
  '5.2': 'Services equipment',
  '5.3': 'Disposal installations',
  '5.4': 'Water installations',
  '5.5': 'Heat source',
  '5.6': 'Space heating and air conditioning',
  '5.7': 'Ventilation',
  '5.8': 'Electrical installations',
  '5.9': 'Fuel installations',
  '5.10': 'Lift and conveyor installations',
  '5.11': 'Fire and lightning protection',
  '5.12': 'Communication, security and control systems',
  '5.13': 'Specialist installations',
  '5.14': 'Builder’s work in connection with services',
  '6.1': 'Prefabricated buildings and building units',
  '7.1': 'Minor demolition works and alterations',
  '7.2': 'Repairs to existing services',
  '7.3': 'Damp-proof courses/fungus and beetle eradication',
  '7.6': 'Renovation works',
  '8.1': 'Site preparation works',
  '8.2': 'Roads, paths, pavings and surfacings',
  '8.3': 'Soft landscaping, planting and irrigation systems',
  '8.4': 'Fencing, railings and walls',
  '8.5': 'External fixtures',
  '8.6': 'External drainage',
  '8.7': 'External services',
  '8.8': 'Minor building works and ancillary buildings',
}

// ── Our code → NRM1 element. Every one of the 112 rows, by hand. ─────────────
// A second entry in the array is the reason, printed where our group and NRM1's
// disagree, so the divergence is a recorded judgement rather than a silent one.
const MAP = {
  // Group 0 — facilitating works
  '0.1':  ['0.1'],
  '0.2':  ['0.2'],
  '0.3':  ['0.4', 'NRM1 puts land remediation under specialist groundworks'],
  '0.4':  ['0.4'],
  '0.5':  ['7.1', 'Soft strip of a retained building is minor demolition and alterations in NRM1, not facilitating works'],

  // Group 1 — substructure. NRM1 has one element (1.1) with sub-elements.
  '1.1':  ['1.1.1'],
  '1.2':  ['1.1.2'],
  '1.3':  ['1.1.3'],
  '1.4':  ['1.1.4'],

  // Group 2 — superstructure. The closest alignment in the whole catalogue.
  '2.1':  ['2.1'],
  '2.2':  ['2.2'],
  '2.3':  ['2.3'],
  '2.4':  ['2.4'],
  '2.5':  ['2.5'],
  '2.6':  ['2.6'],
  '2.7':  ['2.7'],
  '2.8':  ['2.8'],
  '2.9':  ['1.1.5', 'Basement tanking sits in substructure in NRM1'],

  // Group 3 — internal finishes. Exact.
  '3.1':  ['3.1'],
  '3.2':  ['3.2'],
  '3.3':  ['3.3'],

  // Group 4 — fittings, furnishings and equipment. NRM1 has ONE element (4.1)
  // with six sub-elements, so our 35 rows all land in 4.1.x — except the ones
  // NRM1 classes as services or superstructure.
  '4.1':      ['4.1.1'],
  '4.2-RES':  ['5.1', 'Sanitary appliances are a services element in NRM1, not fittings'],
  '4.2-COM':  ['5.1', 'Sanitary appliances are a services element in NRM1, not fittings'],
  '4.2-HG':   ['5.1', 'Sanitary appliances are a services element in NRM1, not fittings'],
  '4.2-HP':   ['5.1', 'Sanitary appliances are a services element in NRM1, not fittings'],
  '4.2-HC':   ['5.1', 'Sanitary appliances are a services element in NRM1, not fittings'],
  '4.3':      ['4.1.2'],
  '4.4':      ['4.1.3'],
  '4.5':      ['4.1.4'],
  '4.6':      ['4.1.1'],
  '4.7':      ['4.1.1'],
  '4.8':      ['4.1.1'],
  '4.9':      ['4.1.2'],
  '4.10':     ['4.1.3'],
  '4.11':     ['5.7', 'An extract canopy is a ventilation system in NRM1; only the hood itself is equipment'],
  '4.12':     ['4.1.3'],
  '4.13':     ['4.1.3'],
  '4.14':     ['4.1.3'],
  '4.15':     ['2.6', 'Roller shutters and sectional overhead doors are external doors in NRM1'],
  '4.16':     ['4.1.3'],
  '4.17':     ['4.1.3'],
  '4.18':     ['5.13', 'Medical gas pipeline is a specialist services installation in NRM1'],
  '4.19':     ['4.1.3'],
  '4.20':     ['4.1.3'],
  '4.21':     ['4.1.3'],
  '4.22':     ['5.12', 'AV and presentation systems are communication systems in NRM1'],
  '4.24':     ['4.1.3'],
  '4.25':     ['4.1.3'],
  '4.26':     ['4.1.3'],
  '4.27':     ['5.12', 'Electronic article surveillance is a security system in NRM1'],
  '4.28':     ['4.1.3'],
  '4.29':     ['4.1.3'],
  '4.30':     ['4.1.3'],
  '4.31-NR':  ['2.7', 'WC cubicle partitions are internal partitions in NRM1'],
  '4.32-HOH': ['4.1.1'],

  // Group 5 — services. The largest divergence: NRM1 has 14 fixed elements and
  // almost none of our numbers land on the same one.
  '5.1':     ['5.4', 'Sanitary plumbing is water installations; above-ground drainage is 5.3'],
  '5.1b':    ['5.4'],
  '5.2':     ['5.5'],
  '5.2L':    ['5.5'],
  '5.3':     ['5.7'],
  '5.4':     ['5.6'],
  '5.5':     ['5.9'],
  '5.6':     ['5.11'],
  '5.7':     ['5.8'],
  '5.7a':    ['5.8'],
  '5.8':     ['5.8'],
  '5.8a':    ['5.8'],
  '5.8b':    ['5.8'],
  '5.8c':    ['5.8'],
  '5.9a':    ['5.12', 'Fire detection and alarm is a control system in NRM1; 5.11 is fire fighting and lightning'],
  '5.9b':    ['5.8'],
  '5.10':    ['5.8'],
  '5.11':    ['5.13'],
  '5.12':    ['5.13'],
  '5.13':    ['8.7', 'An incoming DNO connection is an external service in NRM1'],
  '5.14':    ['5.12'],
  '5.15':    ['5.13'],
  '5.16':    ['5.12'],
  '5.18':    ['5.12'],
  '5.19':    ['5.10'],
  '5.20':    ['5.14'],
  '5.21':    ['5.13'],
  '5.23':    ['5.3'],
  '5.24':    ['5.7'],
  '5.25':    ['5.8'],
  '5.26':    ['5.8'],
  '5.27':    ['5.12'],
  '5.29':    ['5.6'],
  '5.30-NR': ['5.1', 'Hand dryers are sanitary installations in NRM1'],

  // Group 6 — prefabricated. NRM1 has a single element.
  '6.1': ['6.1'],
  '6.2': ['6.1'],
  '6.3': ['6.1'],
  '6.4': ['6.1'],

  // Group 7 — work to existing buildings.
  '7.1': ['7.6'],
  '7.2': ['7.6'],
  '7.3': ['7.3'],
  '7.4': ['7.2'],
  '7.5': ['7.1'],

  // Group 8 — external works.
  '8.1':  ['8.1'],
  '8.2':  ['8.2'],
  '8.3':  ['8.2'],
  '8.4':  ['8.6'],
  '8.5':  ['8.6'],
  '8.6':  ['8.7'],
  '8.7':  ['8.3'],
  '8.8':  ['8.4'],
  '8.9':  ['8.7'],
  '8.10': ['8.2'],
  '8.11': ['8.8'],
  '8.12': ['8.8'],
  '8.13': ['2.3', 'A green roof or roof terrace forms part of the building roof in NRM1'],
}

// ── Read the workbook and emit ───────────────────────────────────────────────
const res = await fetch(process.env.RATES_FILE_URL)
if (!res.ok) throw new Error(`RATES_FILE_URL returned ${res.status}`)
const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: 'buffer' })
const rows = XLSX.utils.sheet_to_json(wb.Sheets['2. Master Cost Table'], { header: 1, defval: '' }).slice(4)

const out = [[
  'Code (col A)', 'Our group', 'Element / description',
  'NRM1 Ref — paste into col B', 'NRM1 element name', 'Group differs', 'Why',
]]
const missing = []
const unusedNrm1 = new Set(Object.keys(NRM1))
let differs = 0

for (const r of rows) {
  const code = String(r[0] || '').trim()
  if (!code || !r[6]) continue            // banner rows have no pricing type
  const entry = MAP[code]
  if (!entry) { missing.push(code); continue }
  const [ref, why = ''] = entry
  const name = NRM1[ref]
  if (!name) throw new Error(`Row ${code} maps to "${ref}", which is not an NRM1 element`)
  unusedNrm1.delete(ref)
  const ourGroup = String(r[2] ?? '').trim()
  const nrmGroup = ref.split('.')[0]
  const groupDiffers = ourGroup !== nrmGroup
  if (groupDiffers) differs++
  out.push([code, ourGroup, r[4], ref, name, groupDiffers ? 'YES' : '', why])
}

if (missing.length) {
  console.error(`\n${missing.length} workbook row(s) have no NRM1 mapping — add them to MAP:`)
  missing.forEach(c => console.error('   ', c))
  process.exit(1)
}

const ws = XLSX.utils.aoa_to_sheet(out)
ws['!cols'] = [14, 10, 52, 26, 46, 14, 78].map(wch => ({ wch }))
ws['!freeze'] = { xSplit: 0, ySplit: 1 }
const book = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(book, ws, 'NRM1 reference')

const dest = path.join(process.cwd(), 'docs', 'nrm1-reference-map.xlsx')
fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.writeFileSync(dest, XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }))

console.log(`Wrote ${dest}`)
console.log(`  ${out.length - 1} rows mapped, 0 unmapped`)
console.log(`  ${differs} rows where our group and NRM1's group disagree`)
console.log(`  NRM1 elements not used by any row: ${[...unusedNrm1].sort().join(', ') || '(none)'}`)
