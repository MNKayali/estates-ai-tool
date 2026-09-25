# Review — EW-4-residential

Verdict: Figures foot correctly and the budget/target-date verdicts are consistent throughout, but the batch-1 "no Specification on External works only" fix has regressed, and the EV charging exclusion is explained with a nonsensical, inconsistent reason.

## Issues
| # | Severity | Category | Page | Report says | Expected (scenario) | Issue |
|---|---|---|---|---|---|---|
| 1 | High | Regression | 1, 3 | Cover: "Specification \| Standard". Scope page: "External works only of 2,200 m² GIFA, standard specification, 8 priced scope items…" | Scenario: "No level-of-intervention, specification-level, storeys, building-age or higher-risk-building content — none apply to External works only." Batch-1 fix #6: "No 'Specification' on External works only / Demolition only reports." | Regression — specification level is shown on both the cover and the Scope page of an External works only report, exactly the bug batch 1 fixed. |
| 2 | Medium | Scope | 3 | "Selected but not priced — EV charging: not priced (quantity computes to zero for this building (e.g. no upper floors on a single-storey building))." | EV charging was explicitly added by the user (45 car-parking spaces; the story is "EV charging bays ahead of a fleet of new leaseholder cars"). | The stated reason is nonsensical for a car park on an External-works-only site — there are no storeys or "upper floors" because there is no building. The exact same sentence, unchanged, is used for a different excluded item (Solar PV) in EW-6-student's report, confirming it is generic boilerplate rather than a reason tailored to this project. |
| 3 | Low | Prose | 3, 4 | Scope page: "EV charging was selected but is not costed because the quantity computes to zero for this building type." Risk R01: "EV charging excluded from the estimate pending confirmed quantity, rate or code match, so true cost is understated." | One consistent reason for the same exclusion. | Two different, non-matching explanations are given for why EV charging wasn't priced — "computes to zero" vs. "pending confirmed quantity, rate or code match." |
| 4 | Low | Answers | 1, 3 | "2,200 m² GIFA" | Q1.5 for External works only is the external works area, not a Gross Internal Floor Area (no building exists on this project type). | The area is labelled "GIFA" throughout the report when there is no floor area to measure — a mislabelling, not a figure error. |

## Expectations
| Expectation | Result | Note |
|---|---|---|
| Cover/summary: title, External works only, Residential, 2,200 m², EX4 | Pass | All present and correct; region South West / location factor 0.97 correctly matches EX4. |
| Scope page lists typical-scope defaults plus car parking 45 and cycle storage 24 (user figures), plus EV charging and an enlarged bin store | Partly | Car parking (45, client figure) and cycle storage (24, client figure) are correct; Bin store — Medium is present; EV charging appears but is priced at zero with a confusing/boilerplate reason (see issues 2–3). |
| Risk register includes a tree/ecology risk and something about buried services or phased/restricted-hours working | Pass | R06 (trees/BS5837), R05 (underground services), R02/R03 (ecology survey, restricted hours) all present. |
| Programme reflects Permitted development and checks whether it can land by 15 Mar 2027 | Pass | No planning stage shown (correct for Permitted development); target date correctly flagged as missed by ~49 weeks. |
| Budget verdict: shortfall expected | Pass | Shortfall of ~£197,000 stated consistently in the summary, budget-check box, R07 and the constraints table. |
| Financial case names avoidance of compliance cost, no invented annual figure | Pass | "Not stated" / "Needs an annual figure" shown correctly, no number invented. |
| No level-of-intervention, specification-level, storeys, building-age or higher-risk-building content | Fail | Specification: Standard is shown on the cover and Scope page (issue 1). |
| Confidence grading reflects two user-entered quantities against several estimated ones | Pass | Grade D / High Uncertainty, consistent with 2 of 8 items being client figures. |
