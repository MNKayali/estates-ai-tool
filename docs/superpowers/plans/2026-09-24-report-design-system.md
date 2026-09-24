# Report Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the report's look with the approved A4 template (IBM Plex, fixed page map, brand on every page), identical on screen, in the PDF and in the Word file, with that consistency and the shape of the AI text enforced by code.

**Architecture:** One pure style module (`lib/reportStyle.js`: tokens, brand, geometry, limits) and one pure content module (`lib/reportContent.js`: every derived line, row, rounding and page-layout decision) feed two thin renderers. These are the HTML page components in `app/report/doc/` (screen and, through Puppeteer, the PDF) and the `docx` page builders in `lib/docx/` (Word). A guard test fails the build if either renderer carries its own colour, font size or font name. The AI prose gets fixed counts and word ranges, checked in code with the existing retry loop.

**Tech Stack:** Next.js 16.3.5 (App Router), React, `next/font/google` (IBM Plex Sans / Mono), `docx` 9.6.1 (embedded fonts), Puppeteer (PDF + fit check), Vitest, JSZip (tests).

**Spec:** `docs/superpowers/specs/2026-09-23-report-design-system-design.md`
**Approved look (wins on any visual detail):** `docs/superpowers/specs/2026-09-24-report-template-approved.html`

## Global Constraints

- Branch: `feat/report-design-system`, cut from `feat/scope-catalogue-v5-2` (PR #12). Do not merge before PR #12.
- Never change a calculation, workbook, engine or number. Rendering and prose shape only.
- AI cost per report must not rise. The only prompt changes are the limits block and the no-question-number rule.
- Typeface: IBM Plex Sans (text) and IBM Plex Mono (codes, references). No Arial, Helvetica, Calibri, Playfair Display or DM Sans anywhere in the report.
- Colours and sizes come only from `lib/reportStyle.js`. No hex literal, font-size literal or font name in `app/report/doc/**`, `lib/docx/**` or `lib/reportBuilder.js`.
- A4 pages everywhere: 794 × 1123 CSS px on screen and in the PDF (1 px = 15 DXA in Word).
- Fixed page map: 1 cover · 2 exec summary · 3 scope · 4 risk · 5 programme · 6–7 cost · late sections in half-page slots · Next Steps + contact always last · Appendix A only for long scopes.
- Risk register: at most 10 risks, sorted High → Medium → Low, renumbered R01…, always one page.
- Rounding: nearest £100 when the project total is under £100,000, nearest £1,000 otherwise; cover figure compact (`£1.60m`) at £1m and above.
- Prose limits (words, counts) exactly as in `PROSE_LIMITS` (Task 8); a report is never lost to a shape rule.
- "Estates AI" is a placeholder. The brand name, strapline and contact details live only in `BRAND` in `lib/reportStyle.js`, and the contact values stay placeholders until the user supplies real ones.
- Commit after every task. Do not push without the user's explicit go-ahead.
- Before writing Next.js framework code, read the relevant file in `node_modules/next/dist/docs/` (AGENTS.md).

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `lib/reportStyle.js` | create | Tokens: `BRAND`, `COLOURS`, `FONTS`, `TYPE`, `COVER_TYPE`, `PAGE`, `TABLES`, `LIMITS`; unit helpers; `cssVariables()` |
| `lib/reportContent.js` | create | Pure derived content shared by both renderers: money, titles, risks, programme, cost, scope, late-section layout, page map |
| `lib/reportFixtures.js` | create | Worst-case and long-scope report fixtures built from the sample (tests, fit check) |
| `lib/proseSchema.js` | modify | `PROSE_LIMITS`, `limitGuidance()`, field descriptions, prompt rules 7/8/15 |
| `lib/prose.js` | modify | `proseShapeProblems()`, `trimToLimits()`, retry wiring, limits block in prompt, seed de-dup |
| `app/report/doc/fonts.js` | create | `next/font` IBM Plex Sans + Mono |
| `app/report/doc/report.css` | create | All report styles, `var()` only; screen scaling; print rules |
| `app/report/doc/parts.jsx` | create | `Sheet`, `BodyPage`, `RunningHeader`, `RunningFooter`, `Band`, `Cols`, `Pending` |
| `app/report/doc/ReportDocument.jsx` | create | Builds the page map, scales sheets, renders pages |
| `app/report/doc/CoverPage.jsx` … `LastPage.jsx` | create | One file per page kind |
| `app/report/ReportRenderer.jsx` | modify | Keeps toolbar, alerts, compare panel, CTA, feedback modal; the document becomes `<ReportDocument>` |
| `app/api/report-pdf/[id]/route.js` | modify | Zero margins, CSS page size, waits for fonts; no footer template |
| `app/api/reports/[id]/docx/route.js` | create | Builds the Word file on download |
| `app/api/reports/[id]/prose/route.js` | modify | Stops building and storing the `.docx` at finalise |
| `app/report-fixture/[name]/page.jsx` | create | Dev-only fixture renderer for the fit check |
| `scripts/check-report-fit.mjs` | create | Puppeteer fit check + PDF export of fixtures |
| `assets/fonts/*.ttf`, `assets/fonts/OFL.txt` | create | IBM Plex TTFs for Word embedding |
| `lib/docx/fonts.js`, `lib/docx/primitives.js`, `lib/docx/pages.js` | create | Word: font loading, token-driven primitives, one builder per page |
| `lib/reportBuilder.js` | rewrite | Thin assembler over `lib/docx/*` |
| `next.config.ts` | modify | `outputFileTracingIncludes` for `assets/fonts` |
| `app/questionnaire/page.jsx` | modify | Q1.0 cover-title preview + soft warning |
| Tests in `lib/__tests__/` | create/modify | `reportStyle`, `reportContent.*`, `proseShape`, `reportStyleGuard`, `reportDocx`, `reportV52` |

---

## Milestone A: Foundations (pure modules, no visual change yet)

### Task 1: Branch hygiene and reference files

**Files:**
- Modify: `.gitignore`
- Add: `docs/superpowers/specs/2026-09-23-report-design-system-design.md`, `docs/superpowers/specs/2026-09-24-report-template-approved.html`, this plan

- [ ] **Step 1: Confirm branch**

Run: `git branch --show-current`
Expected: `feat/report-design-system` (create it with `git checkout -b feat/report-design-system feat/scope-catalogue-v5-2` if not).

- [ ] **Step 2: Ignore the brainstorm mockups**

Append to `.gitignore`:

```
# brainstorming companion mockups (local only)
.superpowers/
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore docs/superpowers/specs/2026-09-23-report-design-system-design.md docs/superpowers/specs/2026-09-24-report-template-approved.html docs/superpowers/plans/2026-09-24-report-design-system.md
git commit -m "Report design system: spec, approved template and plan"
```

---

### Task 2: `lib/reportStyle.js`, the single source of the look

**Files:**
- Create: `lib/reportStyle.js`
- Test: `lib/__tests__/reportStyle.test.js`

**Interfaces:**
- Produces: `BRAND`, `COLOURS`, `FONTS`, `TYPE`, `COVER_TYPE`, `PAGE`, `TABLES`, `LIMITS`, `ptToPx(pt)`, `hp(pt)` (Word half-points), `pxToDxa(px)`, `widthsToDxa(fractions, totalDxa)`, `hex(colour)`, `cssVariables()` → `{ '--r-…': value }`.

- [ ] **Step 1: Write the failing test**

```js
// lib/__tests__/reportStyle.test.js
import { describe, it, expect } from 'vitest'
import { COLOURS, TYPE, TABLES, PAGE, BRAND, ptToPx, hp, pxToDxa, widthsToDxa, hex, cssVariables } from '../reportStyle.js'

describe('reportStyle', () => {
  it('holds six body text sizes, in points', () => {
    expect(Object.keys(TYPE)).toEqual(['sectionTitle', 'subHeading', 'body', 'table', 'small', 'statFigure'])
    expect(TYPE.body).toBe(10)
  })
  it('converts units for screen and Word', () => {
    expect(ptToPx(12)).toBe(16)
    expect(hp(9.5)).toBe(19)
    expect(pxToDxa(794)).toBe(11910)
  })
  it('splits a table width into DXA columns that sum exactly', () => {
    const w = widthsToDxa([0.09, 0.43, 0.12, 0.12, 0.12, 0.12], 10230)
    expect(w.reduce((a, b) => a + b, 0)).toBe(10230)
  })
  it('has every table recipe summing to 1', () => {
    for (const [name, fr] of Object.entries(TABLES)) {
      expect(Math.round(fr.reduce((a, b) => a + b, 0) * 1000) / 1000, name).toBe(1)
    }
  })
  it('exposes colours and sizes as CSS variables for the HTML renderer', () => {
    const v = cssVariables()
    expect(v['--r-navy']).toBe(COLOURS.navy)
    expect(v['--r-fs-body']).toBe(`${ptToPx(TYPE.body)}px`)
    expect(hex('#1A2E4A')).toBe('1A2E4A')
  })
  it('keeps the placeholder brand in one place', () => {
    expect(BRAND.name).toBe('Estates AI')
    expect(PAGE.widthPx).toBe(794)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run lib/__tests__/reportStyle.test.js`
Expected: FAIL, `Cannot find module '../reportStyle.js'`.

- [ ] **Step 3: Implement**

```js
// lib/reportStyle.js
/**
 * The report's single source of look: brand, colours, type scale, page
 * geometry, table column recipes and layout limits. Both renderers read it:
 * app/report/doc/* (screen + PDF, through cssVariables()) and lib/docx/*
 * (Word, through hp()/pxToDxa()/hex()). Pure data, no React, no node imports.
 * The approved look is docs/superpowers/specs/2026-09-24-report-template-approved.html.
 */

// "Estates AI" is a placeholder name; contact values are placeholders until supplied.
export const BRAND = Object.freeze({
  name: 'Estates AI',
  mark: 'AI',
  tagline: 'DATA · INSIGHTS · SMARTER DECISIONS',
  strapline: 'Feasibility reporting for capital projects',
  slogan: 'Better insights. Smarter property decisions.',
  web: 'estates-ai-tool.vercel.app',
  email: 'enquiries@estates-ai.example',
  phone: '0121 000 0000',
})

export const COLOURS = Object.freeze({
  navy: '#1A2E4A', navyMid: '#1C3354', navyDeep: '#10203A', navyText: '#12233A',
  amberRule: '#C4861A', amberOnDark: '#D9A12E', amberText: '#9D6B15',
  ink: '#22262F', grey: '#555B69', greyMute: '#6D7182', label: '#4A566B', code: '#5A6E88',
  rule: '#E2DED4', tintHead: '#EAEFF5', tintBand: '#EEF2F7', tintGroup: '#F6F3EC', tintHigh: '#FDF3F2',
  paper: '#FFFFFF', onNavy: '#DCE3EC', onNavyMute: '#B7C2D3',
  ragHigh: '#B42318', ragMed: '#B54708', ragLow: '#2E7D32', pass: '#2E7D32', warn: '#92400E',
  segDesign: '#3E5C84', segGovernance: '#7B5113', segTender: '#5B7BA6', segConstruction: '#1A2E4A',
  segHandover: '#4A5568', segSurvey: '#4F8A3C', segFloatA: '#7D8798', segFloatB: '#B5BCC8', segOther: '#6B7A90',
})

export const FONTS = Object.freeze({
  // CSS stacks; the first family is supplied by next/font (app/report/doc/fonts.js).
  sansStack: "var(--r-font-sans), 'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif",
  monoStack: "var(--r-font-mono), 'IBM Plex Mono', ui-monospace, Consolas, monospace",
  // Word: embedded families (lib/docx/fonts.js). Weight is chosen by family, never by a bold flag.
  word: { regular: 'IBM Plex Sans', semibold: 'IBM Plex Sans SemiBold', mono: 'IBM Plex Mono' },
})

/** Body-page type scale in points. No other sizes on body pages. */
export const TYPE = Object.freeze({ sectionTitle: 16, subHeading: 11, body: 10, table: 9.5, small: 8, statFigure: 13.5 })

/** Cover-only sizes in points (from the approved template's px ÷ 4/3). */
export const COVER_TYPE = Object.freeze({
  brand: 22.5, tagline: 7, eyebrow: 9.75, title: 27, titleLong: 22.5, subtitle: 12.75,
  figure: 21, figureNote: 9.75, label: 8.25, facts: 10.5, note: 9, foot: 8.25,
})

/** Page geometry in CSS px on the 794 × 1123 A4 page. */
export const PAGE = Object.freeze({
  widthPx: 794, heightPx: 1123, marginXPx: 56,
  headerTopPx: 30, bodyTopPx: 86, bodyBottomPx: 64, footerBottomPx: 26,
  coverTopPx: 470, halfSlotPx: 486, bodyPx: 973, slotGapPx: 24,
})

/** Column widths as fractions of the content width. */
export const TABLES = Object.freeze({
  works: [0.09, 0.43, 0.12, 0.12, 0.12, 0.12],
  worksGroups: [0.52, 0.12, 0.18, 0.18],
  risk: [0.08, 0.13, 0.36, 0.11, 0.32],
  programme: [0.21, 0.45, 0.13, 0.13, 0.08],
  projectCost: [0.46, 0.24, 0.15, 0.15],
  constraints: [0.15, 0.27, 0.58],
})

export const LIMITS = Object.freeze({
  maxRisks: 10,
  listMax: 6,
  milestonesMax: 6,
  scopeItemsPerGroup: 8,
  notPricedMax: 6,
  worksRowsPerPage: 27,
  appendixRowsPerPage: 36,
  titleChars: { full: 60, max: 110 },
})

export const ptToPx = pt => Math.round((pt * 96 / 72) * 100) / 100
export const hp = pt => Math.round(pt * 2)
export const PX_TO_DXA = 15
export const pxToDxa = px => Math.round(px * PX_TO_DXA)
export const hex = c => String(c).replace('#', '').toUpperCase()

export function widthsToDxa(fractions, totalDxa) {
  const w = fractions.map(f => Math.round(f * totalDxa))
  w[w.length - 1] += totalDxa - w.reduce((a, b) => a + b, 0)
  return w
}

const kebab = s => s.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)

/** CSS custom properties for the HTML renderer (set as a style object on the document root). */
export function cssVariables() {
  const v = {}
  for (const [k, c] of Object.entries(COLOURS)) v[`--r-${kebab(k)}`] = c
  for (const [k, pt] of Object.entries(TYPE)) v[`--r-fs-${kebab(k)}`] = `${ptToPx(pt)}px`
  for (const [k, pt] of Object.entries(COVER_TYPE)) v[`--r-cv-${kebab(k)}`] = `${ptToPx(pt)}px`
  v['--r-sans'] = FONTS.sansStack
  v['--r-mono'] = FONTS.monoStack
  return v
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run lib/__tests__/reportStyle.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/reportStyle.js lib/__tests__/reportStyle.test.js
git commit -m "Report style: one module for brand, colours, type, geometry and limits"
```

---

### Task 3: `lib/reportContent.js` basics (money, titles, cover lines, clean text, ROI, cost risk)

**Files:**
- Create: `lib/reportContent.js`
- Test: `lib/__tests__/reportContent.basics.test.js`

**Interfaces:**
- Consumes: `LIMITS` from `lib/reportStyle.js`.
- Produces (all pure):
  - `money(n, scaleTotal, { symbol = true } = {}) → string`, `roundingStep(scaleTotal) → 100 | 1000`, `compactMoney(n) → string`, `coverCostRange(cost) → string`, `vatPct(cost) → number`
  - `coverTitle(answers) → string`, `coverTitleSize(title) → 'full' | 'long'`, `shortTitle(answers, max = 40) → string`, `coverSubtitle(answers, cost) → string`, `titleLooksThin(title, postcode) → boolean`
  - `cleanReportText(s) → string`, `fmtLongDate(iso) → string`, `fmtMonthYear(iso) → string`, `confidenceWord(label) → string`, `reportReference(reportId, data) → string`
  - `calcRoi(answers, cost) → { annual, mid, paybackYears } | null`, `deriveCostRiskLevel(cost, aiProse) → 'High' | 'Medium' | 'Low'`

- [ ] **Step 1: Write the failing test**

```js
// lib/__tests__/reportContent.basics.test.js
import { describe, it, expect } from 'vitest'
import sample from '../../public/sample/report.json'
import {
  money, compactMoney, coverCostRange, coverTitle, coverTitleSize, shortTitle, coverSubtitle,
  titleLooksThin, cleanReportText, fmtMonthYear, confidenceWord, reportReference, calcRoi,
} from '../reportContent.js'

describe('money', () => {
  it('rounds to £100 under a £100,000 project and £1,000 above', () => {
    expect(money(3044, 52000)).toBe('£3,000')
    expect(money(3160, 52000)).toBe('£3,200')
    expect(money(100800, 1994000)).toBe('£101,000')
    expect(money(100800, 1994000, { symbol: false })).toBe('101,000')
  })
  it('shortens only the cover figure at £1m and above', () => {
    expect(compactMoney(1600000)).toBe('£1.60m')
    expect(compactMoney(1994000)).toBe('£1.99m')
    expect(coverCostRange(sample.cost)).toBe('£1.60m – £1.99m')
    expect(coverCostRange({ total: { low: 42000, high: 52000 } })).toBe('£42,000 – £52,000')
  })
})

describe('titles', () => {
  it('uses Q1.0 on the cover and a short form in the running header', () => {
    expect(coverTitle(sample.answers)).toBe('Refurbishment — Hargreaves Teaching Block, Example University, Birmingham')
    expect(coverTitleSize(coverTitle(sample.answers))).toBe('long')
    expect(shortTitle(sample.answers)).toBe('Hargreaves Teaching Block, Example…')
  })
  it('builds the subtitle from answers: region and district, use, GIFA', () => {
    expect(coverSubtitle(sample.answers, sample.cost)).toBe('West Midlands, B15 · Education · 1,200 m² GIFA')
  })
  it('flags a title that is only a town or too short', () => {
    expect(titleLooksThin('Solihull', 'B91 1SF')).toBe(true)
    expect(titleLooksThin('B91 1SF', 'B91 1SF')).toBe(true)
    expect(titleLooksThin('Refurbishment of Block C, first floor', 'B15')).toBe(false)
  })
})

describe('clean text', () => {
  it('removes questionnaire numbers from report text', () => {
    expect(cleanReportText('Restricted working hours (Q3.5) extend construction.')).toBe('Restricted working hours extend construction.')
    expect(cleanReportText('Q3.6 = Partially occupied')).toBe('Partially occupied')
    expect(cleanReportText('divide by the Q2.3 band factor')).toBe('divide by the band factor')
  })
})

describe('small formats', () => {
  it('formats month-year, confidence and reference', () => {
    expect(fmtMonthYear('2027-08-23')).toBe('Aug 27')
    expect(confidenceWord('Moderate Confidence')).toBe('Moderate')
    expect(reportReference('a1b2c3d4e5f60718', {})).toBe('A1B2C3D4')
    expect(reportReference(null, { sample: true })).toBe('SAMPLE')
  })
  it('computes ROI from the published range', () => {
    expect(calcRoi(sample.answers, sample.cost)).toEqual({ annual: 95000, mid: 1797000, paybackYears: 18.9 })
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run lib/__tests__/reportContent.basics.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```js
// lib/reportContent.js
/**
 * Everything the report derives from the data, shared by BOTH renderers
 * (app/report/doc/* and lib/docx/*): rounding, titles, cleaned text, risks,
 * programme, cost and scope lines, and the page layout. Pure: no React, no
 * node-only imports. If the two outputs must say or decide the same thing,
 * it lives here, never in a renderer.
 */
import { LIMITS } from './reportStyle.js'

// ─── Money ───────────────────────────────────────────────────────────────────
export const roundingStep = scaleTotal => ((Number(scaleTotal) || 0) < 100000 ? 100 : 1000)

export function money(n, scaleTotal, { symbol = true } = {}) {
  const step = roundingStep(scaleTotal)
  const v = Math.round((Number(n) || 0) / step) * step
  return `${symbol ? '£' : ''}${v.toLocaleString('en-GB')}`
}

export function compactMoney(n) {
  const v = Number(n) || 0
  if (v >= 1_000_000) return `£${(Math.round(v / 10000) / 100).toFixed(2)}m`
  return money(v, v)
}

export function coverCostRange(cost) {
  const lo = cost?.total?.low, hi = cost?.total?.high
  if (!(hi >= 1_000_000)) return `${money(lo, hi)} – ${money(hi, hi)}`
  return `${compactMoney(lo)} – ${compactMoney(hi)}`
}

export const vatPct = cost => (cost?.vatPct > 0 ? cost.vatPct : 20)

// ─── Text ────────────────────────────────────────────────────────────────────
const Q_PAREN = /\s*\((?:see\s+)?Q\d+(?:\.\d+)?[a-z]?\)/gi
const Q_LEAD = /\bQ\d+(?:\.\d+)?[a-z]?\s*(?:=|includes|has)\s*/gi
const Q_BARE = /\s*\bQ\d+\.\d+[a-z]?\b/g

/** Questionnaire numbers mean nothing to a report reader; strip them. */
export function cleanReportText(s) {
  return String(s ?? '').replace(Q_PAREN, '').replace(Q_LEAD, '').replace(Q_BARE, '').replace(/\s{2,}/g, ' ').trim()
}

const cut = (s, max) => {
  if (s.length <= max) return s
  const c = s.slice(0, max)
  return `${c.slice(0, Math.max(c.lastIndexOf(' '), 1)).replace(/[,;:·—-]+$/, '')}…`
}

export function coverTitle(answers) {
  const t = String(answers?.q1_0_projectName || '').trim() || 'Feasibility study'
  return cut(t, LIMITS.titleChars.max)
}

export const coverTitleSize = title => (String(title).length <= LIMITS.titleChars.full ? 'full' : 'long')

export function shortTitle(answers, max = 40) {
  const t = coverTitle(answers).replace(/^(refurbishment|new build|extension|fit-out|demolition)\s*(of|—|–|-)\s*/i, '')
  return cut(t, max)
}

export function coverSubtitle(answers, cost) {
  const district = String(answers?.q1_1_postcode || '').trim().split(/\s+/)[0].toUpperCase()
  const place = [cost?.bcisRegion, district].filter(Boolean).join(', ')
  const gifa = Number(cost?.gifa) > 0 ? `${Number(cost.gifa).toLocaleString('en-GB')} m² GIFA` : ''
  return [place, answers?.q1_3_buildingUse, gifa].filter(Boolean).join(' · ')
}

export function titleLooksThin(title, postcode) {
  const t = String(title || '').trim()
  const pc = String(postcode || '').trim().toLowerCase()
  if (!t) return true
  if (pc && t.toLowerCase().replace(/\s+/g, '') === pc.replace(/\s+/g, '')) return true
  return t.split(/\s+/).length < 3
}

// ─── Dates and labels ────────────────────────────────────────────────────────
const asDate = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d }
export const fmtLongDate = iso => asDate(iso)?.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) || ''
export const fmtMonthYear = iso => asDate(iso)?.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }).replace(/\s+/, ' ') || ''
export const confidenceWord = label => String(label || '').replace(/\s*confidence\s*$/i, '').trim() || 'Moderate'

