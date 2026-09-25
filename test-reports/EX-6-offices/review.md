# Review — EX-6-offices

Verdict: Solid report — budget/region/risk/programme logic is correct and
all figures reconcile, but two things worth checking: an "Asbestos survey
status unknown" risk is rated HIGH on a Post-2000 building where asbestos is
essentially not a credible risk, and page 5 has a genuine PDF text-overlap
defect where a programme narrative bullet collides with the footer. Read via
`pdftotext -enc UTF-8 -layout` (page-image rendering was unavailable); the
Order of Cost Estimate (p.7) and Appendix A tables print with values shifted
one row relative to their labels in the extracted text — reconstructed by
re-deriving each row from the stated percentages and the works-cost total,
which foots exactly to the cover's £9,083,000–£14,191,000, so this is judged
to be a text-extraction artefact, not a report defect. A visual/PDF-image
check of that page, and of page 5 for the overlap noted below, is
recommended.

## Issues
| # | Severity | Category | Page | Report says | Expected (scenario) | Issue |
|---|---|---|---|---|---|---|
| 1 | Medium | Risk | 4 | Risk register: "Asbestos survey status unknown; presence would delay works and require specialist removal before construction commences" — rated **HIGH**, same rating as the reported structural and fire-safety concerns | Q1.4 building age = Post-2000; Q3.1 did not tick asbestos; Q3.3 surveys did not include an asbestos survey | Asbestos was banned from use in UK construction before 2000, so a Post-2000 building carrying a HIGH asbestos risk (on a par with genuinely reported structural/fire defects) is disproportionate and could mislead the client into unnecessary survey/removal budgeting. This looks like a generic "no asbestos survey ticked" seed that doesn't check building age before firing, or doesn't downgrade its rating when the building age makes the risk implausible. |
| 2 | Low | Layout | 5 | Programme narrative page: the third bullet is followed by a garbled/overlapping line combining the footer text with programme content (extracted as `EstatCeosnAsIt·ruFecatsioibnilittaykreepso4rt9ingwfeoer ckasp.ital projects · estates-ai-tool.vercel.app · Indicative only`), and the expected fourth bullet ("Construction takes 49 weeks, including an allowance for working around occupants.") is missing from its normal position | EX-4 and EX-5's equivalent page 5 both show four clean narrative bullets (Starts.../gateways/Procurement/Construction takes N weeks...) before the footer, with no overlap | The character-level interleaving in the extracted text is consistent with two text blocks genuinely overlapping in the PDF — likely a page-fit/overflow issue specific to this report's content (three client-review gateways, one more than EX-4/EX-5), pushing the fourth narrative bullet down into the footer's space. Recommend a visual check of page 5. |

## Expectations
| Expectation | Result | Note |
|---|---|---|
| Cover/summary: title, Extension, Commercial offices, 1,850 m², EC1 | Pass | All present verbatim on the cover. |
| Scope page lists typical-scope fit-out plus added upper floors, lifts, sprinklers, raised access floor; showers 8 nr and cycle storage 24 nr (your figures); no surface water/foul drainage | Pass | "Floor finishes — Raised access floor: Yes", Sprinklers and Lifts — Passenger present in Appendix A; Cost assumptions confirm "Client figures are used for Showers (8 nr), Cycle storage (24 Nr)"; External works group has only 2 items (site clearance, cycle storage) — S-0068/S-0069 drainage correctly absent. |
| Risk register includes a structural-concerns risk and a fire-safety risk (Q3.1), plus a conservation-area risk/assumption from Q3.8 | Pass | Both Q3.1 issues have their own HIGH entries; conservation area/Article 4 has its own MEDIUM entry with a distinct mitigation. See Issue 1 for an additional, arguably spurious, HIGH risk not asked for. |
| Programme includes a Full planning stage at Concept only (Stage 0–1), checked against the 2028-03-31 target from a 2027-03 start, flagged if at risk | Pass | Programme starts at Stage 2 (consistent with "Concept only (Stage 0–1)" being complete); "Planning consent determination" stage present; target flagged as missed by ~67 weeks. |
| No higher-risk-building/Gateway 2 content | Pass | No Gateway 2 or Building Safety Regulator content anywhere (3-storey extension, Commercial offices is not a higher-risk-building use). |
| Budget section states no stated budget was given, no shortfall/surplus verdict, cost shown as standalone range | Pass | No "Budget check" callout appears anywhere (unlike EX-4/EX-5); cost is presented purely as the £9,083,000–£14,191,000 estimate range. |
| No financial case section (Q5 left blank entirely) | Pass | Report jumps from Scope/Risk/Programme/Cost straight to "06 Procurement Recommendation" — no Financial Case section present. |
| Occupation narrative reflects Vacant or decanted, not a live occupied fit-out | Partly | No occupancy uplift is applied in preliminaries (correct for a vacant building, and correctly shows no "restricted working hours" premium since Q3.5 didn't tick it), but the executive summary and scope narrative never explicitly state the building is vacant/the tenant has decanted — the only occupation-adjacent text is about the neighbouring tenants' ground-floor reception remaining in use (Q3.7), which is correct but incomplete. |
