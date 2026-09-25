# Projento Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the product from "Estates AI" to "Projento", apply the new logo to the web app and every report output (screen, PDF, Word), and remove every client-facing line that presents the work as AI-generated.

**Architecture:** One new pure module, `lib/brand.js`, holds every brand string and logo path. `lib/reportStyle.js` re-exports it, so the report renderers keep importing `BRAND` from the file they already use. SVG logos are served from `public/brand/` for the web and the HTML/PDF report. The Word builder reads PNG copies from `assets/brand/` with `fs`, and those PNGs are traced into the serverless functions the same way the IBM Plex fonts already are. User-facing copy that says "AI" is reworded around the real selling point, which is that every figure is calculated. The privacy notice keeps its legally required naming of Anthropic as a processor.

**Tech Stack:** Next.js 16.3.5 (App Router, file-convention icons), React, `docx` ^9.6.1 (`ImageRun`), Puppeteer / `@sparticuz/chromium`, Vitest.

**Spec:** `C:\Users\nabil\Downloads\CLAUDE_CODE_PROMPT.txt` (the same text is in the brand kit as `CLAUDE_CODE_PROMPT.txt`), plus `BRAND.md` and the mockups in `Documents/projento-brand-kit/projento-brand-kit/` (these move to `docs/brand/` in Task 7). Also the user's instruction of 25 Sep 2026: *"I don't want [it] saying this is AI generated work."*

## Global Constraints

- Name: **Projento** (capital P, the rest lower case). It is never written "Projento AI" or "PROJENTO" in running text; uppercase letter-spaced labels such as the cover footer band are the only exception.
- Tagline: **Plan · Analyse · Report** (middle dots with a space either side, British spelling). It is the only tagline.
- Report descriptor: **Feasibility reporting for capital projects**.
- `siteUrl` is `null` until the domain is bought. Anything that prints it must print nothing while it is null.
- No brand copy leads with "AI". The selling point is that every figure is deterministic.
- Brand amber `#D9A12E` is for fills and the logo only. The web token `--amber: #9D6B15` stays unchanged.
- Report sizes: cover wordmark 35 px tall (140 × 35); the tagline sits 9 px below it at 9.5 px, weight 500, 0.32em tracking, uppercase, `#A9B6C9`; running-header lockup 20 px tall (82 × 20). Word uses the same sizes: `ImageRun` 140 × 35 on the cover and 82 × 20 in the header.
- Never retype the wordmark in a live font. Use the SVG or PNG files.
- **Do not rename:** the `estate_access` / `estate_admin` cookies; the localStorage key `estatesAI_v4_answers`; the sessionStorage keys `estatesAI_result` / `estatesAI_report`; KV key prefixes (`report:`…); env var names; API routes; the package or repo name `estates-ai-tool`; the Vercel project; the Sentry project name `estates-ai-tool` in `next.config.ts`; existing document filenames such as `Estates_AI_Report_Template_PRODUCTION.docx`.
- Report layout does not change beyond the four BRAND.md items (cover lockup, cover footer band, running header, running footer) and the last-page contact card mark. That card carries the same "AI" badge and has to change too.
- No fonts, colour tokens or layout change in the web app. Follow the accessibility patterns in CLAUDE.md.
- `lib/__tests__/reportStyleGuard.test.js` must stay green. No hex, font-size or font-name literals are allowed in `app/report/doc/**`, `lib/docx/**` or `lib/reportBuilder.js`. New values go into `lib/reportStyle.js`.
- The AI system prompt is not changed. It does not mention "Estates AI" (checked: `lib/proseSchema.js` has no hit).

## Facts found while planning (the prompt's assumptions that turned out different)

- The brand kit is at `Documents/projento-brand-kit/projento-brand-kit/`, not at the repo root. Below, `KIT` means that folder.
- The report pages are rendered by `app/report/doc/*` (`CoverPage.jsx`, `parts.jsx`, `LastPage.jsx`, `report.css`), not by `ReportRenderer.jsx`. `ReportRenderer.jsx` only holds the toolbar, the sample banner and the download buttons.
- A `BRAND` object already exists in `lib/reportStyle.js` (name, `mark: 'AI'`, the old tagline, the old slogan, `web: 'estates-ai-tool.vercel.app'`, a placeholder email `enquiries@estates-ai.example` and phone). It is used by the cover, header, footer and last page in both renderers.
- The PDF route already waits for `networkidle0` and `document.fonts.ready`. It does not check that images loaded.
- There is no web manifest, so the "point the manifest at icon-192/512" step does not apply. The two icons still go to `public/brand/` for later use.
- `public/report-template.html` is an old, unreferenced page that still carries the old brand. It is publicly reachable at `/report-template.html`, so Task 7 deletes it.
- AI wording a client can see today: the landing page ("0 AI-invented figures", "no figures generated by AI"), the metadata description ("AI narrative"), two questionnaire messages ("the AI never invents a figure", "The AI writes prose only"), the Q6.1 help text ("for the AI narrative"), the sample banner ("the narrative written by AI"), the terms page ("AI provider downtime", "AI prompts"), the privacy page (the Anthropic processor entry), the "AI" badge on every header and in the report, and `unverifiedRatesSentence()` ('marked "AI estimate – verify"').
- Branch base: `main` (0b69286). PR #14 (`fix/test-report-batch2`) is still open. It touches `lib/prose.js` in a different function, so if it merges first, rebase this branch onto `main`.

## File map

