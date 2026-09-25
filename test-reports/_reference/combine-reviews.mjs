// Merges every test-reports/<id>/review.md into one issues table:
//   Downloads/Agent test/Issues.md   (summary + all issues, High first)
//   Downloads/Agent test/Issues.xlsx (Issues, Expectations, Summary sheets)
//   node test-reports/_reference/combine-reviews.mjs [--batch 2]   (batch N = scenarios in report-ids-batchN.json)
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import * as XLSX from 'xlsx'

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const ROOT = path.resolve(HERE, '..')
const bi = process.argv.indexOf('--batch'), batch = bi > 0 ? process.argv[bi + 1] : '1'
const OUT = path.join(os.homedir(), 'Downloads', 'Agent test', ...(batch === '1' ? [] : [`Batch ${batch}`]))
const TYPES = { NB: 'New Build', EX: 'Extension', RF: 'Refurbishment', FO: 'Fit-out', EW: 'External works only', DM: 'Demolition only', OM: 'Other or mixed' }
const RANK = { High: 0, Medium: 1, Low: 2 }

const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim())
function tableAfter(md, heading) {
  const lines = md.split(/\r?\n/)
  const i = lines.findIndex(l => l.trim().toLowerCase().startsWith(heading.toLowerCase()))
  if (i < 0) return []
  const rows = []
  let started = false
  for (const l of lines.slice(i + 1)) {
    if (/^\s*\|/.test(l)) { started = true; rows.push(cells(l)) }
    else if (started && l.trim()) break
    else if (/^#/.test(l)) break
  }
  return rows.slice(2) // header + separator
}

const ids = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, batch === '1' ? 'report-ids.json' : `report-ids-batch${batch}.json`), 'utf8'))).sort()
const issues = [], expectations = [], summary = [], missing = []
for (const id of ids) {
  const f = path.join(ROOT, id, 'review.md')
  if (!fs.existsSync(f)) { missing.push(id); continue }
  const md = fs.readFileSync(f, 'utf8')
  const verdict = (md.match(/^Verdict:\s*(.*)$/m) || [])[1] || ''
  const type = TYPES[id.slice(0, 2)]
  const rows = tableAfter(md, '## Issues').filter(r => r.length >= 7 && RANK[r[1]] !== undefined)
  for (const r of rows) issues.push({ Scenario: id, 'Project type': type, Severity: r[1], Category: r[2], Page: r[3], 'Report says': r[4], 'Expected (scenario)': r[5], Issue: r[6] })
  for (const r of tableAfter(md, '## Expectations').filter(r => r.length >= 2)) expectations.push({ Scenario: id, Expectation: r[0], Result: r[1], Note: r[2] || '' })
  const n = s => rows.filter(r => r[1] === s).length
  summary.push({ Scenario: id, 'Project type': type, High: n('High'), Medium: n('Medium'), Low: n('Low'), Verdict: verdict })
}
issues.sort((a, b) => RANK[a.Severity] - RANK[b.Severity] || a.Scenario.localeCompare(b.Scenario))

// Recurring issues: same category across several scenarios usually means one root cause.
const byCat = {}
for (const i of issues) (byCat[i.Category] ||= new Set()).add(i.Scenario)

const esc = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
const mdTable = (rows, cols) => [`| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`, ...rows.map(r => `| ${cols.map(c => esc(r[c])).join(' | ')} |`)].join('\n')
const tot = s => issues.filter(i => i.Severity === s).length
const md = `# Test report review — issues

${summary.length} of ${ids.length} reports reviewed${missing.length ? ` (missing: ${missing.join(', ')})` : ''}. **${issues.length} issues**: ${tot('High')} High, ${tot('Medium')} Medium, ${tot('Low')} Low.

## Per report
${mdTable(summary, ['Scenario', 'Project type', 'High', 'Medium', 'Low', 'Verdict'])}

## Issues by category
${mdTable(Object.entries(byCat).sort((a, b) => b[1].size - a[1].size).map(([c, s]) => ({ Category: c, Issues: issues.filter(i => i.Category === c).length, Reports: s.size, Scenarios: [...s].join(', ') })), ['Category', 'Issues', 'Reports', 'Scenarios'])}

## All issues (High first)
${mdTable(issues, ['Scenario', 'Severity', 'Category', 'Page', 'Report says', 'Expected (scenario)', 'Issue'])}
`
fs.writeFileSync(path.join(OUT, 'Issues.md'), md)

const wb = XLSX.utils.book_new()
const sheet = (rows, widths) => { const ws = XLSX.utils.json_to_sheet(rows); ws['!cols'] = widths.map(w => ({ wch: w })); ws['!autofilter'] = { ref: ws['!ref'] }; return ws }
XLSX.utils.book_append_sheet(wb, sheet(issues, [18, 18, 9, 13, 6, 45, 45, 60]), 'Issues')
XLSX.utils.book_append_sheet(wb, sheet(summary, [18, 18, 6, 8, 6, 90]), 'Summary')
XLSX.utils.book_append_sheet(wb, sheet(expectations, [18, 70, 9, 70]), 'Expectations')
fs.writeFileSync(path.join(OUT, 'Issues.xlsx'), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
console.log(`${summary.length} reviews, ${issues.length} issues (${tot('High')} High / ${tot('Medium')} Medium / ${tot('Low')} Low)${missing.length ? '; missing ' + missing.join(', ') : ''}`)
