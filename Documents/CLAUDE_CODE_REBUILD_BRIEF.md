# Claude Code Rebuild Brief — Estates AI Tool
**v1.0 · June 2026 · Nabil Kayali · Hand to Claude Code at the start of a fresh session**

---

## 0 · The prompt to paste into Claude Code

> Read this entire brief, plus `CLAUDE.md`, `MASTER_COORDINATION_MAP_v4_2.md` and `Q3_5_Access_Constraints_Spec.md` in `/docs`, before writing any code. The repo `MNKayali/estates-ai-tool` already builds and runs — this is a **targeted re-alignment**, not a from-scratch build. The two Excel workbooks have been updated (NRM1 v3.7, Programme v4.3); the calculators have drifted out of sync with them and with Questionnaire v7. Work through Phases 1–5 **in order**, run `npm run build` after each phase, and do not start a phase until the previous one builds clean. Do not change any cost or programme **number** in code — all numbers come from the two workbooks. Stop and ask me before acting on the two decisions flagged in Phase 3 and Phase 6.

---

## 1 · Non-negotiables (unchanged architecture)

- **The AI never calculates a number.** `costCalculator.js` and `programmeCalculator.js` produce every figure deterministically from the two workbooks; the single Claude call writes prose only.
- **Pipeline order** (`app/api/generate-report/route.js`): cost (programmeWeeks=0) → programme → cost again (now programme-aware) → one AI prose call → `reportBuilder.js`.
- **One number, one home.** NRM1 owns every £ and %. Programme owns every week. Questionnaire holds triggers only.
- **Environment:** Next.js 16 (App Router; middleware is `proxy.ts`). Windows host — use **PowerShell**, not Bash. No test framework: "verify" = `npm run build` + exercise in the browser. Node + `xlsx` npm package for any spreadsheet scripting.
- **Workbooks fetched at runtime** from `RATES_FILE_URL` / `PROGRAMME_FILE_URL`, cached 10 min, parsed with SheetJS.

---

## 2 · Documents in this handoff

| File | Put in | Role |
|------|--------|------|
| `CLAUDE_CODE_REBUILD_BRIEF.md` (this) | `/docs` | The work order |
| `CLAUDE.md` (updated) | repo root (replace existing) | Persistent repo guidance — corrected for v4.3 |
| `MASTER_COORDINATION_MAP_v4_2.md` | `/docs` | Single alignment reference |
| `Q3_5_Access_Constraints_Spec.md` | `/docs` | Programme + risk wiring for Q3.5 |
| `NRM1_Cost_Estimate_Tool_v3_7.xlsx` | GitHub → set `RATES_FILE_URL` to its raw URL | Cost source of truth (adds Tab 7 `Min_Level`) |
| `Estates_AI_Programme_v4_3.xlsx` | GitHub → set `PROGRAMME_FILE_URL` to its raw URL | Programme source of truth |
| `Questionnaire_v7_1_Amendments.md` | `/docs` + merge into master questionnaire | The six form-rule changes |
| `Estates_AI_Questionnaire_v7.docx` (→ v7.1 once amended) | `/docs` | Question + key reference |

**Before Claude Code starts:** upload both new workbooks to GitHub, copy the new raw URLs, and update the two env vars in Vercel (and `.env.local`). The old `_v3_5` / `_v4_2` files can stay or be deleted.

---

## 3 · Canonical question keys (Questionnaire v7) — the contract

The form must emit exactly these keys; both calculators must read exactly these. This is the single biggest source of current bugs — the code predates the v7 renumbering.

