# Q1.2 Project-Type Axis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Q1.2's eight mismatched project types with seven on a single fabric axis, and fix the rate-family defect that makes substructure unpriceable on a mixed project.

**Architecture:** The project-type constants currently live in two hand-synchronised copies (`app/questionnaire/page.jsx` and `app/api/suggest-scope/route.js`). This plan extracts them into one shared, dependency-free module, `lib/projectTypes.js`, which both import — removing the "must stay in step" hazard rather than adding a third copy of it. The rate fallback is a single branch in `getRateForElement`, scoped to the Other-or-mixed family only.

**Tech Stack:** Next.js 16.3.5 (App Router), React, Vitest, SheetJS (`xlsx` from the SheetJS CDN), Node 24.

**Spec:** `docs/superpowers/specs/2026-09-21-project-type-axis-design.md`

## Global Constraints

- `lib/projectTypes.js` must stay **pure JS with no React and no node-only imports** — it is imported by both a `'use client'` component and server route handlers. Same constraint as `lib/buildingUse.js`; see its header comment.
- **No percentages, rates or durations in code.** This slice adds none.
- The seven option strings are exact and are the stored answer values: `New Build`, `Extension`, `Refurbishment`, `Fit-out`, `External works only`, `Demolition only`, `Other or mixed`.
- `getRateForElement`, `selectConstructionId` and `lib/labels.js` match on **lowercase substrings** — `Demolition only` and `External works only` continue to resolve with no change to those functions. Do not "helpfully" convert them to exact matches.
- The fallback is **not disclosed in the client-facing report**. It is an internal diagnostic only.
- Verifying a change means `npm run build`, `npm test`, and exercising the flow in the browser.
- Use the `estates-ai-tool-open` preview config for browser checks — the default config requires the access code.

---

### Task 0: Capture the before-baseline

This must happen before any source change. The whole safety argument for this
slice is "baseline is IDENTICAL afterwards", which is worthless if the before
snapshot was taken after an edit.

**Files:**
- Create: `scripts/__baseline__/before-slice1/` (generated)

- [ ] **Step 1: Confirm the working tree is clean**

Run: `git status --short`
Expected: no modified tracked files.

- [ ] **Step 2: Capture the baseline**

Run: `node scripts/baseline.mjs --out before-slice1`

If the flag name differs, read the header of `scripts/baseline.mjs` and use its
documented invocation. Expected: ~75 scenarios written.

- [ ] **Step 3: Commit the snapshot**

```bash
git add scripts/__baseline__/before-slice1
git commit -m "Capture baseline before the project-type axis change"
```

---

### Task 1: Shared project-type module

**Files:**
- Create: `lib/projectTypes.js`
- Create: `lib/__tests__/projectTypes.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PROJECT_TYPES: Array<{ value: string, help: string }>` — the seven options in display order.
  - `PROJECT_TYPE_VALUES: string[]` — just the `value` strings.
  - `VISIBLE_GROUPS: Record<string, number[]>` — NRM1 groups shown per type.
  - `rateFamilyFor(projectType: string): 'newBuild' | 'extension' | 'externalWorks' | 'refurb'`
  - `usesRateFallback(projectType: string): boolean` — true only for `Other or mixed`.
  - `priceableFor(item: object, projectType: string): boolean`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/projectTypes.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  PROJECT_TYPES, PROJECT_TYPE_VALUES, VISIBLE_GROUPS,
  rateFamilyFor, usesRateFallback, priceableFor,
} from '../projectTypes.js'

describe('projectTypes — the option list', () => {
  it('offers exactly the seven agreed types, in order', () => {
    expect(PROJECT_TYPE_VALUES).toEqual([
      'New Build', 'Extension', 'Refurbishment', 'Fit-out',
      'External works only', 'Demolition only', 'Other or mixed',
    ])
  })

  it('no longer offers the two removed types', () => {
    expect(PROJECT_TYPE_VALUES).not.toContain('Renewable Energy')
    expect(PROJECT_TYPE_VALUES).not.toContain('Mixed')
  })

  it('gives every option a help line', () => {
    for (const t of PROJECT_TYPES) {
      expect(typeof t.help).toBe('string')
      expect(t.help.length).toBeGreaterThan(10)
    }
  })

  it('has a visible-groups entry for every option', () => {
    for (const v of PROJECT_TYPE_VALUES) {
      expect(Array.isArray(VISIBLE_GROUPS[v])).toBe(true)
    }
  })

  it('keeps Fit-out to the three non-fabric groups', () => {
    expect(VISIBLE_GROUPS['Fit-out']).toEqual([3, 4, 5])
  })
})