| File | Change |
|---|---|
| `lib/brand.js` | **Create.** Brand strings, logo paths and intrinsic sizes, `reportFileName()` |
| `lib/reportStyle.js` | Re-export `BRAND` from `lib/brand.js`; add the colour `onNavyTagline`; set `COVER_TYPE.tagline` to 7.125 pt (9.5 px) |
| `lib/__tests__/brand.test.js` | **Create.** Brand strings and filename helper |
| `lib/__tests__/reportStyle.test.js` | Update the "placeholder brand" test |
| `app/report/doc/CoverPage.jsx`, `parts.jsx`, `LastPage.jsx`, `report.css` | Logo images, new footer copy, cover footer band |
| `lib/docx/primitives.js` | `img()` builder; `tracking` option on `t()` |
| `lib/docx/brandImages.js` | **Create.** Reads the PNGs for Word |
| `lib/docx/pages.js`, `lib/reportBuilder.js` | Cover, header, footer, last page and document properties |
| `lib/__tests__/reportDocx.test.js` | Images present, properties, footer copy, no "Estates AI" or "AI" |
| `next.config.ts` | Trace `assets/brand/**` into both docx-building routes |
| `app/api/report-pdf/[id]/route.js` | Wait for images; fail loudly if a logo is missing; new filename |
| `app/api/reports/[id]/docx/route.js`, `app/report/ReportRenderer.jsx` | New filenames; toolbar title; sample banner copy |
| `app/components/Logo.jsx` | **Create.** `<img>`-based logo component |
| `app/globals.css` | Show the monogram instead of the wordmark below 360 px |
| `app/layout.tsx` | Title, description and Open Graph |
| `app/page.jsx`, `app/access/page.jsx`, `app/admin/page.jsx`, `app/questionnaire/page.jsx`, `app/privacy/page.jsx`, `app/terms/page.jsx` | Logo and copy |
| `app/favicon.ico`, `app/icon.svg`, `app/apple-icon.png` | Replace or add (Next file conventions) |
| `public/brand/*` | **Create.** SVG logos, PNGs, icon-192/512 |
| `assets/brand/*` | **Create.** Two PNGs for Word |
| `lib/reportShared.js` | Reword `unverifiedRatesSentence()` |
| `lib/prose.js` + `lib/__tests__/proseShape.test.js` | Narrow guard: prose must not describe the report as AI-generated |
| `lib/__tests__/brandCopy.test.js` | **Create.** Scans for old brand names and "AI-generated" claims |
| `public/report-template.html` | **Delete** (unreferenced, public, old brand) |
| `README.md`, `CLAUDE.md` | Product name, brand section, do-not-rename list |
| `docs/brand/` | **Create.** `BRAND.md` + `mockups/`, moved from the kit; the kit folder is deleted |

---

### Task 0: Branch and assets

**Files:**
- Create: `public/brand/` (10 files), `assets/brand/` (2 files), `app/icon.svg`, `app/apple-icon.png`
- Replace: `app/favicon.ico`

- [ ] **Step 1: Branch from main**

```bash
git switch main && git pull --ff-only && git switch -c rebrand-projento
```

- [ ] **Step 2: Copy the assets**

```bash
K="Documents/projento-brand-kit/projento-brand-kit"
mkdir -p public/brand assets/brand
cp $K/logo/projento-wordmark-navy.svg $K/logo/projento-wordmark-white.svg $K/logo/projento-header-lockup.svg $K/logo/projento-monogram.svg public/brand/
cp $K/png/*.png public/brand/
cp $K/icons/icon-192.png $K/icons/icon-512.png public/brand/
cp $K/png/projento-wordmark-white-1600.png $K/png/projento-header-lockup-1200.png assets/brand/
cp $K/icons/favicon.ico app/favicon.ico
cp $K/icons/icon.svg app/icon.svg
cp $K/icons/apple-icon.png app/apple-icon.png
```

The two single-colour wordmarks (black and mono-white) are for print only and are not copied. `app/favicon.ico` is overwritten, not duplicated. Check that no other icon file conflicts:

```bash
ls app | grep -iE "icon|favicon"; ls public | grep -iE "icon|favicon|manifest"
```

Expected: only `apple-icon.png`, `favicon.ico` and `icon.svg` in `app/`, and nothing in `public/`.

- [ ] **Step 3: Commit**

```bash
git add public/brand assets/brand app/favicon.ico app/icon.svg app/apple-icon.png
git commit -m "Add the Projento logo, icons and Word PNGs"
```

---

### Task 1: `lib/brand.js`, the single source of brand strings

**Files:**
- Create: `lib/brand.js`, `lib/__tests__/brand.test.js`
- Modify: `lib/reportStyle.js:13-24`, `lib/__tests__/reportStyle.test.js:30-33`

**Interfaces:**
- Produces: `BRAND` = `{ name, tagline, descriptor, siteUrl, email, phone, fileStem }`; `LOGOS` = `{ wordmarkNavy, wordmarkWhite, lockup, monogram }`, each `{ src, width, height }` (intrinsic viewBox size); `logoWidth(logo, height)` → integer px; `reportFileName(ref, ext)` → `'Projento-Feasibility-Report-<ref>.<ext>'`. `lib/reportStyle.js` re-exports `BRAND`. `BRAND.mark`, `BRAND.slogan`, `BRAND.web` and `BRAND.strapline` no longer exist; every consumer is updated in Tasks 2–6.

- [ ] **Step 1: Write the failing test**, `lib/__tests__/brand.test.js`

```js
import { describe, it, expect } from 'vitest'
import { BRAND, LOGOS, logoWidth, reportFileName } from '../brand.js'
import { BRAND as STYLE_BRAND } from '../reportStyle.js'

describe('brand', () => {
  it('holds the Projento strings in one place', () => {
    expect(BRAND.name).toBe('Projento')
    expect(BRAND.tagline).toBe('Plan · Analyse · Report')
    expect(BRAND.descriptor).toBe('Feasibility reporting for capital projects')
    expect(BRAND.siteUrl).toBeNull()
    expect(STYLE_BRAND).toBe(BRAND)
  })
  it('keeps the SVG aspect ratios the Word sizes rely on', () => {
    expect(logoWidth(LOGOS.wordmarkWhite, 35)).toBe(140)
    expect(logoWidth(LOGOS.lockup, 20)).toBe(82)
  })
  it('names downloads after the brand and the report reference', () => {
    expect(reportFileName('B6AABAF9', 'pdf')).toBe('Projento-Feasibility-Report-B6AABAF9.pdf')
    expect(reportFileName('', 'docx')).toBe('Projento-Feasibility-Report-DRAFT.docx')
  })
  it('never carries the old name or an AI label', () => {
    expect(JSON.stringify(BRAND)).not.toMatch(/estates|\bAI\b|smarter|insights/i)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run lib/__tests__/brand.test.js`
Expected: FAIL, "Failed to resolve import ../brand.js".

