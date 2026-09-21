# Honest Progress and Optionality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the questionnaire feeling longer than it is — an honest progress percentage, an honest required/optional split, and the two optional blocks at the end of step 4 behind disclosures.

**Architecture:** `lib/questionSets.js` already knows which questions each project type is asked. It gains the per-section inventory, the required set, and the counting helpers; the questionnaire renders from those instead of hand-written conditions. No engine, rate or option value is touched.

**Tech Stack:** Next.js 16.3.5 (App Router), React, Vitest, Node 24.

**Spec:** `docs/superpowers/specs/2026-09-21-slice3-progress-and-optionality-design.md`

## Global Constraints

- **Never rename an answer option string.** 23 NRM1 Tab 3 rules match option text literally. This slice changes which answers are *demanded*, never what they say.
- **Every required test must be gated by `isQuestionShown`.** A hidden question that is still demanded deadlocks the section with an error the user cannot see or clear — the exact defect slice 2 shipped and had to fix.
- `lib/questionSets.js` stays pure JS: no React, no node-only imports.
- No percentages, rates or durations in code. (The progress percentage is a UI fraction of section count, not a project figure.)
- Frontend design rules: the established font trio, palette tokens, never flat-white backgrounds, no new UI fonts. `QCard`, `Label`, `HelpText` already exist and are used throughout.
- Verifying a change means `npm run build`, `npm test`, and the browser.

---

### Task 1: Section inventory, required set, and counting helpers

**Files:**
- Modify: `lib/questionSets.js`
- Modify: `lib/__tests__/questionSets.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `QUESTIONS_BY_SECTION: Record<1|2|3|4, string[]>`
  - `isQuestionRequired(questionKey: string, projectType: string): boolean`
  - `sectionCounts(section: number, projectType: string, answers: object): { total: number, required: number }`
  - `unansweredRequired(section: number, projectType: string, answers: object): string[]`
  - `progressPercent(section: number, totalSections: number): number`

- [ ] **Step 1: Write the failing tests**

Append to `lib/__tests__/questionSets.test.js`, and add the new names to the existing import at the top of that file:

```js
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
})

