/**
 * The admin's All reports page: deleted reports leave the index, the
 * access-code clean-up leaves owned reports alone, and the dashboard reads
 * counts rather than the list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeKv } from './helpers/fakeKv.js'

const fake = createFakeKv()
vi.mock('@vercel/kv', () => ({ kv: fake }))
const kvLib = await import('../kv.js')
const { GET, POST } = await import('../../app/api/admin/reports/route.js')

const base = { projectName: 'P', generatedAt: new Date().toISOString(), cost: { total: { low: 1, mid: 2, high: 3 } } }
async function make(id, extra = {}) {
  await kvLib.createReport(id, { ...base, ...extra })
  await kvLib.finaliseReport(id, { ...base, ...extra })
}
const post = body => POST(new Request('http://x/api/admin/reports', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(async () => {
  for (const k of ['report:index', 'report:index:deleted']) await fake.del(k)
})

describe('admin reports', () => {
  it('a deleted report is no longer listed or counted, and leaves its owner\'s list', async () => {
    await make('a000000000000001', { ownerId: 'u1' })
    await make('a000000000000002', { ownerId: 'u1' })
    await kvLib.deleteReport('a000000000000001', 'u1')
    expect((await kvLib.listReports()).map(r => r.reportId)).toEqual(['a000000000000002'])
    expect(await kvLib.reportCounts()).toEqual({ total: 1, recent: 1 })
    expect((await kvLib.listUserReports('u1')).map(r => r.reportId)).toEqual(['a000000000000002'])
  })

  it('"Delete all old reports" removes only access-code reports', async () => {
    await make('b000000000000001')                       // access-code era
    await make('b000000000000002', { ownerId: 'u2' })    // account
    await make('b000000000000003', { anonId: 't1' })     // free trial
    const res = await (await post({ kind: 'legacy' })).json()
    expect(res).toEqual({ deleted: 1, skipped: 0 })
    expect(await kvLib.getReport('b000000000000001')).toBeNull()
    expect(await kvLib.getReport('b000000000000002')).not.toBeNull()
    expect((await kvLib.listReports()).map(r => r.reportId).sort()).toEqual(['b000000000000002', 'b000000000000003'])
  })

  it('a ticked selection deletes those reports, the owner read from the record', async () => {
    await make('c000000000000001', { ownerId: 'u3' })
    await make('c000000000000002', { ownerId: 'u3' })
    const res = await (await post({ ids: ['c000000000000001', 'not an id'] })).json()
    expect(res.deleted).toBe(1)
    expect((await kvLib.listUserReports('u3')).map(r => r.reportId)).toEqual(['c000000000000002'])
  })

  it('lists one page with counts by kind and filters', async () => {
    await make('d000000000000001')
    await make('d000000000000002', { ownerId: 'u4', projectName: 'Library roof' })
    const all = await (await GET(new Request('http://x/api/admin/reports'))).json()
    expect(all.counts).toEqual({ all: 2, account: 1, trial: 0, legacy: 1 })
    const legacy = await (await GET(new Request('http://x/api/admin/reports?kind=legacy'))).json()
    expect(legacy.reports.map(r => r.reportId)).toEqual(['d000000000000001'])
    const found = await (await GET(new Request('http://x/api/admin/reports?q=library'))).json()
    expect(found.reports.map(r => r.reportId)).toEqual(['d000000000000002'])
  })
})