| Key | Question | Type |
|-----|----------|------|
| `q1_0_projectName` | Q1.0 | text |
| `q1_1_postcode` | Q1.1 | text |
| `q1_2_projectType` | Q1.2 | single |
| `q1_3_buildingUse` | Q1.3 | single |
| `q1_4_buildingAge` | Q1.4 | single |
| `q1_5_size` | Q1.5 GIFA m² | number |
| `q1_5_pvKwp`, `q1_5_battKwh`, `q1_5_evNr`, `q1_5_liftNr`, `q1_5_carParksNr`, `q1_5_extLightNr` | Q1.5 quantities | number |
| `q2_1_objective` | Q2.1 | text |
| `q2_2_scopeItems` | Q2.2 | array of **exact NRM1 Tab 7 label strings** |
| `q2_2_bathrooms`, `q2_2_kitchens` | Q2.2 sub-prompts | number |
| `q2_2_wiring` | Q2.2 wiring radio | one of `5.8` / `5.8a` / `5.8b` / `none` |
| `q2_2_additionalScope` | Q2.2 Other / specialist | `{ text, approxValue? }` — see §3A.3 |
| `q2_3_interventionLevel` | Q2.3 | one of the 4 tier strings |
| `q2_4_specLevel` | Q2.4 | `Basic` / `Standard` / `High` |
| `q2_5_standards` | Q2.5 | **free text (string)** — BREEAM etc. detected by substring |
| `q3_1_knownIssues` | Q3.1 | array |
| `q3_2_recentWorks` | Q3.2 | text |
| `q3_3_surveys` | Q3.3 | array |
| `q3_4_planningConsents` | Q3.4 | **single string (not array)** |
| `q3_5_accessConstraints` | Q3.5 | array |
| `q3_6_occupation` | Q3.6 | single |
| `q3_7_context` | Q3.7 | text |
| `q4_1_targetDate` | Q4.1 | text/date |
| `q4_2_budgetKnown` | Q4.2 | single |
| `q4_3_budget` | Q4.3 | number+array |
| `q4_4_priorities` | Q4.4 | array |
| `q4_5_designStage` | Q4.5 | single |
| `q4_6_phasing` | Q4.6 | `Single phase` / `Multiple phases` |
| `q4_7_funding` | Q4.7 | single |
| `q5_1_financialBenefit` | Q5.1 | **array (multi-select; "No direct return" exclusive)** |
| `q5_2_annualBenefit` | Q5.2 | text |
| `q6_1_sections` | Q6.1 | array |
| `q6_2_instructions` | Q6.2 | text |

## 3A · Questionnaire form behaviour (Questionnaire v7.1) — `app/questionnaire`

These are the six form rules confirmed by Nabil. They are frontend logic plus a few calculator touches.

**1 · Q2.3 gates Q2.2 (no contradictions).** Ask **Q2.3 Level of Works first**, then Q2.2 Scope. Read each scope item's `Min_Level (Q2.3)` from **NRM1 Tab 7 column F** and **disable/grey** any item whose `Min_Level` > the chosen Level, with a hint ("available at *Full systems replacement* and above"). So *Fabric and finishes only* cannot tick heating/rewire/ventilation. Group 3 finishes are always available (auto-included). Keep auto-escalation only as a backstop for the Other free-text. For New Build / External Works / Demolition (Q2.3 hidden), skip the Min_Level filter.

**2 · Filter Q2.2 by Q1.2 and Q1.3 (keep it short).** An item is shown only if **all** hold:
- its NRM1 element's group is in the groups listed for the project type in **Tab 4** (e.g. Refurbishment = 0,2,3,4,5,7,8; Fit-out = 3,4,5) — the main length-reducer;
- it is **not** hidden by the Q1.3 residential filter — for Residential building use, hide the non-domestic M&E lines: `5.9b` emergency lighting, `5.7a` sub-distribution/containment, `5.16` structured data cabling, `5.3` commercial AHU, `5.14` BEMS, `5.13` DNO upgrade, `5.18` access control/CCTV (hidden = not shown, not priced, not listed as an exclusion);
- its `Min_Level` ≤ the chosen Q2.3 Level (rule 1).

