# Estates AI Tool — Master Coordination Map
**Version 4.2 | June 2026 | The single reference that proves the document set agrees with no contradictions**

> Supersedes v4.1. Adds the six Questionnaire v7.1 form decisions (Q2.3 gates Q2.2; Q1.2/Q1.3 scope filtering; Other-scope handling; Q2.5 free text; Q3.4 single; Q5.1 multi-select), and the NRM1 **v3.7** `Min_Level` column that makes the Q2.3→Q2.2 dependency data-driven.

---

## The coordinated set (current versions)

| Document | Version | Owns | Status |
|----------|---------|------|--------|
| Questionnaire | v7.1 | Question wording + triggers + form rules. **No numbers.** | ✅ Amended (see §Form rules) |
| NRM1 Cost Estimate Tool | **v3.7** | Every £ rate AND every %. Pricing per element by Unit. Tab 7 `Min_Level`. | ✅ Updated |
| Programme Duration Reference | **v4.3** | Every duration in weeks; Q2.3 design multiplier; access (ACC) + FastTrack levers. | ✅ Updated (Q3.5 added) |
| Report Template | v2 (built in `reportBuilder.js`) | Fixed 9-section layout the AI fills. | ✅ Unchanged |
| Code (`costCalculator.js` / `programmeCalculator.js`) | repo `MNKayali/estates-ai-tool` | Deterministic arithmetic only. | ❌ **Out of sync** — rebuild per brief |
| Claude Code Build Brief | **v1.0 (this handoff)** | Rebuild spec incorporating this review. | ✅ Issued |

**The rule that prevents drift:** a number lives in exactly one document. The questionnaire holds triggers only. NRM1 owns every £ and %. Programme Reference owns every week. Update one cell — every future report follows.

---

## End-to-end chain

```
Questionnaire answer (q-key + trigger word)
   → tells the app WHICH lookup to perform
       → NRM1 v3.7 returns the £ / %          (cost)
       → Programme v4.3 returns weeks          (time)
           → numbers drop into the fixed report layout (reportBuilder.js)
               → one Claude call writes prose around fixed numbers
```

The cost engine runs **twice** (once with `programmeWeeks = 0`, then again after the programme is known) because Inflation (F) and the long-programme Prelims (A) trigger depend on programme length.

---

## Pricing resolution — the single most important cost rule (clarified v3.6, current v3.7)

Each ticked Q2.2 item maps (Tab 7) to one or more NRM1 elements. **How each element is priced is a property of the element, read from its Unit in Tab 2:**

| Tab 2 Unit | Pricing_Type | Formula | BCIS factor | Q2.3 band |
|-----------|-------------|---------|-------------|-----------|
| m² | `gifa_rate` | GIFA × rate × BCIS × band | yes | yes |
| Nr | `per_nr` | qty × rate × BCIS | yes | no |
| Item | `per_item` | 1 × rate × BCIS (or user `approxValue`) | no | no |
| m² (specialist) | `specialist_m2` | specialistArea × rate × BCIS | yes | no |
| kWp / kWh | `per_kwp` / `per_kwh` | qty × rate | no | no |