describe('questionSets — progressPercent', () => {
  it('is 0 on the first section and never overstates', () => {
    expect(progressPercent(1, 4)).toBe(0)
    expect(progressPercent(2, 4)).toBe(25)
    expect(progressPercent(3, 4)).toBe(50)
    expect(progressPercent(4, 4)).toBe(75)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/__tests__/questionSets.test.js`
Expected: FAIL — the new exports do not exist.

- [ ] **Step 3: Implement**

Add to `lib/questionSets.js`. First, extend `HIDDEN_FOR` so the storeys question is counted correctly — it is rendered only for the three types that ask it:

```js
  q1_2_storeys:           ['Fit-out', 'External works only', 'Demolition only', 'Other or mixed'],
```

Then append:

```js
// ── Section inventory, for counting what is ahead ────────────────────────────
// Listed in render order. Only used for counts and for the required test —
// the questionnaire still renders each question itself.
export const QUESTIONS_BY_SECTION = {
  1: ['q1_0_projectName', 'q1_1_postcode', 'q1_2_projectType', 'q1_2_storeys',
      'q1_3_buildingUse', 'q1_4_buildingAge', 'q1_6_heightOver18m', 'q1_5_size'],
  2: ['q2_1_objective', 'q2_3_interventionLevel', 'q2_2_scopeItems',
      'q2_4_specLevel', 'q2_5_standards'],
  3: ['q3_1_knownIssues', 'q3_2_previousWorks', 'q3_3_surveys', 'q3_4_planningConsents',
      'q3_5_accessConstraints', 'q3_6_occupation', 'q3_7_additionalContext',
      'q3_8_siteContext'],
  4: ['q4_1_targetDate', 'q4_0_startDate', 'q4_3_budget', 'q4_4_priorities',
      'q4_5_designStage', 'q4_6_phasing', 'q4_7_funding',
      'q5_1_financialBenefit', 'q5_2_annualBenefit', 'q6_2_instructions'],
}

/**
 * Questions whose blank answer silently becomes a priced assumption.
 *
 * September 2026: the six Section 3 entries and q4_5_designStage were all
 * marked optional while a blank meant "no risk uplift", "no planning
 * development cost", "the building is empty", and so on — assumptions the user
 * never made. Each already has a one-click None / Unsure / No-constraints
 * option, so requiring them costs a tap and buys an honest report.
 *
 * Anything NOT here is genuinely optional: blank is either harmless or already
 * disclosed in the report ("assumed: the report date", "no budget comparison").
 */
const REQUIRED_KEYS = new Set([
  'q1_0_projectName', 'q1_1_postcode', 'q1_2_projectType', 'q1_3_buildingUse',
  'q1_4_buildingAge', 'q1_5_size',
  'q2_1_objective', 'q2_2_scopeItems', 'q2_3_interventionLevel', 'q2_4_specLevel',
  'q3_1_knownIssues', 'q3_3_surveys', 'q3_4_planningConsents',
  'q3_5_accessConstraints', 'q3_6_occupation', 'q3_8_siteContext',
  'q4_5_designStage',
])

/**
 * Required, but ONLY where the question is actually shown. A question demanded
 * while hidden deadlocks its section with an error the user can neither see nor
 * clear — that is what slice 2 shipped and had to fix, and every caller must go
 * through this function rather than test the set directly.
 */
export function isQuestionRequired(questionKey, projectType) {
  return REQUIRED_KEYS.has(questionKey) && isQuestionShown(questionKey, projectType)
}

// Two questions in section 1 and one in section 4 depend on an ANSWER rather
// than the project type, so counting needs the answers as well.
function isOnScreen(questionKey, projectType, answers) {
  if (!isQuestionShown(questionKey, projectType)) return false
  if (questionKey === 'q1_6_heightOver18m') return showsHeightQuestion(answers?.q1_2_storeys)
  if (questionKey === 'q5_2_annualBenefit') {
    const b = answers?.q5_1_financialBenefit
    const list = Array.isArray(b) ? b : (b ? [b] : [])
    return list.length > 0 && !list.some(v => String(v).startsWith('No direct'))
  }
  return true
}

function isAnswered(value) {
  if (Array.isArray(value)) return value.length > 0
  if (value === null || value === undefined) return false
  return String(value).trim() !== ''
}

/** How many questions this section holds for this user, and how many need an answer. */
export function sectionCounts(section, projectType, answers = {}) {
  const keys = (QUESTIONS_BY_SECTION[section] || [])
    .filter(k => isOnScreen(k, projectType, answers))
  return {
    total: keys.length,
    required: keys.filter(k => isQuestionRequired(k, projectType)).length,
  }
}

/** The required questions in this section that still have no answer. */
export function unansweredRequired(section, projectType, answers = {}) {
  return (QUESTIONS_BY_SECTION[section] || [])
    .filter(k => isOnScreen(k, projectType, answers))
    .filter(k => isQuestionRequired(k, projectType))
    .filter(k => !isAnswered(answers[k]))
}

/**
 * Progress by section, not by question — the user asked for page-level.
 * Reaches 100% only on submit, so it never overstates how far along someone is.
 */
export function progressPercent(section, totalSections) {
  if (!totalSections) return 0
  return Math.round(((section - 1) / totalSections) * 100)
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/__tests__/questionSets.test.js && npm test`
Expected: PASS, including every pre-existing test.

- [ ] **Step 5: Commit**

```bash
git add lib/questionSets.js lib/__tests__/questionSets.test.js
git commit -m "Add the section inventory, required set and counting helpers"
```

---

### Task 2: Wire the questionnaire

**Files:**
- Modify: `app/questionnaire/page.jsx`

**Interfaces:**
- Consumes: `isQuestionRequired`, `sectionCounts`, `unansweredRequired`, `progressPercent` from `lib/questionSets.js` (Task 1).
- Produces: nothing other modules import.

- [ ] **Step 1: Extend the import**

Add the four new names to the existing `lib/questionSets.js` import at the top of the file.

- [ ] **Step 2: Validate sections 3 and 4 from the required set**

`validateSection` has branches for `sec === 1` and `sec === 2` only. Rewrite the whole function's tail so all four sections share one loop, **keeping every existing section 1 and 2 check exactly as it is** — they carry specific messages and extra rules (the GIFA check, the scope-items check) that must not be lost.

Immediately before `validateSection` returns, add:

```js
    // Sections 3 and 4 had no validation at all. Every key here has a one-click
    // None / Unsure option, and isQuestionRequired refuses to demand a question
    // that is not shown, so this cannot deadlock a section.
    const LABELS = {
      q3_1_knownIssues:       'Known issues',
      q3_3_surveys:           'Surveys and reports available',
      q3_4_planningConsents:  'Planning consent',
      q3_5_accessConstraints: 'Access constraints',
      q3_6_occupation:        'Occupation during works',
      q3_8_siteContext:       'Site and building context',
      q4_5_designStage:       'Design stage already reached',
    }
    for (const key of unansweredRequired(sec, answers.q1_2_projectType, answers)) {
      if (!errs[key] && LABELS[key]) {
        errs[key] = `${LABELS[key]} is required — pick an option, including "None" if that is the answer`
      }
    }
```

- [ ] **Step 3: Mark the newly-required questions in the UI**

Change `<Label>` to `<Label required>` on Q3.1, Q3.3, Q3.4, Q3.5, Q3.6, Q3.8 and Q4.5, and add a validation-error paragraph under each, matching the pattern already used elsewhere in the file:

```jsx
              {validationErrors.q3_1_knownIssues && <p className="mt-2 text-sm" style={{ color: 'var(--danger)' }}>{validationErrors.q3_1_knownIssues}</p>}
```

Repeat with the matching key for each of the seven.

- [ ] **Step 4: Progress percentage and the header line**

In the progress-bar block, after the `SECTIONS.map(...)` closes and before the wrapping `</div>`, add:

```jsx
          <div style={{ marginTop: 8, textAlign: 'right' }}>
            <span className="mono" style={{ fontSize: 10, letterSpacing: '.06em', color: 'var(--text-mute)' }}>
              {progressPercent(section, SECTIONS.length)}% COMPLETE
            </span>
          </div>
```

In the section header, replace the `Section {section} of {SECTIONS.length}` span's contents with the counts, computed just above the `return` of the component:

```jsx
  const counts = sectionCounts(section, answers.q1_2_projectType, answers)
  const openRequired = unansweredRequired(section, answers.q1_2_projectType, answers)
```

```jsx
              Section {section} of {SECTIONS.length} · {counts.total} question{counts.total === 1 ? '' : 's'} · {counts.required === 0 ? 'none required' : `${counts.required} need an answer`}
```

- [ ] **Step 5: The remaining-count line above Continue**

Immediately above the navigation `<div className="mt-10 flex gap-3">`, add:

```jsx
        {section < SECTIONS.length && (
          <p role="status" style={{ marginTop: 18, textAlign: 'center', fontSize: 13, color: openRequired.length ? 'var(--amber-deep)' : 'var(--text-mute)' }}>
            {openRequired.length
              ? `${openRequired.length} answer${openRequired.length === 1 ? '' : 's'} still needed in this section`
              : 'All set — continue when you’re ready.'}
          </p>
        )}
```

- [ ] **Step 6: Put the two optional blocks behind disclosures**

Add near the other `useState` calls:

```jsx
  // Q5 and Q6.1 are entirely optional and sit at the end of the longest step.
  // Collapsed by default so the default last step is seven questions rather
  // than ten — but opened when a draft already holds an answer, so a returning
  // user never finds their own input hidden.
  const [showFinancialCase, setShowFinancialCase] = useState(false)
  const [showReportInstructions, setShowReportInstructions] = useState(false)
  useEffect(() => {
    if ((answers.q5_1_financialBenefit || []).length > 0 || answers.q5_2_annualBenefit) setShowFinancialCase(true)
    if (answers.q6_2_instructions) setShowReportInstructions(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
```

Add this disclosure button component next to the other small components in the file:

```jsx
function Disclosure({ open, onToggle, label, note }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '13px 16px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
        border: '1.5px solid var(--border)', background: 'var(--tint)',
        fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--ink)',
      }}>
      <span style={{ fontWeight: 700, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .18s ease', display: 'inline-block' }}>›</span>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <span style={{ color: 'var(--text-mute)', fontSize: 13 }}>{note}</span>
    </button>
  )
}
```

Replace the `SubHead` for "Financial case" with the disclosure, and wrap the Q5.1 and Q5.2 cards in `{showFinancialCase && ( … )}`:

```jsx
            <Disclosure open={showFinancialCase} onToggle={() => setShowFinancialCase(v => !v)}
              label="Add a financial case" note="Optional — gives the report a payback and ROI section" />
```

Do the same for Q6.1 with the "Your report" `SubHead`:

```jsx
            <Disclosure open={showReportInstructions} onToggle={() => setShowReportInstructions(v => !v)}
              label="Add instructions for the report" note="Optional — tone, emphasis or specific content" />
```

Keep the existing "Your report" explanatory note visible outside the disclosure — it tells the user what the report contains, which is not an input.

- [ ] **Step 7: Verify**

Run: `npm run build` — expected clean.
Run: `npm test` — expected all green.

- [ ] **Step 8: Commit**

```bash
git add app/questionnaire/page.jsx
git commit -m "Questionnaire: honest progress, required Section 3, optional blocks folded"
```

---

### Task 3: Verify the slice

**Files:** none modified unless a check fails.

- [ ] **Step 1: Build, lint, test**

```bash
npm run build
npm run lint
npm test
```

Expected: clean; no new lint errors (~30 pre-existing are known and out of scope); all Vitest green with the two workbook-pending skips.

- [ ] **Step 2: The baseline gate**

```bash
node scripts/baseline.mjs save after-slice3
node scripts/baseline.mjs diff before-slice3 after-slice3
```

**Expected: IDENTICAL across all 76 scenarios.** This slice changes which answers are demanded, never what any of them say. Movement means an option array was touched by accident.

- [ ] **Step 3: Browser check**

Start the `estates-ai-tool-open` preview, then:

1. **Section 1** shows `0% COMPLETE`; reaching Section 2 shows `25%`, Section 3 `50%`, Section 4 `75%`.
2. The header line on a **New Build** Section 3 reports fewer questions than on a **Refurbishment**, matching what is actually rendered.
3. **Section 3 cannot be passed** with its six required questions blank — each shows its own error, and each clears with one tap on "None"/"Unsure"/"No access constraints".
4. **No section deadlocks.** Walk all seven project types to the end. Particular attention to External works only and Demolition only, which slice 2 deadlocked.
5. The remaining-count line counts down as answers are given and switches to "All set".
6. On a **fresh form**, the financial-case and report-instruction disclosures are collapsed; on a **draft that already has** a benefit or instructions, they are expanded.

- [ ] **Step 4: Report the results. No commit** — baseline snapshots are gitignored.

---

## Self-review notes

| Spec section | Task |
|---|---|
| §1 reclassify required/optional | 1 (`REQUIRED_KEYS`, `isQuestionRequired`), 2 steps 2–3 |
| §1 required only where shown | 1 (test), 2 step 2 |
| §2 progress percentage by section | 1 (`progressPercent`), 2 step 4 |
| §3 say what is ahead | 1 (`sectionCounts`, `unansweredRequired`), 2 steps 4–5 |
| §4 rebalance step 4 | 2 step 6 |
| Verification incl. baseline IDENTICAL | 3 |

Two additions beyond the spec, both made during fix rounds and both needed for
the same reason:

1. `q1_2_storeys` joins `HIDDEN_FOR` in Task 1. It is already rendered only for
   New Build, Refurbishment and Extension, but that condition was written
   inline in the questionnaire, so the counting helpers would otherwise
   overcount section 1 for the other four types.
2. `q2_3_interventionLevel` also joins `HIDDEN_FOR` (New Build, External works
   only, Demolition only, Other or mixed — i.e. shown only for Refurbishment,
   Fit-out and Extension). The questionnaire gates Q2.3 on an inline `isRefurb`
   condition rather than `isQuestionShown()`, so without this entry the
   counting helpers would overstate section 2's total and required count for
   the four project types that never see the question.
