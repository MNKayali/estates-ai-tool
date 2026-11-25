import { timingSafeEqual } from 'node:crypto'
import { scheduledRun } from '@/lib/office/company/worker.mjs'
import { officeStore } from '@/lib/office/store.mjs'

export const maxDuration = 300
export async function GET(request) {
  const secret = process.env.CRON_SECRET
  const presented = Buffer.from(request.headers.get('authorization') || '')
  const expected = Buffer.from('Bearer ' + secret)
  if (!secret || presented.length !== expected.length || !timingSafeEqual(presented, expected))
    return new Response(null, { status: 403 })
  await scheduledRun(officeStore())
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