export function reportReference(reportId, data) {
  if (reportId) return String(reportId).slice(0, 8).toUpperCase()
  return data?.sample ? 'SAMPLE' : 'DRAFT'
}

// ─── Moved from both renderers (they had two copies) ─────────────────────────
const RISK_RANK = { High: 3, Medium: 2, Low: 1 }
export function deriveCostRiskLevel(cost, aiProse) {
  const costRisks = (aiProse?.riskRegister || []).filter(r => r.category === 'Cost' && RISK_RANK[r.rating])
  if (costRisks.length === 0) return cost?.percentages?.riskLevel || 'Medium'
  return costRisks.reduce((worst, r) => (RISK_RANK[r.rating] > RISK_RANK[worst] ? r.rating : worst), 'Low')
}

export function calcRoi(answers, cost) {
  const annual = Number(answers?.q5_2_annualBenefit) || 0
  const low = cost?.total?.low || 0
  const high = cost?.total?.high || 0
  if (!annual || !low || !high) return null
  const mid = Math.round(((low + high) / 2) / 1000) * 1000
  return { annual, mid, paybackYears: Math.round((mid / annual) * 10) / 10 }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run lib/__tests__/reportContent.basics.test.js`
Expected: PASS. If `fmtMonthYear` returns `Aug 2027` on this Node build, change the options to `{ month: 'short' }` plus `` `'${String(d.getFullYear()).slice(2)}` ``, i.e. `${d.toLocaleDateString('en-GB', { month: 'short' })} ${String(d.getFullYear()).slice(2)}`, and re-run.

- [ ] **Step 5: Commit**

```bash
git add lib/reportContent.js lib/__tests__/reportContent.basics.test.js
git commit -m "Report content: rounding, titles, clean text and shared ROI/risk helpers"
```

---

### Task 4: Risks: de-duplicate, sort, cap and renumber (plus the seed-merge bug)

**Files:**
- Modify: `lib/reportContent.js`, `lib/prose.js` (`ensureSeedRisks`, around line 391)
- Test: `lib/__tests__/reportContent.risks.test.js`

**Interfaces:**
- Produces: `prepareRisks(register, max = LIMITS.maxRisks) → { risks, counts: { High, Medium, Low }, dropped }`, `RAG_CLASS = { High: 'high', Medium: 'med', Low: 'low' }`.

- [ ] **Step 1: Write the failing test**

```js
// lib/__tests__/reportContent.risks.test.js
import { describe, it, expect } from 'vitest'
import sample from '../../public/sample/report.json'
import { prepareRisks } from '../reportContent.js'
import { ensureSeedRisks } from '../prose.js'

describe('prepareRisks', () => {
  it('drops the duplicated heat-pump seed, sorts High first and renumbers', () => {
    const { risks, counts } = prepareRisks(sample.aiProse.riskRegister)
    expect(risks).toHaveLength(8)
    expect(risks.map(r => r.ref)).toEqual(['R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08'])
    expect(risks.slice(0, 3).every(r => r.rating === 'High')).toBe(true)
    expect(counts).toEqual({ High: 3, Medium: 5, Low: 0 })
    expect(risks.some(r => /\(Q3\.5\)/.test(r.description))).toBe(false)
  })
  it('keeps at most ten', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ ref: `R${i + 1}`, seedRef: 'NONE', rating: i % 2 ? 'Low' : 'High', description: `risk ${i}`, mitigation: 'm' }))
    const { risks, dropped } = prepareRisks(many)
    expect(risks).toHaveLength(10)
    expect(dropped).toBe(4)
    expect(risks.filter(r => r.rating === 'High')).toHaveLength(7)
  })
})

describe('ensureSeedRisks', () => {
  it('treats a seed the model wrote under its ref (seedRef NONE) as present', () => {
    const prose = { riskRegister: [{ ref: 'SCOPE-S-0039-1', seedRef: 'NONE', rating: 'Medium', description: 'x', mitigation: 'y' }] }
    const before = prose.riskRegister.length
    // Re-run the merge against the sample's inputs: no second heat-pump entry may be appended.
    // senseCheck: pass the minimal shape buildDeterministicSeeds reads; if it reads more
    // fields, copy them from a runSenseCheck() result rather than weakening the assertion.
    ensureSeedRisks(prose, sample.answers, sample.cost, { warnings: [], clientWarnings: [], benchmarkChecked: true })
    const heat = prose.riskRegister.filter(r => r.ref === 'SCOPE-S-0039-1' || r.seedRef === 'SCOPE-S-0039-1')
    expect(heat).toHaveLength(1)
    expect(prose.riskRegister.length).toBeGreaterThanOrEqual(before)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run lib/__tests__/reportContent.risks.test.js`
Expected: FAIL. `prepareRisks` is missing, and the second test fails because a duplicate is appended.

- [ ] **Step 3: Implement `prepareRisks` (append to `lib/reportContent.js`)**

```js
// ─── Risk register ───────────────────────────────────────────────────────────
export const RAG_CLASS = Object.freeze({ High: 'high', Medium: 'med', Low: 'low' })

const riskKey = r => {
  if (r.seedRef && r.seedRef !== 'NONE') return `seed:${r.seedRef}`
  if (r.ref && !/^R\d+$/.test(r.ref)) return `seed:${r.ref}`
  return `text:${String(r.description || '').toLowerCase().slice(0, 60)}`
}

/** The register as printed: de-duplicated, High → Low (stable), capped, renumbered R01…, cleaned. */
export function prepareRisks(register, max = LIMITS.maxRisks) {
  const seen = new Set()
  const kept = []
  for (const r of register || []) {
    const k = riskKey(r)
    if (seen.has(k)) continue
    seen.add(k)
    kept.push(r)
  }
  const ordered = kept
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (RISK_RANK[b.r.rating] || 0) - (RISK_RANK[a.r.rating] || 0) || a.i - b.i)
    .map(x => x.r)
    .slice(0, max)
  const risks = ordered.map((r, i) => ({
    ...r,
    ref: `R${String(i + 1).padStart(2, '0')}`,
    description: cleanReportText(r.description),
    mitigation: cleanReportText(r.mitigation),
  }))
  const counts = { High: 0, Medium: 0, Low: 0 }
  for (const r of risks) if (counts[r.rating] != null) counts[r.rating]++
  return { risks, counts, dropped: kept.length - risks.length }
}
```

- [ ] **Step 4: Fix the seed merge in `lib/prose.js`**

In `ensureSeedRisks`, replace:

```js
  const present = new Set((prose.riskRegister || []).map(r => r.seedRef).filter(ref => ref && ref !== 'NONE'))
```

with:

```js
  // The model sometimes writes a seed under its own ref with seedRef NONE
  // (sample report: SCOPE-S-0039-1), which used to append the seed a second time.
  const present = new Set()
  for (const r of prose.riskRegister || []) {
    if (r.seedRef && r.seedRef !== 'NONE') present.add(r.seedRef)
    if (r.ref && !/^R\d+$/.test(r.ref)) present.add(r.ref)
  }
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run lib/__tests__/reportContent.risks.test.js lib/__tests__/prose.test.js`
Expected: PASS for both files.

- [ ] **Step 6: Commit**

```bash
git add lib/reportContent.js lib/prose.js lib/__tests__/reportContent.risks.test.js
git commit -m "Risk register: de-duplicate seeds, High first, ten at most, renumbered"
```

---

### Task 5: Programme content (milestones, one-line bar, detail rows, narrative)

**Files:**
- Modify: `lib/reportContent.js`
- Test: `lib/__tests__/reportContent.programme.test.js`

**Interfaces:**
- Consumes: `fmtDate` from `lib/reportShared.js`.
- Produces:
  - `stageCategory(stage) → 'design'|'governance'|'tender'|'construction'|'handover'|'float'|'parallel'`
  - `overviewSegments(programme) → [{ category, label, weeks, startWeek, endWeek, pct, narrow }]`
  - `selectMilestones(programme) → [{ id:'M1', label, date, week, missedTarget }]` (≤ 6)
  - `milestoneTickClass(ms, i, totalWeeks) → '' | 'first' | 'last' | 'down'`
  - `targetPct(programme, answers) → number | null`
  - `programmeDetailRows(programme) → [{ stage, activity, start, end, weeks, parallel }]`
  - `programmeNarrativeLines(programme) → string[]` (≤ 6)
  - `SEGMENT_KEY_LABELS`

- [ ] **Step 1: Write the failing test**

```js
// lib/__tests__/reportContent.programme.test.js
import { describe, it, expect } from 'vitest'
import sample from '../../public/sample/report.json'
import {
  overviewSegments, selectMilestones, programmeDetailRows, programmeNarrativeLines, targetPct, milestoneTickClass,
} from '../reportContent.js'

const P = sample.programme

describe('programme page content', () => {
  it('merges stages into one-line bar segments that add up to the total', () => {
    const s = overviewSegments(P)
    expect(s.map(x => [x.label, x.weeks])).toEqual([
      ['Design & approvals', 32], ['Governance', 6], ['Tender', 12], ['Construction 1', 26],
      ['Handover', 5], ['Construction 2', 34], ['Float', 9],
    ])
    expect(s.reduce((a, x) => a + x.weeks, 0)).toBe(124)
    expect(s.find(x => x.label === 'Governance').narrow).toBe(true)
  })

  it('picks six milestones from stage boundaries and flags the missed target', () => {
    const m = selectMilestones(P)
    expect(m.map(x => [x.id, x.label, x.week])).toEqual([
      ['M1', 'Project start (Stage 2)', 0], ['M2', 'Design complete', 32], ['M3', 'Start on site', 50],
      ['M4', 'Phase 1 practical completion', 81], ['M5', 'Final phase complete', 115], ['M6', 'Programme complete', 124],
    ])
    expect(m[5].missedTarget).toBe(true)
    expect(milestoneTickClass(m, 4, 124)).toBe('down')
    expect(milestoneTickClass(m, 5, 124)).toBe('last')
  })

  it('places the client target on the bar', () => {
    expect(Math.round(targetPct(P, sample.answers))).toBe(69)
  })

  it('folds client reviews into their stage and keeps surveys as one parallel row', () => {
    const rows = programmeDetailRows(P)
    expect(rows).toHaveLength(10)
    expect(rows[0]).toMatchObject({ stage: 'Surveys', parallel: true, weeks: 3 })
    expect(rows[1]).toMatchObject({ stage: 'Stage 2', activity: 'Concept Design, incl. 2-wk client review', weeks: 9 })
  })

  it('writes at most six narrative lines, no question numbers', () => {
    const lines = programmeNarrativeLines(P)
    expect(lines.length).toBeGreaterThanOrEqual(5)
    expect(lines.length).toBeLessThanOrEqual(6)
    expect(lines.join(' ')).not.toMatch(/Q\d/)
    expect(lines[0]).toMatch(/^Starts 11 Jan 2027 at Stage 2/)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run lib/__tests__/reportContent.programme.test.js`
Expected: FAIL, functions missing.

- [ ] **Step 3: Implement (append to `lib/reportContent.js`; add `import { fmtDate } from './reportShared.js'` at the top)**

```js
// ─── Programme ───────────────────────────────────────────────────────────────
export function stageCategory(s) {
  if (s?.parallel) return 'parallel'
  const n = String(s?.stage || '').toLowerCase()
  if (/float/.test(n)) return 'float'
  if (/handover/.test(n)) return 'handover'
  if (/construction|phase/.test(n)) return 'construction'
  if (/tender|procurement/.test(n)) return 'tender'
  if (/governance/.test(n)) return 'governance'
  return 'design'
}

export const SEGMENT_KEY_LABELS = Object.freeze({
  design: 'Design & approvals', governance: 'Governance', tender: 'Tender',
  construction: 'Construction', handover: 'Handover', float: 'Float',
})

const wks = s => s?.weeks ?? s?.durationWks ?? 0
const NARROW_PCT = 8

export function overviewSegments(programme) {
  const total = programme?.totalWeeks || 0
  const out = []
  for (const s of programme?.stages || []) {
    if (s.parallel || !wks(s)) continue
    const category = stageCategory(s)
    const last = out[out.length - 1]
    if (last && last.category === category) {
      last.weeks += wks(s)
      last.endWeek = s.endWeek ?? last.endWeek + wks(s)
      continue
    }
    const startWeek = s.startWeek ?? (last ? last.endWeek : 0)
    out.push({ category, label: SEGMENT_KEY_LABELS[category], weeks: wks(s), startWeek, endWeek: s.endWeek ?? startWeek + wks(s) })
  }
  const cons = out.filter(x => x.category === 'construction')
  if (cons.length > 1) cons.forEach((c, i) => { c.label = `Construction ${i + 1}` })
  for (const x of out) {
    x.pct = total ? (x.weeks / total) * 100 : 0
    x.narrow = x.pct < NARROW_PCT
  }
  return out
}

export function selectMilestones(programme) {
  const seq = (programme?.stages || []).filter(s => !s.parallel && wks(s) > 0)
  if (!seq.length) return []
  const cat = stageCategory
  const cons = seq.filter(s => cat(s) === 'construction')
  const firstCon = cons[0], lastCon = cons[cons.length - 1]
  const lastDesign = [...seq].reverse().find(s => cat(s) === 'design' && (!firstCon || (s.endWeek ?? 0) <= (firstCon.startWeek ?? Infinity)))
  const firstPC = seq.find(s => cat(s) === 'handover')
  const phased = !!(firstPC && lastCon && (lastCon.startWeek ?? 0) >= (firstPC.endWeek ?? Infinity))
  const ms = []
  const add = (label, date, week) => ms.push({ label, date, week })
  add(`Project start (${seq[0].stage})`, seq[0].startDate, seq[0].startWeek ?? 0)
  if (lastDesign) add('Design complete', lastDesign.endDate, lastDesign.endWeek)
  if (firstCon) add('Start on site', firstCon.startDate, firstCon.startWeek)
  if (firstPC) add(phased ? 'Phase 1 practical completion' : 'Practical completion', firstPC.endDate, firstPC.endWeek)
  if (phased) add('Final phase complete', lastCon.endDate, lastCon.endWeek)
  else if (!firstPC && lastCon) add('Construction complete', lastCon.endDate, lastCon.endWeek)
  add('Programme complete', programme.endDate, programme.totalWeeks)
  const kept = ms.length > LIMITS.milestonesMax ? [...ms.slice(0, LIMITS.milestonesMax - 1), ms[ms.length - 1]] : ms
  return kept.map((m, i) => ({
    id: `M${i + 1}`, ...m,
    missedTarget: i === kept.length - 1 && programme.targetStatus === 'at-risk',
  }))
}

const TICK_GAP = 0.09
export function milestoneTickClass(ms, i, totalWeeks) {
  if (i === 0) return 'first'
  if (i === ms.length - 1) return 'last'
  const gap = (a, b) => (totalWeeks ? Math.abs(b.week - a.week) / totalWeeks : 1)
  const nextClose = gap(ms[i], ms[i + 1]) < TICK_GAP
  const prevClose = gap(ms[i - 1], ms[i]) < TICK_GAP && milestoneTickClass(ms, i - 1, totalWeeks) !== 'down'
  return nextClose || prevClose ? 'down' : ''
}

export function targetPct(programme, answers) {
  const t = answers?.q4_1_targetDate
  if (!t || t === 'No specific deadline' || !programme?.startDate || !programme?.totalWeeks) return null
  const weeks = (new Date(t) - new Date(programme.startDate)) / (7 * 86400000)
  const pct = (weeks / programme.totalWeeks) * 100
  return pct > 0 && pct < 100 ? pct : null
}

export function programmeDetailRows(programme) {
  const stages = programme?.stages || []
  const rows = []
  const surveys = stages.filter(s => s.parallel && /survey/i.test(s.stage))
  if (surveys.length) {
    const starts = surveys.map(s => s.startDate).filter(Boolean).sort()
    const ends = surveys.map(s => s.endDate).filter(Boolean).sort()
    rows.push({ stage: 'Surveys', activity: surveys.map(s => s.activity || s.stage).join('; '), start: starts[0], end: ends[ends.length - 1], weeks: Math.max(...surveys.map(wks)), parallel: true })
  }
  for (const s of stages) {
    if (s.parallel && /survey/i.test(s.stage)) continue
    const prev = rows[rows.length - 1]
    if (/^gateway$/i.test(String(s.stage).trim()) && prev && !prev.parallel && /^stage /i.test(prev.stage)) {
      prev.activity = `${prev.activity}, incl. ${wks(s)}-wk client review`
      prev.weeks += wks(s)
      prev.end = s.endDate
      continue
    }
    rows.push({ stage: s.stage, activity: s.activity, start: s.startDate, end: s.endDate, weeks: wks(s), parallel: !!s.parallel })
  }
  return rows
}

const NUMBER_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight']

export function programmeNarrativeLines(programme) {
  if (!programme) return []
  const stages = programme.stages || []
  const seq = stages.filter(s => !s.parallel)
  const lines = []
  const surveys = stages.some(s => s.parallel && /survey/i.test(s.stage))
  if (programme.startDate && seq[0]) {
    lines.push(`Starts ${fmtDate(programme.startDate)} at ${seq[0].stage}${programme.startDateAssumed ? ' (assumed; no start date was given)' : ''}${surveys ? '; surveys run alongside design and are not on the critical path' : ''}.`)
  }
  const gateways = stages.filter(s => /^gateway$/i.test(String(s.stage).trim())).length
  const gov = programme.grantGovernanceWeeks || 0
  if (gateways || gov) {
    const parts = [gateways ? `${NUMBER_WORDS[gateways] || gateways} client review gateway${gateways > 1 ? 's' : ''}` : '', gov ? `a ${gov}-week governance approval` : ''].filter(Boolean)
    lines.push(`${parts.join(' and ')} sit on the critical path before tender.`)
  }
  const start = selectMilestones(programme).find(m => m.label === 'Start on site')
  if (programme.procurementRoute) {
    lines.push(`Procurement: ${programme.procurementRoute}${programme.tenderWeeks ? ` over ${programme.tenderWeeks} weeks` : ''}${start ? `, contractor appointed ${fmtDate(start.date)}` : ''}.`)
  }
  const cons = seq.filter(s => stageCategory(s) === 'construction')
  if (cons.length > 1) lines.push(`Construction is phased: ${cons.map(c => `${wks(c)} weeks`).join(', then ')}, including re-mobilisation between phases.`)
  else if (cons.length === 1) lines.push(`Construction takes ${wks(cons[0])} weeks${programme.occupationUplift > 0 ? ', including an allowance for working around occupants' : ''}.`)
  if (programme.floatWeeks > 0) lines.push(`${programme.floatWeeks} weeks of float are included; the best case is ${programme.totalWeeksBestCase} weeks.`)
  lines.push(programme.planningWeeks > 0
    ? `A ${programme.planningWeeks}-week planning determination gates technical design.`
    : 'No planning application is assumed; building control approval runs alongside technical design.')
  return lines.slice(0, LIMITS.listMax)
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run lib/__tests__/reportContent.programme.test.js`
Expected: PASS. If the milestone list differs, print `P.stages.map(s => [s.stage, s.startWeek, s.endWeek, s.parallel])` and adjust only the selection rule (not the test's expected sample values, which were read off the approved template).

- [ ] **Step 5: Commit**

```bash
git add lib/reportContent.js lib/__tests__/reportContent.programme.test.js
git commit -m "Programme content: six milestones, one-line bar segments, folded detail rows, narrative"
```

---

### Task 6: Cost content (works rows, project cost rows, percentage lines, assumptions, exclusions)

**Files:**
- Modify: `lib/reportContent.js`
- Test: `lib/__tests__/reportContent.cost.test.js`

**Interfaces:**
- Consumes: `NRM1_GROUP_LABELS`, `UNVERIFIED_MARK`, `belowLineRows`, `scopeAssumptionLines`, `applicableExclusions` from `lib/reportShared.js`.
- Produces:
  - `groupTitle(li) → string`, `worksRows(cost) → [{type:'group', label} | {type:'line', item}]`, `worksTableMode(cost) → 'lines'|'groups'`, `worksGroupRows(cost) → [{ label, count, low, high }]`, `appendixChunks(cost) → rows[][]`
  - `lineQty(li) → string`, `lineBasisWord(li) → string`
  - `costIntroText(cost) → string`, `projectCostRows(cost) → [{ label, rate, low, high, kind }]`
  - `percentageLines(cost) → [{ name, pct, text }]`, `accuracyStatement(cost) → string`
  - `costAssumptionLines(cost) → string[]` (≤ 6), `costExclusionLines(cost, answers) → string[]` (≤ 6)

- [ ] **Step 1: Write the failing test**

```js
// lib/__tests__/reportContent.cost.test.js
import { describe, it, expect } from 'vitest'
import sample from '../../public/sample/report.json'
import { longScopeReport } from '../reportFixtures.js'
import {
  worksRows, worksTableMode, worksGroupRows, appendixChunks, lineQty, lineBasisWord, projectCostRows,
  percentageLines, accuracyStatement, costAssumptionLines, costExclusionLines, costIntroText, money,
} from '../reportContent.js'

const C = sample.cost

describe('works cost page', () => {
  it('lists every line under its group and fits on one page', () => {
    const rows = worksRows(C)
    expect(rows.filter(r => r.type === 'line')).toHaveLength(20)
    expect(rows.filter(r => r.type === 'group')).toHaveLength(5)
    expect(worksTableMode(C)).toBe('lines')
    const toilet = C.lineItems.find(l => l.description === 'Toilets — Accessible')
    expect(lineQty(toilet)).toBe('3 nr')
    expect(lineBasisWord(toilet)).toBe('client figure')
  })
  it('switches a long scope to group rows plus Appendix A', () => {
    const long = longScopeReport(sample).cost
    expect(worksTableMode(long)).toBe('groups')
    const groups = worksGroupRows(long)
    expect(groups.reduce((a, g) => a + g.count, 0)).toBe(40)
    expect(appendixChunks(long).length).toBeGreaterThanOrEqual(2)
  })
  it('explains the table in one short paragraph', () => {
    const t = costIntroText(C)
    expect(t).toMatch(/standard-specification refurbishment/)
    expect(t.length).toBeLessThan(520)
  })
})

describe('project cost page', () => {
  it('builds the summary table with rates, a construction subtotal, the total and VAT', () => {
    const rows = projectCostRows(C)
    const byLabel = Object.fromEntries(rows.map(r => [r.label, r]))
    expect(byLabel["Contractor's preliminaries (A)"].rate).toBe('10% of works')
    expect(money(byLabel["Contractor's preliminaries (A)"].low, C.total.high)).toBe('£101,000')
    expect(byLabel['Construction cost'].kind).toBe('subtotal')
    expect(byLabel['Professional fees (C)'].rate).toBe('16% of construction')
    expect(rows.at(-2)).toMatchObject({ label: 'Total project cost (excl. VAT)', kind: 'total', low: 1600000 })
    expect(rows.at(-1).kind).toBe('ref')
  })
  it('explains each percentage in plain words, no question numbers', () => {
    const lines = percentageLines(C)
    expect(lines.map(l => l.name)).toEqual(['Preliminaries', 'Overheads and profit', 'Professional fees', 'Risk', 'Contingency', 'Inflation'])
    expect(lines[0].text).toBe('8% base, plus 1% for partially occupied, 0.5% for restricted working hours, 0.5% for programme duration > 18 months')
    expect(lines[4].text).toBe('fixed for every report')
    expect(lines.map(l => l.text).join(' ')).not.toMatch(/Q\d/)
  })
  it('states accuracy once and caps assumptions and exclusions at six', () => {
    expect(accuracyStatement(C)).toMatch(/−11% \/ \+11%/)
    const a = costAssumptionLines(C)
    const e = costExclusionLines(C, sample.answers)
    expect(a.length).toBeLessThanOrEqual(6)
    expect(e.length).toBeLessThanOrEqual(6)
    expect(e[0]).toMatch(/^VAT/)
  })
})
```

This test imports `longScopeReport`, which Task 7 creates. Create `lib/reportFixtures.js` now with the `longScopeReport` export from Task 7 Step 3 (copy it exactly) so this test can run; Task 7 adds `worstCaseReport` to the same file.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run lib/__tests__/reportContent.cost.test.js`
Expected: FAIL, functions missing.

- [ ] **Step 3: Implement (append to `lib/reportContent.js`; extend the `reportShared.js` import)**

```js
import { fmtDate, NRM1_GROUP_LABELS, UNVERIFIED_MARK, belowLineRows, scopeAssumptionLines, applicableExclusions } from './reportShared.js'

// ─── Works cost ──────────────────────────────────────────────────────────────
export const groupTitle = li => `${li.group === 99 ? '' : `${li.group} · `}${li.groupLabel || NRM1_GROUP_LABELS[li.group] || `Group ${li.group}`}`

export function worksRows(cost) {
  const rows = []
  let g
  for (const li of cost?.lineItems || []) {
    if (li.group !== g) { rows.push({ type: 'group', group: li.group, label: groupTitle(li) }); g = li.group }
    rows.push({ type: 'line', item: li })
  }
  return rows
}

export const worksTableMode = cost => (worksRows(cost).length <= LIMITS.worksRowsPerPage ? 'lines' : 'groups')

export function worksGroupRows(cost) {
  const m = new Map()
  for (const li of cost?.lineItems || []) {
    const r = m.get(li.group) || { group: li.group, label: groupTitle(li), count: 0, low: 0, high: 0 }
    r.count++
    r.low += li.lineLow || 0
    r.high += li.lineHigh || 0
    m.set(li.group, r)
  }
  return [...m.values()]
}

export function appendixChunks(cost) {
  const rows = worksRows(cost)
  const out = []
  for (let i = 0; i < rows.length; i += LIMITS.appendixRowsPerPage) out.push(rows.slice(i, i + LIMITS.appendixRowsPerPage))
  return out
}

const fmtQty = n => {
  const v = Number(n)
  if (!Number.isFinite(v)) return String(n ?? '')
  return (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString('en-GB')
}
export const lineQty = li => (li.unit === 'band' ? 'lump sum' : `${fmtQty(li.qty)} ${li.unit || ''}`.trim())
export const lineBasisWord = li => (li.qtySource === 'user' ? 'client figure' : li.qtySource ? 'estimated' : '')

const lineMid = li => li.lineMid ?? ((li.lineLow || 0) + (li.lineHigh || 0)) / 2

/** Page 6 intro when there is no AI cost narrative yet (pending or legacy). */
export function costIntroText(cost) {
  if (!cost) return ''
  const lines = (cost.lineItems || []).filter(l => l.code !== 'PS')
  const user = lines.filter(l => l.qtySource === 'user').length
  const est = lines.length - user
  const gifa = Number(cost.gifa || 0).toLocaleString('en-GB')
  const byGroup = new Map()
  for (const l of lines) {
    const k = l.groupLabel || NRM1_GROUP_LABELS[l.group] || `Group ${l.group}`
    byGroup.set(k, (byGroup.get(k) || 0) + lineMid(l))
  }
  const works = cost.works?.mid || [...byGroup.values()].reduce((a, b) => a + b, 0)
  const top = [...byGroup.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
  const share = works ? Math.round((top.reduce((a, [, v]) => a + v, 0) / works) * 100) : 0
  const topText = top.map(([g]) => g.toLowerCase()).join(' and ')
  return [
    `Each ticked scope item is priced at the NRM1 benchmark rate for a ${String(cost.specLevel || 'standard').toLowerCase()}-specification ${String(cost.projectType || '').toLowerCase()}, adjusted by the ${cost.bcisRegion} location factor (${cost.bcisFactor}).`,
    user ? `${est} quantities are estimated from the ${gifa} m² floor area and ${user} are the client's own figures.` : `Quantities are estimated from the ${gifa} m² floor area.`,
    top.length ? `${topText.charAt(0).toUpperCase()}${topText.slice(1)} account for ${share}% of the works cost.` : '',
    'The next page adds preliminaries, fees and allowances to reach the total project cost.',
  ].filter(Boolean).join(' ')
}

// ─── Project cost ────────────────────────────────────────────────────────────
const pctTxt = n => `${Math.round((Number(n) || 0) * 100) / 100}%`

export function projectCostRows(cost) {
  if (!cost) return []
  const p = cost.percentages || {}
  const w = cost.works || {}, c = cost.construction || {}, t = cost.total || {}
  const of = (base, pc) => ({ low: (base.low || 0) * (pc || 0) / 100, high: (base.high || 0) * (pc || 0) / 100 })
  const rows = [
    { label: 'Works cost', rate: 'from the works cost table', low: w.low, high: w.high, kind: 'row' },
    { label: "Contractor's preliminaries (A)", rate: `${pctTxt(p.prelims)} of works`, ...of(w, p.prelims), kind: 'row' },
    { label: 'Overheads and profit (B)', rate: `${pctTxt(p.ohp)} of works`, ...of(w, p.ohp), kind: 'row' },
    { label: 'Construction cost', rate: '', low: c.low, high: c.high, kind: 'subtotal' },
    { label: 'Professional fees (C)', rate: `${pctTxt(p.fees)} of construction`, ...of(c, p.fees), kind: 'row' },
  ]
  if ((cost.breakdown?.devCosts || 0) > 0) rows.push({ label: 'Developer and project costs (D)', rate: `${pctTxt(p.devCosts)} of construction`, ...of(c, p.devCosts), kind: 'row' })
  rows.push(
    { label: 'Risk allowance (E)', rate: `${pctTxt(p.risk)} of works`, ...of(w, p.risk), kind: 'row' },
    { label: 'Client contingency (H)', rate: `${pctTxt(p.contingency)} of works`, ...of(w, p.contingency), kind: 'row' },
  )
  if ((p.inflation || 0) > 0) rows.push({ label: 'Inflation allowance (F)', rate: `${pctTxt(p.inflation)} of works`, ...of(w, p.inflation), kind: 'row' })
  for (const b of belowLineRows(cost)) rows.push({ label: b.label, rate: b.basis, low: b.low, high: b.high, kind: 'row' })
  const vat = vatPct(cost)
  rows.push(
    { label: 'Total project cost (excl. VAT)', rate: '', low: t.low, high: t.high, kind: 'total' },
    { label: `VAT at ${vat}%, for reference (recoverability to be confirmed)`, rate: `${vat}%`, low: (t.low || 0) * vat / 100, high: (t.high || 0) * vat / 100, kind: 'ref' },
  )
  return rows
}

const PCT_NAMES = [
  ['prelims', 'Preliminaries'], ['ohp', 'Overheads and profit'], ['fees', 'Professional fees'],
  ['devCosts', 'Developer and project costs'], ['risk', 'Risk'], ['contingency', 'Contingency'], ['inflation', 'Inflation'],
]

export function plainRule(label) {
  let s = cleanReportText(label).replace(/\s*→.*$/, '').replace(/\s*\(use [^)]*\)/i, '').replace(/\s*—\s*no developer costs applied/i, '').trim()
  if (/^[A-Z][a-z]/.test(s)) s = s.charAt(0).toLowerCase() + s.slice(1)
  return s
}

export function percentageLines(cost) {
  const trace = cost?.trace
  if (!trace) return []
  const out = []
  for (const [key, name] of PCT_NAMES) {
    const applied = cost.percentages?.[key]
    if (!(applied > 0)) continue
    const entries = trace[key] || []
    let text
    if (entries.length === 1 && /^always\b/i.test(entries[0].label)) text = 'fixed for every report'
    else if (entries.length === 1 && entries[0].pct === applied && !/^(base|baseline)\b/i.test(entries[0].label)) text = `the standard rate for ${plainRule(entries[0].label)}`
    else {
      const parts = entries.map(e => (/^(base|baseline)\b/i.test(e.label) ? `${pctTxt(e.pct)} base` : `${pctTxt(e.pct)} for ${plainRule(e.label)}`))
      text = parts.length > 1 ? `${parts[0]}, plus ${parts.slice(1).join(', ')}` : (parts[0] || '')
    }
    out.push({ name, pct: pctTxt(applied), text })
  }
  return out.slice(0, LIMITS.listMax)
}

export function accuracyStatement(cost) {
  const r = cost?.rangeApplied
  if (!r) return 'Low and high show the benchmark rate range; at Stage 0–1 the outturn cost can move further as the design develops.'
  const lo = Math.round((1 - r.low) * 100), hi = Math.round((r.high - 1) * 100)
  return `Low and high are −${lo}% / +${hi}% around the mid-point${r.grade ? `, the range for a Grade ${r.grade} estimate` : ''}; at Stage 0–1 the outturn cost can move further as the design develops.`
}

export function costAssumptionLines(cost) {
  if (!cost) return []
  const lines = (cost.lineItems || []).filter(l => l.code !== 'PS')
  const userLines = lines.filter(l => l.qtySource === 'user')
  const out = [
    `National benchmark rates adjusted by the ${cost.bcisRegion} location factor (${cost.bcisFactor}); not measured quantities.${cost.bcisDefaulted ? ' The postcode matched no region, so a default factor was used.' : ''}`,
    lines.length > userLines.length ? `Estimated quantities are derived from the ${Number(cost.gifa || 0).toLocaleString('en-GB')} m² floor area and confirmed at Stage 2.` : null,
    userLines.length ? `Client figures are used for ${userLines.slice(0, 3).map(l => `${l.description} (${lineQty(l)})`).join(', ')}${userLines.length > 3 ? ' and others' : ''}.` : null,
    `Rates are for a ${String(cost.specLevel || 'standard').toLowerCase()} specification${cost.interventionLevel ? ` and ${String(cost.interventionLevel).toLowerCase()}` : ''}.`,
    accuracyStatement(cost),
    lines.some(l => l.aiEstimate) ? `Lines marked ${UNVERIFIED_MARK} use rates still to be verified against project examples.` : null,
    ...scopeAssumptionLines(cost),
  ].filter(Boolean)
  return out.slice(0, LIMITS.listMax)
}

const EXCLUSIONS = [
  ['vat', 'VAT (recoverability to be confirmed by the client)'],
  ['ffe', 'Loose furniture, fittings and AV equipment'],
  ['decant', 'Decant, removals and temporary accommodation'],
  ['land', 'Land, legal fees and statutory charges beyond planning'],
  ['asbestos', 'Asbestos removal beyond the risk allowance'],
  ['ground', 'Unforeseen ground or structural conditions'],
  ['party', 'Party wall awards and neighbourly matters'],
  ['archaeology', 'Archaeological investigation'],
]

export function costExclusionLines(cost, answers) {
  const groups = new Set((cost?.lineItems || []).map(i => i.group))
  const groundworks = groups.has(0) || groups.has(1) || groups.has(8)
  const partyWall = (answers?.q3_8_siteContext || []).some(x => /party wall/i.test(x))
  let list = EXCLUSIONS.filter(([k]) => (k !== 'archaeology' || groundworks) && (k !== 'party' || partyWall)).map(([, t]) => t)
  if (partyWall) list = [list[0], 'Party wall awards and neighbourly matters', ...list.slice(1).filter(t => !/^Party wall/.test(t))]
  return applicableExclusions(list, cost).slice(0, LIMITS.listMax)
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run lib/__tests__/reportContent.cost.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/reportContent.js lib/reportFixtures.js lib/__tests__/reportContent.cost.test.js
git commit -m "Cost content: works rows, project cost table, plain percentage lines, six assumptions and exclusions"
```

---

### Task 7: Scope content, late-section layout, page map and fixtures

**Files:**
- Modify: `lib/reportContent.js`, `lib/reportFixtures.js`
- Test: `lib/__tests__/reportContent.layout.test.js`

**Interfaces:**
- Consumes: `resolveSectionFlags` from `lib/reportShared.js`; `PAGE`, `TABLES`, `LIMITS`.
- Produces:
  - `scopeStatement(cost) → string`, `scopeGroups(cost) → [{ label, items }]`, `notInScopeLines(cost) → string[]`, `notPricedLines(cost) → string[]`
  - `EST` (height constants), `estimateHeight(blocks) → px`, `lateSectionBlocks(key, data) → blocks`, `layoutLateSections([{ key, blocks }]) → [[{ key, slot: 'top'|'bottom'|'full' }]]`
  - `buildPageMap(data, { isPending = false } = {}) → { pages: [{ kind, … }], ctx: { short, totalPages, roi, nextNo } }`
  - `DISCLAIMER`, `dataSourcesSentence(cost, programme)`
  - Fixtures: `worstCaseReport(sample)`, `longScopeReport(sample)`

- [ ] **Step 1: Write the failing test**

```js
// lib/__tests__/reportContent.layout.test.js
import { describe, it, expect } from 'vitest'
import sample from '../../public/sample/report.json'
import { worstCaseReport, longScopeReport } from '../reportFixtures.js'
import {
  scopeGroups, notInScopeLines, notPricedLines, estimateHeight, lateSectionBlocks, layoutLateSections, buildPageMap,
} from '../reportContent.js'
import { PAGE } from '../reportStyle.js'

describe('scope page', () => {
  it('groups ticked items by their workbook group, client counts inline', () => {
    const g = scopeGroups(sample.cost)
    expect(g.find(x => /Toilets/.test(x.label)).items).toContain('Toilets — Standard (18)')
    expect(notInScopeLines(sample.cost).length).toBeLessThanOrEqual(6)
    expect(notPricedLines(sample.cost)).toEqual([])
  })
})

describe('late sections', () => {
  const items = n => [{ band: 1 }, { list: Array.from({ length: n }, () => 'x'.repeat(300)) }]
  const small = [{ band: 1 }, { para: 'x'.repeat(300) }] // ≈ 154 px
  const medium = items(3)                                // ≈ 320 px
  const tall = items(6)                                  // ≈ 566 px: more than a half, less than a page
  const huge = items(10)                                 // ≈ 894 px: most of a page

  it('splits a page at the middle when both sections fit a half', () => {
    expect(layoutLateSections([{ key: 'roi', blocks: small }, { key: 'procurement', blocks: small }, { key: 'constraints', blocks: small }]))
      .toEqual([[{ key: 'roi', slot: 'top' }, { key: 'procurement', slot: 'bottom' }], [{ key: 'constraints', slot: 'top' }]])
  })
  it('lets the second section follow the first when it is taller than a half but both fit', () => {
    expect(estimateHeight(tall)).toBeGreaterThan(PAGE.halfSlotPx)
    expect(layoutLateSections([{ key: 'roi', blocks: small }, { key: 'procurement', blocks: tall }]))
      .toEqual([[{ key: 'roi', slot: 'flow' }, { key: 'procurement', slot: 'flow' }]])
  })
  it('gives sections their own pages when they cannot share', () => {
    expect(layoutLateSections([{ key: 'procurement', blocks: huge }, { key: 'constraints', blocks: huge }]))
      .toEqual([[{ key: 'procurement', slot: 'full' }], [{ key: 'constraints', slot: 'full' }]])
    expect(estimateHeight(medium)).toBeLessThan(estimateHeight(tall))
  })
  it('keeps the sample to two late pages', () => {
    const keys = ['roi', 'procurement', 'constraints']
    expect(layoutLateSections(keys.map(key => ({ key, blocks: lateSectionBlocks(key, sample) })))).toHaveLength(2)
  })
})

describe('page map', () => {
  it('fixes the order: scope is page 3, next steps is last', () => {
    const { pages, ctx } = buildPageMap(sample)
    expect(pages.slice(0, 7).map(p => p.kind)).toEqual(['cover', 'summary', 'scope', 'risk', 'programme', 'costWorks', 'costSummary'])
    expect(pages.at(-1).kind).toBe('last')
    expect(pages.filter(p => p.kind === 'late')).toHaveLength(2)
    expect(ctx.totalPages).toBe(pages.length)
  })
  it('adds Appendix A after the last page for a long scope', () => {
    const { pages } = buildPageMap(longScopeReport(sample))
    const i = pages.findIndex(p => p.kind === 'last')
    expect(pages.slice(i + 1).every(p => p.kind === 'appendix')).toBe(true)
    expect(pages.length).toBeGreaterThan(i + 1)
  })
  it('builds a worst case with capped content', () => {
    const w = worstCaseReport(sample)
    expect(w.aiProse.riskRegister).toHaveLength(10)
    expect(w.answers.q1_0_projectName.length).toBeGreaterThanOrEqual(88)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run lib/__tests__/reportContent.layout.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement fixtures (`lib/reportFixtures.js`, the whole file)**

```js
// lib/reportFixtures.js
/**
 * Report fixtures for tests and scripts/check-report-fit.mjs, built from the
 * sample so they stay realistic. worstCaseReport fills every prose slot to its
 * PROSE_LIMITS maximum; longScopeReport doubles the scope past one works page.
 */
const WORDS = ['programme', 'works', 'client', 'access', 'survey', 'design', 'planning', 'contractor']
const words = n => `${Array.from({ length: n }, (_, i) => WORDS[i % WORDS.length]).join(' ')}.`
const clone = o => JSON.parse(JSON.stringify(o))

export function worstCaseReport(sample) {
  const r = clone(sample)
  r.answers.q1_0_projectName = 'Refurbishment and extension of the North Wing Science Laboratories, Example University Campus'
  r.aiProse = {
    ...r.aiProse,
    executiveSummary: words(130),
    keyFindings: Array.from({ length: 5 }, () => words(35)),
    scopeAssumptions: Array.from({ length: 4 }, () => words(35)),
    costNarrative: words(65),
    roiNarrative: words(60),
    constraints: Array.from({ length: 5 }, () => ({ category: 'Programme', title: words(5).replace('.', ''), text: words(35) })),
    nextSteps: Array.from({ length: 5 }, () => words(40)),
    riskRegister: Array.from({ length: 10 }, (_, i) => ({
      ref: `R${i + 1}`, seedRef: 'NONE', category: 'Programme', likelihood: 'High', impact: 'High',
      rating: i < 4 ? 'High' : 'Medium', description: words(25), mitigation: words(20),
    })),
    procurementNarrative: words(70),
    procurementConsiderations: Array.from({ length: 3 }, () => words(35)),
    procurementConflicts: [words(30), words(30)],
  }
  return r
}

export function longScopeReport(sample) {
  const r = clone(sample)
  const base = r.cost.lineItems
  r.cost.lineItems = [...base, ...base.map(l => ({ ...l, code: `${l.code}b`, description: `${l.description} (phase 2)` }))]
  return r
}
```

- [ ] **Step 4: Implement scope, layout and page map (append to `lib/reportContent.js`; add `resolveSectionFlags` to the `reportShared.js` import and `PAGE, TABLES` to the `reportStyle.js` import)**

```js
// ─── Scope ───────────────────────────────────────────────────────────────────
export function scopeStatement(cost) {
  if (!cost) return ''
  const n = (cost.lineItems || []).filter(l => l.code !== 'PS').length
  return `${cost.projectType || 'Project'}${cost.interventionLevel ? ` (${String(cost.interventionLevel).toLowerCase()})` : ''} of ${Number(cost.gifa || 0).toLocaleString('en-GB')} m² GIFA, ${String(cost.specLevel || 'standard').toLowerCase()} specification, ${n} priced scope item${n === 1 ? '' : 's'}.`
}

export function scopeGroups(cost) {
  const m = new Map()
  for (const li of cost?.lineItems || []) {
    if (li.code === 'PS') continue
    const label = li.groupLabel || NRM1_GROUP_LABELS[li.group] || `Group ${li.group}`
    const g = m.get(label) || { label, items: [] }
    const name = li.qtySource === 'user' && li.unit === 'nr' ? `${li.description} (${fmtQty(li.qty)})` : li.description
    if (!g.items.includes(name)) g.items.push(name)
    m.set(label, g)
  }
  return [...m.values()].map(g => (g.items.length > LIMITS.scopeItemsPerGroup
    ? { ...g, items: [...g.items.slice(0, LIMITS.scopeItemsPerGroup - 1), `and ${g.items.length - LIMITS.scopeItemsPerGroup + 1} more (see the cost table)`] }
    : g))
}

export function notInScopeLines(cost) {
  const items = cost?.lineItems || []
  const groups = new Set(items.map(l => l.group))
  const names = items.map(l => `${l.item || ''} ${l.description || ''}`.toLowerCase())
  const out = []
  if (!names.some(n => /roof/.test(n))) out.push('Roof replacement or recovering')
  if (!names.some(n => /structur|frame/.test(n))) out.push('Structural alterations')
  if (!groups.has(1)) out.push('Substructure and new foundations')
  if (!groups.has(8)) out.push('External works and landscaping')
  if (!names.some(n => /loose furniture|ff&e/.test(n))) out.push('Loose furniture and AV equipment')
  out.push('Decant accommodation and removals')
  return out.slice(0, LIMITS.listMax)
}

export function notPricedLines(cost) {
  const out = [
    ...(cost?.excludedNoQuantity || []).map(e => `${e.description}: not priced (${cleanReportText(e.reason || 'quantity to be confirmed')}).`),
    ...(cost?.adjustments || []).map(a => `${a.item || a.description || a.code}: not priced (${cleanReportText(a.reason)}).`),
    ...(cost?.additionalScopeNote ? [cleanReportText(cost.additionalScopeNote)] : []),
  ]
  return out.length > LIMITS.notPricedMax
    ? [...out.slice(0, LIMITS.notPricedMax - 1), `And ${out.length - LIMITS.notPricedMax + 1} more selected items not priced.`]
    : out
}

// ─── Late sections: half-page slots ──────────────────────────────────────────
// Heights in CSS px on the 794 px page, matching app/report/doc/report.css.
// Deliberately a little generous; scripts/check-report-fit.mjs proves the real render fits.
export const EST = Object.freeze({
  band: 64, h3: 34, figs: 92, kvRow: 34, paraLine: 20, listLine: 19.5, listGap: 4,
  tableHead: 32, rowPad: 13, rowLine: 18.5, blockGap: 10, charsPerLine: 98,
})

export function estimateHeight(blocks) {
  let h = 0
  for (const b of blocks) {
    if (b.band) h += EST.band
    else if (b.h3) h += EST.h3
    else if (b.figs) h += EST.figs
    else if (b.kv) h += EST.kvRow * b.kv + EST.blockGap
    else if (b.para != null) h += Math.max(1, Math.ceil(String(b.para).length / EST.charsPerLine)) * EST.paraLine + EST.blockGap
    else if (b.list) h += b.list.reduce((a, t) => a + Math.ceil(String(t).length / (EST.charsPerLine - 4)) * EST.listLine + EST.listGap, 0) + (b.list.length ? EST.blockGap : 0)
    else if (b.table) {
      h += EST.tableHead + b.table.rows.reduce((a, cells) => a + EST.rowPad + EST.rowLine * Math.max(...cells.map((c, i) =>
        Math.ceil(String(c).length / Math.max(8, EST.charsPerLine * 1.07 * b.table.widths[i])))), 0)
    }
  }
  return Math.ceil(h)
}

export function lateSectionBlocks(key, data) {
  const a = data?.aiProse || {}
  if (key === 'roi') return [{ band: 1 }, { figs: 1 }, { para: a.roiNarrative || '' }]
  if (key === 'procurement') return [
    { band: 1 }, { kv: 3 }, { para: a.procurementNarrative || '' },
    ...(a.procurementConsiderations?.length ? [{ h3: 1 }, { list: a.procurementConsiderations }] : []),
    ...(a.procurementConflicts?.length ? [{ list: a.procurementConflicts }] : []),
  ]
  if (key === 'constraints') return [
    { band: 1 },
    { table: { widths: TABLES.constraints, rows: (a.constraints || []).map(c => [c.category, c.title, c.text]) } },
  ]
  return [{ band: 1 }]
}

/**
 * Two late sections share a page: split at the middle when each fits its half
 * ('top' / 'bottom'); otherwise the second follows the first ('flow') when both
 * fit the page; otherwise each takes its own page ('full', or 'top' when it
 * could still share with the next one).
 */
export function layoutLateSections(sections) {
  const pages = []
  let open = null // { h, slots } of a page with one section on it
  const bottomHalf = PAGE.bodyPx - PAGE.halfSlotPx
  for (const s of sections) {
    const h = estimateHeight(s.blocks)
    if (open) {
      const [first] = open.slots
      if (open.h <= PAGE.halfSlotPx && h <= bottomHalf) {
        first.slot = 'top'
        open.slots.push({ key: s.key, slot: 'bottom' })
        open = null
        continue
      }
      if (open.h + PAGE.slotGapPx + h <= PAGE.bodyPx) {
        first.slot = 'flow'
        open.slots.push({ key: s.key, slot: 'flow' })
        open = null
        continue
      }
      open = null
    }
    const slots = [{ key: s.key, slot: h <= PAGE.halfSlotPx ? 'top' : 'full' }]
    pages.push(slots)
    open = h < PAGE.bodyPx - PAGE.slotGapPx ? { h, slots } : null
  }
  return pages
}

// ─── Page map ────────────────────────────────────────────────────────────────
export function buildPageMap(data, { isPending = false } = {}) {
  const { answers, cost, aiProse } = data || {}
  const roi = calcRoi(answers, cost)
  const { showROI, showProc, showCon } = resolveSectionFlags(answers, roi)
  const late = []
  if (showROI) late.push({ key: 'roi' })
  if (showProc) late.push({ key: 'procurement' })
  if (showCon && (aiProse?.constraints?.length || isPending)) late.push({ key: 'constraints' })
  let sn = 5
  const numbers = {}
  for (const s of late) { numbers[s.key] = ++sn; s.blocks = lateSectionBlocks(s.key, data) }
  const nextNo = sn + 1
  const pages = ['cover', 'summary', 'scope', 'risk', 'programme', 'costWorks', 'costSummary'].map(kind => ({ kind }))
  for (const slots of layoutLateSections(late)) pages.push({ kind: 'late', slots: slots.map(s => ({ ...s, no: numbers[s.key] })) })
  pages.push({ kind: 'last', no: nextNo })
  if (worksTableMode(cost) === 'groups') {
    const chunks = appendixChunks(cost)
    chunks.forEach((rows, i) => pages.push({ kind: 'appendix', rows, part: i + 1, parts: chunks.length }))
  }
  return { pages, ctx: { short: shortTitle(answers), totalPages: pages.length, roi, nextNo } }
}

// ─── Last page ───────────────────────────────────────────────────────────────
export const DISCLAIMER = 'This report was produced at RIBA Stage 0–1 from benchmark cost and programme data. All figures are indicative and will change as surveys, design and procurement progress. It is not a formal cost plan and must not be used for a financial commitment without review by a Chartered Quantity Surveyor. Programme durations assume standard productivity and client decisions within the gateway periods shown.'

export function dataSourcesSentence(cost, programme) {
  const parts = [cost?.workbookVersion && `cost data ${cost.workbookVersion}`, programme?.workbookVersion && `programme data ${programme.workbookVersion}`].filter(Boolean)
  return parts.length ? `Sources: ${parts.join('; ')}.` : ''
}
```

- [ ] **Step 5: Run all content tests**

Run: `npx vitest run lib/__tests__/reportContent.layout.test.js lib/__tests__/reportContent.cost.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/reportContent.js lib/reportFixtures.js lib/__tests__/reportContent.layout.test.js
git commit -m "Report layout: scope lines, half-page slots for late sections, fixed page map, fixtures"
```

---

### Task 8: Fixed counts and word limits for the AI text

**Files:**
- Modify: `lib/proseSchema.js`, `lib/prose.js`, `app/api/reports/[id]/prose/route.js` (pass `onShapeMiss`)
- Test: `lib/__tests__/proseShape.test.js`

**Interfaces:**
- Produces in `lib/proseSchema.js`: `PROSE_LIMITS`, `HALF_FIELDS = { narrative: [...], risk: [...] }`, `limitGuidance(field) → string`.
- Produces in `lib/prose.js`: `proseShapeProblems(prose, fields) → string[]`, `trimToLimits(prose, fields) → prose`, `limitsPromptBlock(fields) → string`; `requestProseHalf(half, prompt, deadline, { onShapeMiss } = {})`.

- [ ] **Step 1: Write the failing test**

```js
// lib/__tests__/proseShape.test.js
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
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run lib/__tests__/proseShape.test.js`
Expected: FAIL.

- [ ] **Step 3: Add the limits table to `lib/proseSchema.js` (above `PROSE_TOOL_NARRATIVE`)**

```js
// ─── Fixed shape of the AI text ──────────────────────────────────────────────
// One table drives the tool field descriptions, the prompt's limits block and
// the code check (lib/prose.js proseShapeProblems), so they cannot disagree.
// See docs/superpowers/specs/2026-09-23-report-design-system-design.md §7.
export const PROSE_LIMITS = Object.freeze({
  executiveSummary: { words: [90, 130] },
  keyFindings: { count: [5, 5], words: [15, 35] },
  scopeAssumptions: { count: [3, 4], words: [1, 35] },
  costNarrative: { words: [45, 65] },
  roiNarrative: { words: [35, 60], optional: true },
  constraints: { count: [3, 5], fields: { title: [1, 5], text: [1, 35] } },
  nextSteps: { count: [5, 5], words: [1, 40] },
  riskRegister: { fields: { description: [1, 25], mitigation: [1, 20] } },
  procurementNarrative: { words: [40, 70] },
  procurementConsiderations: { count: [3, 3], words: [1, 35] },
  procurementConflicts: { count: [0, 2], words: [1, 30] },
})

export const HALF_FIELDS = Object.freeze({
  narrative: ['executiveSummary', 'keyFindings', 'scopeAssumptions', 'costNarrative', 'roiNarrative', 'constraints', 'nextSteps'],
  risk: ['riskRegister', 'procurementNarrative', 'procurementConsiderations', 'procurementConflicts'],
})

const range = ([lo, hi]) => (lo <= 1 ? `at most ${hi}` : `${lo}–${hi}`)

export function limitGuidance(field) {
  const l = PROSE_LIMITS[field]
  if (!l) return ''
  const parts = []
  if (l.count) parts.push(l.count[0] === l.count[1] ? `exactly ${l.count[0]} items` : `${l.count[0]}–${l.count[1]} items`)
  if (l.words) parts.push(`${l.count ? 'each ' : ''}${range(l.words)} words`)
  if (l.fields) parts.push(Object.entries(l.fields).map(([k, r]) => `${k} ${range(r)} words`).join(', '))
  if (l.optional) parts.push('empty string when there is no financial benefit')
  return parts.join(', ')
}
```

Then add `description: limitGuidance('<field>')` to each matching property of both tools. For example:

```js
      executiveSummary: { type: 'string', description: limitGuidance('executiveSummary') },
      keyFindings: { type: 'array', items: { type: 'string' }, description: limitGuidance('keyFindings') },
```

Do the same for `scopeAssumptions`, `costNarrative` (description: `'Explain in about four lines what drives the works cost table. ' + limitGuidance('costNarrative')`), `roiNarrative`, `constraints`, `nextSteps`, `riskRegister`, `procurementNarrative`, `procurementConsiderations` and `procurementConflicts`. Because `limitGuidance` is used in the tool objects, define `PROSE_LIMITS`/`limitGuidance` **above** them.

In `AI_SYSTEM_PROMPT`:
- rule 7: replace `Write concisely — each prose section should be 2–4 sentences maximum unless specified otherwise.` with `Write concisely. Follow the LENGTH AND COUNT LIMITS block exactly — item counts are exact, word counts are maximums.`
- rule 8: replace `Risk register: provide 5 to 8 risks.` with `Risk register: include every seeded risk, plus your own, at most 10 in total.`
- after rule 14, add rule 15: `15. NEVER cite questionnaire question numbers (such as "Q3.5" or "(Q3.1)") anywhere. Name the answer in words instead ("restricted working hours").`

- [ ] **Step 4: Add the check, the trim and the prompt block to `lib/prose.js`**

Add `PROSE_LIMITS, HALF_FIELDS` to the `@/lib/proseSchema` import, then add below `assertNoLeakedFigures`:

```js
// ─── Report shape (counts and word ranges) ───────────────────────────────────
export const WORD_TOLERANCE = 0.1
const wordCount = s => String(s || '').trim().split(/\s+/).filter(Boolean).length
const within = (n, [lo, hi]) => n >= Math.floor(lo * (1 - WORD_TOLERANCE)) && n <= Math.ceil(hi * (1 + WORD_TOLERANCE))

export function proseShapeProblems(prose, fields) {
  const problems = []
  for (const f of fields) {
    const lim = PROSE_LIMITS[f]
    const v = prose?.[f]
    if (!lim || v == null) continue
    if (typeof v === 'string') {
      if (lim.optional && !v.trim()) continue
      const n = wordCount(v)
      if (lim.words && !within(n, lim.words)) problems.push(`${f} has ${n} words; ${lim.words[0]}–${lim.words[1]} are required`)
      continue
    }
    if (!Array.isArray(v)) continue
    if (lim.count) {
      const [lo, hi] = lim.count
      if (v.length < lo || v.length > hi) problems.push(`${f} has ${v.length} item${v.length === 1 ? '' : 's'}; ${lo === hi ? `exactly ${lo}` : `${lo}–${hi}`} are required`)
    }
    v.forEach((item, i) => {
      if (typeof item === 'string' && lim.words) {
        const n = wordCount(item)
        if (!within(n, lim.words)) problems.push(`${f}[${i + 1}] has ${n} words; ${lim.words[0]}–${lim.words[1]} are allowed`)
      } else if (item && lim.fields) {
        for (const [k, r] of Object.entries(lim.fields)) {
          const n = wordCount(item[k])
          if (!within(n, r)) problems.push(`${f}[${i + 1}].${k} has ${n} words; ${r[0]}–${r[1]} are allowed`)
        }
      }
    })
  }
  return problems
}

/** Last-resort shape: drop items past a maximum. Never cuts a sentence. */
export function trimToLimits(prose, fields) {
  const out = { ...prose }
  for (const f of fields) {
    const max = PROSE_LIMITS[f]?.count?.[1]
    if (Array.isArray(out[f]) && max != null && out[f].length > max) out[f] = out[f].slice(0, max)
  }
  return out
}

export function limitsPromptBlock(fields) {
  return `LENGTH AND COUNT LIMITS (checked by code; a payload outside them is sent back):\n${fields.map(f => `- ${f}: ${limitGuidance(f)}`).join('\n')}`
}
```

Also import `limitGuidance` from `@/lib/proseSchema`.

Replace the body of `requestProseHalf` with:

```js
export async function requestProseHalf(half, prompt, deadline, { onShapeMiss } = {}) {
  const { tool, maxTokens, minAttemptMs, validate } = PROSE_HALVES[half]
  const fields = HALF_FIELDS[half]
  const allowed = extractFigures(prompt, { allowAnyInteger: true })
  let lastErr
  let bestEffort = null
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const budget = deadline - Date.now()
    if (budget < minAttemptMs) break
    const attemptPrompt = attempt === 0
      ? prompt
      : `${prompt}\n\nYOUR PREVIOUS ATTEMPT FAILED VALIDATION: ${lastErr.message}\nCall the tool again with the complete, corrected payload.`
    const startedAt = Date.now()
    try {
      const out = await requestProse(attemptPrompt, budget, tool, maxTokens)
      validate(out)
      assertNoLeakedFigures(out, allowed)
      const problems = proseShapeProblems(out, fields)
      if (problems.length === 0) {
        console.log(`[prose] ${half} ok in ${Date.now() - startedAt}ms (attempt ${attempt + 1}, budget ${budget}ms)`)
        return out
      }
      bestEffort = out
      throw new Error(`Report shape: ${problems.join('; ')}`)
    } catch (e) {
      lastErr = e
      console.warn(`[prose] ${half} attempt ${attempt + 1} failed: ${e.message}`)
      if (attempt < MAX_ATTEMPTS - 1) await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS * (attempt + 1)))
    }
  }
  if (bestEffort) {
    // A report is never lost to a style rule: keep the valid payload, trimmed.
    const message = lastErr?.message || 'Report shape miss'
    console.warn(`[prose] ${half} shape miss kept after retries: ${message}`)
    onShapeMiss?.(half, message)
    return trimToLimits(bestEffort, fields)
  }
  throw lastErr || new Error(`${half}: insufficient time budget remaining (${Math.max(0, deadline - Date.now())}ms left, needs ${minAttemptMs}ms)`)
}
```

In `validateRiskProcurement`, change the message `'riskRegister is empty — provide 5 to 8 risks'` to `'riskRegister is empty'`.

In `buildProsePrompts`, append `limitsPromptBlock(HALF_FIELDS.narrative)` to the narrative prompt's field-guidance text and `limitsPromptBlock(HALF_FIELDS.risk)` to the risk prompt's. Find where each half's guidance string is assembled (the JSON example around lines 752–800), and add the block on the line after that example. In the narrative example, change `keyFindings` to show 5 entries and `nextSteps` to 5.

- [ ] **Step 5: Report shape misses to Sentry from the prose route**

In `app/api/reports/[id]/prose/route.js`, where `requestProseHalf(half, prompt, deadline)` is called, pass:

```js
requestProseHalf(half, prompt, deadline, {
  onShapeMiss: (h, message) => Sentry.captureMessage(`[prose] shape miss (${h}): ${message}`, 'warning'),
})
```

(`Sentry` is already imported in that route.)

- [ ] **Step 6: Run the prose tests**

Run: `npx vitest run lib/__tests__/proseShape.test.js lib/__tests__/prose.test.js`
Expected: PASS. If a `prose.test.js` case asserted the old "5 to 8 risks" message, update that string only.

- [ ] **Step 7: Commit**

```bash
git add lib/proseSchema.js lib/prose.js app/api/reports/[id]/prose/route.js lib/__tests__/proseShape.test.js lib/__tests__/prose.test.js
git commit -m "Prose: fixed counts and word limits, checked in code, never failing a report"
```

---

## Milestone B: HTML report (screen and PDF)

Throughout this milestone, **copy the visual rules from `docs/superpowers/specs/2026-09-24-report-template-approved.html`**, replacing every literal colour and font size with the matching `var(--r-…)` from `cssVariables()`.

### Task 9: Page shell, fonts, CSS and `ReportDocument`

**Files:**
- Create: `app/report/doc/fonts.js`, `app/report/doc/report.css`, `app/report/doc/parts.jsx`, `app/report/doc/ReportDocument.jsx`
- Modify: `app/report/ReportRenderer.jsx`

**Interfaces:**
- Consumes: `cssVariables`, `BRAND` (reportStyle); `buildPageMap`, `money`, `reportReference`, `fmtLongDate` (reportContent).
- Produces: `<ReportDocument data reportId isPdf isPending />`; `ctx = { short, reference, totalPages, roi, nextNo, isPending, dateLong, money(n, bare = false) }`; parts `Sheet`, `BodyPage`, `Band`, `Cols`, `Pending`.

- [ ] **Step 1: Read the Next.js font docs**

Read `node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md` and `node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md`. Confirm that `next/font/google` may be called at module scope in a file imported by a client component, and note the `variable` option.

- [ ] **Step 2: Fonts**

```js
// app/report/doc/fonts.js
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'

export const plexSans = IBM_Plex_Sans({
  subsets: ['latin'], weight: ['400', '500', '600', '700'], style: ['normal', 'italic'],
  variable: '--r-font-sans', display: 'swap',
})
export const plexMono = IBM_Plex_Mono({
  subsets: ['latin'], weight: ['400', '500', '600'], variable: '--r-font-mono', display: 'swap',
})
```

- [ ] **Step 3: Shared parts**

```jsx
// app/report/doc/parts.jsx
import { BRAND } from '@/lib/reportStyle'

export function Sheet({ className = '', children }) {
  return <div className="r-sheet"><div className={`r-page ${className}`}>{children}</div></div>
}

export function RunningHeader({ ctx }) {
  return (
    <div className="r-rh">
      <div className="r-rh-brand"><i>{BRAND.mark}</i>{BRAND.name} <span>· {ctx.short}</span></div>
      <div className="r-rh-doc">Feasibility Report · Ref {ctx.reference}</div>
    </div>
  )
}

export function RunningFooter({ page, ctx }) {
  return (
    <div className="r-rf">
      <span><b>{BRAND.name}</b> · {BRAND.strapline} · {BRAND.web} · Indicative only</span>
      <span>Page {page} of {ctx.totalPages}</span>
    </div>
  )
}

export function BodyPage({ ctx, page, className = '', children }) {
  return (
    <Sheet>
      <RunningHeader ctx={ctx} />
      <div className={`r-body ${className}`}>{children}</div>
      <RunningFooter page={page} ctx={ctx} />
    </Sheet>
  )
}

export function Band({ no, title, note }) {
  return (
    <div className="r-band">
      <span className="r-band-no">{String(no).padStart(2, '0')}</span>
      <h2>{title}</h2>
      {note && <small>{note}</small>}
    </div>
  )
}

export function Cols({ widths }) {
  return <colgroup>{widths.map((w, i) => <col key={i} style={{ width: `${w * 100}%` }} />)}</colgroup>
}

export function Pending() {
  return <p className="r-pending" role="status">This section is being written and appears in a few seconds.</p>
}
```

- [ ] **Step 4: Styles**

Create `app/report/doc/report.css`. Port every rule from the approved template's `<style>`, **renaming classes with an `r-` prefix** (`.page` → `.r-page`, `.band` → `.r-band`, `.t` → `.r-t`, `.rh` → `.r-rh` and so on) and **replacing every literal colour and font size with `var(--r-…)`**. The mapping:

| Template literal | Variable |
|---|---|
| `--navy`, `--navy-mid`, `--navy-deep`, `#12233A` | `var(--r-navy)`, `var(--r-navy-mid)`, `var(--r-navy-deep)`, `var(--r-navy-text)` |
| `--amber-rule`, `--amber-dark`, `--amber-text` | `var(--r-amber-rule)`, `var(--r-amber-on-dark)`, `var(--r-amber-text)` |
| `--ink`, `--grey`, `--mute`, `#4A566B`, `#5A6E88` | `var(--r-ink)`, `var(--r-grey)`, `var(--r-grey-mute)`, `var(--r-label)`, `var(--r-code)` |
| `--rule`, `--tint-head`, `--tint-band`, `--tint-group`, `#FDF3F2`, `--paper` | `var(--r-rule)`, `var(--r-tint-head)`, `var(--r-tint-band)`, `var(--r-tint-group)`, `var(--r-tint-high)`, `var(--r-paper)` |
| `--rag-high/med/low`, `--pass` | `var(--r-rag-high)`, `var(--r-rag-med)`, `var(--r-rag-low)`, `var(--r-pass)` |
| `--on-navy`, `--on-navy-mute` | `var(--r-on-navy)`, `var(--r-on-navy-mute)` |
| segment fills `#3E5C84 #7B5113 #5B7BA6 #4A5568 #4F8A3C #7D8798 #B5BCC8` | `var(--r-seg-design)`, `var(--r-seg-governance)`, `var(--r-seg-tender)`, `var(--r-seg-handover)`, `var(--r-seg-survey)`, `var(--r-seg-float-a)`, `var(--r-seg-float-b)` |
| font sizes 21px / 14.5px / 13.5px / 12.5px / 10.5–11.5px / 18px | `var(--r-fs-section-title)` / `var(--r-fs-sub-heading)` / `var(--r-fs-body)` / `var(--r-fs-table)` / `var(--r-fs-small)` / `var(--r-fs-stat-figure)` |
| cover sizes (30 / 9.5 / 13 / 36 / 17 / 28 / 11 / 14 / 12 / 12.5 px) | `var(--r-cv-brand)`, `--r-cv-tagline`, `--r-cv-eyebrow`, `--r-cv-title`, `--r-cv-subtitle`, `--r-cv-figure`, `--r-cv-label`, `--r-cv-facts`, `--r-cv-note`, `--r-cv-foot` |
| `font-family: var(--sans)` / `var(--mono)` | `var(--r-sans)` / `var(--r-mono)` |

Also include these rules, which the template handled with inline styles or JavaScript:

```css
/* app/report/doc/report.css — the report's styles. Every colour and font size
   is a var() from lib/reportStyle.js cssVariables(); reportStyleGuard.test.js
   fails on any literal. The approved look: docs/superpowers/specs/2026-09-24-report-template-approved.html */
.r-doc { font-family: var(--r-sans); color: var(--r-ink); font-variant-numeric: lining-nums tabular-nums;
         display: flex; flex-direction: column; align-items: center; gap: 18px; width: 100%; }
.r-sheet { width: calc(794px * var(--s, 1)); height: calc(1123px * var(--s, 1)); flex-shrink: 0; }
.r-page { width: 794px; height: 1123px; background: var(--r-paper); position: relative; overflow: hidden;
          transform: scale(var(--s, 1)); transform-origin: top left; font-size: var(--r-fs-body); line-height: 1.48;
          box-shadow: 0 1px 3px rgba(0,0,0,.14), 0 8px 26px rgba(0,0,0,.08); }
.r-cv-title.long { font-size: var(--r-cv-title-long); }
.r-slot-top { height: 486px; overflow: hidden; }
.r-slot-flow + .r-slot-flow { margin-top: 24px; padding-top: 4px; }
.r-lastp { display: flex; flex-direction: column; }
.r-contact { margin-top: auto; }
.r-ms-list { display: grid; grid-template-columns: 1fr 1fr; grid-auto-flow: column; grid-template-rows: repeat(var(--rows, 3), auto); gap: 4px 28px; }
.r-pending { color: var(--r-grey-mute); font-style: italic; }
.r-callout-ok { border-left-color: var(--r-pass); } .r-callout-ok b { color: var(--r-pass); }
.r-callout-warn { border-left-color: var(--r-warn); } .r-callout-warn b { color: var(--r-warn); }
.r-callout-bad { border-left-color: var(--r-rag-high); } .r-callout-bad b { color: var(--r-rag-high); }
.r-seg-design { background: var(--r-seg-design); } .r-seg-governance { background: var(--r-seg-governance); }
.r-seg-tender { background: var(--r-seg-tender); } .r-seg-construction { background: var(--r-seg-construction); }
.r-seg-handover { background: var(--r-seg-handover); }
.r-seg-float { background: repeating-linear-gradient(135deg, var(--r-seg-float-a) 0 3px, var(--r-seg-float-b) 3px 6px); color: var(--r-ink) !important; }

@media print {
  @page { size: A4; margin: 0; }
  body { margin: 0; background: var(--r-paper) !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .no-print { display: none !important; }
  .r-doc { display: block; gap: 0; }
  .r-sheet { width: auto; height: auto; break-after: page; }
  .r-sheet:last-child { break-after: auto; }
  .r-page { transform: none !important; box-shadow: none; }
}
```

`--r-cv-title-long` comes from the `COVER_TYPE` loop in `cssVariables()` (`titleLong` → `title-long`); no extra key is needed.

- [ ] **Step 5: `ReportDocument`**

```jsx
// app/report/doc/ReportDocument.jsx
'use client'
import { useEffect, useRef, useState } from 'react'
import './report.css'
import { cssVariables } from '@/lib/reportStyle'
import { buildPageMap, money, reportReference, fmtLongDate } from '@/lib/reportContent'
import { plexSans, plexMono } from './fonts'
import CoverPage from './CoverPage'
import SummaryPage from './SummaryPage'
import ScopePage from './ScopePage'
import RiskPage from './RiskPage'
import ProgrammePage from './ProgrammePage'
import { CostWorksPage, CostSummaryPage, AppendixPage } from './CostPages'
import LatePage from './LatePages'
import LastPage from './LastPage'

const PAGES = {
  cover: CoverPage, summary: SummaryPage, scope: ScopePage, risk: RiskPage, programme: ProgrammePage,
  costWorks: CostWorksPage, costSummary: CostSummaryPage, late: LatePage, last: LastPage, appendix: AppendixPage,
}

export default function ReportDocument({ data, reportId, isPdf = false, isPending = false }) {
  const ref = useRef(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    if (isPdf || !ref.current) return undefined
    const el = ref.current
    const fit = () => setScale(Math.min(1, el.clientWidth / 794))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [isPdf])

  const { pages, ctx: base } = buildPageMap(data, { isPending })
  const high = data?.cost?.total?.high
  const ctx = {
    ...base, isPending,
    reference: reportReference(reportId, data),
    dateLong: fmtLongDate(data?.generatedAt || new Date().toISOString()),
    money: (n, bare = false) => money(n, high, { symbol: !bare }),
  }

  return (
    <div ref={ref} className={`r-doc ${plexSans.variable} ${plexMono.variable}`} style={{ ...cssVariables(), '--s': scale }}>
      {pages.map((p, i) => {
        const Page = PAGES[p.kind]
        return <Page key={i} n={i + 1} page={p} data={data} ctx={ctx} />
      })}
    </div>
  )
}
```

Until Tasks 10–14 land, create each imported page file as a one-line stub, so the build stays green:

```jsx
// app/report/doc/CoverPage.jsx (stub, replaced in Task 10)
import { Sheet } from './parts'
export default function CoverPage() { return <Sheet className="r-cover" /> }
```

Do the same for `SummaryPage`, `ScopePage`, `RiskPage`, `ProgrammePage`, `LatePages` (default export `LatePage`) and `LastPage`, each returning `<BodyPage ctx={ctx} page={n} />`. `CostPages.jsx` exports named `CostWorksPage`, `CostSummaryPage` and `AppendixPage` stubs.

- [ ] **Step 6: Swap the document into `ReportRenderer.jsx`**

In `app/report/ReportRenderer.jsx`:
1. Delete the `<style>{…}</style>` print-rules block (it starts at `{/* ── Print rules ── */}`).
2. Delete from `{/* ── Print running header` down to the closing `</div>` of `report-outer`. That covers the cover, the content, the ComparePanel call and the CTA. Replace it with:

```jsx
      <div className="report-outer" style={{ padding: isPdf ? 0 : '24px 16px 48px' }}>
        <ReportDocument data={data} reportId={reportId} isPdf={isPdf} isPending={isPending} />
        {!isPdf && !sample && answers && cost && (
          <div className="no-print" style={{ maxWidth: 794, margin: '24px auto 0' }}>
            <ComparePanel answers={answers} currentTotal={cost.total} />
          </div>
        )}
        {!isPdf && (
          <div className="no-print" style={{ maxWidth: 794, margin: '24px auto 0' }}>
            {/* keep the existing sample / download CTA JSX here, unchanged */}
          </div>
        )}
      </div>
```

Move the two existing CTA blocks (`{sample ? (…) : (…)}`) into that last `div` unchanged.
3. Add `import ReportDocument from './doc/ReportDocument'`.
4. Delete the now-unused helpers: `SecHdr`, `SubHdr`, `PendingNote`, `InfoBox`, `Rag`, `ScopeText`, `WorksTable`, `ConstructionTable`, `TotalCostTable`, `BuildUpTable`, `CostTable4`, `ProgrammeTable`, `GANTT_MAP`, `GanttBar`, `RiskTable`, `ConstraintsTable`, `buildEstimateBasis`, `buildNotCosted`, `buildScopeReconciliation`, `buildCostAssumptions`, `COST_EXCLUSIONS`, `costExclusions`, the local `RISK_RANK`/`deriveCostRiskLevel`/`calcRoi`, the style constants no longer referenced, and the cover's variables (`grade`, `confLabel`, `riskLevel`, `roi`, `dateStr`, section numbers). Remove the imports that become unused. Keep the toolbar, alerts, `ComparePanel`, `FeedbackModal`, `btnStyle` and `alertStyle`.

- [ ] **Step 7: Verify the shell renders**

Run: `npm run build`
Expected: build succeeds.

Start the gate-open preview (`preview_start` with `estates-ai-tool-open`), open `/sample`, and confirm with `read_page` that 10 `.r-page` elements render with page numbers "Page 2 of 10" … "Page 10 of 10" and no console errors (`read_console_messages`).

- [ ] **Step 8: Commit**

```bash
git add app/report/doc app/report/ReportRenderer.jsx lib/reportStyle.js
git commit -m "Report page shell: A4 sheets, IBM Plex, running header/footer, section band"
```

---

### Task 10: Cover and summary pages

**Files:**
- Modify (replace stubs): `app/report/doc/CoverPage.jsx`, `app/report/doc/SummaryPage.jsx`

- [ ] **Step 1: Cover**

```jsx
// app/report/doc/CoverPage.jsx
import { BRAND } from '@/lib/reportStyle'
import { coverTitle, coverTitleSize, coverSubtitle, coverCostRange, confidenceWord, deriveCostRiskLevel } from '@/lib/reportContent'
import { Sheet } from './parts'

export default function CoverPage({ data, ctx }) {
  const { answers, cost, programme, confidence, aiProse } = data
  const title = coverTitle(answers)
  const grade = confidence?.score || aiProse?.confidenceScore || 'B'
  const label = confidence?.label || aiProse?.confidenceLabel || 'Moderate Confidence'
  return (
    <Sheet className="r-cover">
      <div className="r-cv-top">
        <div className="r-cv-brand"><span className="r-mark">{BRAND.mark}</span><div><b>{BRAND.name}</b><small>{BRAND.tagline}</small></div></div>
        <div className="r-cv-eyebrow"><div className="l1">RIBA STAGE 0–1</div><div className="l2">FEASIBILITY REPORT</div></div>
        <h1 className={`r-cv-title ${coverTitleSize(title)}`}>{title}</h1>
        <div className="r-cv-rule" />
        <div className="r-cv-sub">{coverSubtitle(answers, cost)}</div>
      </div>
      <div className="r-cv-figs">
        <div><div className="r-lbl">Total project cost</div><div className="v">{coverCostRange(cost)}</div><div className="s">excl. VAT</div></div>
        <div><div className="r-lbl">Programme</div><div className="v">{programme?.totalWeeks ?? '—'} weeks</div><div className="s">{programme?.floatWeeks > 0 ? `incl. ${programme.floatWeeks} weeks float` : 'critical path'}</div></div>
        <div><div className="r-lbl">Confidence</div><div className="v">Grade {grade}</div><div className="s">{confidenceWord(label)} · cost risk {deriveCostRiskLevel(cost, aiProse).toLowerCase()}</div></div>
      </div>
      <div className="r-cv-facts">
        <table className="r-facts"><tbody>
          <tr><td>Project type</td><td>{cost?.projectType || answers?.q1_2_projectType}</td></tr>
          {cost?.interventionLevel && <tr><td>Intervention</td><td>{cost.interventionLevel}</td></tr>}
          <tr><td>Specification</td><td>{cost?.specLevel}</td></tr>
        </tbody></table>
        <table className="r-facts"><tbody>
          <tr><td>Report date</td><td>{ctx.dateLong}</td></tr>
          <tr><td>Reference</td><td className="r-mono">{ctx.reference}</td></tr>
          <tr><td>Status</td><td>Indicative</td></tr>
        </tbody></table>
      </div>
      <p className="r-cv-note">Order of cost estimate from benchmark rates, not measured quantities. Not for financial commitment without review by a Chartered Quantity Surveyor.</p>
      <div className="r-cv-foot"><span>{BRAND.name.toUpperCase()} &nbsp;|&nbsp; FEASIBILITY REPORT</span><em>{BRAND.slogan}</em></div>
    </Sheet>
  )
}
```

- [ ] **Step 2: Summary**

```jsx
// app/report/doc/SummaryPage.jsx
import { cleanReportText, vatPct } from '@/lib/reportContent'
import { BodyPage, Band, Pending } from './parts'

const BUDGET = { sufficient: ['r-callout-ok', 'sufficient'], tight: ['r-callout-warn', 'tight'], insufficient: ['r-callout-bad', 'shortfall'] }

export default function SummaryPage({ data, ctx, n }) {
  const { cost, programme, aiProse, budget } = data
  const m = ctx.money
  const b = budget && budget.status !== 'none' && budget.note ? BUDGET[budget.status] : null
  return (
    <BodyPage ctx={ctx} page={n}>
      <div className="r-strip">
        <div><div className="r-lbl">Total project cost</div><div className="v">{m(cost?.total?.low)} – {m(cost?.total?.high)}</div><div className="s">Excl. VAT · {m(cost?.vat)} VAT at {vatPct(cost)}% (mid-point, for reference)</div></div>
        <div><div className="r-lbl">Programme</div><div className="v">{programme?.totalWeeks} weeks</div><div className="s">{programme?.floatWeeks > 0 ? `Incl. ${programme.floatWeeks} weeks float · best case ${programme.totalWeeksBestCase} weeks` : 'Critical path, no float'}</div></div>
        <div><div className="r-lbl">BCIS region</div><div className="v">{cost?.bcisRegion || '—'}</div><div className="s">Location factor {cost?.bcisFactor}</div></div>
      </div>
      <Band no={1} title="Executive Summary" />
      {aiProse?.executiveSummary ? <p>{cleanReportText(aiProse.executiveSummary)}</p> : ctx.isPending && <Pending />}
      {aiProse?.keyFindings?.length > 0 && <>
        <h3>Key findings</h3>
        <ul>{aiProse.keyFindings.map((k, i) => <li key={i}>{cleanReportText(k)}</li>)}</ul>
      </>}
      {b && <div className={`r-callout ${b[0]}`}><b>Budget check: {b[1]}.</b> {budget.note}</div>}
      {programme?.targetStatus === 'at-risk' && programme.targetNote && <div className="r-callout r-callout-warn"><b>Target date:</b> {programme.targetNote}</div>}
    </BodyPage>
  )
}
```

- [ ] **Step 3: Check in the browser**

Reload `/sample` in the preview. Take a screenshot of pages 1–2 and compare them with the approved template: cover layout, the two fact tables, the stat strip, five key findings with amber bullets, and the budget callout. Fix spacing in `report.css` only.

- [ ] **Step 4: Commit**

```bash
git add app/report/doc/CoverPage.jsx app/report/doc/SummaryPage.jsx app/report/doc/report.css
git commit -m "Report: cover and executive summary pages"
```

---

### Task 11: Scope and risk pages

**Files:**
- Modify (replace stubs): `app/report/doc/ScopePage.jsx`, `app/report/doc/RiskPage.jsx`

- [ ] **Step 1: Scope**

```jsx
// app/report/doc/ScopePage.jsx
import { cleanReportText, scopeStatement, scopeGroups, notInScopeLines, notPricedLines } from '@/lib/reportContent'
import { BodyPage, Band, Pending } from './parts'

export default function ScopePage({ data, ctx, n }) {
  const { cost, aiProse } = data
  const notPriced = notPricedLines(cost)
  return (
    <BodyPage ctx={ctx} page={n}>
      <Band no={2} title="Scope of Works" />
      <p>{scopeStatement(cost)}</p>
      <h3>Included works</h3>
      <div className="r-scope-grid">
        {scopeGroups(cost).map(g => (
          <div key={g.label} className={g.items.length > 4 ? 'wide' : ''}>
            <h4>{g.label}</h4>
            <ul>{g.items.map(it => <li key={it}>{it}</li>)}</ul>
          </div>
        ))}
      </div>
      <div className="r-two">
        <div>
          <h3>Scope assumptions</h3>
          {aiProse?.scopeAssumptions?.length
            ? <ul>{aiProse.scopeAssumptions.map((a, i) => <li key={i}>{cleanReportText(a)}</li>)}</ul>
            : ctx.isPending ? <Pending /> : <p className="r-lead">Scope to be confirmed after surveys and Stage 2 design.</p>}
        </div>
        <div>
          <h3>Not in scope</h3>
          <ul>{notInScopeLines(cost).map(l => <li key={l}>{l}</li>)}</ul>
        </div>
      </div>
      {notPriced.length > 0 && <>
        <h3>Selected but not priced</h3>
        <ul className="r-tight">{notPriced.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </>}
    </BodyPage>
  )
}
```

Add to `report.css`: `.r-scope-grid .wide { grid-column: span 2; } .r-scope-grid .wide ul { columns: 2; column-gap: 18px; }`.

- [ ] **Step 2: Risk register**

```jsx
// app/report/doc/RiskPage.jsx
import { TABLES, LIMITS } from '@/lib/reportStyle'
import { prepareRisks, RAG_CLASS } from '@/lib/reportContent'
import { BodyPage, Band, Cols, Pending } from './parts'

export default function RiskPage({ data, ctx, n }) {
  const { risks, counts } = prepareRisks(data.aiProse?.riskRegister)
  return (
    <BodyPage ctx={ctx} page={n}>
      <Band no={3} title="Risk Register" note={`Ordered by rating · ${LIMITS.maxRisks} risks at most`} />
      {risks.length === 0
        ? (ctx.isPending ? <Pending /> : <p className="r-lead">No risk register data available.</p>)
        : <>
          <div className="r-rag-sum" aria-label="Risk summary">
            {['High', 'Medium', 'Low'].map(k => <span key={k}><b className={`r-bg-${RAG_CLASS[k]}`}>{counts[k]}</b>{k}</span>)}
          </div>
          <table className="r-t r-risk">
            <Cols widths={TABLES.risk} />
            <thead><tr><th>Ref</th><th>Category</th><th>Description</th><th>Rating</th><th>Mitigation</th></tr></thead>
            <tbody>
              {risks.map(r => (
                <tr key={r.ref} className={RAG_CLASS[r.rating] || ''}>
                  <td className="r-ref">{r.ref}</td><td>{r.category}</td><td>{r.description}</td>
                  <td><span className={`r-pill ${RAG_CLASS[r.rating] || 'med'}`}>{r.rating}</span></td>
                  <td>{r.mitigation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>}
    </BodyPage>
  )
}
```

- [ ] **Step 3: Check in the browser**

Screenshot pages 3–4 of `/sample`. Expect: the grouped scope grid; 8 risks, R01–R03 High with the tinted rows and red edge; the summary badges 3 / 5 / 0.

- [ ] **Step 4: Commit**

```bash
git add app/report/doc/ScopePage.jsx app/report/doc/RiskPage.jsx app/report/doc/report.css
git commit -m "Report: scope and risk register pages"
```

---

### Task 12: Programme page

**Files:**
- Modify (replace stub): `app/report/doc/ProgrammePage.jsx`

- [ ] **Step 1: Implement**

```jsx
// app/report/doc/ProgrammePage.jsx
import { TABLES } from '@/lib/reportStyle'
import { fmtDate, programmeHeadline } from '@/lib/reportShared'
import {
  selectMilestones, overviewSegments, programmeDetailRows, programmeNarrativeLines, targetPct,
  milestoneTickClass, fmtMonthYear, SEGMENT_KEY_LABELS,
} from '@/lib/reportContent'
import { BodyPage, Band, Cols } from './parts'

const short = iso => fmtDate(iso).replace(/ (\d{2})(\d{2})$/, ' $2')

export default function ProgrammePage({ data, ctx, n }) {
  const p = data.programme || {}
  const ms = selectMilestones(p)
  const segs = overviewSegments(p)
  const rows = programmeDetailRows(p)
  const target = targetPct(p, data.answers)
  const total = p.totalWeeks || 0
  const cats = [...new Set(segs.map(s => s.category))]
  const surveys = rows.find(r => r.stage === 'Surveys')
  return (
    <BodyPage ctx={ctx} page={n}>
      <Band no={4} title="High-Level Programme" note={programmeHeadline(p)} />
      <h3 className="r-first">Key milestones</h3>
      <div className="r-ms-list" style={{ '--rows': Math.ceil(ms.length / 2) }}>
        {ms.map(m => (
          <div key={m.id}><b>{m.id}</b><span>{m.label}</span><span className={m.missedTarget ? 'r-late' : ''}>{fmtDate(m.date)} · wk {m.week}</span></div>
        ))}
      </div>

      <div className="r-pbar" role="img" aria-label={`Programme overview: ${segs.map(s => `${s.label} ${s.weeks} weeks`).join(', ')}`}>
        {target != null && <div className="r-target" style={{ left: `${target}%` }}><span>Target {fmtDate(data.answers?.q4_1_targetDate)}</span></div>}
        <div className="r-segs">
          {segs.map((s, i) => (
            <div key={i} className={`r-seg-${s.category}`} style={{ width: `${s.pct}%` }}>
              {s.narrow ? `${s.weeks}w` : <>{s.label}<span>{s.weeks} wks</span></>}
            </div>
          ))}
        </div>
      </div>
      <div className="r-ticks">
        {ms.map((m, i) => (
          <div key={m.id} className={milestoneTickClass(ms, i, total)} style={{ left: `${total ? (m.week / total) * 100 : 0}%` }}>
            <b>{m.id}</b> <span>{fmtMonthYear(m.date)}</span>
          </div>
        ))}
      </div>
      <div className="r-pkey">
        {cats.map(c => <span key={c}><i className={`r-seg-${c}`} />{SEGMENT_KEY_LABELS[c]}</span>)}
        {surveys && <span>Surveys {surveys.weeks} wks alongside design</span>}
        {target != null && <span className="r-late">┆ Client target</span>}
      </div>

      <h3>Programme detail</h3>
      <table className="r-t r-prog">
        <Cols widths={TABLES.programme} />
        <thead><tr><th>Stage</th><th>Activity</th><th>Start</th><th>End</th><th className="r-num">Wks</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.stage}{r.parallel ? ' ∥' : ''}</td><td>{r.activity}</td><td>{short(r.start)}</td><td>{short(r.end)}</td>
              <td className={`r-num ${r.parallel ? 'r-par' : ''}`}>{r.parallel ? `(${r.weeks})` : r.weeks}</td>
            </tr>
          ))}
          <tr className="r-tot"><td>Total</td><td></td><td>{short(p.startDate)}</td><td>{short(p.endDate)}</td><td className="r-num">{total}</td></tr>
        </tbody>
      </table>

      <h3>Programme narrative and assumptions</h3>
      <ul className="r-tight">{programmeNarrativeLines(p).map((l, i) => <li key={i}>{l}</li>)}</ul>
    </BodyPage>
  )
}
```

Port the template's `.pbar`, `.segs`, `.target`, `.ticks` (with the absolute diamond and `.down` second row), `.pkey`, `.ms-list` and `.prog` rules into `report.css` with `r-` prefixes. Add `.r-prog .r-tot td:first-child { color: var(--r-paper); }` so "Total" shows on the navy row.

- [ ] **Step 2: Check in the browser**

Screenshot page 5. Expect six milestones in two columns (M1–M3 left), the one-line bar with inline labels, M5's label on the lower line clear of M6, the red target line at about 69%, 10 detail rows plus the total, and 6 narrative lines, all inside the page.

- [ ] **Step 3: Commit**

```bash
git add app/report/doc/ProgrammePage.jsx app/report/doc/report.css
git commit -m "Report: programme page with milestones, one-line bar and detail table"
```

---

### Task 13: Cost pages and Appendix A

**Files:**
- Modify (replace stub): `app/report/doc/CostPages.jsx`

- [ ] **Step 1: Implement**

```jsx
// app/report/doc/CostPages.jsx
import { TABLES } from '@/lib/reportStyle'
import { UNVERIFIED_MARK } from '@/lib/reportShared'
import {
  cleanReportText, costIntroText, worksRows, worksTableMode, worksGroupRows, lineQty, lineBasisWord,
  projectCostRows, percentageLines, costAssumptionLines, costExclusionLines,
} from '@/lib/reportContent'
import { BodyPage, Band, Cols } from './parts'

function LinesTable({ rows, total, m }) {
  return (
    <table className="r-t">
      <Cols widths={TABLES.works} />
      <thead><tr><th>Code</th><th>Element</th><th className="r-num">Qty</th><th>Basis</th><th className="r-num">Low £</th><th className="r-num">High £</th></tr></thead>
      <tbody>
        {rows.map((r, i) => r.type === 'group'
          ? <tr key={i} className="r-g"><td colSpan={6}>{r.label}</td></tr>
          : <tr key={i}>
              <td className="r-code">{r.item.code}</td>
              <td>{r.item.description}{r.item.aiEstimate ? ` ${UNVERIFIED_MARK}` : ''}</td>
              <td className="r-num">{lineQty(r.item)}</td>
              <td className="r-rate">{lineBasisWord(r.item)}</td>
              <td className="r-num">{m(r.item.lineLow, true)}</td>
              <td className="r-num">{m(r.item.lineHigh, true)}</td>
            </tr>)}
        {total && <tr className="r-tot"><td></td><td>Works cost total</td><td></td><td></td><td className="r-num">{m(total.low, true)}</td><td className="r-num">{m(total.high, true)}</td></tr>}
      </tbody>
    </table>
  )
}

export function CostWorksPage({ data, ctx, n }) {
  const { cost, aiProse } = data
  const m = ctx.money
  const mode = worksTableMode(cost)
  const unverified = (cost?.lineItems || []).some(l => l.aiEstimate)
  return (
    <BodyPage ctx={ctx} page={n}>
      <Band no={5} title="Order of Cost Estimate" note="1 of 2 · Works cost" />
      <p className="r-lead">{aiProse?.costNarrative ? cleanReportText(aiProse.costNarrative) : costIntroText(cost)}</p>
      {mode === 'lines'
        ? <LinesTable rows={worksRows(cost)} total={cost?.works} m={m} />
        : <table className="r-t">
            <Cols widths={TABLES.worksGroups} />
            <thead><tr><th>Element group</th><th className="r-num">Items</th><th className="r-num">Low £</th><th className="r-num">High £</th></tr></thead>
            <tbody>
              {worksGroupRows(cost).map(g => <tr key={g.label}><td>{g.label}</td><td className="r-num">{g.count}</td><td className="r-num">{m(g.low, true)}</td><td className="r-num">{m(g.high, true)}</td></tr>)}
              <tr className="r-tot"><td>Works cost total</td><td></td><td className="r-num">{m(cost.works.low, true)}</td><td className="r-num">{m(cost.works.high, true)}</td></tr>
            </tbody>
          </table>}
      <p className="r-foot-note">
        {mode === 'groups' ? 'Full line-by-line breakdown in Appendix A. ' : ''}
        {unverified ? `${UNVERIFIED_MARK} Rate marked for verification in the rates workbook. ` : ''}
        Low and high reflect the estimate range; see the next page.
      </p>
    </BodyPage>
  )
}

const ROW_CLASS = { row: '', subtotal: 'r-sub', total: 'r-tot', ref: 'r-refrow' }

export function CostSummaryPage({ data, ctx, n }) {
  const { cost, answers } = data
  const m = ctx.money
  const pl = percentageLines(cost)
  return (
    <BodyPage ctx={ctx} page={n}>
      <Band no={5} title="Order of Cost Estimate" note="2 of 2 · Project cost" />
      <table className="r-t">
        <Cols widths={TABLES.projectCost} />
        <thead><tr><th>Item</th><th>Rate</th><th className="r-num">Low £</th><th className="r-num">High £</th></tr></thead>
        <tbody>
          {projectCostRows(cost).map((r, i) => (
            <tr key={i} className={ROW_CLASS[r.kind]}><td>{r.label}</td><td className="r-rate">{r.rate}</td><td className="r-num">{m(r.low, true)}</td><td className="r-num">{m(r.high, true)}</td></tr>
          ))}
        </tbody>
      </table>
      {pl.length > 0 && <>
        <h3>How the percentages were set</h3>
        <ul className="r-tight">{pl.map(l => <li key={l.name}><b>{l.name} {l.pct}:</b> {l.text}.</li>)}</ul>
      </>}
      <div className="r-two">
        <div><h3>Cost assumptions</h3><ul className="r-tight">{costAssumptionLines(cost).map((l, i) => <li key={i}>{l}</li>)}</ul></div>
        <div><h3>Cost exclusions</h3><ul className="r-tight">{costExclusionLines(cost, answers).map((l, i) => <li key={i}>{l}</li>)}</ul></div>
      </div>
    </BodyPage>
  )
}

export function AppendixPage({ data, ctx, n, page }) {
  const last = page.part === page.parts
  return (
    <BodyPage ctx={ctx} page={n}>
      <Band no="A" title="Appendix A · Works cost, line by line" note={`Part ${page.part} of ${page.parts}`} />
      <LinesTable rows={page.rows} total={last ? data.cost?.works : null} m={ctx.money} />
    </BodyPage>
  )
}
```

`Band` pads the number with `padStart(2, '0')`, so `"A"` shows as `0A`. Change `Band` to `{typeof no === 'number' ? String(no).padStart(2, '0') : no}`.

- [ ] **Step 2: Check in the browser**

Screenshot pages 6–7 of `/sample` and compare with the template. Then open `/report-fixture/long-scope` (Task 15 creates the route; if it doesn't exist yet, do this check in Task 15). Expect the group table on page 6 and Appendix A after the last page.

- [ ] **Step 3: Commit**

```bash
git add app/report/doc/CostPages.jsx app/report/doc/parts.jsx app/report/doc/report.css
git commit -m "Report: works cost page, project cost page and Appendix A"
```

---

### Task 14: Late sections, last page and the guard test

**Files:**
- Modify (replace stubs): `app/report/doc/LatePages.jsx`, `app/report/doc/LastPage.jsx`
- Create: `lib/__tests__/reportStyleGuard.test.js`

- [ ] **Step 1: Late sections**

```jsx
// app/report/doc/LatePages.jsx
import { TABLES } from '@/lib/reportStyle'
import { cleanReportText } from '@/lib/reportContent'
import { BodyPage, Band, Cols, Pending } from './parts'

function Roi({ data, ctx, no }) {
  const roi = ctx.roi
  const m = ctx.money
  const benefit = Array.isArray(data.answers?.q5_1_financialBenefit) ? data.answers.q5_1_financialBenefit.join(', ') : (data.answers?.q5_1_financialBenefit || '—')
  return <>
    <Band no={no} title="Financial Case" />
    <div className="r-figs4">
      <div><div className="r-lbl">Project cost (mid)</div><div className="v">{m(roi?.mid)}</div></div>
      <div><div className="r-lbl">Annual benefit</div><div className="v">{m(roi?.annual)}</div></div>
      <div><div className="r-lbl">Simple payback</div><div className="v">{roi?.paybackYears} years</div></div>
      <div><div className="r-lbl">Benefit type</div><div className="v r-v-small">{benefit}</div></div>
    </div>
    {data.aiProse?.roiNarrative ? <p>{cleanReportText(data.aiProse.roiNarrative)}</p> : ctx.isPending && <Pending />}
  </>
}

function Procurement({ data, ctx, no }) {
  const a = data.aiProse || {}, p = data.programme || {}
  return <>
    <Band no={no} title="Procurement Recommendation" />
    <table className="r-kv"><tbody>
      <tr><td>Route</td><td>{a.procurementRoute || p.procurementRoute}</td></tr>
      <tr><td>Contract</td><td>{a.procurementContractForm || p.contractForm}</td></tr>
      <tr><td>Tender type · design</td><td>{a.procurementTenderType || p.tenderType} · {(a.procurementDesignResp || p.designResponsibility || '').toLowerCase()}</td></tr>
    </tbody></table>
    {a.procurementNarrative ? <p>{cleanReportText(a.procurementNarrative)}</p> : ctx.isPending && <Pending />}
    {a.procurementConsiderations?.length > 0 && <>
      <h3>Commercial considerations</h3>
      <ul className="r-tight">{a.procurementConsiderations.map((c, i) => <li key={i}>{cleanReportText(c)}</li>)}</ul>
    </>}
    {a.procurementConflicts?.length > 0 && <ul className="r-tight r-conflicts">{a.procurementConflicts.map((c, i) => <li key={i}>{cleanReportText(c)}</li>)}</ul>}
  </>
}

function Constraints({ data, ctx, no }) {
  const list = data.aiProse?.constraints || []
  return <>
    <Band no={no} title="Constraints Summary" />
    {list.length === 0 ? (ctx.isPending ? <Pending /> : null) : (
      <table className="r-t">
        <Cols widths={TABLES.constraints} />
        <thead><tr><th>Category</th><th>Constraint</th><th>Impact</th></tr></thead>
        <tbody>{list.map((c, i) => <tr key={i}><td>{c.category}</td><td><b>{cleanReportText(c.title)}</b></td><td>{cleanReportText(c.text)}</td></tr>)}</tbody>
      </table>
    )}
  </>
}

const SECTIONS = { roi: Roi, procurement: Procurement, constraints: Constraints }

export default function LatePage({ data, ctx, n, page }) {
  return (
    <BodyPage ctx={ctx} page={n}>
      {page.slots.map(s => {
        const Section = SECTIONS[s.key]
        return <section key={s.key} className={`r-slot r-slot-${s.slot}`}><Section data={data} ctx={ctx} no={s.no} /></section>
      })}
    </BodyPage>
  )
}
```

- [ ] **Step 2: Last page**

```jsx
// app/report/doc/LastPage.jsx
import { BRAND } from '@/lib/reportStyle'
import { cleanReportText, DISCLAIMER, dataSourcesSentence } from '@/lib/reportContent'
import { BodyPage, Band, Pending } from './parts'

export default function LastPage({ data, ctx, n, page }) {
  const { aiProse, cost, programme } = data
  return (
    <BodyPage ctx={ctx} page={n} className="r-lastp">
      <Band no={page.no} title="Recommendations and Next Steps" />
      {aiProse?.nextSteps?.length
        ? <ol>{aiProse.nextSteps.map((s, i) => <li key={i}>{cleanReportText(s)}</li>)}</ol>
        : ctx.isPending ? <Pending /> : <p>Commission outstanding surveys and appoint a design team to proceed to RIBA Stage 2.</p>}
      <div className="r-disc">
        <b>Disclaimer</b>{DISCLAIMER} {dataSourcesSentence(cost, programme)}{' '}
        Use of this tool is subject to our <a href="/terms">Terms of Use</a> and <a href="/privacy">Privacy Notice</a>.
      </div>
      <div className="r-contact">
        <div className="r-c-brand"><span className="r-mark">{BRAND.mark}</span><div><b>{BRAND.name}</b><small>{BRAND.strapline}</small></div></div>
        <div className="r-c-body">
          <h3>Further information</h3>
          <p>For questions about this report, or to take the project on to a full cost plan and Stage 2 brief, contact our team and quote reference <b className="r-mono">{ctx.reference}</b>.</p>
          <table className="r-kv r-c-kv"><tbody>
            <tr><td>Email</td><td>{BRAND.email}</td></tr>
            <tr><td>Telephone</td><td>{BRAND.phone}</td></tr>
            <tr><td>Web</td><td>{BRAND.web}</td></tr>
          </tbody></table>
        </div>
      </div>
    </BodyPage>
  )
}
```

- [ ] **Step 3: Write the guard test**

```js
// lib/__tests__/reportStyleGuard.test.js
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const walk = dir => fs.existsSync(path.join(ROOT, dir))
  ? fs.readdirSync(path.join(ROOT, dir)).flatMap(f => {
      const rel = path.join(dir, f)
      return fs.statSync(path.join(ROOT, rel)).isDirectory() ? walk(rel) : [rel]
    })
  : []

const RENDERER_FILES = [...walk('app/report/doc'), ...walk('lib/docx'), 'lib/reportBuilder.js']
  .filter(f => /\.(jsx?|css)$/.test(f) && fs.existsSync(path.join(ROOT, f)))

const RULES = [
  ['a hex colour literal', /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/],
  ['a CSS font-size literal', /font-size\s*:\s*\d/],
  ['a JSX fontSize literal', /fontSize\s*:\s*['"]?\d/],
  ['a banned font name', /\b(Arial|Helvetica|Calibri|Playfair|DM Sans)\b/],
]

describe('report renderers take their look only from lib/reportStyle.js', () => {
  it('finds the renderer files', () => {
    expect(RENDERER_FILES.length).toBeGreaterThan(5)
  })
  for (const file of RENDERER_FILES) {
    it(`${file} has no literal colour, size or font`, () => {
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8')
      for (const [what, re] of RULES) {
        const m = src.match(re)
        expect(m, `${file} contains ${what}: "${m?.[0]}" — use lib/reportStyle.js`).toBeNull()
      }
      if (/^lib\/(docx\/pages|reportBuilder)/.test(file.replace(/\\/g, '/'))) {
        expect(src.includes('new TextRun('), `${file} builds a TextRun directly — use t() from lib/docx/primitives.js`).toBe(false)
      }
    })
  }
})
```

- [ ] **Step 4: Run the guard and the build**

Run: `npx vitest run lib/__tests__/reportStyleGuard.test.js`
Expected: PASS for `app/report/doc/*`. (`lib/reportBuilder.js` still holds the old hex constants and **will fail**. That is expected until Task 17; mark it with `it.fails` only for `lib/reportBuilder.js` in this commit, and remove that in Task 19.)

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/report/doc lib/__tests__/reportStyleGuard.test.js
git commit -m "Report: half-page late sections, last page with contact block, style guard test"
```

---

### Task 15: PDF route, download behaviour, fixture route and fit check

**Files:**
- Modify: `app/api/report-pdf/[id]/route.js`, `app/report/ReportRenderer.jsx` (`downloadPdf`)
- Create: `app/report-fixture/[name]/page.jsx`, `scripts/check-report-fit.mjs`

- [ ] **Step 1: PDF route: pages carry their own margins, header and footer**

In `app/api/report-pdf/[id]/route.js`: delete `FOOTER_TEMPLATE`; change the selector wait and the `pdf()` call to:

```js
    await page.setViewport({ width: 900, height: 1200 })
    await page.goto(`${origin}/report/${id}?pdf=1`, { waitUntil: 'networkidle0', timeout: 45000 })
    await page.waitForSelector('.r-cover', { timeout: 20000 })
    await page.evaluate(() => document.fonts.ready)

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    })
```

Update the file's header comment: page numbers are now rendered by the page components ("Page N of M"), not Puppeteer.

- [ ] **Step 2: No silent fallback to browser print**

In `ReportRenderer.jsx` `downloadPdf`, replace the `catch` block body `window.print()` with:

```js
      setDownloadError('The PDF could not be created. Please try again in a moment.')
```

Keep `if (!reportId) { window.print(); return }` (local runs without KV have no id; the print CSS produces the same A4 pages).

- [ ] **Step 3: Dev-only fixture route**

Read `app/sample/page.jsx` and mirror its structure exactly (including any `Suspense` wrapper around `ReportRenderer`), changing only where the data comes from:

```jsx
// app/report-fixture/[name]/page.jsx
import { notFound } from 'next/navigation'
import sample from '@/public/sample/report.json'
import { worstCaseReport, longScopeReport } from '@/lib/reportFixtures'
// …same imports as app/sample/page.jsx…

const FIXTURES = { sample: s => s, worst: worstCaseReport, 'long-scope': longScopeReport }

export default async function FixturePage({ params }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const { name } = await params
  const make = FIXTURES[name]
  if (!make) notFound()
  const data = make(sample)
  // …render exactly as app/sample/page.jsx renders the sample, passing `data`…
}
```

- [ ] **Step 4: Fit check script**

```js
// scripts/check-report-fit.mjs
/**
 * Proves every report page fits its A4 sheet. Run against a gate-open dev
 * server (node scripts/dev-open.mjs):
 *   node scripts/check-report-fit.mjs [origin] [--pdf outDir]
 * Checks /report-fixture/{sample,worst,long-scope}: content above the running
 * footer, half-page slots not overflowing, Scope of Works on page 3, Next
 * Steps last before any appendix. With --pdf, also writes each fixture as a PDF.
 */
import puppeteer from 'puppeteer'
import fs from 'node:fs'
import path from 'node:path'

const origin = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:3000'
const pdfIdx = process.argv.indexOf('--pdf')
const outDir = pdfIdx > 0 ? process.argv[pdfIdx + 1] : null
const FIXTURES = ['sample', 'worst', 'long-scope']

const browser = await puppeteer.launch({ headless: true })
let failures = 0
try {
  for (const name of FIXTURES) {
    const page = await browser.newPage()
    await page.setViewport({ width: 900, height: 1200 })
    await page.goto(`${origin}/report-fixture/${name}?pdf=1`, { waitUntil: 'networkidle0', timeout: 60000 })
    await page.waitForSelector('.r-cover', { timeout: 30000 })
    await page.evaluate(() => document.fonts.ready)
    const result = await page.evaluate(() => {
      const problems = []
      const pages = [...document.querySelectorAll('.r-page')]
      pages.forEach((pg, i) => {
        const body = pg.querySelector('.r-body')
        const footer = pg.querySelector('.r-rf')
        if (body && footer) {
          const lastBottom = Math.max(...[...body.querySelectorAll('*')].map(el => el.getBoundingClientRect().bottom))
          const room = footer.getBoundingClientRect().top - lastBottom
          if (room < 2) problems.push(`page ${i + 1}: content runs ${Math.round(-room)}px into the footer`)
        }
        pg.querySelectorAll('.r-slot-top').forEach(s => {
          if (s.scrollHeight > s.clientHeight + 1) problems.push(`page ${i + 1}: top half-page slot overflows by ${s.scrollHeight - s.clientHeight}px`)
        })
      })
      const title = i => pages[i]?.querySelector('.r-band h2')?.textContent || ''
      if (title(2) !== 'Scope of Works') problems.push(`page 3 is "${title(2)}", expected Scope of Works`)
      const lastIdx = pages.findIndex(pg => pg.querySelector('.r-band h2')?.textContent === 'Recommendations and Next Steps')
      if (lastIdx < 0 || pages.slice(lastIdx + 1).some(pg => !/Appendix A/.test(pg.querySelector('.r-band h2')?.textContent || ''))) problems.push('Next Steps is not the last page before the appendix')
      return { count: pages.length, problems }
    })
    console.log(`${name}: ${result.count} pages${result.problems.length ? '' : ' — all fit'}`)
    for (const p of result.problems) { console.log(`  ✗ ${p}`); failures++ }
    if (outDir) {
      fs.mkdirSync(outDir, { recursive: true })
      await page.pdf({ path: path.join(outDir, `report-${name}.pdf`), format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } })
    }
    await page.close()
  }
} finally {
  await browser.close()
}
process.exit(failures ? 1 : 0)
```

- [ ] **Step 5: Run it**

Start the gate-open dev server (preview `estates-ai-tool-open`), then:

Run: `node scripts/check-report-fit.mjs`
Expected: `sample: 10 pages — all fit`, `worst: … — all fit`, `long-scope: … — all fit`, exit 0.

When a page overflows, tighten the content rule, not the page. For example, lower `LIMITS.worksRowsPerPage`, lower `LIMITS.scopeItemsPerGroup`, or raise an `EST` constant so a section moves to a full page. Then re-run. Record each constant you changed in the commit message.

- [ ] **Step 6: Commit**

```bash
git add app/api/report-pdf app/report/ReportRenderer.jsx app/report-fixture scripts/check-report-fit.mjs lib/reportStyle.js lib/reportContent.js
git commit -m "PDF: self-contained A4 pages, no silent print fallback; fit check over three fixtures"
```

---

### Task 16: EXAMPLE GATE 1: PDF and screen, for the user's approval

**This task stops for the user. Do not start Milestone C until they approve.**

- [ ] **Step 1: Export the example PDFs**

Run (dev server running): `node scripts/check-report-fit.mjs http://localhost:3000 --pdf <scratchpad>/report-examples`
Expected: exit 0, and `report-sample.pdf`, `report-worst.pdf`, `report-long-scope.pdf` written.

- [ ] **Step 2: Inspect every page yourself first**

Screenshot every page of each fixture (Puppeteer: open `/report-fixture/<name>?pdf=1`, then `for (const [i, el] of (await page.$('.r-page')).entries()) await el.screenshot({ path: `page-${i + 1}.png` })`) and look at every page. Check for clipped columns, words broken mid-word, a section on the wrong page, and overlapping labels. Fix, re-run the fit check and re-export.

- [ ] **Step 3: Send them to the user**

Send `report-sample.pdf` (and the long-scope PDF, so they can see Appendix A) with SendUserFile. Ask:
1. Does this match the approved template?
2. May I push the branch so Vercel builds a preview? That gives a link to check the on-screen report on your phone and to generate one real report end to end.

**Wait.** Push only on an explicit yes. On the preview, generate one real report, download its PDF, and send that too.

- [ ] **Step 4: Apply any requested changes, then re-run Steps 1–3**

---

## Milestone C: Word (.docx), identical to the PDF

### Task 17: Fonts, primitives and building the Word file on download

**Files:**
- Create: `assets/fonts/IBMPlexSans-Regular.ttf`, `assets/fonts/IBMPlexSans-SemiBold.ttf`, `assets/fonts/IBMPlexMono-Regular.ttf`, `assets/fonts/OFL.txt`, `lib/docx/fonts.js`, `lib/docx/primitives.js`, `app/api/reports/[id]/docx/route.js`
- Modify: `next.config.ts`, `app/api/reports/[id]/prose/route.js`, `app/report/ReportRenderer.jsx` (`downloadDocx`)

- [ ] **Step 1: Fetch the font files (SIL Open Font License, free to embed)**

```bash
mkdir -p assets/fonts && cd "$(mktemp -d)" && npm pack @ibm/plex-sans @ibm/plex-mono && for f in *.tgz; do tar -xzf "$f"; done && find . -name "IBMPlexSans-Regular.ttf" -o -name "IBMPlexSans-SemiBold.ttf" -o -name "IBMPlexMono-Regular.ttf" -o -name "LICENSE.txt" -o -name "OFL.txt"
```

Copy the three TTFs from the listed paths into `assets/fonts/`, and the licence file as `assets/fonts/OFL.txt`. If the packages ship no TTF directory, take the TTFs from the IBM Plex GitHub release zip instead, and ask the user before downloading it.

- [ ] **Step 2: Font loader**

```js
// lib/docx/fonts.js
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { FONTS } from '../reportStyle.js'

// The TTFs are traced into the serverless bundle by next.config.ts outputFileTracingIncludes.
const DIR = path.join(process.cwd(), 'assets', 'fonts')
const FILES = [
  [FONTS.word.regular, 'IBMPlexSans-Regular.ttf'],
  [FONTS.word.semibold, 'IBMPlexSans-SemiBold.ttf'],
  [FONTS.word.mono, 'IBMPlexMono-Regular.ttf'],
]

let cache = null
export async function embeddedFonts() {
  if (!cache) cache = Promise.all(FILES.map(async ([name, file]) => ({ name, data: await readFile(path.join(DIR, file)) })))
  return cache
}
```

- [ ] **Step 3: Token-driven primitives**

```js
// lib/docx/primitives.js
import {
  Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, AlignmentType, VerticalAlign,
  HeightRule, LevelFormat,
} from 'docx'
import { COLOURS, FONTS, TYPE, PAGE, hex, hp, pxToDxa, widthsToDxa } from '../reportStyle.js'

export const PAGE_DXA = { width: 11906, height: 16838 }
export const MARGIN_X = pxToDxa(PAGE.marginXPx)
export const CONTENT_DXA = PAGE_DXA.width - 2 * MARGIN_X

const clean = s => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

/** The only TextRun constructor in the Word renderer. */
export function t(text, { size = TYPE.body, color = COLOURS.ink, semi = false, mono = false, italic = false } = {}) {
  return new TextRun({
    text: clean(text),
    font: mono ? FONTS.word.mono : semi ? FONTS.word.semibold : FONTS.word.regular,
    size: hp(size), color: hex(color), italics: italic,
  })
}

export function p(children, { before = 0, after = 120, align = AlignmentType.LEFT, keepNext = false, pageBreakBefore = false, bullet = false, numbered = false } = {}) {
  return new Paragraph({
    children: Array.isArray(children) ? children : [children],
    spacing: { before, after, line: 300 },
    alignment: align, keepNext, pageBreakBefore,
    ...(bullet ? { numbering: { reference: 'r-bullets', level: 0 } } : {}),
    ...(numbered ? { numbering: { reference: 'r-numbers', level: 0 } } : {}),
  })
}

export const NUMBERING = {
  config: [
    { reference: 'r-bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
      style: { run: { color: hex(COLOURS.amberText) }, paragraph: { indent: { left: 360, hanging: 240 } } } }] },
    { reference: 'r-numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
      style: { run: { color: hex(COLOURS.amberText), font: FONTS.word.semibold }, paragraph: { indent: { left: 360, hanging: 300 } } } }] },
  ],
}

const NONE = { style: BorderStyle.NONE, size: 0, color: hex(COLOURS.paper) }
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE }
export const rule = (colour, size = 4) => ({ style: BorderStyle.SINGLE, size, color: hex(colour) })

export function cell(children, { width, fill, borders = {}, align = AlignmentType.LEFT, span, vAlign = VerticalAlign.TOP, margins } = {}) {
  return new TableCell({
    children: (Array.isArray(children) ? children : [children]).map(c => (c instanceof Paragraph || c instanceof Table ? c : p(c, { after: 0, align }))),
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill: hex(fill) } : undefined,
    borders: { ...NO_BORDERS, ...borders },
    columnSpan: span, verticalAlign: vAlign,
    margins: margins || { top: 70, bottom: 70, left: 110, right: 110 },
  })
}

/** Section band: navy number block, title, optional note; tinted with an amber underline. */
export function band(no, title, note) {
  const label = typeof no === 'number' ? String(no).padStart(2, '0') : String(no)
  const under = { bottom: rule(COLOURS.amberRule, 12) }
  return new Table({
    width: { size: CONTENT_DXA, type: WidthType.DXA },
    columnWidths: [700, CONTENT_DXA - 700 - 2600, 2600],
    rows: [new TableRow({ children: [
      cell(p(t(label, { mono: true, semi: true, color: COLOURS.paper, size: TYPE.table }), { after: 0, align: AlignmentType.CENTER }), { width: 700, fill: COLOURS.navy, borders: under, vAlign: VerticalAlign.CENTER }),
      cell(p(t(title, { semi: true, color: COLOURS.navy, size: TYPE.sectionTitle }), { after: 0 }), { width: CONTENT_DXA - 3300, fill: COLOURS.tintBand, borders: under, vAlign: VerticalAlign.CENTER, margins: { top: 140, bottom: 140, left: 200, right: 110 } }),
      cell(p(t(note || '', { size: TYPE.small, color: COLOURS.greyMute }), { after: 0, align: AlignmentType.RIGHT }), { width: 2600, fill: COLOURS.tintBand, borders: under, vAlign: VerticalAlign.CENTER }),
    ] })],
  })
}

/** Standard report table. rows: [{ cells: [string|Paragraph], kind: 'row'|'group'|'subtotal'|'total'|'ref'|'high'|'med' }] */
export function table({ widths, head, rows, numeric = [] }) {
  const w = widthsToDxa(widths, CONTENT_DXA)
  const align = i => (numeric.includes(i) ? AlignmentType.RIGHT : AlignmentType.LEFT)
  const headRow = new TableRow({ tableHeader: true, children: head.map((h, i) =>
    cell(p(t(h, { semi: true, color: COLOURS.navy, size: TYPE.table }), { after: 0, align: align(i) }), { width: w[i], fill: COLOURS.tintHead, borders: { bottom: rule(COLOURS.navy, 8) } })) })
  const body = rows.map(r => {
    if (r.kind === 'group') {
      return new TableRow({ cantSplit: true, children: [cell(p(t(r.cells[0], { semi: true, color: COLOURS.navy, size: TYPE.small }), { after: 0 }), { width: CONTENT_DXA, span: head.length, fill: COLOURS.tintGroup, borders: { left: rule(COLOURS.amberRule, 18) } })] })
    }
    const total = r.kind === 'total'
    const fill = total ? COLOURS.navy : r.kind === 'high' ? COLOURS.tintHigh : undefined
    const colour = total ? COLOURS.paper : r.kind === 'ref' ? COLOURS.grey : COLOURS.ink
    const strong = total || r.kind === 'subtotal'
    return new TableRow({ cantSplit: true, children: r.cells.map((c, i) => cell(
      c instanceof Paragraph ? c : p(t(c, { size: TYPE.table, color: colour, semi: strong, italic: r.kind === 'ref' }), { after: 0, align: align(i) }),
      { width: w[i], fill, borders: { bottom: rule(COLOURS.rule), ...(r.kind === 'subtotal' ? { top: rule(COLOURS.navy, 6) } : {}), ...(i === 0 && (r.kind === 'high' || r.kind === 'med') ? { left: rule(r.kind === 'high' ? COLOURS.ragHigh : COLOURS.ragMed, 30) } : {}) } },
    )) })
  })
  return new Table({ width: { size: CONTENT_DXA, type: WidthType.DXA }, columnWidths: w, rows: [headRow, ...body] })
}

/** Rating pill as a shaded single-cell table. */
export function pill(rating) {
  const fill = rating === 'High' ? COLOURS.ragHigh : rating === 'Low' ? COLOURS.ragLow : COLOURS.ragMed
  return new Table({ width: { size: 1000, type: WidthType.DXA }, columnWidths: [1000], rows: [new TableRow({ children: [
    cell(p(t(String(rating).toUpperCase(), { semi: true, color: COLOURS.paper, size: TYPE.small }), { after: 0, align: AlignmentType.CENTER }), { width: 1000, fill, margins: { top: 40, bottom: 40, left: 40, right: 40 } }),
  ] })] })
}

export const exactRow = (height, children) => new TableRow({ height: { value: height, rule: HeightRule.EXACT }, children })
```

- [ ] **Step 4: Trace the fonts into the bundle**

Read `node_modules/next/dist/docs/` for `outputFileTracingIncludes` (`grep -rl outputFileTracingIncludes node_modules/next/dist/docs`). Then add to `nextConfig` in `next.config.ts`:

```ts
  // lib/docx/fonts.js reads the IBM Plex TTFs at runtime to embed them in the .docx.
  outputFileTracingIncludes: {
    '/api/reports/[id]/docx': ['./assets/fonts/**/*'],
    '/api/generate-report': ['./assets/fonts/**/*'],
  },
```

- [ ] **Step 5: Build the Word file on download, stop storing it**

Create the route:

```js
// app/api/reports/[id]/docx/route.js
/**
 * GET /api/reports/[id]/docx — builds the Word report on download from the KV
 * record, so every report (old ones included) gets the current design and the
 * KV record stays small (embedded fonts add ~0.5–1 MB). Protected by proxy.ts
 * (/api/reports/:path*).
 */
import { getReport } from '@/lib/kv'
import { buildReport } from '@/lib/reportBuilder'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request, { params }) {
  const { id } = await params
  if (!id || !/^[0-9a-f]{16}$/.test(id)) return Response.json({ error: 'Invalid report ID.' }, { status: 400 })
  const data = await getReport(id)
  if (!data) return Response.json({ error: 'Report not found or expired. Reports are retained for 90 days.' }, { status: 404 })
  if (data.status && data.status !== 'complete') return Response.json({ error: 'This report is still being generated. Try again in a few seconds.' }, { status: 409 })
  try {
    const buf = await buildReport({ ...data, reportId: id })
    const safeName = String(data.projectName || 'Report').replace(/[^a-z0-9 _-]/gi, '_')
    return new Response(buf, { status: 200, headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${safeName}_Stage1_Report.docx"`,
      'Cache-Control': 'no-store',
    } })
  } catch (err) {
    console.error('[report-docx] build failed:', err)
    return Response.json({ error: 'The Word file could not be created.' }, { status: 500 })
  }
}
```

In `app/api/reports/[id]/prose/route.js`, delete the `buildReport` import, the `docxBuffer`/`templateError` build block and the `...(docxBuffer && { docx: … })` field in the finalised record. Keep the no-KV path in `app/api/generate-report/route.js` building the `.docx` inline, since it has no id to download from later.

In `ReportRenderer.jsx`, change `downloadDocx` so that with a `reportId` it fetches `/api/reports/${reportId}/docx` and saves the blob (same pattern as `downloadPdf`, showing `setDownloadError('The Word file could not be created. Please try again in a moment.')` on failure). Without an id, it keeps the existing `data.docx` path.

- [ ] **Step 6: Commit**

```bash
git add assets/fonts lib/docx/fonts.js lib/docx/primitives.js next.config.ts app/api/reports/[id]/docx app/api/reports/[id]/prose/route.js app/report/ReportRenderer.jsx
git commit -m "Word: embedded IBM Plex, token-driven primitives, built on download instead of stored"
```

---

### Task 18: Word pages, one builder per page kind

**Files:**
- Create: `lib/docx/pages.js`
- Rewrite: `lib/reportBuilder.js`

**Interfaces:**
- Consumes: everything in `lib/reportContent.js`, `lib/docx/primitives.js`, `embeddedFonts()`.
- Produces: `buildReport({ answers, cost, programme, aiProse, budget, confidence, generatedAt, reportId, sample }) → Promise<Buffer>` (same name and first five keys as before, so `generate-report` and the tests keep working).

- [ ] **Step 1: Page builders**

```js
// lib/docx/pages.js
/**
 * One builder per page kind, mirroring app/report/doc/*. Content comes only
 * from lib/reportContent.js; look only from lib/reportStyle.js (via primitives).
 * Each returns an array of block children (Paragraph | Table).
 */
import { Table, TableRow, WidthType, AlignmentType, VerticalAlign } from 'docx'
import { BRAND, COLOURS, COVER_TYPE, TYPE, TABLES, LIMITS, PAGE, pxToDxa, widthsToDxa } from '../reportStyle.js'
import { fmtDate, programmeHeadline, UNVERIFIED_MARK } from '../reportShared.js'
import {
  coverTitle, coverSubtitle, coverCostRange, confidenceWord, deriveCostRiskLevel, cleanReportText, vatPct,
  scopeStatement, scopeGroups, notInScopeLines, notPricedLines, prepareRisks,
  selectMilestones, overviewSegments, programmeDetailRows, programmeNarrativeLines,
  costIntroText, worksRows, worksTableMode, worksGroupRows, lineQty, lineBasisWord, projectCostRows,
  percentageLines, costAssumptionLines, costExclusionLines, DISCLAIMER, dataSourcesSentence,
} from '../reportContent.js'
import { t, p, cell, band, table, pill, exactRow, rule, CONTENT_DXA, PAGE_DXA } from './primitives.js'

const h3 = text => p(t(text, { semi: true, color: COLOURS.navy, size: TYPE.subHeading }), { before: 240, after: 100, keepNext: true })
const bullets = lines => lines.map(l => p(t(l), { bullet: true, after: 60 }))
const numbered = lines => lines.map(l => p(t(l), { numbered: true, after: 80 }))
const pageStart = () => p(t(''), { pageBreakBefore: true, after: 0 })
const SEG_FILL = { design: COLOURS.segDesign, governance: COLOURS.segGovernance, tender: COLOURS.segTender, construction: COLOURS.segConstruction, handover: COLOURS.segHandover, float: COLOURS.segFloatA }

export function coverPage(data, ctx) {
  const { answers, cost, programme, confidence, aiProse } = data
  const grade = confidence?.score || aiProse?.confidenceScore || 'B'
  const label = confidence?.label || aiProse?.confidenceLabel || 'Moderate Confidence'
  const X = pxToDxa(PAGE.marginXPx)
  const W = PAGE_DXA.width
  const top = exactRow(pxToDxa(PAGE.coverTopPx), [cell([
    p([t(`${BRAND.mark}  `, { semi: true, color: COLOURS.amberOnDark, size: COVER_TYPE.brand }), t(BRAND.name, { semi: true, color: COLOURS.paper, size: COVER_TYPE.brand })], { before: 500, after: 60 }),
    p(t(BRAND.tagline, { color: COLOURS.onNavyMute, size: COVER_TYPE.tagline }), { after: 1400 }),
    p(t('RIBA STAGE 0–1', { semi: true, color: COLOURS.amberOnDark, size: COVER_TYPE.eyebrow }), { after: 40 }),
    p(t('FEASIBILITY REPORT', { color: COLOURS.onNavy, size: COVER_TYPE.eyebrow }), { after: 240 }),
    p(t(coverTitle(answers), { semi: true, color: COLOURS.paper, size: coverTitle(answers).length <= LIMITS.titleChars.full ? COVER_TYPE.title : COVER_TYPE.titleLong }), { after: 240 }),
    p(t(coverSubtitle(answers, cost), { color: COLOURS.onNavy, size: COVER_TYPE.subtitle }), { after: 0 }),
  ], { width: W, fill: COLOURS.navyMid, margins: { top: 0, bottom: 0, left: X, right: X } })])
  const fig = (lbl, v, s) => [p(t(lbl.toUpperCase(), { size: COVER_TYPE.label, color: COLOURS.label }), { after: 60 }), p(t(v, { semi: true, size: COVER_TYPE.figure, color: COLOURS.navyText }), { after: 40 }), p(t(s, { size: COVER_TYPE.figureNote, color: COLOURS.greyMute }), { after: 0 })]
  const figs = new Table({ width: { size: W - 2 * X, type: WidthType.DXA }, columnWidths: widthsToDxa([0.42, 0.29, 0.29], W - 2 * X), rows: [new TableRow({ children: [
    cell(fig('Total project cost', coverCostRange(cost), 'excl. VAT'), { borders: { top: rule(COLOURS.navy, 18) } }),
    cell(fig('Programme', `${programme?.totalWeeks ?? '—'} weeks`, programme?.floatWeeks > 0 ? `incl. ${programme.floatWeeks} weeks float` : 'critical path'), { borders: { top: rule(COLOURS.navy, 18) } }),
    cell(fig('Confidence', `Grade ${grade}`, `${confidenceWord(label)} · cost risk ${deriveCostRiskLevel(cost, aiProse).toLowerCase()}`), { borders: { top: rule(COLOURS.navy, 18) } }),
  ] })] })
  const facts = rows => new Table({ width: { size: (W - 2 * X - 500) / 2, type: WidthType.DXA }, rows: rows.map(([k, v]) => new TableRow({ children: [
    cell(p(t(k, { size: COVER_TYPE.facts, color: COLOURS.greyMute }), { after: 0 }), { borders: { bottom: rule(COLOURS.rule) } }),
    cell(p(t(v, { size: COVER_TYPE.facts, color: COLOURS.navyText, mono: k === 'Reference' }), { after: 0 }), { borders: { bottom: rule(COLOURS.rule) } }),
  ] })) })
  const factsLeft = [['Project type', cost?.projectType || answers?.q1_2_projectType], ...(cost?.interventionLevel ? [['Intervention', cost.interventionLevel]] : []), ['Specification', cost?.specLevel]]
  const factsRight = [['Report date', ctx.dateLong], ['Reference', ctx.reference], ['Status', 'Indicative']]
  const body = exactRow(pxToDxa(560), [cell([
    figs,
    p(t(''), { after: 500 }),
    new Table({ width: { size: W - 2 * X, type: WidthType.DXA }, columnWidths: widthsToDxa([0.52, 0.48], W - 2 * X), rows: [new TableRow({ children: [cell(facts(factsLeft)), cell(facts(factsRight))] })] }),
    p(t('Order of cost estimate from benchmark rates, not measured quantities. Not for financial commitment without review by a Chartered Quantity Surveyor.', { size: COVER_TYPE.note, color: COLOURS.greyMute }), { before: 400 }),
  ], { width: W, margins: { top: 600, bottom: 0, left: X, right: X } })])
  const foot = exactRow(PAGE_DXA.height - pxToDxa(PAGE.coverTopPx) - pxToDxa(560), [cell(
    new Table({ width: { size: W, type: WidthType.DXA }, rows: [exactRow(pxToDxa(62), [cell([
      p([t(`${BRAND.name.toUpperCase()}  |  FEASIBILITY REPORT`, { size: COVER_TYPE.foot, color: COLOURS.onNavy }), t(`\t${BRAND.slogan}`, { size: COVER_TYPE.foot, color: COLOURS.onNavy, italic: true })], { after: 0 }),
    ], { width: W, fill: COLOURS.navyMid, vAlign: VerticalAlign.CENTER, margins: { top: 0, bottom: 0, left: X, right: X } })])] }),
    { width: W, vAlign: VerticalAlign.BOTTOM, margins: { top: 0, bottom: 0, left: 0, right: 0 } },
  )])
  return [new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [W], rows: [top, body, foot] })]
}

