# Per-Project-Type Question Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Section 3 ask each project type only the questions and options that apply to it, derive Building Safety Act status from Section 1 instead of asking it as a tickbox, and stop three questions being asked where they cannot apply.

**Architecture:** A new pure module `lib/questionSets.js` holds the per-type question visibility map and option lists as data, so the questionnaire renders from a table rather than from scattered conditionals. `lib/siteContext.js`'s `isHigherRiskBuilding()` is the single chokepoint both engines already read through — changing that one function propagates the new derivation to the Tab 3 rules and the `BS1` programme stage with no other engine change.

**Tech Stack:** Next.js 16.3.5 (App Router), React, Vitest, Node 24.

**Spec:** `docs/superpowers/specs/2026-09-21-slice2-question-gating-design.md`

## Global Constraints

- **Never rename an existing answer option string.** 23 NRM1 Tab 3 rules match option text literally (`Q3.1 = Asbestos known or suspected`, `Q3.6 = Fully occupied throughout`, `Q3.5 includes Restricted working hours`, `Q3.4 = Full planning (3–4%, use 3.5%)`, …). Removing an option from a type's list is safe. Adding one is safe but inert. Renaming one silently breaks a money rule.
- **Q3.6's stored values never change** — `Fully occupied`, `Partially occupied`, `Vacant or decanted`. Only its question label and help text vary by type.
- `lib/questionSets.js` must be **pure JS: no React, no node-only imports.** Same constraint as `lib/buildingUse.js` and `lib/projectTypes.js`.
- **No percentages, rates or durations in code.**
- The seven project-type values are exactly: `New Build`, `Extension`, `Refurbishment`, `Fit-out`, `External works only`, `Demolition only`, `Other or mixed`.
- Verifying a change means `npm run build`, `npm test`, and exercising the flow in the browser with the `estates-ai-tool-open` preview config.

---

### Task 0: Capture the before-baseline

**Files:**
- Create: `scripts/__baseline__/before-slice2.json` (generated, gitignored — do not commit it)

- [ ] **Step 1: Confirm the tracked tree is clean**

Run: `git status --short | grep -v "^??"`
Expected: no output.

- [ ] **Step 2: Capture**

Run: `node scripts/baseline.mjs save before-slice2`
Expected: `saved 76 scenarios`.

- [ ] **Step 3: No commit**

`scripts/__baseline__` is in `.gitignore`. Do not `git add -f` it. Report the file exists and move on.

---

### Task 1: The question-set module

**Files:**
- Create: `lib/questionSets.js`
- Create: `lib/__tests__/questionSets.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `isQuestionShown(questionKey: string, projectType: string): boolean`
  - `knownIssuesFor(projectType: string): string[]`
  - `surveysFor(projectType: string, buildingAge: string): string[]`
  - `occupationCopyFor(projectType: string): { label: string, help: string }`
  - `showsHeightQuestion(storeys: string|number): boolean`
  - `KNOWN_ISSUE_NONE: string` — `'None identified'`
  - `SURVEY_NONE: string` — `'None'`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/questionSets.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/__tests__/questionSets.test.js`
Expected: FAIL — cannot resolve `../questionSets.js`.

- [ ] **Step 3: Write the module**

Create `lib/questionSets.js`:

