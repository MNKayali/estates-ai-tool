# Review — FO-1-offices

Verdict: Mostly solid and internally consistent (cover/summary/cost totals reconcile, risk-register counts match their headers, financial-case payback arithmetic is correct, design-stage/programme alignment is correct), but one real scope-correctness defect — asbestos removal priced when the scenario explicitly says it should not be — cascades into the top risk and two recommendations, and the programme misses the client's target by more than half a year.

## Issues
| # | Severity | Category | Page | Report says | Expected (scenario) | Issue |
|---|---|---|---|---|---|---|
| 1 | High | Scope | 3, 4, 6, 9 | "Asbestos removal" priced (S-0001, £23,000–£35,000) as a Facilitating Works line; also the #1 risk "Asbestos removal across 850 m² floor area..." (HIGH) and recommendations 2 & 4 | "No asbestos-removal line priced given the age band and pre-2000 survey answer flags it as a known issue rather than a confirmed removal" | Q3.1 does not list "Asbestos known or suspected" and Q3.3 already shows an "Asbestos management survey" in hand, yet typical scope still ticked and priced a removal line. This is the scenario's own explicit expectation, not just an unlisted "typical scope" addition — it contradicts it, and drives the highest-rated risk plus two of five recommendations. |
| 2 | Medium | Programme | 2, 5, 9 | "The target date of 30 June 2027 is not achievable; the 59-week programme extends approximately 29 weeks beyond 30 June 2027." | "Programme ... should comfortably finish before the 30 June 2027 target" | The report shows the opposite of the scenario's expectation — a ~7-month overrun, not a comfortable finish. Given ~30 weeks were available (1 Dec 2026 start, Stage 3 onward per Q4.5) against a 59-week (54 best-case) programme with a 12-week tender and 18-week construction for a finishes-led office fit-out, this is worth the team double-checking against the Fit-out duration rows — it is reported transparently and may reflect genuine workbook durations rather than a bug, but it is a large enough miss to flag. |
| 3 | Low | Cost | 2, 7 | No "Standards" field anywhere; BREEAM only appears once, inside the fee build-up text ("1% for BREEAM") | "Estimate Basis lists BREEAM under standards" | There is no explicit Standards line on the cover metadata table or in Cost assumptions (which lists Project type/Intervention/Specification but not Standards). BREEAM's only trace is a single clause in "How the percentages were set." |
| 4 | Low | Prose | 2 | "Grade C (Limited Confidence) due to estimated quantities for toilets and kitchens." | — | All 16 priced scope items were costed on estimated quantities (the scenario gave no "I know this" figures at all), not specifically toilets and kitchens — singling those two out reads as narrower than the actual driver of the confidence grade. |

## Expectations
| Expectation | Result | Note |
|---|---|---|
| Cover/summary: title, Fit-out, Commercial offices, 850 m², M13 | Pass | All carried through correctly; M13 correctly mapped to North West. |
| Scope lists Strip-out, finishes (raised access floor ticked), Heating, Water/drainage, Power, Lighting, Toilets, Kitchens (Tea point), Fixed joinery, Signage, Data and IT | Pass | All present and correctly optioned; see Issue 1 for the extra, unwanted Asbestos removal line. |
| Risk register: M&E-condition risk, damp risk, party-wall context risk | Pass | M&E and damp are combined into one risk row ("ageing M&E systems and known damp or water ingress issues") rather than two separate ones, but both are represented; party wall is its own HIGH risk citing the 1996 Act correctly. |
| No asbestos-removal line priced | Fail | Asbestos removal is priced and is the top-rated risk — see Issue 1. |
| No planning stage; comfortably finishes before 30 June 2027 | Partly | Correctly has no planning stage (No consent required). Does not comfortably finish before target — misses it by ~29 weeks; see Issue 2. |
| Budget verdict: comfortably within £650,000, no shortfall | Partly | No shortfall is shown ("tight ... achievable only if lower end"), but it is not comfortable — the gross mid-estimate (~£649k incl VAT) sits almost exactly on the stated £650,000 budget. |
| No higher-risk-building content | Pass | None present, correctly, for a Fit-out. |
| Estimate Basis: BREEAM under standards, Standard spec level | Partly | Standard spec level is shown clearly; BREEAM is only mentioned once in the fee percentage build-up, not as an explicit standards field — see Issue 3. |
