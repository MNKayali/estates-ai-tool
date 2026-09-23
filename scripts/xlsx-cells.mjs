/**
 * scripts/xlsx-cells.mjs — read, edit and verify single cells in a workbook
 * WITHOUT a SheetJS round-trip.
 *
 * Why: re-writing an .xlsx through SheetJS loses cell styles, drop-down
 * validation, comments and formatting, and leaves formula caches stale. This
 * edits the sheet XML inside the zip directly — only the named <c> element is
 * replaced; every other byte of every other part is left as it was. It is how
 * workbook v5.3 was produced from v5.2 (see CLAUDE.md, "Current state").
 *
 *   node scripts/xlsx-cells.mjs show <file.xlsx> "<sheet name>!A1" ...
 *   node scripts/xlsx-cells.mjs set  <file.xlsx> "<sheet name>!AA101" <expected> <new> [--number]
 *   node scripts/xlsx-cells.mjs diff <before.xlsx> <after.xlsx>
 *
 * `set` refuses to run unless the cell currently holds <expected> (use "" for
 * an empty cell that exists), refuses formula cells, keeps the cell's style,
 * adds new strings to sharedStrings.xml, and sets fullCalcOnLoad so Excel
 * recalculates on next open. Always run `diff` afterwards and load the file
 * through the app (npm test) before committing — the app rejects a workbook
 * whose self-checks aren't 0.
 *
 * Appending or inserting ROWS is not covered here; do it with a one-off script
 * that clones an existing row's <row>/<c> attributes (styles) and updates the
 * sheet's <dimension>. Nothing may reference rows you shift.
 */
import fs from 'node:fs'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'

const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const encode = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function open(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file))
  const wbXml = await zip.file('xl/workbook.xml').async('string')
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string')
  const sheets = {}
  for (const m of wbXml.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const target = rels.match(new RegExp(`Id="${m[2]}"[^>]*Target="([^"]+)"`))?.[1]
      || rels.match(new RegExp(`Target="([^"]+)"[^>]*Id="${m[2]}"`))?.[1]
    sheets[decode(m[1])] = 'xl/' + target.replace(/^\/?xl\//, '')
  }
  const ss = await zip.file('xl/sharedStrings.xml').async('string')
  const strings = [...ss.matchAll(/<si>([^]*?)<\/si>/g)].map(m => decode(m[1].replace(/<[^>]+>/g, '')))
  return { zip, sheets, ss, strings, parts: {} }
}

async function sheetXml(wb, name) {
  const part = wb.sheets[name]
  if (!part) throw new Error(`no sheet "${name}" (have: ${Object.keys(wb.sheets).join(', ')})`)
  if (!wb.parts[part]) wb.parts[part] = await wb.zip.file(part).async('string')
  return part
}

function parseTarget(t) {
  const i = t.lastIndexOf('!')
  if (i < 0) throw new Error(`use "<sheet name>!<cell>", got "${t}"`)
  return { sheet: t.slice(0, i).replace(/^'|'$/g, ''), ref: t.slice(i + 1).toUpperCase() }
}

function findCell(xml, ref) {
  const m = xml.match(new RegExp(`<c r="${ref}"(?: [^>]*?)?(?:/>|>[^]*?</c>)`))
  if (!m) return null
  const c = m[0]
  return {
    xml: c,
    t: c.match(/ t="([^"]+)"/)?.[1],
    s: c.match(/ s="(\d+)"/)?.[1],
    f: c.match(/<f[^>]*>([^<]*)<\/f>/)?.[1],
    v: c.match(/<v>([^<]*)<\/v>/)?.[1],
  }
}
const valueOf = (wb, c) => (c.t === 's' ? wb.strings[Number(c.v)] : (c.v ?? ''))

async function show(file, targets) {
  const wb = await open(file)
  for (const t of targets) {
    const { sheet, ref } = parseTarget(t)
    const c = findCell(wb.parts[await sheetXml(wb, sheet)], ref)
    console.log(`${t}: ${c ? `${JSON.stringify(valueOf(wb, c))}${c.f ? `  (formula =${decode(c.f)})` : ''}  [style ${c.s ?? '-'}]` : '(no cell element)'}`)
  }
}

