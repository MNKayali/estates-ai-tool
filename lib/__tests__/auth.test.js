/**
 * User accounts (September 2026): signed session cookies, password hashing,
 * one-time links, who may see a report, and the per-user report list.
 * KV is replaced by an in-memory fake, so these run offline.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createFakeKv } from './helpers/fakeKv.js'

const fake = createFakeKv()
vi.mock('@vercel/kv', () => ({ kv: fake }))

const { createSessionToken, verifySessionToken, SESSION_COOKIE } = await import('../session.js')
const { safeNextPath } = await import('../safePath.js')
const users = await import('../users.js')
const { getSessionUser, canViewReport, authoriseReport, DEV_USER } = await import('../auth.js')
const { finaliseReport, listUserReports, deleteReport } = await import('../kv.js')

function requestWith(cookies = {}) {
  const header = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
  return new Request('http://localhost/x', { headers: { cookie: header } })
}

async function signedInRequest(user) {
  const token = await createSessionToken({ uid: user.uid, ver: user.sessionVersion })
  return requestWith({ [SESSION_COOKIE]: token })
}

beforeEach(() => {
  fake.store.clear()
  fake.ttl.clear()
  vi.unstubAllEnvs()
})

describe('session token', () => {
  it('round-trips uid and version', async () => {
    const t = await createSessionToken({ uid: 'abc', ver: 3 })
    expect(await verifySessionToken(t)).toMatchObject({ uid: 'abc', ver: 3 })
  })

  it('rejects a tampered payload', async () => {
    const t = await createSessionToken({ uid: 'abc', ver: 0 })
    const [, sig] = t.split('.')
    const forged = Buffer.from(JSON.stringify({ uid: 'admin', ver: 0, exp: 9e9 })).toString('base64url')
    expect(await verifySessionToken(`${forged}.${sig}`)).toBeNull()
  })

  it('rejects an expired token', async () => {
    const t = await createSessionToken({ uid: 'abc', ver: 0 }, 60, Date.now() - 120_000)
    expect(await verifySessionToken(t)).toBeNull()
  })

  it('rejects a token signed with another secret', async () => {
    vi.stubEnv('COOKIE_SECRET', 'secret-one')
    const t = await createSessionToken({ uid: 'abc', ver: 0 })
    vi.stubEnv('COOKIE_SECRET', 'secret-two')
    expect(await verifySessionToken(t)).toBeNull()
  })

  it('fails closed in production with no COOKIE_SECRET', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('COOKIE_SECRET', '')
    expect(await createSessionToken({ uid: 'abc', ver: 0 })).toBeNull()
  })

  it('ignores garbage', async () => {
    for (const t of [undefined, '', 'x', 'a.b', 'a.' + 'f'.repeat(64)]) expect(await verifySessionToken(t)).toBeNull()
  })
})

describe('safeNextPath', () => {
  it('keeps same-site paths and refuses open redirects', () => {
    expect(safeNextPath('/report/abc')).toBe('/report/abc')
    for (const bad of ['//evil.example', 'https://evil.example', '/\\evil.example', 'reports', null]) {
      expect(safeNextPath(bad)).toBe('/reports')
    }
  })
})

describe('passwords', () => {
  it('verifies the right password only', async () => {
    const h = await users.hashPassword('correct horse battery')
    expect(h.startsWith('scrypt$')).toBe(true)
    expect(await users.verifyPassword('correct horse battery', h)).toBe(true)
    expect(await users.verifyPassword('correct horse batterx', h)).toBe(false)
    expect(await users.verifyPassword('anything', 'not-a-hash')).toBe(false)
  })

  it('enforces the length rule', () => {
    expect(users.passwordProblem('short')).toMatch(/at least 10/)
    expect(users.passwordProblem('long enough pw')).toBe('')
  })
})

describe('accounts and one-time links', () => {
  it('creates an invited account and refuses a duplicate email (any case)', async () => {
    const u = await users.createUser({ email: 'Jo@Uni.ac.uk', name: 'Jo' })
    expect(u).toMatchObject({ email: 'jo@uni.ac.uk', status: 'invited', passwordHash: null })
    await expect(users.createUser({ email: 'JO@uni.ac.uk', name: 'Jo 2' })).rejects.toThrow('exists')
    expect((await users.listUsers()).map(x => x.uid)).toEqual([u.uid])
  })

  it('an invite link works once and activates the account', async () => {
    const u = await users.createUser({ email: 'a@b.co', name: 'A' })
    const token = await users.createLinkToken('invite', u.uid)
    expect(fake.ttl.get([...fake.store.keys()].find(k => k.startsWith('token:invite:')))).toBe(users.TOKEN_TTL.invite)
    expect(await users.peekLinkToken('invite', token)).toBe(u.uid)
    expect(await users.peekLinkToken('reset', token)).toBeNull() // kinds do not mix
    expect(await users.consumeLinkToken('invite', token)).toBe(u.uid)
    expect(await users.consumeLinkToken('invite', token)).toBeNull()
    const active = await users.setPassword(u.uid, 'a good long password')
    expect(active.status).toBe('active')
  })

  it('stores only a hash of the link token', async () => {
    const u = await users.createUser({ email: 'a@b.co', name: 'A' })
    const token = await users.createLinkToken('reset', u.uid)
    expect([...fake.store.keys()].some(k => k.includes(token))).toBe(false)
  })
})

describe('getSessionUser', () => {
  async function activeUser() {
    const u = await users.createUser({ email: 'a@b.co', name: 'A' })
    return users.setPassword(u.uid, 'a good long password')
  }

  it('returns the active user for a valid cookie', async () => {
    const u = await activeUser()
    expect((await getSessionUser(await signedInRequest(u)))?.uid).toBe(u.uid)
  })

  it('signs out every session when the password changes', async () => {
    const u = await activeUser()
    const req = await signedInRequest(u)
    await users.setPassword(u.uid, 'another long password')
    expect(await getSessionUser(req)).toBeNull()
  })

  it('refuses a disabled account, and a re-enabled one still needs a new sign-in', async () => {
    const u = await activeUser()
    const req = await signedInRequest(u)
    await users.setDisabled(u.uid, true)
    expect(await getSessionUser(req)).toBeNull()
    await users.setDisabled(u.uid, false)
    expect(await getSessionUser(req)).toBeNull()
  })

  it('refuses an invited account with no password yet', async () => {
    const u = await users.createUser({ email: 'a@b.co', name: 'A' })
    expect(await getSessionUser(await signedInRequest(u))).toBeNull()
  })

  it('AUTH_OPEN opens sign-in in development only', async () => {
    vi.stubEnv('AUTH_OPEN', '1')
    expect(await getSessionUser(requestWith())).toBe(DEV_USER)
    vi.stubEnv('NODE_ENV', 'production')
    expect(await getSessionUser(requestWith())).toBeNull()
  })
})

describe('who may see a report', () => {
  const owner = { uid: 'owner0000000000a' }
  const other = { uid: 'other0000000000b' }

  it('owner and admin yes, anyone else no', () => {
    const rec = { ownerId: owner.uid }
    expect(canViewReport(owner, rec)).toBe(true)
    expect(canViewReport(other, rec)).toBe(false)
    expect(canViewReport(null, rec)).toBe(false)
    expect(canViewReport(null, rec, true)).toBe(true)
  })

  it('a pre-account report (no owner, no trial visitor) is admin-only now sign-up is public', () => {
    expect(canViewReport(other, {})).toBe(false)
    expect(canViewReport(null, {}, false, 'aaaaaaaaaaaaaaaa')).toBe(false)
    expect(canViewReport(null, {}, true)).toBe(true)
  })

  it('an unclaimed trial report is visible to the visitor who made it only', () => {
    const rec = { anonId: 'aaaaaaaaaaaaaaaa' }
    expect(canViewReport(null, rec, false, 'aaaaaaaaaaaaaaaa')).toBe(true)
    expect(canViewReport(null, rec, false, 'bbbbbbbbbbbbbbbb')).toBe(false)
    expect(canViewReport(other, rec)).toBe(false)
    // once claimed, the owner rule takes over
    expect(canViewReport(null, { ...rec, ownerId: owner.uid }, false, 'aaaaaaaaaaaaaaaa')).toBe(false)
    expect(canViewReport(owner, { ...rec, ownerId: owner.uid })).toBe(true)
  })

  it('answers 404, never 401 or 403, for a report the caller may not see', async () => {
    vi.stubEnv('ADMIN_CODE', 'admin-code')
    const u = await users.setPassword((await users.createUser({ email: 'x@y.co', name: 'X' })).uid, 'a good long password')
    const res = await authoriseReport(await signedInRequest(u), { ownerId: 'someone-else' })
    expect(res.response.status).toBe(404)
    const anon = await authoriseReport(requestWith(), { ownerId: 'someone-else' })
    expect(anon.response.status).toBe(404)
    expect((await anon.response.json()).signIn).toBe(true)
  })
})

describe('report history', () => {
  const data = (over = {}) => ({
    projectName: 'Library roof', generatedAt: '2026-09-25T10:00:00Z', ownerId: 'u1',
    cost: { total: { low: 1, mid: 2, high: 3 } }, programme: { totalWeeks: 40 },
    answers: { q1_2_projectType: 'Refurbishment' }, ...over,
  })

  it('an owned report is kept with no expiry and listed for its owner', async () => {
    await finaliseReport('a'.repeat(16), data())
    expect(fake.ttl.has(`report:${'a'.repeat(16)}`)).toBe(false)
    const list = await listUserReports('u1')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ reportId: 'a'.repeat(16), projectName: 'Library roof', projectType: 'Refurbishment', totalMid: 2 })
    expect(await listUserReports('u2')).toEqual([])
  })

  it('a new owned report shows as in progress, and an abandoned one drops off after a day', async () => {
    const { createReport } = await import('../kv.js')
    await createReport('e'.repeat(16), data({ generatedAt: new Date().toISOString() }))
    expect((await listUserReports('u1'))[0]).toMatchObject({ reportId: 'e'.repeat(16), status: 'in-progress' })
    expect(await listUserReports('u1', Date.now() + 25 * 3600 * 1000)).toEqual([])
    await finaliseReport('e'.repeat(16), data({ generatedAt: new Date().toISOString() }))
    expect((await listUserReports('u1'))[0].status).toBe('complete')
  })

  it('a report with no owner keeps the 90-day expiry', async () => {
    await finaliseReport('b'.repeat(16), data({ ownerId: undefined }))
    expect(fake.ttl.get(`report:${'b'.repeat(16)}`)).toBe(60 * 60 * 24 * 90)
  })

  it('lists newest first and deletes cleanly', async () => {
    await finaliseReport('c'.repeat(16), data({ generatedAt: '2026-01-01T00:00:00Z', projectName: 'Old' }))
    await finaliseReport('d'.repeat(16), data({ generatedAt: '2026-09-01T00:00:00Z', projectName: 'New' }))
    expect((await listUserReports('u1')).map(r => r.projectName)).toEqual(['New', 'Old'])
    await deleteReport('d'.repeat(16), 'u1')
    expect(fake.store.has(`report:${'d'.repeat(16)}`)).toBe(false)
    expect((await listUserReports('u1')).map(r => r.projectName)).toEqual(['Old'])
  })
})
