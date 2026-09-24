import { describe, it, expect } from 'vitest'
import sample from '../../public/sample/report.json'
import { worstCaseReport } from '../reportFixtures.js'
import { PROSE_LIMITS, HALF_FIELDS, limitGuidance } from '../proseSchema.js'
import { proseShapeProblems, trimToLimits, limitsPromptBlock } from '../prose.js'

describe('prose shape limits', () => {
  it('rejects the sample: one 151-word key finding instead of five', () => {
    const p = proseShapeProblems(sample.aiProse, HALF_FIELDS.narrative)
    expect(p).toContain('keyFindings has 1 item; exactly 5 are required')
    expect(p.some(x => x.startsWith('keyFindings[1] has 151 words'))).toBe(true)
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
})
