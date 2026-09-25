# Review — RF-5-retail

Verdict: One High-severity regression — the works-cost table doesn't foot to its own line
items (recurrence of the Batch 1 "project cost table foots" fix). Everything else (region,
scope, risks, no-budget/no-target handling, financial case, programme) is accurate and
internally consistent.

## Issues
| # | Severity | Category | Page | Report says | Expected (scenario) | Issue |
|---|---|---|---|---|---|---|
| 1 | High | Regression | 6 | "Works cost total · 200,000 · 244,000" | The 15 line items printed immediately above it | The 15 line items sum to Low £198,000 (11+7+8+15+21+14+30+18+13+35+9+3+5+4+5, all in £000s) and High £242,000 (14+9+10+19+26+17+36+22+15+43+11+3+6+5+6) — £2,000 short of the printed total at both ends (~1%). Batch 1 found and this project fixed exactly this defect ("the project cost table foots" — brief item 7); it has recurred here. The (slightly wrong) £200,000/£244,000 figure is then used consistently through the rest of the report (Project Cost page, £334,000 mid-point in the Financial Case), so nothing downstream contradicts it — but the Works Cost table itself doesn't add up. |

No other issues found. The Project Cost table (p.7) foots exactly against the (incorrect)
£200,000/£244,000 base; the percentage build-up traces correctly to Q3.1 (M&E, drainage), Q3.4
(change of use), Q3.5 (restricted working hours); the risk register gives distinct entries to
each Q3.1 issue with no Q3.8 risk (correct, "None of these" was selected); L1 is correctly shown
as North West; no budget or target-date verdict appears since both Q4.3 and Q4.1 were left
blank/"No specific deadline"; the Financial Case correctly shows "Increased asset value" with no
payback since Q5.2 was left blank; the programme milestones (0/13/25/41/45 weeks) sum correctly
from the stage durations; and no questionnaire question numbers or unsupported claims appear in
the prose.

## Expectations
| Expectation | Result | Note |
|---|---|---|
| Cover/summary: [TEST2] Former bank branch retail conversion, Refurbishment, Retail, 340 m², L1 | Pass | All present; L1 correctly shown as North West, location factor 0.92 |
| Scope page lists typical "Full systems replacement" items plus Retail (220 m², client figure), Security — Heating and hot water excluded | Pass | Retail shown as "220 m² sales area · client figure"; no Heating and hot water item; Internal walls correctly absent (per the note, not flagged) |
| Risk register includes an ageing-M&E risk and a drainage risk (Q3.1); no Q3.8 context risk | Pass | R01 (ageing M&E), R04 (drainage); Q3.8 "None of these" correctly produces no context risk |
| Programme includes a Change of use planning stage, run against Developed design (Stage 3), no fixed target to measure against | Pass | "M1 Project start (Stage 4)" correctly reflects Stage 3 already complete; a planning determination stage runs parallel to Stage 4 (this is exactly the Batch 1 Stage-3-truncation defect and it does not recur); no target-date verdict shown since Q4.1 = No specific deadline |
| Budget verdict: no verdict possible / not assessed | Pass | No budget box or shortfall/headroom language anywhere — Q4.3 was left blank |
| No "higher-risk building" content | Pass | 2 storeys, below the 5-storey threshold; no Q1.6 was asked and none appears |
| Estimate Basis shows no additional standards (None), Standard spec, "Full systems replacement" band | Pass | Scope page shows no standards clause; cost assumptions confirm standard spec / full systems replacement |
| Financial case present (increased asset value) with no annual benefit figure | Pass | "Not stated" / "Needs an annual figure" shown correctly, no fabricated payback |
