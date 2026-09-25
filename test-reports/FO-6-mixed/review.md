# Review — FO-6

Verdict: The report correctly handles every "absent" case the scenario tests (no budget, no start date, no target-date check, no standards, no higher-risk content), but the works-cost table has a genuine footing failure — a recurrence of the batch-1 "project cost table foots" issue — plus a duplicated access-constraint risk entry.

## Issues
| # | Severity | Category | Page | Report says | Expected (scenario) | Issue |
|---|---|---|---|---|---|---|
| 1 | High | Regression | 6 | Works cost total Low £45,000 | Line items should sum to the displayed total (batch-1 fix, regression check 7) | The 14 line items' Low £ values sum to £47,000 (verified by hand: 3+6+9+6+3+3+2+1+2+2+3+3+2+2 = 47, in £000s), a £2,000 / 4.4% gap from the displayed £45,000 total — far larger than can be explained by ordinary independent-line rounding (compare FO-4/FO-5, where the same check found only a ~0.1% gap). High column sums exactly (70,000), so the fault is isolated to Low. The gap propagates downstream: preliminaries, overheads etc. are all calculated off the understated £45,000, and the discrepancy likely stems from this being a sub-£100k project — several individual lines round Low and High to the *same* displayed value (Data and IT £2,000–£2,000; Builder's work in connection £2,000–£2,000), consistent with rounding to the nearest £1,000 where CLAUDE.md documents £100 steps below a £100k project total. |
| 2 | Medium | Risk | 4 | R01 (HIGH, Technical): "No vehicle access constrains materials handling and waste removal..." R06 (MEDIUM, Procurement): "Narrow rear service lane with limited delivery window constrains contractor logistics and scheduling." | One risk register entry per underlying issue | R01 and R06 both describe the same underlying access constraint (Q3.5 "No vehicle access or restricted deliveries" plus the Q3.7 narrative about the narrow rear service lane), split across two categories and severities rather than consolidated into one entry. |

## Expectations
| Expectation | Result | Note |
|---|---|---|
| Cover/summary: [TEST2] Ground floor amenity refresh, Fit-out, Mixed use, 220 m², EC1 | Pass | All present; region correctly Inner London for EC1. |
| Scope page lists Strip-out, full finishes, Heating, Water and drainage, Power, Lighting, Toilets, Fixed joinery, Signage, Data and IT (no Security) | Pass | All present (p3, p6); Security correctly absent, no stray reference to it. |
| Risk register includes a drainage risk and an "unsure — surveys needed" risk (Q3.1) and a party-wall context risk (Q3.8) | Pass | R02 (drainage), R05 (building condition/surveys unknown) and R03 (party wall) each a distinct entry. |
| Confidence grade carries a deficiency for the missing/incomplete surveys (only Condition held) | Pass | Grade C (Limited); R05 and R07 both cite unconfirmed condition/quantities consistent with only a Condition survey being held. |
| Budget verdict: no comparison shown — Q4.3 was left blank | Pass | No "Budget check" box anywhere in the report; Executive Summary and Key findings make no shortfall/surplus claim. |
| Programme shows "No specific deadline" and no target-date check | Pass | Executive Summary: "No target completion date has been specified... programme achievability cannot be assessed"; no target marker on the programme chart, unlike FO-4/FO-5. |
| No "higher-risk building" content | Pass | None present; Fit-out correctly has no storeys/height questions. |
| Estimate Basis shows Basic spec level and no standards selected, at the smallest footprint (220 m²) | Pass | Scope page omits any "standards:" line (Q2.5 = None), consistent with FO-4/FO-5 which do show one; Basic specification confirmed on cover and scope page. |

## Batch 2 — confirmation of last round's fixes
- Region (check 2): EC1 correctly shows as Inner London — batch-1 fix holds, no recurrence.
- Project cost table foots (check 7): **does not hold** — see Issue 1 above, reported as High/Regression.
- Restricted-working-hours premium (check 9): correctly not applied (Q3.5 here is "No vehicle access", not "Restricted working hours", and the building is fully occupied, not vacant) — no recurrence.
- No Financial Case section (check 3, converse case): correctly absent since Q5.1 was left blank — no recurrence of the "financial case always present" defect.
