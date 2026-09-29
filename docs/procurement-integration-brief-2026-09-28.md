# Brief — add the Procurement Reference workbook to the report

**For:** Claude Code, working in the Projento repo
**Workbook:** `Projento_Procurement_Reference_v2.xlsx` — already placed in the repo root, next to the other workbooks, but not yet committed
**Date:** 28 September 2026

## Goal

Replace the current procurement recommendation (Section 6) with a **deterministic selection driven by a third workbook**. This follows the same pattern as the NRM1 and Programme workbooks: the workbook decides, code applies it, and the AI only writes prose about what code selected.

- **Four drivers:** Value · Duration · Risk · Client top priority
- **Four outputs, each with a Preferred and an Alternative:** Procurement route · Commercial model · Route to market · Contract type (JCT and NEC4)

Read `0. Read Me` in the workbook before you start. It holds the rules in plain English, and this brief must match it.

---

## 1. Hosting and loading

- The workbook is in the repo root and not yet committed. The other workbooks are served from `raw.githubusercontent.com/MNKayali/estates-ai-tool/main/…`, so a `main` URL only works once the file has been merged to `main`. Until then, use the branch URL for development, then switch. Add `PROCUREMENT_FILE_URL` to `.env.local`, `.env.local.example`, Vercel, and the env-var table in `CLAUDE.md`.
- Create a new `lib/procurementCalculator.js`. It fetches the file, parses it with SheetJS and caches it in-module for 10 minutes, the same way the other calculators do. If the file can't be reached, throw a clear error.
- Read sheets by exact name: `1. Drivers`, `2. Options`, `3. Contracts`. **Ignore** `0. Read Me` and `4. Check`. Tab 4 is a manual test tab with formulas.
- Read columns by header text, not by position.
- `1. Drivers` cells D4 and D28 are formulas. Read their cached value (`cell.v`). If either is blank, throw: it means the file was saved without recalculating.

## 2. Workbook structure

| Sheet | Content |
|---|---|
| `1. Drivers` | Rows 2–18: `Driver · Code · Level (column name in tab 2) · From (project value is at least) · Questionnaire answer / meaning · Source in the app`. Weights: rows whose column A starts `Weight —` (Value, Duration, Risk, Client top priority), with the value in column D (currently 1, 1, 1, 2). Rows 27–28: works threshold incl. and excl. VAT. |
| `2. Options` | One row per option. `ID` is PR1–PR4 for procurement routes, CM1–CM5 for commercial models and RM1–RM6 for routes to market. Other columns: `Output · Option · What it is · Best when · Watch-outs · Works with routes` (commercial models only; route IDs separated by `;`) `· Client` (All / Public only / Private only). These are followed by 17 score columns. Each score column's header equals a level name in Drivers column C, and each score is `0`, `1`, `2` or `X`. A footnote row sits below the table, so stop at the first blank `ID`. |
| `3. Contracts` | `Key` (`PRx\|CMy`) `· Route + commercial model · JCT — V1 under £1m · JCT — V2 £1m to threshold · JCT — V3/V4 above threshold · NEC4 equivalent · Notes` |

## 3. Driver values (all deterministic, from existing outputs)

- **Value:** the construction cost mid-point **excl. VAT** from `costCalculator`, at contract-sum level (works + preliminaries + OH&P). Exclude professional fees, client risk and VAT. Use the second cost pass, which runs after the programme. Say in a code comment which field you used.
- **Duration:** construction-only weeks from `programmeCalculator`.
- **Risk:** the number of risk-register seeds that apply to this project and have `rating === 'High'`. The ratings are set in code in `lib/prose.js` (checked), not by the AI. If the seeds are only built in Phase 2, compute them in Phase 1 as well; `ensureSeedRisks()` is pure.
- **Client top priority:** comes from the new follow-up question (see §6). Fallback: if only one option is ticked in Q4.4 (`q4_4_priorities`), use it. Otherwise use the first ticked option in the questionnaire's option order.
- **Public client:** comes from the new Yes/No question (see §6). If it is unanswered, exclude both `Public only` and `Private only` options.

**Levels.** For Value, Duration and Risk, the level is the **highest** level in that driver's rows whose `From` ≤ the project value. For priority, the level is the row whose column E equals the answer text exactly.

## 4. Selection algorithm (must match the Read Me)

For each option:
1. Read its four scores for the project's four levels. If any score is `X`, exclude the option.
2. Apply the client filter.
3. Score = sV·wV + sD·wD + sR·wR + sP·wP. The maximum is currently 10.

Then:
- **Procurement route:** rank by score, highest first. Ties go to the earlier row. Preferred = 1st, Alternative = 2nd.
- **Commercial model:** for the **preferred route**, consider only models whose `Works with routes` contains that route ID. Split on `;` and trim, and use an **exact ID match, not a substring match**. Pick the best score, with ties going to the earlier row. Repeat for the **alternative route**.
- **Contract:** build the key `${routeId}|${modelId}`. Pick the JCT column by value level: V1 uses the V1 column, V2 the V2 column, and V3 and V4 both use the "above threshold" column. Add the NEC4 and Notes columns. **If the key is missing, throw a workbook error. Don't guess.**
- **Route to market:** rank all eligible options. Preferred = 1st, Alternative = 2nd.

Return JSON along these lines:

