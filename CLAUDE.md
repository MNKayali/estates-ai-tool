# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> The line above is intentional and important: this repo runs **Next.js 16.3.5**, which
> has breaking changes vs. older versions. Read the relevant guide in
> `node_modules/next/dist/docs/` before writing framework code. (Bumped from 16.2.6 in
> September 2026 to fix a critical RCE — see "Recent Work & Status" below. Both are
> within the 16.x line; nothing about the Next 16 migration notes changed.)

> **June 2026 re-alignment:** the two workbooks are now **NRM1 v4.5** and **Programme v4.3**,
> and the questionnaire is **v7**. The calculators were rebuilt to match them. If anything
> here contradicts what you read in the source files, trust the source files.

## Commands

```bash
npm run dev        # local dev server at http://localhost:3000
npm run build      # production build (run this to typecheck/validate before pushing)
npm run start      # serve the production build
npm run lint       # eslint (flat config: eslint.config.mjs)
npm test           # vitest — see lib/__tests__/
npm run test:watch # vitest in watch mode
node scripts/dev-open.mjs                 # next dev with BOTH access gates open (local verification only)
node scripts/make-sample.mjs [origin]     # regenerate public/sample/report.json via a local, gate-open, no-KV dev server
```

`.claude/launch.json` has two preview configs: `estates-ai-tool` (plain `npm run dev`, gated exactly like production because `.env.local` sets `ACCESS_CODE`) and `estates-ai-tool-open` (runs `scripts/dev-open.mjs`). Use the second for browser verification — the first needs the access code typed in. Next 16 refuses to start a second `next dev` in the same directory; if one is already running you will see "Another next dev server is already running" with its PID.

**Vitest** (`vitest.config.mjs` + `vitest.setup.mjs`) covers `lib/costCalculator.js`, `lib/programmeCalculator.js`, `lib/senseCheck.js`, `lib/prose.js`, `lib/reportShared.js`, `lib/labels.js`, `lib/pipeline.js`, `lib/questionSets.js` and `lib/siteContext.js` — the percentage-rule matcher and its trace, size-band boundaries, budget verdict (incl. VAT position), confidence grading, deterministic risk seeds (incl. the Q3.8 context seeds), the number-leak guard, programme float / FastTrack / procurement-table selection, calendar dates, the shared report strings, and per-project-type question visibility/options and the Section 1 higher-risk-building derivation (incl. its project-type gate and the Extension storeys/height distinction), including regression tests pinned to the exact "general pattern shadows specific" bugs found and fixed in this codebase's history. Tests that depend on a workbook addition the user has not applied yet (Range Widths sheet, BS1/SV7 rows, HRB rules) **skip with a message** naming `docs/workbook-changes-sept-2026.md` rather than fail. `budgetVerdict()`, `computeConfidence()` and `ensureSeedRisks()` are pure and run instantly; the cost/programme calculator tests fetch the real remote workbooks (there is no offline fixture — `vitest.setup.mjs` loads `.env.local` manually the same way `scripts/baseline.mjs` does, for the same reason both need `RATES_FILE_URL`/`PROGRAMME_FILE_URL`) and are consequently slower and dependent on those URLs being reachable.

`scripts/baseline.mjs` remains the tool for **"did this change move any number"**, across ~75 scenarios via snapshot diffing — see its own header. Vitest is for **"does this specific rule behave the way it's supposed to,"** with a readable assertion and failure message rather than an opaque diff. Use both: baseline.mjs before/after a change that must not move anything, Vitest for anything with a specific, statable rule.

"Verifying a change" means `npm run build`, `npm test`, and exercising the flow in the browser.