```js
/**
 * lib/questionSets.js — which questions each project type asks, and with which
 * options.
 *
 * Pure JS, no React and no node-only imports: imported by the questionnaire
 * (a 'use client' component) and available to server code. Same constraint as
 * lib/buildingUse.js and lib/projectTypes.js.
 *
 * ── The rule that governs every list in this file ────────────────────────────
 * The NRM1 Tab 3 percentage rules match answer option TEXT literally — 23 rules
 * quote a Section 3 answer ("Q3.1 = Asbestos known or suspected", "Q3.6 =
 * Fully occupied throughout"). So:
 *   · removing an option from a type's list is safe — the rule never fires
 *   · adding one is safe but inert until the workbook gains a rule for it
 *   · renaming one silently breaks the money rule that quotes it
 * Never rename. The options marked NEW below carry no Tab 3 rule yet and are
 * captured for the narrative only.
 */

// ── Q3.1 known issues ────────────────────────────────────────────────────────
export const KNOWN_ISSUE_NONE = 'None identified'
const UNSURE = 'Unsure — surveys needed'

// Original nine, every one of which a Tab 3 rule quotes except the none option.
const BUILDING_ISSUES = [
  'Asbestos known or suspected',
  'Structural concerns',
  'Ageing or inadequate M&E',
  'Damp or water ingress',
  'Drainage issues',
  'Fire safety deficiencies',
]
// NEW — no Tab 3 rule yet.
const GROUND_ISSUES = [
  'Made ground or fill',
  'High water table',
  'Underground services or obstructions',
  'Trees or hedgerow on site',
]

const KNOWN_ISSUES_BY_TYPE = {
  'New Build': [
    'Contaminated land', ...GROUND_ISSUES,
    'Existing structures on site to demolish',   // NEW
  ],
  'Refurbishment': [...BUILDING_ISSUES, 'Contaminated land'],
  // A fit-out often sits in an old building, so damp and structural stay.
  // Contamination is the landlord's problem, not the fit-out's.
  'Fit-out': [...BUILDING_ISSUES],
  // The widest list of any type — an extension carries both sets of risk.
  'Extension': [
    ...BUILDING_ISSUES, 'Contaminated land', ...GROUND_ISSUES,
    'Existing structures on site to demolish',
  ],
  'External works only': [
    'Contaminated land', ...GROUND_ISSUES,
    'Existing hardstanding to break out',        // NEW
  ],
  'Demolition only': [
    'Asbestos known or suspected', 'Structural concerns', 'Contaminated land',
    'Structures attached to neighbouring buildings',  // NEW
  ],
}

const ALL_KNOWN_ISSUES = [
  ...BUILDING_ISSUES, 'Contaminated land', ...GROUND_ISSUES,
  'Existing structures on site to demolish',
  'Existing hardstanding to break out',
  'Structures attached to neighbouring buildings',
]

/** Q3.1 options for a project type. Always ends with the none option. */
export function knownIssuesFor(projectType) {
  const base = KNOWN_ISSUES_BY_TYPE[projectType] || ALL_KNOWN_ISSUES
  return [...base, UNSURE, KNOWN_ISSUE_NONE]
}

// ── Q3.3 surveys ─────────────────────────────────────────────────────────────
export const SURVEY_NONE = 'None'
const ASBESTOS_MANAGEMENT = 'Asbestos management survey'
const ASBESTOS_RD = 'Asbestos refurbishment & demolition survey'

// NEW — no Tab 3 rule yet.
const SITE_SURVEYS = [
  'Topographic',
  'Ground investigation',
  'Contamination survey (Phase 1 / Phase 2)',
  'Ecological appraisal',
  'Biodiversity Net Gain assessment',
  'Arboricultural survey (BS5837)',
  'Utilities / statutory services search',
]

const SURVEYS_BY_TYPE = {
  'New Build': [...SITE_SURVEYS, 'Flood risk assessment', 'Archaeological assessment'],
  'Refurbishment': [
    ASBESTOS_MANAGEMENT, ASBESTOS_RD,
    'Structural', 'Condition', 'Topographic', 'Ground investigation',
    'Energy audit', 'Fire risk assessment',
  ],
  'Fit-out': [ASBESTOS_MANAGEMENT, ASBESTOS_RD, 'Condition', 'Fire risk assessment'],
  'Extension': [
    ASBESTOS_MANAGEMENT, ASBESTOS_RD, 'Structural', 'Condition',
    ...SITE_SURVEYS, 'Flood risk assessment', 'Archaeological assessment',
  ],
  'External works only': [...SITE_SURVEYS, 'Drainage / percolation testing'],
  'Demolition only': [ASBESTOS_RD, 'Structural', 'Ecological appraisal'],
}

const ALL_SURVEYS = [
  ASBESTOS_MANAGEMENT, ASBESTOS_RD, 'Structural', 'Condition',
  ...SITE_SURVEYS, 'Flood risk assessment', 'Archaeological assessment',
  'Drainage / percolation testing', 'Energy audit', 'Fire risk assessment',
]

/**
 * Q3.3 options for a project type, gated on Q1.4 building age.
 *
 * Asbestos was fully banned in the UK in 1999, so a post-2000 building has
 * nothing to survey and offering the option invites a cost for nothing. The
 * building-age bands exist for exactly this — see their comment in the
 * questionnaire — it was simply never wired to this question.
 */
export function surveysFor(projectType, buildingAge) {
  const base = SURVEYS_BY_TYPE[projectType] || ALL_SURVEYS
  const postMillennium = String(buildingAge || '').trim() === 'Post-2000'
  const filtered = postMillennium ? base.filter(s => !/asbestos/i.test(s)) : base
  return [...filtered, SURVEY_NONE, 'Other']
}

// ── Q3.6 occupation — COPY ONLY. The stored values never change, because four
// Tab 3 rules quote them verbatim.
const OCCUPATION_COPY = {
  'New Build': {
    label: 'Q3.6 — Is the surrounding site in use during the works?',
    help: 'A live campus or operating site around the plot constrains working hours and deliveries, and is allowed for in preliminaries.',
  },
  'Extension': {
    label: 'Q3.6 — Does the existing building stay in use during the works?',
    help: 'Building an extension alongside an occupied building constrains noise, dust, access and working hours.',
  },
  'External works only': {
    label: 'Q3.6 — Does the site stay in use during the works?',
    help: 'A car park or access road resurfaced in sections costs more than one closed and done in a single pass.',
  },
  'Demolition only': {
    label: 'Q3.6 — Are adjacent buildings occupied, or the surrounding site operational?',
    help: 'The building being demolished is empty by definition. What drives cost is what is next to it.',
  },
}
const OCCUPATION_DEFAULT = {
  label: 'Q3.6 — Occupation during works',
  help: 'Affects construction duration and preliminary costs.',
}

/** Label and help text for Q3.6. The OPTIONS are unchanged for every type. */
export function occupationCopyFor(projectType) {
  return OCCUPATION_COPY[projectType] || OCCUPATION_DEFAULT
}

// ── Question visibility ──────────────────────────────────────────────────────
// questionKey → project types that do NOT ask it. Anything absent is asked by
// everyone, so an unknown project type shows the whole form.
const HIDDEN_FOR = {
  q3_2_previousWorks:     ['New Build', 'External works only'],
  q1_4_buildingAge:       ['New Build', 'External works only'],
  q2_4_specLevel:         ['External works only', 'Demolition only'],
  q5_1_financialBenefit:  ['Demolition only'],
  q5_2_annualBenefit:     ['Demolition only'],
}

export function isQuestionShown(questionKey, projectType) {
  const hidden = HIDDEN_FOR[questionKey]
  if (!hidden) return true
  return !hidden.includes(projectType)
}

/**
 * Q1.6 building height appears at 5 storeys, the point at which 18 m first
 * becomes possible. Storeys alone cannot answer the question — the statute is
 * 18 m OR 7 storeys, whichever comes first, and a six-storey hospital with
 * tall floor-to-floors clears 18 m easily.
 */
export function showsHeightQuestion(storeys) {
  return (Number(storeys) || 0) >= 5
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/__tests__/questionSets.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/questionSets.js lib/__tests__/questionSets.test.js
git commit -m "Add lib/questionSets.js — per-type questions and options"
```

