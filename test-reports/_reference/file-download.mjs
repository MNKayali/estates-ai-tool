// Moves the newest "*_Stage1_Report.pdf" from Downloads into
// Downloads/Agent test as "<id> - report.pdf", copies the scenario beside it,
// and appends a line to Agent test/index.md.
//   node test-reports/_reference/file-download.mjs FO-1-offices <reportId>
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
const [id, reportId] = process.argv.slice(2)
const DL = path.join(os.homedir(), 'Downloads'), OUT = path.join(DL, 'Agent test')
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
fs.mkdirSync(OUT, { recursive: true })
const newest = fs.readdirSync(DL).filter(f => /_Stage1_Report( \(\d+\))?\.pdf$/.test(f))
  .map(f => ({ f, t: fs.statSync(path.join(DL, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0]
if (!newest || Date.now() - newest.t > 10 * 60 * 1000) { console.error('no recent report PDF in Downloads'); process.exit(1) }
fs.renameSync(path.join(DL, newest.f), path.join(OUT, `${id} - report.pdf`))
fs.copyFileSync(path.join(HERE, '..', id, 'scenario.md'), path.join(OUT, `${id} - scenario.md`))
const idx = path.join(OUT, 'index.md')
if (!fs.existsSync(idx)) fs.writeFileSync(idx, '# Agent test reports\n\n| Scenario | Report PDF | Scenario | Live report |\n|---|---|---|---|\n')
fs.appendFileSync(idx, `| ${id} | [PDF](${encodeURI(`${id} - report.pdf`)}) | [answers](${encodeURI(`${id} - scenario.md`)}) | https://estates-ai-tool.vercel.app/report/${reportId} |\n`)
console.log(`filed ${newest.f} → ${id} - report.pdf (${Math.round(fs.statSync(path.join(OUT, `${id} - report.pdf`)).size / 1024)} KB)`)