export function summaryPage(data, ctx) {
  const { cost, programme, aiProse, budget } = data
  const m = ctx.money
  const stat = (lbl, v, s) => [p(t(lbl.toUpperCase(), { size: TYPE.small, color: COLOURS.label }), { after: 40 }), p(t(v, { semi: true, size: TYPE.statFigure, color: COLOURS.navy }), { after: 30 }), p(t(s, { size: TYPE.small, color: COLOURS.grey }), { after: 0 })]
  const w = widthsToDxa([1 / 3, 1 / 3, 1 / 3], CONTENT_DXA)
  const strip = new Table({ width: { size: CONTENT_DXA, type: WidthType.DXA }, columnWidths: w, rows: [new TableRow({ children: [
    cell(stat('Total project cost', `${m(cost?.total?.low)} – ${m(cost?.total?.high)}`, `Excl. VAT · ${m(cost?.vat)} VAT at ${vatPct(cost)}% (mid-point, for reference)`), { width: w[0], fill: COLOURS.tintGroup }),
    cell(stat('Programme', `${programme?.totalWeeks} weeks`, programme?.floatWeeks > 0 ? `Incl. ${programme.floatWeeks} weeks float · best case ${programme.totalWeeksBestCase} weeks` : 'Critical path, no float'), { width: w[1], fill: COLOURS.tintGroup }),
    cell(stat('BCIS region', cost?.bcisRegion || '—', `Location factor ${cost?.bcisFactor}`), { width: w[2], fill: COLOURS.tintGroup }),
  ] })] })
  const out = [strip, p(t(''), { after: 200 }), band(1, 'Executive Summary'), p(t(''), { after: 120 })]
  if (aiProse?.executiveSummary) out.push(p(t(cleanReportText(aiProse.executiveSummary))))
  if (aiProse?.keyFindings?.length) out.push(h3('Key findings'), ...bullets(aiProse.keyFindings.map(cleanReportText)))
  if (budget && budget.status !== 'none' && budget.note) {
    const colour = budget.status === 'insufficient' ? COLOURS.ragHigh : budget.status === 'tight' ? COLOURS.warn : COLOURS.pass
    out.push(p([t(`Budget check: ${{ sufficient: 'sufficient', tight: 'tight', insufficient: 'shortfall' }[budget.status] || budget.status}. `, { semi: true, color: colour }), t(budget.note)], { before: 200 }))
  }
  if (programme?.targetStatus === 'at-risk' && programme.targetNote) out.push(p([t('Target date: ', { semi: true, color: COLOURS.warn }), t(programme.targetNote)]))
  return out
}