---

### Task 2: Derive higher-risk status instead of asking it

**Files:**
- Modify: `lib/siteContext.js` — `SITE_CONTEXT_OPTIONS`, `isHigherRiskBuilding`, `hrbLikelyFromAnswers`
- Test: `lib/__tests__/siteContext.test.js` (create if absent)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `isHigherRiskBuilding(answers)` now reads `answers.q1_6_heightOver18m`, `answers.q1_2_storeys` and `answers.q1_3_buildingUse` — **and still honours a legacy Q3.8 tick.** Both `lib/costCalculator.js:408` and `lib/programmeCalculator.js:678` call it and need no change.

- [ ] **Step 1: Write the failing test**

Create or append to `lib/__tests__/siteContext.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { isHigherRiskBuilding, SITE_CONTEXT_OPTIONS } from '../siteContext.js'

describe('siteContext — higher-risk derivation', () => {
  it('is true at 7 storeys with a residential use', () => {
    expect(isHigherRiskBuilding({
      q1_2_storeys: '7', q1_3_buildingUse: 'Residential',
    })).toBe(true)
  })

  it('is true under 7 storeys when the height answer says 18m or taller', () => {
    expect(isHigherRiskBuilding({
      q1_2_storeys: '6', q1_6_heightOver18m: 'Yes', q1_3_buildingUse: 'Healthcare',
    })).toBe(true)
  })

  // The use gate matters as much as the height: no residential units, not an HRB.
  it('is false for a ten-storey office', () => {
    expect(isHigherRiskBuilding({
      q1_2_storeys: '10', q1_6_heightOver18m: 'Yes', q1_3_buildingUse: 'Commercial offices',
    })).toBe(false)
  })

  it('is false when short and not tall enough', () => {
    expect(isHigherRiskBuilding({
      q1_2_storeys: '4', q1_6_heightOver18m: 'No', q1_3_buildingUse: 'Residential',
    })).toBe(false)
  })

  it('treats "Not sure" about height as not confirmed', () => {
    expect(isHigherRiskBuilding({
      q1_2_storeys: '5', q1_6_heightOver18m: 'Not sure', q1_3_buildingUse: 'Residential',
    })).toBe(false)
  })

  // Reports in KV live 90 days and were generated when this was a Q3.8 tick.
  it('still honours a legacy Q3.8 tick', () => {
    expect(isHigherRiskBuilding({
      q3_8_siteContext: ['Higher-risk building — 7+ storeys or 18 m+, residential / care / hospital use'],
    })).toBe(true)
  })

  it('no longer offers higher-risk as a Q3.8 option', () => {
    expect(SITE_CONTEXT_OPTIONS.some(o => /higher-risk/i.test(o))).toBe(false)
    expect(SITE_CONTEXT_OPTIONS).toHaveLength(4)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/__tests__/siteContext.test.js`
