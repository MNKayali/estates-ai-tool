import { describe, it, expect } from 'vitest'
import {
  isQuestionShown, knownIssuesFor, surveysFor, occupationCopyFor,
  showsHeightQuestion, KNOWN_ISSUE_NONE, SURVEY_NONE,
  isQuestionRequired, sectionCounts, unansweredRequired, progressPercent,
  QUESTIONS_BY_SECTION,
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

describe('questionSets — required set', () => {
  it('makes the six silently-defaulted Section 3 questions required', () => {
    for (const k of ['q3_1_knownIssues', 'q3_3_surveys', 'q3_4_planningConsents',
      'q3_5_accessConstraints', 'q3_6_occupation', 'q3_8_siteContext']) {
      expect(isQuestionRequired(k, 'Refurbishment')).toBe(true)
    }
  })

  it('makes design stage required', () => {
    expect(isQuestionRequired('q4_5_designStage', 'New Build')).toBe(true)
  })

  it('leaves the genuinely optional ones optional', () => {
    for (const k of ['q3_2_previousWorks', 'q3_7_additionalContext', 'q2_5_standards',
      'q4_1_targetDate', 'q4_0_startDate', 'q4_3_budget', 'q4_4_priorities',
      'q4_6_phasing', 'q4_7_funding', 'q5_1_financialBenefit', 'q6_2_instructions']) {
      expect(isQuestionRequired(k, 'Refurbishment')).toBe(false)
    }
  })

  // The defect slice 2 shipped: a question demanded while hidden deadlocks the
  // section with an error the user can neither see nor clear.
  it('is never required where the question is not shown', () => {
    expect(isQuestionRequired('q3_2_previousWorks', 'New Build')).toBe(false)
    expect(isQuestionRequired('q1_4_buildingAge', 'External works only')).toBe(false)
    expect(isQuestionRequired('q2_4_specLevel', 'Demolition only')).toBe(false)
    // q2_3_interventionLevel is required but only shown for types that have it in HIDDEN_FOR
    expect(isQuestionRequired('q2_3_interventionLevel', 'New Build')).toBe(false)
    expect(isQuestionRequired('q2_3_interventionLevel', 'Fit-out')).toBe(true)
  })
})

describe('questionSets — counts', () => {
  const BASE = { q1_2_projectType: 'Refurbishment', q1_2_storeys: '2' }

  it('counts fewer questions in section 3 for a New Build than a Refurbishment', () => {
    const nb = sectionCounts(3, 'New Build', { q1_2_projectType: 'New Build' })
    const rf = sectionCounts(3, 'Refurbishment', BASE)
    expect(nb.total).toBeLessThan(rf.total)
    expect(rf.required).toBe(6)
  })

  it('never reports more required than total', () => {
    for (const pt of ['New Build', 'Extension', 'Refurbishment', 'Fit-out',
      'External works only', 'Demolition only', 'Other or mixed']) {
      for (const s of [1, 2, 3, 4]) {
        const c = sectionCounts(s, pt, { q1_2_projectType: pt, q1_2_storeys: '2' })
        expect(c.required).toBeLessThanOrEqual(c.total)
        expect(c.total).toBeGreaterThan(0)
      }
    }
  })

  it('counts the height question only when it is on screen', () => {
    const short = sectionCounts(1, 'New Build', { q1_2_projectType: 'New Build', q1_2_storeys: '2' })
    const tall  = sectionCounts(1, 'New Build', { q1_2_projectType: 'New Build', q1_2_storeys: '6' })
    expect(tall.total).toBe(short.total + 1)
  })

  it('does not count the height question for types that do not ask storeys', () => {
    // Fit-out does not ask storeys (it is in HIDDEN_FOR), so height question never shows.
    const fitout = sectionCounts(1, 'Fit-out', { q1_2_projectType: 'Fit-out', q1_2_storeys: '6' })
    const newbuild = sectionCounts(1, 'New Build', { q1_2_projectType: 'New Build', q1_2_storeys: '6' })
    expect(fitout.total).toBeLessThan(newbuild.total)
  })

  it('handles q5_2_annualBenefit: non-array financial benefit should not show it', () => {
    // When q5_1_financialBenefit is a bare string (not an array),
    // q5_2_annualBenefit should not appear — as an on-screen optional extra,
    // now that q5_1/q5_2/q6_2 are excluded from `total` regardless (see the
    // optionalExtras tests below), since both live behind the same disclosure.
    const withArray = sectionCounts(4, 'New Build', {
      q1_2_projectType: 'New Build', q5_1_financialBenefit: ['Reduced energy']
    })
    const withBareString = sectionCounts(4, 'New Build', {
      q1_2_projectType: 'New Build', q5_1_financialBenefit: 'Reduced energy'
    })
    expect(withArray.optionalExtras).toBe(withBareString.optionalExtras + 1)
    expect(withArray.total).toBe(withBareString.total)
  })

  // Q5.1/Q5.2/Q6.1 sit behind the two disclosures at the end of Section 4 (see
  // Disclosure in app/questionnaire/page.jsx) — the fold this branch shipped
  // takes the step from ten questions to seven. `total` must agree with that,
  // with the folded, on-screen ones reported separately.
  it('excludes the disclosure extras from total and counts them separately, on a fresh Refurbishment', () => {
    const c = sectionCounts(4, 'Refurbishment', { q1_2_projectType: 'Refurbishment' })
    expect(c.total).toBe(7)
    expect(c.required).toBe(1)
    expect(c.optionalExtras).toBe(2)
  })

  it('reports no optional extras in sections 1 through 3', () => {
    for (const s of [1, 2, 3]) {
      const c = sectionCounts(s, 'Refurbishment', { q1_2_projectType: 'Refurbishment' })
      expect(c.optionalExtras).toBe(0)
    }
  })
})

describe('questionSets — unansweredRequired', () => {
  it('lists every unanswered required question in the section', () => {
    const open = unansweredRequired(3, 'Refurbishment', { q1_2_projectType: 'Refurbishment' })
    expect(open).toHaveLength(6)
    expect(open).toContain('q3_1_knownIssues')
  })

  it('treats an empty array as unanswered and a ticked one as answered', () => {
    const a = { q1_2_projectType: 'Refurbishment', q3_1_knownIssues: [] }
    expect(unansweredRequired(3, 'Refurbishment', a)).toContain('q3_1_knownIssues')
    const b = { ...a, q3_1_knownIssues: ['None identified'] }
    expect(unansweredRequired(3, 'Refurbishment', b)).not.toContain('q3_1_knownIssues')
  })

  it('treats whitespace as unanswered', () => {
    const a = { q1_2_projectType: 'Refurbishment', q3_6_occupation: '   ' }
    expect(unansweredRequired(3, 'Refurbishment', a)).toContain('q3_6_occupation')
  })

  it('treats zero as unanswered (page rejects it for q1_5_size)', () => {
    const a = { q1_2_projectType: 'Refurbishment', q1_5_size: 0 }
    expect(unansweredRequired(1, 'Refurbishment', a)).toContain('q1_5_size')
    const b = { q1_2_projectType: 'Refurbishment', q1_5_size: '0' }
    expect(unansweredRequired(1, 'Refurbishment', b)).toContain('q1_5_size')
  })
})

describe('questionSets — progressPercent', () => {
  it('is 0 on the first section and never overstates', () => {
    expect(progressPercent(1, 4)).toBe(0)
    expect(progressPercent(2, 4)).toBe(25)
    expect(progressPercent(3, 4)).toBe(50)
    expect(progressPercent(4, 4)).toBe(75)
  })
})
