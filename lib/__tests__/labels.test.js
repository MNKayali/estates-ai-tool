import { describe, it, expect } from 'vitest'
import { areaLabel, areaQuestionLabel, areaHelpText, isExternalWorks } from '../labels.js'

// External Works has no internal floor area, so the same q1_5_size answer is
// asked for, printed and described as SITE area for that project type only.
describe('labels — area wording by project type', () => {
  it('calls Q1.5 site area for External Works and GIFA for everything else', () => {
    expect(areaLabel('External works only')).toBe('Site area')
    expect(areaQuestionLabel('External works only')).toContain('site area')
    expect(areaHelpText('External works only')).toMatch(/external site/i)
    for (const pt of ['Refurbishment', 'New Build', 'Fit-out', 'Extension', 'Other or mixed', '', undefined]) {
      expect(areaLabel(pt)).toBe('GIFA')
      expect(areaQuestionLabel(pt)).toContain('GIFA')
    }
  })

  it('matches External Works case-insensitively', () => {
    expect(isExternalWorks('external works')).toBe(true)
    // The retired label a 90-day-old KV report may still hold.
    expect(isExternalWorks('External Works')).toBe(true)
    expect(isExternalWorks('Other or mixed')).toBe(false)
  })
})
