/**
 * scripts/make-sample.mjs — regenerate public/sample/report.json
 *
 * Posts a fixed, fictional project to a locally running dev server's
 * /api/generate-report and saves the response (minus the .docx payload) as
 * the public sample the /sample page renders. Run it whenever the report
 * structure changes so the sample keeps showing the current output.
 *
 * Needs the dev server running with sign-in open (scripts/dev-open.mjs sets AUTH_OPEN=1) and
 * no KV configured, so generate-report runs the whole pipeline inline and
 * returns the complete record in one response:
 *
 *   node scripts/make-sample.mjs [http://localhost:3000]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, '..', 'public', 'sample', 'report.json')
const base = process.argv[2] || 'http://localhost:3000'

// Fictional. Chosen to exercise most of the report: an occupied 1960s
// university teaching building, full systems replacement, restricted hours,
// a stated budget and an energy-saving ROI, a stated start date, a
// conservation-area context and no surveys yet.
export const SAMPLE_ANSWERS = {
  q1_0_projectName: 'Refurbishment — Hargreaves Teaching Block, Example University, Birmingham',
  q1_1_postcode: 'B15',
  q1_2_projectType: 'Refurbishment',
  q1_2_storeys: '3',
  q1_3_buildingUse: 'Education',
  q1_4_buildingAge: '1900–1979',
  q1_5_size: '1200',
  q2_1_objective: 'Refurbish a three-storey 1960s teaching block to provide modern flexible teaching and seminar space, replace the life-expired heating, ventilation and electrical services, upgrade fire safety, and improve the thermal performance of the building fabric to support the university net-zero plan.',
  // NRM1 v5.2 Scope IDs: the level-3 typical scope plus windows, fixed joinery,
  // toilets (the client's own counts) and data, with the heating drop-downs set
  // to an air source heat pump for the net-zero objective.
  q2_2_scopeItems: ['S-0001', 'S-0003', 'S-0017', 'S-0019', 'S-0020', 'S-0021', 'S-0022', 'S-0023', 'S-0024', 'S-0028',
    'S-0039', 'S-0040', 'S-0041', 'S-0045', 'S-0046', 'S-0047', 'S-0049', 'S-0052'],
  q2_2_scopeOptions: { 'S-0039': ['S-0039-02'], 'S-0024': ['S-0024-01', 'S-0024-04'] },
  q2_2_quantities: { 'S-0024-01': '18', 'S-0024-04': '3' },
  q2_3_interventionLevel: 'Full systems replacement',
  q2_4_specLevel: 'Standard',
  q2_5_standards: 'BREEAM, Net zero, University design guide',
  q3_1_knownIssues: ['Ageing or inadequate M&E', 'Asbestos known or suspected'],
  q3_2_previousWorks: 'Roof recovered in 2011. Windows replaced on the south elevation in 2016; north elevation original. No services replacement since original construction.',
  q3_3_surveys: ['Asbestos management survey', 'Condition'],
  q3_4_planningConsents: 'No consent required',
  q3_5_accessConstraints: ['Restricted working hours', 'Term-time only working'],
  q3_6_occupation: 'Partially occupied',
  q3_7_additionalContext: 'The building sits in the middle of the campus with a single service road. Works must avoid the examination periods in January and May–June.',
  q3_8_siteContext: ['Conservation area or Article 4 direction'],
  q4_0_startDate: '2027-01-11',
  q4_1_targetDate: '2028-09-01',
  q4_3_budget: '4500000',
  q4_4_priorities: ['Minimise disruption', 'Fixed / certain final cost'],
  q4_5_designStage: 'Concept only (Stage 0–1)',
  q4_6_phasing: 'Multiple phases',
  q4_7_funding: 'Grant or public funding',
  q5_1_financialBenefit: ['Energy or operational cost savings', 'Grant or funding unlock'],
  q5_2_annualBenefit: '95000',
  q6_2_instructions: 'Write for an estates committee that includes non-technical members.',
}

async function main() {
  const res = await fetch(`${base}/api/generate-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers: SAMPLE_ANSWERS }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.success) {
    console.error('generate-report failed:', res.status, body)
    process.exit(1)
  }
  if (body.status !== 'complete' || !body.aiProse) {
    console.error('Expected a complete inline record (no KV). Got status:', body.status, '— is KV configured locally?')
    process.exit(1)
  }
  if (body.templateError) console.warn('docx build reported an error:', body.templateError)
  const { docx, ...record } = body
  record.reportId = null
  record.sample = true
  record.generatedAt = new Date().toISOString()
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(record, null, 2))
  console.log(`saved ${OUT} (${Math.round(fs.statSync(OUT).size / 1024)} KB; docx ${docx ? 'built' : 'NOT built'})`)
}

main().catch(e => { console.error(e); process.exit(1) })