Expected: FAIL — the derivation does not exist and the option is still offered.

- [ ] **Step 3: Implement**

In `lib/siteContext.js`, remove the higher-risk entry from `SITE_CONTEXT_OPTIONS`, leaving four. **Keep `SITE_CONTEXT.higherRisk`** — the legacy check below still needs it, and `hasSiteContext` reads it.

Replace `isHigherRiskBuilding` and `hrbLikelyFromAnswers` with:

```js
const HRB_USES = ['Residential', 'Student accommodation (PBSA / halls)', 'Healthcare']

/**
 * Higher-risk building under the Building Safety Act 2022: 18 m or 7+ storeys,
 * AND a residential, care-home or hospital use. A ten-storey office is not one.
 *
 * September 2026: derived from Section 1 rather than ticked in Q3.8. Height is
 * asked (Q1.6) because storeys alone cannot answer it — the statute is 18 m OR
 * 7 storeys, whichever comes first.
 *
 * The legacy branch is load-bearing: reports sit in KV for 90 days and
 * /api/compare re-runs the whole pipeline on their stored answers, so a report
 * generated when this was a Q3.8 tick must keep resolving to true.
 */
export function isHigherRiskBuilding(answers) {
  if (hasSiteContext(answers, 'higherRisk')) return true
  const tallEnough = String(answers?.q1_6_heightOver18m || '').trim() === 'Yes'
    || Number(answers?.q1_2_storeys) >= 7
  return tallEnough && HRB_USES.includes(answers?.q1_3_buildingUse)
}

/**
 * The answers so far make the height question worth asking — used only to
 * decide whether to show Q1.6's explanatory note, never by an engine.
 */
export function hrbLikelyFromAnswers(answers) {
  return (Number(answers?.q1_2_storeys) || 0) >= 5
    && HRB_USES.includes(answers?.q1_3_buildingUse)
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/__tests__/siteContext.test.js && npm test`
Expected: PASS. The questionnaire still compiles because `hrbLikelyFromAnswers` keeps its name and signature.