- [ ] **Step 3: Create `lib/brand.js`**

```js
/**
 * lib/brand.js — the product's name, tagline and logo files. The only place a
 * brand string lives: the web app, both report renderers and the download
 * filenames read it. Pure data, no React, no node-only imports (a client
 * component and the Word builder both import it). Brand rules:
 * docs/brand/BRAND.md.
 *
 * siteUrl is null until the domain is bought; everything that prints it prints
 * nothing while it is null, so adding the domain later is a one-line change.
 * email / phone: null hides the row on the report's contact card.
 */
export const BRAND = Object.freeze({
  name: 'Projento',
  tagline: 'Plan · Analyse · Report',
  descriptor: 'Feasibility reporting for capital projects',
  siteUrl: null,
  email: null,
  phone: '0121 000 0000',
  fileStem: 'Projento-Feasibility-Report',
})

// Intrinsic sizes are the SVG viewBoxes; the PNGs in public/brand and
// assets/brand are exports of the same artwork, so the ratios match.
export const LOGOS = Object.freeze({
  wordmarkNavy:  Object.freeze({ src: '/brand/projento-wordmark-navy.svg',  width: 387.1,  height: 96.6 }),
  wordmarkWhite: Object.freeze({ src: '/brand/projento-wordmark-white.svg', width: 387.1,  height: 96.6 }),
  lockup:        Object.freeze({ src: '/brand/projento-header-lockup.svg',  width: 410.19, height: 100 }),
  monogram:      Object.freeze({ src: '/brand/projento-monogram.svg',       width: 100,    height: 100 }),
})

export const logoWidth = (logo, height) => Math.round((logo.width / logo.height) * height)

export function reportFileName(ref, ext) {
  const safe = String(ref || 'DRAFT').replace(/[^A-Za-z0-9-]/g, '')
  return `${BRAND.fileStem}-${safe || 'DRAFT'}.${ext}`
}
```

Before relying on them, check the viewBoxes of the navy wordmark and the monogram: `head -c 200 public/brand/projento-wordmark-navy.svg public/brand/projento-monogram.svg`. The white wordmark (387.1 × 96.6) and the lockup (410.19 × 100) were read during planning.

- [ ] **Step 4: Point `lib/reportStyle.js` at it.** Replace lines 13–24 (the comment and the `BRAND` object) with:

```js
// Brand strings live in lib/brand.js; re-exported so the renderers keep one import.
export { BRAND } from './brand.js'
```

In `COLOURS`, add `onNavyTagline: '#A9B6C9',` after `onNavyMute`. In `COVER_TYPE`, change `tagline: 7` to `tagline: 7.125` (9.5 px, BRAND.md).

- [ ] **Step 5: Update `lib/__tests__/reportStyle.test.js`**, replacing the test at line 30:

```js
  it('takes the brand from lib/brand.js', () => {
    expect(BRAND.name).toBe('Projento')
    expect(PAGE.widthPx).toBe(794)
  })
```

- [ ] **Step 6: Run both tests**

Run: `npx vitest run lib/__tests__/brand.test.js lib/__tests__/reportStyle.test.js`
Expected: PASS. (Renderer tests fail until Tasks 2–3, because they still read `BRAND.mark` and `BRAND.slogan`. That is expected, and those tasks fix it.)

- [ ] **Step 7: Commit**

```bash
git add lib/brand.js lib/reportStyle.js lib/__tests__/brand.test.js lib/__tests__/reportStyle.test.js
git commit -m "Add lib/brand.js as the single source of the Projento name"
```

---

### Task 2: Report pages on screen and in the PDF

**Files:**
- Modify: `app/report/doc/CoverPage.jsx:13,35`, `app/report/doc/parts.jsx:10-26`, `app/report/doc/LastPage.jsx:20-27`, `app/report/doc/report.css:28-31,63-67,87-89,206-209`

**Interfaces:**
- Consumes: `BRAND`, `LOGOS`, `logoWidth` from `@/lib/brand`; `ctx.reference` and `ctx.dateLong` (already on `ctx`).

- [ ] **Step 1: Cover lockup and footer band.** In `CoverPage.jsx`, add `import { LOGOS, logoWidth } from '@/lib/brand'`, then replace line 13 with:

```jsx
        <div className="r-cv-brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, printed by Puppeteer; next/image adds nothing */}
          <img src={LOGOS.wordmarkWhite.src} alt={BRAND.name} width={logoWidth(LOGOS.wordmarkWhite, 35)} height={35} />
          <small>{BRAND.tagline}</small>
        </div>
```

Replace line 35 with:

```jsx
      <div className="r-cv-foot"><span>{BRAND.name.toUpperCase()} &nbsp;|&nbsp; FEASIBILITY REPORT</span><em>Ref {ctx.reference} · {ctx.dateLong}</em></div>
```

(Only add the eslint-disable comment if `npm run lint` actually reports `no-img-element`. Otherwise leave it out.)

- [ ] **Step 2: Running header and footer.** In `parts.jsx`, add `import { LOGOS, logoWidth } from '@/lib/brand'` and replace `RunningHeader` / `RunningFooter`:

```jsx
export function RunningHeader({ ctx }) {
  return (
    <div className="r-rh">
      <div className="r-rh-brand">
        {/* eslint-disable-next-line @next/next/no-img-element -- see CoverPage */}
        <img src={LOGOS.lockup.src} alt={BRAND.name} width={logoWidth(LOGOS.lockup, 20)} height={20} />
        <span>· {ctx.short}</span>
      </div>
      <div className="r-rh-doc">Feasibility Report · Ref {ctx.reference}</div>
    </div>
  )
}

export function RunningFooter({ page, ctx }) {
  return (
    <div className="r-rf">
      <span><b>{BRAND.name}</b> · {BRAND.descriptor}{BRAND.siteUrl ? ` · ${BRAND.siteUrl}` : ''} · Indicative only</span>
      <span>Page {page} of {ctx.totalPages}</span>
    </div>
  )
}
```

- [ ] **Step 3: Last-page contact card.** In `LastPage.jsx`, replace the `r-c-brand` line with the lockup at 24 px, and render only the rows that have a value:

