// Procurement routes and the programme (11 Oct 2026, RIBA Plan of Work 2020;
// docs/procurement-programme-brief-2026-10-11.md). The route sets when the
// contractor is brought in and who does Stage 4 (Programme 'Procurement'
// sheet); within Traditional the contract may be Minor Works (one design-and-
// specification stage) or the CDP option (shorter client Stage 4), chosen by
// the Procurement Reference's ▶ contract_rules. No overlap of Stage 4 and site.
import { describe, it, expect } from 'vitest'
import { calculateProgramme, checkProgrammeWorkbook, parseProcurementTimingRows } from '../programmeCalculator.js'
import { traditionalContract, parseProcurementWorkbook, fetchProcurementWorkbook } from '../procurementCalculator.js'

const rules = async () => parseProcurementWorkbook(await fetchProcurementWorkbook()).contractRules

describe('contract within the Traditional route (Procurement Reference ▶ contract_rules)', () => {
  const small = { projectType: 'Refurbishment', valueGBP: 300_000, gifa: 300, interventionLevel: 'Full systems replacement', scopeNames: ['toilets', 'lighting'], servicesCount: 2 }

  it('small simple refurbishment: JCT Minor Works', async () => {
    const v = traditionalContract(await rules(), small, false)
    expect(v.id).toBe('MW')
    expect(v.jct).toMatch(/Minor Works Building Contract \(MW\)/)
    expect(v.nec4).toMatch(/ECS/)
  })

  it('one specialist item: MWD; two: not Minor Works', async () => {
    const r = await rules()
    expect(traditionalContract(r, { ...small, scopeNames: ['toilets', 'lifts'] }, false).id).toBe('MWD')
    expect(traditionalContract(r, { ...small, scopeNames: ['lifts', 'sprinklers'] }, false)?.id ?? "none").not.toMatch(/^MW/)
  })

  it('each Minor Works limit rules it out: value £1m, 500 m², project type, full redesign', async () => {
    const r = await rules()
    expect(traditionalContract(r, { ...small, valueGBP: 1_000_000 }, false)?.id ?? "none").not.toMatch(/^MW/)
    expect(traditionalContract(r, { ...small, gifa: 501 }, false)?.id ?? "none").not.toMatch(/^MW/)
    expect(traditionalContract(r, { ...small, projectType: 'New Build' }, false)?.id ?? "none").not.toMatch(/^MW/)
    expect(traditionalContract(r, { ...small, interventionLevel: 'Reconfiguration or full redesign' }, false)?.id ?? "none").not.toMatch(/^MW/)
    expect(traditionalContract(r, { ...small, gifa: 500, valueGBP: 999_999 }, false).id).toBe('MW')
  })

  it('larger services-heavy job: the CDP option, ICD below the threshold and SBC + CDP above', async () => {
    const r = await rules()
    const big = { ...small, valueGBP: 3_000_000, gifa: 2_500, servicesCount: 6 }
    expect(traditionalContract(r, big, false)).toMatchObject({ id: 'CDP', jct: expect.stringMatching(/ICD/) })
    expect(traditionalContract(r, big, true)).toMatchObject({ id: 'CDP', jct: expect.stringMatching(/SBC \+ CDP/) })
    expect(traditionalContract(r, { ...big, servicesCount: 1 }, false)).toBeNull()
  })
})