- [ ] **Step 5: Commit**

```bash
git add lib/siteContext.js lib/__tests__/siteContext.test.js
git commit -m "Derive higher-risk building status from Section 1"
```

---

### Task 3: Wire the questionnaire

**Files:**
- Modify: `app/questionnaire/page.jsx` — `STORAGE_SCHEMA_VERSION` (line 20), `KNOWN_ISSUES` / `SURVEY_OPTIONS` (lines 195–208), Q1.4 render (~line 1156), the new Q1.6, Q2.4 render (~line 1554), Q3.1/Q3.2/Q3.3/Q3.6/Q3.8 renders (~lines 1611–1700), Q5.1/Q5.2 renders (~line 1817)

**Interfaces:**
- Consumes: `isQuestionShown`, `knownIssuesFor`, `surveysFor`, `occupationCopyFor`, `showsHeightQuestion`, `KNOWN_ISSUE_NONE`, `SURVEY_NONE` from Task 1; `hrbLikelyFromAnswers` and `isHigherRiskBuilding` from Task 2.
- Produces: a new answer key `q1_6_heightOver18m` with values `'Yes'`, `'No'`, `'Not sure'`.

- [ ] **Step 1: Import and delete the static option arrays**

Add to the import block near the top:

```js
import {
  isQuestionShown, knownIssuesFor, surveysFor, occupationCopyFor,
  showsHeightQuestion, KNOWN_ISSUE_NONE, SURVEY_NONE,
} from '../../lib/questionSets.js'
```

Change the existing `siteContext` import to add `isHigherRiskBuilding`:

```js
import { SITE_CONTEXT_OPTIONS, SITE_CONTEXT_NONE, hrbLikelyFromAnswers, isHigherRiskBuilding } from '../../lib/siteContext.js'
```

Delete `const KNOWN_ISSUES = [...]` and `const SURVEY_OPTIONS = [...]` (lines 195–208). Leave `PLANNING_OPTIONS`, `ACCESS_OPTIONS` and `OCCUPATION_OPTIONS` exactly as they are — their options do not vary by type.

- [ ] **Step 2: Add Q1.6, and gate Q1.4**

Q1.4's existing wrapper is `{answers.q1_2_projectType !== 'New Build' && (`. Replace that condition with:

```jsx
            {isQuestionShown('q1_4_buildingAge', answers.q1_2_projectType) && (
```

Then, immediately after the Q1.4 block closes and before Q1.5, add:

```jsx
            {showsHeightQuestion(answers.q1_2_storeys) && (
              <QCard>
                <Label>Q1.6 — Building height</Label>
                <HelpText>Is the building 18 metres or taller, measured to the floor level of the top storey?</HelpText>
                <RadioGroup
                  options={['Yes', 'No', 'Not sure']}
                  value={answers.q1_6_heightOver18m}
                  onChange={v => set('q1_6_heightOver18m', v)}
                  ariaLabel="Is the building 18 metres or taller"
                />
                {/* The consequence, not the jargon — "higher-risk building"
                    means nothing to most clients, and the gateway is what
                    actually changes their programme. */}
                {isHigherRiskBuilding(answers) && (
                  <p role="status" style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, fontSize: 13, border: '1px solid var(--amber)', backgroundColor: 'rgba(196,134,26,.07)', color: 'var(--ink)' }}>
                    This is a <strong>higher-risk building</strong> under the Building Safety Act. Construction cannot start until Gateway 2 approval is granted, which is added to the programme.
                  </p>
                )}
              </QCard>
            )}
```

- [ ] **Step 3: Gate Q2.4, Q5.1 and Q5.2**

Q2.4's wrapper is `{specLevelsForType.length > 0 && (`. Change it to:

```jsx
            {specLevelsForType.length > 0 && isQuestionShown('q2_4_specLevel', answers.q1_2_projectType) && (
```

Wrap the Q5.1 `<QCard>` in `{isQuestionShown('q5_1_financialBenefit', answers.q1_2_projectType) && ( … )}`. The Q5.2 card is already wrapped in `{showRoiAmount && (` — change that to `{showRoiAmount && isQuestionShown('q5_2_annualBenefit', answers.q1_2_projectType) && (`.

- [ ] **Step 4: Make Section 3 type-aware**

Q3.1 — swap the static array for the per-type call and the new none constant:

```jsx
              <Label>Q3.1 — Known issues</Label>
              <HelpText>Select all that apply. These trigger risk allowance adjustments.</HelpText>
              <CheckboxGroup options={knownIssuesFor(answers.q1_2_projectType)} values={answers.q3_1_knownIssues}
                onChange={v => set('q3_1_knownIssues', applyNoneMutex(answers.q3_1_knownIssues || [], v, KNOWN_ISSUE_NONE))} />
```

Q3.2 — wrap its whole `<QCard>`:

```jsx
            {isQuestionShown('q3_2_previousWorks', answers.q1_2_projectType) && (
              <QCard>
                … existing content unchanged …
              </QCard>
            )}
```

Q3.3 — per-type options gated on building age, and the none constant:

```jsx
              <CheckboxGroup options={surveysFor(answers.q1_2_projectType, answers.q1_4_buildingAge)} values={answers.q3_3_surveys}
                onChange={v => set('q3_3_surveys', applyNoneMutex(answers.q3_3_surveys || [], v, SURVEY_NONE))} />
```

Q3.6 — copy from the module, options untouched:

```jsx
              <Label>{occupationCopyFor(answers.q1_2_projectType).label}</Label>
              <HelpText>{occupationCopyFor(answers.q1_2_projectType).help}</HelpText>
              <RadioGroup options={OCCUPATION_OPTIONS} value={answers.q3_6_occupation} onChange={v => set('q3_6_occupation', v)} />
```

Q3.8 — delete the whole `{hrbLikelyFromAnswers(answers) && !(answers.q3_8_siteContext || [])…}` hint block that follows the `CheckboxGroup`. That hint now lives under Q1.6, and the option it pointed at no longer exists.

- [ ] **Step 5: Prune answers that the current type no longer offers**

A user who picks Refurbishment, ticks "Damp or water ingress", then switches to New Build would otherwise keep a stored answer the form no longer shows — and the cost engine would still price it. Add this effect next to the existing scope-pruning effect (around line 800):

```jsx
  // Section 3 option lists vary by project type. Switching type must drop any
  // ticked option the new type does not offer, or the engines price an answer
  // the user can no longer see. Same reasoning as the scope-pruning effect above.
  useEffect(() => {
    setAnswers(prev => {
      const pt = prev.q1_2_projectType
      if (!pt) return prev
      const issues = knownIssuesFor(pt)
      const surveys = surveysFor(pt, prev.q1_4_buildingAge)
      const keptIssues = (prev.q3_1_knownIssues || []).filter(v => issues.includes(v))
      const keptSurveys = (prev.q3_3_surveys || []).filter(v => surveys.includes(v))
      if (keptIssues.length === (prev.q3_1_knownIssues || []).length
        && keptSurveys.length === (prev.q3_3_surveys || []).length) return prev
      return { ...prev, q3_1_knownIssues: keptIssues, q3_3_surveys: keptSurveys }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers.q1_2_projectType, answers.q1_4_buildingAge])
```

- [ ] **Step 6: Bump the storage version**

At line 20, change `3` to `4` and add to the comment block:

```js
// v4 (September 2026): Section 3 option lists now vary by project type, Q3.8
// lost its higher-risk option, and Q1.6 (building height) is new. A v3 draft
// can hold ticked options the current type no longer offers.
const STORAGE_SCHEMA_VERSION = 4
```

- [ ] **Step 7: Verify**

