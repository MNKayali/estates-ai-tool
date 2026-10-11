// Builds test-reports/batch4/batch4-input-vs-output.xlsx from scenarios.mjs
// (input + my estimate), live.json (what Projento produced) and changes.json
// (what needs changing, written after reading the results).
//   node test-reports/batch4/table.mjs
import fs from 'node:fs'
import XLSX from 'xlsx'
const { SCENARIOS } = await import('./scenarios.mjs')
const DIR = 'test-reports/batch4'
const live = JSON.parse(fs.readFileSync(`${DIR}/live.json`, 'utf8'))
const revised = JSON.parse(fs.readFileSync(`${DIR}/revised.json`, 'utf8'))
const changes = fs.existsSync(`${DIR}/changes.json`) ? JSON.parse(fs.readFileSync(`${DIR}/changes.json`, 'utf8')) : {}
const k = n => n == null ? '' : `£${Math.round(n / 1000).toLocaleString('en-GB')}k`
const rng = (a, b) => `${k(a)}–${k(b)}`
const pct = (v, lo, hi) => { const mid = (lo + hi) / 2; return v ? Math.round((v / mid - 1) * 100) : '' }

const rows = SCENARIOS.map(s => {
  const a = s.answers, L = live[s.id] || {}, e = { ...s.est, ...revised[s.id] }
  return {
    'ID': s.id, 'Building use': s.use, 'Project type': s.type, 'Postcode': a.q1_1_postcode,
    'GIFA m²': Number(a.q1_5_size), 'Storeys': a.q1_2_storeys || '', 'Spec / level': [a.q2_4_specLevel, a.q2_3_interventionLevel].filter(Boolean).join(' / '),
    'Scope (objective)': a.q2_1_objective,
    'Budget': a.q4_3_budget ? k(a.q4_3_budget) : '—',
    'My construction': rng(e.cLo, e.cHi), 'Projento construction (mid)': k(L.constructionMid), 'Diff % vs my mid': pct(L.constructionMid, e.cLo, e.cHi),
    'My total': rng(e.tLo, e.tHi), 'Projento total': L.total ? rng(L.total[0], L.total[2]) : '', 'Total diff % (mid)': L.total ? pct(L.total[1], e.tLo, e.tHi) : '',
    'My construction weeks': `${e.wLo}–${e.wHi}`, 'Projento construction weeks': L.constructionWeeks ?? '',
    'My programme weeks': `${e.pLo}–${e.pHi}`, 'Projento programme weeks': L.totalWeeks ?? '', 'Programme diff % (mid)': pct(L.totalWeeks, e.pLo, e.pHi),
    'Confidence': L.grade || '', 'Budget verdict': L.budget || '', 'Risk level': L.riskLevel || '', 'Procurement (preferred)': L.procurement || '',
    'Report status': L.status || 'not run', 'Report link': L.reportId ? `https://www.projento.co.uk/report/${L.reportId}` : '',
    'What needs changing': changes[s.id] || '',
  }
})
const ws = XLSX.utils.json_to_sheet(rows)
ws['!cols'] = Object.keys(rows[0]).map(h => ({ wch: /Scope|changing/.test(h) ? 60 : /link/.test(h) ? 45 : Math.max(10, Math.min(24, h.length + 2)) }))
ws['!autofilter'] = { ref: ws['!ref'] }
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'Input vs output')
const causes = JSON.parse(fs.readFileSync(`${DIR}/causes.json`, 'utf8'))
const cs = XLSX.utils.json_to_sheet(causes); cs['!cols'] = [{ wch: 34 }, { wch: 70 }, { wch: 60 }]
XLSX.utils.book_append_sheet(wb, cs, 'Why programmes are long')
fs.writeFileSync(`${DIR}/batch4-input-vs-output.xlsx`, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }))
console.log('written', rows.length)
