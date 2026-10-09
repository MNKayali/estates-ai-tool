import { describe, it, expect } from 'vitest'
import { aOrAn } from '../article.js'
import { programmeNarrativeLines } from '../reportContent.js'

describe('aOrAn', () => {
  it.each([[8, 'An'], [11, 'An'], [18, 'An'], [80, 'An'], [800, 'An'], [11000, 'An'], [6, 'A'], [12, 'A'], [1, 'A'], [110, 'A'], [180, 'A']])('%i → %s', (n, w) => {
    expect(aOrAn(n)).toBe(w)
  })
  it('lower case on request', () => expect(aOrAn(8, false)).toBe('an'))
  it('the programme narrative reads "An 11-week planning determination"', () => {
    const lines = programmeNarrativeLines({ stages: [], planningWeeks: 11, planningAlongside: 'Stage 3' })
    expect(lines.join(' ')).toMatch(/An 11-week planning determination/)
  })
})