Run: `npm run build` — expected clean.
Run: `npm test` — expected all green.

- [ ] **Step 8: Commit**

```bash
git add app/questionnaire/page.jsx
git commit -m "Questionnaire: per-type Section 3, and Q1.6 building height"
```

---

### Task 4: Verify the whole slice

**Files:** none modified unless a check fails.

- [ ] **Step 1: Build, lint, test**

```bash
npm run build
npm run lint
npm test
```

Expected: clean; no new lint errors (pre-existing `<a>`/`<Link>` and unescaped-quote items are known and out of scope); all Vitest green with the two workbook-pending skips.

- [ ] **Step 2: The baseline gate**

```bash
node scripts/baseline.mjs save after-slice2
node scripts/baseline.mjs diff before-slice2 after-slice2
```

**Expected: IDENTICAL across all 76 scenarios.**

This slice adds and removes questions but changes no rule, no rate, and no option value that a Tab 3 rule quotes. Any movement means an option string was altered by accident — the one mistake here that is easy to make and expensive to miss. **If anything moved, stop and find the renamed string before going further.**

- [ ] **Step 3: Browser check**

Start the `estates-ai-tool-open` preview, then:

1. **New Build** — Q1.4 building age absent; Q3.1 titled "Known issues" offering contaminated land, made ground, trees, underground services, and NOT damp or asbestos; Q3.2 absent; Q3.3 offering ground investigation and Biodiversity Net Gain, not condition or asbestos; Q3.6 asking about the surrounding site.
2. **Refurbishment, building age `1980–1999`** — Q3.3 offers both "Asbestos management survey" and "Asbestos refurbishment & demolition survey".
3. **Same, building age `Post-2000`** — both asbestos options disappear.
4. **Fit-out** — Q3.1 offers damp and structural but NOT contaminated land.
5. **External works only** — Q1.4 absent, Q3.2 absent, Q2.4 specification level absent, Q3.6 asking about the site.
6. **Demolition only** — Q2.4 absent; Q5.1 financial benefit absent; Q3.3 offering the R&D asbestos survey but not the management one; Q3.6 asking about adjacent buildings.
7. **Q1.6** — with storeys `4` it does not appear; with `5` it does. Set storeys `7`, building use `Residential` → the Gateway 2 consequence note appears. Change building use to `Commercial offices` → the note disappears.
8. **Q3.8** — four options, no higher-risk one, on every type.
9. **Pruning** — pick Refurbishment, tick "Damp or water ingress", switch to New Build, return to Section 3: the tick is gone rather than invisibly retained.

- [ ] **Step 4: No commit**

Baseline snapshots are gitignored. Report the results.

---

## Self-review notes

Checked against the spec:

| Spec section | Task |
|---|---|
| §1 Q3.1 retitled, options per type | 1 (`knownIssuesFor`), 3 step 4 |
| §2 Q3.2 hidden on New Build / External works only | 1 (`HIDDEN_FOR`), 3 step 4 |
| §3 Q3.3 per type, asbestos split, gated on building age | 1 (`surveysFor`), 3 step 4 |
| §4 Q3.4, Q3.5, Q3.7 unchanged | none — correctly untouched |
| §5 Q3.6 re-worded, values unchanged | 1 (`occupationCopyFor`), 3 step 4 |
| §6 Q3.8 loses higher-risk | 2 |
| §7 BSA moves to Section 1, derived | 2, 3 step 2 |
| §8 Q1.4 / Q2.4 / Q5.x fixes | 1 (`HIDDEN_FOR`), 3 steps 2–3 |
| Never rename an option a Tab 3 rule quotes | Task 1's `TAB3_QUOTED` test; Task 4 step 2 baseline gate |
| Stored reports keep working | Task 2's legacy Q3.8 test |

One addition beyond the spec: the answer-pruning effect in Task 3 step 5. The
spec describes which options each type offers but not what happens to answers
already given when the type changes. Without pruning, a stored tick the form no
longer shows would still be priced — the same class of bug the scope picker
already guards against with its own pruning effect.
