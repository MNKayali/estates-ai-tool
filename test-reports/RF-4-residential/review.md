# Review — RF-4-residential

Verdict: A strong report — budget verdict, region, financial case, programme maths and the
project-cost table all foot and cross-check exactly, and none of the nine Batch 1 regressions
recurred. One Medium finding: the Roof quantity appears to use the app's "7 or more storeys"
cap as if it were the building's real storey count (22), inflating that one line roughly 3x.

## Issues
| # | Severity | Category | Page | Report says | Expected (scenario) | Issue |
|---|---|---|---|---|---|---|
| 1 | Medium | Cost | 6 | "S-0015 Roof · 743 m² estimated · £57,000 – £77,000" | Story: "a 22-storey 1960s residential tower"; Q1.2a can only record "7 or more storeys" (the form's cap) | 743 = 5,200 m² GIFA ÷ 7, exactly — the roof quantity is being derived as GIFA ÷ STOREYS using the form's numeric cap of 7 for "7 or more storeys" rather than the real 22. A realistic roof/footprint for a genuinely 22-storey tower would be roughly 5,200 ÷ 22 ≈ 236 m², so this line (and the works-cost total by extension) is overstated by roughly 3x on the Roof item alone — about £40k–£55k within the ~£3.0–4.0m works cost. The report doesn't flag this as an estimating limitation anywhere. |

No other issues found. Specifically checked and clean: the works-cost table (p.6) and project-cost
table (p.7) both foot exactly to the penny at Low and High; the "How the percentages were set"
build-up traces correctly to Q3.1/Q3.4/Q3.6/Q4.1/Q2.5; the budget shortfall figure (£1,682,000)
is identical in the Budget check box, Key findings, the R06 risk entry and Recommendation 5; the
Financial Case mid-point (£5,668,000), £38,000 benefit and 149.2-year payback are internally
consistent; SE1 is correctly shown as Inner London; the programme's milestone weeks (0/52/70/
123/179/193) sum correctly from the programme-detail stage durations; and no questionnaire
question numbers or unsupported "sense check" claims appear in the prose.

## Expectations
| Expectation | Result | Note |
|---|---|---|
| Cover/summary: [TEST2] Cladding remediation, Thames View Tower, Refurbishment, Residential, 5,200 m², SE1 | Pass | All present; SE1 correctly shown as Inner London, location factor 1.25 |
| Scope page lists Asbestos removal, Roof, External walls, Windows and external doors, Fire stopping, Repairs (Condition: Poor) — no internal finishes, services or toilets | Pass | Exactly the 6 ticked items shown, nothing extra added |
| Higher-risk building content present (7+ storeys, Residential, Q1.6 = Yes over 18 m) | Pass | BSR Gateway 2 stage (18 weeks) and R03 "Higher-risk building" risk both present |
| Risk register includes a fire-safety risk and a structural-concerns risk (Q3.1); no Q3.8 context risk | Pass | R01 (fire safety), R02 (structural); Q3.8 "None of these" correctly produces no context risk |
| Budget verdict: tight fit or shortfall against £4,100,000 | Pass | Shortfall of ~£1,682,000 against the gross range, consistent everywhere it's repeated |
| Programme measured against 31 Mar 2028 target from 1 Feb 2027 start, multiple phases, Full planning ahead of Gateway 2 | Pass | Target missed by ~132 weeks (completes ~14 Oct 2030); Stage 3 planning submission/determination both precede BSR Gateway 2; Phase 2+ construction reflects multiple phases |
| Estimate Basis lists BREEAM and the "Other" standard, priced at "Fabric and finishes only" | Pass | Both shown on the scope page banner and in the cost assumptions |
| Financial case present: avoidance of compliance cost/penalty with a £38,000 annual benefit | Pass | Mid-point £5,668,000, £38,000 benefit and 149.2-year payback all consistent |
