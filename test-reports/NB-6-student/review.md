# Review — NB-6-student

Verdict: Strong report — all answers, scope items, risks, the Gateway 2 / ecology programme stages, the "no budget verdict" behaviour and the financial case carry through correctly and all figures cross-check exactly (project cost build-up table foots to the pound); only one real inconsistency (a scope-item count that contradicts the same page's header and the appendix) and one cosmetic rounding artefact were found. No Batch 1 regressions recurred. Page images could not be rendered (`pdftoppm` not installed in this environment) — this review is based on `pdftotext -enc UTF-8 -raw` text extraction only, so purely visual/layout defects (overlap, clipping, colour) could not be checked.

## Issues
| # | Severity | Category | Page | Report says | Expected (scenario) | Issue |
|---|---|---|---|---|---|---|
| 1 | High | Scope | 3 | Scope of Works header: "37 priced scope items"; Scope assumptions bullet: "All 34 scope items listed are in scope and being costed; no items are excluded" | Appendix A (pages 11–12) lists 37 priced line items, matching the page-3 header | The "34" in the Scope assumptions bullet contradicts the "37" in the same page's own header and the 37-line Appendix A — an internal wrong figure, not a fabricated one, but still incorrect. |
| 2 | Low | Cost | 6, 11–12 | Element-group table (p.6): Group 2 low £3,668,000, Group 4 low £813,000, Group 5 low £893,000, Works cost total low £6,065,000 | Summing Appendix A's own line items gives Group 2 low £3,670,000, Group 4 low £814,000, Group 5 low £892,000, total £6,066,000 | Each ±£1,000–£2,000 (<0.05%), from rounding line items to the nearest £1,000 independently of the group subtotal. Cosmetic only — the main project-cost build-up table on page 7 (works cost → total project cost, including every percentage row) foots exactly to the pound in both the low and high columns, so this is not the Batch-1 "table doesn't foot" bug recurring. |

No other issues found. Every prose-quoted figure (144 bathroom pods, 24 domestic kitchens, 108 m² catering kitchen, the 133-week overrun, the £480,000/25.2-year payback, the £2,415,000 VAT mid-point) checks out exactly against the tables; no "(Q#.#)" references, no fabricated "automated check" claims, no placeholder or cut-off text found in the extracted text.

## Batch 2 — last round's fixes
| # | Check | Result |
|---|---|---|
| 1 | Budget figures consistent | N/A — Q4.3 left blank, funding "Not yet confirmed"; no budget/shortfall content appears anywhere in the report, correctly. |
| 2 | Region matches postcode | Pass — L7 → "North West" on cover and BCIS Region box; correct for Liverpool. |
| 3 | Financial Case present/correct | Pass — Q5.1 "Rental or commercial income" (not "No direct financial return") → section present; Q5.2 £480,000 → payback shown (25.2 yrs, = £12,077,000 ÷ £480,000, correct); project-cost mid £12,077,000 is consistent with the true (unrounded) mid implied by the −20%/+25% low/high range (page 7). |
| 4 | Planning determination alongside Stage 4 when Stage 3 complete | N/A — this scenario's Q4.5 is "Concept complete (Stage 2)", so the programme correctly starts at Stage 3, with "Planning consent determination (parallel with Stage 3)" shown. Planning determination is present as expected. |
| 5 | Higher-risk building → Gateway 2; ecology context → ecology survey | Pass — "BSR Gateway 2 ... (higher-risk building)" stage present (18 wks); "Ecology / bat survey" present in the Surveys row, parallel with design. |
| 6 | No Specification on EW/DM only; Q2.5 standards on Scope page; "Other" use shows description on cover | N/A for Specification/Other-use (this is New Build, standard PBSA use). Q2.5 standards ("University design guide, Net zero") do appear on the Scope page — Pass. |
| 7 | Project cost table foots | Pass — the page-7 build-up table (works cost, A–H, total, both low and high) sums exactly to the pound. (See Issue 2 above for a separate, much smaller rounding artefact in the page-6 element-group summary table — not the same defect.) |
| 8 | Every Q3.1 issue has its own risk entry; no duplicate risks reworded | Pass — "Trees or hedgerow on site" → R06; "Unsure — surveys needed" → R05 (and reflected again in the risk-allowance 2% build-up and R08's quantity caveat, which is a distinct concern, not a reworded duplicate). |
| 9 | No "+x% restricted working hours" on a vacant building unless ticked | Pass — Q3.6 is "Vacant or decanted" and Q3.5 ticked only "No vehicle access or restricted deliveries" (reflected as R01/logistics, not a working-hours uplift); no restricted-working-hours percentage appears anywhere in the build-up. |

No regressions found.

## Expectations
| Expectation | Result | Note |
|---|---|---|
| Cover/summary: [TEST2] Edge Hill title, New Build, Student accommodation (PBSA / halls), 3,600 m², L7 | Pass | All present verbatim on cover and summary page. |
| Scope page lists Bathrooms and en-suites as pods, Catering kitchen, Sports at 220 m², Smoke ventilation, Lifts and Cycle storage at 180, on top of typical scope | Pass | All six present; Sports (220, client figure) and Cycle storage (180, client figure) correctly marked as the user's own figures in Appendix A. |
| Risk register includes an ecology/tree-protection risk (Q3.1 and Q3.8) and reflects "Unsure — surveys needed" as an outstanding-survey flag | Pass | R03 (ecology/bat), R06 (trees/TPO), R05 (unknown condition/no surveys) and R08 (quantities estimated pending surveys) all cover this. |
| "Higher-risk building" / Gateway 2 content present | Pass | R02, the BSR Gateway 2 programme stage (18 wks) and the Constraints Summary Regulatory row all present. |
| Programme includes a full planning stage and is checked hard against 15 Aug 2027 given a Nov 2026 start | Pass | Planning determination stage present; target-date check correctly flags the 174-week programme (ending 3 Mar 2030) as ~133 weeks beyond the 15 Aug 2027 target, consistently stated in the exec summary, key findings, R04 and the target-date box. |
| Budget verdict: no verdict shown | Pass | No budget content appears anywhere; Q4.3 was left blank. |
| Modular construction method reflected in the programme/cost basis | Pass | Stated in the executive summary, Key findings and the works-cost narrative ("Modular construction... add preliminaries and logistics costs"); not shown as a standalone tag on the Scope page itself, but the requirement is met. |
| Financial case section present: rental/commercial income with £480,000 annual figure | Pass | Present with correct benefit type, annual figure and a payback figure that ties to the project cost mid-point. |
| Q6.1 report instructions reflected (Gateway 2, occupancy date risk) | Pass | Gateway 2 is framed as "the single most material risk" in the executive summary and R02; the Constraints Summary explicitly ties Gateway 2 determination time to "risk the September occupancy target". |
