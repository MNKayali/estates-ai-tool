# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> The line above is intentional and important: this repo runs **Next.js 16.2.6**, which
> has breaking changes vs. older versions. Read the relevant guide in
> `node_modules/next/dist/docs/` before writing framework code.

> **June 2026 re-alignment:** the two workbooks are now **NRM1 v4.5** and **Programme v4.3**,
> and the questionnaire is **v7**. The calculators were rebuilt to match them. If anything
> here contradicts what you read in the source files, trust the source files.

## Commands

```bash
npm run dev      # local dev server at http://localhost:3000
npm run build    # production build (run this to typecheck/validate before pushing)
npm run start    # serve the production build
npm run lint     # eslint (flat config: eslint.config.mjs)
```

There is **no test framework**. "Verifying a change" means `npm run build` plus exercising the flow in the browser.

Environment is Windows: the **Bash tool fails** here. Use the **PowerShell tool**. Python is not installed — use Node.js and the `xlsx` npm package for any spreadsheet scripting.

## What this app does

A gated Next.js (App Router) web tool that produces **UK RIBA Stage 0–1 feasibility reports** for capital works projects. A user fills a multi-step questionnaire; the app returns a costed, programmed feasibility report on screen and as a downloadable `.docx`.

## Core architectural rule: the AI never calculates a number

`app/api/generate-report/route.js` runs four ordered steps:

1. **`lib/costCalculator.js`** → deterministic NRM1 cost JSON (no AI).
2. **`lib/programmeCalculator.js`** → deterministic RIBA programme JSON (no AI).
3. **One Claude API call** (`callClaudeForProse`) → **prose only**, forbidden from recalculating, plus deterministic risk-register **seeds** (which risks appear is decided in code; the AI writes their wording).
4. **`lib/reportBuilder.js`** → assembles the `.docx` from deterministic data + AI prose.

Cost runs **twice** (once with `programmeWeeks = 0`, then after the programme is known) because Inflation (F) and the long-programme Prelims (A) trigger depend on programme length. **Never let the AI invent or alter a figure.**

## The calculators are driven by remote Excel workbooks

Both `fetch` an `.xlsx` from a URL env var at request time, parse with SheetJS, cache in-module 10 min.

### costCalculator.js ← `RATES_FILE_URL` (NRM1 v4.5)
Reads sheets by exact name: `2. Master Cost Table`, `3. Percentage Rules`, `5. Spec Level Map`, `6. BCIS Location Factors`, `8. Benchmark Check` (consumed by `senseCheck.js`). The legacy `4. Project Type Map` / `7. Scope Item Map` sheets are **not** read in v4.5.
- **In v4.5 every Master Cost Table row is its own selectable code** (e.g. `4.2-RES`, `5.8a`). The ticked Q2.2 scope items ARE the element codes — there is no label→code map. Each row carries its own per-project-type rate columns (`Rfb Basic/Std/High`, `NB Std/High`, `Ext Std/High`, `Ext Works`); `getRateForElement()` picks the column from Q1.2 project type + Q2.4 spec level.
- **Q2.3 band multiplier** is read from **Tab 5** (`bandFactors`); the design multiplier in Tab 5 is unused by cost (it lives in the Programme Modifiers sheet).
- **Pricing is driven by each row's `Pricing Type` (col 6), not the Unit string**: `gifa_rate`→GIFA×rate×BCIS×band; `footprint_rate`→(GIFA/storeys)×rate×BCIS×band; `upperfloors_rate`→(GIFA×(storeys−1)/storeys)×rate×BCIS×band; `per_nr`→qty×rate×BCIS; `per_item`→1 (or captured count when `Quantity to capture` is a count)×rate×BCIS; `per_kwp`/`per_kwh`→qty×rate (no BCIS, no band). An unknown/blank Pricing Type is skipped (qty 0) and logged. Count-driven rows selected with no quantity are returned in `excludedNoQuantity` (surfaced in the prose so they are not lost).
- Percentage additions A–H evaluated from Tab 3 rule rows. Contingency (H) fixed 5%. Inflation (F) tender vs construction bands are evaluated against component-specific spans (weeks-to-tender, construction-only weeks) — passed as `constructionWeeks` to `calculateCost`, not stashed on `answers`. **No percentages or risk numbers in code** (the design-stage fee ladder and risk-level RAG bands are explicit fallbacks only).

