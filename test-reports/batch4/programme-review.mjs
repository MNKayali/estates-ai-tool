// Programme review (11 Oct 2026): construction and whole-programme weeks for the
// owner's real projects and the 30 batch-4 scenarios, on whichever Programme
// workbook PROGRAMME_FILE_URL points at. Prints JSON.
//   PROGRAMME_FILE_URL=<file> node --import ./test-reports/_reference/alias.mjs test-reports/batch4/programme-review.mjs
import fs from 'node:fs'
process.env.RATES_FILE_URL ||= 'NRM1_Cost_Estimate_Tool_v5_2.xlsx'
process.env.PROGRAMME_FILE_URL ||= 'Estates_AI_Programme_v4_3.xlsx'
process.env.PROCUREMENT_FILE_URL ||= 'Projento_Procurement_Reference.xlsx'
const { calculateProgramme } = await import('../../lib/programmeCalculator.js')
const { runDeterministicPipeline } = await import('../../lib/pipeline.js')

const BASE = {
  q1_0_projectName: 'Real project', q1_1_postcode: 'CV4', q1_2_storeys: '3', q1_3_buildingUse: 'Education',
  q1_4_buildingAge: '1900–1979', q3_3_surveys: ['Condition'], q3_4_planningConsents: 'No consent required',
  q3_5_accessConstraints: [], q3_6_occupation: 'Vacant or decanted', q4_5_designStage: 'Technical complete (Stage 4)',
  q4_6_phasing: 'Single phase', q4_7_funding: 'Internal / commercial', q4_0_startDate: '2027-01-11',
}
const scope = (tokens, me, level = 'Full systems replacement') => ({ ids: [], codes: [], tokens, meItemCount: me, interventionLevel: level })
const ME = ['heating and hot water', 'water and drainage', 'ventilation', 'power', 'lighting', 'fire alarm', 'data and it']
// Construction weeks on site from the owner's prelims and contractors' programmes (Programme v4.5 evidence).
const REAL = [
  { id: 'Riley Court (refurb, vacant)', actual: '42 (36 + 6 strip-out)', a: { q1_2_projectType: 'Refurbishment', q1_5_size: '3850' }, s: scope(['strip-out', ...ME], 7) },
  { id: 'Lakeside (refurb, occupied, 6 sections)', actual: '45', a: { q1_2_projectType: 'Refurbishment', q1_3_buildingUse: 'Residential', q1_5_size: '3306', q3_6_occupation: 'Partially occupied', q4_6_phasing: 'Multiple phases', q4_6a_phaseCount: 6, q4_6b_phaseGapWeeks: 1 }, s: scope(['kitchens', 'bathrooms and en-suites', ...ME], 7) },
  { id: 'Claycroft (refurb, occupied, 3 blocks)', actual: '74 planned (≈95 forecast)', a: { q1_2_projectType: 'Refurbishment', q1_3_buildingUse: 'Student accommodation (PBSA / halls)', q1_5_size: '17172', q3_6_occupation: 'Fully occupied', q4_6_phasing: 'Multiple phases', q4_6a_phaseCount: 3, q4_6b_phaseGapWeeks: 2 }, s: scope(['bathrooms and en-suites', 'roof', ...ME], 7) },
  { id: 'Whitefields (demolition)', actual: '≈14 demolition, 18 on site', a: { q1_2_projectType: 'Demolition only', q1_5_size: '3740' }, s: scope(['demolition of existing building', 'asbestos removal'], 0, null) },
  { id: 'Co-op (retail fit-out, 885 m²)', actual: '7', a: { q1_2_projectType: 'Fit-out', q1_3_buildingUse: 'Retail', q1_5_size: '885' }, s: scope(['floor finishes', 'lighting', 'power', 'retail'], 3, 'Finishes with minor services') },
  { id: 'Scarman toilets (71 m²)', actual: '5 (window)', a: { q1_2_projectType: 'Refurbishment', q1_5_size: '71' }, s: scope(['toilets', 'water and drainage', 'ventilation', 'lighting'], 3) },
  { id: 'IBRB café servery (≈100 m²)', actual: '≈3', a: { q1_2_projectType: 'Fit-out', q1_3_buildingUse: 'Hospitality / leisure', q1_5_size: '100' }, s: scope(['catering kitchen', 'fixed joinery'], 1, 'Finishes with minor services') },
]
const out = { real: [], scenarios: {} }
for (const p of REAL) {
  const r = await calculateProgramme({ ...BASE, ...p.a }, 3_000_000, { scope: p.s })
  out.real.push({ id: p.id, actual: p.actual, construction: r.constructionWeeks, handover: r.handoverWeeks })
}
const all = JSON.parse(fs.readFileSync('test-reports/batch4/answers.json', 'utf8'))
for (const [id, a] of Object.entries(all)) {
  const { programme: p } = await runDeterministicPipeline(a)
  out.scenarios[id] = { total: p.totalWeeks, construction: p.constructionWeeks }
}
console.log(JSON.stringify(out))
