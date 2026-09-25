// Files every downloaded report PDF into Downloads/Agent test by matching the
// download name (the app names it after the project title) to each scenario,
// copies the scenario beside it and rewrites Agent test/index.md.
//   node test-reports/_reference/file-all.mjs
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const ROOT = path.resolve(HERE, '..')
const DL = path.join(os.homedir(), 'Downloads'), OUT = path.join(DL, 'Agent test')
fs.mkdirSync(OUT, { recursive: true })
const ids = JSON.parse(fs.readFileSync(path.join(ROOT, 'report-ids.json'), 'utf8'))
const rows = []
for (const [id, reportId] of Object.entries(ids)) {
  const plan = JSON.parse(fs.readFileSync(path.join(ROOT, id, 'plan.json'), 'utf8'))
  const title = plan.sections[1].find(s => s.q === 'Q1.0').value
  const base = `${title.replace(/[^a-z0-9 _-]/gi, '_')}_Stage1_Report`
  const found = fs.readdirSync(DL).filter(f => f === `${base}.pdf` || (f.startsWith(`${base} (`) && f.endsWith(').pdf')))
    .map(f => ({ f, t: fs.statSync(path.join(DL, f)).mtimeMs })).sort((a, b) => b.t - a.t)
  const dest = path.join(OUT, `${id} - report.pdf`)
  if (found.length) { fs.renameSync(path.join(DL, found[0].f), dest); for (const x of found.slice(1)) fs.unlinkSync(path.join(DL, x.f)) }
  fs.copyFileSync(path.join(ROOT, id, 'scenario.md'), path.join(OUT, `${id} - scenario.md`))
  const have = fs.existsSync(dest)
  rows.push(`| ${id} | ${plan.projectType} | ${have ? `[PDF](${encodeURI(`${id} - report.pdf`)})` : 'missing'} | [answers](${encodeURI(`${id} - scenario.md`)}) | https://estates-ai-tool.vercel.app/report/${reportId} |`)
  console.log(`${have ? '✓' : '✗'} ${id}`)
}
fs.writeFileSync(path.join(OUT, 'index.md'), `# Agent test reports\n\n| Scenario | Project type | Report | Answers | Live report |\n|---|---|---|---|---|\n${rows.sort().join('\n')}\n`)
