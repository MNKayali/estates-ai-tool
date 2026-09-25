# Review — EX-2-healthcare

Verdict: Scope, risk register and programme are accurate and well-targeted, but the BCIS region is wrong for the postcode (self-disclosed by the tool, but still wrong on every page), and one AI-written cost figure is mislabeled as VAT-inclusive when it isn't.

## Issues

| # | Severity | Category | Page | Report says | Expected (scenario) | Issue |
|---|---|---|---|---|---|---|
| 1 | High | Region | 1, 2, 6, 7, 8, 9 | Cover and BCIS Region box: "West Midlands, BS1" / "BCIS REGION West Midlands · Location factor 0.94" | BS1 is Bristol (South West) | Postcode BS1 is not matched to a BCIS region, so the tool silently defaults to West Midlands (factor 0.94) and prices the whole job on that basis. The report does self-disclose the gap (Risk R06, Constraints Summary, and the cost-assumptions note all say "Postcode BS1 did not match any BCIS region; estimate defaults to West Midlands"), which is good practice, but the headline region shown on the cover and used for every cost line is still the wrong one for a Bristol project — and the AI's own Executive Summary text on the very same page correctly says "a 140 m² healthcare extension in Bristol (BS1)", directly contradicting the deterministic "West Midlands" label next to it. |
| 2 | Medium | Cost | 2 | Key findings: "total project cost including fees and VAT estimated at £748,000 mid-point" | — | £748,000 is actually the excl.-VAT total project cost mid-point (consistent with the cover's £563,000–£975,000 excl.-VAT range), not a VAT-inclusive figure. The cover states VAT at 20% is ~£150,000 at the mid-point, so the true VAT-inclusive mid-point is roughly £900,000–£920,000, well above £748,000. Labelling the excl.-VAT figure as "including … VAT" is misleading — a reader could think the true (higher) all-in cost is £748,000. |

## Expectations

| Expectation | Result | Note |
|---|---|---|
| Cover/summary: title, Extension, Healthcare, 140 m², BS1 | Partly | Title, type, use, area and the BS1 postcode digits are all correct; the derived BCIS region name is wrong (Issue 1). |
| Scope page lists Clinical fit-out, Medical gases, Toilets incl. Accessible/Changing Places, car parking 6 nr (your figure) | Pass | All present in scope and Appendix A; Toilets — Standard correctly excluded as zero-quantity for a single-storey building, and this is self-disclosed rather than silently dropped. |
| Risk register includes below-ground services/obstruction risk (Q3.1); no asbestos content | Pass | R03 covers underground services/obstructions; no asbestos anywhere, correct for a Post-2000 building. |
| Programme reflects Prior approval (not Full planning); no hard target date | Pass | Cost build-up explicitly names "the standard rate for prior approval"; no "Full planning" wording anywhere; no target-date check shown, correct since Q4.1 was "No specific deadline". |
| No higher-risk building/Gateway 2 content | Pass | None present, correct for a single-storey extension. |
| Budget verdict: comfortably within budget against £900,000 | Fail | Report grades this "tight" and raises a HIGH severity cost risk (R02): budget is "achievable only if the project prices toward the lower end", not comfortably within. The £900,000 figure sits close to the middle of the £676,000–£1,170,000 range rather than comfortably above it, and (per Issue 1) that range itself is priced on the wrong location factor, so the true position is even less certain than shown. |
| No financial case section (Q5 left blank) | Pass | No Financial Case section present. |
| Occupation narrative reflects Fully occupied — works sequenced around live clinics | Pass | R04 and R07, plus the preliminaries build-up ("+2% for fully occupied throughout, +0.5% for restricted hours"), all reflect this correctly. |