export function scopePage(data) {
  const { cost, aiProse } = data
  const groups = scopeGroups(cost)
  const out = [band(2, 'Scope of Works'), p(t(''), { after: 120 }), p(t(scopeStatement(cost))), h3('Included works')]
  for (const g of groups) out.push(p(t(g.label.toUpperCase(), { semi: true, size: TYPE.small, color: COLOURS.navy }), { before: 120, after: 40, keepNext: true }), ...bullets(g.items))
  out.push(h3('Scope assumptions'), ...(aiProse?.scopeAssumptions?.length ? bullets(aiProse.scopeAssumptions.map(cleanReportText)) : [p(t('Scope to be confirmed after surveys and Stage 2 design.', { color: COLOURS.grey }))]))
  out.push(h3('Not in scope'), ...bullets(notInScopeLines(cost)))
  const np = notPricedLines(cost)
  if (np.length) out.push(h3('Selected but not priced'), ...bullets(np))
  return out
}

export function riskPage(data) {
  const { risks, counts } = prepareRisks(data.aiProse?.riskRegister)
  const out = [band(3, 'Risk Register', `Ordered by rating · ${LIMITS.maxRisks} risks at most`), p(t(''), { after: 120 })]
  if (!risks.length) return [...out, p(t('No risk register data available.', { color: COLOURS.grey }))]
  out.push(p([t(`${counts.High} High`, { semi: true, color: COLOURS.ragHigh }), t('   ·   '), t(`${counts.Medium} Medium`, { semi: true, color: COLOURS.ragMed }), t('   ·   '), t(`${counts.Low} Low`, { semi: true, color: COLOURS.ragLow })]))
  out.push(table({
    widths: TABLES.risk, head: ['Ref', 'Category', 'Description', 'Rating', 'Mitigation'],
    rows: risks.map(r => ({ kind: r.rating === 'High' ? 'high' : r.rating === 'Medium' ? 'med' : 'row', cells: [p(t(r.ref, { mono: true, semi: true, size: TYPE.table, color: COLOURS.navy }), { after: 0 }), r.category, r.description, pill(r.rating), r.mitigation] })),
  }))
  return out
}

