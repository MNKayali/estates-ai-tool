import { after } from 'next/server'
import { isOfficeOwner } from '@/lib/office/access'
import { OfficeError, officeStore, readOffice } from '@/lib/office/store.mjs'
import { clientState, daily } from '@/lib/office/company/records.mjs'
import { action } from '@/lib/office/company/actions.mjs'
import { changeCompany, runCompany } from '@/lib/office/company/worker.mjs'
import { available } from '@/lib/office/company/work.mjs'

export const maxDuration = 300
const respond = (body, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
function failure(e) {
  return respond(
    {
      error:
        e instanceof OfficeError ? e.message : 'The office could not save this request. Your earlier work is safe.'
    },
    e instanceof OfficeError ? e.status : 503
  )
}
function schedule(store, state) {
  if (state.company && available(state.company).length) after(() => runCompany(store))
}
export async function GET(req) {
  if (!(await isOfficeOwner(req))) return respond({ error: 'Owner access required.' }, 403)
  try {
    const store = officeStore()
    let state = await readOffice(store)
    if (state.company?.daily !== new Date().toISOString().slice(0, 10))
      state = await changeCompany(store, (c) => daily(c))
    schedule(store, state)
    return respond(clientState(state))
  } catch (e) {
    return failure(e)
  }
}
export async function POST(req) {
  if (!(await isOfficeOwner(req))) return respond({ error: 'Owner access required.' }, 403)
  if (
    req.headers.get('sec-fetch-site') === 'cross-site' ||
    req.headers.get('content-type')?.split(';')[0] !== 'application/json'
  )
    return respond({ error: 'Invalid office request.' }, 403)
  try {
    const raw = await req.text()
    if (raw.length > 20000) return respond({ error: 'Message too long.' }, 413)
    let b
    try {
      b = JSON.parse(raw)
    } catch {
      return respond({ error: 'Invalid message.' }, 400)
    }
    if (!b || typeof b !== 'object') return respond({ error: 'Invalid office request.' }, 400)
    const store = officeStore()
    const state = await changeCompany(store, (c) => action(c, b))
    schedule(store, state)
    return respond(clientState(state))
  } catch (e) {
    return failure(e)
  }
}
