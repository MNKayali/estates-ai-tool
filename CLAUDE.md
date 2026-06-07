# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> The line above is intentional and important: this repo runs **Next.js 16.2.6**, which
> has breaking changes vs. older versions. Read the relevant guide in
> `node_modules/next/dist/docs/` before writing framework code.

> **June 2026 re-alignment:** the two workbooks are now **NRM1 v3.7** and **Programme v4.3**,
> and the questionnaire is **v7**. The calculators were rebuilt to match them per
> `/docs/CLAUDE_CODE_REBUILD_BRIEF.md`. If anything here disagrees with that brief, the brief wins.

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

A gated Next.js (App Router) web tool that produces **UK RIBA Stage 0–1 feasibility reports**. A user fills a multi-step questionnaire; the app returns a costed, programmed feasibility report on screen and as a downloadable `.docx`.

## Core architectural rule: the AI never calculates a number

`app/api/generate-report/route.js` runs four ordered steps:

1. **`lib/costCalculator.js`** → deterministic NRM1 cost JSON (no AI).
2. **`lib/programmeCalculator.js`** → deterministic RIBA programme JSON (no AI).
3. **One Claude API call** (`callClaudeForProse`) → **prose only**, forbidden from recalculating, plus deterministic risk-register **seeds** (which risks appear is decided in code; the AI writes their wording).
4. **`lib/reportBuilder.js`** → assembles the `.docx` from deterministic data + AI prose.

Cost runs **twice** (once with `programmeWeeks = 0`, then after the programme is known) because Inflation (F) and the long-programme Prelims (A) trigger depend on programme length. **Never let the AI invent or alter a figure.**

## The calculators are driven by remote Excel workbooks

Both `fetch` an `.xlsx` from a URL env var at request time, parse with SheetJS, cache in-module 10 min.

### costCalculator.js ← `RATES_FILE_URL` (NRM1 v3.7)
Reads sheets by exact name: `2. Rates Reference Table`, `3. Percentage Rules`, `4. Project Type Map`, `5. Spec Level Map`, `6. BCIS Location Factors`, `7. Scope Item Map`.
- **Rate column** from project type (Q1.2) + spec level (Q2.4).
- **Q2.4 band multiplier** and tier names are read from **Tab 5** (do not hard-code the tier names).
- **Pricing is per element by its Unit in Tab 2**: `m²`→GIFA×rate×BCIS×band; `Nr`→qty×rate×BCIS; `Item`→1×rate×BCIS (or `approxValue`); `specialist_m2`→`additionalScope.area`×rate×BCIS (no band); `kWp`/`kWh`→qty×rate (no BCIS, no band). Tab 7 maps each Q2.2 label to element code(s); `per_element` rows price each listed element by its own unit.
- Percentage additions A–H evaluated from Tab 3 rule rows. Contingency (H) fixed 5%. **No percentages or risk numbers in code.**

### programmeCalculator.js ← `PROGRAMME_FILE_URL` (Programme v4.3)
**One unified 6-band size scheme (S1–S6)** for design *and* construction:
`sizeBand(gifa)`: <150→S1 · ≤250→S2 · ≤500→S3 · ≤1500→S4 · ≤3000→S5 · >3000→S6.
- Sheet `Durations` is **ID-keyed** (DS2, GW, GW3, SV1–6, PL0–5, BC1–2, TN1–3); columns are `ID · Phase · Activity · S1_Lo · S1_Hi … S6_Lo · S6_Hi · Unit · Type · ParallelWith · ScaledByQ2.3 · Trigger · Notes`. Skip rows with blank ID/Type (banners).
- Sheet `Construction` matched by **Project Type name (col 1)**; bands `S1_Lo…S6_Hi`; `Handover` = CH1.
- Sheet `Modifiers` owns the **Q2.3 design multiplier** (`Q23-1..Q23-4`, `Q23-NB`), occupation (`OCC`), phasing (`PH-1`), funding governance (`FN-1`), access (`ACC-1`/`ACC-2`), hard deadline (`DL-1`), float (`PROG-FLOAT`).
- Sheet `FastTrack` — start point (Q4.5) and PD route auto-apply; other levers are surfaced as narrative options, not applied to the headline number.
- Surveys run **parallel** with design; planning **gates** Stage 4 (carry the overrun); BC parallel with Stage 4 (carry overrun). `GW3` only for S3+ (GIFA > 250).

