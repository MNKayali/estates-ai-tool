import { describe, it, expect } from 'vitest'
import { programmeDetailRows } from '../reportContent.js'
import sample from '../../public/sample/report.json' with { type: 'json' }
import { worstCaseReport } from '../reportFixtures.js'

describe('programme detail table folds parallel and waiting rows into their stage', () => {
  const p = worstCaseReport(sample).programme
  const rows = programmeDetailRows(p)
  it('one surveys row with short names, no separate consent, wait or gateway rows', () => {
    expect(rows.filter(r => r.parallel).map(r => r.stage)).toEqual(['Surveys'])
    expect(rows[0].activity).toBe('Asbestos R&D; topographic; ground investigation; ecology; structural')
    expect(rows.some(r => /wait|^Gateway$|^Planning$|^Building Control$/.test(r.stage))).toBe(false)
    const s3 = rows.find(r => r.stage === 'Stage 3')
    expect(s3.activity).toMatch(/planning determination alongside \(11 wks\); then 2 wks waiting for planning consent, incl\. 2-wk client review/)
  })
  it('the sequential rows still add up to the programme', () => {
    expect(rows.filter(r => !r.parallel).reduce((t, r) => t + r.weeks, 0)).toBe(p.totalWeeks)
  })
  it('drops the "RIBA Stage N —" prefix the Stage column already gives', () => {
    expect(rows.find(r => r.stage === 'Construction').activity).toBe('Extension — Multi-Storey (3 phases)')
  })
})
