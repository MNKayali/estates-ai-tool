# Review — DM-2-other

Verdict: The scope, risks and confidence grading are well-matched to the scenario, but the Order of Cost Estimate table (page 7) does not reconcile with itself — the stated total is ~4% higher than its own itemised rows sum to — and two scenario expectations (the "Other" building-use description, and the displayed funding status) are missing from the report entirely.

## Issues

| # | Severity | Category | Page | Report says | Expected (scenario) | Issue |
|---|---|---|---|---|---|---|
| 1 | High | Cost | 7 | "Construction cost ... 22,000 / 37,000"; "Total project cost (excl. VAT) ... 30,000 / 49,000" | Construction cost should equal Works cost + Prelims (A) + O&P (B); Total should equal Construction cost + C + D + E + H + F | Works cost (18,000) + Prelims (1,600) + O&P (2,000) = 21,600, not the 22,000 shown for "Construction cost." Using the displayed rows, Construction (22,000) + fees (3,000) + dev. costs (800) + risk (1,600) + contingency (900) + inflation (500) = 28,800, not the 30,000 "Total project cost" shown — off by £1,200 (4%) at the low end (high end is off by a smaller ~£400). By contrast, the identical table in DM-1 and DM-3 reconciles exactly to the pound, so this looks like a genuine calculation/rounding bug specific to this report rather than expected rounding noise. |
| 2 | Medium | Answers | 1 | Cover: "Wales, SY10 · Other · 180 m² GIFA" | Q1.3: Building use "Other", description "Former bus depot" | The "Other" building-use description is never shown in the structured cover/summary field — it only appears once, informally, inside the AI-written executive summary ("a former bus depot in Powys"), not as part of the labelled building-use field itself. |
| 3 | Medium | Region | 1–2 | "Wales" / "a former bus depot in Powys (SY10)" | SY10 is the Oswestry postcode district; Oswestry town itself is in Shropshire, England (West Midlands), though the western edge of the SY10 district does cross into Powys, Wales | Worth double-checking the postcode-to-region mapping for SY10 — the scenario's story is set "on the edge of Oswestry," a Shropshire (England) town, but the report assigns the whole project to Wales throughout, which drives the location factor used. |
| 4 | Medium | Answers | — | Funding status does not appear anywhere in the 9-page report | Scenario: "Funding shown as 'Not yet confirmed'" | Q4.7 ("Not yet confirmed") is not shown on the cover, in the risk register, or in the constraints summary — a materially relevant fact for a project the story says is going to a funding bid, but it isn't surfaced anywhere. |
| 5 | Medium | Answers | 1, 3, 7 | Cover: "Specification Standard"; Scope page: "…standard specification, 4 priced scope items"; Cost page: "Rates are for a standard specification." | Scenario: "No level-of-intervention or specification-level content anywhere in the report" | Same pattern seen in DM-1 and DM-3 — a specification-level label appears three times despite the scenario stating this question isn't asked for Demolition only. |

## Expectations

| Expectation | Result | Note |
|---|---|---|
| Cover/summary: title, Demolition only, Other — "Former bus depot", 180 m², SY10 | Partly | Title, project type, area and postcode all correct; the "Former bus depot" description is missing from the structured building-use field (Issue 2). |
| Scope page lists only the four ticked items (Demolition, Asbestos removal, Tree removal 2 nr, Fences/gates/walls), no contaminated land or service diversions | Pass | Exactly these four items appear, tree removal correctly marked "client figure" at 2. |
| No level-of-intervention or specification-level content anywhere | Fail | "Specification: Standard" appears three times (Issue 5). |
| No storeys or building-height content | Pass | Neither appears anywhere. |
| Risk register includes party-wall/attached-structure risk and reflects "Unsure — surveys needed" plus no surveys commissioned; confidence marked down | Pass | R04 (party wall), R02 (no surveys commissioned) both present; Grade D (High Uncertainty) is the lowest confidence grade, clearly marked down. |
| Budget verdict: shortfall against £45,000 (deliberately tight, unfunded scope gaps) | Partly | The report's verdict is "tight — achievable only if the project prices toward the lower end," not a shortfall; £45,000 does fall inside the estimated £36,000–£59,000 gross range rather than below it. The budget concern is flagged, but the specific verdict differs from "shortfall." |
| Funding shown as "Not yet confirmed" | Fail | Not shown anywhere in the report (Issue 4). |
| No "higher-risk building" content | Pass | No such content appears anywhere. |
