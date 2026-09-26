/**
 * Sentry never receives an email, a password, a sign-up name or the sensitive
 * questionnaire answers — including when a request body arrives as raw JSON.
 */
import { describe, it, expect } from 'vitest'
import { scrubEvent } from '../sentryScrub.js'

describe('scrubEvent', () => {
  it('redacts sign-up and sign-in bodies, raw JSON or parsed', () => {
    const body = { email: 'a@b.co', password: 'a good long password', name: 'Jo Bloggs', acceptTerms: true }
    for (const data of [body, JSON.stringify(body)]) {
      const e = scrubEvent({ request: { data } })
      const out = typeof e.request.data === 'string' ? JSON.parse(e.request.data) : e.request.data
      expect(out).toEqual({ email: '[redacted]', password: '[redacted]', name: '[redacted]', acceptTerms: true })
    }
  })

  it('redacts answers in a raw questionnaire body and credentials in a URL', () => {
    const e = scrubEvent({
      request: {
        url: 'https://x.test/a?email=a@b.co&password=p&from=/reports',
        data: JSON.stringify({ answers: { q1_0_projectName: 'Secret site', q1_2_projectType: 'Refurbishment' } }),
      },
    })
    expect(JSON.parse(e.request.data).answers).toEqual({ q1_0_projectName: '[redacted]', q1_2_projectType: 'Refurbishment' })
    expect(e.request.url).toBe('https://x.test/a?email=[redacted]&password=[redacted]&from=/reports')
  })

  it('keeps browser and OS names, and drops the user', () => {
    const e = scrubEvent({ contexts: { os: { name: 'Windows' }, browser: { name: 'Chrome' } }, user: { email: 'a@b.co' } })
    expect(e.contexts).toEqual({ os: { name: 'Windows' }, browser: { name: 'Chrome' } })
    expect(e.user).toBeUndefined()
  })
})