Environment is Windows. The **Bash tool (Git Bash) works** as of September 2026 for node/npm/sed/grep; the **PowerShell tool** is better for process inspection (`Get-Process`), since Git Bash mangles Windows-style `/FLAG` arguments. Python is not installed — use Node.js and the `xlsx` npm package for any spreadsheet scripting (read with `fs.readFileSync` + `XLSX.read(buf, { type: 'buffer' })`; the ESM build's `XLSX.readFile` has no `fs` wired in).

**`nutritrack/`, `portfolio-advisor/` and `Beach Game/`** are unrelated side projects that happen to live in this repo's root folder (untracked in git, not part of this app). `tsconfig.json` and `eslint.config.mjs` both explicitly exclude them — without that, a bare `npm run build` or `npm run lint` would try to typecheck/lint their unrelated dependency trees and fail. If either exclude list ever needs touching again, that's why it's there; don't remove it to "clean up" the config.

## What this app does

A gated Next.js (App Router) web tool that produces **UK RIBA Stage 0–1 feasibility reports** for capital works projects. A user fills a multi-step questionnaire; the app returns a costed, programmed feasibility report on screen and as a downloadable `.docx`.

## Core architectural rule: the AI never calculates a number

Report generation is split across **two requests**, not one — this is the fix for a structural reliability problem, not a style choice; see "Why two requests" below.

**Phase 1 — `app/api/generate-report/route.js`** (deterministic only, returns in a few seconds):

1. **`lib/costCalculator.js`** → deterministic NRM1 cost JSON (no AI).
2. **`lib/programmeCalculator.js`** → deterministic RIBA programme JSON (no AI).
3. Cost runs **three times**: once with `programmeWeeks = 0`, again after the programme is known (Inflation (F) and the long-programme Prelims (A) trigger depend on programme length), and a final time with `{ rangeGrade: confidence.score }` because the estimate range width is keyed to the confidence grade (Tab `9. Range Widths`), which is only known after the sense check. The budget verdict is then recomputed from the final cost. **`lib/pipeline.js`'s `runDeterministicPipeline()`** is this exact sequence as one function; `/api/compare` uses it so scenarios can never disagree with the report.
4. **`lib/senseCheck.js`** → deterministic warnings + confidence grade (`computeConfidence` in `lib/prose.js`).
5. **`lib/kv.js`'s `createReport()`** → writes the record with `status: 'deterministic'`, TTL 24h, and returns `{ reportId, cost, programme, budget, confidence }`. No AI call has happened yet.

**Phase 2 — `app/api/reports/[id]/prose/route.js`** (AI only, called by `/report/[id]` immediately after Phase 1 returns, and again on every subsequent attempt):

6. **Two Claude API calls** (`requestProseHalf` in `lib/prose.js`) → **prose only**, forbidden from recalculating, plus deterministic risk-register **seeds** (which risks appear is decided in code; the AI writes their wording).
7. **`lib/reportBuilder.js`** → assembles the `.docx` from deterministic data + AI prose, once both halves are in.
8. **`lib/kv.js`'s `finaliseReport()`** → writes the complete record, `status: 'complete'`, TTL 90 days, and pushes it onto the admin index for the first time.

**Never let the AI invent or alter a figure — and never let it invent a claim about what the tool's own automated checks found.** The system prompt (`AI_SYSTEM_PROMPT` in `lib/proseSchema.js`) has fourteen absolute rules; rule 13 exists because the model once fabricated a plausible-sounding "the automated sense check raised a warning" claim about a percentage rule that was never actually flagged — see "Recent Work & Status." Since September 2026 the prompt is no longer the only enforcement: `assertNoLeakedFigures()` in `lib/prose.js` extracts every `£` figure and every "N weeks" from the model's output and rejects the half if any is not present in the prompt it was given (the prompt being the only legitimate source of a figure); the existing retry loop feeds the offending figure back. Restatements in another style (`£415k`, `£0.415m`) normalise to the same integer and pass; a changed or invented figure fails.

### Why two requests

Both AI calls used to run inside the same request as the deterministic steps, sharing one 48s slice of the 60s function ceiling (see git history for the single-call and two-parallel-call attempts that preceded this — both failed for different reasons). That worked most of the time (~27s typical) but had **no room for a retry of a slow half**: one bad API moment and the whole report — deterministic data included — was lost after the AI call had already been paid for.

Splitting the AI phase into its own request removes the shared budget entirely. Phase 1 never touches the network and finishes in ~1s, so it cannot time out. Phase 2 gets a **fresh 60s** on every attempt — see "Resumability" below — so a slow API day costs extra round trips, not a lost report.

The two Claude calls inside Phase 2 (`PROSE_HALVES` in `lib/prose.js`) still run **sequentially, not in parallel**: two concurrent streams each get about half the token throughput, so parallel saves no wall clock and pushes the longer half past its timeout (measured: risk half 4,780 chars in 11.7s alone vs 25.7s alongside the other). The schema is split into two disjoint strict tools in `lib/proseSchema.js` — `PROSE_TOOL_NARRATIVE` (summary, findings, assumptions, cost/ROI narrative, constraints, next steps) and `PROSE_TOOL_RISK` (risk register + procurement) — merged by `finaliseProse()` into the same flat `aiProse` object the original single tool used, so `reportBuilder.js` and `ReportRenderer.jsx` are unchanged. **Keep the two schemas disjoint**: a key in both would make merge order significant. Both halves get an identical context prefix and differ only in field guidance, so neither depends on the other's output — where the narrative needs the headline risk or the procurement route it reads them from the deterministic seeds and programme data.

### Resumability

`/report/[id]` (`app/report/[id]/page.jsx`) is the driver. It loads the Phase 1 record, renders it immediately (pending placeholders for the AI-only sections — see `ReportRenderer.jsx`'s `isPending`/`PendingNote`), and calls `POST /api/reports/[id]/prose` repeatedly until `status` is `'complete'`. Each call:

- Skips any half already written (`lib/kv.js` sidecar keys `report:<id>:half:<narrative|risk>`).
- Claims a per-half KV lock (`nx`, 75s TTL) before attempting it, so two tabs open on the same report split the two halves between them rather than duplicating spend — never retried in a hot loop if another invocation already holds it.
- Checks the remaining budget against that half's own `minAttemptMs` (narrative 14s, risk 20s, from measured p50s) before starting — a half it can't finish this attempt simply isn't attempted, and the next call gets a fresh 60s.
- Finalises (builds the `.docx`, writes the 90-day record) the moment both halves exist, however many calls that took.

A tab that opens a shared link to a report already mid-generation elsewhere does **not** also start calling `/prose` — it polls the cheap `/api/reports/[id]/status` instead, so every viewer's tab doesn't pile onto the same lock contention.

**This deployment is on Vercel Hobby: a hard 60s function ceiling.** `maxDuration = 60` on both routes. Do not raise it above 60 without moving to Pro/Fluid first: the platform kills the invocation regardless, and because the kill is external *none* of the error handling runs (no Sentry capture, no KV write, no JSON error) — Phase 2's resumability is what makes this survivable now (the next call just tries again), where it used to mean losing the whole report.

`/api/warm-prose` must warm **both** schemas — a first-ever compile of an unseen schema costs ~23s, and an un-warmed half pays it on the real call.

### No-KV fallback (local dev only)

If `KV_REST_API_URL`/`KV_REST_API_TOKEN` are unset, `createReport()` returns `false` and Phase 1 has no shared state channel for a second request to resume from — there'd be nowhere to put the deterministic record between the two phases. `generate-report` falls back to `lib/prose.js`'s `runProseSequential()`, reproducing the old single-invocation behaviour (both halves in one request, `status: 'complete'` in the response, no `reportId` persisted anywhere). This is why KV is not really optional in production despite the graceful-degradation wrapper in `lib/kv.js` — without it, every report reverts to the original one-shot-or-lose-it reliability profile this whole split exists to fix.

## The calculators are driven by remote Excel workbooks

Both `fetch` an `.xlsx` from a URL env var at request time, parse with SheetJS, cache in-module 10 min.

### costCalculator.js ← `RATES_FILE_URL` (NRM1 v4.5 → v4.6 spec in `docs/workbook-changes-sept-2026.md`)
Reads sheets by exact name: `2. Master Cost Table`, `3. Percentage Rules`, `5. Spec Level Map`, `6. BCIS Location Factors`, `8. Benchmark Check` (consumed by `senseCheck.js`), and — all **optional, tolerated when absent** — a `Base date` row in `1. Instructions`, a `Source` column (T, index 19) in Tab 2, and `9. Range Widths` (low/high factors per confidence grade A–D; absent → the legacy 0.89/1.11 `LEGACY_RANGE`). The legacy `4. Project Type Map` / `7. Scope Item Map` sheets are **not** read in v4.5.
- **Every percentage is traced.** `evaluatePercentageRules` returns `trace` alongside `percentages`: one `{ code, label: <Tab 3 condition text>, pct }` per fired rule (caps as a negative final entry), so the report's "How each percentage was derived" table foots to each applied figure. `lib/reportShared.js`'s `buildUpRows()` turns it into rows for both renderers and `buildUpPromptLines()` into text for the AI prompt.
- `vatPct` is read from the Tab 3 `G` row (not a `0.20` literal); `budgetVerdict()` grosses up by `vatPct × (1 − recoverable share)` using Q4.3a.
- `getScopeItems()` returns per-item `priceable: { refurb, newBuild, extension, externalWorks }` booleans (never rates) so the picker can hide tiles the calculator could only exclude as "no applicable rate".
- **In v4.5 every Master Cost Table row is its own selectable code** (e.g. `4.2-RES`, `5.8a`). The ticked Q2.2 scope items ARE the element codes — there is no label→code map. Each row carries its own per-project-type rate columns (`Rfb Basic/Std/High`, `NB Std/High`, `Ext Std/High`, `Ext Works`); `getRateForElement()` picks the column from Q1.2 project type + Q2.4 spec level.
- **Q2.3 band multiplier** is read from **Tab 5** (`bandFactors`); the design multiplier in Tab 5 is unused by cost (it lives in the Programme Modifiers sheet).
- **Pricing is driven by each row's `Pricing Type` (col 6), not the Unit string**: `gifa_rate`→GIFA×rate×BCIS×band; `footprint_rate`→(GIFA/storeys)×rate×BCIS×band; `upperfloors_rate`→(GIFA×(storeys−1)/storeys)×rate×BCIS×band; `per_nr`→qty×rate×BCIS; `per_item`→1 (or captured count when `Quantity to capture` is a count)×rate×BCIS; `per_kwp`/`per_kwh`/`per_kw`→qty×rate (no BCIS, no band). An unknown/blank Pricing Type is skipped (qty 0) and logged. Count-driven rows selected with no quantity are returned in `excludedNoQuantity` (surfaced in the prose so they are not lost). For **External Works** the same `q1_5_size` answer is a *site* area, not GIFA — `lib/labels.js`'s `areaLabel()` is what every label, renderer and prompt uses to say so.
- Percentage additions A–H evaluated from Tab 3 rule rows. Contingency (H) fixed 5%. Inflation (F) tender vs construction bands are evaluated against component-specific spans (weeks-to-tender, construction-only weeks) — passed as `constructionWeeks` to `calculateCost`, not stashed on `answers`. **No percentages or risk numbers in code** (the design-stage fee ladder and risk-level RAG bands are explicit fallbacks only).
- `checkCondition()`'s Tab 3 matching order matters: several money bugs earlier in this codebase's history came from a *general* condition (e.g. "Full planning (3–4%, use 3.5%)") matching before a *more specific* one (e.g. a listed-building 4% row), because the general row's test matched a substring of the *answer* rather than requiring its own condition text. If you touch this matcher, add a Vitest regression case in `lib/__tests__/costCalculator.test.js` alongside the two already there pinning this exact failure mode.

### programmeCalculator.js ← `PROGRAMME_FILE_URL` (Programme v4.3)
**One unified 6-band size scheme (S1–S6)** for design *and* construction:
`sizeBand(gifa)`: <150→S1 · ≤250→S2 · ≤500→S3 · ≤1500→S4 · ≤3000→S5 · >3000→S6 (the `<`/`≤` boundaries are exact — 150 itself is S2, not S1; see `lib/__tests__/programmeCalculator.test.js` for the full boundary table).
- Sheet `Durations` is **ID-keyed** (DS2, GW, GW3, SV1–6, PL0–5, BC1–2, TN1–3); columns are `ID · Phase · Activity · S1_Lo · S1_Hi … S6_Lo · S6_Hi · Unit · Type · ParallelWith · ScaledByQ2.3 · Trigger · Notes`. Skip rows with blank ID/Type (banners).
- Sheet `Construction` matched by **Project Type name (col 1)**; bands `S1_Lo…S6_Hi`; `Handover` = CH1. `selectConstructionId()` (code, not workbook) maps project type + scope + spec level to the row ID actually used — and has no group-1 (substructure) test: New Build and Extension return earlier, and every other type had 1.1–1.4 hidden by `priceableFor()` until "Other or mixed" made them reachable (via `lib/projectTypes.js`'s new-build rate fallback), so a mixed project with foundations now falls through to `CF2` (Fit-Out — Basic/Cat A) for its construction duration. Known gap, not fixed: the Construction sheet has no mixed row to pick instead, and inventing one in code would violate the no-numbers-in-code rule (see the `hasFabric` fallthrough comment in the function, and the design spec's "Not in this slice" table).
- Sheet `Modifiers` owns the **Q2.3 design multiplier** (`Q23-1..Q23-4`, `Q23-NB`), occupation (`OCC`), phasing (`PH-1`), funding governance (`FN-1`), access (`ACC-1`/`ACC-2`), hard deadline (`DL-1`), float (`PROG-FLOAT`).
- Sheet `FastTrack` — FT1 (start point, Q4.5) is applied to the headline; FT2–FT10 are evaluated deterministically (`FT_TRIGGERS` in `calculateProgramme`) and returned as `fastTrackOptions` — **offered in the report and prompt, never applied**.
- `PROG-FLOAT` (`+1 wk per 13 wks`) **is applied**: `totalWeeks` is the with-float headline, `totalWeeksBestCase` the critical path without it, `floatWeeks` the difference, plus a `Programme float` stage row. Inflation bands and the target-date check see the with-float figure.
- Optional sheet **`Procurement`** (decision table: primary priority = `q4_4_priorities[0]` × cost mid band × design stage → route, contract form, tender type, tender ID TN1–3, design responsibility, rationale; first row wins). Absent → the original value-only route/contract logic, kept verbatim as the fallback. Output: `tenderType`, `designResponsibility`, `procurementRationale`, `procurementSource`.
- Optional Durations rows **`SV7`** (ecology/bat survey — Q3.8 ecology option, or roof scope `2.3/2.16/7.2/2.11` on a pre-2000 building; parallel) and **`BS1`** (Building Safety Regulator Gateway 2 — `isHigherRiskBuilding()` in `lib/siteContext.js`, derived from Section 1 (Q1.2a storeys / Q1.6 height / Q1.3 building use) rather than a Q3.8 tick, with the legacy Q3.8 tick still honoured for reports generated before that change; sequential between Stage 4/BC and tender, `bsaGatewayWeeks`). No row → no stage, no duration: the code never invents one.
- **Calendar dates** (Q4.0 `q4_0_startDate`, else the generation date with `startDateAssumed: true`): every stage gets `startWeek/endWeek/startDate/endDate` (parallel stages anchored to the stage they run alongside), milestones read `Week N (12 Mar 2027): …`, and the target-date check measures from the start date, not `new Date()`.
- Surveys run **parallel** with design; planning **gates** Stage 4 (carry the overrun); BC parallel with Stage 4 (carry overrun). `GW3` only for S3+ (GIFA > 250).

Changing a rate or duration means **editing the workbook, not the code**. Design multiplier lives only in Programme Modifiers; NRM1 keeps only the cost band.

### senseCheck.js
Runs after both calculators, before the AI call. Reads Sheet `8. Benchmark Check` from the NRM1 workbook (cost benchmarks live in the workbook, not in code). Also exports `budgetVerdict(answers, cost)` — a deterministic comparison of Q4.3 stated budget (incl. fees + VAT) against the gross estimate range; result goes into the AI prompt and the report payload. Programme benchmarks (wide size-band envelopes) remain in code because there is no matching programme-benchmark sheet.

Exactly eight warning codes exist: `COST_LOW`, `COST_HIGH`, `POSTCODE_UNMATCHED`, `RULE_UNMATCHED` and `RATE_FALLBACK` (both marked `internal: true` — workbook/rate diagnostics for maintainers, never for the client; `RATE_FALLBACK` names the element codes that priced from the new-build column per `cost.rateFallbacks`, a deliberate product decision not to disclose the mixed rate basis to the client), `PROG_SHORT`, `PROG_LONG`, `BUDGET_SHORTFALL`. `clientWarnings = warnings.filter(w => !w.internal)` is what reaches the AI prompt and the client-facing report. If you're ever debugging a risk-register entry that claims "the automated sense check raised a warning" about something not on this list, the AI fabricated it — see "SYSTEM DIAGNOSTICS" in `AI_SYSTEM_PROMPT` and "Recent Work & Status" below. **`RATE_FALLBACK` currently reaches only the generating invocation's own console** — `serializeCost()` in `app/api/generate-report/route.js` does not carry `cost.rateFallbacks` into the KV record, so it is not persisted and does not show up in the admin view; a maintainer who wants to know which elements fell back on a past report has to regenerate it and read the server log.

## Report output: built in code, not from the template file

`reportBuilder.js` builds the Word doc programmatically with `docx` v9 (navy `#1A2E4A`, A4, 9 numbered sections). Section headings use Playfair Display in the Word output; body text uses Arial for universal compatibility. The `Estates_AI_Report_Template_PRODUCTION.docx` is the **design spec** the builder mirrors — it is not read at runtime. Keep `app/report/ReportRenderer.jsx` in sync with `reportBuilder.js` whenever report structure changes.

**PDF export** (`app/api/report-pdf/[id]/route.js`) renders the *live* `/report/[id]?pdf=1` page via Puppeteer, so it shares `ReportRenderer.jsx`'s print CSS rather than having its own layout. That print CSS's section-header rule needs both `break-after: avoid` *and* `break-inside: avoid` — having only the former let a page boundary land between a "SECTION N" eyebrow label and its title, stranding the eyebrow alone and wasting a near-blank page while the title (and everything under it) moved to the next page. Fixed; if you touch `.section-hdr`'s print rules, keep both.

## Data flow & key conventions

- Answer keys use `q<section>_<index>_<name>` and must match **Questionnaire v7** exactly. There is no single canonical key-set list in the codebase — `app/questionnaire/page.jsx` is the source of truth for which keys exist and how, but they're declared where each question is rendered, not collected in one place at the top of the file. Notably: design stage = `q4_5_designStage`; phasing = `q4_6_phasing`; funding = `q4_7_funding`; BREEAM is in `q2_5_standards`; PV/BESS/lift/EV quantities are `q1_5_*`. There is **no** `q4_8`/`q4_9`. **Added September 2026:** `q3_8_siteContext` (multi-select; option strings and the substring keys the engines test live in `lib/siteContext.js` — conservation area, party wall, ecological features) and `q4_0_startDate`. `q4_4_priorities` is capped at two in the UI and the first tick is the primary priority the Procurement sheet reads. `q1_2_storeys` now goes up to `7` ("7 or more"). **Added by the question-gating slice (September 2026):** `q1_6_heightOver18m` (Q1.6, shown only for New Build/Refurbishment/Extension at 5+ storeys — `showsHeightQuestion()` in `lib/questionSets.js`); Q3.8 no longer has a "higher-risk building" option — that status is now derived from Section 1, see `isHigherRiskBuilding()` in `lib/siteContext.js`. Which questions each project type asks or offers which options is centralised in `lib/questionSets.js` (`isQuestionShown()`, `knownIssuesFor()`, `surveysFor()`, `occupationCopyFor()`, `showsHeightQuestion()`) rather than scattered inline conditions — and, since the honest-progress slice (September 2026), so is which questions are *required*: `isQuestionRequired()`, the per-section inventory `QUESTIONS_BY_SECTION`, and the counting helpers `sectionCounts()`, `unansweredRequired()` and `progressPercent()` all live there too, and the questionnaire renders its progress bar, header counts and status line from them rather than hand-written conditions. Sections 3 and 4 now have client-side validation (`validateSection()` in `app/questionnaire/page.jsx`) where they previously had none; Q5 (financial case) and Q6.1 (report instructions) sit behind two collapsed disclosures at the end of Section 4, open by default only when a returning draft already holds an answer there.
- **Visible question numbers are not the key names, and two of them deliberately differ.** `q4_0_startDate` is labelled **Q4.2** and rendered after Q4.1, taking the number freed when the dead budget-gate question was removed, so step 4 ascends. `q6_2_instructions` is labelled **Q6.1** now that the sections question is gone. Renumbering anything else is not free: the NRM1 workbook's Tab 3 conditions quote these numbers verbatim ("Q3.6 = Fully occupied throughout", "Q4.1 = Hard deadline", "Q2.5 includes BREEAM") and the report's build-up table prints that text, so a UI-only renumber puts the form and the report out of step. The remaining 2.2/2.3 inversion (level of intervention is asked before the scope picker because it gates the tiles) needs Tab 5's labels edited and belongs with the scope-catalogue work.
- **Two questions were removed in the September 2026 question review.** There is no VAT-position question: it only ever changed the wording of the budget comparison, never a cost, so `budgetVerdict()` grosses up by the full workbook VAT rate. There is no "which report sections" question: it asked the user to decide before seeing a report, and the two genuinely conditional sections already self-hide. `resolveSectionFlags()` keeps both legacy keys alive purely for reports sitting in KV, which lasts 90 days.
- **Q3.3 surveys: blank means "None" to the engines.** `computeConfidence()` has always treated an empty answer as no surveys; `checkCondition()` now does too, so a report can no longer say "Grade C, no surveys commissioned" while pricing the project as though surveys were in hand. Any scenario that leaves surveys blank carries the workbook's +2pp risk (and +0.5pp developer costs where a planning route applies). The question itself is no longer optional, though: the honest-progress slice made Q3.3 one of seven questions the FORM now requires an explicit answer to (an empty array no longer submits) — "blank" in the paragraph above describes what the engines do with an answer that predates that change, or one from the no-KV/API path that bypasses the form's own validation, not something the questionnaire itself still permits.
- **Persistence:** Vercel KV (`lib/kv.js`, key `report:<id>`). 24h TTL while `status: 'deterministic'`, re-stamped to 90 days at finalise — see "Resumability" above for the full two-phase record lifecycle (`createReport` → `saveProseHalf` × 2 → `finaliseReport`). Absent KV vars degrade to the no-KV fallback described above rather than failing outright, but production needs KV configured for the reliability split to actually apply. Canonical shareable URL is `/report/[id]`; `/report` is a legacy entry point that redirects to it.
- **Access control:** `proxy.ts` (Next 16's `middleware.ts` replacement) checks the `estate_access` cookie (HMAC-signed via `lib/cookieAuth.js`) against `ACCESS_CODE`, and `estate_admin` against `ADMIN_CODE` for `/admin` + `/api/admin/*`. Both gates **fail closed in production** when their code env var is unset (open only in local dev, `NODE_ENV !== 'production'`). `POST /api/logout` clears both cookies — there was previously no way to revoke either 30-day cookie short of clearing browser data by hand.
- **Rate limiting:** `lib/rateLimit.js` (`@upstash/ratelimit` on the same KV store — no separate env var needed) sliding-window limits five routes: `check-access` (10/10m), `admin-login` (5/10m), `generate-report` (30/10m), `prose` (60/10m — generous, since the resumability driver legitimately calls it several times per report), `feedback` (10/1h). **Fails open**, not closed, on infra failure — an infra hiccup degrades to "no rate limiting" rather than "nobody can use the app," matching `lib/kv.js`'s own graceful-degradation posture.
- **PDF export:** `app/api/report-pdf/[id]/route.js` — see "Report output" above. Guards against rendering a still-generating report (`status !== 'complete'` → 409).
- **Scope items API:** `app/api/scope-items/route.js` returns the selectable scope codes from the NRM1 workbook, used to populate Q2.2 in the questionnaire.
- **Scenario comparison:** `POST /api/compare { answers, axis: 'spec' | 'intervention' }` re-runs `runDeterministicPipeline` per variant and returns headline figures only. Rendered by `ComparePanel` in `ReportRenderer.jsx` — **screen only**, never in the PDF/.docx (it is a what-if tool, not the report of record). Protected + rate-limited (30/10m).
- **Project type (Q1.2):** seven options on a single fabric axis — what the project does to the building fabric (New Build, Extension, Refurbishment, Fit-out, External works only, Demolition only, Other or mixed). `lib/projectTypes.js` is the single source for the option list, `VISIBLE_GROUPS` and `priceableFor()` — it replaces the two hand-synchronised copies this file used to warn "must stay in step" (one in `app/questionnaire/page.jsx`, one in `app/api/suggest-scope/route.js`); both now import from it. "Other or mixed" is the one type that spans rate families and can trigger `getRateForElement()`'s new-build fallback (see `cost.rateFallbacks` / `RATE_FALLBACK` above).
- **AI scope suggestion:** `POST /api/suggest-scope { objective, projectType, buildingUse, interventionLevel }` — Haiku with a strict tool whose `code` enum is exactly the codes the picker would offer (same visible-group / building-use / tier / `priceable` filters as the questionnaire). Only the visible-group and `priceable` filters are actually shared, via `lib/projectTypes.js`; building use is shared too, but from `lib/buildingUse.js`, not `lib/projectTypes.js`. **`LEVEL_TIER` (the tier filter) and the folded-code set (`FOLDED` / `FOLDED_CODES`) are still hand-duplicated** between this route and `app/questionnaire/page.jsx` and must be kept in step by hand — they have disagreed before (see the `FOLDED` set's own comment). The model proposes; the user edits; the engine prices. `ScopeSuggestBar` in the questionnaire applies the result through the same path as the preset. Protected + rate-limited (20/10m).
- **Sample report:** `/sample` (public, outside the access gate) renders `public/sample/report.json` through `ReportRenderer` with the `sample` prop (actions hidden, banner shown). Regenerate with `scripts/make-sample.mjs` whenever the report structure changes.
- **Shared report text:** `lib/reportShared.js` is imported by *both* renderers and the prompt builder — build-up rows, Estimate Basis sentences (range, base date, rate sources), programme headline, FastTrack lines, section flags, date formatting. Put anything both renderers must say identically there, never in either renderer. It must stay free of React and node-only imports (a `'use client'` file cannot be imported by `reportBuilder.js`, which runs on the server).
- **Building use matching:** `lib/buildingUse.js` exports `matchesBuildingUse()` and `BUILDING_USE_TAGS` — used to filter/validate Q1.3 building use against project type.
- **Feedback:** `app/api/feedback/route.js` is **POST-only** — the GET that used to read entries back via `?key=<ACCESS_CODE>` in the query string was removed (a secret in a URL lands in logs/history/Referer, and it was redundant with `/api/admin/overview`, which serves the same `listFeedback()` data behind the proper cookie).
- **Error boundaries:** `app/error.jsx` (any page under the root layout — preserves fonts/header, unlike `app/global-error.tsx` which only fires for a root-layout crash and discards the whole document), `app/questionnaire/error.jsx` (reassures the user their draft is still saved locally), `app/not-found.tsx`. All three capture to Sentry when `NEXT_PUBLIC_SENTRY_DSN` is set.
- **Questionnaire draft storage:** `localStorage` key `estatesAI_v4_answers`, wrapped as `{ schemaVersion, answers }` (`STORAGE_SCHEMA_VERSION` in `app/questionnaire/page.jsx`). A version mismatch, malformed JSON, or non-object payload is discarded rather than rehydrated. Every read/write is guarded — an unguarded `localStorage.setItem` throwing (Safari private browsing, a full quota) inside a `useEffect` used to white-screen the whole page on the first keystroke.

## UI design system

All shared primitives live in `app/components/ui.jsx`: `Button`, `Badge`, `Card`, `Stat`, `SectionHeader`, `Field`, `Input`, `Textarea`, `Select`, `ControlGroup`, `ProgressBar`, `Rag`. These are class-driven — the classes are defined in `app/globals.css`. The questionnaire (`app/questionnaire/page.jsx`) has its own parallel set (`RadioGroup`, `CheckboxGroup`, `TextInput`, etc.) tuned for the multi-step form rather than the admin dashboard.

**Fonts** (loaded in `app/layout.tsx` via `next/font/google`):
- `--font-display` → Playfair Display (serif) — headings, decorative
- `--font-body` → DM Sans — body text, UI copy
- `--font-mono` → DM Mono — labels, eyebrows, code

**Key CSS tokens** (defined in `:root` in `globals.css`):
- `--navy` / `--ink` — primary brand navy `#1A2E4A`
- `--amber` / `--accent` — warm amber `#9D6B15` (darkened from the original `#C4861A` for WCAG AA contrast — see "Recent Work & Status"), used sparingly
- `--bg` / `--tint` / `--tint-2` — warm off-white background family
- `--border` / `--border-2` — warm neutral borders
- `--text-mute` / `--text-muted` — `#6D7182` (also darkened for contrast; was `#8B8FA0`)

There is no `--blue` token any more — it was a legacy alias for `--navy` with identical hex values; all 23 usages were replaced with `var(--navy)` directly and the dead token removed. If you see `var(--blue)` anywhere, that's a sign of an un-merged branch or a copy-pasted snippet from before this cleanup — replace it with `var(--navy)`.

**Key CSS utility classes**: `.btn-primary` (navy gradient), `.btn-accent` (amber gradient), `.btn-ghost`, `.panel-dark` (navy gradient panel), `.card` / `.card.lift`, `.eyebrow` (mono uppercase amber label), `.display` (Playfair), `.mono` (DM Mono), `.rise` / `.rise-1`–`.rise-4` (staggered fade-up entrance animation).

### Accessibility patterns established

These are the patterns to follow for any *new* interactive control — see "Recent Work & Status" for what's already been brought up to this standard and what hasn't:

- **A custom single-choice control** (radio-button-shaped `<button>`s, not native `<input type="radio">`) needs `role="radiogroup"` on the container, `role="radio"` + `aria-checked` on each option, and **roving tabindex** (one tab stop — the checked option, or the first if none is checked — with Arrow keys moving *and selecting*). See `RadioGroup` in `app/questionnaire/page.jsx`.
- **A custom multi-select** (independent toggle buttons) needs `role="group"` + `role="checkbox"`/`aria-checked` per option, but keeps native per-button tab stops — each is an independent on/off, not a set. See `CheckboxGroup`.
- **A custom checkbox built from a visually-hidden native `<input>`** (the Q2.2 scope tiles: a real `<input type="checkbox">` at `opacity: 0, width: 1, height: 1` behind a custom-drawn box, so the screen-reader semantics are free but the browser's default focus ring lands on an invisible 1×1 box) needs `:focus-within` on the *visible* wrapping element to redraw the ring somewhere a sighted keyboard user can see it. See `.scope-tile:focus-within` in `globals.css`.
- **A collapsible section header** must be a real `<button>` (or have `role="button" tabIndex={0}` plus Enter/Space handling) with `aria-expanded`, never a bare `<div onClick>`. See `GroupHead` in the scope picker.
- **A modal** needs `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at its visible title, and an Escape-key handler — clicking the backdrop or a Cancel button isn't enough for a keyboard user who has already tabbed inside. See `FeedbackModal` in `ReportRenderer.jsx`.
- **Dynamic status/error content** (a loading state, a submit error, a "still generating" banner) needs `role="status"`/`aria-live="polite"` or `role="alert"`/`aria-live="assertive"` so a screen reader announces it without the user having to go find it.
- **Any new colour** used for text should be checked against its background with the WCAG contrast formula before use — `--amber`, `--amber-deep`, `--text-mute`/`--text-muted`, and ten scattered inline greys (`#888`, `#999`, `#9CA3AF`) all failed AA (as low as 2.5:1) before this pass; the ones fixed now sit at 4.6–4.8:1.

## Environment variables

| Var | Purpose | If unset |
|---|---|---|
| `AI_API_KEY` | Anthropic key for the prose call | step 3 fails |
| `RATES_FILE_URL` | NRM1 v4.5 rates workbook | cost calc throws |
| `PROGRAMME_FILE_URL` | Programme v4.3 workbook | programme calc throws |
| `ACCESS_CODE` | Colleague gate code | fails closed in production; open in dev |
| `ADMIN_CODE` | Admin-area code for `/admin` + `/api/admin/*` (distinct from `ACCESS_CODE`; `estate_admin` cookie) | fails closed in production; open in dev |
| `COOKIE_SECRET` | HMAC key for access + admin cookies (`lib/cookieAuth.js`) | falls back to raw-code comparison (set this in prod) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Vercel KV (Upstash Redis) — persistence **and** rate limiting (`lib/rateLimit.js` reuses the same store; no separate rate-limit env var) | persistence disabled; rate limiting fails open (no-op) |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry error capture (`sentry.*.config.ts`, `instrumentation-client.ts`, `app/error.jsx` and friends) | error capture disabled (no-op) |

**Security:** `AI_API_KEY` never in committed code or output; read inside the request handler, BOM-stripped. `COOKIE_SECRET` must be a cryptographically random string (≥ 32 chars); generate once with `openssl rand -hex 32`. Sentry events are scrubbed by `lib/sentryScrub.js` before leaving the process — never send raw `answers`.

**`xlsx` is not installed from the npm registry.** `package.json` pins it to a SheetJS CDN tarball (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) because the npm-published `xlsx@0.18.5` has two unfixed high-severity CVEs (prototype pollution, ReDoS) that SheetJS only patches on their own CDN. `npm install` needs network access to `cdn.sheetjs.com` to work, and bumping this dependency means changing that URL to a newer SheetJS release, not `npm update`.

## Health check

`/api/rates-check` must confirm **both** workbooks load: `ratesOk` + a sample rate, and `programmeOk` + a real sample duration (DS2 S3 mid from the Durations sheet). Use it after every workbook edit. Gated by the access cookie and rate-limited like every other AI/workbook-touching route.

## Deployment

Hosted on **Vercel**. `npm run build` is the gate. Both `*_FILE_URL` workbooks must be reachable from the deployment. Run `npm audit` periodically — it had never been run before September 2026, when it turned up a critical Next.js RCE sitting in production undetected (see "Recent Work & Status"); it currently reports 0 vulnerabilities.

## Frontend Design Rules

When building or modifying any UI component, page, or interface in this app:

- **Aesthetic direction:** The tone is authoritative, precise, and refined — this is a professional capital works tool, not a consumer product.
- **Typography:** Use the established font trio (Playfair Display / DM Sans / DM Mono). Never introduce Inter, Roboto, Arial, or system-ui for new UI work. (`global-error.tsx` is the one deliberate exception — see its own comment: it's the last-resort boundary for a crash in the root layout itself, which is what loads the real fonts, so it can't safely depend on them.)
- **Colour:** Work from the established palette (`--navy`, `--amber`). Amber is a *sparingly used* accent — it should never dominate a surface. Check any new text colour against WCAG AA before using it (see "Accessibility patterns established" above) — several of the original palette's colours didn't pass and have since been darkened.
- **Motion:** CSS-only animations preferred. Avoid heavy JS animation libraries.
- **Backgrounds:** Never flat white. Use `--bg`, `--tint`, `--tint-2`, or the `panel-dark` class.
- **Production-grade only:** No placeholder content, no lorem ipsum, no half-built components committed to the repo.
- **Responsive:** Grids sized with `minmax(Npx, 1fr)` should use `minmax(min(Npx, 100%), 1fr)` instead — a bare `minmax(240px, 1fr)` doesn't shrink below 240px even when the viewport itself is narrower, which overflowed the page horizontally at ~320px on the scope picker and three other grids before this fix.

---

## Recent Work & Status

*(September 2026)* The app's core questionnaire → calculators → AI prose → report pipeline was already functionally correct when this round of work began. What follows was a five-phase reliability, security, correctness and accessibility pass (Part A of the working plan), plus a separate questionnaire UX reduction (Part B), plus a couple of bugs found by reviewing a real generated report afterward. Everything below is **done and verified** (build + lint + Vitest + a live regenerated report, not just read back) unless marked otherwise.

**The headline problem, and its fix.** Report generation failed close to 100% of the time on Vercel Hobby's 60-second function ceiling, because one request tried to do the deterministic maths *and* two sequential AI calls inside a single shared budget — a retry of a slow AI half had nowhere to come from. The fix (Phase 2, "Core architectural rule" above) splits generation into two requests: a deterministic phase that can't time out because it never touches the network, and an AI phase that gets a **fresh** 60 seconds on every attempt via a resumable, lock-protected KV record. This is the single most consequential change in this body of work — verified live against the real Anthropic API and the real database: deterministic phase ~1s, and a report that couldn't previously survive one slow API moment now just costs an extra round trip.

**Phase 1 — stop the bleeding.** Fixed a `maxDuration` mismatch that was silently killing invocations with no error handling at all; closed an admin-API hole that failed *open* when `ADMIN_CODE` was unset in production; gated two previously-open endpoints (`/api/warm-prose`, `/api/rates-check`) that were each a cheap way to burn API credit or exhaust function concurrency; scrubbed full questionnaire `answers` out of Sentry error payloads (`lib/sentryScrub.js`); wired up client-side Sentry, which had never actually been initialised (`instrumentation-client.ts` didn't exist); fixed `next.config.ts`'s dual `module.exports`/`export default` that made the entire Sentry build plugin dead code.

**Phase 2 — the two-phase split.** Covered above. Also: `lib/prose.js` was extracted from the route handler so both the resumable Phase 2 route and a same-request dev fallback (no KV configured) can share it.

**Phase 3 — correctness.** A `/report/[id]` page could silently render one project's costs against a *different* project's answers if the user had gone back to the questionnaire and started editing a second report without submitting it — fixed by using exactly what was submitted rather than re-merging the live localStorage draft. A programme with construction stages but no milestones showed its Gantt chart in the `.docx` but not on the web report (a nesting bug — the two now share one condition). The questionnaire submit path had three separate ways to show a false "network error" for a report that had actually generated successfully. `localStorage` reads/writes were unguarded, version-less, and could white-screen the app; there was no way to start a fresh report without manually clearing browser storage, and no error boundary anywhere except the root-layout-nuking `global-error.tsx`. All fixed; see "Data flow & key conventions" above for the current shape.

**Phase 4 — hardening.** Installing a rate limiter triggered `npm audit` for what was apparently the first time on this project, surfacing a **critical Next.js RCE** plus three riders (PostCSS, sharp) — fixed by bumping 16.2.6→16.3.5 (same major/minor line, not a breaking jump), confirmed with a full rebuild, relint, and a live end-to-end generation on the new version. Migrated `xlsx` off the abandoned, CVE-carrying npm registry version onto SheetJS's own patched CDN build. Added rate limiting to the five routes that needed it (see "Data flow & key conventions"). Removed the `/api/feedback` GET that leaked its auth key into URLs/logs. Added a logout route (there was previously no way to revoke either 30-day cookie). Permanently fixed the build/lint gate, which the three stray sibling projects in the repo root had been silently breaking. Added a real Vitest suite (33 tests) as a complement to the existing `scripts/baseline.mjs` snapshot harness — see "Commands" above for when to use which.

**Phase 5 — accessibility.** Brought the questionnaire's custom `RadioGroup`/`CheckboxGroup` (previously plain `<button>`s with zero ARIA semantics) up to full radiogroup/checkbox-group patterns including roving tabindex and arrow-key navigation; fixed a scope-picker collapsible header that was a keyboard-inoperable `<div onClick>`; fixed an invisible focus ring on the scope tiles' hidden native checkboxes; added dialog semantics and Escape-to-close to the feedback modal; added live regions to error/status banners; fixed three colour tokens and ten scattered inline greys that failed WCAG AA contrast; removed the dead `--blue` legacy token entirely; fixed a horizontal-overflow bug on four grids at narrow viewports. All verified live in a real browser (roving tabindex and `aria-expanded` toggling both confirmed via actual keyboard/click events, not just read as code). **Explicitly not done**, and worth doing before any client-facing move: ~29 sites across the questionnaire where a visible label and its input aren't formally associated via `htmlFor`/`id` (a lesser gap than the ones fixed — a screen reader can still read the nearby text in browse mode); full tokenisation of the remaining ~170 hardcoded hex literals (a design-system tidiness item, not a contrast failure); a GDPR/DPIA review of `app/privacy/page.jsx` against what actually leaves the system.

**Two bugs found by reviewing a real generated report.** After all of the above, a real report was read end-to-end (all 16 pages, every number re-derived by hand) and turned up two more issues, both fixed and verified against a freshly-regenerated report and its actual rendered PDF: (1) the AI had fabricated a specific, false claim that "the automated sense check raised a warning" about an NRM1 percentage rule — no such warning code exists (cross-checked against all seven real codes in `senseCheck.js`) — fixed with the thirteenth `AI_SYSTEM_PROMPT` rule described above; (2) two of the PDF's sixteen pages were wasted, near-blank pages caused by a missing `break-inside: avoid` on the section-header print CSS, described under "Report output" above.

**September 2026 assessment pass (second round).** A full reassessment of the app, questions and scope picker was written up and then implemented as five phases at £0 (see the plan's Context section for the list). Everything below is done, built, linted, unit-tested (164 Vitest cases as of the honest-progress-and-optionality slice, 2 skipping until the workbook is updated) and baselined (`scripts/__baseline__/before-phase1` → `after-phase4`: only the intended float/inflation deltas moved; phases 2–4 IDENTICAL):

- *Trust:* percentage rule trace + "How each percentage was derived" table; workbook base date and rate `Source` column (printed, never the generation date); confidence-linked range width (Tab 9); programme float applied with best case shown; FastTrack levers FT2–10 offered; Procurement decision sheet replaces hard-coded route/contract bands. Prompt now carries the build-up, the acceleration options, and "use exactly" for tender type / design responsibility.
- *Bugs:* the tier-2 preset ticking unpriceable `5.1b` (fixed at source by `priceable` flags in the picker, and in the workbook spec); External Works asks for site area; workbook plumbing no longer leaks into quantity labels; `per_kw` pricing type.
- *UK checks:* Q3.8 (conservation area, party wall, ecology) with fixed-rating risk seeds `CTX-*`, Tab 3 `higher-risk` rules, `BS1` Gateway 2 stage, `SV7` ecology survey; Q4.3a VAT position in the budget verdict; storeys to 7+. (A later September 2026 question-gating pass moved higher-risk-building status itself out of Q3.8 and onto a Section 1 derivation — Q1.2a storeys, Q1.3 building use, and a new Q1.6 height question — gated so it no longer applies to Demolition only or External works only; see `isHigherRiskBuilding()` in `lib/siteContext.js` and `lib/questionSets.js`.)
- *Questionnaire/report:* Q6.1 is an exclude-list and cost is never optional; Q4.4 capped at two with a primary; Q4.0 start date with calendar dates everywhere; `/sample` public report; number-leak guard on prose.
- *Features:* `/api/compare` + on-screen scenario panel; `/api/suggest-scope` + "Suggest scope from my objective".
- **The workbook side is the user's to apply** from `docs/workbook-changes-sept-2026.md`; until then the new parsers fall back to the previous behaviour and `/api/rates-check` reports which additions are still missing (`baseDate`, `rangeWidthsSheet`, `sourceColumnPresent`, `procurementSheet`, `newDurationRows`).

**What's outstanding**, roughly in order of what's most worth doing next:
- Apply the workbook spec above (v4.6 / v4.4) and re-run `npm test` — the two skipped tests then run for real.
- Consider Vercel Pro (Hobby's terms prohibit commercial use, and Pro removes the 60s ceiling the two-phase split works around) and a price book to source the rates — the two paid items from the assessment.
- The ~29-site label/`htmlFor` association gap and the full hex-literal tokenisation noted under Phase 5.
- `checkJs`/TypeScript conversion for `lib/*.js` — the plan calls this "incremental," not urgent; `allowJs` with no `checkJs` means most of the codebase's real logic is still untyped.
- A GDPR/DPIA review of `app/privacy/page.jsx`.
- A small number of pre-existing cosmetic lint items (a few `<a>`→`<Link>` swaps, some unescaped quotes) — deliberately left alone rather than rushed through pages that had just been carefully verified.
- The Word-doc PDF/`.docx` structural parity between `reportBuilder.js` and `ReportRenderer.jsx` should be spot-checked periodically — they're two independent implementations of the same report and have drifted before (the Q6.1 section-selection key mismatch, fixed earlier, is the precedent).