**3 · Other / specialist free text (`q2_2_additionalScope`).** The AI must **not** price this — pricing it would break the no-numbers rule (the old questionnaire line "AI will estimate cost using NRM1 benchmarks" is wrong and is removed). Behaviour:
- Always capture the text and list it as an explicit named inclusion in Scope of Works.
- If the user supplies `approxValue` (a number): add it deterministically as one **"Provisional sum — [text]"** line in the cost estimate (Group "Other", no band, no BCIS), clearly labelled provisional.
- If no value: list it as **"Provisional — to be quantified at Stage 2", excluded from the headline total**, with an assumption/risk note.
- The AI writes only the surrounding narrative; it never invents the figure.

**4 · Q2.5 Standards → single free-text box** (`q2_5_standards`, string). Detect triggers by case-insensitive substring: `BREEAM` → fee uplift (NRM1 C); Net zero / PAS 2035 / NHS / acoustic etc. → constraints note. (Trade-off vs the old multi-select: detection is keyword-based, so the BREEAM keyword must be spelled in full to fire the uplift.)

**5 · Q3.4 Planning consents → single choice** (`q3_4_planningConsents`, string, **not** array). Options: *No consent required · Permitted development · Prior approval · Full planning · Full planning + Listed Building Consent · Change of use · Unsure (pre-application advice)*. The combined option preserves the dual-consent case without an array. The calculator reads a single string (its existing `includes('full planning') && includes('listed')` branch still matches the combined option).

**6 · Q5.1 Financial benefit → multi-select** (`q5_1_financialBenefit`, array). Make **"No direct return" mutually exclusive** (selecting it clears the others; selecting any other clears it). If "No direct return" is set, hide the ROI section and Q5.2 and frame a strategic case instead.

### Phase 1 — Re-pin keys in both calculators

Fix these exact mismatches (current → correct):

| Where | Current | Change to |
|-------|---------|-----------|
| `costCalculator.js` fees (C) | `answers.q4_6_designStage` | `answers.q4_5_designStage` |
| `costCalculator.js` BREEAM | `answers.q2_4_breeam` | `String(answers.q2_5_standards||'').toLowerCase().includes('breeam')` (Q2.5 is now free text) |
| `costCalculator.js` quantities | `answers.q2_5_pvKwp` etc. | `answers.q1_5_pvKwp` etc. |
| `costCalculator.js` utilities | `answers.q4_8_utilities` + hard-coded risk % | **Remove** (see Phase 3 decision) |
| `programmeCalculator.js` phasing | `answers.q4_7_phasing` (`'2 phases'`/`'3 or more phases'`) | `answers.q4_6_phasing` (`'Multiple phases'`) → apply Modifiers `PH-1` |
| `programmeCalculator.js` funding | `answers.q4_9_funding`, exact `=== 'Grant or public funding'` | `answers.q4_7_funding`, match `includes('Grant or public')` → Modifiers `FN-1` |

Match option **text** with `includes()` / case-insensitive, never exact `===` against full option labels (they carry parenthetical suffixes).

**Verify:** a Stage 2 project now returns fees ≈ 11.5% (not 13.5%); a BREEAM tick adds +1% to C; a "Multiple phases" answer extends the programme; PV kWp entered at Q1.5 prices element 5.11.

---

## 4 · Phase 2 — Rebuild `programmeCalculator.js` to the Programme v4.3 schema

**This is the headline item.** The current parser reads the *old* layout (`Activity / Very Small / Small / Medium / Large`) and looks rows up by activity name, but v4.3 is ID-keyed with 6 numeric bands. Every lookup misses today, so the programme is silently built from hard-coded fallbacks — **the workbook is being ignored.** Rebuild as follows.

### 4.1 Parsers (exact 0-based columns)

