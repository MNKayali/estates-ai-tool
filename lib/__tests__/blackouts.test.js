// Construction blackouts (Q4.2a / Q4.2b, October 2026, owner's design): one
// yes / no, then tick the periods when work cannot take place — the options
// for the building use (Programme workbook Modifiers BLK-*) and/or specific
// dates. Construction is fitted around every ticked period.
import { describe, it, expect } from 'vitest'
import {
  BLACKOUT, BLACKOUT_DATES, blackoutPlan, blackoutOptionsFor, unansweredRequired, ACCESS, WORK_WINDOW,
} from '../questionSets.js'
import {
  calculateProgramme, getBlackoutOptions, parseRestrictionRows, scheduleInWindow, checkProgrammeWorkbook,
} from '../programmeCalculator.js'

const OPTIONS = [
  { id: 'R-01', label: 'School term time (Sep–Jul; work in school holidays)', uses: ['Education'], ranges: [['09-02', '10-23']] },
  { id: 'R-09', label: 'Christmas trading (15 Dec – 5 Jan)', uses: ['Retail'], ranges: [['12-15', '01-05']] },
]
const TERM = OPTIONS[0].label

describe('site work restrictions — the Restrictions sheet', () => {
  it('reads every option with its dates and the building uses that see it', async () => {
    const opts = await getBlackoutOptions()
    const labels = u => blackoutOptionsFor(opts, u).map(o => o.label)
    expect(labels('Education').length).toBeGreaterThanOrEqual(5)
    expect(labels('Education').join()).toMatch(/School term time \(.+\)/)
    expect(labels('Healthcare').join()).toMatch(/Winter pressures \(Dec – Mar\)/)
    expect(labels('Retail').join()).toMatch(/Christmas trading \(15 Dec – 5 Jan\)/)
  })

  const SHEET = [['SITE WORK RESTRICTIONS'], [], ['ID', 'Building uses', 'Restriction', 'Dates shown', 'Blocked periods', 'Notes']]
  it('refuses a row whose periods are not MM-DD/MM-DD', () => {
    const restrictions = parseRestrictionRows([...SHEET, ['R-99', 'Education', 'Exams', 'May – Jun', 'May to June', '']])
    expect(restrictions[0].bad).toBe(true)
    expect(() => checkProgrammeWorkbook({ durTab: {}, conTab: { CH1: {} }, modTab: {}, bands: [], benchmarks: {}, restrictions }))
      .toThrow(/R-99 Blocked periods must be MM-DD\/MM-DD/)
  })

  it('refuses a workbook without the Restrictions sheet', () => {
    expect(() => checkProgrammeWorkbook({ durTab: {}, conTab: { CH1: {} }, modTab: {}, bands: [], benchmarks: {}, restrictions: null }))
      .toThrow(/Restrictions sheet/)
  })

  it('shows the user the restriction with its dates', () => {
    const [r] = parseRestrictionRows([...SHEET, ['R-07', 'Healthcare', 'Winter pressures', 'Dec – Mar', '12-01/03-31', '']])
    expect(r).toMatchObject({ label: 'Winter pressures (Dec – Mar)', uses: ['Healthcare'], ranges: [['12-01', '03-31']], bad: false })
  })
})

