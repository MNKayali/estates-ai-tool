# Review — EW-6-student

Verdict: Scope, risks, and the "no invented budget verdict" behaviour are all correct, but the batch-1 "no Specification on External works only" fix has regressed, the programme appears to drop the Prior Approval planning process entirely, and there's a minor cost-table footing slip.

## Issues
| # | Severity | Category | Page | Report says | Expected (scenario) | Issue |
|---|---|---|---|---|---|---|
| 1 | High | Regression | 1, 3 | Cover: "Specification \| Standard". Scope page: "External works only of 5,200 m² GIFA, standard specification, 8 priced scope items…" | Scenario: "No level-of-intervention, specification-level, storeys, building-age or higher-risk-building content — none apply to External works only." Batch-1 fix #6: "No 'Specification' on External works only / Demolition only reports." | Regression — same bug as EW-4-residential and EW-5-hospitality: specification level shown on an External works only report. |
| 2 | High | Programme | 5 | Programme narrative: "No planning application is assumed; building control approval runs alongside technical design." No Planning stage appears anywhere in the Programme detail table (Governance → Tender → Construction → Handover → Float only). | Q3.4 Planning consent = "Prior approval" — a formal application to the local planning authority with its own determination period, distinct from Permitted development (no application). | Prior approval is treated identically to "no application needed." The report shows no planning determination stage at all and uses the exact same boilerplate sentence as a Permitted-development scenario (EW-4-residential), which would understate the programme and leave the client unaware a Prior Approval submission and wait are required. |
| 3 | Medium | Scope | 3 | "Selected but not priced — Solar PV: not priced (quantity computes to zero for this building (e.g. no upper floors on a single-storey building))." | A plausible, project-appropriate reason for excluding Solar PV from the cost estimate. | This is the identical sentence used for EV charging's exclusion in EW-4-residential's report (only the item name changed), confirming it is generic boilerplate rather than a reason tailored to the item or project type — there is no building or storeys on an External-works-only site. |
| 4 | Low | Prose | 5 | "A 6-week governance approval sit on the critical path before tender." | Grammatically correct singular/plural agreement. | Should read "approval sits" — the same pluralisation bug as EW-5-hospitality's "gateway sit." |
| 5 | Medium | Cost | 6 | Works-cost table Low column: 1,000+36,000+90,000+108,000+43,000+22,000+41,000+4,000 = £345,000, but "Works cost total" is printed as £344,000. | Rows should add to the printed subtotal (the project-cost table on page 7 does foot exactly). | £1,000 footing discrepancy in the works-cost breakdown table's Low column — the same class of rounding slip as EW-5-hospitality's works-cost table. |
| 6 | Low | Answers | 1, 3 | "5,200 m² GIFA" | Q1.5 for External works only is the external works area, not GIFA. | Area labelled "GIFA" when there is no floor area on this project type. |

## Expectations
| Expectation | Result | Note |
|---|---|---|
| Cover/summary: title, External works only, Student accommodation (PBSA / halls), 5,200 m², L7 | Pass | All correct; region North West / location factor 0.92 correctly matches L7. |
| Scope page lists typical-scope defaults plus cycle storage at 180 (user figure), EV charging and Solar PV as separate renewables lines | Partly | Cycle storage 180 Nr marked "client figure" and EV charging is priced correctly; Solar PV is listed but unpriced with a confusing generic reason (issue 3). |
| Risk register includes a ground-conditions risk and something about restricted vehicle access or the fixed summer-only window | Pass | R05/R06 (made ground, high water table), R01 (no vehicle access), R03 (hard deadline). |
| Programme is compressed into the summer window and flags whether it can land by 27 Aug 2027 | Pass | Correctly flags a ~41-week miss; note the true shortfall may be understated because a Prior Approval planning stage appears to be missing entirely (issue 2). |
| Budget verdict: no verdict, since Q4.3 was left blank | Pass | No budget-check box or shortfall/surplus figure appears anywhere in the report — nothing invented. |
| No financial case content, since Q5.1 was left blank | Pass | Section numbering skips straight from Cost (05) to Procurement (06); no Financial Case section present. |
| No level-of-intervention, specification-level, storeys, building-age or higher-risk-building content | Fail | Specification: Standard is shown on the cover and Scope page (issue 1). |
| Confidence grading reflects one user-entered quantity against several estimated ones, plus the ground-conditions known issues flagged as needing survey | Pass | Grade D / High Uncertainty; R04 explicitly calls for all four surveys before tender. |
