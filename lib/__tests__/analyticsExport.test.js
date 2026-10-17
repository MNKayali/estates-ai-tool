/**
 * The admin's "Download for AI" file (October 2026): anonymised, self-explaining,
 * and a CSV that opens cleanly in Excel.
 */
import { describe, it, expect } from 'vitest'
import { buildAnalyticsExport, toCsv, DAILY_COLUMNS } from '../analyticsExport.js'

const users = [
  { uid: 'b', email: 'second@example.com', name: 'Second Person', createdAt: '2026-10-10T09:00:00Z', status: 'active', source: 'Google', reportCount: 1 },
  { uid: 'a', email: 'first@example.com', name: 'First Person', createdAt: '2026-10-01T09:00:00Z', status: 'active', source: null, reportCount: 2 },
]
const reports = [
  { reportId: 'r1', projectName: 'Secret Hall Refurb', ownerId: 'b', generatedAt: '2026-10-12T10:00:00Z', totalMid: 500000, gifa: 1000, totalWeeks: 60,
    projectType: 'Refurbishment', buildingUse: 'Education', region: 'West Midlands', confidence: 'B', checks: [{ code: 'X1', message: 'm' }] },
  { reportId: 'r2', projectName: 'Trial Shop', trial: true, generatedAt: '2026-10-13T10:00:00Z', totalMid: 90000 },
]
const feedback = [{ reportId: 'r1', projectName: 'Secret Hall Refurb', url: 'https://x/report/r1', category: 'Wrong numbers', message: 'Roof looks high', submittedAt: '2026-10-14T10:00:00Z' }]
const visits = {
  days: 30,
  totals: { visitors: 10, questionnaireVisitors: 4, visits: 12, views: 30, reports: 2, signups: 1, avgVisitSeconds: 95, pagesPerVisit: 2.5, signupRate: 10 },
  daily: [{ date: '2026-10-16', visitors: 4, visits: 5, views: 12, reports: 1, signups: 0 }, { date: '2026-10-17', visitors: 6, visits: 7, views: 18, reports: 1, signups: 1 }],
  sources: [{ name: 'Google', count: 7, signups: 1 }], pages: [], countries: [], devices: [],
}

describe('buildAnalyticsExport', () => {
  const out = buildAnalyticsExport({ visits, users, reports, feedback, trial: { limitHit: 3, converted: 1 }, generatedAt: new Date('2026-10-17T12:00:00Z') })
  const text = JSON.stringify(out)

  it('leaves out names, emails, project names, report ids and page addresses', () => {
    for (const secret of ['example.com', 'Person', 'Secret Hall', 'Trial Shop', '"r1"', 'https://x']) expect(text).not.toContain(secret)
  })
  it('numbers users oldest first and links reports to the number', () => {
    expect(out.users.map(u => [u.user, u.source])).toEqual([['U001', null], ['U002', 'Google']])
    expect(out.reports[0]).toMatchObject({ by: 'U002', projectType: 'Refurbishment', costPerM2GBP: 500, consistencyFlags: ['X1'] })
    expect(out.reports[1].by).toBe('free trial')
  })
  it('explains itself and carries the journey and period', () => {
    expect(out.about.howCounted.length).toBeGreaterThan(3)
    expect(out.period).toEqual({ days: 30, from: '2026-10-16', to: '2026-10-17' })
    expect(out.journey.map(s => s.people)).toEqual([10, 4, 2, 1])
    expect(out.headline).toMatchObject({ accounts: 2, trialLimitHit: 3 })
    expect(out.feedback).toEqual([{ date: '2026-10-14', category: 'Wrong numbers', message: 'Roof looks high' }])
  })
  it('still builds without visit counts (no KV)', () => {
    expect(buildAnalyticsExport({ visits: null }).daily).toEqual([])
  })
})

describe('toCsv', () => {
  it('writes a header and quotes awkward or formula-like cells', () => {
    const csv = toCsv([{ date: '2026-10-17', visitors: 3 }, { date: '=cmd', visitors: 'a,b' }], DAILY_COLUMNS.slice(0, 2))
    expect(csv).toBe("Day,Visitors\r\n2026-10-17,3\r\n'=cmd,\"a,b\"\r\n")
  })
})