**Sheet `Durations`** — header on row 4 (index 3); skip rows where `ID` (col 0) or `Type` (col 16) is blank (these are section banners):
```
0 ID · 1 Phase · 2 Activity · 3 S1_Lo · 4 S1_Hi · 5 S2_Lo · 6 S2_Hi · 7 S3_Lo · 8 S3_Hi
9 S4_Lo · 10 S4_Hi · 11 S5_Lo · 12 S5_Hi · 13 S6_Lo · 14 S6_Hi · 15 Unit · 16 Type
17 ParallelWith · 18 ScaledByQ2.3 · 19 Trigger · 20 Notes
```
Index rows by **ID** (DS2, DS3, DS4, GW, GW3, SV1–SV6, PL0–PL5, BC1–BC2, TN1–TN3). Store `{lo, hi}` per band and `type`, `parallelWith`, `scaledByQ23`, `trigger`.

**Sheet `Construction`** — skip blank/banner rows:
```
0 ID · 1 Project Type · 2 S1_Lo · 3 S1_Hi … 12 S6_Lo · 13 S6_Hi · 14 Unit · 15 Trigger
```
Match construction rows by the **Project Type name in col 1** (e.g. `New Build — Standard`). Row `Handover` is `CH1`.

**Sheet `Modifiers`**: `0 ID · 1 Modifier · 2 Applies To · 3 Type · 4 Value · 5 Trigger · 6 Notes`.

**Sheet `FastTrack`**: `0 LeverID · 1 Lever · 2 Trigger · 3 Action · 4 Weeks saved · 5 Trade-off`.

### 4.2 Size band — ONE function for design and construction
```
sizeBand(gifa): <150→0(S1) · ≤250→1(S2) · ≤500→2(S3) · ≤1500→3(S4) · ≤3000→4(S5) · else→5(S6)
```
Use `mid = (lo+hi)/2` per band. Read all four design size-dependent values from this single band.

### 4.3 Assembly order (from Programme v4.3 README — authoritative)
1. Size band from Q1.5.
2. **Start point from Q4.5**: Stage 0–1 → start at Stage 2; Stage 2 → start Stage 3 (drop DS2 + its gateway); Stage 3 → start Stage 4; Stage 4 → start at Procurement (drop all design). This replaces FastTrack FT1 — handle it here, deterministically.
3. Critical path = Stage 2 → GW → Stage 3 → GW3 → Stage 4 → GW → Procurement → Construction → Handover (omit any stage dropped in step 2).
4. **Design multiplier (Q2.3) is read from Modifiers `Q23-1..Q23-4` / `Q23-NB`** — NOT passed in, NOT from NRM1. Apply to Stage 2/3/4 base durations only (rows where `ScaledByQ2.3 = Y`). Do **not** scale UPLIFT/GATEWAY rows.
5. Add UPLIFT rows (`DS2a/DS2b/DS3a/DS3b/DS4a`) where their Trigger is met (see 4.5).
6. `GW3` only when band ≥ S3 (GIFA > 250). `GW` applied twice (after Stage 2, after Stage 4); 1 wk at S1, else 2.
7. **Planning** (`PL1–PL5`) runs parallel with Stage 3 but **gates** Stage 4: carry `max(Stage3, Planning)` — add only the overrun beyond Stage 3 to the total. `PL0` (Permitted development) = 0.
8. **Building control** (`BC1`, or `BC2` if FastTrack FT5 chosen) parallel with Stage 4; add only overrun beyond Stage 4.
9. **Tender** (`TN1` if works cost ≥ £100k, else `TN2`; `TN3` if FT4 chosen).
10. **Construction**: pick the row via `selectConstructionRow()`; apply, in this order, the **occupation** uplift (Modifiers `OCC-1/2/3`), the **access** uplift (Modifiers `ACC-1/ACC-2`, highest tier only — see Q3.5 spec), then **phasing** (`PH-1` if Q4.6 = Multiple phases).
11. **Handover** (`CH1`). **Funding governance** (`FN-1`, +4–8 wks) added pre-start if Q4.7 grant/public.
12. **Programme float** (`PROG-FLOAT`, +1 wk per 13) → report a best-case and a realistic (with-float) total.

