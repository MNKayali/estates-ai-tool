import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { runDeterministicPipeline } from '../pipeline.js'
import { buildReport } from '../reportBuilder.js'
import {
  lineBasis, quantityBasisSentence, unverifiedRatesSentence, bcisGroupSentence,
  belowLineRows, bandFactorSentence, groupHeading,
} from '../reportShared.js'

// NRM1 v5.2 report output. Both renderers print each line's quantity basis
// (estimated / the client's figure), flag "AI estimate – verify" rates, total
// works by NRM1 element group, and print BCIS 12 lines below the construction
// total. The wording lives in lib/reportShared.js; this checks the .docx
// builder actually carries it, and that reports from before v5.2 (lines with
// none of these fields) render exactly as they did.
const ANSWERS = {
  q1_0_projectName: 'v5.2 report check', q1_1_postcode: 'B15',
  q1_2_projectType: 'New Build', q1_3_buildingUse: 'Education', q1_5_size: '4000', q1_2_storeys: '3',
  q2_4_specLevel: 'Standard', q3_3_surveys: ['Condition'], q3_4_planningConsents: 'Full planning',
  q3_6_occupation: 'Vacant or decanted', q4_5_designStage: 'Concept only (Stage 0–1)',
  // Foundations, frame, toilets (30 given), ASHP heating, biodiversity net gain.
  q2_2_scopeItems: ['S-0008', 'S-0011', 'S-0024', 'S-0039', 'S-0078'],
  q2_2_quantities: { 'S-0024-01': 30 },
}
const PROSE = { executiveSummary: 'Summary.', keyFindings: [], scopeAssumptions: [], costNarrative: 'Cost.', riskRegister: [], procurementNarrative: 'Procurement.', nextSteps: [], constraintsSummary: 'Constraints.' }

describe('report — NRM1 v5.2 lines', () => {
  it('prices biodiversity net gain below the construction total and adds it to the project total', async () => {
    const { cost } = await runDeterministicPipeline(ANSWERS)
    expect(cost.belowLine.mid).toBeGreaterThan(0)
    expect(cost.lineItems.some(l => l.item === 'Biodiversity net gain')).toBe(false)
    const b = cost.breakdown
    expect(cost.total.mid).toBe(cost.construction.mid + b.fees + b.devCosts + b.risk + b.contingency + b.inflation + cost.belowLine.mid)
    expect(belowLineRows(cost)[0].label).toMatch(/Biodiversity net gain/)
  })

  it('writes quantity basis, unverified-rate flags, BCIS group totals and the below-the-line row into the .docx', async () => {
    const { cost, programme } = await runDeterministicPipeline(ANSWERS)
    const buf = await buildReport({ answers: ANSWERS, cost, programme, aiProse: PROSE, budget: { status: 'none' } })
    const zip = await JSZip.loadAsync(buf)
    const text = (await zip.file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(text).toContain('30 nr · your figure')
    expect(text).toMatch(/≈ [\d,]+ m² · estimated/)
    expect(text).toContain('† unverified rate')
    expect(text).toContain('Works cost by NRM1 element group')
    expect(text).toContain('Other development costs')
    expect(text).toContain('No band position factor applies')
    expect(text).toContain('GROUP 5 — SERVICES')
    // Loose furniture is not in this scope, so the standard FF&E exclusion stays.
    expect(text).toContain('Loose furniture, fittings and equipment')
  })
})

describe('report — reports generated before v5.2 render as they did', () => {
  const legacyLine = { code: '3.1', group: 3, description: 'Wall finishes', unit: 'm²', qty: 850, rate: 50, lineMid: 42500 }
  const legacyCost = { lineItems: [legacyLine], bandFactor: 1, interventionLevel: 'Full systems replacement' }

  it('adds nothing to a line or the Estimate Basis', () => {
    expect(lineBasis(legacyLine)).toBe('')
    expect(quantityBasisSentence(legacyCost)).toBeNull()
    expect(unverifiedRatesSentence(legacyCost)).toBeNull()
    expect(bcisGroupSentence(legacyCost)).toBeNull()
    expect(belowLineRows(legacyCost)).toEqual([])
  })

  it('keeps the old group banner and band sentence', () => {
    expect(groupHeading(legacyLine, { 3: 'GROUP 3 — INTERNAL FINISHES' })).toBe('GROUP 3 — INTERNAL FINISHES')
    expect(bandFactorSentence(legacyCost)).toBe('Band position factor of 1 applied (Full systems replacement).')
  })
})
