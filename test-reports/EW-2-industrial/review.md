# Review — EW-2-industrial

Verdict: Scope, quantities, region and the financial case are all correct, but the budget-shortfall figure the AI wrote is wrong and contradicts the correct figure printed elsewhere on the same page — a genuine reliability defect, not just wording — and the recurring spec-level display bug is present here too.

## Issues

| # | Severity | Category | Page | Report says | Expected (scenario) | Issue |
|---|---|---|---|---|---|---|
| 1 | High | Budget | 2, 4, 9, 10 | Key finding (p2): "...falls short of the estimated gross range by approximately £1,025,000". Risk R03 (p4): "...below estimated gross range of £2,125,000–£2,648,000, a shortfall of approximately £1,025,000." Repeated in Constraints Summary (p9) and Next Steps #1 (p10). | Figures must be calculated in code, never invented or altered by the AI; a figure differing between pages is an issue. | The correct gross (incl. VAT) range, printed in the "Budget check" callout on the very same page 2, is £1,910,000 – £2,982,000, giving a shortfall of ≈£810,000 against the £1,100,000 budget (consistent with the works/project cost tables on pages 6–7: £1,592,000–£2,485,000 excl. VAT × 1.2). The AI-written prose instead uses a shortfall of £1,025,000 in four separate places, and in the risk register invents an entirely different, unsourced gross range (£2,125,000–£2,648,000) that matches neither the excl.-VAT nor incl.-VAT totals shown anywhere else in the report. |
| 2 | Medium | Answers | 1, 3, 7 | "Specification: Standard" (cover); "External works only of 9,500 m² GIFA, standard specification, 10 priced scope items" (p3); "Rates are for a standard specification" (p7) | "No level-of-intervention or specification-level content, no storeys/building-age/height content... none apply to External works only" | Same defect as the other two External-works-only reports in this batch: a spec level is displayed even though the questionnaire never asks for one on this project type. |
| 3 | Low | Prose | 7 | "Preliminaries 10%: 8% base, plus 2% for fully occupied throughout, 0.5% for shared access with other occupiers, 0.5% for programme duration > 18 months, -1% for capped at 10%." | — | The build-up sums to 11% before the stated 10% cap; "-1% for capped at 10%" reads as though capping were itself a rate component rather than a note that the total was capped. Numerically correct, just awkwardly worded. |
| 4 | Low | Cost | 6 | "12 nr chargers" as the EV charging quantity/unit | — | Unit and descriptor both printed ("nr chargers"), the same cosmetic duplication seen in EW-1's "1 nr trees". |

## Expectations

| Expectation | Result | Note |
|---|---|---|
| Cover/summary: title, External works only, Industrial/warehouse, 9,500 m², NE28 | Pass | All fields correct; region shown as North East, correct for NE28 (North Tyneside). |
| Scope page lists the ten individually ticked items, HGV yard 4,200 m², car parking 60, cycle storage 20 as user figures, Highways/access shown "Large" | Pass | All ten items present with correct quantities marked "client figure" and the Large option shown. |
| Risk register includes a contamination risk (Q3.1, Phase 1–2) and a shared-access/phasing risk (Q3.5/Q3.7) | Pass | R01 (contamination, High) and R02 (shared access) / R06 (24/7 phased sequencing). |
| Programme reflects Full planning and multiple-phase delivery, no target date to test against | Pass | Multi-stage phased construction shown (26 wks + 34 wks); correctly omits any target-date verdict since Q4.1 was "No specific deadline". |
| Budget verdict: comfortably within budget | Fail | The report shows a shortfall, not a surplus — the deterministic cost range (£1.59m–£2.49m excl. VAT) for this scope (large yard, highways, EV/electricity upgrade) comes out well above the £1.1m budget. This looks like the actual calculated cost for the ticked scope, not a report defect — but see Issue 1 for the separate, genuine error in how the shortfall itself is reported. |
| Financial case includes the £60,000 annual saving tied to Q5.1 | Pass | Page 8: Annual benefit £60,000, Energy/operational cost savings, payback 34 years — consistent with the £2,039,000 mid-point cost. |
| No level-of-intervention/spec, no storeys/age/height, no higher-risk content | Partly | Storeys/age/height/higher-risk content correctly absent, but specification level is still shown — see Issue 2. |
| Confidence grading reflects three user-entered quantities against several estimated ones | Pass | Grade C (Limited); car parking, HGV yard and cycle storage marked "client figure", remainder "estimated". |