### programmeCalculator.js ← `PROGRAMME_FILE_URL` (Programme v4.3)
**One unified 6-band size scheme (S1–S6)** for design *and* construction:
`sizeBand(gifa)`: <150→S1 · ≤250→S2 · ≤500→S3 · ≤1500→S4 · ≤3000→S5 · >3000→S6.
- Sheet `Durations` is **ID-keyed** (DS2, GW, GW3, SV1–6, PL0–5, BC1–2, TN1–3); columns are `ID · Phase · Activity · S1_Lo · S1_Hi … S6_Lo · S6_Hi · Unit · Type · ParallelWith · ScaledByQ2.3 · Trigger · Notes`. Skip rows with blank ID/Type (banners).
- Sheet `Construction` matched by **Project Type name (col 1)**; bands `S1_Lo…S6_Hi`; `Handover` = CH1.
- Sheet `Modifiers` owns the **Q2.3 design multiplier** (`Q23-1..Q23-4`, `Q23-NB`), occupation (`OCC`), phasing (`PH-1`), funding governance (`FN-1`), access (`ACC-1`/`ACC-2`), hard deadline (`DL-1`), float (`PROG-FLOAT`).
- Sheet `FastTrack` — start point (Q4.5) and PD route auto-apply; other levers are surfaced as narrative options, not applied to the headline number.
- Surveys run **parallel** with design; planning **gates** Stage 4 (carry the overrun); BC parallel with Stage 4 (carry overrun). `GW3` only for S3+ (GIFA > 250).

Changing a rate or duration means **editing the workbook, not the code**. Design multiplier lives only in Programme Modifiers; NRM1 keeps only the cost band.

### senseCheck.js
Runs after both calculators, before the AI call. Reads Sheet `8. Benchmark Check` from the NRM1 workbook (cost benchmarks live in the workbook, not in code). Also exports `budgetVerdict(answers, cost)` — a deterministic comparison of Q4.3 stated budget (incl. fees + VAT) against the gross estimate range; result goes into the AI prompt and the report payload. Programme benchmarks (wide size-band envelopes) remain in code because there is no matching programme-benchmark sheet.

## Report output: built in code, not from the template file

`reportBuilder.js` builds the Word doc programmatically with `docx` v9 (navy `#1A2E4A`, A4, 9 numbered sections). Section headings use Playfair Display in the Word output; body text uses Arial for universal compatibility. The `Estates_AI_Report_Template_PRODUCTION.docx` is the **design spec** the builder mirrors — it is not read at runtime. Keep `app/report/ReportRenderer.jsx` in sync with `reportBuilder.js` whenever report structure changes.

## Data flow & key conventions

- Answer keys use `q<section>_<index>_<name>` and must match **Questionnaire v7** exactly. Canonical key set is defined at the top of `app/questionnaire/page.jsx` and used throughout. Notably: design stage = `q4_5_designStage`; phasing = `q4_6_phasing`; funding = `q4_7_funding`; BREEAM is in `q2_5_standards`; PV/BESS/lift/EV quantities are `q1_5_*`. There is **no** `q4_8`/`q4_9`.
- **Persistence:** Vercel KV (`lib/kv.js`, key `report:<id>`, 90-day TTL). Optional — absent KV vars degrade silently. Canonical shareable URL is `/report/[id]`; `/report` is a legacy entry point that redirects to it.
- **Access control:** `middleware.ts` (`proxy.ts`) checks the `estate_access` cookie (HMAC-signed via `lib/cookieAuth.js`) against `ACCESS_CODE`. If `ACCESS_CODE` is unset, all routes are open (dev mode).
- **PDF export:** `app/api/report-pdf/[id]/route.js` generates a PDF from a stored report.
- **Scope items API:** `app/api/scope-items/route.js` returns the selectable scope codes from the NRM1 workbook, used to populate Q2.2 in the questionnaire.
- **Building use matching:** `lib/buildingUse.js` exports `matchesBuildingUse()` and `BUILDING_USE_TAGS` — used to filter/validate Q1.3 building use against project type.