```jsx
        <div className="r-c-brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- see CoverPage */}
          <img src={LOGOS.lockup.src} alt={BRAND.name} width={logoWidth(LOGOS.lockup, 24)} height={24} />
          <small>{BRAND.descriptor}</small>
        </div>
```

```jsx
            {[['Email', BRAND.email], ['Telephone', BRAND.phone], ['Web', BRAND.siteUrl]].filter(([, v]) => v).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
```

- [ ] **Step 4: CSS.** In `report.css`, delete the `.r-rh-brand i { … }` rule and the `.r-mark` rules (lines 29–30, 64–65 and 207). Change the brand rules to:

```css
.r-rh-brand img { display: block; height: 20px; width: auto; }
.r-cv-brand { display: block; }
.r-cv-brand img { display: block; height: 35px; width: auto; }
.r-cv-brand small { display: block; margin-top: 9px; font-size: var(--r-cv-tagline); font-weight: 500; letter-spacing: .32em;
                    text-transform: uppercase; color: var(--r-on-navy-tagline); }
.r-cv-foot em { font-style: normal; letter-spacing: 0; font-size: var(--r-cv-note); }
.r-c-brand { display: block; }
.r-c-brand img { display: block; height: 24px; width: auto; }
.r-c-brand small { display: block; font-size: var(--r-fs-small); color: var(--r-grey-mute); margin-top: 6px; }
```

Remove the now-unused `.r-cv-brand b` and `.r-c-brand b` rules. The rest of `report.css` stays as it is.

- [ ] **Step 5: Run the guard and the fit check**

Run: `npx vitest run lib/__tests__/reportStyleGuard.test.js`
Expected: PASS (no literal colours or sizes were introduced).

Start the gate-open server (preview config `estates-ai-tool-open`), then run: `node scripts/check-report-fit.mjs http://localhost:3000 --pdf "%TEMP%/projento-fit"`
Expected: every fixture passes, Scope is on page 3 and Next Steps is last. Open the exported cover and page 2 PDFs and compare them with `KIT/mockups/report-cover.png` and `report-interior.png`.

- [ ] **Step 6: Commit**

```bash
git add app/report/doc
git commit -m "Report pages: Projento cover lockup, footer band, running header and footer"
```

---

### Task 3: Word report

**Files:**
- Create: `lib/docx/brandImages.js`
- Modify: `lib/docx/primitives.js` (`t()`, new `img()`), `lib/docx/pages.js:46-47,92-93,345-351`, `lib/reportBuilder.js:21-43,77-79`, `next.config.ts:13-16`
- Test: `lib/__tests__/reportDocx.test.js`

**Interfaces:**
- Produces: `brandImages()` → `Promise<{ wordmarkWhite: Buffer, lockup: Buffer }>`; `img(data, width, height, alt)` → `ImageRun`; `t(text, { …, tracking })`, where `tracking` is a letter-spacing in twips. `ctx.logos` is set in `buildReport` and read by `P.coverPage` and `P.lastPage`.

- [ ] **Step 1: Write the failing tests.** Append to `reportDocx.test.js`:

```js
  it('carries the Projento logos as images, the brand properties and the new footer', async () => {
    const zip = await JSZip.loadAsync(await buildReport({ ...sample }))
    const media = Object.keys(zip.files).filter(f => /^word\/media\/.+\.png$/.test(f))
    expect(media.length).toBeGreaterThanOrEqual(2)
    const core = await zip.file('docProps/core.xml').async('string')
    expect(core).toContain('<dc:creator>Projento</dc:creator>')
    expect(core).toMatch(/<dc:title>Projento/)
    const parts = await Promise.all(Object.keys(zip.files).filter(f => /^word\/(document|header\d*|footer\d*)\.xml$/.test(f)).map(f => zip.file(f).async('string')))
    const text = parts.join(' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(text).toContain('Feasibility reporting for capital projects')
    expect(text).toContain('PROJENTO')
    expect(text).not.toMatch(/Estates AI|estates-ai|Smarter|Better insights/i)
    expect(text).not.toMatch(/\bAI\b/)
    const headers = await Promise.all(Object.keys(zip.files).filter(f => /^word\/header\d*\.xml$/.test(f)).map(f => zip.file(f).async('string')))
    expect(headers.some(h => h.includes('<pic:pic'))).toBe(true)
  })
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run lib/__tests__/reportDocx.test.js`
Expected: FAIL (the builder still reads `BRAND.mark`, and there are no media parts).

- [ ] **Step 3: Create `lib/docx/brandImages.js`**

```js
/**
 * lib/docx/brandImages.js — the Projento PNGs placed in every Word report
 * (docx needs raster images). Read from assets/brand, which next.config.ts
 * traces into the docx-building routes; public/ is not guaranteed to be on a
 * Vercel function's filesystem. The 1600/1200 px exports stay sharp at the
 * 140 × 35 and 82 × 20 px they are placed at.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const DIR = path.join(process.cwd(), 'assets', 'brand')
let cached = null

export function brandImages() {
  cached ??= Promise.all([
    readFile(path.join(DIR, 'projento-wordmark-white-1600.png')),
    readFile(path.join(DIR, 'projento-header-lockup-1200.png')),
  ]).then(([wordmarkWhite, lockup]) => ({ wordmarkWhite, lockup }))
    .catch(e => { cached = null; throw e })
  return cached
}
```

- [ ] **Step 4: Primitives.** In `lib/docx/primitives.js`, add `ImageRun` to the `docx` import. Give `t()` a `tracking` option: add it to the destructured options and add `...(tracking ? { characterSpacing: tracking } : {}),` inside `new TextRun({ … })`. Then add:

```js
/** An inline logo. width/height in CSS px (docx's transformation unit). */
export function img(data, width, height, alt) {
  return new ImageRun({ type: 'png', data, transformation: { width, height }, altText: { name: alt, title: alt, description: alt } })
}
```

- [ ] **Step 5: Cover and last page.** In `lib/docx/pages.js`, add `img` to the primitives import and `import { LOGOS, logoWidth } from '../brand.js'`. Replace lines 46–47 with:

```js
    p(img(ctx.logos.wordmarkWhite, logoWidth(LOGOS.wordmarkWhite, 35), 35, BRAND.name), { before: 640, after: 0 }),
    p(t(BRAND.tagline.toUpperCase(), { color: COLOURS.onNavyTagline, size: COVER_TYPE.tagline, tracking: Math.round(COVER_TYPE.tagline * 0.32 * 20) }), { before: 135, after: 1500 }),
```

(`before: 135` twips = 9 px. The 0.32em tracking is converted to twips as pt × 0.32 × 20.) Replace lines 92–93 with:

```js
      t(`${BRAND.name.toUpperCase()}   |   FEASIBILITY REPORT`, { size: COVER_TYPE.foot, color: COLOURS.onNavy }),
      t(`\tRef ${ctx.reference} · ${ctx.dateLong}`, { size: COVER_TYPE.note, color: COLOURS.onNavy }),
```

In `lastPage`, replace the two brand paragraphs (345–346) with:

```js
      p(img(ctx.logos.lockup, logoWidth(LOGOS.lockup, 24), 24, BRAND.name), { after: 80 }),
      p(t(BRAND.descriptor, { size: TYPE.small, color: COLOURS.greyMute }), { after: 0 }),
```

and the contact table rows (351) with:

```js
      table({ widths: [0.22, 0.78], width: w - 500, rows: [['Email', BRAND.email], ['Telephone', BRAND.phone], ['Web', BRAND.siteUrl]].filter(([, v]) => v).map(([k, v]) => kv(k, v)) }),
```

- [ ] **Step 6: Header, footer, properties.** In `lib/reportBuilder.js`, add `img` to the primitives import and import `brandImages` from `./docx/brandImages.js` and `LOGOS, logoWidth` from `./brand.js`. Change `header(ctx)` so its children are:

```js
    children: [
      img(ctx.logos.lockup, logoWidth(LOGOS.lockup, 20), 20, BRAND.name),
      t(` · ${ctx.short}`, { size: TYPE.small, color: COLOURS.greyMute }),
      t(`\tFeasibility Report · Ref ${ctx.reference}`, { size: TYPE.small, color: COLOURS.greyMute }),
    ],
```

and `footer()` so they are:

```js
      t(BRAND.name, { semi: true, color: COLOURS.navy, size: TYPE.small }),
      t(` · ${BRAND.descriptor}${BRAND.siteUrl ? ` · ${BRAND.siteUrl}` : ''} · Indicative only\tPage `, { size: TYPE.small, color: COLOURS.greyMute }),
      ...pageNumberRuns(),
```

In `buildReport`, add `logos: await brandImages(),` to `ctx`, and replace the document properties with:

```js
    creator: BRAND.name,
    lastModifiedBy: BRAND.name,
    title: `${BRAND.name} feasibility report — ${data.answers?.q1_0_projectName || 'Project'}`,
    subject: 'RIBA Stage 0–1 feasibility report',
```

- [ ] **Step 7: Trace the PNGs.** In `next.config.ts`, change the two docx entries to:

```ts
    '/api/reports/*/docx': ['./assets/fonts/**/*', './assets/brand/**/*'],
    '/api/generate-report': ['./assets/fonts/**/*', './assets/brand/**/*'],
```

Update the comment above them to say it covers the logo PNGs too.

- [ ] **Step 8: Run the Word tests and the guard**

Run: `npx vitest run lib/__tests__/reportDocx.test.js lib/__tests__/reportStyleGuard.test.js`
Expected: PASS.

- [ ] **Step 9: Open the file in real Word** (see CLAUDE.md "Check a change in real Word"). Build the sample to a file with a one-off node script that calls `buildReport(sample)`, then use PowerShell with Word COM: `Documents.Open` → `ComputeStatistics(2)` for the page count (it should equal the current count) → `SaveAs(<pdf>, 17)`. Check in the PDF that the logos are sharp, the header lockup is on every body page, and the cover matches the mockup.

- [ ] **Step 10: Commit**

```bash
git add lib/docx lib/reportBuilder.js next.config.ts lib/__tests__/reportDocx.test.js
git commit -m "Word report: Projento logos as PNG images, brand properties, new footer"
```

---

### Task 4: PDF image wait and download filenames

**Files:**
- Modify: `app/api/report-pdf/[id]/route.js:108-124`, `app/api/reports/[id]/docx/route.js:32-37`, `app/report/ReportRenderer.jsx:96,121`

**Interfaces:**
- Consumes: `reportFileName(ref, ext)` from `@/lib/brand`; `reportReference(reportId, data)` from `@/lib/reportContent`.

- [ ] **Step 1: Wait for the logos before printing.** After `await page.evaluate(() => document.fonts.ready)`, add:

```js
    // The logos are <img> SVGs: wait until each has decoded, and refuse to
    // print a report with a missing logo rather than ship a broken cover.
    const missing = await page.evaluate(async () => {
      const imgs = [...document.querySelectorAll('.r-page img')]
      await Promise.all(imgs.map(i => i.decode().catch(() => {})))
      return imgs.filter(i => !i.naturalWidth).map(i => i.getAttribute('src'))
    })
    if (missing.length) throw new Error(`logo image failed to load: ${missing.join(', ')}`)
```

(The existing catch returns `detail` with the reason, so a failure is visible and not silent.)

- [ ] **Step 2: Filenames.** In both API routes, replace the `safeName` line and the filename with:

```js
    const fileName = reportFileName(reportReference(id, data), 'pdf')   // 'docx' in the docx route
    …
        'Content-Disposition': `attachment; filename="${fileName}"`,
```

and add the imports `import { reportFileName } from '@/lib/brand'` and `import { reportReference } from '@/lib/reportContent'`. In `ReportRenderer.jsx`, import both and set:

```js
      a.download = reportFileName(reportReference(reportId, data), 'docx')   // line 96
      a.download = reportFileName(reportReference(reportId, data), 'pdf')    // line 121
```

Confirm that `lib/reportContent.js` has no node-only import before importing it into the client component (it is already imported by `app/report/doc/*`, so it is client-safe).

- [ ] **Step 3: Verify**

Run: `npm test` (every test should now pass) and `npm run build`.
Expected: PASS and a clean build.

- [ ] **Step 4: Commit**