describe('blackouts — the answers', () => {
  const base = { q1_3_buildingUse: 'Education', q4_2a_blackout: BLACKOUT.yes }

  it('No means no blocked periods', () => {
    expect(blackoutPlan({ ...base, q4_2a_blackout: BLACKOUT.no, q4_2b_blackouts: [TERM] }, OPTIONS)).toBeNull()
  })

  it('combines every ticked period: building-use options repeat each year, dates are one-off', () => {
    const p = blackoutPlan({ ...base, q4_2b_blackouts: [TERM, BLACKOUT_DATES],
      q4_2c_blackoutDates: [{ from: '2027-05-01', to: '2027-05-14' }, { from: '2027-06-01' }] }, OPTIONS)
    expect(p.recurring).toEqual([['09-02', '10-23']])
    expect(p.periods).toEqual([{ from: '2027-05-01', to: '2027-05-14' }])
    expect(p.labels).toEqual([TERM, 'On specific dates'])
  })

  it('ignores a tick the building use is not offered (a building-use change)', () => {
    expect(blackoutPlan({ ...base, q4_2b_blackouts: [OPTIONS[1].label] }, OPTIONS)).toBeNull()
  })

  it('asks for the periods only on Yes, and for dates only when Specific dates is ticked', () => {
    const req = a => unansweredRequired(4, 'Refurbishment', { q4_5_designStage: 'Stage 0–1', q4_8_publicClient: 'No', ...a })
    expect(req({})).toContain('q4_2a_blackout')
    expect(req({ q4_2a_blackout: BLACKOUT.no })).not.toContain('q4_2b_blackouts')
    expect(req({ q4_2a_blackout: BLACKOUT.yes })).toContain('q4_2b_blackouts')
    expect(req({ q4_2a_blackout: BLACKOUT.yes, q4_2b_blackouts: [TERM] })).not.toContain('q4_2c_blackoutDates')
    expect(req({ q4_2a_blackout: BLACKOUT.yes, q4_2b_blackouts: [BLACKOUT_DATES] })).toContain('q4_2c_blackoutDates')
  })
})

describe('blackouts — the programme', () => {
  it('skips a blocked period that crosses the new year', () => {
    // 1 Oct 2027: four weeks of October, then Christmas trading (1 Nov – 15 Jan) blocks.
    const win = { type: 'blackout', recurring: [['11-01', '01-15']], periods: [] }
    const r = scheduleInWindow(new Date('2027-10-01T00:00:00Z'), 0, 8, win)
    expect(r.worked).toBe(8)
    expect(r.elapsed).toBeGreaterThan(8 + 9)
  })

  const SCHOOL = {
    q1_0_projectName: 'Test', q1_1_postcode: 'B23', q1_2_projectType: 'Refurbishment', q1_2_storeys: '2',
    q1_3_buildingUse: 'Education', q1_4_buildingAge: '1900–1979', q1_5_size: '1500',
    q2_3_interventionLevel: 'Full systems replacement', q3_3_surveys: ['Condition'],
    q3_4_planningConsents: 'No consent required', q3_5_accessConstraints: [], q3_6_occupation: 'Vacant or decanted',
    q4_5_designStage: 'Stage 0–1', q4_6_phasing: 'Single phase', q4_7_funding: 'Internal / commercial', q4_0_startDate: '2027-01-11',
  }

  it('term time blocked: construction runs in the holidays and takes longer from start to finish', async () => {
    const open = await calculateProgramme({ ...SCHOOL, q4_2a_blackout: BLACKOUT.no }, 2_000_000)
    const term = await calculateProgramme({ ...SCHOOL, q4_2a_blackout: BLACKOUT.yes, q4_2b_blackouts: [TERM] }, 2_000_000)
    expect(term.constructionWeeks).toBeGreaterThan(open.constructionWeeks)
    expect(term.workWindowNote).toMatch(/restricted periods \(school term time \(Sep/)
    expect(term.workWindowNote).toMatch(/All site works are assumed to stop/)
  })

  it('once Q4.2a is answered, an old Q3.5a window cannot contradict it', async () => {
    const legacy = { q3_5_accessConstraints: [ACCESS.periods], q3_5a_workWindow: WORK_WINDOW.holidays }
    const p = await calculateProgramme({ ...SCHOOL, ...legacy, q4_2a_blackout: BLACKOUT.no }, 2_000_000)
    expect(p.workWindow).toBeNull()
    const old = await calculateProgramme({ ...SCHOOL, ...legacy }, 2_000_000)
    expect(old.workWindow?.type).toBe('holidays')
  })
})