export function programmePage(data) {
  const pr = data.programme || {}
  const ms = selectMilestones(pr)
  const segs = overviewSegments(pr)
  const total = pr.totalWeeks || 0
  const out = [band(4, 'High-Level Programme', programmeHeadline(pr)), h3('Key milestones')]
  out.push(table({ widths: [0.08, 0.52, 0.28, 0.12], head: ['', 'Milestone', 'Date', 'Week'], numeric: [3],
    rows: ms.map(m => ({ kind: 'row', cells: [p(t(m.id, { semi: true, size: TYPE.table, color: COLOURS.amberText }), { after: 0 }), m.label, p(t(fmtDate(m.date), { size: TYPE.table, color: m.missedTarget ? COLOURS.ragHigh : COLOURS.ink, semi: m.missedTarget }), { after: 0 }), String(m.week)] })) }))
  const segW = widthsToDxa(segs.map(s => s.pct / 100), CONTENT_DXA)
  out.push(p(t(''), { after: 160 }), new Table({ width: { size: CONTENT_DXA, type: WidthType.DXA }, columnWidths: segW, rows: [exactRow(620, segs.map((s, i) => cell(
    p(t(s.narrow ? `${s.weeks}w` : `${s.label} · ${s.weeks} wks`, { semi: true, size: TYPE.small, color: s.category === 'float' ? COLOURS.ink : COLOURS.paper }), { after: 0, align: AlignmentType.CENTER }),
    { width: segW[i], fill: SEG_FILL[s.category] || COLOURS.segOther, vAlign: VerticalAlign.CENTER, margins: { top: 0, bottom: 0, left: 30, right: 30 } },
  )))] }))
  out.push(p(ms.map((m, i) => t(`${i ? '    ' : ''}${m.id} ${fmtDate(m.date)}`, { size: TYPE.small, color: COLOURS.amberText })), { before: 80 }))
  out.push(h3('Programme detail'), table({ widths: TABLES.programme, head: ['Stage', 'Activity', 'Start', 'End', 'Wks'], numeric: [4],
    rows: [...programmeDetailRows(pr).map(r => ({ kind: 'row', cells: [`${r.stage}${r.parallel ? ' ∥' : ''}`, r.activity, fmtDate(r.start), fmtDate(r.end), r.parallel ? `(${r.weeks})` : String(r.weeks)] })),
      { kind: 'total', cells: ['Total', '', fmtDate(pr.startDate), fmtDate(pr.endDate), String(total)] }] }))
  out.push(h3('Programme narrative and assumptions'), ...bullets(programmeNarrativeLines(pr)))
  return out
}

