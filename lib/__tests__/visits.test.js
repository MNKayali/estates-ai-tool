/**
 * Visitor counts for the admin dashboard (October 2026): source naming, page
 * folding, the daily cookieless visitor, sign-up attribution and the summary.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createFakeKv } from './helpers/fakeKv.js'

const fake = createFakeKv()
vi.mock('@vercel/kv', () => ({ kv: fake }))

const { classifySource, normalisePath, isUntrackedPath, deviceOf, isBot, summarise, topRows } = await import('../visitStats.js')
const visits = await import('../visits.js')

function req(ip = '1.2.3.4', ua = 'Mozilla/5.0 (Windows NT 10.0) Chrome/130') {
  return new Request('http://localhost/api/track', { headers: { 'x-forwarded-for': ip, 'user-agent': ua } })
}

beforeEach(() => { fake.store.clear(); fake.ttl.clear() })

describe('classifySource', () => {
  it('names the common referrers', () => {
    expect(classifySource({ referrer: 'https://www.google.co.uk/' })).toBe('Google')
    expect(classifySource({ referrer: 'https://gemini.google.com/app' })).toBe('Gemini')
    expect(classifySource({ referrer: 'https://www.linkedin.com/feed/' })).toBe('LinkedIn')
    expect(classifySource({ referrer: 'https://lnkd.in/abc' })).toBe('LinkedIn')
    expect(classifySource({ referrer: 'https://t.co/xyz' })).toBe('X (Twitter)')
    expect(classifySource({ referrer: 'https://chatgpt.com/' })).toBe('ChatGPT')
    expect(classifySource({ referrer: 'https://mail.google.com/' })).toBe('Email')
  })
  it('prefers the utm_source tag and keeps an unknown site by its host', () => {
    expect(classifySource({ referrer: 'https://www.google.com/', utmSource: 'linkedin' })).toBe('LinkedIn')
    expect(classifySource({ utmSource: 'RICS Newsletter!' })).toBe('rics newsletter')
    expect(classifySource({ referrer: 'https://www.example.ac.uk/news' })).toBe('example.ac.uk')
  })
  it('treats no referrer and this site itself as Direct', () => {
    expect(classifySource({})).toBe('Direct')
    expect(classifySource({ referrer: 'https://www.projento.co.uk/x', ownHost: 'www.projento.co.uk' })).toBe('Direct')
  })
})

describe('page and device helpers', () => {
  it('folds report ids and drops the query', () => {
    expect(normalisePath('/report/a1b2c3d4e5f6g7?pdf=1')).toBe('/report/[id]')
    expect(normalisePath('/questionnaire/')).toBe('/questionnaire')
    expect(normalisePath('/')).toBe('/')
  })
  it('leaves the admin area out', () => {
    expect(isUntrackedPath('/admin')).toBe(true)
    expect(isUntrackedPath('/administer')).toBe(false)
  })
  it('tells phones, tablets and bots apart', () => {
    expect(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Mobile/15E148')).toBe('Mobile')
    expect(deviceOf('Mozilla/5.0 (iPad; CPU OS 18_0)')).toBe('Tablet')
    expect(deviceOf('Mozilla/5.0 (Windows NT 10.0) Chrome/130')).toBe('Desktop')
    expect(isBot('Googlebot/2.1')).toBe(true)
    expect(isBot('')).toBe(true)
    expect(isBot('Mozilla/5.0 (Windows NT 10.0) Chrome/130')).toBe(false)
  })
})

describe('recording and reading visits', () => {
  const day = new Date('2026-10-17T10:00:00Z')

  it('counts one visitor once a day however many pages they view', async () => {
    await visits.recordView({ request: req(), path: '/', landing: true, source: 'Google', country: 'GB', device: 'Desktop', date: day })
    await visits.recordView({ request: req(), path: '/questionnaire', landing: false, date: day })
    await visits.recordView({ request: req('5.6.7.8'), path: '/', landing: true, source: 'Direct', device: 'Mobile', date: day })
    await visits.recordEngagement({ ms: 90_000, date: day })
    await visits.recordEngagement({ ms: 30_000, date: day })
    await visits.recordEngagement({ ms: 100, date: day }) // too short to count

    const s = await visits.visitStats({ days: 7, now: day })
    expect(s.totals.visitors).toBe(2)
    expect(s.totals.visits).toBe(2)
    expect(s.totals.views).toBe(3)
    expect(s.totals.questionnaireVisitors).toBe(1)
    expect(s.totals.avgVisitSeconds).toBe(60)
    expect(s.totals.pagesPerVisit).toBe(1.5)
    expect(s.sources.map(r => r.name).sort()).toEqual(['Direct', 'Google'])
    expect(s.countries).toEqual([{ name: 'GB', count: 1 }])
    expect(s.daily.at(-1)).toMatchObject({ date: '2026-10-17', visitors: 2, visits: 2, views: 3 })
  })

  it('the visitor code changes from one day to the next', () => {
    expect(visits.visitorHash(req(), day)).not.toBe(visits.visitorHash(req(), new Date('2026-10-18T10:00:00Z')))
  })

  it('credits a sign-up to the source that brought the visitor, not a later direct reload', async () => {
    await visits.recordView({ request: req(), path: '/', landing: true, source: 'LinkedIn', date: day })
    await visits.recordView({ request: req(), path: '/', landing: true, source: 'Direct', date: day })
    expect(await visits.sourceForRequest(req(), day)).toBe('LinkedIn')
    expect(await visits.sourceForRequest(req('9.9.9.9'), day)).toBe(null)

    await visits.recordSignup('LinkedIn', day)
    const s = await visits.visitStats({ days: 1, now: day })
    expect(s.sources.find(r => r.name === 'LinkedIn')).toMatchObject({ count: 1, signups: 1 })
    expect(s.totals.signups).toBe(1)
  })

  it('upgrades a Direct first visit when the visitor later arrives from a real source', async () => {
    await visits.recordView({ request: req(), path: '/', landing: true, source: 'Direct', date: day })
    await visits.recordView({ request: req(), path: '/', landing: true, source: 'Google', date: day })
    expect(await visits.sourceForRequest(req(), day)).toBe('Google')
  })
})

describe('summarise and topRows', () => {
  it('returns blanks rather than dividing by zero', () => {
    expect(summarise({ days: [], visitors: 0 })).toMatchObject({ avgVisitSeconds: null, pagesPerVisit: null, signupRate: null })
  })
  it('adds the days up and ranks', () => {
    expect(topRows([{ a: 1, b: 5 }, { a: 7 }], 1)).toEqual([{ name: 'a', count: 8 }])
  })
})

describe('the account keeps its source', () => {
  it('stores the source given at sign-up and shows it to the admin', async () => {
    const users = await import('../users.js')
    const u = await users.createAccount({ email: 'a@example.com', name: 'A', password: 'long enough password', source: 'LinkedIn' })
    expect(users.publicUser(await users.getUser(u.uid)).source).toBe('LinkedIn')
    const v = await users.createAccount({ email: 'b@example.com', name: 'B', password: 'long enough password' })
    expect(users.publicUser(v).source).toBe(null)
  })
})
