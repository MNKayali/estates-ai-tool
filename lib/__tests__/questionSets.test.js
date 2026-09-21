import { describe, it, expect } from 'vitest'
import {
  isQuestionShown, knownIssuesFor, surveysFor, occupationCopyFor,
  showsHeightQuestion, KNOWN_ISSUE_NONE, SURVEY_NONE,
} from '../questionSets.js'

// The exact strings 23 NRM1 Tab 3 rules match on. If any of these stops being
// offered by the type that needs it, a percentage rule silently stops firing.
const TAB3_QUOTED = [
  'Asbestos known or suspected', 'Contaminated land', 'Structural concerns',
  'Ageing or inadequate M&E', 'Drainage issues', 'Damp or water ingress',
  'Fire safety deficiencies', 'Unsure — surveys needed',
]

describe('questionSets — visibility', () => {
  it('hides previous works on New Build and External works only', () => {
    expect(isQuestionShown('q3_2_previousWorks', 'New Build')).toBe(false)
    expect(isQuestionShown('q3_2_previousWorks', 'External works only')).toBe(false)
    expect(isQuestionShown('q3_2_previousWorks', 'Refurbishment')).toBe(true)
    expect(isQuestionShown('q3_2_previousWorks', 'Demolition only')).toBe(true)
  })

  it('hides building age on New Build and External works only', () => {
    expect(isQuestionShown('q1_4_buildingAge', 'New Build')).toBe(false)
    expect(isQuestionShown('q1_4_buildingAge', 'External works only')).toBe(false)
    expect(isQuestionShown('q1_4_buildingAge', 'Demolition only')).toBe(true)
  })

  it('hides specification level on External works only and Demolition only', () => {
    expect(isQuestionShown('q2_4_specLevel', 'External works only')).toBe(false)
    expect(isQuestionShown('q2_4_specLevel', 'Demolition only')).toBe(false)
    expect(isQuestionShown('q2_4_specLevel', 'New Build')).toBe(true)
  })

  it('hides the financial benefit questions on Demolition only', () => {
    expect(isQuestionShown('q5_1_financialBenefit', 'Demolition only')).toBe(false)
    expect(isQuestionShown('q5_2_annualBenefit', 'Demolition only')).toBe(false)
    expect(isQuestionShown('q5_1_financialBenefit', 'New Build')).toBe(true)
  })

  it('shows anything it has no rule for', () => {
    expect(isQuestionShown('q3_4_planningConsents', 'Demolition only')).toBe(true)
    expect(isQuestionShown('q3_7_additionalContext', 'External works only')).toBe(true)
  })

  it('treats an unknown project type as showing everything', () => {
    expect(isQuestionShown('q3_2_previousWorks', 'Mixed')).toBe(true)
    expect(isQuestionShown('q2_4_specLevel', '')).toBe(true)
  })
})

describe('questionSets — known issues', () => {
  it('gives New Build site options and no building-fabric ones', () => {
    const o = knownIssuesFor('New Build')
    expect(o).toContain('Contaminated land')
    expect(o).toContain('Underground services or obstructions')
    expect(o).toContain('Trees or hedgerow on site')
    expect(o).not.toContain('Damp or water ingress')
    expect(o).not.toContain('Asbestos known or suspected')
  })

  it('leaves Refurbishment with the full original nine', () => {
    const o = knownIssuesFor('Refurbishment')
    for (const s of TAB3_QUOTED) expect(o).toContain(s)
    expect(o).toContain('None identified')
    expect(o).toHaveLength(9)
  })

  it('drops only contaminated land for Fit-out', () => {
    const o = knownIssuesFor('Fit-out')
    expect(o).not.toContain('Contaminated land')
    expect(o).toContain('Damp or water ingress')
    expect(o).toContain('Structural concerns')
  })

  it('gives Extension both the building and the ground options', () => {
    const o = knownIssuesFor('Extension')
    expect(o).toContain('Asbestos known or suspected')
    expect(o).toContain('Made ground or fill')
    expect(o.length).toBeGreaterThan(knownIssuesFor('Refurbishment').length)
  })

  it('gives Demolition only its four plus unsure and none', () => {
    const o = knownIssuesFor('Demolition only')
    expect(o).toContain('Asbestos known or suspected')
    expect(o).toContain('Structures attached to neighbouring buildings')
    expect(o).not.toContain('Ageing or inadequate M&E')
  })

  it('always ends with the none option, for the mutex', () => {
    for (const pt of ['New Build', 'Refurbishment', 'Fit-out', 'Extension',
      'External works only', 'Demolition only', 'Other or mixed']) {
      expect(knownIssuesFor(pt).at(-1)).toBe(KNOWN_ISSUE_NONE)
    }
  })
})