## UI design system

All shared primitives live in `app/components/ui.jsx`: `Button`, `Badge`, `Card`, `Stat`, `SectionHeader`, `Field`, `Input`, `Textarea`, `Select`, `ControlGroup`, `ProgressBar`, `Rag`. These are class-driven — the classes are defined in `app/globals.css`.

**Fonts** (loaded in `app/layout.tsx` via `next/font/google`):
- `--font-display` → Playfair Display (serif) — headings, decorative
- `--font-body` → DM Sans — body text, UI copy
- `--font-mono` → DM Mono — labels, eyebrows, code

**Key CSS tokens** (defined in `:root` in `globals.css`):
- `--navy` / `--ink` — primary brand navy `#1A2E4A`
- `--amber` / `--accent` — warm amber `#C4861A`, used sparingly
- `--bg` / `--tint` / `--tint-2` — warm off-white background family
- `--border` / `--border-2` — warm neutral borders
- `--blue` — legacy alias for `--navy` (kept so old inline references don't go off-brand; do not use for new code)

**Key CSS utility classes**: `.btn-primary` (navy gradient), `.btn-accent` (amber gradient), `.btn-ghost`, `.panel-dark` (navy gradient panel), `.card` / `.card.lift`, `.eyebrow` (mono uppercase amber label), `.display` (Playfair), `.mono` (DM Mono), `.rise` / `.rise-1`–`.rise-4` (staggered fade-up entrance animation).

## Environment variables

| Var | Purpose | If unset |
|---|---|---|
| `AI_API_KEY` | Anthropic key for the prose call | step 3 fails |
| `RATES_FILE_URL` | NRM1 v4.5 rates workbook | cost calc throws |
| `PROGRAMME_FILE_URL` | Programme v4.3 workbook | programme calc throws |
| `ACCESS_CODE` | Colleague gate code | all routes open (dev) |
| `ADMIN_CODE` | Admin-area code for `/admin` + `/api/admin/*` (distinct from `ACCESS_CODE`; `estate_admin` cookie) | admin area open (dev) |
| `COOKIE_SECRET` | HMAC key for access + admin cookies (`lib/cookieAuth.js`) | falls back to raw-code comparison (set this in prod) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Vercel KV | persistence disabled |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry error capture (`sentry.*.config.ts`) | error capture disabled (no-op) |

**Security:** `AI_API_KEY` never in committed code or output; read inside the request handler, BOM-stripped. `COOKIE_SECRET` must be a cryptographically random string (≥ 32 chars); generate once with `openssl rand -hex 32`.

## Health check

`/api/rates-check` must confirm **both** workbooks load: `ratesOk` + a sample rate, and `programmeOk` + a real sample duration (DS2 S3 mid from the Durations sheet). Use it after every workbook edit.

## Deployment

Hosted on **Vercel**. `npm run build` is the gate. Both `*_FILE_URL` workbooks must be reachable from the deployment.

## Frontend Design Rules

When building or modifying any UI component, page, or interface in this app:

- **Aesthetic direction:** The tone is authoritative, precise, and refined — this is a professional capital works tool, not a consumer product.
- **Typography:** Use the established font trio (Playfair Display / DM Sans / DM Mono). Never introduce Inter, Roboto, Arial, or system-ui for new UI work.
- **Colour:** Work from the established palette (`--navy`, `--amber`). Amber is a *sparingly used* accent — it should never dominate a surface. `--blue` is a legacy alias for navy; do not use it for new code.
- **Motion:** CSS-only animations preferred. Avoid heavy JS animation libraries.
- **Backgrounds:** Never flat white. Use `--bg`, `--tint`, `--tint-2`, or the `panel-dark` class.
- **Production-grade only:** No placeholder content, no lorem ipsum, no half-built components committed to the repo.
