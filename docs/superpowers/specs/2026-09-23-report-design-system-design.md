# Report design system — design

*23–24 September 2026. Agreed in a brainstorming session with visual mockups. **The approved template is [`2026-09-24-report-template-approved.html`](2026-09-24-report-template-approved.html)** (also published as a private preview, https://claude.ai/artifact/VyMCNPN5gj4bn22Y6TbL6Z, version 4). Where this text and that file differ on a visual detail, the file wins.*

## Goal

Make every generated report look professional, read easily, and look **identical** on screen, in the PDF and in the Word file, with that consistency enforced by code rather than by care. This is a restyle of the report, not a redesign of the app.

### In scope

- The report's look: typeface, cover, table style, spacing, page breaks.
- One shared style specification that all three outputs read from.
- The layout faults found in the 23 Sep review of a production report (clipped and squeezed tables, half-empty pages, the white strip on the cover, missing list markers, the mislabelled programme float, the off-brand blue header rule).
- The wording and number fixes listed under "Wording and numbers".
- A hint on Q1.0 (project title) so cover titles are meaningful.

### Out of scope, unchanged

- Every calculation, workbook and engine (cost, programme, sense check).
- The AI step, its prompts and its cost per report. The design is applied after the prose exists.
- The report's content, section order and section headings.
- The questionnaire and the marketing site. Aligning the website to the same fonts and tokens is **phase 2**, a separate plan.

## Decisions taken

| Question | Decision |
|---|---|
| Typeface | **IBM Plex Sans** for everything, **IBM Plex Mono** for codes and references, with lining tabular numerals everywhere. Playfair Display and DM Sans leave the report. |
| Inside pages | "Branded but light on ink". Navy appears as lines, text and pale tints, never as solid table fills. |
| Cover | The user's mockup combined with the "quiet professional" figures and facts; the drawing panel and gold angled accents removed. Spec below. |
| Cover title | Keep the user's Q1.0 text; guide it in the form (live preview and short-title warning). The subtitle line is always built from the answers. No AI cost. |
| Word file | Identical to the PDF. IBM Plex is **embedded** in every `.docx` (roughly +0.5–1 MB per file). |
| Wording fixes | Included in this project. |
| Architecture | **A:** one shared style spec, two renderers (HTML for screen and PDF, `docx` for Word), with a guard test. Rejected: HTML→Word conversion (lossy) and Word→PDF via LibreOffice (not hostable on Vercel Hobby). |

## 1. Structure

### `lib/reportStyle.js` (new; pure data, no React, no node-only imports)

This is the single source for the report's look. It is imported by `app/report/ReportRenderer.jsx` (client) and `lib/reportBuilder.js` (server), so it must stay dependency-free, like `lib/reportShared.js`.

**Type scale, in points (body pages)**

| Token | pt | Weight | Use |
|---|---|---|---|
| `sectionTitle` | 16 | 600 | the title in the section band |
| `subHeading` | 11.5 | 600 | "Key Findings", "Estimate Basis" |
| `body` | 10 | 400 | paragraphs, list items (line-height 1.45) |
| `table` | 9.5 | 400 / 600 / 700 | table cells, headers, totals |
| `small` | 8 | 400 | labels, footnotes, running header and footer |
| `statFigure` | 14 | 600 | figures in the page-2 stat strip |

No other sizes are allowed on body pages. The cover has its own fixed set (below).

**Colours**

| Token | Hex | Use |
|---|---|---|
| `navy` | `#1A2E4A` | headings, table header text, rules, totals |
| `navyDeep` | `#10203A` | end of the cover gradient |
| `navyMid` | `#1C3354` | start of the cover gradient, footer band |
| `amberRule` | `#C4861A` | rules, section bar, group-row edge |
| `amberOnDark` | `#D9A12E` | amber on navy (cover mark, eyebrow, rule) |
| `amberText` | `#9D6B15` | amber text on white (AA contrast) |
| `ink` | `#22262F` | body text |
| `grey` | `#555B69` | secondary text |
| `greyMute` | `#6D7182` | labels, captions (AA on white) |
| `rule` | `#E2DED4` | row separators |
| `tintHead` | `#EAEFF5` | table header and total-row fill |
| `tintGroup` | `#F6F3EC` | group-row fill |
| `ragHigh` / `ragMed` / `ragLow` | `#B42318` / `#B54708` / `#2E7D32` | risk rating pills: white text on the fill (each ≥ 4.5:1), always with the word |
| `pass` | `#2E7D32` | text for a genuine pass only (e.g. budget sufficient), ≥ 4.5:1 on white |

**Spacing:** A4, side margins 15 mm (56 px on the 794 px page), running header at 8 mm, running footer at 7 mm from the bottom. The content fills the full width between the margins; no extra inner padding in print. Also fixed here: the section gap, the paragraph gap and the table cell padding (4 pt × 5 pt).

**Table recipes (column widths as fractions of the content width)**

- Works cost lines: Code 0.09 · Element 0.43 · Qty 0.12 · Basis 0.12 · Low 0.12 · High 0.12.
- Risk register: Ref 0.08 · Category 0.13 · Description 0.36 · Rating 0.11 · Mitigation 0.32.
- Programme detail: Stage 0.21 · Activity 0.45 · Start 0.13 · End 0.13 · Weeks 0.08.
- Project cost (page 2 of the estimate): Item 0.46 · Rate 0.24 · Low 0.15 · High 0.15.

Header text wraps where it has to (e.g. "Rate low / £ per unit" over two lines); cells never break inside a word; money cells never wrap.

**Numbers:** `money(n)` rounds to the nearest £100 when the project total is under £100,000, and to the nearest £1,000 otherwise. The rule lives here and is used by both renderers, so the report never shows "£3,000 – £3,000" through over-rounding. All figures use `font-variant-numeric: lining-nums tabular-nums` (HTML) and Plex's default lining figures (Word).

### `app/report/ReportRenderer.jsx`

It reads every size, colour and width from `reportStyle`. The print CSS block is generated from the same values. The screen report switches to IBM Plex through `next/font/google`, scoped to the report route.

### `lib/reportBuilder.js`

It reads the same values, converted to Word units (half-points for size, twips for spacing, fractions to DXA widths) by small helpers in `reportStyle`. Fonts are embedded through `docx`'s `Document({ fonts: [...] })` (supported in the pinned 9.6.1). The IBM Plex TTF files (SIL Open Font License, redistributable) are committed under `assets/fonts/` along with the licence text.

### `lib/reportShared.js`

It gains the wording and number rules below, so both renderers print identical text.

### Guard test

`lib/__tests__/reportStyleGuard.test.js` reads every file under `app/report/doc/` and `lib/docx/`, plus `lib/reportBuilder.js` and fails on any raw colour code (`#rgb` / `#rrggbb`), any numeric `fontSize` / `size:` literal, or any font-family string other than through `reportStyle`. The report document lives in `app/report/doc/`; screen-only chrome (toolbar, alerts, compare panel, feedback modal) stays in `ReportRenderer.jsx`, outside the guard, because it is not part of the report of record.

## 2. Page layout and pagination

- **Running header, running footer and section header:** as specified in section 8 (brand on every page, page-wide section band). The off-brand `#2E75B6` rule is removed.
- **Page 2:** the stat strip (total cost, programme, BCIS region) in the new style, then the Executive Summary. The stat-strip cost figure stays on one line.
- **Tables:** each section is sized to fit its page (section 8); only Appendix A may run over several pages, and there the header row repeats (`<thead>` / Word `tableHeader`). Rows never split, and a total row stays with the row above it.
- **Lists:** bullets for findings and assumptions, numbers for next steps. The `display:flex` list style that removed the markers goes.
- **Programme bar:** see section 8. Float gets its own hatched segment and key entry instead of falling through to "Design & Approvals".
- **Status colour:** `pass` green only for a genuine pass. Neutral notes (e.g. "No target completion date has been specified") use `grey`.
- **Risk ratings:** pills in `ragHigh` / `ragMed` / `ragLow`, always with the word, so they survive black-and-white printing.

## 3. Cover (approved: `cover-mix-v3.html`)

The cover always fills exactly one A4 page, 210 × 297 mm, with 16.5 mm side margins. Proportions follow the mockup: a 460 px page, so 1 px = 0.4565 mm.

1. **Navy header block**, 0–120 mm, gradient `navyMid` → `navyDeep`, straight edges.
   - Brand: a 14 mm `amberOnDark` square with "AI" in white 700; "Estates AI" in Plex 600, 25 pt, white; the tagline "DATA · INSIGHTS · SMARTER DECISIONS" in 7.5 pt, letter-spaced 0.3 em, `#B7C2D3`.
   - Eyebrow: an `amberOnDark` 11 mm dash plus "RIBA STAGE 0–1" (10 pt 600 `amberOnDark`, letter-spaced); below it, indented, "FEASIBILITY REPORT" (10 pt, `#DCE3EC`).
   - Title: the Q1.0 text, Plex 700, 36 pt, white, line-height 1.12, at most 3 lines. Longer titles step down to 30 pt, then truncate with an ellipsis.
   - A short `amberOnDark` rule, 18 × 1.1 mm.
   - Subtitle, built from answers: "Town, postcode district · Building use · N m² GIFA", 14 pt, `#DCE3EC`.
2. **Figures row** on white: three columns (1.45 : 1 : 1), each under a 0.9 mm navy rule. Each has a label (9 pt, letter-spaced, uppercase), a value (22 pt 700 navy, never wrapping) and a note (10 pt `greyMute`):
   - total project cost (excl. VAT)
   - programme (incl. N weeks float)
   - confidence (Grade X, "Moderate · cost risk medium")

   At £1m and above, the cover cost figure uses the compact form "£1.60m – £1.99m" so it stays on one line. Full figures appear everywhere else.
3. **Two fact tables** side by side (1.1 : 1), each with a 0.45 mm navy top rule and hairline rows, 11.5 pt:
   - project type · intervention (only where the type uses one) · specification
   - report date · reference (Plex Mono) · status
4. **Disclaimer line**, 9.5 pt `greyMute`.
5. **Footer band**, 18 mm, navy, straight edges: "ESTATES AI | FEASIBILITY REPORT" (letter-spaced) on the left, the italic "Better insights. Smarter property decisions." on the right.

No photo, no drawing, no icons, no angled accents.

## 4. Wording and numbers

1. **One accuracy statement.** The Estimate Basis states the range width actually used (from ▶ range_widths for the grade) and the general Stage 0–1 caveat, once. The cost-table footnote refers to it instead of quoting ±11% / ±15–25%.
2. **No internal wording in the report.** `procurementSource` text such as "value threshold (no Procurement sheet)" is not printed (it stays in the data for maintainers). Questionnaire numbers ("(Q3.5)", "Q2.3 band factor") are replaced by plain names in deterministic text, and the prose prompt gains a rule not to cite question numbers. That is one line in `AI_SYSTEM_PROMPT` with no token-cost change of note; the existing prose tests must still pass. "RIBA Stage Concept complete (Stage 2)" becomes "RIBA Stage 2 (Concept) complete".
3. **Rounding** per `money()` above.
4. **Ticked but not priced.** "Scope Selected vs Priced" also lists every ticked item in `cost.adjustments` / `excludedNoQuantity`, with its reason ("not available at the chosen level of intervention", "no rate for this project type", "quantity to be confirmed").
5. **Programme float** is labelled as float in the chart and legend.

## 5. Q1.0 guidance

Under the title field the questionnaire shows "Cover title: <text>" as a live preview, plus a soft warning (not a block) when the title has fewer than three words or matches only the town or postcode: "Add the work and building, e.g. 'Refurbishment of Block C, first floor'".

## 6. PDF export

- The server Puppeteer route (`/api/report-pdf/[id]`) is the only PDF path. When it fails, the toolbar shows an error with a retry. It no longer silently falls back to `window.print()`, which produced the off-spec file reviewed on 23 Sep.
- The print CSS is still correct if someone presses Ctrl+P: the same `@page` values, and a cover height of 297 mm under `@page :first { margin: 0 }`.
- Find out why the production export failed for the reviewed report: check the route's error path and Sentry. If a cause is found it gets its own fix.

## 7. Fixed counts and length caps for the AI text

The layout is fixed in code, but the AI's text is not: today only the prompt asks for "2–4 sentences". The sample report has **one** 151-word key finding, where the reviewed production report had five short ones. Reports must also be consistent in shape, so every prose slot gets a fixed count and a word range:

| Slot | Count | Words per item |
|---|---|---|
| `executiveSummary` | 1 | 90–130 |
| `keyFindings` | **exactly 5** | 15–35 |
| `scopeAssumptions` | 3–4 | ≤ 28 (so four fit the half-width column on page 3) |
| `costNarrative` (the 4-line intro above the works table on page 6) | 1 | 45–65 |
| `roiNarrative` (only when the ROI section shows) | 1 | 35–60 |
| `constraints` | 3–5 rows | title ≤ 5, text ≤ 35 |
| `nextSteps` | **exactly 5** | ≤ 40 |
| `riskRegister` | one per deterministic seed (count set by code, not the AI) | description ≤ 30, mitigation ≤ 25 |
| `procurementNarrative` | 1 | 40–70 |
| `procurementConsiderations` | **exactly 3** | ≤ 35 |
| `procurementConflicts` | 0–2 | ≤ 30 |

**Enforcement is in code.** Strict tool schemas can't reliably carry `minItems`/`maxItems`/length limits, so they aren't relied on.

- The counts and ranges live in one table in `lib/proseSchema.js` (`PROSE_LIMITS`), which the field descriptions in both tools are generated from, so the prompt and the check can't disagree.
- `assertProseShape()` in `lib/prose.js` runs next to `assertNoLeakedFigures()` on each half. A count or length outside its range, beyond a ±10% word tolerance, rejects the half. The existing retry loop sends the model the exact problem, e.g. "keyFindings has 1 item; exactly 5 are required".
- If the half is still out of shape after the last retry, the report must still complete. Extra items beyond a maximum are dropped (never words cut mid-sentence), a shortfall or over-length item is accepted as written, and the miss is logged to Sentry with the slot name. A report is never lost to a style rule.
- **Cost:** neutral or slightly lower per report (the caps shorten output). A retry costs one extra call on that half only, which is the same mechanism and cost profile as the number-leak guard.
- **Tests:** unit tests for `assertProseShape()` covering every slot at, inside and outside its limits, and one test pinning the reconciled sample (a 1-item `keyFindings` is rejected with the right message).

## 8. A4 pages everywhere, and a fixed page map

*Decided 24 Sep, replacing the earlier "reflow on phones" idea.* The report is A4 pages in every output. The on-screen report (`/report/[id]`, `/sample`) renders the same 210 × 297 mm pages, scaled to fit the screen width (pinch to zoom on a phone, as with a PDF), so screen, PDF and Word are page-for-page identical.

**Every page from page 2 carries**
- A running header: the brand mark and name, the project's short title, "Feasibility Report · Ref <id>".
- A running footer: the brand name, strapline and web address, "Indicative only", and "Page N of M".

The brand name, mark, strapline and web address live in one `reportStyle.brand` entry. "Estates AI" is a placeholder until the product is renamed; changing that entry changes every page and all three outputs.

**Section header:** a page-wide band. A light navy tint (`tintBand` `#EEF2F7`) spans the full page width, with a 2 pt amber underline, the section number in a small navy block (Plex Mono), the title (`sectionTitle`), and an optional right-aligned note (e.g. "1 of 2 · Works cost").

**Each section starts on a new page.** The fixed page map:

| Page | Content |
|---|---|
| 1 | Cover |
| 2 | Key figures strip, 1 Executive Summary, key findings, budget check |
| 3 | 2 Scope of Works (always page 3) |
| 4 | 3 Risk Register (≤ 10 risks, always one page) |
| 5 | 4 High-Level Programme: milestones, one-line overview, detail table, narrative |
| 6 | 5 Order of Cost Estimate, 1 of 2: a 4-line explanation, then the works cost table |
| 7 | 5 Order of Cost Estimate, 2 of 2: the project cost table, the percentage lines, cost assumptions and exclusions |
| 8 | 6 Financial Case (top half) and 7 Procurement Recommendation (bottom half) |
| 9 | 8 Constraints Summary (a half page; the rest is left clear) |
| 10 | 9 Recommendations and Next Steps, disclaimer, and the **Contact us** block (always the last page) |
| 11+ | Appendix A, only when needed (see below) |

**Sections 6–8 (Financial Case, Procurement, Constraints) share pages in half-page slots.** Two sections share a page: split at the middle when each fits its half; otherwise the second follows directly after the first when both fit the page; otherwise each takes its own page. Heights are estimated by one shared function (`estimateHeight` in `lib/reportContent.js`), so the screen, PDF and Word make the same decision, and the fit check proves the real render fits. With the usual content that is two pages: 6 + 7 on one page, 8 on the next. When Financial Case is omitted (no benefit given), Procurement and Constraints share one page. The half-page height is a `reportStyle` value, and the fit test covers a long procurement narrative (which pushes Procurement to a full page).

**Last page, always Next Steps:** the numbered next steps, the disclaimer, and at the foot of the page a **Contact us** block: brand mark and name, strapline, a line inviting questions quoting the report reference, then email, telephone and web. The contact details live in `reportStyle.brand`, next to the name; the preview shows placeholder values (`enquiries@estates-ai.example`, `0121 000 0000`) until real ones are supplied. Appendix A, when present, follows the last page as an annex.

**Programme page (one page)**
- Key milestones as a two-column list (M1–M6).
- A **single-line overview bar**: segments in proportion to their weeks, labelled inside when wide enough, otherwise with a short duration ("6w"). Below the bar are milestone diamonds with month and year (labels step down a line when two are close), a red dashed client-target line, and a one-line key.
- The detail table: Stage · Activity · Start · End · Weeks. Client-review gateways fold into their stage row ("Concept design, incl. 2-wk client review"), which keeps the table to about 12 rows.
- The 6-line narrative.

The overview bar replaces the multi-row chart shown in version 2 of the preview.

**Cost page 1 of 2:** a 4-line deterministic explanation of what the works table is and how it was priced, then the works table. `Qty` and `Basis` ("estimated" / "client figure") are columns, not sub-lines; † marks unverified rates.

**Cost page 2 of 2**
- The project cost table in the format of the current report's construction/total tables, merged into one: works cost, preliminaries (A), OH&P (B), a construction cost subtotal, fees (C), risk (E), contingency (H), inflation (F), the total project cost row, and VAT for reference. It has a Rate column ("10% of works").
- "How the percentages were set": 5–6 lines, one per allowance, written from the percentage-rule trace in plain words.
- Cost assumptions and cost exclusions, side by side.
- The old "How each percentage was derived" rule table leaves the report. The trace stays in the data, and the admin view can still show it.

**Long scope.** The works page holds about 24 line rows plus their group headings. When a report has more:
- page 6 shows one row per BCIS group (item count, low and high), still totalling to the works cost, and the note "Full line-by-line breakdown in Appendix A"
- Appendix A, at the end, lists every line and may run over several pages, with the table header repeated

This keeps the section page numbers fixed. The threshold is a `reportStyle` value, and the example gate includes a long-scope report to prove it.

**Fit is checked, not assumed.** A render test loads the sample and a worst-case fixture into the page layout and asserts that each section's page content fits its page, with nothing clipped. The worst case is 10 risks at maximum caps, the maximum milestones and programme rows, and a 90-character title.

## 9. Section content (added after the first phone preview, 24 Sep)

Every list below has a fixed maximum, so a report's shape never depends on the project.

**Section 2 — Scope of Works**
- A one-line scope statement, deterministic: project type, level of intervention and GIFA.
- *Included works*: ticked items grouped by BCIS group, in a grid of group blocks (one column on a phone). Quantities the client gave are shown inline, e.g. "Toilets: 18 standard, 3 accessible".
- *Scope assumptions*: 3–4 lines (AI, `scopeAssumptions`, capped as in section 7).
- *Not in scope*: at most 6 lines, deterministic, built from what the priced scope lacks (roof, structure, substructure, external works, loose FF&E) plus decant, most significant first.

**Section 3 — Risk Register (always fits on one A4 page)**
- At most **10 risks**. The seeds are ordered High → Medium → Low, then by seed order; code keeps the first 10. Refs are renumbered R01–R10 in that order, and internal seed codes are never printed.
- Tighter caps than section 7 for this table: description ≤ 25 words, mitigation ≤ 20 words.
- RAG made prominent:
  - a count summary above the table ("3 High · 5 Medium · 0 Low", in coloured badges)
  - a 5 pt coloured edge on each row
  - a solid, full-width rating badge with the word in capitals
  - High rows lightly tinted

  On a phone, each risk becomes a card with a coloured left edge.
- A regression check at the example gate: a 10-risk register at the maximum caps fits on one page in the PDF and in Word.
- Separate bug: the sample's seeds produce the heat-pump DNO risk twice (`SCOPE-S-0039-1` and `R09`). Seeds are de-duplicated by item and topic before the cap.

**Section 4 — Programme**
- A headline line: total weeks, best case plus float, procurement route.
- *Key milestones*: **5–6 rows**, deterministic, taken from the programme's stage boundaries: project start, design complete, start on site, practical completion (per phase where phased, at most 2), programme complete including float. Each row shows M-number, milestone, date and week. A missed client target is flagged in red on the final row.
- *Programme overview*: the single-line bar described in section 8 (superseding the multi-row chart shown in preview version 2).
- *Programme narrative and assumptions*: **5–6 lines**, deterministic, selected by fixed priority from what the programme engine already knows:
  1. start date and design stage reached
  2. gateways and governance on the critical path
  3. procurement route and tender length
  4. construction phasing, occupation and access uplifts
  5. float and best case
  6. planning or building-control position

  The existing long programme-assumption list moves to the programme detail table's notes, and stays in the data.
- *Programme detail*: the existing stage table, unchanged in content.

**Section 5 — Order of Cost Estimate**
- After the works table and the percentage build-up, two side-by-side lists (stacked on a phone):
  - *Cost assumptions*: **5–6 lines**, deterministic, selected by priority: rate basis and location factor; estimated-quantity basis; client-given quantities; specification and level; inflation period; unverified-rate (†) note.
  - *Cost exclusions*: **5–6 lines**, deterministic: VAT, loose FF&E/AV, decant, land/legal/statutory, asbestos beyond the allowance, unforeseen ground or structural conditions. Project-specific exclusions take priority over generic ones.

None of these sections adds AI cost: milestones, the programme narrative and the cost lists are deterministic text in `lib/reportShared.js`, shared by both renderers.

## 10. Testing and the example gate

- **Unit (Vitest):**
  - the guard test
  - `money()` rounding boundaries
  - the accuracy statement, the no-question-number rule and the "ticked but not priced" lines in `reportShared`
  - a `.docx` smoke test: the generated file contains embedded font parts and no Arial or Playfair runs
  - all existing report tests (`reportV52.test.js` etc.) still pass.
- **Example gates: approval required before finalising.** Gate 1 covers screen and PDF (before any Word work); gate 2 covers Word. Once the style spec and the HTML renderer are done, render the sample report (`public/sample/report.json`) and one freshly generated report to PDF through the Puppeteer route, and build their `.docx`. Hand all four files to the user, plus a link that opens the on-screen report on a phone (the Vercel preview of the branch, or a published preview page). Word parity work, the Q1.0 hint and the remaining polish continue only after they approve.
- **Page review:** every page of the example PDF is inspected. No clipped columns, no word broken mid-word, no page more than about 40% empty unless a section ends there, cover exactly one page.
- **Regression:** `npm test`, `npm run build`, lint no worse than base; `scripts/make-sample.mjs` is re-run so `/sample` shows the new design.

## Rollout

- A new branch `feat/report-design-system`, cut from `feat/scope-catalogue-v5-2`: the renderers changed in PR #12 and this work builds on them. Merge after PR #12.
- `.superpowers/` is added to `.gitignore`.
- Old KV reports re-render in the new design automatically (the renderers are stateless). Their `.docx` is rebuilt on download.
- *Found while planning:* the `.docx` is currently built at finalise and stored in the KV record. Embedding IBM Plex adds about 0.5–1 MB, which risks the KV value-size limit. So the `.docx` is now **built on download** (`GET /api/reports/[id]/docx`) and no longer stored; the local no-KV path keeps building it inline.

## Risks

- **Word fidelity.** Word's table layout differs from the browser's. Column widths are fixed in DXA and checked in the example gate; small spacing differences between Word and PDF are acceptable, but font, size, colour and structure differences are not.
- **Embedded font size** adds about 0.5–1 MB per `.docx`. Only the weights used are embedded (Sans 400/500/600/700, Mono 500).
- **Puppeteer and fonts on Vercel.** The PDF renders the live page, so Plex arrives through `next/font`. The route must wait for `document.fonts.ready` before `page.pdf()`.
