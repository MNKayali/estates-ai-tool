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
import { CODE_TO_NRM1, NRM1 } from './nrm1-elements.mjs'

const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim()
  }
}

// The element list and the mapping live in scripts/nrm1-elements.mjs so that
// this generator and build-scope-relevance-sheet.mjs cannot drift apart.
const MAP = CODE_TO_NRM1


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