describe('route timing (Programme workbook Procurement sheet)', () => {
  const A = {
    q1_0_projectName: 'T', q1_1_postcode: 'B29', q1_2_projectType: 'Refurbishment', q1_2_storeys: '2',
    q1_4_buildingAge: '1980–1999', q1_5_size: '2500', q2_3_interventionLevel: 'Full systems replacement',
    q3_3_surveys: ['Condition'], q3_4_planningConsents: 'No consent required', q3_5_accessConstraints: [],
    q3_6_occupation: 'Vacant or decanted', q4_5_designStage: 'Stage 0–1', q4_6_phasing: 'Single phase',
    q4_7_funding: 'Internal / commercial', q4_0_startDate: '2027-01-04',
  }
  const proc = (id, name, variant = null, tenderId = 'TN1') => ({
    preferred: { route: { id, name }, routeToMarket: { name: 'Selective tender', tenderId }, contract: { jct: variant ? `JCT ${variant}` : 'JCT IC', variant } },
  })
  const seq = p => p.stages.filter(s => !s.parallel).map(s => s.stage)
  const wk = (p, name) => p.stages.find(s => s.stage === name)?.weeks

  it('reads the four routes and the two contract effects from the committed workbook', async () => {
    const XLSX = await import('xlsx'); const fs = await import('node:fs')
    const wb = XLSX.read(fs.readFileSync('Estates_AI_Programme_v4_3.xlsx'))
    const t = parseProcurementTimingRows(XLSX.utils.sheet_to_json(wb.Sheets.Procurement, { header: 1, defval: '' }))
    expect(Object.keys(t.routes)).toEqual(['PR1', 'PR2', 'PR3', 'PR4'])
    expect(t.routes.PR3).toMatchObject({ after: 'Stage 2', s4By: 'Contractor', alongside: 'Stage 3', second: 'TN7' })
    expect(t.effects).toMatchObject({ MW: 'DS34-MW', CDP: 0.8 })
  })

  it('refuses a workbook without the Procurement sheet', () => {
    expect(() => checkProgrammeWorkbook({ durTab: {}, conTab: { CH1: {} }, modTab: {}, bands: [], benchmarks: {}, procurementTiming: null }))
      .toThrow(/Procurement sheet/)
  })

  it('Traditional: Stage 4 by the client, then the tender', async () => {
    const p = await calculateProgramme(A, 3_000_000, { procurement: proc('PR1', 'Traditional') })
    const s = seq(p)
    expect(s.indexOf('Stage 4')).toBeLessThan(s.indexOf('Tender / Procurement'))
  })

  it('Design & Build 1 Stage: tender after Stage 3, the contractor does Stage 4, no overlap', async () => {
    const p = await calculateProgramme(A, 3_000_000, { procurement: proc('PR2', 'Design & Build 1 Stage') })
    const s = seq(p)
    expect(s.indexOf('Tender / Procurement')).toBeLessThan(s.indexOf('Stage 4'))
    expect(s.indexOf('Stage 4')).toBeLessThan(s.indexOf('Construction'))
    expect(p.stages.find(s => s.stage === 'Stage 4').activity).toMatch(/contractor design/i)
  })

  it('Design & Build 2 Stage: first tender alongside Stage 3, second-stage price, contractor Stage 4 — shorter than Traditional', async () => {
    const trad = await calculateProgramme(A, 3_000_000, { procurement: proc('PR1', 'Traditional') })
    const p = await calculateProgramme(A, 3_000_000, { procurement: proc('PR3', 'Design & Build 2 Stage') })
    const tender = p.stages.find(s => s.stage === 'Tender / Procurement')
    expect(tender.parallel).toBe(true)
    expect(tender.startWeek).toBe(p.stages.find(s => s.stage === 'Stage 3').startWeek)
    const s = seq(p)
    expect(s.indexOf('Second-stage price')).toBeLessThan(s.indexOf('Stage 4'))
    expect(p.secondStageWeeks).toBeGreaterThan(0)
    expect(p.totalWeeks).toBeLessThan(trad.totalWeeks)
  })

  it('Management / CM: appointment alongside Stage 3, no tender after Stage 4', async () => {
    const p = await calculateProgramme(A, 3_000_000, { procurement: proc('PR4', 'Management Contract / Construction Management') })
    expect(p.tenderAlongside).toBe(true)
    expect(seq(p)).not.toContain('Tender / Procurement')
    expect(p.stages.find(s => s.stage === 'Stage 4').activity).toMatch(/packages/)
  })

  it('Minor Works: one design-and-specification stage, no Stage 4', async () => {
    const small = { ...A, q1_5_size: '300' }
    const ic = await calculateProgramme(small, 300_000, { procurement: proc('PR1', 'Traditional') })
    const mw = await calculateProgramme(small, 300_000, { procurement: proc('PR1', 'Traditional', 'MW') })
    expect(seq(mw)).not.toContain('Stage 4')
    expect(mw.stages.find(s => s.stage === 'Stage 3').activity).toMatch(/minor works/i)
    expect(mw.totalWeeks).toBeLessThan(ic.totalWeeks)
  })

  it('CDP: the client’s Stage 4 is 80% of the normal Stage 4', async () => {
    const ic = await calculateProgramme(A, 3_000_000, { procurement: proc('PR1', 'Traditional') })
    const cdp = await calculateProgramme(A, 3_000_000, { procurement: proc('PR1', 'Traditional', 'CDP') })
    expect(wk(cdp, 'Stage 4')).toBe(Math.ceil(wk(ic, 'Stage 4') * 0.8))
  })
})
