# Review — DM-4-industrial

Verdict: Solid report — every figure reconciles, the region, scope, programme
and budget verdict all match the answers correctly, and no regression from
batch 1 recurred; the one real gap is that asbestos removal, a costed scope
item, never gets its own Risk Register line.

## Issues
| # | Severity | Category | Page | Report says | Expected (scenario) | Issue |
|---|---|---|---|---|---|---|
| 1 | Medium | Risk | 4 | Risk Register (R01–R07): Structural concerns, Structures attached to neighbouring buildings, Contaminated land, target date, budget shortfall, Party Wall Act, height/weight — no asbestos entry | Q2.3 added S-0001 Asbestos removal as a priced scope item (£36,000–£56,000) and Commercial Considerations/Next Steps both reference an asbestos survey | Asbestos removal is a significant costed scope item but has no Risk Register entry of its own. Q3.1 didn't tick "Asbestos known or suspected" (so the deterministic KI-ASBESTOS seed correctly didn't fire), but rule 8 of the system prompt lets the AI add its own risks beyond the seeds, and it did not add one here despite the item being priced and mentioned twice elsewhere in the report. |
| 2 | Low | Cost | 6 | "Works cost total 175,000" (Low column) | Line items (S-0001 36,000 + S-0002 54,000 + S-0004 32,000 + S-0007 40,000 + S-0067 14,000) sum to 176,000 | The Works Cost subtable's Low total is £1,000 short of its own line items (0.6%) — an independent-rounding artefact. The Project Cost table one page later (page 7) foots exactly to the pound, so this is confined to the works-cost subtotal. |

## Expectations
| Expectation | Result | Note |
|---|---|---|
| Cover/summary: title, Demolition only, Industrial/warehouse, 1,200 m², TF3 | Pass | All fields correct; region "West Midlands" is right for TF3. |
| Scope page lists Demolition, Asbestos removal, Contaminated land, Service diversions, Site clearance | Pass | All 5 items present, "5 priced scope items" stated and matches the works-cost table row count. |
| No level-of-intervention/specification content | Pass | None present anywhere in the report. |
| No storeys/building-height content | Pass | None present. |
| Risk register includes asbestos, structural, contaminated-land (Q3.1) + party-wall (Q3.8), no conservation-area risk | Partly | Structural (R02), structures-attached/party-wall (R02/R03), contaminated land (R04) and the Party Wall Act entry all present; no conservation-area risk (correct, Q3.8 doesn't include it here); no dedicated asbestos entry — see Issue 1. |
| Programme ends on/before 31 Mar 2027, or flags it can't | Pass | Clearly flagged as not achievable, ~28 weeks beyond target, in the exec summary, the "Target date" box and the risk register. |
| Budget verdict: shortfall against £120,000 | Pass | £202,000 shortfall against a £322,000–£504,000 gross range, stated identically in the exec summary, budget box, risk register and next steps. |
| Key findings/next steps reflect party wall and occupied neighbours, genuine Telford-area postcode | Pass | R02/R03 and Next Step 2 cover the party wall; region correctly reads West Midlands, not a fallback default. |
| No higher-risk-building content | Pass | None present. |

## Batch 2 — last round's fixes
1. Budget consistency across prose/risk register/constraints — **Pass**, identical £322,000–£504,000 range and £202,000 shortfall everywhere it's mentioned.
2. Region matches postcode — **Pass**, TF3 correctly reads West Midlands.
3. Financial Case present only when Q5.1 applies — **N/A**, Demolition only doesn't ask Q5; correctly absent per task instructions.
4. Planning determination shown alongside Stage 4 with Full planning/Stage 3 — **N/A**, DM-4 uses Prior approval and starts at Stage 3 (Concept already complete); the planning determination is nonetheless shown as its own row, consistent with the fix.
5. Higher-risk building / ecology stages only when applicable — **N/A**, no trigger present for DM-4; correctly absent.
6. No Specification on Demolition only; Q2.5 standards on Scope page — **Pass**, "standards: DNO" appears on the Scope page, no spec-level content anywhere.
7. Project cost table foots — **Pass** (page 7 foots exactly); the works-cost subtable is £1,000 short of its own line items (Issue 2), a much smaller and different table than the one this check targets.
8. Every Q3.1 known issue has its own entry, no duplicate reworded risk — **Pass**, all three known issues (Structural concerns, Structures attached to neighbouring buildings, Contaminated land) map to distinct entries.
9. No unwarranted "+x% for restricted working hours" — **Pass**, not applied; Industrial/warehouse isn't a trading-restricted use, so no such uplift is expected.

No recurrence of a High-severity regression found.
