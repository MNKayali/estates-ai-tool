# Review — DM-5-retail

Verdict: Mostly accurate and internally consistent, but a regression from
batch 1 has recurred — the Risk Register lists the same known issue
(asbestos) twice under different categories, which batch 1 specifically
fixed and the system prompt explicitly forbids.

## Issues
| # | Severity | Category | Page | Report says | Expected (scenario) | Issue |
|---|---|---|---|---|---|---|
| 1 | High | Regression | 4 | R01 (Health & Safety): "Asbestos is known or suspected in the building: removal under licence, notification periods and air testing add cost and time." R03 (Cost): "Asbestos known or suspected in the building: removal scope and cost are uncertain until a demolition survey confirms extent." | Q3.1 has one "Asbestos known or suspected" tick → one risk-register entry | The same Q3.1 known issue produces two separate Risk Register rows (R01 the deterministic KI-ASBESTOS seed, R03 an AI-added "Cost" reword of the same ground). Rule 9 of the system prompt explicitly says "Do not add your own risk covering the same ground as a seed... only the seeded entry may cover that ground" — this is exactly the "no two entries are the same risk reworded" defect batch 1 fixed (Batch 2 check #8), recurring here. |
| 2 | Low | Programme | 5 | "One client review gateway sit on the critical path before tender." | Correct English: "...gateway sits on..." | Grammar error from the hard-coded narrative builder (`programmeNarrativeLines()` in `lib/reportContent.js`), which appends "sit" unconditionally instead of pluralising on the gateway count. Reproducible whenever there is exactly one gateway. |
| 3 | Low | Programme | 5 | "A 11-week planning determination gates technical design." | The programme table shows Stage 4 (Technical Design) starting on day one in parallel with the 11-week planning determination, with an explicit "Awaiting LPA determination — tender on hold" row bridging the gap before tender | This fixed narrative line (same code path as Issue 2) is imprecise here: planning doesn't gate the *start* of technical design — both begin together — it gates the move into tender. The figures themselves are correct; only the wording is generic regardless of which stage the delay actually falls against. |
| 4 | Low | Cost | 6 | "Works cost total 22,000 / 34,000" | Line items (5,600+8,400+2,100+5,600=21,700 Low; 8,700+13,100+3,300+8,800=33,900 High) | The Works Cost subtable's totals are £300 (Low) / £100 (High) off its own line items — an independent-rounding artefact under 1%. The Project Cost table on page 7 foots exactly. |

## Expectations
| Expectation | Result | Note |
|---|---|---|
| Cover/summary: title, Demolition only, Retail, 180 m², BA1 | Pass | All fields correct; region "South West" is right for BA1. |
| Scope page lists Demolition, Asbestos removal, Site clearance, Fences/gates/walls | Pass | All 4 items present, "4 priced scope items" matches. |
| No level-of-intervention/specification content | Pass | None present. |
| No storeys/building-height content | Pass | None present. |
| Risk register includes asbestos/structural (Q3.1), conservation-area AND party-wall (Q3.8's two ticks) | Partly | Structures-attached/party-wall (R02, R05), conservation area (R06) all present and correct; asbestos is present but duplicated across two entries — see Issue 1. |
| Planning reflects Full planning at Developed design (Stage 3) — longer consent-dependent programme | Pass | Programme starts at Stage 4 (Stage 3 treated as complete); the 11-week planning determination is shown as its own row alongside Stage 4, with a bridging "tender on hold" row — confirms the batch-1 fix holds (see Batch 2 item 4). |
| Budget verdict: no stated budget, comparison correctly absent | Pass | Q4.3 was left blank; no budget box, no shortfall/surplus text anywhere in the report. |
| Standards/assumptions mention the "Other" text (historic building recording condition) and Highways | Pass | Scope page reads "standards: Highways, Historic building recording condition (planning requirement)." |
| No higher-risk-building content | Pass | None present. |

## Batch 2 — last round's fixes
1. Budget consistency — **N/A**, no budget was stated, and correctly no verdict is shown anywhere.
2. Region matches postcode — **Pass**, BA1 correctly reads South West.
3. Financial Case present only when Q5.1 applies — **N/A**, Demolition only doesn't ask Q5; correctly absent per task instructions (despite the scenario.md file carrying Q5.1/Q5.2 answers that were never actually entered into the form).
4. Planning determination shown alongside Stage 4 with Full planning/Stage 3 — **Pass**, confirmed holding (see Expectations table above; wording precision noted as Issue 3, but the stage itself is correctly present).
5. Higher-risk building / ecology stages only when applicable — **N/A**, no trigger present; correctly absent.
6. No Specification on Demolition only; Q2.5 standards on Scope page — **Pass**.
7. Project cost table foots — **Pass** (page 7 foots exactly); the works-cost subtable is off by £100–£300 (Issue 4), a smaller and different table.
8. Every Q3.1 known issue has its own entry, no duplicate reworded risk — **Fail**, see Issue 1 (High/Regression).
9. No unwarranted "+x% for restricted working hours" — **Pass** (not a recurrence). The build-up does add "0.5% for restricted working hours (assumed for trading retail premises)" without a Q3.5 tick, but this is by design: `lib/costCalculator.js` explicitly infers restricted hours for trading Retail/Hospitality premises unless the building is vacant/decanted (DM-5 is "Partially occupied", i.e. trading). The batch-1 bug this check guards against was specifically about a *vacant* building; that condition doesn't apply here.

One High-severity regression found: **Issue 1**, a recurrence of the "duplicate risk register entry" defect (Batch 2 check #8).
