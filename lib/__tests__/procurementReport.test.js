import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import sample from './fixtures/sample-report-2026-09-23.json'
import { runDeterministicPipeline } from '../pipeline.js'
import { buildProsePrompts, procurementNameProblems, procurementPromptBlock } from '../prose.js'
import { AI_SYSTEM_PROMPT, PROSE_TOOL_NARRATIVE, PROSE_TOOL_RISK } from '../proseSchema.js'
import { procurementTable, procurementBasisSentence, lateSectionBlocks } from '../reportContent.js'
import { buildReport } from '../reportBuilder.js'
import { worstCaseReport, WORST_PROCUREMENT } from '../reportFixtures.js'

// The Procurement Reference recommendation through the pipeline, the prompt,
// the prose check and both renderers. Workbook-backed like pipeline.test.js.
const BASE = {
  q1_0_projectName: 'Procurement',
  q1_1_postcode: 'B29',
  q1_2_projectType: 'Refurbishment',
  q1_2_storeys: '2',
  q1_3_buildingUse: 'Commercial offices',
  q1_4_buildingAge: '1980–1999',
  q1_5_size: '850',
  q2_1_objective: 'Procurement scenario.',
  q2_2_scopeItems: ['0.5', '3.1', '3.2', '5.1', '5.2', '5.8a'],
  q2_2_quantities: {},
  q2_3_interventionLevel: 'Full systems replacement',
  q2_4_specLevel: 'Standard',
  q3_1_knownIssues: [],
  q3_3_surveys: ['None'],
  q3_4_planningConsents: 'No consent required',
  q3_5_accessConstraints: [],
  q3_6_occupation: 'Fully occupied',
  q4_4_priorities: ['Speed', 'Lowest cost'],
  q4_5_designStage: 'Concept only (Stage 0–1)',
  q4_6_phasing: 'Single phase',
  q4_7_funding: 'Internal / commercial',
  q4_8_publicClient: 'Yes',
}

describe('pipeline — procurement step', () => {
  it('scores construction-only weeks, feeds the preferred route to market into the tender period, and is repeatable', async () => {
    const a = await runDeterministicPipeline(BASE)
    const b = await runDeterministicPipeline(BASE)
    const { procurement: pr, programme } = a
    expect(pr.drivers.weeks).toBe(programme.constructionWeeks)
    expect(pr.drivers.priority).toBe('Speed')
    expect(programme.tenderId).toBe(pr.preferred.routeToMarket.tenderId)
    expect(programme.procurementSource).toBe('Procurement Reference')
    const tender = programme.stages.find(s => s.stage === 'Tender / Procurement')
    expect(tender.weeks).toBe(programme.tenderWeeks)
    expect(tender.activity).toContain(pr.preferred.route.name)
    expect(b.procurement).toEqual(a.procurement)
    expect(b.programme.totalWeeks).toBe(a.programme.totalWeeks)
  })

  it('a private client never gets a framework route to market', async () => {
    const { procurement } = await runDeterministicPipeline({ ...BASE, q4_8_publicClient: 'No' })
    for (const s of [procurement.preferred, procurement.alternative]) expect(s.routeToMarket.name).not.toMatch(/framework/i)
  })
})

