# Review — DM-6-mixed

Verdict: Clean report — every figure reconciles exactly (both cost tables
foot to the pound), the region, scope, risk register and programme all
match the answers correctly, and none of batch 1's fixes have regressed.

## Issues
None found.

## Expectations
| Expectation | Result | Note |
|---|---|---|
| Cover/summary: title, Demolition only, Mixed use, 2,600 m², PL4 | Pass | All fields correct; region "South West" is right for PL4. |
| Scope page lists Demolition, Contaminated land, Tree removal (4 nr), Service diversions, Site clearance | Pass | All 5 items present plus Asbestos removal, which the scenario's list doesn't mention but Q3.1 explicitly ticks "Asbestos known or suspected" — not a contradiction (per the brief's own guidance on "Use typical scope" additions), it directly answers that tick. "6 priced scope items" matches. |
| No level-of-intervention/specification content | Pass | None present. |
| No storeys/building-height content | Pass | None present. |
| Risk register includes ecological/bat-roost risk (Q3.8) and reflects "Unsure — surveys needed" (Q3.1), no conservation-area/party-wall risk | Pass | R03 (ecology/bat roost, with the May–September survey window called out) is present and correct; "Unsure — surveys needed" has no dedicated seed in the code (only "Asbestos known or suspected" through "Structures attached to neighbouring buildings" have named seeds) so it correctly surfaces only as the 2% addition in the risk-percentage build-up ("2% for unsure — surveys needed") rather than its own register row; no conservation-area or party-wall risk present, correctly. |
| Programme shows a survey/ecology-linked stage ahead of demolition | Pass | "Surveys — Ecology / bat survey, 1 Feb 27 – 22 Feb 27" is the first row in the programme detail, running parallel with early design. |
| Budget verdict: comfortably covered by the £900,000 stated budget | Partly | The report computes "tight," not "comfortable": the gross range is £652,000–£1,019,000, and £900,000 covers the low end with margin but not the top of the range, which is exactly what `budgetVerdict()` in `lib/senseCheck.js` is designed to report (status "sufficient" requires the budget to clear the *top* of the range). This is the correct output for the actual computed range — the scenario's "deliberately generous" assumption was optimistic relative to the Grade C −20%/+25% range width, not an app defect. |
| No Q5 financial-benefit content | Pass | No Financial Case section; Q5.1/Q5.2 were both left blank per the scenario. |
| No higher-risk-building content | Pass | None present. |

## Batch 2 — last round's fixes
1. Budget consistency across prose/risk register/constraints — **Pass**, identical £652,000–£1,019,000 range and "tight" verdict wording in the exec summary, the budget box, R05 and the constraints table.
2. Region matches postcode — **Pass**, PL4 correctly reads South West.
3. Financial Case present only when Q5.1 applies — **N/A**, Demolition only doesn't ask Q5; correctly absent, and the scenario itself leaves Q5 blank.
4. Planning determination shown alongside Stage 4 with Full planning/Stage 3 — **N/A**, DM-6 uses Prior approval and starts at Stage 2 (Concept only); the planning determination is nonetheless shown as its own row parallel with Stage 3, consistent with the fix.
5. Higher-risk building / ecology stages only when applicable — **Pass** for the ecology half: the ecology/bat survey stage is present and correctly triggered by the Q3.8 ecological-features tick; no higher-risk-building/Gateway 2 content appears, correctly, since Demolition only sits outside that gate.
6. No Specification on Demolition only; Q2.5 standards on Scope page — **Pass**; Q2.5 = "None" correctly produces no "standards:" text at all on the Scope page.
7. Project cost table foots — **Pass**, both the Works Cost table (page 6) and the Project Cost table (page 7) foot exactly to the pound on both Low and High columns — a stronger result than DM-4 and DM-5, where the works-cost subtable was off by a small rounding amount.
8. Every Q3.1 known issue has its own entry, no duplicate reworded risk — **Pass**. Asbestos has exactly one entry (R02); no two entries cover the same ground.
9. No unwarranted "+x% for restricted working hours" — **Pass**, not applied; Mixed use isn't a trading-restricted use and the building is vacant/decanted, so no uplift is expected either way.

No recurrence of any batch-1 issue found.