```bash
git add app/api/report-pdf app/api/reports app/report/ReportRenderer.jsx
git commit -m "PDF waits for the logos; downloads named Projento-Feasibility-Report-<ref>"
```

---

### Task 5: Web app, logo and name

**Files:**
- Create: `app/components/Logo.jsx`
- Modify: `app/globals.css` (append), `app/layout.tsx:27-31`, `app/page.jsx:97-107,113`, `app/access/page.jsx:71-77`, `app/admin/page.jsx:92-95`, `app/questionnaire/page.jsx:1013-1016`, `app/privacy/page.jsx:60-61,73,78,226`, `app/terms/page.jsx:33-34,51,165`, `app/report/ReportRenderer.jsx:157`

**Interfaces:**
- Produces: `<Logo variant="navy" | "white" | "lockup" | "monogram" height={number} compactBelow360={boolean} />`, which renders `<img alt="Projento" width height>`. With `compactBelow360`, it also renders the monogram and lets CSS pick one of the two.

- [ ] **Step 1: Create `app/components/Logo.jsx`**

```jsx
import { BRAND, LOGOS, logoWidth } from '@/lib/brand'

const VARIANT = { navy: LOGOS.wordmarkNavy, white: LOGOS.wordmarkWhite, lockup: LOGOS.lockup, monogram: LOGOS.monogram }

/* eslint-disable @next/next/no-img-element -- static SVG logo; next/image adds nothing for SVG */
export default function Logo({ variant = 'navy', height = 24, compactBelow360 = false }) {
  const logo = VARIANT[variant]
  const full = <img src={logo.src} alt={BRAND.name} width={logoWidth(logo, height)} height={height} className={compactBelow360 ? 'brand-full' : undefined} style={{ display: 'block' }} />
  if (!compactBelow360) return full
  return (
    <>
      {full}
      <img src={LOGOS.monogram.src} alt={BRAND.name} width={height} height={height} className="brand-compact" />
    </>
  )
}
```

(Only one of the two images is displayed at any width. The hidden one is `display: none`, which removes it from the accessibility tree, so a screen reader announces "Projento" once.)

- [ ] **Step 2: CSS.** Append to `app/globals.css`:

```css
/* Projento logo: the monogram replaces the wordmark on very narrow phones (BRAND.md). */
.brand-compact { display: none; }
@media (max-width: 359px) { .brand-full { display: none !important; } .brand-compact { display: block; } }
```

- [ ] **Step 3: Replace every brand block**

| Place | Replace | With |
|---|---|---|
| `app/page.jsx` `Brand()` | the "AI" tile + "Estates AI" span | `<Logo variant="navy" height={26} compactBelow360 />` |
| `app/page.jsx` footer | `ESTATES AI · RIBA STAGE 0–1` | `{BRAND.name.toUpperCase()} · {BRAND.tagline.toUpperCase()}` |
| `app/access/page.jsx` | the tile + span | `<Logo variant="navy" height={28} />` |
| `app/admin/page.jsx` | the tile + span (keep the Admin badge) | `<Logo variant="navy" height={24} />` |
| `app/questionnaire/page.jsx` header (navy) | the tile + span inside the `<a href="/">` | `<Logo variant="white" height={24} compactBelow360 />`, and add `aria-label="Projento home"` to the `<a>` |
| `app/privacy/page.jsx`, `app/terms/page.jsx` headers (dark) | the tile + "Estates AI Tool" | `<Logo variant="white" height={24} />` |
| privacy/terms body text | "Estates AI Tool" (privacy 73, 78, 226; terms 51, 165; the header comments at line 3) | `{BRAND.name}` or "Projento" |
| `ReportRenderer.jsx:157` | `'Estates AI — Sample Report'` / `'… Report Preview'` | `` `${BRAND.name} — Sample Report` `` / `` `${BRAND.name} — Report Preview` `` |

Import `Logo` from `@/app/components/Logo` (or the relative path those files already use for `./components/ui`) and `BRAND` from `@/lib/brand` where the text needs it. `app/error.jsx`, `app/not-found.tsx` and `app/global-error.tsx` carry no brand today. Check them with `grep -n "Estates" app/error.jsx app/not-found.tsx app/global-error.tsx` and leave them unchanged if the grep is empty. (`global-error.tsx` deliberately depends on nothing, per its own comment.)

- [ ] **Step 4: Metadata.** In `app/layout.tsx`, add `import { BRAND } from "@/lib/brand";` and:

```ts
const DESCRIPTION =
  "RIBA Stage 0–1 feasibility reports in minutes: an NRM1 order-of-cost estimate, RIBA programme and risk register, with every figure calculated from benchmark data.";

export const metadata: Metadata = {
  title: `${BRAND.name} — RIBA Stage 0–1 Feasibility Reports`,
  description: DESCRIPTION,
  applicationName: BRAND.name,
  openGraph: { title: `${BRAND.name} — ${BRAND.tagline}`, description: DESCRIPTION, siteName: BRAND.name, type: "website", locale: "en_GB" },
};
```

(No `url` and no OG image: both need `metadataBase`, which waits for `siteUrl`. Next serves `app/icon.svg`, `app/apple-icon.png` and `app/favicon.ico` without any metadata entry.)

- [ ] **Step 5: Verify**

Run: `npm run build` and `npm run lint` (the error count must be no higher than on `main`; record both counts).
Then, in the `estates-ai-tool-open` preview: load `/`, `/access`, `/questionnaire`, `/privacy`, `/terms`, `/admin` and `/sample`. `read_page` must show an `img` named "Projento" on each and no text "Estates AI". Check the tab favicon. `resize_window` to 320 × 800 and check that the questionnaire and landing headers show the monogram with no horizontal scroll (`document.documentElement.scrollWidth <= 320`). Take a screenshot for the user.

- [ ] **Step 6: Commit**

```bash
git add app lib/brand.js
git commit -m "Web app: Projento logo, name, tagline and metadata"
```

---

### Task 6: Remove "AI-generated" wording