describe('prose — the recommendation is the only procurement source', () => {
  const pr = WORST_PROCUREMENT

  it('rule 16 is in the system prompt, and the model no longer copies route or contract fields back', () => {
    expect(AI_SYSTEM_PROMPT).toMatch(/16\. PROCUREMENT/)
    for (const k of ['procurementRoute', 'procurementContractForm', 'procurementDesignResp', 'procurementTenderType'])
      expect(PROSE_TOOL_RISK.input_schema.properties[k]).toBeUndefined()
    const a = Object.keys(PROSE_TOOL_NARRATIVE.input_schema.properties)
    const b = Object.keys(PROSE_TOOL_RISK.input_schema.properties)
    expect(a.filter(k => b.includes(k))).toEqual([])
  })

  it('gives the prompt the options and their workbook text, without the £ value', () => {
    const block = procurementPromptBlock(pr)
    expect(block).toContain('PROCUREMENT SUGGESTION')
    expect(block).toContain(pr.preferred.contract.jct)
    expect(block).not.toContain('3500000')
    const { riskPrompt, narrativePrompt } = buildProsePrompts(sample.answers, sample.cost, sample.programme, { clientWarnings: [] }, { score: 'B', label: 'x', reasons: [] }, pr)
    for (const prompt of [riskPrompt, narrativePrompt]) {
      expect(prompt).toContain('PROCUREMENT SUGGESTION')
      expect(prompt).not.toMatch(/use exactly '/)
      expect(prompt).not.toContain(`Procurement route: ${sample.programme.procurementRoute}`)
    }
  })

  it('flags an option or contract form that was not recommended, and passes the ones that were', () => {
    const vocabulary = {
      options: [
        { id: 'PR1', kind: 'route', name: 'Traditional' },
        { id: 'PR2', kind: 'route', name: 'Design and build (single stage)' },
        { id: 'PR3', kind: 'route', name: 'Two-stage (PCSA)' },
        { id: 'RM4', kind: 'market', name: 'Framework — mini-competition' },
        { id: 'RM5', kind: 'market', name: 'Framework — direct award' },
        { id: 'CM2', kind: 'model', name: 'Guaranteed maximum price (GMP)' },
      ],
      contractTokens: ['JCT', 'MTC', 'SBC', 'SBC/AQ', 'PSC', 'ECC', 'Option F', 'DB', 'Option C', 'X22'],
    }
    const withVocab = { ...pr, vocabulary }
    const ok = { procurementNarrative: 'Design and build (single stage) under a framework mini-competition suits the drivers; JCT MTC or SBC/AQ, or ECC Option F.', procurementConsiderations: [], procurementConflicts: [] }
    expect(procurementNameProblems(ok, withVocab)).toEqual([])
    const bad = { procurementNarrative: 'A two-stage route would also work, as would a direct award.', procurementConsiderations: ['Consider JCT DB or ECC Option C with X22.'], procurementConflicts: [] }
    const problems = procurementNameProblems(bad, withVocab).join(' | ')
    expect(problems).toMatch(/Two-stage \(PCSA\)/)
    expect(problems).toMatch(/Framework — direct award/)
    expect(problems).toMatch(/"DB"/)
    expect(problems).toMatch(/"Option C"/)
    expect(problems).toMatch(/"X22"/)
    // "traditional" in the risk register is ordinary English, not a route.
    expect(procurementNameProblems({ riskRegister: [{ description: 'Traditional masonry may hide defects.' }] }, withVocab)).toEqual([])
    // No recommendation (a report from before it existed): nothing to check.
    expect(procurementNameProblems(bad, null)).toEqual([])
  })
})

describe('report — Preferred / Alternative table', () => {
  it('builds the five rows both renderers print, and the basis line', () => {
    const rows = procurementTable(WORST_PROCUREMENT)
    expect(rows.map(r => r[0])).toEqual(['Procurement route', 'Commercial model', 'Contract (JCT)', 'Contract (NEC4)', 'Route to market'])
    expect(rows[2][1]).toBe(WORST_PROCUREMENT.preferred.contract.jct)
    const basis = procurementBasisSentence(WORST_PROCUREMENT)
    expect(basis).toContain('£1m to threshold')
    expect(basis).toContain('5 risks rated High')
    expect(basis.startsWith('This procurement suggestion is for guidance only: the procurement strategy should be developed and reviewed by a procurement professional or Quantity Surveyor.')).toBe(true)
    expect(procurementTable(null)).toBeNull()
    expect(procurementTable({ preferred: { ...WORST_PROCUREMENT.preferred }, alternative: null })[0][2]).toBe('—')
  })

  it('lays out the table for new reports and the old rows for old ones', () => {
    expect(lateSectionBlocks('procurement', worstCaseReport(sample)).some(b => b.table)).toBe(true)
    expect(lateSectionBlocks('procurement', sample).some(b => b.kv)).toBe(true)
  })

  it('prints the table in Word, and an old report keeps its route and contract rows', async () => {
    const text = async data => (await (await JSZip.loadAsync(await buildReport(data))).file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    const now = await text(worstCaseReport(sample))
    for (const s of ['Preferred', 'Alternative', 'Contract (NEC4)', 'Route to market', WORST_PROCUREMENT.preferred.routeToMarket.name])
      expect(now).toContain(s)
    const old = await text({ ...sample })
    expect(old).toContain('Tender type · design')
    expect(old).not.toContain('Contract (NEC4)')
  })
})

describe('report — the guidance line appears on every procurement section', () => {
  it('prints the guidance line and the new title on new and old reports alike, in Word', async () => {
    const text = async data => (await (await JSZip.loadAsync(await buildReport(data))).file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    for (const data of [worstCaseReport(sample), { ...sample }]) {
      const doc = await text(data)
      expect(doc).toContain('Procurement Suggestion')
      expect(doc).not.toContain('Procurement Recommendation')
      expect(doc).toContain('This procurement suggestion is for guidance only')
    }
  })
})