### 4.4 FastTrack (MVP rule)
Auto-apply only **start point (Q4.5, step 2)** and **PD route (PL0)**. For every other lever whose Trigger is met (mostly `q4_4_priorities` includes Speed/Design quality, or a framework), **do not change the headline number** — instead pass the matched lever rows (id, action, weeks saved, trade-off) to the AI context so the programme narrative lists them as available accelerations with their risks.

### 4.5 Trigger evaluator
Implement `checkTrigger(triggerString, answers, derived)` handling exactly the conditions present in the workbook (enumerate from the `Trigger` columns). Key ones:
- `q1_4_age` Pre-2000 / Pre-1980 / Pre-1900 (asbestos SV1/SV2, heritage DS2b)
- structural in `q3_1` or `q2_2` (SV3, DS2a)
- `q1_2` Refurbishment/Fit-Out (SV4) · New Build/Extension/External (SV5) · +contaminated (SV6)
- `4+ M&E systems in q2_2` (DS3a, DS4a) — count Group-5 scope items
- labs/clinical/data centre in `q1_3`/`q2_2` (DS3b)
- `q3_4` Full planning / Listed / Prior approval / Change of use / Unsure / Permitted development (PL1–PL5/PL0)
- works cost ≷ £100,000 (TN1/TN2)
- Modifiers: `q2_3_interventionLevel`, `q3_6_occupation`, `q4_6_phasing`, `q4_7_funding`, `q4_1` hard deadline, `q3_5_accessConstraints`

### 4.6 Signature & ownership change
Change to `calculateProgramme(answers, costMidpoint)` — drop the `designMultiplier` parameter; read it from Modifiers. In `route.js`, stop passing the NRM1 design multiplier to the programme. NRM1 keeps the **cost** band (×0.80 etc.); Programme owns the **design-time** multiplier (×0.50 etc.).

**Verify:** edit one `Durations` cell (e.g. DS2 S3_Lo) in the workbook, push, redeploy → the programme total changes. Today it would not.

---

## 5 · Phase 3 — `costCalculator.js` corrections

1. **Tab 5 tier names data-driven.** `knownLevels` is hard-coded, so renaming a Q2.3 tier silently reverts the band to ×1.0. Read the tier labels from Tab 5 column A instead of a fixed set.
2. **Bathroom/kitchen fallback.** Current default for missing counts is GIFA/20 bathrooms and GIFA/100 kitchens (a 400 m² blank → ~20 bathrooms ≈ £40k phantom). Change the fallback to **0** and, if a sanitary/kitchen scope item is ticked but its count is 0, add a flagged assumption ("sanitary quantity not stated — excluded pending confirmation") rather than inventing a number.
3. **`per_element` + `specialist_m2`.** Keep the existing per-element-by-Unit pricing. Add handling so an element whose Tab 7 row is `specialist_m2` is priced on `q2_2_additionalScope.area` (fallback as noted in Tab 7), **without** the Q2.3 band, instead of full GIFA. Today these would price on full GIFA × band.
4. **Lock the scope-string contract.** There are three overlapping mechanisms (`scopeMap` from Tab 7, `COMBINED_CODES`, `labelToCode`) and `labelToCode` strings don't match Tab 7 (e.g. `'Gas boiler or plant — like-for-like replacement'` vs Tab 7 `'Gas boiler / plant like-for-like replacement'`). Make **Tab 7 the single source**: the form sends exact Tab 7 labels; delete `labelToCode`; keep `COMBINED_CODES` only for genuine one-tick-many-elements cases and document them in Tab 7.
5. **DECISION (ask Nabil): the specialist catalogue.** NRM1 v3.7 carries ~60 building-use-specific items (4.6–4.30, 5.21–5.29, 6.3–6.4, 8.10–8.13) that nothing currently selects. Recommended default for MVP: **defer** — route these through the Q2.2 "Other / specialist" free-text field (AI flags + provisional sum), and don't surface 60 extra checkboxes. Confirm before wiring or pruning.
6. **DECISION (ask Nabil): utility-capacity risk.** The old `q4_8_utilities` risk logic has no question in v7 and breaks the no-numbers rule. Recommended: **remove it.** If you want utility-capacity risk, add it as a proper Q3.1 option (e.g. "Inadequate incoming power/water") with a Risk (E) row in NRM1 Tab 3 — never in code.
7. **Other / specialist provisional sum (§3A.3).** Add handling for `q2_2_additionalScope`: if `approxValue` is a number, add one provisional-sum line (Group "Other", no band, no BCIS) using that user-supplied value; otherwise list it as provisional and **exclude from the total**. The AI never prices it.
8. **Single-string planning + free-text standards.** `q3_4_planningConsents` is now a single string — keep the existing string path (the `Array.isArray` join still works, and the combined "Full planning + Listed Building Consent" option matches the listed+full branch). `q2_5_standards` is now free text — BREEAM detection is the substring check from Phase 1.