**Files:**
- Modify: `app/page.jsx:60,115`, `app/questionnaire/page.jsx:998,1672,1712`, `app/report/ReportRenderer.jsx:206`, `app/terms/page.jsx:119,131`, `app/privacy/page.jsx:96,100,135-136`, `lib/reportShared.js:204`, `lib/prose.js` (`proseShapeProblems`)
- Create: `lib/__tests__/brandCopy.test.js`
- Test: `lib/__tests__/proseShape.test.js`, `lib/__tests__/reportV52.test.js`

- [ ] **Step 1: Write the failing scan test**, `lib/__tests__/brandCopy.test.js`

```js
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// User-facing source must not carry the old brand, and must not present the
// product or its reports as AI-generated. Storage keys (estatesAI_…) and
// comments are allowed; see CLAUDE.md "Do not rename".
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const walk = d => fs.readdirSync(path.join(ROOT, d)).flatMap(f => {
  const rel = path.join(d, f)
  return fs.statSync(path.join(ROOT, rel)).isDirectory() ? walk(rel) : [rel.replace(/\\/g, '/')]
})
const FILES = [...walk('app'), ...walk('lib/docx'), 'lib/reportBuilder.js', 'lib/reportShared.js', 'lib/reportContent.js', 'lib/brand.js']
  .filter(f => /\.(jsx?|tsx?|css)$/.test(f))
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const OLD_BRAND = /Estates AI|estates-ai-tool\.vercel\.app|Smarter (property )?decisions|Better insights/i
const AI_CLAIM = /AI[- ](narrative|generated|invented|written)|written by AI|generated by AI|the AI (never|writes)|>AI</i

describe('brand copy', () => {
  for (const f of FILES) {
    it(`${f} has no old brand name or AI-generated claim`, () => {
      const src = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'))
      expect(src.match(OLD_BRAND)?.[0], f).toBeUndefined()
      expect(src.match(AI_CLAIM)?.[0], f).toBeUndefined()
    })
  }
})
```

- [ ] **Step 2: Run it and confirm it fails on the copy listed below**

Run: `npx vitest run lib/__tests__/brandCopy.test.js`
Expected: FAIL on `app/page.jsx`, `app/questionnaire/page.jsx`, `app/report/ReportRenderer.jsx` and `app/privacy/page.jsx` (plus anything Task 5 missed).

- [ ] **Step 3: Reword**

| File:line | Now | New |
|---|---|---|
| `app/page.jsx:60` | `<Stat value="0" label="AI-invented figures" />` | `<Stat value="100%" label="Figures traced to benchmark data" />` |
| `app/page.jsx:115` | "…all calculations deterministic, no figures generated by AI." | "…every calculation deterministic and traceable to its source." |
| `app/questionnaire/page.jsx:998` | "…benchmark data — the AI never invents a figure. This usually…" | "…benchmark data, and every figure in the report traces back to it. This usually…" |
| `app/questionnaire/page.jsx:1672` | "…requirements for the AI narrative." | "…requirements for the report's written sections." |
| `app/questionnaire/page.jsx:1712` | "…benchmark data. The AI writes prose only — it never invents a number." | "…benchmark data. Every number in the report comes from that calculation." |
| `ReportRenderer.jsx:206` | "…workbooks, the narrative written by AI around those fixed figures." | "…workbooks, and the written sections built around those fixed figures." |
| `app/terms/page.jsx:119` | "or AI provider downtime;" | "or third-party service downtime;" |
| `app/terms/page.jsx:131` | "The underlying software, cost model, and AI prompts remain proprietary." | "The underlying software, cost model and report templates remain proprietary." |
| `app/privacy/page.jsx:96` | "…passed to the AI model to generate the report narrative." | "…passed to our text-drafting service provider (see §5) to draft the report's written sections." |
| `app/privacy/page.jsx:100` | "…risk register, AI narrative, report ID" | "…risk register, written sections, report ID" |
| `app/privacy/page.jsx:135` | "Anthropic PBC — AI narrative generation" | "Anthropic PBC — drafting of the report's written sections" |
| `lib/reportShared.js:204` | 'use a rate marked "AI estimate – verify" in the NRM1 workbook' | 'use a rate still to be verified in the rate library' |

**Kept on purpose:** the privacy page still names Anthropic and says the questionnaire answers are sent to it (line 136 is unchanged apart from its wording). UK GDPR Articles 13–14 require a privacy notice to name the recipients of the data, so this disclosure is not removed. It sits in the legal notice, not in the product or the report. The admin-only label "AI API key" (`app/admin/page.jsx:18`) is an internal health-check label and stays. The workbook's own price-source text "AI estimate – verify" and the code's `aiEstimate` flag are data keys and stay. The report prints them as "†" / "unverified rate".

Check the section reference "§5" against the privacy page's actual heading numbers before writing it.

- [ ] **Step 4: Guard the model's wording (no prompt change).** Write the failing test first, in `proseShape.test.js`:

```js
  it('rejects prose that describes the report as AI-generated', () => {
    const p = proseShapeProblems({ executiveSummary: 'This AI-generated report estimates …' }, ['executiveSummary'])
    expect(p.some(x => /AI/.test(x))).toBe(true)
    const ok = proseShapeProblems({ executiveSummary: 'A new AI research lab of 900 m² …' }, ['executiveSummary'])
    expect(ok.some(x => /describe/.test(x))).toBe(false)
  })
```

Then, in `lib/prose.js`, just above `proseShapeProblems`:

```js
// The report is sold on its figures being calculated; its text must never
// present the report as machine-written. Narrow on purpose: a project that is
// itself about AI (an AI lab, a data centre) can still be described.
const SELF_DESCRIPTION = /\b(AI|artificial intelligence|language model)[- ](generated|written|produced|drafted)\b|\b(generated|written|produced|drafted) by (an? )?(AI|artificial intelligence|language model)\b/i
```

and at the end of the `for (const f of fields)` loop body, before the `typeof v === 'string'` branch:

```js
    const texts = typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(i => (typeof i === 'string' ? [i] : Object.values(i || {}).filter(x => typeof x === 'string'))) : []
    if (texts.some(s => SELF_DESCRIPTION.test(s))) problems.push(`${f} must not describe the report as AI-generated`)
```

(This goes through the existing retry loop, and on the last attempt the payload is kept, as for every shape rule. A report is never lost to it.)

- [ ] **Step 5: Run everything**