describe('questionSets — surveys', () => {
  it('offers new-build site surveys and no existing-building ones', () => {
    const o = surveysFor('New Build', '')
    expect(o).toContain('Ground investigation')
    expect(o).toContain('Biodiversity Net Gain assessment')
    expect(o).not.toContain('Condition')
    expect(o).not.toContain('Asbestos management survey')
  })

  it('splits the asbestos option into management and R&D', () => {
    const o = surveysFor('Refurbishment', '1980–1999')
    expect(o).toContain('Asbestos management survey')
    expect(o).toContain('Asbestos refurbishment & demolition survey')
    expect(o).not.toContain('Asbestos register')
  })

  it('hides both asbestos options for a post-2000 building', () => {
    for (const pt of ['Refurbishment', 'Fit-out', 'Extension', 'Demolition only']) {
      const o = surveysFor(pt, 'Post-2000')
      expect(o.some(s => /asbestos/i.test(s))).toBe(false)
    }
  })

  it('still offers asbestos for a pre-2000 building', () => {
    expect(surveysFor('Refurbishment', 'Pre-1900').some(s => /asbestos/i.test(s))).toBe(true)
    expect(surveysFor('Refurbishment', '1900–1979').some(s => /asbestos/i.test(s))).toBe(true)
  })

  it('gives Demolition only the R&D survey but not the management one', () => {
    const o = surveysFor('Demolition only', '1980–1999')
    expect(o).toContain('Asbestos refurbishment & demolition survey')
    expect(o).not.toContain('Asbestos management survey')
  })

  it('keeps the None option last but one, with Other last', () => {
    for (const pt of ['New Build', 'Refurbishment', 'Demolition only']) {
      const o = surveysFor(pt, '1980–1999')
      expect(o.at(-2)).toBe(SURVEY_NONE)
      expect(o.at(-1)).toBe('Other')
    }
  })
})

describe('questionSets — occupation copy', () => {
  it('asks about the surrounding site on a New Build', () => {
    expect(occupationCopyFor('New Build').label).toMatch(/site|campus/i)
  })

  it('asks about adjacent buildings on a Demolition only', () => {
    expect(occupationCopyFor('Demolition only').label).toMatch(/adjacent|surrounding/i)
  })

  it('always returns a label and a help string', () => {
    for (const pt of ['New Build', 'Refurbishment', 'Fit-out', 'Extension',
      'External works only', 'Demolition only', 'Other or mixed', 'Mixed', '']) {
      const c = occupationCopyFor(pt)
      expect(typeof c.label).toBe('string')
      expect(c.label.length).toBeGreaterThan(5)
      expect(typeof c.help).toBe('string')
    }
  })
})

describe('questionSets — the height question', () => {
  it('appears at 5 storeys and above, not below', () => {
    expect(showsHeightQuestion('4')).toBe(false)
    expect(showsHeightQuestion('5')).toBe(true)
    expect(showsHeightQuestion('7')).toBe(true)
    expect(showsHeightQuestion(6)).toBe(true)
  })

  it('handles a missing or junk value as not shown', () => {
    expect(showsHeightQuestion('')).toBe(false)
    expect(showsHeightQuestion(undefined)).toBe(false)
  })
})
