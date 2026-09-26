/**
 * Public free trial (September 2026): the trial cookie, the allowance and its
 * IP backstop, claiming trial reports into an account, the download gate, the
 * admin's account controls and the weekly usage figures. KV is an in-memory
 * fake; the generate-report tests run the real deterministic pipeline against
 * the committed workbooks.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createFakeKv } from './helpers/fakeKv.js'

const fake = createFakeKv()
vi.mock('@vercel/kv', () => ({ kv: fake }))

const session = await import('../session.js')
const users = await import('../users.js')
const trial = await import('../trial.js')
const auth = await import('../auth.js')
const kvLib = await import('../kv.js')
const { weeklyUsage, isoWeek } = await import('../usageStats.js')
const sample = (await import('../../public/sample/report.json', { with: { type: 'json' } })).default

const TID = 'a1a1a1a1a1a1a1a1'
const TID2 = 'b2b2b2b2b2b2b2b2'

function request({ cookies = {}, ip = '203.0.113.7', body } = {}) {
  const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
  return new Request('http://localhost/api/x', {
    method: body ? 'POST' : 'GET',
    headers: { cookie, 'x-forwarded-for': ip, 'content-type': 'application/json' },
    ...(body && { body: JSON.stringify(body) }),
  })
}

async function trialCookies(tid = TID) {
  return { [session.TRIAL_COOKIE]: await session.createTrialToken(tid) }
}

async function activeUser(email = 'owner@example.org') {
  return users.createAccount({ email, name: 'Owner', password: 'a good long password' })
}

async function sessionCookies(u) {
  return { [session.SESSION_COOKIE]: await session.createSessionToken({ uid: u.uid, ver: u.sessionVersion }) }
}

beforeEach(() => {
  fake.store.clear()
  fake.ttl.clear()
  vi.unstubAllEnvs()
})

describe('trial cookie', () => {
  it('round-trips the visitor id', async () => {
    expect(await session.verifyTrialToken(await session.createTrialToken(TID))).toBe(TID)
  })

  it('is never accepted as a session, and a session is never a trial', async () => {
    const t = await session.createTrialToken(TID)
    expect(await session.verifySessionToken(t)).toBeNull()
    const s = await session.createSessionToken({ uid: 'abc', ver: 0 })
    expect(await session.verifyTrialToken(s)).toBeNull()
  })

  it('refuses a malformed id and fails closed in production without a secret', async () => {
    expect(await session.createTrialToken('not-hex')).toBeNull()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('COOKIE_SECRET', '')
    expect(await session.createTrialToken(TID)).toBeNull()
  })
})

describe('trial allowance', () => {
  it('allows three reports, refuses the fourth and records the refusal', async () => {
    for (let i = 0; i < 3; i++) expect((await trial.reserveTrialReport(TID, request())).ok).toBe(true)
    const fourth = await trial.reserveTrialReport(TID, request())
    expect(fourth).toMatchObject({ ok: false, reason: 'visitor-limit' })
    expect(await trial.trialStatus(TID)).toEqual({ limit: 3, used: 3, remaining: 0 })
    expect((await trial.trialStats()).limitHit).toBe(1)
  })

  it('gives a place back when generation fails', async () => {
    const r = await trial.reserveTrialReport(TID, request())
    await r.release()
    await r.release() // twice is harmless
    expect((await trial.trialStatus(TID)).used).toBe(0)
  })

  it('backs the cookie up with a generous per-IP limit, other networks unaffected', async () => {
    // Clearing cookies gives a new visitor id, but the IP count carries on.
    for (let i = 0; i < trial.TRIAL_IP_LIMIT; i++) {
      const tid = i.toString(16).padStart(16, '0')
      expect((await trial.reserveTrialReport(tid, request())).ok).toBe(true)
    }
    const next = await trial.reserveTrialReport('ffffffffffffffff', request())
    expect(next).toMatchObject({ ok: false, reason: 'ip-limit' })
    expect((await trial.trialStatus('ffffffffffffffff')).used).toBe(0) // refused → not counted
    expect((await trial.reserveTrialReport('ffffffffffffffff', request({ ip: '198.51.100.1' }))).ok).toBe(true)
    // The IP is never stored in the clear.
    expect([...fake.store.keys()].some(k => k.includes('203.0.113.7'))).toBe(false)
  })
})

describe('claiming trial reports', () => {
  const record = (over = {}) => ({
    projectName: 'Library roof', generatedAt: new Date().toISOString(), ownerId: null, anonId: TID,
    cost: { total: { low: 1, mid: 2, high: 3 } }, programme: { totalWeeks: 40 },
    answers: { q1_2_projectType: 'Refurbishment' }, ...over,
  })

  it('moves a finished trial report into the account and lifts its 90-day expiry', async () => {
    const id = '1'.repeat(16)
    await kvLib.finaliseReport(id, record())
    expect(fake.ttl.get(`report:${id}`)).toBe(60 * 60 * 24 * 90)
    await trial.recordTrialReport(TID, id)
    const u = await activeUser()
    expect(await trial.claimTrialReports(TID, u.uid)).toBe(1)
    expect(fake.ttl.has(`report:${id}`)).toBe(false)
    expect((await fake.get(`report:${id}`)).ownerId).toBe(u.uid)
    expect((await kvLib.listUserReports(u.uid)).map(r => r.reportId)).toEqual([id])
  })

  it('a report claimed while still generating stays owned when the prose route finalises it', async () => {
    const id = '2'.repeat(16)
    const data = record()
    await kvLib.createReport(id, data)
    await trial.recordTrialReport(TID, id)
    const u = await activeUser()
    await trial.claimTrialReports(TID, u.uid)
    expect((await kvLib.listUserReports(u.uid))[0].status).toBe('in-progress')
    // The prose route finalises with the copy it read before the claim.
    await kvLib.finaliseReport(id, data)
    const stored = await fake.get(`report:${id}`)
    expect(stored).toMatchObject({ ownerId: u.uid, status: 'complete' })
    expect(fake.ttl.has(`report:${id}`)).toBe(false)
    expect((await kvLib.listUserReports(u.uid))[0].status).toBe('complete')
  })

  it('finalising keeps the trial visitor even when the caller rebuilds the record without it', async () => {
    // Regression: the prose route builds its final record field by field and
    // once left anonId out, so a finished trial report became invisible to the
    // visitor who made it (admin-only, like a pre-account report).
    const id = '6'.repeat(16)
    const data = record()
    await kvLib.createReport(id, data)
    const { anonId, ...rebuilt } = data
    expect(anonId).toBe(TID)
    await kvLib.finaliseReport(id, { ...rebuilt, ownerId: undefined })
    const stored = await fake.get(`report:${id}`)
    expect(stored).toMatchObject({ anonId: TID, ownerId: null, status: 'complete' })
    expect(auth.canViewReport(null, stored, false, TID)).toBe(true)
    expect(fake.ttl.get(`report:${id}`)).toBe(60 * 60 * 24 * 90)
  })

  it('never claims another visitor’s report or one already owned', async () => {
    const u = await activeUser()
    await kvLib.finaliseReport('3'.repeat(16), record({ anonId: TID2 }))
    await kvLib.finaliseReport('4'.repeat(16), record({ ownerId: 'someone' }))
    await trial.recordTrialReport(TID, '3'.repeat(16))
    await trial.recordTrialReport(TID, '4'.repeat(16))
    expect(await trial.claimTrialReports(TID, u.uid)).toBe(0)
    expect((await fake.get(`report:${'4'.repeat(16)}`)).ownerId).toBe('someone')
  })

  it('counts a conversion only for a sign-up after the limit', async () => {
    for (let i = 0; i < 4; i++) await trial.reserveTrialReport(TID, request())
    const u = await activeUser()
    await trial.claimTrialReports(TID, u.uid, { signedUp: false })
    expect((await trial.trialStats()).converted).toBe(0)
    await trial.claimTrialReports(TID, u.uid, { signedUp: true })
    expect(await trial.trialStats()).toEqual({ limitHit: 1, converted: 1 })
  })
})

describe('downloads need an account', () => {
  it('refuses a trial visitor with signupRequired, allows a user or the admin', async () => {
    const res = auth.downloadRequiresAccount({ user: null, trialId: TID, isAdmin: false })
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ signupRequired: true })
    expect(auth.downloadRequiresAccount({ user: { uid: 'x' }, isAdmin: false })).toBeNull()
    expect(auth.downloadRequiresAccount({ user: null, isAdmin: true })).toBeNull()
  })

  it('requireCaller accepts a session or a trial cookie, nothing else', async () => {
    vi.stubEnv('ADMIN_CODE', 'admin-code')
    expect((await auth.requireCaller(request())).response.status).toBe(401)
    expect((await auth.requireCaller(request({ cookies: await trialCookies() }))).trialId).toBe(TID)
  })
})

describe('accounts', () => {
  it('sign-up creates an active free account, one per email', async () => {
    const u = await users.createAccount({ email: 'New@Example.org', name: '', password: 'a good long password' })
    expect(u).toMatchObject({ email: 'new@example.org', status: 'active', tier: 'free' })
    expect(await users.verifyPassword('a good long password', u.passwordHash)).toBe(true)
    await expect(users.createAccount({ email: 'new@example.org', password: 'another long one' })).rejects.toThrow('exists')
  })

  it('sign-up finishes an invited account that never set a password (same account, now active)', async () => {
    // Regression: an invitation from before public sign-up left the account
    // with no password, so sign-up said the email was taken and sign-in had no
    // password to check — the owner could not get in at all.
    const invited = await users.createUser({ email: 'invited@example.org', name: 'Invited Person' })
    const u = await users.createAccount({ email: 'Invited@Example.org', name: 'Ignored', password: 'a good long password' })
    expect(u.uid).toBe(invited.uid)
    expect(u).toMatchObject({ status: 'active', name: 'Invited Person' })
    expect(await users.verifyPassword('a good long password', u.passwordHash)).toBe(true)
    expect((await users.listUsers()).map(x => x.uid)).toEqual([invited.uid])
  })

  it('sign-up gives an unnamed invited account the name typed at sign-up', async () => {
    await users.createUser({ email: 'noname@example.org', name: '' })
    expect((await users.createAccount({ email: 'noname@example.org', name: 'Jo', password: 'a good long password' })).name).toBe('Jo')
  })

  it('sign-up never takes over an active or a disabled account', async () => {
    const active = await activeUser('taken@example.org')
    await expect(users.createAccount({ email: 'taken@example.org', password: 'another long password' })).rejects.toThrow('exists')
    expect(await users.verifyPassword('a good long password', (await users.getUser(active.uid)).passwordHash)).toBe(true)

    const disabled = await users.createUser({ email: 'blocked@example.org', name: 'B' })
    await users.setDisabled(disabled.uid, true)
    await expect(users.createAccount({ email: 'blocked@example.org', password: 'another long password' })).rejects.toThrow('exists')
    expect((await users.getUser(disabled.uid)).status).toBe('disabled')
  })

  it('admin deletion removes the account, its reports and ends its sessions', async () => {
    vi.stubEnv('ADMIN_CODE', 'admin-code')
    const u = await activeUser()
    const cookies = await sessionCookies(u)
    expect((await auth.getSessionUser(request({ cookies })))?.uid).toBe(u.uid)
    await kvLib.finaliseReport('5'.repeat(16), { projectName: 'X', ownerId: u.uid, generatedAt: new Date().toISOString() })
    expect(await users.deleteUser(u.uid)).toEqual({ reportsDeleted: 1 })
    expect(await auth.getSessionUser(request({ cookies }))).toBeNull()
    expect(fake.store.has(`report:${'5'.repeat(16)}`)).toBe(false)
    expect(await users.getUserByEmail(u.email)).toBeNull()
    expect(await users.listUsers()).toEqual([])
    // the email is free again
    expect((await activeUser()).email).toBe(u.email)
  })

  it('tier is a validated label', async () => {
    const u = await activeUser()
    expect((await users.setTier(u.uid, 'pro')).tier).toBe('pro')
    await expect(users.setTier(u.uid, 'Pro Plan!')).rejects.toThrow('bad-tier')
  })
})

describe('weekly usage', () => {
  it('labels ISO weeks across a year boundary', () => {
    expect(isoWeek(new Date('2026-09-25T12:00:00Z'))).toBe('2026-W39')
    expect(isoWeek(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53')
  })

  it('combines sign-ups and report counts per week, oldest first', () => {
    const now = new Date('2026-09-25T12:00:00Z')
    const rows = weeklyUsage({
      now, weeks: 2,
      users: [{ createdAt: '2026-09-24T09:00:00Z' }, { createdAt: '2026-09-15T09:00:00Z' }, { createdAt: 'bad' }],
      reportWeeks: { '2026-W39': { user: 4, anon: 2 } },
    })
    expect(rows).toEqual([
      { week: '2026-W38', signups: 1, userReports: 0, trialReports: 0 },
      { week: '2026-W39', signups: 1, userReports: 4, trialReports: 2 },
    ])
  })
})

const { POST } = await import('../../app/api/generate-report/route.js')

describe('generate-report with the free trial', () => {
  const answers = sample.answers

  it('lets a visitor generate three reports, then asks them to sign up', async () => {
    const cookies = await trialCookies()
    for (let i = 0; i < 3; i++) {
      const res = await POST(request({ cookies, body: { answers } }))
      const body = await res.json()
      expect(res.status).toBe(200)
      expect(body.reportId).toMatch(/^[0-9a-f]{16}$/)
      const stored = await fake.get(`report:${body.reportId}`)
      expect(stored).toMatchObject({ ownerId: null, anonId: TID, status: 'deterministic' })
    }
    const fourth = await POST(request({ cookies, body: { answers } }))
    expect(fourth.status).toBe(403)
    expect(await fourth.json()).toMatchObject({ signupRequired: true, reason: 'visitor-limit' })
    expect((await fake.smembers(`trial:${TID}:reports`))).toHaveLength(3)
    const week = await kvLib.reportStats()
    expect(Object.values(week)[0]).toEqual({ user: 0, anon: 3 })
  }, 60_000)

  it('a failed generation does not use up a free report', async () => {
    const cookies = await trialCookies()
    const res = await POST(request({ cookies, body: { answers: { ...answers, q1_5_size: -5 } } }))
    expect(res.status).toBe(400)
    expect((await trial.trialStatus(TID)).used).toBe(0)
  })

  it('refuses a request with no trial cookie and no session', async () => {
    const res = await POST(request({ body: { answers } }))
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ signupRequired: true })
  })

  it('a signed-in user is not counted against a trial and owns the report', async () => {
    const u = await activeUser()
    const res = await POST(request({ cookies: { ...(await sessionCookies(u)), ...(await trialCookies()) }, body: { answers } }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(await fake.get(`report:${body.reportId}`)).toMatchObject({ ownerId: u.uid })
    expect((await trial.trialStatus(TID)).used).toBe(0)
    expect((await kvLib.listUserReports(u.uid))[0]).toMatchObject({ reportId: body.reportId, status: 'in-progress' })
  }, 30_000)
})