async function set(file, target, expected, next, asNumber) {
  const wb = await open(file)
  const { sheet, ref } = parseTarget(target)
  const part = await sheetXml(wb, sheet)
  const c = findCell(wb.parts[part], ref)
  if (!c) throw new Error(`${target}: no cell element to edit`)
  if (c.f) throw new Error(`${target}: is a formula cell — edit the inputs, not the formula result`)
  const current = String(valueOf(wb, c))
  if (current !== String(expected)) throw new Error(`${target} holds ${JSON.stringify(current)}, not the expected ${JSON.stringify(expected)} — nothing written`)
  const style = c.s ? ` s="${c.s}"` : ''
  let cell
  if (asNumber) {
    if (!Number.isFinite(Number(next))) throw new Error(`--number given but "${next}" is not a number`)
    cell = `<c r="${ref}"${style} t="n"><v>${Number(next)}</v></c>`
  } else {
    let i = wb.strings.indexOf(next)
    if (i < 0) {
      wb.strings.push(next)
      i = wb.strings.length - 1
      wb.ss = wb.ss.replace('</sst>', `<si><t xml:space="preserve">${encode(next)}</t></si></sst>`)
        .replace(/uniqueCount="\d+"/, `uniqueCount="${wb.strings.length}"`)
    }
    if (c.t !== 's') wb.ss = wb.ss.replace(/ count="(\d+)"/, (_, n) => ` count="${Number(n) + 1}"`)
    cell = `<c r="${ref}"${style} t="s"><v>${i}</v></c>`
  }
  wb.zip.file(part, wb.parts[part].replace(c.xml, cell))
  wb.zip.file('xl/sharedStrings.xml', wb.ss)
  let wbXml = await wb.zip.file('xl/workbook.xml').async('string')
  if (!/fullCalcOnLoad/.test(wbXml)) wb.zip.file('xl/workbook.xml', wbXml.replace('<calcPr ', '<calcPr fullCalcOnLoad="1" '))
  fs.writeFileSync(file, await wb.zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } }))
  console.log(`${target}: ${JSON.stringify(current)} → ${JSON.stringify(asNumber ? Number(next) : next)}`)
}

async function diff(before, after) {
  const read = f => XLSX.read(new Uint8Array(fs.readFileSync(f)), { type: 'array', cellFormula: true })
  const a = read(before), b = read(after)
  for (const name of new Set([...a.SheetNames, ...b.SheetNames])) {
    const A = a.Sheets[name] || {}, B = b.Sheets[name] || {}
    const refs = new Set([...Object.keys(A), ...Object.keys(B)].filter(k => k[0] !== '!'))
    const show = c => (c ? `${c.v ?? ''}${c.f ? ` =${c.f}` : ''}` : '(none)')
    const diffs = [...refs].filter(r => show(A[r]) !== show(B[r]))
      .sort((p, q) => p.localeCompare(q, undefined, { numeric: true }))
    const lostCache = Object.keys(B).filter(k => B[k]?.f && (B[k].v === undefined || B[k].v === '')).length
    console.log(`${name}: ${diffs.length} cell(s) differ; formula cells without a value: ${lostCache}`)
    for (const r of diffs) console.log(`  ${r}: ${JSON.stringify(show(A[r])).slice(0, 80)} → ${JSON.stringify(show(B[r])).slice(0, 80)}`)
  }
  const za = await JSZip.loadAsync(fs.readFileSync(before)), zb = await JSZip.loadAsync(fs.readFileSync(after))
  for (const n of Object.keys(za.files).filter(n => !za.files[n].dir)) {
    const y = zb.file(n)
    if (!y) { console.log(`  part removed: ${n}`); continue }
    if ((await za.file(n).async('string')) !== (await y.async('string'))) console.log(`  part changed: ${n}`)
  }
}

const [cmd, ...args] = process.argv.slice(2)
try {
  if (cmd === 'show' && args.length >= 2) await show(args[0], args.slice(1))
  else if (cmd === 'set' && args.length >= 4) await set(args[0], args[1], args[2], args[3], args.includes('--number'))
  else if (cmd === 'diff' && args.length === 2) await diff(args[0], args[1])
  else {
    console.log('usage:\n  node scripts/xlsx-cells.mjs show <file.xlsx> "<sheet>!A1" ...\n  node scripts/xlsx-cells.mjs set  <file.xlsx> "<sheet>!A1" <expected> <new> [--number]\n  node scripts/xlsx-cells.mjs diff <before.xlsx> <after.xlsx>')
    process.exitCode = 1
  }
} catch (e) {
  console.error('error:', e.message)
  process.exitCode = 1
}