---

## 6 · Phase 4 — Q3.5 risk-register wiring

Per `Q3_5_Access_Constraints_Spec.md`:
- Programme: read `ACC-1`/`ACC-2` from Modifiers (done in Phase 2 step 10).
- Risk register: in `route.js`, build a `q3_5` risk-seed array (the spec's table — constraint → risk, L, I, RAG, mitigation) and inject it into the AI context with an instruction to generate one register entry per selected constraint (none if "None"). The AI writes the prose; the *selection of which risks appear* stays deterministic. Apply the same pattern to `q3_1` known issues if not already seeded.

---

## 7 · Phase 5 — Update `CLAUDE.md` and the health endpoint

- Replace repo `CLAUDE.md` with the version in this handoff (it corrects the programme schema, workbook names and key convention).
- Extend `/api/rates-check` so it also parses **Programme v4.3** and returns a real sample (e.g. `programmeOk: true`, `sampleDuration: { id:'DS2', s3mid: <n> }`) — proving the programme workbook is being read, which it currently is not.

---

## 8 · Acceptance tests (all must pass before go-live)

1. **Determinism:** same answers three times → identical cost total **and** identical programme total.
2. **Cost is live:** edit a Tab 2 rate (e.g. 3.2 floor finishes Rfb Std), push, redeploy → the line and total change.
3. **Programme is live:** edit a `Durations` cell, push, redeploy → the programme total changes. *(New — impossible today.)*
4. **Key fixes:** Stage 2 design → fees ≈ 11.5%; BREEAM → +1% C; Multiple phases → longer programme; grant funding → +4–8 wks; PV kWp at Q1.5 → 5.11 priced; restricted-hours/term-time → ACC uplift + risk entries.
5. **Sanity totals:** an M&E-heavy occupied refurb no longer reads light vs the ~£900–£1,600/m² BCIS benchmark (validate against 2–3 real Warwick projects; calibrate rates in Tab 2 only).
6. `/api/rates-check` shows `ratesOk: true` **and** `programmeOk: true` with real samples.
7. **Form rules (§3A):** choosing *Fabric and finishes only* disables the M&E scope items; a Residential project hides the non-domestic M&E lines; a Fit-out shows only groups 3/4/5; an Other-scope entry with no value appears as a provisional exclusion (not in the total); "No direct return" hides the ROI section.

---

## 9 · Order of work (summary)
Phase 1 keys → build → Phase 2 programme rebuild → build → Phase 3 cost fixes (pause for the two decisions) → build → §3A questionnaire form rules (Q2.3-gates-Q2.2, Q1.2/Q1.3 filter, Other-scope, Q2.5 text, Q3.4 single, Q5.1 exclusivity) → build → Phase 4 Q3.5 risk → Phase 5 CLAUDE.md + health → run all acceptance tests. Commit after each phase with a clear message.

*End of brief.*
