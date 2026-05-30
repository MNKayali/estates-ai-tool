# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> The line above is intentional and important: this repo runs **Next.js 16.2.6**, which
> has breaking changes vs. older versions. Read the relevant guide in
> `node_modules/next/dist/docs/` before writing framework code.

## Commands

```bash
npm run dev      # local dev server at http://localhost:3000
npm run build    # production build (run this to typecheck/validate before pushing)
npm run start    # serve the production build
npm run lint     # eslint (flat config: eslint.config.mjs, extends next/core-web-vitals + next/typescript)
```

There is **no test framework** in this project — no `test` script, no test runner installed. "Verifying a change" means `npm run build` plus exercising the flow in the browser.

Environment is Windows: the **Bash tool fails** here (no Git bash). Use the **PowerShell tool** for shell commands. Python is not installed (Store stub only) — use Node.js (`C:\Program Files\nodejs\node.exe`) and the `xlsx` npm package for any spreadsheet scripting.

## What this app does

A gated Next.js (App Router) web tool that produces **UK RIBA Stage 0–1 feasibility reports** for construction/refurbishment projects. A user fills a multi-step questionnaire; the app returns a costed, programmed feasibility report as both an on-screen view and a downloadable `.docx`.

## Core architectural rule: the AI never calculates a number

The report pipeline (`app/api/generate-report/route.js`) runs in four ordered steps, and this separation is the central design constraint of the whole codebase:

1. **`lib/costCalculator.js`** → deterministic NRM1 cost JSON (no AI).
2. **`lib/programmeCalculator.js`** → deterministic RIBA programme JSON (no AI).
3. **One Claude API call** (`callClaudeForProse`) → **prose only**. It receives the already-computed numbers and is explicitly forbidden (in `AI_SYSTEM_PROMPT`) from recalculating, adding markdown, or building tables. Returns a fixed JSON shape (executive summary, key findings, risk register, constraints, procurement prose, next steps, etc.).
4. **`lib/reportBuilder.js`** → assembles the `.docx` from the deterministic data + AI prose.

When touching cost or programme logic, keep all arithmetic in the calculators. When touching report wording, keep it in the AI prose layer or the static text in `reportBuilder.js`. **Never let the AI invent or alter figures.** The cost re-runs twice (step 1 once with `programmeWeeks=0`, then again after step 2) because inflation and prelims depend on the programme length.

## The calculators are driven by remote Excel workbooks

Both calculators `fetch` an `.xlsx` from a URL env var at request time and parse it with SheetJS (`xlsx`), caching the workbook in-module for 10 minutes:

- `costCalculator.js` ← `RATES_FILE_URL`. Reads sheets by **exact name**: `2. Rates Reference Table`, `3. Percentage Rules`, `4. Project Type Map`, `6. BCIS Location Factors`, `7. Scope Item Map`. Rate selection depends on project type + spec level; percentage additions (prelims A, OH&P B, fees C, dev costs D, risk E, inflation F, contingency H) are evaluated from rule rows via `checkCondition()` string matching against questionnaire answers.
- `programmeCalculator.js` ← `PROGRAMME_FILE_URL`. Reads sheets `Durations` (cols: Activity, Very Small, Small, Medium, Large, Unit, Notes) and `Construction`. Size bands differ between the two domains: **design** uses 4 bands (`designSizeBand`: <150 / <500 / ≤2000 / larger); **construction** uses 5 bands (`constructionSizeBand`, with a 250 m² split). Surveys run **concurrently** with design (Stage 2–3) and do NOT extend `totalWeeks`. Projects under 250 m² skip the Stage 3 approval gateway.

Because rates/durations live in spreadsheets, changing a number often means editing the workbook, not the code. The local reference workbook is `Estates_AI_Programme_v4_1.xlsx`; after editing it you must update the corresponding `*_FILE_URL` env var to point at the new file.

## Report output: built in code, not from the template file

`reportBuilder.js` constructs the Word document **programmatically with `docx` v9** (named ESM exports) — it does NOT fill the `Estates_AI_Report_Template_PRODUCTION.docx` template at runtime. That `.docx` is the **design spec** the builder mirrors (navy `#1A2E4A`, Arial, A4, the 9 numbered sections, NRM1 cost tables). If you change the visual design, change it in `reportBuilder.js`; keep the on-screen `app/report/ReportRenderer.jsx` in sync, since the two are meant to match.

## Data flow & key conventions

- **Questionnaire answers** use the key convention `q<section>_<index>_<name>` (e.g. `q1_0_projectName`, `q1_5_size` (GIFA m²), `q2_2_scopeItems`, `q2_3_interventionLevel`). The generate-report route validates required fields and several guards before computing.
- **Persistence:** generated reports are saved to **Vercel KV** (`lib/kv.js`, key `report:<id>`, 90-day TTL) and fetched via `GET /api/reports/[id]`. KV is **optional** — if `KV_REST_API_*` env vars are absent, saves/reads return null/false silently and the app still works (the report payload is also returned inline and stashed in sessionStorage). `/report` is a legacy fallback; the canonical URL is `/report/[id]`.
- **Access control:** `proxy.ts` (Next.js 16 renamed `middleware` → **`proxy`**) guards `/questionnaire`, `/report`, `/contradiction`, `/api/generate-report`, `/api/reports`. It checks the `estate_access` cookie against `ACCESS_CODE`. **If `ACCESS_CODE` is unset, everything passes through (dev mode).** The cookie is set by `POST /api/check-access`.

## Environment variables

| Var | Purpose | Behaviour if unset |
|---|---|---|
| `AI_API_KEY` | Anthropic API key for the prose call | step 3 fails |
| `RATES_FILE_URL` | URL of the NRM1 rates workbook | cost calc throws |
| `PROGRAMME_FILE_URL` | URL of the programme durations workbook | programme calc throws |
| `ACCESS_CODE` | Gate code for protected routes | **all routes open (dev)** |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Vercel KV (report persistence) | persistence silently disabled |

**Security:** `AI_API_KEY` must never appear in committed code or be displayed. `reportBuilder.js` must never reference it. The key is read inside the request handler (`getAnthropicKey()`), stripping a possible BOM.

## Deployment

Hosted on **Vercel**. `npm run build` is the gate. The deterministic calculators depend on the two `*_FILE_URL` workbooks being reachable from the deployment.
