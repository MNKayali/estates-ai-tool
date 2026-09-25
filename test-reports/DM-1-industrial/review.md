# Review — DM-1-industrial

Verdict: Mostly accurate and well-supported by the answers, but undermined by one high-severity defect — the AI-written key findings and risk register quote a budget shortfall (£386,000) and gross cost range (£1,236,000–£1,543,000) that do not match the report's own, correctly-calculated figures (£265,000 shortfall, £1,115,000–£1,738,000 gross), directly contradicting the "AI never calculates a number" rule.

## Issues

| # | Severity | Category | Page | Report says | Expected (scenario) | Issue |
|---|---|---|---|---|---|---|
| 1 | High | Budget | 2 | Key finding: "the budget shortfall of approximately £386,000 against the lower estimate range"; key finding 3: "the estimated gross range is £1,236,000 to £1,543,000"; Risk R04 repeats "£1,236,000–£1,543,000 ... £386,000 shortfall" | The cost tables on pages 6–7 sum exactly to £929,000–£1,448,000 excl. VAT, and +20% VAT gives £1,115,000–£1,738,000 gross — the same figures the "Budget check" box on page 2 correctly uses (shortfall ≈ £265,000) | The AI-written key findings (and the risk register, which reuses the same wording) state a shortfall and gross range that match neither the deterministic cost table nor the deterministic "Budget check" box directly below them on the same page. This is an internal contradiction a client would immediately notice, and looks like exactly the kind of AI-invented figure the number-leak guard exists to catch. |
| 2 | Low | Cost | 6 | "Works cost total ... 578,000 / 904,000" | Sum of the six line items above (121,000+181,000+106,000+5,000+120,000+45,000 low; 189,000+284,000+165,000+8,000+188,000+71,000 high) | High-end total (904,000) is £1,000 short of the sum of its own line items (905,000) — a minor rounding artefact but a real pound-for-pound mismatch on the page. |
| 3 | Medium | Answers | 1, 3, 7 | Cover: "Specification Standard"; Scope page: "…standard specification, 6 priced scope items"; Cost page: "Rates are for a standard specification." | Scenario: "No level-of-intervention or specification-level content anywhere in the report (neither question is asked for Demolition only)" | A specification-level label appears three times even though the scenario states this question is not asked for Demolition only. (Same pattern seen in DM-2 and DM-3, so this looks systemic to the Demolition-only report template rather than specific to this scenario.) |

## Expectations

| Expectation | Result | Note |
|---|---|---|
| Cover/summary: title, Demolition only, Industrial / warehouse, 4,200 m², DN4 | Pass | All present and correct on the cover and page 2. |
| Scope page lists Demolition of existing building, Asbestos removal, Contaminated land, Tree removal (8 nr), Service diversions (Large), Site clearance and preparation | Pass | All six items present; tree removal correctly marked "client figure" at 8. |
| No level-of-intervention or specification-level content anywhere | Fail | "Specification: Standard" appears on the cover, scope page and cost page (see Issue 3). No level-of-intervention content was found, so this is a partial fail limited to specification level. |
| No storeys or building-height content | Pass | Neither appears anywhere in the report. |
| Risk register includes asbestos and contaminated land, no conservation-area/party-wall risk | Pass | R01 (asbestos) and R02 (contaminated land) are High; no conservation-area or party-wall entries, consistent with Q3.8 = None of these. |
| Programme ends on or before 30 June 2027, or the report flags it can't | Pass | Programme completes 22 Aug 2028; the report explicitly and repeatedly flags the target as not achievable (~60 weeks late). |
| Budget verdict: comfortably covered by £850,000 (deliberately generous) | Fail | The report shows a shortfall, not a surplus — even using the report's own correct figures (£1,115,000–£1,738,000 gross vs £850,000 budget), the project is well over budget, the opposite of the scenario's expectation. |
| No "higher-risk building" content | Pass | No such content appears anywhere. |