Changing a rate or duration means **editing the workbook, not the code**. Design multiplier lives only in Programme Modifiers; NRM1 keeps only the cost band.

## Report output: built in code, not from the template file

`reportBuilder.js` builds the Word doc programmatically with `docx` v9 (navy `#1A2E4A`, Arial, A4, 9 numbered sections). The `Estates_AI_Report_Template_PRODUCTION.docx` is the **design spec** the builder mirrors. Keep `app/report/ReportRenderer.jsx` in sync.

## Data flow & key conventions

- Answer keys use `q<section>_<index>_<name>` and must match **Questionnaire v7** exactly. Canonical set is in `/docs/CLAUDE_CODE_REBUILD_BRIEF.md` §3. Notably: design stage = `q4_5_designStage`; phasing = `q4_6_phasing`; funding = `q4_7_funding`; BREEAM is in `q2_5_standards`; PV/BESS/lift/EV quantities are `q1_5_*`. There is **no** `q4_8`/`q4_9`.
- **Persistence:** Vercel KV (`lib/kv.js`, `report:<id>`, 90-day TTL). Optional — absent KV vars degrade silently. Canonical URL `/report/[id]`.
- **Access control:** `proxy.ts` checks `estate_access` cookie against `ACCESS_CODE`. If `ACCESS_CODE` unset, all routes open (dev).

## Environment variables

| Var | Purpose | If unset |
|---|---|---|
| `AI_API_KEY` | Anthropic key for the prose call | step 3 fails |
| `RATES_FILE_URL` | NRM1 v3.7 rates workbook | cost calc throws |
| `PROGRAMME_FILE_URL` | Programme v4.3 workbook | programme calc throws |
| `ACCESS_CODE` | Gate code | all routes open (dev) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Vercel KV | persistence disabled |

**Security:** `AI_API_KEY` never in committed code or output; read inside the request handler, BOM-stripped.

## Health check

`/api/rates-check` must confirm **both** workbooks load: `ratesOk` + a sample rate, and `programmeOk` + a real sample duration (DS2 S3 mid from the Durations sheet). Use it after every workbook edit.

## Deployment

Hosted on **Vercel**. `npm run build` is the gate. Both `*_FILE_URL` workbooks must be reachable from the deployment.

## Frontend Design Rules

When building or modifying any UI component, page, or interface in this app:

- **Choose a clear aesthetic direction** before writing code and commit to it fully. This app serves university estates professionals — the tone should be authoritative, precise, and refined (not playful or consumer-grade).
- **Typography:** Use distinctive, characterful fonts. Never use Inter, Roboto, Arial, or system-ui. Pair a strong display font with a clean body font.
- **Colour:** Work from the established navy `#1A2E4A` brand. Build a cohesive palette around it — dominant navy with sharp, purposeful accents. Avoid generic colour schemes.
- **Motion:** Use subtle animations for page load, step transitions, and hover states. CSS-only preferred; avoid heavy JS animation libraries unless necessary.
- **Layout:** Prefer structured, grid-based layouts appropriate to a professional tool. Clean information hierarchy. Generous whitespace. No clutter.
- **Backgrounds & depth:** Avoid flat solid whites. Add subtle depth via light textures, soft gradients, or layered transparencies that reinforce the professional aesthetic.
- **Production-grade only:** No placeholder content, no lorem ipsum, no half-built components committed to the repo.
- Every UI change should feel intentional and consistent with the report tool's purpose — a credible, polished product used inside a university estates team.
