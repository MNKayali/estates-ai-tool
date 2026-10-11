// Builds test-reports/batch4/Programme_duration_review.xlsx: every Programme
// duration row (Programme v4.9) with the proposed change and its basis, the
// owner's real projects (now vs proposed vs actual) and the 30 scenarios.
//   node test-reports/batch4/programme-review-sheet.mjs <rev-now.json> <rev-new.json>
import fs from 'node:fs'
import XLSX from 'xlsx'
const [now, nu] = process.argv.slice(2).map(f => JSON.parse(fs.readFileSync(f, 'utf8')))
const revised = JSON.parse(fs.readFileSync('test-reports/batch4/revised.json', 'utf8'))
const EV = 'Your projects', JD = 'Industry norm (my judgement)'

const rows = [
  // Design
  ['Design', 'DS2 / DS3 / DS4 Stage 2, 3, 4', 'all', 'S4 6–8 each, S5 8–12, S6 10–14', 'No change', JD, 'In line with RIBA practice for public-sector projects (Stages 2–4 ≈ 6–8 months at 500–1,500 m², 9–12 months above 3,000 m²). The excess came from the uplifts below.'],
  ['Design', 'DS3a Stage 3 uplift "M&E heavy"', 'S1–S6', '1 / 2 / 2 / 2 / 3 / 3', '1 week every band', JD, 'Fires on almost every project (any scope with 4+ services items), so it added 2–3 weeks to nearly every report. The base durations already allow for normal services design.'],
  ['Design', 'DS4a Stage 4 uplift "M&E / specialist"', 'S1–S6', '1 / 2 / 2 / 3 / 4 / 4', '1 up to 500 m², 2 above', JD, 'Same reason: added up to 4 weeks to almost every report.'],
  ['Design', 'DS3b specialist (labs, clinical)', 'S1–S6', '1–3', 'No change', JD, 'Genuine extra design for labs / clinical rooms; now only fires on real lab scope (slab bug fixed).'],
  ['Design', 'DS2a structural, DS2b listed', 'S1–S6', '1–4', 'No change', JD, 'Reasonable allowances, only when triggered.'],
  ['Design', 'GW / GW3 client gateways', 'S1–S6', '1 up to 1,500 m², 2 above (v4.8)', 'No change', JD, 'Already shortened in v4.8.'],
  // Consents
  ['Consents', 'PL1 Full planning', 'S1–S4', '8–13 (uses 11)', '8–10 (uses 9)', JD, 'Minor applications (under 1,000 m² / 10 homes) have an 8-week statutory period.'],
  ['Consents', 'PL1 Full planning', 'S5–S6', '8–13 (uses 11)', '10–13 (uses 12)', JD, 'Major applications have a 13-week statutory period.'],
  ['Consents', 'PL2 Listed building consent', 'S1–S4', '8–13', '8–10', JD, 'Same 8-week statutory period for minor works.'],
  ['Consents', 'PL4 Change of use', 'S1–S4 / S5–S6', '8–13', '8–10 / 10–13', JD, 'As full planning.'],
  ['Consents', 'PL3 Prior approval, PL5 pre-app, BC1/BC2, BS1 Gateway 2', 'all', 'as now', 'No change', JD, 'Statutory periods. BC runs alongside Stage 4. Gateway 2 (12–24) is if anything optimistic today.'],
  // Tender
  ['Tender', 'TN1 Formal tender', 'S1 / S2 / S3', '6–8 / 8–10 / 8–10', '4–6 / 5–7 / 6–8', JD, 'Small jobs: 2 weeks to issue, 3–4 weeks to return, 1–2 to award.'],
  ['Tender', 'TN1 Formal tender', 'S4–S6', '8–10 / 10–12 / 10–12', 'No change', EV, 'Lakeside (3,306 m²): 13 weeks tender to award incl. client approval.'],
  ['Tender', 'TN2 quotations, TN3 framework, TN4 negotiated', 'all', '2–6', 'No change', JD, 'Already short.'],
  // Construction
  ['Construction', 'CR1 Refurb — M&E replacement', 'S1–S7', 'S6 32–50, S7 50–70', 'No change', EV, 'Riley Court 3,850 m² vacant: 42 weeks actual → model 41. Claycroft 17,172 m²: 74 planned.'],
  ['Construction', 'CD1 Demolition', 'all', 'S6 10–18', 'No change', EV, 'Whitefields 3,740 m²: about 14 weeks demolition → model 14.'],
  ['Construction', 'CF2 Fit-out basic / Cat A', 'S1–S4', 'as v4.5', 'No change', EV, 'Co-op 885 m²: 7 weeks → model 8. IBRB café: about 3 → model 3.'],
  ['Construction', 'CF2 Fit-out basic / Cat A', 'S5 / S6', '16–26 / 24–38', '12–18 / 18–28', JD, 'Big jump from S4 (6–9). A 2,000 m² Cat A floor plate is typically 12–18 weeks.'],
  ['Construction', 'CF1 Fit-out Cat B / high spec', 'S5 / S6', '20–32 / 30–46', '16–24 / 24–36', JD, 'Cat B at 1,500–3,000 m² typically 16–24 weeks.'],
  ['Construction', 'CN1 New build standard', 'S5', '44–64 (uses 54)', '40–56 (uses 48)', JD, 'A 2,000–3,000 m² two/three-storey building is typically 40–56 weeks.'],
  ['Construction', 'CN2 New build healthcare', 'S3 / S4 / S5 / S6', '32–48 / 44–64 / 60–84 / 80–110', '26–38 / 36–52 / 50–70 / 70–95', JD, 'A 900 m² GP surgery is typically 40–48 weeks; the old rows gave 54.'],
  ['Construction', 'CE1 External works', 'S5 / S6', '10–16 / 14–22', '8–12 / 10–16', JD, 'Car parks and yards of 3,000–5,000 m² are typically 10–14 weeks.'],
  ['Construction', 'CN3 industrial, CX1/CX2 extension, CR2 envelope, CS1 specialist', 'all', 'as v4.8', 'No change', JD, 'Set in v4.8; no project evidence to move them further.'],
  ['Construction', 'CH1 Handover', 'all', '0–3', 'No change', EV, '2 weeks on Lakeside, Riley Court and Whitefields.'],
  // Modifiers
  ['Uplift', 'OCC-1 Fully occupied', 'all', '+30%', '+15%', EV, 'Lakeside (occupied, six sections) ran about 10% slower than vacant Riley Court; Claycroft with +15% gives 73 weeks against 74 planned (82 at +30%).'],
  ['Uplift', 'OCC-2 Partly occupied', 'all', '+20%', '+10%', EV, 'Same evidence (Lakeside model 55 → 51 against 45 actual).'],
  ['Uplift', 'PROG-FLOAT', 'all', '+1 wk per 26 (v4.8)', 'No change', JD, 'Already halved in v4.8.'],
]
const proposed = rows.map(([Area, Row, Bands, Now, Proposed, Basis, Why]) => ({ Area, Row, Bands, 'Now (weeks)': Now, 'Proposed (weeks)': Proposed, Basis, Why }))
const real = now.real.map((r, i) => ({ Project: r.id, 'Actual weeks on site': r.actual, 'Projento now': r.construction, 'Projento proposed': nu.real[i].construction }))
const scen = Object.keys(now.scenarios).map(id => {
  const e = revised[id], mid = (e.pLo + e.pHi) / 2
  return { ID: id, 'My estimate (whole programme)': `${e.pLo}–${e.pHi}`, 'Projento now': now.scenarios[id].total, 'Projento proposed': nu.scenarios[id].total,
    'Proposed vs my mid': `${Math.round((nu.scenarios[id].total / mid - 1) * 100)}%`, 'Construction now': now.scenarios[id].construction, 'Construction proposed': nu.scenarios[id].construction }
})
const wb = XLSX.utils.book_new()
const add = (data, name, widths) => { const ws = XLSX.utils.json_to_sheet(data); ws['!cols'] = widths.map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, name) }
add(proposed, 'Proposed changes', [13, 44, 16, 30, 28, 26, 90])
add(real, 'Your projects', [42, 26, 14, 18])
add(scen, '30 scenarios', [8, 26, 14, 18, 18, 18, 22])
fs.writeFileSync('test-reports/batch4/Programme_duration_review.xlsx', XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
console.log('written')
