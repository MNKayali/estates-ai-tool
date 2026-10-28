/**
 * "Delete my account" (October 2026): POST /api/auth/delete-account removes
 * the caller's own account and reports after the password is typed again,
 * and signs this browser out. KV is the in-memory fake.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createFakeKv } from './helpers/fakeKv.js'

const fake = createFakeKv()
vi.mock('@vercel/kv', () => ({ kv: fake }))
vi.mock('@/lib/rateLimit', () => ({
  checkRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
  rateLimitedResponse: () => new Response(null, { status: 429 }),
}))

const { createSessionToken, SESSION_COOKIE } = await import('../session.js')
const users = await import('../users.js')
const { getSessionUser } = await import('../auth.js')
const { createReport, finaliseReport, getReport } = await import('../kv.js')
const { POST } = await import('../../app/api/auth/delete-account/route.js')

async function call(user, body) {
  const token = await createSessionToken({ uid: user.uid, ver: user.sessionVersion })
  return POST(new Request('http://localhost/api/auth/delete-account', {
    method: 'POST',
    headers: { cookie: `${SESSION_COOKIE}=${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

beforeEach(() => { fake.store.clear(); fake.ttl.clear() })

describe('delete my account', () => {
  it('refuses a wrong password and keeps everything', async () => {
    const user = await users.createAccount({ email: 'a@example.com', name: 'A', password: 'correct horse battery' })
    const res = await call(user, { password: 'wrong password!!' })
    expect(res.status).toBe(400)
    expect(await users.getUser(user.uid)).toBeTruthy()
  })

  it('deletes the account and its reports, and clears the cookie', async () => {
    const user = await users.createAccount({ email: 'b@example.com', name: 'B', password: 'correct horse battery' })
    const data = { ownerId: user.uid, answers: { q1_1_projectName: 'P' } }
    await createReport('r1', data)
    await finaliseReport('r1', data)

    const token = await createSessionToken({ uid: user.uid, ver: user.sessionVersion })
    const res = await call(user, { password: 'correct horse battery' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ deleted: true, reportsDeleted: 1 })
    expect(res.headers.get('set-cookie')).toMatch(new RegExp(`${SESSION_COOKIE}=;`))

    expect(await users.getUser(user.uid)).toBeNull()
    expect(await users.getUserByEmail('b@example.com')).toBeNull()
    expect(await getReport('r1')).toBeNull()
    // The old cookie on another device no longer signs anyone in.
    const other = new Request('http://localhost/x', { headers: { cookie: `${SESSION_COOKIE}=${token}` } })
    expect(await getSessionUser(other)).toBeNull()
  })
})