const worksLineRows = (rows, m) => rows.map(r => (r.type === 'group'
  ? { kind: 'group', cells: [r.label.toUpperCase()] }
  : { kind: 'row', cells: [p(t(r.item.code, { mono: true, size: TYPE.small, color: COLOURS.code }), { after: 0 }), `${r.item.description}${r.item.aiEstimate ? ` ${UNVERIFIED_MARK}` : ''}`, lineQty(r.item), lineBasisWord(r.item), m(r.item.lineLow, true), m(r.item.lineHigh, true)] }))

export function costWorksPage(data, ctx) {
  const { cost, aiProse } = data
  const m = ctx.money
  const mode = worksTableMode(cost)
  const out = [band(5, 'Order of Cost Estimate', '1 of 2 · Works cost'), p(t(''), { after: 120 }), p(t(aiProse?.costNarrative ? cleanReportText(aiProse.costNarrative) : costIntroText(cost), { color: COLOURS.grey }))]
  if (mode === 'lines') {
    out.push(table({ widths: TABLES.works, head: ['Code', 'Element', 'Qty', 'Basis', 'Low £', 'High £'], numeric: [2, 4, 5],
      rows: [...worksLineRows(worksRows(cost), m), { kind: 'total', cells: ['', 'Works cost total', '', '', m(cost.works?.low, true), m(cost.works?.high, true)] }] }))
  } else {
    out.push(table({ widths: TABLES.worksGroups, head: ['Element group', 'Items', 'Low £', 'High £'], numeric: [1, 2, 3],
      rows: [...worksGroupRows(cost).map(g => ({ kind: 'row', cells: [g.label, String(g.count), m(g.low, true), m(g.high, true)] })), { kind: 'total', cells: ['Works cost total', '', m(cost.works?.low, true), m(cost.works?.high, true)] }] }))
  }
  const unverified = (cost?.lineItems || []).some(l => l.aiEstimate)
  out.push(p(t(`${mode === 'groups' ? 'Full line-by-line breakdown in Appendix A. ' : ''}${unverified ? `${UNVERIFIED_MARK} Rate marked for verification in the rates workbook. ` : ''}Low and high reflect the estimate range; see the next page.`, { size: TYPE.small, color: COLOURS.greyMute }), { before: 80 }))
  return out
}

