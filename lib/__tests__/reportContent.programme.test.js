import { describe, it, expect } from 'vitest'
import sample from '../../public/sample/report.json'
import {
  overviewSegments, selectMilestones, programmeDetailRows, programmeNarrativeLines, targetPct, milestoneTickClass,
} from '../reportContent.js'

const P = sample.programme

describe('programme page content', () => {
  it('merges stages into one-line bar segments that add up to the total', () => {
    const s = overviewSegments(P)
    expect(s.map(x => [x.label, x.weeks])).toEqual([
      ['Design & approvals', 32], ['Governance', 6], ['Tender', 12], ['Construction 1', 26],
      ['Handover', 5], ['Construction 2', 34], ['Float', 9],
    ])
    expect(s.reduce((a, x) => a + x.weeks, 0)).toBe(124)
    expect(s.find(x => x.label === 'Governance').narrow).toBe(true)
  })

  it('picks six milestones from stage boundaries and flags the missed target', () => {
    const m = selectMilestones(P)
    expect(m.map(x => [x.id, x.label, x.week])).toEqual([
      ['M1', 'Project start (Stage 2)', 0], ['M2', 'Design complete', 32], ['M3', 'Start on site', 50],
      ['M4', 'Phase 1 practical completion', 81], ['M5', 'Final phase complete', 115], ['M6', 'Programme complete', 124],
    ])
    expect(m[5].missedTarget).toBe(true)
    expect(milestoneTickClass(m, 4, 124)).toBe('down')
    expect(milestoneTickClass(m, 5, 124)).toBe('last')
  })

  it('places the client target on the bar', () => {
    expect(Math.round(targetPct(P, sample.answers))).toBe(69)
  })

  it('folds client reviews into their stage and keeps surveys as one parallel row', () => {
    const rows = programmeDetailRows(P)
    expect(rows).toHaveLength(10)
    expect(rows[0]).toMatchObject({ stage: 'Surveys', parallel: true, weeks: 3 })
    expect(rows[1]).toMatchObject({ stage: 'Stage 2', activity: 'Concept Design, incl. 2-wk client review', weeks: 9 })
  })

  it('writes at most six narrative lines, no question numbers', () => {
    const lines = programmeNarrativeLines(P)
    expect(lines.length).toBeGreaterThanOrEqual(5)
    expect(lines.length).toBeLessThanOrEqual(6)
    expect(lines.join(' ')).not.toMatch(/Q\d/)
    expect(lines[0]).toMatch(/^Starts 11 Jan 2027 at Stage 2/)
  })
})