describe('projectTypes — rate family', () => {
  it('maps each type to its family', () => {
    expect(rateFamilyFor('New Build')).toBe('newBuild')
    expect(rateFamilyFor('Extension')).toBe('extension')
    expect(rateFamilyFor('External works only')).toBe('externalWorks')
    expect(rateFamilyFor('Refurbishment')).toBe('refurb')
    expect(rateFamilyFor('Fit-out')).toBe('refurb')
    expect(rateFamilyFor('Demolition only')).toBe('refurb')
    expect(rateFamilyFor('Other or mixed')).toBe('refurb')
  })

  // Reports in KV live for 90 days and may hold a retired value.
  it('still resolves retired values stored in old reports', () => {
    expect(rateFamilyFor('Mixed')).toBe('refurb')
    expect(rateFamilyFor('Renewable Energy')).toBe('refurb')
    expect(rateFamilyFor('External Works')).toBe('externalWorks')
    expect(rateFamilyFor('Demolition')).toBe('refurb')
  })

  it('enables the fallback for Other or mixed only', () => {
    expect(usesRateFallback('Other or mixed')).toBe(true)
    expect(usesRateFallback('Refurbishment')).toBe(false)
    expect(usesRateFallback('Fit-out')).toBe(false)
    expect(usesRateFallback('New Build')).toBe(false)
    // The retired value an old report may still hold.
    expect(usesRateFallback('Mixed')).toBe(true)
  })
})