export function costSummaryPage(data, ctx) {
  const { cost, answers } = data
  const m = ctx.money
  const out = [band(5, 'Order of Cost Estimate', '2 of 2 · Project cost'), p(t(''), { after: 120 })]
  out.push(table({ widths: TABLES.projectCost, head: ['Item', 'Rate', 'Low £', 'High £'], numeric: [2, 3],
    rows: projectCostRows(cost).map(r => ({ kind: r.kind === 'row' ? 'row' : r.kind, cells: [r.label, r.rate, m(r.low, true), m(r.high, true)] })) }))
  const pl = percentageLines(cost)
  if (pl.length) out.push(h3('How the percentages were set'), ...pl.map(l => p([t(`${l.name} ${l.pct}: `, { semi: true }), t(`${l.text}.`)], { bullet: true, after: 60 })))
  out.push(h3('Cost assumptions'), ...bullets(costAssumptionLines(cost)), h3('Cost exclusions'), ...bullets(costExclusionLines(cost, answers)))
  return out
}

export function lateSection(key, no, data, ctx) {
  const a = data.aiProse || {}, pr = data.programme || {}
  if (key === 'roi') {
    const roi = ctx.roi, m = ctx.money
    return [band(no, 'Financial Case'), p(t(''), { after: 100 }),
      p([t('Project cost (mid) ', { size: TYPE.small, color: COLOURS.label }), t(`${m(roi?.mid)}    `, { semi: true, size: TYPE.statFigure, color: COLOURS.navy }), t('Annual benefit ', { size: TYPE.small, color: COLOURS.label }), t(`${m(roi?.annual)}    `, { semi: true, size: TYPE.statFigure, color: COLOURS.navy }), t('Simple payback ', { size: TYPE.small, color: COLOURS.label }), t(`${roi?.paybackYears} years`, { semi: true, size: TYPE.statFigure, color: COLOURS.navy })]),
      ...(a.roiNarrative ? [p(t(cleanReportText(a.roiNarrative)))] : [])]
  }
  if (key === 'procurement') {
    return [band(no, 'Procurement Recommendation'), p(t(''), { after: 100 }),
      table({ widths: [0.32, 0.68], head: ['', ''], rows: [
        { kind: 'row', cells: ['Route', a.procurementRoute || pr.procurementRoute || ''] },
        { kind: 'row', cells: ['Contract', a.procurementContractForm || pr.contractForm || ''] },
        { kind: 'row', cells: ['Tender type · design', `${a.procurementTenderType || pr.tenderType || ''} · ${String(a.procurementDesignResp || pr.designResponsibility || '').toLowerCase()}`] },
      ] }),
      ...(a.procurementNarrative ? [p(t(cleanReportText(a.procurementNarrative)), { before: 120 })] : []),
      ...(a.procurementConsiderations?.length ? [h3('Commercial considerations'), ...bullets(a.procurementConsiderations.map(cleanReportText))] : []),
      ...(a.procurementConflicts?.length ? bullets(a.procurementConflicts.map(cleanReportText)) : [])]
  }
  return [band(no, 'Constraints Summary'), p(t(''), { after: 100 }),
    table({ widths: TABLES.constraints, head: ['Category', 'Constraint', 'Impact'], rows: (a.constraints || []).map(c => ({ kind: 'row', cells: [c.category, p(t(cleanReportText(c.title), { semi: true, size: TYPE.table }), { after: 0 }), cleanReportText(c.text)] })) })]
}

