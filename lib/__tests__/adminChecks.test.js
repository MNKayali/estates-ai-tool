/**
 * The report's consistency findings (lib/consistency.js) reach the admin
 * report list through the index entry finaliseReport() writes.
 */
import { describe, it, expect, vi } from 'vitest'
import { createFakeKv } from './helpers/fakeKv.js'

const fake = createFakeKv()
vi.mock('@vercel/kv', () => ({ kv: fake }))
const kvLib = await import('../kv.js')

const base = { projectName: 'P', generatedAt: '2026-10-09T10:00:00Z', ownerId: 'u1', cost: { total: { low: 1, mid: 2, high: 3 } } }

describe('admin report list shows the consistency checks', () => {
  it('carries each finding on the index entry', async () => {
    await kvLib.createReport('aaaa1111bbbb2222', base)
    await kvLib.finaliseReport('aaaa1111bbbb2222', { ...base, consistency: [{ code: 'RISK_COUNT', severity: 'warning', message: 'Text says 1 risk(s) rated High; the register has 3.' }] })
    const [entry] = await kvLib.listReports()
    expect(entry.checks).toEqual([{ code: 'RISK_COUNT', message: 'Text says 1 risk(s) rated High; the register has 3.' }])
  })
  it('an empty list means checked and clean; a report from before the checks has none', async () => {
    await kvLib.createReport('cccc3333dddd4444', base)
    await kvLib.finaliseReport('cccc3333dddd4444', { ...base, consistency: [] })
    await kvLib.createReport('eeee5555ffff6666', base)
    await kvLib.finaliseReport('eeee5555ffff6666', base)
    const list = await kvLib.listReports()
    expect(list.find(r => r.reportId === 'cccc3333dddd4444').checks).toEqual([])
    expect(list.find(r => r.reportId === 'eeee5555ffff6666').checks).toBeNull()
  })
})
