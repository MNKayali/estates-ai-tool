# Pre-launch fix plan (from test batch 3, 9 Oct 2026)

Source: `test-reports/batch3-summary.md` and the `review.md` files. Each item: what, where, who decides.

## A. Cost (workbook + cost engine)
| # | Fix | Where | Decision |
|---|---|---|---|
| A1 | Make rates reflect building use (warehouse ×3, offices with housing door / plumbing rates) | workbook + `costCalculator.js` | **Owner** — method |
| A2 | New-build rates raised by the v5.12 refurb ratio with no evidence | workbook | **Owner** — revert or keep |
| A3 | VAT always 20% (housing zero-rated; councils / NHS recover) | questionnaire + `senseCheck.js` | **Owner** — add a VAT question? |
| A4 | Confidence ignores big benchmark breaches (3× still Grade B) | `prose.js` / `senseCheck.js` | **Owner** — cap rule |
| A5 | Paving ratio added on top of client parking / HGV yard | workbook rule | fix |
| A6 | Demolition only: footprint = whole GIFA (service diversions ×3) | ask storeys for Demolition only | fix |
| A7 | Extension: demolition / asbestos quantity = new GIFA | quantity rule → ENTER | fix |
| A8 | "7 or more storeys" treated as 7 | questionnaire: number box above 7 | fix |
| A9 | Default heating = gas boiler even with Net zero | workbook default option | **Owner** |
| A10 | Choosing a Platform lift leaves Passenger ticked | `ScopePicker.jsx` | fix |
| A11 | Rate / item gaps: MUGA on External works, refurb stair core, fume extraction band, radiators-only rate, new-build bathroom rate, lifts for tall housing, asbestos rate when "known" | workbook | **Owner** approves figures |
| A12 | Scotland location factor mid 0.90 < low 0.93 | workbook | fix (mid = 0.965) |

## B. Programme (programme workbook + engine)
| # | Fix | Decision |
|---|---|---|
| B1 | Small / simple jobs get full design stages, 2–3 gateways, 12-wk tender (playground 65 wks, Cat B fit-out 81 wks) | **Owner** — scaling method |
| B2 | "Term-time only working" ambiguous; holiday-only works scheduled in term | **Owner** — new wording |
| B3 | Building Control Full Plans + building design stages on demolition and external works | fix |
| B4 | Tender period same for negotiated / framework / selective | fix (by route) |
| B5 | Ecology survey triggered by an extension's new roof or "Repairs" | fix (existing roof works only) |
| B6 | Durations: S7 shed too long, back-to-frame office too short, Cat B fit-out uses Cat A row | workbook — owner approves weeks |

## C. Report wording (prompt, guards, report text)
| # | Fix | Decision |
|---|---|---|
| C1 | Prose compares incl.-VAT budget with excl.-VAT mid; calls excl.-VAT totals "incl. VAT" | fix (give the model one budget sentence, guard it) |
| C2 | Stock sentence "holds tender until consent" when dates don't fit | fix |
| C3 | Estimates described as "client-confirmed"; invented names ("University of Leeds") | fix (prompt rule + guard) |
| C4 | "Not in scope" lists items that are priced (AV); building items listed on External works | fix |
| C5 | External works shows "m² GIFA" | fix |
| C6 | "Development version" in every footer | **Owner** |
| C7 | Q6.1 plain-language instruction not followed | fix (prompt) |
| C8 | Procurement suggests Quotations at £650k then argues against it; "Remeasurement" model | **Owner** — procurement workbook thresholds |
| C9 | "No condition survey" High risk on a 2026 building | fix (age-aware) |

## D. Finish and prove
1. Review the 5 unreviewed reports (DM-8, DM-9, OM-7, OM-8, OM-9).
2. After the fixes: re-run all 21 scenarios offline (`analyse.mjs`), then live; every figure within ±15% of the benchmark or explained.
3. Tests for each fix; build; update CLAUDE.md.

## Decisions log (owner, 10 Oct 2026)
- **A1** Full NRM1 elemental method now (Spon's-style): envelope priced per element unit (m² wall / roof, quantities from storeys and floor area); doors, partitions, finishes and services rated per building use. Rates proposed from Spon's 2024, owner approves.
- **A2** Keep the v5.12 new-build rates as they are.
- **A3** Add a VAT question ("Can the client recover VAT?" Yes / Partly / No / Not sure); new-build homes zero-rated automatically; budget check uses it.
- **A4** More than 30% outside the benchmark → grade capped at D + warning on the cost page.
- **A9** Heat pump is the default heating only when Q2.5 includes Net zero; gas stays the default otherwise.
- **B1** Programme workbook gets design / review rows per project type (Fit-out, External works, Demolition only) and tender time by route.
- **B2** Q3.5 redesigned (owner approved, period option first):
  1 Works limited to certain periods → opens Q3.5a · 2 Restricted working hours (no noisy work, no weekends) · 3 Access routes shared with occupiers, neighbours or public · 4 Restricted deliveries or no vehicle access · 5 Tight site: little storage space, headroom or weight limits · 6 Site fronts a public road or pavement (hoarding / scaffold / crane licence) · 7 No access constraints · 8 Other.
  Q3.5a "When can construction take place?": School / university holidays only · Any time except set dates (up to 3 ranges) · Only within set dates (up to 3 ranges). Engine: options 2–6 each add prelims +0.5% (cap as today), programme uplift (as today) and a risk; option 1 schedules or pauses construction in the Q3.5a windows. Old "Term-time only working" → holidays only.
- **C6** Footer becomes "Indicative only".
- **C8** Procurement Reference: Quotations only under £100k works; Remeasurement only for civils / ground works.
- **Still to approve later:** A11 rate figures and B6 durations, sent as a spec once drafted.
- **No numbers in code (owner, 10 Oct 2026 — "move all 9"):** every figure the engines use comes from a workbook; a missing row stops the report and shows in Admin. NRM1 v5.21: ▶ factors vat_partly_share and sens_* (cost-driver steps), ▶ range_widths DEFAULT, ▶ confidence BENCHMARK_BREACH (0 pts, threshold 0.3, cap D); loader refuses a missing one, an F row without a cap or a G row of 0; OH&P £1m / £5m bands read from the rule text. Programme v4.7: Modifiers SB-S1…S7 (size bands) and PB-S1…S7 (programme check); no backup durations; no tender / route / contract chosen from the value in code (TN1 marked provisional until the Procurement Reference decides). Only effect on batch 3: the four estimates more than 30% over benchmark (FO-9, NB-8, NB-9, RF-9) now grade D with the D range. Still in code, for reports made before v5.15 only: the old deficiency count in computeConfidence().
- **Industrial offices split (owner, 10 Oct 2026):** no rates by building use. Industrial / warehouse New build and Extension ask Q1.3a (share of the floor that is offices, welfare and staff areas; blank = the workbook's suggestion, ▶ quantity_ratios office_share 0.10, AI estimate – verify) and Q1.3b (rest: Storage / warehouse · Factory / production). NRM1 v5.22: inputs OFFICES / PRODUCTION; internal walls, doors, wall / floor / ceiling finishes, signage and data measured on OFFICES; heating, water, ventilation, power and builder's work on OFFICES + PRODUCTION; everything else on GIFA. The report's cost assumptions and the prompt carry the split ("Industrial building: 10% of the floor (1,250 m²) …"). Batch 3: only NB-9 moved, £3,296 → £2,518/m²; the rest of its excess is the shell (walls, windows, frame, roof priced as a normal building) — a separate decision.
