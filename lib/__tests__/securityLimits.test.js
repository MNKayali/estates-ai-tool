// Security review fixes (October 2026): answer size limits and the admin
// cookie's server-side expiry.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { limitAnswers, TEXT_INPUT_MAX, TEXTAREA_MAX, ANSWERS_MAX_CHARS } from '../answerLimits.js'
import { signAccessCode, verifyAccessCode, ADMIN_MAX_AGE } from '../cookieAuth.js'

describe('limitAnswers', () => {
  it('cuts free text to the questionnaire limits and leaves everything else alone', () => {
    const answers = {
      q1_0_projectName: 'x'.repeat(500),
      q2_1_objective: 'y'.repeat(5000),
      q1_5_size: 1200,
      q2_2_scopeItems: ['S-0001'],
      q2_2_quantities: { 'S-0001-01': 4 },
      q1_1_postcode: 'B15 2TT',
    }
    const { answers: out, problem } = limitAnswers(answers)
    expect(problem).toBeUndefined()
    expect(out.q1_0_projectName).toHaveLength(TEXT_INPUT_MAX)
    expect(out.q2_1_objective).toHaveLength(TEXTAREA_MAX)
    expect(out.q1_5_size).toBe(1200)
    expect(out.q2_2_scopeItems).toEqual(['S-0001'])
    expect(out.q2_2_quantities).toEqual({ 'S-0001-01': 4 })
    expect(out.q1_1_postcode).toBe('B15 2TT')
    expect(answers.q2_1_objective).toHaveLength(5000) // the input is not mutated
  })

  it('refuses an oversized payload, however it is nested', () => {
    const res = limitAnswers({ q2_2_quantities: { a: 'z'.repeat(ANSWERS_MAX_CHARS) } })
    expect(res.tooLarge).toBe(true)
    expect(res.answers).toBeUndefined()
  })

  it('refuses missing or non-object answers', () => {
    expect(limitAnswers(undefined).problem).toBeTruthy()
    expect(limitAnswers([]).problem).toBeTruthy()
    expect(limitAnswers('text').problem).toBeTruthy()
  })
})

describe('admin cookie', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('verifies a fresh token and refuses it after expiry, for another code, or in the old format', async () => {
    vi.stubEnv('COOKIE_SECRET', 'test-secret-test-secret-test-secret')
    const now = Date.UTC(2026, 9, 16)
    const token = await signAccessCode('admin-code', ADMIN_MAX_AGE, now)
    expect(await verifyAccessCode(token, 'admin-code', now + 1000)).toBe(true)
    expect(await verifyAccessCode(token, 'admin-code', now + (ADMIN_MAX_AGE + 1) * 1000)).toBe(false)
    expect(await verifyAccessCode(token, 'other-code', now + 1000)).toBe(false)
    // moving the expiry forward breaks the signature
    const [exp, sig] = token.split('.')
    expect(await verifyAccessCode(`${Number(exp) + 86400}.${sig}`, 'admin-code', now)).toBe(false)
    // the pre-October 2026 format (a bare HMAC, no expiry) is no longer accepted
    expect(await verifyAccessCode(sig, 'admin-code', now)).toBe(false)
  })
})