```js
{
  drivers: { valueGBP, valueLevel, weeks, durationLevel, highRisks, riskLevel, priority, priorityLevel, publicClient },
  preferred:   { route: {id, name, score, whatItIs, bestWhen, watchOuts}, model: {…}, contract: {jct, nec4, notes}, routeToMarket: {…} },
  alternative: { …same shape… },
  maxScore
}
```

## 5. Pipeline and report

- Run the calculator in **Phase 1** (`generate-report`), after the second cost pass and the programme and before `createReport()`. Store the result on the record. The AI plays no part in this step.
- **Section 6 Procurement:** the current route and contract choice lives in `lib/programmeCalculator.js`, which produces *"Traditional — Single Stage Tender | Contract: JCT Standard Building Contract 2024"*. Replace it with this calculator. The programme uses the route for the tender period (TN1–3), so avoid a circular dependency: construction weeks must not depend on the route. Feed the preferred route into the tender period, and tell me how you ordered the steps. Replace it with a small table: rows are Procurement route / Commercial model / Contract (JCT) / Contract (NEC4) / Route to market, and columns are Preferred / Alternative. Follow the table with short prose.
- The procurement prose (the `PROSE_TOOL_RISK` half) receives **only** the procurement JSON for this section.
- Add a rule to `AI_SYSTEM_PROMPT` with two parts:
  - The AI must not name any procurement route, commercial model, route to market or contract form that is not in the procurement JSON.
  - It must present the preferred and alternative as options for the client to consider, not as a decision.
- Keep the two prose schemas disjoint.
- Update `reportBuilder.js` and `ReportRenderer.jsx` together, so the two stay in parity.
- Tender durations still come from the Programme workbook (TN1–3). Don't move them.

## 6. Questionnaire changes (I'll confirm the wording before release)

1. After Q4.4, add **"Which ONE of these matters most?"** as a single choice. Show only the options ticked in Q4.4, and hide the question if only one was ticked. Propose a key that fits the `q4_4_*` convention.
2. Add **"Is the client a public-sector body, or eligible for public frameworks (e.g. a housing association)?"** as Yes / No. Propose where it goes and what its key is.
3. Old drafts that lack these keys must still work, using the §3 fallbacks. Bump `STORAGE_SCHEMA_VERSION` only if the draft shape requires it.
4. Update `Documents/Questionnaire_v7_1_Amendments.md`.

## 7. Health check and tests

- Update `/api/rates-check`: add `procurementOk` plus a sample check (15 options, 11 contract rows, weights read).
- Add `lib/__tests__/procurementCalculator.test.js`, run against the real workbook. Pin these results, which come from the current workbook; update them if any scores are edited.

| # | Cost excl. VAT | Wks | High risks | Top priority | Public | Route (pref / alt) | Model (pref / alt) | Route to market (pref / alt) |
|---|---|---|---|---|---|---|---|---|
| 1 | £3,500,000 | 52 | 5 | Fixed/certain final cost | Yes | Design and build (single stage) 9 / Traditional 8 | Lump sum / Lump sum | Framework — mini-competition 10 / Selective tender 9 |
| 2 | £3,500,000 | 52 | 5 | Minimise disruption | Yes | Two-stage (PCSA) 8 / Design and build (single stage) 7 | Target cost / Target cost | Framework — direct award 9 / Framework — mini-competition 8 |
| 3 | £300,000 | 12 | 0 | Speed | Yes | Traditional 6 / Design and build (single stage) 6 | Lump sum / Lump sum | Quotations 9 / Framework — direct award 8 |
| 4 | £8,000,000 | 60 | 5 | Speed | Yes | Two-stage (PCSA) 10 / Construction management 8 | Target cost / Cost reimbursable | Framework — direct award 9 / Framework — mini-competition 8 |
| 5 | £30,000,000 | 90 | 3 | Design quality | Yes | Construction management 9 / Two-stage (PCSA) 8 | Cost reimbursable / Target cost | Selective tender 9 / Framework — mini-competition 8 |
| 6 | £2,000,000 | 40 | 2 | Lowest cost | No | Traditional 9 / Design and build (single stage) 7 | Lump sum / Lump sum | Selective tender 10 / Open tender 8 |

Contract check for case 1: the preferred JCT is *"JCT Design and Build (DB); ICD where the contractor designs only part"*, and the alternative is *"JCT Intermediate (IC); ICD where the contractor designs part (e.g. M&E)"*.

Also add unit tests for:
- **`X` exclusion.**
- **Exact-ID matching** in `Works with routes`.
- **Ties** going to the earlier row (case 3 is a tie).
- **Client filter:**
  - Public = No: no framework options.
  - Public = Yes: no Negotiated.
  - Public unknown: neither.
- **Level boundaries:**
  - £999,999 → V1; £1,000,000 → V2; £4,327,500 → V3; £20,000,000 → V4.
  - 26 weeks → D1; 27 → D2; 52 → D2; 53 → D3.
  - 1 High risk → R1; 2 → R2; 4 → R3.

**Done means:** `npm run build` and `npm test` both pass, and one live report is generated with Section 6 checked on screen, in the `.docx` and in the PDF.

## Known dependencies

- **Phasing bug.** The programme currently adds phases end to end: about 123 construction weeks for Lakeside instead of about 52. That pushes phased projects into D3 and changes their result. Fix it first, or in the same piece of work.
- **Rate base.** The refurbishment rate base is currently low, so some projects fall into a lower value level than a QS would put them in. The procurement logic is right; its input will improve once the rates are recalibrated.