Run: `npm test`
Expected: PASS. If `reportV52.test.js` pins the old `unverifiedRatesSentence` text, update its expectation to the new wording.

- [ ] **Step 6: Commit**

```bash
git add app lib/reportShared.js lib/prose.js lib/__tests__
git commit -m "Remove AI-generated wording from the site and reports"
```

---

### Task 7: Docs, cleanup and the brand kit move

**Files:**
- Delete: `public/report-template.html`, `Documents/projento-brand-kit/`
- Create: `docs/brand/BRAND.md`, `docs/brand/mockups/*`
- Modify: `README.md:1`, `CLAUDE.md`

- [ ] **Step 1: Confirm nothing references the old page, then delete it**

```bash
git grep -n "report-template" -- ':!docs/**' ':!test-reports/**'
git rm public/report-template.html
```

Expected: the grep prints nothing (it was checked during planning).

- [ ] **Step 2: Move the brand spec, then delete the kit**

```bash
mkdir -p docs/brand && cp "Documents/projento-brand-kit/projento-brand-kit/BRAND.md" docs/brand/ && cp -r "Documents/projento-brand-kit/projento-brand-kit/mockups" docs/brand/
```

In `docs/brand/BRAND.md`, change the relative paths (`logo/…`, `png/…`, `icons/…`) to the new homes (`public/brand/…`, `assets/brand/…`, `app/…`). In the mockup HTML, change `../logo/` to `../../../public/brand/`. Then check every asset is in place before deleting: `ls public/brand assets/brand app/icon.svg app/apple-icon.png docs/brand/mockups` must list them all. The kit folder is untracked, so this delete cannot be undone through git. Its only unique content is the two single-colour wordmarks and `CLAUDE_CODE_PROMPT.txt` (a copy is in Downloads), so first copy `projento-wordmark-black.svg` and `projento-wordmark-mono-white.svg` into `docs/brand/print/`. Then:

```bash
rm -r "Documents/projento-brand-kit"
```

- [ ] **Step 3: README.** Change line 1 to `# Projento` followed by a line: `The repository, package, Vercel project and storage keys keep the old estates-ai-tool name on purpose; see CLAUDE.md "Brand".`

- [ ] **Step 4: CLAUDE.md.** Make three changes:
  1. In "What this app does", name the product: "**Projento** (formerly "Estates AI")".
  2. Add a `## Brand` section after "Report output": the brand rules are in `docs/brand/BRAND.md`; every brand string is in `lib/brand.js` (`BRAND`, `LOGOS`, `reportFileName`); `siteUrl` is null until the domain is bought and adding it is a one-line change; the SVGs are in `public/brand`; the Word PNGs are in `assets/brand` (traced by `next.config.ts`); the icons follow the `app/` file conventions; the PDF route refuses to print when a logo fails to load; `brandCopy.test.js` and the prose `SELF_DESCRIPTION` guard keep "AI-generated" wording out.
  3. Add a **Do not rename** list, copying the Global Constraints list above verbatim.

  Also replace the "Report design system" paragraph's reference to `BRAND` placeholders in `lib/reportStyle.js` with `lib/brand.js`, and note that email is null and phone is still a placeholder.

- [ ] **Step 5: Commit**

```bash
git add -A docs/brand README.md CLAUDE.md public/report-template.html
git commit -m "Move the brand spec to docs/brand, document the rebrand, drop the old template page"
```

---

### Task 8: Verify, push and report back

- [ ] **Step 1: Full gate.** Run `npm run build`, `npm run lint` and `npm test`. Record the results (lint: the error count compared with `main`).
- [ ] **Step 2: Local end to end.** In the `estates-ai-tool-open` preview, generate one report through the questionnaire (no KV locally, so the report is returned inline). Check the screen report against both mockups, and download the `.docx`; its name must be `Projento-Feasibility-Report-DRAFT.docx`. Open it through Word COM: the page count must be unchanged, the header must appear on every body page, and the logos must be sharp at 200% zoom. The local PDF export needs KV, so the PDF is checked with `check-report-fit.mjs --pdf` (Task 2) and on the preview (Step 4).
- [ ] **Step 3: Search the repo, and list every remaining hit with its reason**

```bash
git grep -n -i -E "Estates AI|EstatesAI|estates-ai-tool\.vercel\.app|Smarter decisions|Better insights"
```

Expected remaining hits: the storage keys `estatesAI_v4_answers` / `estatesAI_result` / `estatesAI_report` (these must not be renamed); `Documents/*.md` and `docs/**` historical specs; `test-reports/**` (historical run records); `scripts/build-*-review.cjs` and `build-question-scope-map.mjs` (dated review documents); the Sentry project `estates-ai-tool`; and CLAUDE.md's "formerly" line and do-not-rename list. Anything else gets fixed.
- [ ] **Step 4: Push and preview.** `git push -u origin rebrand-projento` (per memory, a push can report exit 128 and still succeed, so check with `git ls-remote origin rebrand-projento` before retrying). Do not open a PR and do not merge. Find the preview URL with `gh api repos/MNKayali/estates-ai-tool/deployments?ref=rebrand-projento` (or the Vercel bot status on the commit: `gh api repos/MNKayali/estates-ai-tool/commits/<sha>/statuses`). On the preview (the user types the access code): generate a report, download the PDF and the `.docx`, and render page 1 and page 2 of the PDF to PNG for the user.
- [ ] **Step 5: Hand-off message.** Include the preview URL, the list of changed files (`git diff --stat main...rebrand-projento`), the cover and page 2 screenshots, the remaining-hits list with reasons, and the open decisions below.

## Decisions to confirm with the user (defaults are in the plan)

1. **Contact card on the last page.** The old placeholder email carried the old name (`@estates-ai.example`), so it is set to `null` and hidden. The phone number `0121 000 0000` is still a placeholder and still prints. Real contact details are needed before any client sees a report.
2. **Privacy notice.** It keeps naming Anthropic as the provider that drafts the written sections (a UK GDPR requirement). Only the "AI narrative" wording is neutralised.
3. **Prose guard.** This is a code check, not a prompt change. A model sentence that calls the report AI-generated is sent back through the existing retry loop.