export function lastPage(data, ctx, no) {
  const { aiProse, cost, programme } = data
  return [
    band(no, 'Recommendations and Next Steps'), p(t(''), { after: 120 }),
    ...(aiProse?.nextSteps?.length ? numbered(aiProse.nextSteps.map(cleanReportText)) : [p(t('Commission outstanding surveys and appoint a design team to proceed to RIBA Stage 2.'))]),
    p(t('Disclaimer', { semi: true, color: COLOURS.navy }), { before: 360, after: 60 }),
    p(t(`${DISCLAIMER} ${dataSourcesSentence(cost, programme)}`, { size: TYPE.small, color: COLOURS.greyMute })),
    table({ widths: [0.3, 0.7], head: [BRAND.name, 'Further information'], rows: [
      { kind: 'row', cells: [BRAND.strapline, `For questions about this report, or to take the project on to a full cost plan and Stage 2 brief, contact our team and quote reference ${ctx.reference}.`] },
      { kind: 'row', cells: ['Email', BRAND.email] },
      { kind: 'row', cells: ['Telephone', BRAND.phone] },
      { kind: 'row', cells: ['Web', BRAND.web] },
    ] }),
  ]
}

export function appendixPage(data, ctx, page) {
  const m = ctx.money
  const last = page.part === page.parts
  return [band('A', 'Appendix A · Works cost, line by line', `Part ${page.part} of ${page.parts}`), p(t(''), { after: 120 }),
    table({ widths: TABLES.works, head: ['Code', 'Element', 'Qty', 'Basis', 'Low £', 'High £'], numeric: [2, 4, 5],
      rows: [...worksLineRows(page.rows, m), ...(last ? [{ kind: 'total', cells: ['', 'Works cost total', '', '', m(data.cost.works?.low, true), m(data.cost.works?.high, true)] }] : [])] })]
}
```

`rule()` is exported from `primitives.js` so page builders never hand-build a colour string.

- [ ] **Step 2: Rewrite `lib/reportBuilder.js`**

First add the page-number runs to `lib/docx/primitives.js` (the only place a raw `TextRun` is allowed), and import `PageNumber` there:

```js
// add to lib/docx/primitives.js
export function pageNumberRuns() {
  const base = { font: FONTS.word.regular, size: hp(TYPE.small), color: hex(COLOURS.greyMute) }
  return [new TextRun({ ...base, children: [PageNumber.CURRENT] }), new TextRun({ ...base, text: ' of ' }), new TextRun({ ...base, children: [PageNumber.TOTAL_PAGES] })]
}
```

Then replace the whole of `lib/reportBuilder.js` with:

```js
// lib/reportBuilder.js
/**
 * Builds the Word report. The look comes from lib/reportStyle.js (through
 * lib/docx/primitives.js), the content and page layout from
 * lib/reportContent.js, so the .docx follows the same page map as the screen
 * and the PDF. IBM Plex is embedded (lib/docx/fonts.js).
 * SECURITY: never reference AI_API_KEY here.
 */
import { Document, Packer, Header, Footer, Paragraph, TabStopType } from 'docx'
import { BRAND, COLOURS, FONTS, TYPE, PAGE, hp, hex, pxToDxa } from './reportStyle.js'
import { buildPageMap, money, reportReference, fmtLongDate } from './reportContent.js'
import { embeddedFonts } from './docx/fonts.js'
import { t, p, rule, pageNumberRuns, NUMBERING, MARGIN_X, CONTENT_DXA, PAGE_DXA } from './docx/primitives.js'
import * as P from './docx/pages.js'

function header(ctx) {
  return new Header({ children: [new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_DXA }],
    border: { bottom: { ...rule(COLOURS.navy, 6), space: 4 } },
    children: [
      t(`${BRAND.mark}  `, { semi: true, color: COLOURS.amberOnDark, size: TYPE.small }),
      t(BRAND.name, { semi: true, color: COLOURS.navy, size: TYPE.small }),
      t(` · ${ctx.short}`, { size: TYPE.small, color: COLOURS.greyMute }),
      t(`\tFeasibility Report · Ref ${ctx.reference}`, { size: TYPE.small, color: COLOURS.greyMute }),
    ],
  })] })
}

function footer() {
  return new Footer({ children: [new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_DXA }],
    border: { top: { ...rule(COLOURS.rule, 4), space: 4 } },
    children: [
      t(BRAND.name, { semi: true, color: COLOURS.navy, size: TYPE.small }),
      t(` · ${BRAND.strapline} · ${BRAND.web} · Indicative only\tPage `, { size: TYPE.small, color: COLOURS.greyMute }),
      ...pageNumberRuns(),
    ],
  })] })
}

export async function buildReport(input) {
  const data = { ...input }
  const { pages, ctx: base } = buildPageMap(data)
  const ctx = {
    ...base,
    reference: reportReference(data.reportId, data),
    dateLong: fmtLongDate(data.generatedAt || new Date().toISOString()),
    money: (n, bare = false) => money(n, data.cost?.total?.high, { symbol: !bare }),
  }
  const build = {
    summary: () => P.summaryPage(data, ctx), scope: () => P.scopePage(data), risk: () => P.riskPage(data),
    programme: () => P.programmePage(data), costWorks: () => P.costWorksPage(data, ctx), costSummary: () => P.costSummaryPage(data, ctx),
    late: pg => pg.slots.flatMap((s, i) => [...(i ? [p(t(''), { before: s.slot === 'bottom' ? 1200 : 480, after: 0 })] : []), ...P.lateSection(s.key, s.no, data, ctx)]),
    last: pg => P.lastPage(data, ctx, pg.no), appendix: pg => P.appendixPage(data, ctx, pg),
  }
  const body = []
  for (const pg of pages) {
    if (pg.kind === 'cover') continue
    if (body.length) body.push(p(t(''), { pageBreakBefore: true, after: 0 }))
    body.push(...build[pg.kind](pg))
  }
  const doc = new Document({
    creator: BRAND.name,
    title: data.answers?.q1_0_projectName || 'Feasibility report',
    fonts: await embeddedFonts(),
    numbering: NUMBERING,
    styles: { default: { document: { run: { font: FONTS.word.regular, size: hp(TYPE.body), color: hex(COLOURS.ink) } } } },
    sections: [
      { properties: { page: { size: PAGE_DXA, margin: { top: 0, bottom: 0, left: 0, right: 0, header: 0, footer: 0 } } },
        children: P.coverPage(data, ctx) },
      { properties: { page: { size: PAGE_DXA, margin: { top: pxToDxa(PAGE.bodyTopPx), bottom: pxToDxa(PAGE.bodyBottomPx), left: MARGIN_X, right: MARGIN_X, header: pxToDxa(PAGE.headerTopPx), footer: pxToDxa(PAGE.footerBottomPx) } } },
        headers: { default: header(ctx) }, footers: { default: footer() }, children: body },
    ],
  })
  return Packer.toBuffer(doc)
}
```

Delete `getTemplateInfo` if nothing imports it (`grep -rn getTemplateInfo app lib`); otherwise keep it unchanged at the end of the file.

- [ ] **Step 3: Run the existing tests**

Run: `npx vitest run lib/__tests__/reportV52.test.js`
Expected: the `.docx` text case FAILS on the old wording. Update its expectations to the new design:

```js
    expect(text).toContain('Toilets')
    expect(text).toContain('client figure')
    expect(text).toContain('estimated')
    expect(text).toContain('†')
    expect(text).toContain('Other development costs')
    expect(text).toContain('Loose furniture, fittings and AV equipment')
    expect(text).toMatch(/5 · SERVICES|SERVICES/)
```

Keep the first test and the legacy tests unchanged. Re-run: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/docx lib/reportBuilder.js lib/__tests__/reportV52.test.js
git commit -m "Word: same page map and look as the PDF, one builder per page"
```

---

### Task 19: Word smoke test and a strict guard

**Files:**
- Create: `lib/__tests__/reportDocx.test.js`
- Modify: `lib/__tests__/reportStyleGuard.test.js` (remove the temporary `it.fails`)

- [ ] **Step 1: Write the test**

```js
// lib/__tests__/reportDocx.test.js
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import sample from '../../public/sample/report.json'
import { buildReport } from '../reportBuilder.js'
import { FONTS } from '../reportStyle.js'

describe('Word report', () => {
  it('embeds IBM Plex, uses no other font and follows the page map', async () => {
    const buf = await buildReport({ ...sample })
    const zip = await JSZip.loadAsync(buf)
    const files = Object.keys(zip.files)
    expect(files.some(f => /^word\/fonts\/.+\.odttf$/.test(f))).toBe(true)
    const doc = await zip.file('word/document.xml').async('string')
    const fontsUsed = new Set([...doc.matchAll(/w:ascii="([^"]+)"/g)].map(m => m[1]))
    for (const f of fontsUsed) expect(Object.values(FONTS.word)).toContain(f)
    const text = doc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    const order = ['Executive Summary', 'Scope of Works', 'Risk Register', 'High-Level Programme', 'Order of Cost Estimate', 'Financial Case', 'Procurement Recommendation', 'Constraints Summary', 'Recommendations and Next Steps']
    const at = order.map(s => text.indexOf(s))
    expect(at.every(i => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(text).not.toMatch(/\(Q\d/)
    expect(text).toContain('Further information')
  })
})
```

- [ ] **Step 2: Run it**

Run: `npx vitest run lib/__tests__/reportDocx.test.js`
Expected: PASS. If the font parts use another extension, adjust the regex to what `docx` 9.6.1 writes; list `files` to see.

- [ ] **Step 3: Make the guard strict**

In `reportStyleGuard.test.js`, remove the `it.fails` for `lib/reportBuilder.js`. Run the whole suite:

Run: `npm test`
Expected: all pass (the one existing programme-workbook skip remains).

- [ ] **Step 4: Commit**

```bash
git add lib/__tests__/reportDocx.test.js lib/__tests__/reportStyleGuard.test.js
git commit -m "Tests: Word embeds IBM Plex and follows the page map; strict style guard"
```

---

### Task 20: EXAMPLE GATE 2: Word, for the user's approval

**This task stops for the user.**

- [ ] **Step 1: Build the example Word files**

```bash
node -e "import('./lib/reportBuilder.js').then(async m=>{const fs=await import('node:fs');const s=JSON.parse(fs.readFileSync('public/sample/report.json','utf8'));fs.writeFileSync(process.argv[1],await m.buildReport(s))})" "<scratchpad>/report-sample.docx"
```

Expected: the file is written, about 0.6–1.2 MB.

- [ ] **Step 2: Send it to the user with the matching PDF**

Ask them to open the `.docx` in Word, ideally on a PC without IBM Plex installed, and compare it with the PDF:
1. Do the fonts show as IBM Plex (not a substitute)?
2. Is every page in the same place (Scope on page 3, Next Steps last)?
3. Is the cover right?

Word's spacing may differ slightly from the PDF; fonts, sizes, colours and structure must not. **Wait for approval.** If the embedded fonts do not show, try embedding with `characterSet` set (see `CharacterSet` in the `docx` typings) and re-test.

---

## Milestone D: Finishing

### Task 21: Q1.0 cover-title hint

**Files:**
- Modify: `app/questionnaire/page.jsx` (the `QCard qkey="q1_0_projectName"` block, around line 1109)

- [ ] **Step 1: Implement**

Add `import { titleLooksThin } from '@/lib/reportContent'` and, directly after the `validationErrors.q1_0_projectName` line inside that `QCard`:

```jsx
              {answers.q1_0_projectName?.trim() && (
                <p className="mt-2 text-sm" style={{ color: 'var(--text-soft)' }}>
                  Cover title: <strong style={{ color: 'var(--ink)' }}>{answers.q1_0_projectName.trim()}</strong>
                  {titleLooksThin(answers.q1_0_projectName, answers.q1_1_postcode) && (
                    <span role="status" style={{ display: 'block', color: 'var(--amber-deep)', marginTop: 4 }}>
                      Add the work and the building, e.g. &ldquo;Refurbishment of Block C, first floor&rdquo;.
                    </span>
                  )}
                </p>
              )}
```

- [ ] **Step 2: Verify in the browser**

In the gate-open preview, type `Solihull` into Q1.0 and confirm the preview line and the warning appear (`read_page`). Type `Refurbishment of Block C, first floor` and confirm the warning disappears.

- [ ] **Step 3: Commit**

```bash
git add app/questionnaire/page.jsx
git commit -m "Questionnaire: preview the cover title and warn when it is too thin"
```

---

### Task 22: Sample, documentation, full verification and PR

**Files:**
- Modify: `public/sample/report.json` (regenerated), `CLAUDE.md`, `docs/superpowers/specs/2026-09-23-report-design-system-design.md` (status line)

- [ ] **Step 1: Regenerate the sample (one AI report)**

Tell the user that this spends one report's AI cost, then run `node scripts/make-sample.mjs` against the gate-open dev server. Check that the new sample's `aiProse.keyFindings` has 5 items and `nextSteps` has 5.

- [ ] **Step 2: Update `CLAUDE.md`**

Update these points:
- **"Report output" section:** the report is A4 pages built from `lib/reportStyle.js` + `lib/reportContent.js`, rendered by `app/report/doc/*` (screen/PDF) and `lib/docx/*` (Word). The guard test enforces it. The PDF has zero margins, and pages carry their own header, footer and "Page N of M". The `.docx` is built on download by `/api/reports/[id]/docx` and no longer stored in KV. The fit check is `node scripts/check-report-fit.mjs`, and the approved template is in `docs/superpowers/specs`.
- **"Core architectural rule":** the system prompt now has **fifteen** rules (15: no question numbers), and `PROSE_LIMITS` with `proseShapeProblems()` is a code-enforced shape check beside the number-leak guard. Shape misses are kept (trimmed), never failed, and logged to Sentry.
- **"Commands":** add `node scripts/check-report-fit.mjs [origin] [--pdf dir]`.
- **Brand:** "Estates AI", its strapline and contact details are placeholders in `BRAND` (`lib/reportStyle.js`).
- **`ensureSeedRisks`:** it now treats a seed written under its own ref as present.

- [ ] **Step 3: Full verification**

Run: `npm test` → all pass.
Run: `npm run build` → succeeds.
Run: `npm run lint` → no new errors compared with the branch point (`git stash; npm run lint > /tmp/before.txt; git stash pop; npm run lint > /tmp/after.txt; diff`).
Run: `node scripts/check-report-fit.mjs` (dev server up) → exit 0.

- [ ] **Step 4: Mark the spec implemented and commit**

Add under the spec's title: `*Status: implemented on feat/report-design-system (plan: docs/superpowers/plans/2026-09-24-report-design-system.md).*`

```bash
git add public/sample/report.json CLAUDE.md docs/superpowers/specs/2026-09-23-report-design-system-design.md
git commit -m "Report design system: sample, docs and status"
```

- [ ] **Step 5: Offer the PR**

Ask the user before pushing. On a yes, push and open a PR against `feat/scope-catalogue-v5-2` (or `main` once PR #12 is merged). Its body should summarise the page map, the style guard, the prose limits, the on-download `.docx`, and the two example gates with the user's approvals.
