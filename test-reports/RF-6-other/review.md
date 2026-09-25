# Review — RF-6-other

Verdict: One High-severity regression — the works-cost table doesn't foot to its own component
rows, on both the group-summary table and the full Appendix A line-by-line breakdown (recurrence
of the Batch 1 "project cost table foots" fix). Everything else (sufficient-budget verdict,
region, "Other" building-use description, absence of a Financial Case, risk register, programme)
is accurate and internally consistent.

## Issues
| # | Severity | Category | Page | Report says | Expected (scenario) | Issue |
|---|---|---|---|---|---|---|
| 1 | High | Regression | 6, 10 | "Works cost total · 400,000 · 625,000" | The 6 element-group subtotals printed above it on p.6, and the 22 line items in Appendix A on p.10 | The six group subtotals shown in the same table on p.6 (Facilitating 27,000; Superstructure 48,000; Internal finishes 75,000; Toilets/kitchens 44,000; Services 163,000; Existing buildings 44,000) sum to £401,000 Low, not the £400,000 printed as "Works cost total" directly beneath them. Appendix A's full 22-line breakdown (p.10) sums to the same £401,000 Low. The High end (£625,000) does foot correctly in both places — only the Low figure is £1,000 short. Batch 1 found and this project fixed exactly this defect ("the project cost table foots" — brief item 7); it has recurred here, on the Low bound. The £400,000 figure is then used consistently through the rest of the report (Project Cost page, £643,000–£1,005,000 headline), so nothing downstream contradicts it — but the Works Cost table's own arithmetic is off. |

No other issues found. The Project Cost table (p.7) foots exactly against the (slightly low)
£400,000/£625,000 base, including the asymmetric −20%/+25% Grade C range (true mid-point
£500,000, confirmed via 400,000/0.8 = 625,000/1.25 = 500,000, and VAT £161,000 = 20% of the same
true mid £803,750 for the total, not a naive average of £643,000/£1,005,000); the percentage
build-up traces correctly to Q1.4 (pre-1900 heritage uplift), Q3.1 (structural, damp), Q3.4 (full
planning + Listed Building Consent), Q3.6 (partially occupied); the risk register gives distinct
entries to each Q3.1 issue plus a correct Q3.8 conservation-area risk; SY1 is correctly shown as
West Midlands; the "Other" building-use description appears on the cover; no Financial Case
section appears since Q5.1/Q5.2 were both left blank; the programme milestones (0/25/43/62/85/92
weeks) sum correctly from the stage durations; and no questionnaire question numbers or
unsupported claims appear in the prose.

## Expectations
| Expectation | Result | Note |
|---|---|---|
| Cover/summary: [TEST2] Corn Exchange community hub reconfiguration, Refurbishment, Other — "Grade II-listed former corn exchange, part community use", 480 m², SY1 | Pass | All present; SY1 correctly shown as West Midlands, location factor 0.94 |
| Scope page lists exactly the twenty ticked items (incl. Kitchens (Tea point), Repairs (Fair)) | Pass | All 20 present (7 SERVICES items shown, the remaining 2 — Data and IT, and the AUTO Builder's work — truncated to "and 2 more (see the cost table)" and confirmed in Appendix A); Toilets correctly split into Standard + Accessible sub-lines |
| Risk register includes a structural-concerns risk and a damp risk (Q3.1), plus a conservation-area context risk (Q3.8) | Pass | R02 (structural), R04 (damp), R05 (conservation area/Article 4) |
| Programme includes a Full planning + Listed Building Consent stage, run against Concept complete (Stage 2), measured against 30 Nov 2027 from 4 Jan 2027 start | Pass | "M1 Project start (Stage 3)" correctly reflects Stage 2 already complete; a planning-determination stage runs parallel to Stage 3; target missed by ~45 weeks (completes ~9 Oct 2028) |
| Budget verdict: comfortably within £1,450,000 (headroom, no shortfall) | Pass | ~£244,000 headroom above the top of the gross range, consistent everywhere it's repeated |
| No "higher-risk building" content | Pass | 2 storeys, well below the threshold; no Q1.6 was asked and none appears |
| No financial case section | Pass | Report goes straight from Order of Cost Estimate to Procurement Recommendation; Q5.1/Q5.2 both left blank |
| Estimate Basis shows no additional standards (None), Standard spec, "Reconfiguration or full redesign" band | Pass | Scope page shows no standards clause; cost assumptions confirm standard spec / reconfiguration or full redesign |
