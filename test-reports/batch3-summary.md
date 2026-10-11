# Batch 3 — live test summary (9 Oct 2026)

21 scenarios (`<TYPE>-7…9`, titles start "[TEST3]") were entered on www.projento.co.uk. Each scenario.md holds my independent £/m² and duration benchmark. 16 are reviewed (`<ID>/review.md`). Still to review: DM-8 (report 55098bada01e4f24), DM-9, OM-7, OM-8, OM-9. Their reports were still generating in the in-app browser queue; their numbers are in the offline run (`node --import ./test-reports/_reference/alias.mjs test-reports/_reference/analyse.mjs`).

## Systemic issues (most serious first)
1. **Rates don't depend on building use or form.** Every envelope / finishes / M&E item has one £/m² GIFA rate. Results: warehouse NB-9 at ~3× (£51m–£68m vs £16m–£24m) with Grade B; office RF-9 pays £287/m² for doors and £319/m² for plumbing. "Typical scope" for Industrial = the same items as Education.
2. **v5.12 moved New-build columns by the refurb evidence ratio** with no new-build evidence (roof +73%, external walls +67%, doors +67%, ceilings +60%, lighting +142%). New-build High comes out 25–50% over benchmark (NB-8 school, EX-9 hotel).
3. **Programmes don't scale down for small or simple jobs.** Full Stage 2–4 durations, 2–3 gateways, 12-wk tender and Full Plans apply to everything. Playground 65 wks, paving 74 wks, Cat B fit-out 81 wks, £300k school refresh 79 wks → wrong "target not achievable" verdicts (FO-8, RF-8, EW-9).
4. **The prose mixes the VAT basis.** The budget box is right, but the prose compares the incl.-VAT budget with the excl.-VAT mid ("£850,000 sits below £777,000") and calls excl.-VAT totals "incl. VAT" (EX-7, EX-8, RF-7, FO-8, EW-8). 20% VAT is also always added (new-build housing is zero-rated; councils and NHS trusts recover) → false shortfalls (NB-7).
5. **"Term-time only working" is ambiguous and never reaches the programme.** It is read as "vacation-only", but construction is still scheduled in term (RF-8, EW-9). The Christmas blackout (Q3.7) is ignored too (EW-8).
6. **Quantity gaps:** "7 or more storeys" = exactly 7 (RF-7 is 13 storeys). Demolition-only footprint = GIFA (DM-7 service diversions ×3). Demolition and asbestos on an Extension default to the new GIFA (EX-9). Paving ratio is added on top of the client's yard / parking (NB-9, EW-7). Dwellings come from the ratio (64) not the brief (56) (NB-7).
7. **Default options:** heating defaults to a gas boiler on residential and office refurbs even with Net zero ticked; the prose then describes ASHP (RF-7, RF-9). Choosing a Platform lift leaves the Passenger lift ticked too (NB-8).
8. **Ecology survey trigger too broad:** it fires on an extension's new roof or on "Repairs" (EX-7, EX-8, EX-9, RF-7).
9. **Confidence ignores benchmark breaches:** works 36%–3× over the tool's own band still grades B/C.
10. **Smaller:** "Development version" in every footer; External works says "m² GIFA"; the procurement suggests Quotations at £650k and then argues against it (FO-7); "Remeasurement" model; invented names ("University of Leeds", "Manchester" for Salford); estimates attributed to the client; the benchmark band for office refurb (£600–£1,200) ignores the level of intervention.

## What worked
Regions (incl. Scotland, Wales, NI, Inner London), Gateway 2 only where it should appear, phasing (count + gap), the Q4.8 framework filter, the Financial Case gating, the risk register coverage of known issues / site context, and the Q6.1 target answer (NB-8). Workbook data bug: Scotland location factor mid 0.90 < low 0.93.