describe('projectTypes — priceableFor', () => {
  const item = code => ({
    code,
    priceable: { refurb: false, newBuild: true, extension: false, externalWorks: false },
  })

  it('hides a new-build-only element on a refurbishment', () => {
    expect(priceableFor(item('1.1'), 'Refurbishment')).toBe(false)
  })

  it('shows a new-build-only element on Other or mixed, via the fallback', () => {
    expect(priceableFor(item('1.1'), 'Other or mixed')).toBe(true)
  })

  it('treats a payload with no priceable flags as unfiltered', () => {
    expect(priceableFor({ code: '1.1' }, 'New Build')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/__tests__/projectTypes.test.js`
Expected: FAIL — cannot resolve `../projectTypes.js`.

- [ ] **Step 3: Write the module**

Create `lib/projectTypes.js`:

```js
/**
 * lib/projectTypes.js — the Q1.2 project-type axis, in one place.
 *
 * Imported by BOTH the client questionnaire (app/questionnaire/page.jsx) and
 * server route handlers (app/api/suggest-scope/route.js), so it must stay pure
 * JS with no React and no node-only imports — same constraint as
 * lib/buildingUse.js.
 *
 * Before this module the option list, VISIBLE_GROUPS and priceableFor existed
 * as two hand-synchronised copies that CLAUDE.md warned "must stay in step".
 * They are now one copy.
 *
 * September 2026: eight types became seven on a single axis — what the project
 * does to the building fabric. "Renewable Energy" described a scope rather than
 * a fabric operation and was removed; "Mixed" became "Other or mixed", an
 * explicit catch-all. Retired values survive in KV reports for 90 days, so
 * every lookup here tolerates them.
 */

export const PROJECT_TYPES = [
  { value: 'New Build',           help: 'A new standalone building or structure' },
  { value: 'Extension',           help: 'New floor area added to an existing building' },
  { value: 'Refurbishment',       help: 'Works to an existing building, including its fabric or envelope' },
  { value: 'Fit-out',             help: 'Internal fit-out or refit — no work to the building fabric' },
  { value: 'External works only', help: 'Site works with no building work' },
  { value: 'Demolition only',     help: 'Removing a structure, with no replacement in this project' },
  { value: 'Other or mixed',      help: 'Spans more than one of the above, or doesn’t fit any. You choose exactly what’s included in the scope list.' },
]

export const PROJECT_TYPE_VALUES = PROJECT_TYPES.map(t => t.value)

/** NRM1 groups the scope picker offers per project type. */
export const VISIBLE_GROUPS = {
  'New Build':           [0, 1, 2, 3, 4, 5, 6, 8],
  'Extension':           [0, 1, 2, 3, 4, 5, 6, 7, 8],
  'Refurbishment':       [0, 2, 3, 4, 5, 7, 8],
  // Fit-out changes what is inside the box, not the box: no facilitating
  // works, no superstructure or envelope, no work to existing, no externals.
  'Fit-out':             [3, 4, 5],
  'External works only': [0, 8],
  'Demolition only':     [0],
  'Other or mixed':      [0, 1, 2, 3, 4, 5, 6, 7, 8],
  // Retired values, kept so a 90-day-old KV report still resolves.
  'External Works':      [0, 8],
  'Demolition':          [0],
  'Mixed':               [0, 1, 2, 3, 4, 5, 6, 7, 8],
  'Renewable Energy':    [5, 8],
}

/**
 * Which rate-column family the calculator reads. Mirrors getRateForElement()
 * in lib/costCalculator.js, which matches on lowercase substrings — so
 * "Demolition only" and "External works only" resolve the same way the older
 * "Demolition" and "External Works" did.
 */
export function rateFamilyFor(projectType) {
  const pt = String(projectType || '').toLowerCase()
  if (pt.includes('new build')) return 'newBuild'
  if (pt.includes('extension')) return 'extension'
  if (pt.includes('external works')) return 'externalWorks'
  return 'refurb'
}

/**
 * Other or mixed spans new and existing work but can only pick one rate
 * family, and the substructure group has no refurbishment rate — so without a
 * fallback a mixed project silently carries no foundations at all. Scoped to
 * this one type: Refurbishment's own gaps (0.4, 8.10) are missing workbook
 * data, not a design flaw, and belong with the rate work.
 */
export function usesRateFallback(projectType) {
  const pt = String(projectType || '').toLowerCase()
  return pt.includes('other or mixed') || pt === 'mixed'
}

/**
 * Is this element offerable for this project type? An element with no rate in
 * the applicable family could only ever be excluded as "no applicable rate",
 * so the picker does not offer it.
 */
export function priceableFor(item, projectType) {
  if (!item?.priceable) return true   // older /api/scope-items payload — no flags, no filtering
  const family = rateFamilyFor(projectType)
  if (item.priceable[family]) return true
  if (usesRateFallback(projectType) && item.priceable.newBuild) return true
  return false
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/__tests__/projectTypes.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/projectTypes.js lib/__tests__/projectTypes.test.js
git commit -m "Add lib/projectTypes.js — one copy of the Q1.2 axis"
```

---

### Task 2: The rate-family fallback in the cost engine

**Files:**
- Modify: `lib/costCalculator.js` — `getRateForElement`, and its call site
- Test: `lib/__tests__/costCalculator.test.js`

**Interfaces:**
- Consumes: `usesRateFallback` from `lib/projectTypes.js` (Task 1).
- Produces: `getRateForElement(el, projectType, specLevel, onFallback?)` — the optional fourth argument is called as `onFallback(el.code)` when, and only when, the new-build rate was used because the applicable family had none.

- [ ] **Step 1: Write the failing test**

Append to `lib/__tests__/costCalculator.test.js`:

```js
// September 2026 — "Other or mixed" prices from the refurbishment columns, and
// the substructure group has no refurbishment rate. Without a fallback a mixed
// project silently carries no foundations. Six of its seven unpriceable
// elements are fixed by falling back to the new-build rate; 5.1b has no rate in
// any family and stays excluded.
describe('cost — Other or mixed rate fallback', () => {
  it('prices substructure on Other or mixed', async () => {
    const answers = {
      ...BASE_ANSWERS,
      q1_2_projectType: 'Other or mixed',
      q2_2_scopeItems: ['1.1', '1.3'],
    }
    const cost = await calculateCost(answers, 0)
    const codes = cost.elements.map(e => e.code)
    expect(codes).toContain('1.1')
    expect(codes).toContain('1.3')
    for (const e of cost.elements) {
      if (e.code === '1.1' || e.code === '1.3') expect(e.total).toBeGreaterThan(0)
    }
  })

  it('does not price substructure on a plain Refurbishment', async () => {
    const answers = {
      ...BASE_ANSWERS,
      q1_2_projectType: 'Refurbishment',
      q2_2_scopeItems: ['1.1', '1.3'],
    }
    const cost = await calculateCost(answers, 0)
    const priced = cost.elements.filter(e => (e.code === '1.1' || e.code === '1.3') && e.total > 0)
    expect(priced).toHaveLength(0)
  })

  it('leaves an element with a refurbishment rate untouched on Other or mixed', async () => {
    const mixed = await calculateCost(
      { ...BASE_ANSWERS, q1_2_projectType: 'Other or mixed', q2_2_scopeItems: ['3.1'] }, 0)
    const refurb = await calculateCost(
      { ...BASE_ANSWERS, q1_2_projectType: 'Refurbishment', q2_2_scopeItems: ['3.1'] }, 0)
    const pick = c => c.elements.find(e => e.code === '3.1')?.total
    expect(pick(mixed)).toBe(pick(refurb))
  })
})
```

`BASE_ANSWERS` already exists in this test file. If its name differs, read the
top of the file and use the fixture that is actually defined there. If
`cost.elements` entries use a key other than `total` for the line total, read
what `calculateCost` returns and assert on the real key — do not add a key.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/__tests__/costCalculator.test.js -t "Other or mixed rate fallback"`
Expected: FAIL — the first test finds no priced `1.1`.

- [ ] **Step 3: Implement the fallback**

In `lib/costCalculator.js`, add to the existing imports near the top:

```js
import { usesRateFallback } from './projectTypes.js'
```

Replace `getRateForElement` with:

```js
function getRateForElement(el, projectType, specLevel, onFallback) {
  const pt = projectType.toLowerCase()
  if (pt.includes('new build')) {
    return specLevel === 'High' ? el.nbHigh : el.nbStd
  }
  if (pt.includes('extension')) {
    return specLevel === 'High' ? el.extHigh : el.extStd
  }
  if (pt.includes('external works')) {
    return el.extWorks
  }
  // Refurbishment, Fit-out, Demolition only, Other or mixed
  const refurbRate = specLevel === 'High' ? el.rfbHigh
    : specLevel === 'Basic' ? el.rfbBasic
    : el.rfbStd
  if (refurbRate > 0) return refurbRate

  // "Other or mixed" spans new and existing work but can only pick one family.
  // Four substructure elements, ground stabilisation and HGV hardstanding have
  // no refurbishment rate, so without this a mixed project carries no
  // foundations at all and says nothing about it. 92 elements carry a rate in
  // both families, so this branch cannot change a figure that already priced.
  if (usesRateFallback(projectType)) {
    const nb = specLevel === 'High' ? el.nbHigh : el.nbStd
    if (nb > 0) {
      if (onFallback) onFallback(el.code)
      return nb
    }
  }
  return refurbRate
}
```

Note the retired `pt.includes('demolition') || pt.includes('renewable')` branch
is gone: it returned exactly the same refurbishment rates as the fallthrough it
sat above, so removing it changes nothing and removes a duplicate.

- [ ] **Step 4: Thread the collector through `calculateCost`**

Find the call to `getRateForElement` inside `calculateCost`. Before the element
loop, add:

```js
  // Codes that priced from the new-build column because their own family had
  // no rate. Internal diagnostic only — never shown to the client. See Task 6.
  const rateFallbacks = []
```

Pass the collector at the call site:

```js
const rate = getRateForElement(el, projectType, specLevel, code => rateFallbacks.push(code))
```

Add `rateFallbacks` to the object `calculateCost` returns, alongside the
existing fields.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/__tests__/costCalculator.test.js`
Expected: PASS — the three new tests, and every pre-existing test in the file
unchanged.

- [ ] **Step 6: Commit**

```bash
git add lib/costCalculator.js lib/__tests__/costCalculator.test.js
git commit -m "Price substructure on Other or mixed via a new-build rate fallback"
```

---

### Task 3: Wire the questionnaire to the shared module

**Files:**
- Modify: `app/questionnaire/page.jsx` — lines 53 (`PROJECT_TYPES`), 63–72 (`VISIBLE_GROUPS`), 102–110 (`priceableFor`), 166–173 (`presetScopeFor`), 20 (`STORAGE_SCHEMA_VERSION`), and the Q1.2 render at 1124–1131

**Interfaces:**
- Consumes: `PROJECT_TYPES`, `VISIBLE_GROUPS`, `priceableFor` from `lib/projectTypes.js`.
- Produces: nothing other modules import.

- [ ] **Step 1: Replace the local constants with imports**

Add to the import block at the top of the file, next to the existing
`buildingUse.js` import:

```js
import { PROJECT_TYPES, VISIBLE_GROUPS, priceableFor } from '../../lib/projectTypes.js'
```

Then **delete** these three local definitions, which the import now supplies:
- `const PROJECT_TYPES = [...]` (line 53)
- `const VISIBLE_GROUPS = { ... }` (lines 63–72), keeping the comment banner above it
- `function priceableFor(item, projectType) { ... }` (lines 102–110), keeping its explanatory comment moved into `lib/projectTypes.js`

- [ ] **Step 2: Update `presetScopeFor` for the renamed types**

It uses exact matches, so the renames break it silently. Replace lines 166–173:

```js
function presetScopeFor(projectType, tier) {
  const pt = String(projectType || '')
  if (pt === 'New Build' || pt === 'Extension') return NEW_BUILD_SCOPE
  if (pt === 'Refurbishment' || pt === 'Fit-out') return REFURB_TIER_SCOPE[tier] || REFURB_TIER_SCOPE[3]
  if (pt === 'External works only') return ['8.1', '8.2', '8.4', '8.7', '8.8']
  if (pt === 'Demolition only') return ['0.2', '0.5']
  // No honest default for Other or mixed — it is the catch-all by definition,
  // so ScopePresetBar hides itself rather than guessing.
  return null
}
```

- [ ] **Step 3: Render the option list with its help line**

`PROJECT_TYPES` is now objects, so the existing `.map` breaks. Replace the Q1.2
block at lines 1124–1131:

```jsx
            <QCard>
              <Label required>Q1.2 — Project type</Label>
              <SelectInput value={answers.q1_2_projectType} onChange={v => set('q1_2_projectType', v)}>
                <option value="">Select project type...</option>
                {PROJECT_TYPES.map(t => <option key={t.value} value={t.value}>{t.value}</option>)}
              </SelectInput>
              {/* The help line sits under the select and follows the choice,
                  rather than being crammed into the option text — seven long
                  options make a dropdown unreadable. */}
              {PROJECT_TYPES.find(t => t.value === answers.q1_2_projectType) && (
                <HelpText>{PROJECT_TYPES.find(t => t.value === answers.q1_2_projectType).help}</HelpText>
              )}
              {validationErrors.q1_2_projectType && <p className="mt-1 text-sm" style={{ color: 'var(--danger)' }}>{validationErrors.q1_2_projectType}</p>}
```

Leave the Q1.2a storeys block that follows exactly as it is — `['New Build',
'Refurbishment', 'Extension']` are all unrenamed.

- [ ] **Step 4: Bump the storage schema version**

At line 20, change `2` to `3` and add to the comment block above it:

```js
// v3 (September 2026): Q1.2 lost "Renewable Energy" and renamed three options.
// A v2 draft can hold a project type the form no longer offers, which would
// leave the select blank while the rest of the draft rehydrates around it.
const STORAGE_SCHEMA_VERSION = 3
```

- [ ] **Step 5: Verify the build and the full suite**

Run: `npm run build`
Expected: compiles with no error.

Run: `npm test`
Expected: PASS. `lib/__tests__/labels.test.js` may fail here — it asserts on
`'External Works'`. Task 5 fixes it; if it fails now, leave it and continue.

- [ ] **Step 6: Commit**

```bash
git add app/questionnaire/page.jsx
git commit -m "Questionnaire: seven project types from the shared module"
```

---

### Task 4: Wire the suggest-scope route to the shared module

**Files:**
- Modify: `app/api/suggest-scope/route.js` — lines 23–32 (`VISIBLE_GROUPS`), 45–51 (`priceableFor`), and line 64 (the guard)

**Interfaces:**
- Consumes: `VISIBLE_GROUPS`, `priceableFor` from `lib/projectTypes.js`.
- Produces: nothing.

- [ ] **Step 1: Replace the duplicated constants**

Add to the imports, next to the existing `buildingUse` import:

```js
import { VISIBLE_GROUPS, priceableFor } from '@/lib/projectTypes'
```

Delete the local `const VISIBLE_GROUPS = { ... }` (lines 23–32, including the
now-wrong `// Mirrors VISIBLE_GROUPS in app/questionnaire/page.jsx.` comment)
and the local `function priceableFor(...)` (lines 45–51).

- [ ] **Step 2: Check the guard still reads correctly**

Line 64 is:

```js
if (!VISIBLE_GROUPS[projectType]) return Response.json({ error: 'Select a project type first.' }, { status: 400 })
```

This keeps working — the shared map includes the retired keys, so a client
posting a stored older type still gets a scope suggestion rather than a 400.
Leave it unchanged.

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: compiles.

Run: `npm run lint`
Expected: no new errors. Pre-existing cosmetic items (`<a>` vs `<Link>`,
unescaped quotes) are known and out of scope — do not fix them here.

- [ ] **Step 4: Commit**

```bash
git add app/api/suggest-scope/route.js
git commit -m "suggest-scope: use the shared project-type module"
```

---

### Task 5: Update the tests, the baseline scenarios and the map script

**Files:**
- Modify: `lib/__tests__/labels.test.js:8-19`
- Modify: `scripts/baseline.mjs:79`
- Modify: `scripts/build-question-scope-map.mjs:42-53,72,110`

- [ ] **Step 1: Update the labels test to the new strings**

In `lib/__tests__/labels.test.js`, replace the two assertions blocks:

```js
    expect(areaLabel('External works only')).toBe('Site area')
    expect(areaQuestionLabel('External works only')).toContain('site area')
    expect(areaHelpText('External works only')).toMatch(/external site/i)
    for (const pt of ['Refurbishment', 'New Build', 'Fit-out', 'Extension', 'Other or mixed', '', undefined]) {
```

and

```js
  it('matches External Works case-insensitively', () => {
    expect(isExternalWorks('external works')).toBe(true)
    // The retired label a 90-day-old KV report may still hold.
    expect(isExternalWorks('External Works')).toBe(true)
    expect(isExternalWorks('Other or mixed')).toBe(false)
  })
```

- [ ] **Step 2: Run it**

Run: `npx vitest run lib/__tests__/labels.test.js`
Expected: PASS.

- [ ] **Step 3: Update and extend the baseline scenarios**

In `scripts/baseline.mjs`, change line 79's project type to the new string, and
add a scenario immediately after it that exercises the fallback — there is no
mixed scenario today, which is why the defect went unnoticed:

```js
  ['type-externalworks',         { q1_2_projectType: 'External works only', q2_2_scopeItems: ['8.1', '8.3'], q2_2_quantities: { '8.3': '12' } }],
  ['type-otherormixed-substruct', { q1_2_projectType: 'Other or mixed', q2_2_scopeItems: ['1.1', '1.3', '3.1'] }],
```

- [ ] **Step 4: Update the map generator's copies**

`scripts/build-question-scope-map.mjs` holds its own copies so the map can be
regenerated. Replace its `PROJECT_TYPES`, `VISIBLE_GROUPS` and `priceableFor`
with imports from the shared module:

```js
import { PROJECT_TYPE_VALUES as PROJECT_TYPES, VISIBLE_GROUPS, priceableFor } from '../lib/projectTypes.js'
```

Delete the local definitions at lines 42–53 and 66–78. At line 110, change the
Q2.4 condition text from `'External Works'` to `'External works only'`.

- [ ] **Step 5: Regenerate the map and confirm it still builds**

Run: `node scripts/build-question-scope-map.mjs`
Expected: writes the workbook; reports 112 scope elements as before.

- [ ] **Step 6: Commit**

```bash
git add lib/__tests__/labels.test.js scripts/baseline.mjs scripts/build-question-scope-map.mjs docs/questionnaire-scope-map.xlsx
git commit -m "Update tests, baseline scenarios and the map for the new type names"
```

---

### Task 6: Internal diagnostic for the fallback

The spec requires the fallback be recorded for maintainers and never shown to
the client. `lib/senseCheck.js` already has the `internal: true` convention for
exactly this — `clientWarnings = warnings.filter(w => !w.internal)` is what
reaches the AI prompt and the report.

**Files:**
- Modify: `lib/senseCheck.js`
- Modify: `CLAUDE.md` — the warning-codes paragraph
- Test: `lib/__tests__/senseCheck.test.js`

**Interfaces:**
- Consumes: `cost.rateFallbacks: string[]` from Task 2.
- Produces: a warning `{ code: 'RATE_FALLBACK', internal: true, message: string }`.

- [ ] **Step 1: Write the failing test**

Append to `lib/__tests__/senseCheck.test.js`:

```js
describe('senseCheck — rate fallback diagnostic', () => {
  it('raises an internal warning when elements priced from the fallback', () => {
    const cost = { ...MINIMAL_COST, rateFallbacks: ['1.1', '1.3'] }
    const { warnings } = runSenseCheck({ q1_2_projectType: 'Other or mixed' }, cost, MINIMAL_PROGRAMME)
    const w = warnings.find(x => x.code === 'RATE_FALLBACK')
    expect(w).toBeDefined()
    expect(w.internal).toBe(true)
    expect(w.message).toContain('1.1')
  })

  it('never lets the diagnostic reach the client', () => {
    const cost = { ...MINIMAL_COST, rateFallbacks: ['1.1'] }
    const { clientWarnings } = runSenseCheck({ q1_2_projectType: 'Other or mixed' }, cost, MINIMAL_PROGRAMME)
    expect(clientWarnings.find(x => x.code === 'RATE_FALLBACK')).toBeUndefined()
  })

  it('raises nothing when no element used the fallback', () => {
    const cost = { ...MINIMAL_COST, rateFallbacks: [] }
    const { warnings } = runSenseCheck({ q1_2_projectType: 'Refurbishment' }, cost, MINIMAL_PROGRAMME)
    expect(warnings.find(x => x.code === 'RATE_FALLBACK')).toBeUndefined()
  })
})
```

Read the top of `lib/__tests__/senseCheck.test.js` and use the fixture names and
the exported function name that actually exist there — `MINIMAL_COST`,
`MINIMAL_PROGRAMME` and `runSenseCheck` are placeholders for whatever that file
and `lib/senseCheck.js` already use. Do not invent new exports.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/__tests__/senseCheck.test.js -t "rate fallback"`
Expected: FAIL — no such warning.

- [ ] **Step 3: Emit the warning**

In `lib/senseCheck.js`, alongside the other `warnings.push(...)` calls:

```js
  // Internal only. "Other or mixed" prices from the refurbishment columns and
  // falls back to new build where there is no refurbishment rate, so the
  // estimate can span two rate families. Deliberately NOT shown to the client
  // (decision, 21 September 2026) — it is a maintainer diagnostic, the same
  // way RULE_UNMATCHED is.
  const fallbacks = cost?.rateFallbacks || []
  if (fallbacks.length > 0) {
    warnings.push({
      code: 'RATE_FALLBACK',
      internal: true,
      message: `${fallbacks.length} element(s) priced from the new build column because the applicable rate family had no rate: ${fallbacks.join(', ')}.`,
    })
  }
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/__tests__/senseCheck.test.js`
Expected: PASS, including every pre-existing test.

- [ ] **Step 5: Update CLAUDE.md**

The warning-codes paragraph says "Exactly seven warning codes exist". Change it
to eight and add `RATE_FALLBACK` to the list, marked `internal: true` alongside
`RULE_UNMATCHED`.

Also update the Q1.2 references in "Data flow & key conventions" to say the
project type has seven options on the fabric axis, and note that
`lib/projectTypes.js` is now the single source for the option list,
`VISIBLE_GROUPS` and `priceableFor` — replacing the two copies the file
currently warns must stay in step.

- [ ] **Step 6: Commit**

```bash
git add lib/senseCheck.js lib/__tests__/senseCheck.test.js CLAUDE.md
git commit -m "Record the rate fallback as an internal diagnostic"
```

---

### Task 7: Verify the whole slice

**Files:** none modified unless a check fails.

- [ ] **Step 1: Full build, lint and test**

```bash
npm run build
npm run lint
npm test
```

Expected: build clean, no new lint errors, all Vitest green. Tests that skip
pending a workbook addition (Range Widths, BS1/SV7, HRB) should still skip with
their message, not fail.

- [ ] **Step 2: Run the after-baseline**

Run: `node scripts/baseline.mjs --out after-slice1`

- [ ] **Step 3: Diff the baselines — this is the safety gate**

Run: `node scripts/baseline.mjs --diff before-slice1 after-slice1`

(Use whatever comparison the script's header documents.)

**Expected: IDENTICAL for every scenario that exists in both snapshots.** The
new `type-otherormixed-substruct` scenario exists only in the after snapshot and
is reported as added — that is correct.

**If any pre-existing scenario moved, stop.** The fallback fires only where the
refurbishment column is empty, and no pre-existing scenario uses Other or mixed,
so movement means a mistake — most likely in `getRateForElement`'s restructured
branches. Investigate before going further.

- [ ] **Step 4: Browser check**

Start the gate-open preview (`estates-ai-tool-open` in `.claude/launch.json`),
then in the questionnaire:

1. Q1.2 offers exactly seven options, no "Renewable Energy", no bare "Mixed".
2. Selecting each option shows its help line beneath the select.
3. `New Build` → Q1.2a storeys appears, Q1.4 building age does not.
4. `External works only` → Q1.5 reads "Approximate site area (m²)", and Q2.4
   specification level is hidden.
5. `Demolition only` → the picker shows group 0 only, and "Use typical scope"
   ticks 0.2 and 0.5.
6. `Other or mixed` → the picker shows all groups, **substructure tiles 1.1 and
   1.3 are present and tickable** (they are absent today), and the preset button
   is hidden.
7. Generate a report on `Other or mixed` with 1.1 and 1.3 ticked, and confirm
   both appear as priced lines with a non-zero total, and that **no sentence
   about rate fallback or mixed rate families appears anywhere in the report**.

- [ ] **Step 5: Commit the after-baseline**

```bash
git add scripts/__baseline__/after-slice1
git commit -m "Capture baseline after the project-type axis change"
```

---

## Self-review notes

Checked against the spec:

| Spec section | Task |
|---|---|
| Seven-option list with help lines | 1, 3 |
| `Mixed` → `Other or mixed`, `Demolition` → `Demolition only`, `External Works` → `External works only`, remove `Renewable Energy` | 1, 3 |
| Fit-out stays, three groups | 1 (asserted in test) |
| Rate-family fallback, Other or mixed only | 1, 2 |
| Cannot move an existing number | 7 step 3 |
| Draft handling — storage version bump | 3 step 4 |
| KV reports keep resolving | 1 (retired-value tests), 4 step 2 |
| Files touched: page.jsx, costCalculator, suggest-scope, baseline, labels test, map script | 2, 3, 4, 5 |
| Fallback not disclosed to the client | 6, verified at 7 step 4.7 |
| Not in this slice: question hiding, new questions, Extension rates, workbook rates, area split, picker narrowing | none — correctly absent |

One deliberate addition beyond the spec: `lib/projectTypes.js`. The spec lists
`page.jsx` and `suggest-scope/route.js` as two separate edits to the same
constants; extracting them removes the duplication CLAUDE.md flags rather than
perpetuating it, and it is the file both edits were going to touch anyway.
