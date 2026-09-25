# Review — EW-5-hospitality

Verdict: Scope, risks, the Full-planning-alongside-Stage-4 programme fix, and the budget/financial-case figures all carry through correctly, but the batch-1 "no Specification on External works only" fix has regressed, the works-cost table doesn't quite foot, and two small prose/layout bugs are present.

## Issues
| # | Severity | Category | Page | Report says | Expected (scenario) | Issue |
|---|---|---|---|---|---|---|
| 1 | High | Regression | 1, 3 | Cover: "Specification \| Standard". Scope page: "External works only of 460 m² GIFA, standard specification, 7 priced scope items…" | Scenario: "No level-of-intervention or specification-level content… none apply to External works only." Batch-1 fix #6: "No 'Specification' on External works only / Demolition only reports." | Regression — same bug as EW-4-residential and EW-6-student: specification level shown on an External works only report. |
| 2 | Medium | Cost | 6 | Works-cost table High column: 6,000+25,000+17,000+7,000+11,000+6,000+3,000 = £75,000, but "Works cost total" is printed as £74,000. | Rows should add to the printed subtotal (the project-cost table on page 7 does foot exactly). | £1,000 footing discrepancy in the works-cost breakdown table's High column. |
| 3 | Low | Prose | 5 | "One client review gateway sit on the critical path before tender." | Grammatically correct singular/plural agreement. | Should read "gateway sits" — a pluralisation bug in the programme narrative template (EW-4-residential's equivalent line correctly reads "Two client review gateways sit" for a count of 2). |
| 4 | Medium | Layout | 5 | Programme milestone bar renders M4 (23 Aug 2027) and M5 (13 Sept 2027) as a run-together "M4 AugM257 Sept 27" | Milestone labels legible and non-overlapping, as achieved for similarly close milestone pairs elsewhere (e.g. EW-6-student's M3/M4, also 3–4 weeks apart, render cleanly on separate lines). | The M4 and M5 milestone labels appear to overlap/collide in this report's gantt bar — reproduced identically across two independent text-extraction passes of the PDF. |
| 5 | Low | Answers | 1, 3 | "460 m² GIFA" | Q1.5 for External works only is the external works area, not GIFA. | Area labelled "GIFA" when there is no floor area on this project type. |

## Expectations
| Expectation | Result | Note |
|---|---|---|
| Cover/summary: title, External works only, Hospitality / leisure, 460 m², BA1 | Pass | All correct; region South West / location factor 0.97 correctly matches BA1. |
| Scope page lists the seven individually ticked items, the small retaining wall option, and cycle storage at 8 as the user's figure | Pass | All seven items present, "Retaining walls and earthworks — Small" shown, cycle storage 8 Nr marked "client figure." |
| Risk register includes a conservation-area/heritage risk and something about the trading operation or narrow-lane access | Pass | R05 (conservation area, full planning) and R06 (trading throughout, narrow rear lane) both present. |
| Programme includes a Full planning stage consistent with Stage 3 developed design, no hard target date | Pass | Planning consent determination correctly runs parallel with Stage 4 (confirms batch-1 fix #4 holds); no target-date shortfall/overrun language since Q4.1 is "No specific deadline." |
| Budget verdict: comfortably within budget | Pass | Headroom of ~£129,000 above the top of the range, consistent in summary and budget-check box. |
| Financial case includes the stated £35,000 annual income tied to Q5.1 | Pass | £35,000 shown, payback 2.5 years, consistent with the £87,000 mid-point cost figure used. |
| No level-of-intervention or specification-level content, no storeys/building-age/height/higher-risk content | Fail | Specification: Standard is shown on the cover and Scope page (issue 1). |
| Confidence grading reflects one user-entered quantity against several estimated ones, plus the high-water-table issue | Pass | Grade C / Limited Confidence; R07 explicitly cites typical-ratio quantities for roads, paving, landscaping and fences; R04 covers the high water table. |