**`per_element`** (new in v3.6) marks a scope row whose elements have *different* units — e.g. *Toilets or wet rooms* → 4.2 (Nr) + 5.1 (m²). The calculator must price each listed element by its own unit. This removes the previous bug where 4.2 sanitary (£900–£3,500/**Nr**) and 4.4 specialist (£/**Item**) were mis-priced as £/m² whenever bundled with an m² element.

Quantities for `per_nr` items come from Q1.5 (PV/BESS/lift/EV) or Q2.2 sub-prompts: **4.2 = bathroom/wet-room count; 4.3 = kitchen count.** Both must be captured by the form and read by the calculator (see Outstanding).

---

## Q2.3 Level of Works — master alignment table (cost + time from one answer)

| Questionnaire v7 option | NRM1 v3.7 Tab 5 band | Programme v4.3 design mult. (Modifiers) | Group 0? |
|------------------------|----------------------|------------------------------------------|---------|
| Fabric and finishes only | × 0.80 | × 0.50 (Q23-1) | No* |
| Finishes with minor services | × 0.90 | × 0.70 (Q23-2) | No* |
| Full systems replacement | × 1.00 (baseline) | × 1.00 (Q23-3) | No* |
| Reconfiguration or full redesign | × 1.15 | × 1.30 (Q23-4) | Yes |
| _New Build / External / Demolition (Q2.3 not asked)_ | n/a (column from Q2.4) | × 1.00 (Q23-NB) | per Tab 4 |

\*Group 0 also included if demolition/asbestos/contamination ticked in Q2.2 or Q3.1. **All four tiers use m² rates** — the band only shifts position within the band. The cost band lives in NRM1 Tab 5; the design multiplier is now **owned by Programme v4.3 Modifiers**, not borrowed from NRM1.

---

## Questionnaire form rules (v7.1) — prevent contradictions, keep it short

1. **Q2.3 gates Q2.2.** Level of Works (Q2.3) is asked first; Q2.2 then enables only scope items whose **`Min_Level` (NRM1 v3.7 Tab 7 col F) ≤ the chosen Level**. *Fabric and finishes only* cannot tick M&E. Min_Level: 1 Fabric & finishes · 2 Finishes + minor services · 3 Full systems · 4 Reconfiguration. Auto-escalation is retained only as a backstop for the Other free-text.
2. **Q1.2 + Q1.3 filter the Q2.2 list.** Show an item only if its NRM1 group ∈ the project type's groups (Tab 4) **and** it is not hidden by the Q1.3 residential filter (hide 5.9b, 5.7a, 5.16, 5.3, 5.14, 5.13, 5.18) **and** Min_Level ≤ Q2.3.
3. **Other / specialist (`q2_2_additionalScope`).** The AI never prices it (the old "AI will estimate cost" line is removed). With a user `approxValue` → one deterministic *Provisional sum* line; without → listed as provisional and **excluded from the total**.
4. **Q2.5 Standards** → single free-text box; BREEAM etc. detected by substring.
5. **Q3.4 Planning** → single choice (incl. a combined *Full planning + Listed Building Consent* option); not an array.
6. **Q5.1 Financial benefit** → multi-select; *No direct return* is exclusive and hides the ROI section.

## Size bands — UNIFIED to one scheme (v4.3)

Programme v4.3 replaced the old split (design 4-band / construction 5-band) with **one 6-band scheme** used for both. The 250 m² boundary now lands cleanly on the S2/S3 line, so the Stage 3 gateway split needs no special case.

| Band | GIFA | Stage 3 client gateway |
|------|------|------------------------|
| S1 | < 150 m² | none (≤250 m² proceed straight to Stage 4) |
| S2 | 150–250 m² | none |
| S3 | 250–500 m² | 2 wks |
| S4 | 500–1,500 m² | 2 wks |
| S5 | 1,500–3,000 m² | 2 wks |
| S6 | > 3,000 m² | 2 wks |

> ⚠️ `CLAUDE.md` still documents the **old** band logic (design <150/<500/≤2000/larger; construction 5-band with a 250 split) and names the local workbook `Estates_AI_Programme_v4_1.xlsx`. The programme calculator must be rebuilt to the v4.2 schema (see Outstanding).

---

## Question → Report section → Data source (coverage matrix)

Every question feeds at least one section; every section has its inputs.

| Q | Feeds | Source |
|---|-------|--------|
| Q1.0 Name | Title/cover | — |
| Q1.1 Postcode | Cost region; planning authority | NRM1 Tab 6 |
| Q1.2 Type | Rate column + groups | NRM1 Tab 4; Programme Construction rows |
| Q1.3 Use | Benchmark tier; M&E/specialist triggers; residential filter | NRM1 Tab 2 (specialist rows); Programme CN2/CS1 |
| Q1.4 Age | Asbestos (E); heritage fee (C); surveys SV1/SV2 | NRM1 Tab 3; Programme Durations |
| Q1.5 Size | Quantity; size band; £100k threshold | NRM1 Tab 2; Programme bands |
| Q2.1 Objective | Exec summary tone | AI prose |
| Q2.2 Scope | Every priced line + exclusions | NRM1 Tab 7 → Tab 2 |
| Q2.3 Level | Cost band + design weeks | NRM1 Tab 5 + Programme Modifiers |
| Q2.4 Spec | Rate **column** | NRM1 Tab 5 |
| Q2.5 Standards | Fee uplift (BREEAM→C); constraints | NRM1 Tab 3; AI |
| Q2.6 Photos | Scope sense-check | AI |
| Q3.1 Issues | Risk register + Risk (E) | NRM1 Tab 3 |
| Q3.2 Recent works | Suppress double-count | AI |
| Q3.3 Surveys | Risk (E)/Dev (D); survey programme; FastTrack FT2 | NRM1 Tab 3; Programme SV/FT |
| Q3.4 Planning | Dev (D); planning weeks | NRM1 Tab 3; Programme PL1–PL5 |
| Q3.5 Access | Prelims (A) ✅ · programme uplift ✅ (ACC-1/2) · risk register ✅ (seeds) | NRM1 Tab 3; Programme Modifiers ACC-1/ACC-2; AI risk seeds |
| Q3.6 Occupation | Prelims (A); Risk (E); construction uplift | NRM1 Tab 3; Programme OCC |
| Q3.7 Context | Risk extraction | AI |
| Q4.1 Target date | Feasibility; Risk (E) hard deadline | Programme; NRM1 Tab 3; Modifiers DL-1 |
| Q4.2/4.3 Budget | Comparison/gap | AI vs NRM1 total |
| Q4.4 Priorities | Procurement route; FastTrack FT3/4/5/8/10 | Programme FastTrack |
| Q4.5 Design stage | Fees (C) band; programme start; FT1 | NRM1 Tab 3; Programme |
| Q4.6 Phasing | Construction uplift (PH-1); Inflation (F) | Programme Modifiers; NRM1 Tab 3 |
| Q4.7 Funding | Governance weeks; procurement note | Programme FN-1 |
| Q5.1/5.2 ROI | ROI section / strategic case | NRM1 mid-point |
| Q6.1 Sections | Render control | template |
| Q6.2 Instructions | Tone | AI |

**Verdict: no orphan questions, no starved sections. The remaining work is in the calculators, not the documents — see the issues table and the rebuild brief.**

---

## Issues found in this review and their resolution

| # | Severity | Issue | Resolution | Status |
|---|----------|-------|------------|--------|
| 1 | **Critical** | `programmeCalculator.js` reads the *old* workbook layout (Activity/Very Small…Large, name-keyed). v4.3 is ID-keyed with S1–S6 numeric bands + Modifiers/FastTrack tabs. Every lookup misses → programme built from hard-coded fallbacks; **the workbook is ignored.** | Full rewrite to v4.3 schema. | ⏳ Brief Phase 2 |
| 2 | **Critical** | Question-key drift vs Questionnaire v7: design stage read as `q4_6` (is Q4.5); phasing `q4_7` (is Q4.6); funding `q4_9` (is Q4.7); BREEAM `q2_4` (is Q2.5); phantom `q4_8_utilities`; PV/EV/lift qty `q2_5_*` (is Q1.5). All fail silently to defaults → wrong fees, no BREEAM uplift, no phasing/grant time. | Re-pin keys both calculators. | ⏳ Brief Phase 1 |
| 3 | Moderate (was mis-rated Critical) | 25 Tab 7 `Pricing_Type`/`Apply_Band` cells were blank. **Correction:** the calculator does **not** read these columns — it prices per element by Tab 2 Unit. So no live mis-pricing; the blanks were a latent/documentation trap. | Populated all 25 (incl. `per_element`). Aligns the workbook with its stated contract and matters if the rebuild reads Tab 7. | ✅ NRM1 v3.7 |
| 4 | Moderate | Specialist catalogue (4.6–4.30, 5.21–5.29, 6.3–6.4, 8.10–8.13) is unselectable and `specialist_m2` items carry Unit `m²` → would price on full GIFA × band. | Price `specialist_m2` on `additionalScope.area` (no band); **decision**: defer catalogue to "Other/specialist" path for MVP. | ⏳ Brief Phase 3 |
| 5 | High | Tab 5 read confirmed: band multiplier + design multiplier read via regex (editable). But rate-column choice and the four tier names are hard-coded → renaming a tier silently reverts to ×1.0. | Read tier labels from Tab 5 col A. | ⏳ Brief Phase 3 |
| 6 | Moderate | Bathroom/kitchen counts ARE read (`q2_2_bathrooms/_kitchens`), but the no-input fallback invents GIFA/20 bathrooms, GIFA/100 kitchens. | Fallback → 0 + flagged assumption. | ⏳ Brief Phase 3 |
| 7 | **Resolved** | Q3.5 Access promised a programme uplift with no Modifier, and was not feeding the risk register. | Added `ACC-1` (×1.10) / `ACC-2` (×1.175) to Programme Modifiers (highest tier only); risk seeds specced for the register. | ✅ Programme v4.3 + Q3.5 spec |
| 8 | Low | Scope matching uses three overlapping mechanisms; `labelToCode` strings don't match Tab 7. | Make Tab 7 the single source; delete `labelToCode`. | ⏳ Brief Phase 3 |
| 9 | Low | Stale version refs (questionnaire header, `CLAUDE.md`, plan/guide). | `CLAUDE.md` reissued; bump others to NRM1 v3.7 / Programme v4.3. | ⏳ Housekeeping |
| 10 | **Critical (architecture)** | Questionnaire said the AI would *estimate the cost* of the Other/specialist free-text — breaks the "AI never calculates a number" rule. | AI never prices it; user `approxValue` → deterministic provisional sum, else excluded from total. Wording removed. | ✅ Specced (brief §3A.3) |
| 11 | Design | Q2.3 and Q2.2 could contradict (Fabric-only + all M&E). | Q2.3 gates Q2.2 via Tab 7 `Min_Level`. | ✅ NRM1 v3.7 + brief §3A.1 |
| 12 | Design | Q2.2 list too long / not relevant. | Filter by Q1.2 groups (Tab 4) + Q1.3 residential hide-list. | ✅ Brief §3A.2 |
| 13 | Design | Q2.5 → free text; Q3.4 → single; Q5.1 → multi-select (exclusive "No direct return"). | Keys + behaviour updated. | ✅ Brief §3 / §3A.4–6 |

---

## Carried-over resolutions (still valid from v3.x)

- Q2.3 "Like-for-like" tier retired; four m²-rate tiers; LFL boiler is now scope item **5.2L**.
- 5.9 split into **5.9a** (fire alarm) + **5.9b** (emergency lighting).
- 4.2 sanitary = **Nr** (bathroom count); 4.3 kitchen = **Nr** (kitchen count).
- Contingency (H) **fixed at 5%**; survey uncertainty sits in Risk (E) only.
- Building-use filter (Q1.3): residential hides non-domestic M&E lines.
- Auto-escalation: ticking a scope item deeper than the chosen Q2.3 level raises the level and notes it.

---

## Maintenance — how to update

| To change… | Edit… | Live after… |
|-----------|-------|-------------|
| Any cost rate | NRM1 v3.7 Tab 2, one cell | next report (10-min cache) |
| Any percentage rule | NRM1 v3.7 Tab 3, one row | next report |
| Any duration | Programme v4.3 Durations/Construction, one cell | next report |
| Q2.3 design multiplier | Programme v4.3 **Modifiers** | next report |
| BCIS factor | NRM1 v3.7 Tab 6 | next report |
| Add scope item | Q2.2 + NRM1 Tab 7 (+ Tab 2 if new element) + code | after deploy |
| Report layout/wording | `reportBuilder.js` | after deploy |

**After every Excel edit:** open `/api/rates-check` to confirm the workbook still loads.

---

*End of Coordination Map — Estates AI Tool — v4.2 — June 2026 — Nabil Kayali*
