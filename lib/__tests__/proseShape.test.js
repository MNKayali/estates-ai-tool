import { describe, it, expect } from 'vitest'
import sample from './fixtures/sample-report-2026-09-23.json'
import { worstCaseReport } from '../reportFixtures.js'
import { PROSE_LIMITS, HALF_FIELDS, limitGuidance } from '../proseSchema.js'
import { proseShapeProblems, trimToLimits, limitsPromptBlock } from '../prose.js'

describe('prose shape limits', () => {
  it('rejects the sample: one 151-word key finding instead of five', () => {
    const p = proseShapeProblems(sample.aiProse, HALF_FIELDS.narrative)
    expect(p).toContain('keyFindings has 1 item; exactly 5 are required')
    expect(p.some(x => x.startsWith('keyFindings[1] has 151 words'))).toBe(true)
  })
  it('holds the public /sample report to the limits (regenerate it if this fails)', async () => {
    const live = (await import('../../public/sample/report.json')).default
    expect(proseShapeProblems(live.aiProse, [...HALF_FIELDS.narrative, ...HALF_FIELDS.risk])).toEqual([])
  })
  it('accepts content at every maximum', () => {
    const w = worstCaseReport(sample).aiProse
    expect(proseShapeProblems(w, [...HALF_FIELDS.narrative, ...HALF_FIELDS.risk])).toEqual([])
  })
  it('allows ten per cent over a word range', () => {
    const p = { executiveSummary: Array.from({ length: 142 }, () => 'w').join(' ') }
    expect(proseShapeProblems(p, ['executiveSummary'])).toEqual([])
    p.executiveSummary += ' w w'
    expect(proseShapeProblems(p, ['executiveSummary'])).toHaveLength(1)
  })
  it('drops extra items but never cuts words', () => {
    const p = { nextSteps: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], keyFindings: ['one long finding'] }
    const t = trimToLimits(p, ['nextSteps', 'keyFindings'])
    expect(t.nextSteps).toHaveLength(5)
    expect(t.keyFindings).toEqual(['one long finding'])
  })
  it('describes each limit to the model from the same table', () => {
    expect(limitGuidance('keyFindings')).toBe('exactly 5 items, each 15–35 words')
    expect(limitsPromptBlock(HALF_FIELDS.narrative)).toMatch(/keyFindings: exactly 5 items, each 15–35 words/)
    expect(PROSE_LIMITS.costNarrative.words).toEqual([45, 65])
  })

  it('rejects prose that describes the report as AI-generated, anywhere in a half', () => {
    const selfDescribed = /must not describe the report as AI-generated/
    expect(proseShapeProblems({ executiveSummary: 'This AI-generated report estimates the cost.' }, ['executiveSummary'])
      .some(x => selfDescribed.test(x))).toBe(true)
    expect(proseShapeProblems({ keyFindings: ['Figures were produced by an AI model.'] }, ['keyFindings'])
      .some(x => selfDescribed.test(x))).toBe(true)
    expect(proseShapeProblems({ riskRegister: [{ description: 'Text written by a language model may be wrong.' }] }, ['riskRegister'])
      .some(x => selfDescribed.test(x))).toBe(true)
  })

  it('still lets a project that is itself about AI be described', () => {
    const p = proseShapeProblems({ executiveSummary: 'A new AI research lab of 900 m² with a data hall for AI training.' }, ['executiveSummary'])
    expect(p.some(x => /AI-generated/.test(x))).toBe(false)
  })
})
