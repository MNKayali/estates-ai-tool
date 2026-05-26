# Estates AI Tool — Master Coordination Map
**Version 3.0 | June 2026 | The single reference that proves the document set agrees with no contradictions**

---

## The coordinated set

| Document | Version | Owns | Status |
|----------|---------|------|--------|
| Questionnaire | v7.0 | Question wording + triggers. **No numbers.** | ✅ Current |
| NRM1 Cost Estimate Tool | v3.2 | Every £ rate AND every percentage (A–H). | ✅ Current |
| Programme Duration Reference | v3.1 | Every duration in weeks. | ✅ Current |
| Report Template | v2 (HTML + Word) | Fixed layout the AI fills. | ✅ Unchanged |
| Claude Code Build Brief | v2.2 + Q2.3 patch | Complete rebuild specification + Q2.3 patch. | ✅ Current |

**The rule that prevents all drift:** a number lives in exactly one document. The questionnaire holds triggers only. The NRM1 workbook owns every £ and %. The Programme Reference owns every week. Update one cell — every future report follows.

---

## End-to-end chain

```
Questionnaire answer
   → tells the app WHICH lookup to perform
       → NRM1 Tool returns the £ / %        (cost)
       → Programme Reference returns weeks   (time)
           → numbers drop into fixed Report Template
               → AI writes prose around fixed numbers
```

---

## Q2.3 Level of Works — the master alignment table

**UPDATED v3.0 — four new option names replacing the previous four.**
The previous "Like-for-like replacement" tier incorrectly skipped all m² rates, producing
costs 7–8× too low for full flat refurbishments. All four new tiers use m² rates.
Q2.3 now adjusts only the band multiplier — the scope items ticked in Q2.2 determine what
is priced.

| Questionnaire v7 option | NRM1 Tab 5 | Programme v3.1 | Band multiplier | Design multiplier | Group 0? |
|------------------------|-----------|----------------|----------------|-------------------|---------|
| Fabric and finishes only | Fabric and finishes only | Fabric and finishes only | × 0.80 (lower band) | × 0.50 | No* |
| Finishes with minor services | Finishes with minor services | Finishes with minor services | × 0.90 (lower-mid) | × 0.70 | No* |
| Full systems replacement | Full systems replacement | Full systems replacement | × 1.00 (mid — baseline) | × 1.00 | No* |
| Reconfiguration or full redesign | Reconfiguration or full redesign | Reconfiguration or full redesign | × 1.15 (upper band) | × 1.30 | Yes |

*Group 0 also included if demolition/asbestos/contamination ticked in Q2.2 or Q3.1 regardless of Q2.3 tier.

---

## Q2.2 Scope of Works — full element mapping (v6 → NRM1 v3.2)

Every item in v6 Q2.2 maps to exactly one or more rows in NRM1 Tab 2. No orphans.

| Q2.2 item | NRM1 element(s) | Unit | Rfb Std rate | Notes |
|-----------|----------------|------|-------------|-------|
| 0.1 Asbestos removal | 0.1 | Item | £40/m² | |
| 0.2 Demolition / strip-out | 0.2 | Item | £35/m² | |
| 0.3 Contaminated land | 0.3 | Item | £10/m² | |
| 1.1–1.3 Foundations | 1.1, 1.3 | m² | NB Std £55/m² | NB/Ext only |
| 1.4 Basement | 1.4 | Item | NB Std £80 | NB/Ext only |
| 2.1–2.2 Frame and floors | 2.1, 2.2 | m² | Rfb £20+£15/m² | |
| 2.3 Roof | 2.3 | m² | £55/m² | |
| 2.5 External walls | 2.5 | m² | £60/m² | |
| 2.6 Windows/doors | 2.6 | m² | £130/m² | |
| 2.7 Internal partitions and doors | 2.7, 2.8 | m² | £50/m² | 2.8 doors priced within |
| 2.9 Waterproofing/tanking | 2.9 | m² | £22/m² | |
| 3.1 Wall finishes | 3.1 | m² | £35/m² | Always included |
| 3.2 Floor finishes | 3.2 | m² | £55/m² | Always included |
| 3.3 Ceiling finishes | 3.3 | m² | £30/m² | Always included |
| 4.1 Joinery | 4.1 | Item | £45/m² GIFA | |
| 4.2 Sanitary fittings | 4.2 | **Nr** | **£900/Nr** | **Qty = number of bathrooms/wet rooms** |
| 4.3 Kitchen / servery | 4.3 | **Nr** | **£3,500/Nr** | **Qty = number of kitchens** |
| 4.4 Specialist equipment | 4.4 | Item | £10/m² | |
| 5.1 Plumbing HWS/cold water | 5.1 | m² | £65/m² | |
| 5.2 Heating new/upgraded | 5.2 | m² | £50/m² | |
| **5.2L Gas boiler LFL** | **5.2L** | **Item** | **£3,500/Item** | **NEW v3.2 — Rfb only** |
| 5.5 Gas installation | 5.5 | Item | £10/Item | |
| 5.3 Ventilation/AHU | 5.3 | m² | £45/m² | |
| 5.4 Air conditioning | 5.4 | m² | £30/m² | |
| 5.6 Sprinklers | 5.6 | m² | £15/m² | |
| 5.7 Main LV panel | 5.7 | Item | £38/m² | |
| **5.7a Sub-distribution/containment** | **5.7a** | **m²** | **£18/m²** | **NEW v3.2** |
| 5.8 Full rewire | 5.8 | m² | £70/m² | NB/Ext. Mutually exclusive with 5.8a/b |
| **5.8a Electrical 1st fix only** | **5.8a** | **m²** | **£22/m²** | **NEW v3.2 — Rfb only** |
| **5.8b Electrical 2nd fix only** | **5.8b** | **m²** | **£15/m²** | **NEW v3.2 — Rfb only** |
| **5.8c 2nd fix lighting** | **5.8c** | **m²** | **£18/m²** | **NEW v3.2 — all types** |
| **5.9a Fire alarm system** | **5.9a** | **m²** | **£18/m²** | **NEW v3.2 — was combined 5.9** |
| **5.9b Emergency lighting** | **5.9b** | **m²** | **£10/m²** | **NEW v3.2 — was combined 5.9** |
| 5.11 Solar PV | 5.11 | kWp | £800/kWp | Qty from Q1.5 |
| 5.12 BESS | 5.12 | kWh | £400/kWh | Qty from Q1.5 |
| 5.13 DNO upgrade | 5.13 | Item | £30/Item | |
| 5.14 BEMS | 5.14 | m² | £8/m² | |
| 5.15 EV charging | 5.15 | Nr | £1,500/Nr | Qty from Q1.5 |
| 5.16 IT/data | 5.16 | m² | £18/m² | |
| 5.18 Access control/CCTV | 5.18 | m² | £15/m² | |
| 5.19 Lifts | 5.19 | Nr | £80,000/Nr | Qty from Q1.5 |
| 6.2 Raised floor/mezzanine | 6.2 | Item | £50/Item | |
| 7.1 Structural repairs | 7.1 | Item | £25/Item | Rfb/Ext only |
| 7.2 Fabric/envelope repairs | 7.2 | Item | £20/Item | Rfb/Ext only |
| 7.3 DPC treatment | 7.3 | Item | £10/Item | Rfb/Ext only |
| 7.4 M&E overhaul | 7.4 | Item | £30/Item | Rfb/Ext only |
| 7.5 Making good | 7.5 | Item | £10/Item | Rfb/Ext only |
| 8.1 Site preparation | 8.1 | Item | £8/Item | |
| 8.2 Roads/paving | 8.2 | m² | £10/m² | |
| 8.3 Car parking | 8.3 | Nr | £5/Nr | |
| 8.4–8.5 Drainage | 8.4, 8.5 | Item | £6–8/Item | |
| 8.6 External utilities | 8.6 | Item | £8/Item | |
| 8.7 Soft landscaping | 8.7 | m² | £3/m² | |
| 8.8 Boundary enclosures | 8.8 | Item | £3/Item | |
| 8.9 External lighting | 8.9 | Item | £2/Item | |
| BWIC | 5.20 | m² | £18/m² | Auto-included when any Group 5 present |

**Items in NRM1 Tab 2 not directly selectable in Q2.2 (priced via related items):**
- 0.4 Ground stabilisation — priced when 0.3 selected
- 2.4 Stairs/ramps — not in v6; add to future version
- 4.5 Signage — not in v6; add to future version
- 5.10 External building lighting — priced via 8.9
- 5.17 AV systems — via "Other/Specialist" field in Q2.2
- 5.20 BWIC — auto-included; not user-selectable
- 6.1 Modular units — via "Other/Specialist" field

---

## Q2.3 Level of Works — NRM1 Tab 5 lookup (updated v3.0)

Tab 5 must be updated in the Excel workbook to reflect the new option names and multipliers.
Until the workbook is updated, the app will fall back to the default ×1.00 for unrecognised strings.

| Q2.3 option (v7) | Band multiplier | Rate column basis | Group 0? | Design multiplier |
|-----------------|----------------|------------------|---------|-------------------|
| Fabric and finishes only | × 0.80 | Rfb Std lower end | No* | × 0.50 |
| Finishes with minor services | × 0.90 | Rfb Std lower-mid | No* | × 0.70 |
| Full systems replacement | × 1.00 | Rfb Std mid (baseline) | No* | × 1.00 |
| Reconfiguration or full redesign | × 1.15 | Rfb Std upper end | Yes | × 1.30 |

*Group 0 triggered by Q2.2/Q3.1 asbestos/demolition flags regardless.

## Q4.2 / Q4.5 — Design stage fee percentage alignment

| Q4.5 option (v6) | RIBA Stage | NRM1 Tab 3 fee % | Programme start point |
|-----------------|-----------|-----------------|----------------------|
| Concept only (Stage 0–1) | 0–1 | 12–15% → use 13.5% | Full design (Stages 2–4) |
| Concept complete (Stage 2) | 2 | 10–13% → use 11.5% | Stage 3 onwards |
| Developed design (Stage 3) | 3 | 7–10% → use 8.5% | Stage 4 only |
| Technical complete (Stage 4) | 4 | 5–7% → use 6% | Procurement only |

---

## Q4.7 — Funding source → programme / procurement flags

| Q4.7 option (v6) | Programme effect | Procurement note |
|-----------------|-----------------|-----------------|
| Internal / commercial | No uplift | Standard procurement |
| Grant or public funding | +4–8 weeks governance approval | Formal competitive procurement likely required regardless of value |
| Not yet confirmed | Risk register entry added | None |
| Other (free text) | AI extracts implications from text | AI extracts any procurement constraints |

---

## Programme size bands

| Band | GIFA | Design Stage 2 | Design Stage 3 | Design Stage 4 | Gateway | Source |
|------|------|---------------|---------------|---------------|---------|--------|
| Very Small | < 150 m² | 2–3 wks | 2–3 wks | 2–3 wks | 1 wk | Programme Ref v3.1 col B |
| Small | 150–500 m² | 6–8 wks | 5–7 wks | 5–8 wks | 2 wks | Programme Ref v3.1 col C |
| Medium | 500–2,000 m² | 8–12 wks | 7–11 wks | 8–13 wks | 2 wks | Programme Ref v3.1 col D |
| Large | > 2,000 m² | 12–18 wks | 10–14 wks | 12–20 wks | 2 wks | Programme Ref v3.1 col E |

---

## Resolution of all contradictions — v6 coordinated set

| Issue | Resolution | Where fixed |
|-------|-----------|-------------|
| Q2.3 "Like-for-like" skipped all m² rates | Removed entirely — all four new tiers use m² rates; Q2.3 adjusts band multiplier only | Q2.3 patch + NRM1 Tab 5 |
| Q2.3 options indistinguishable (LFL ≈ Light touch; Refurb ≈ Strip-out) | Replaced with four clearly distinct tiers: Fabric only / Minor services / Full systems / Reconfiguration | Questionnaire v7 + all docs |
| 5.9 combined element vs v6 split 5.9a/5.9b | 5.9 split into 5.9a (fire alarm) and 5.9b (emergency lighting) in NRM1 Tab 2 | NRM1 v3.2 |
| 7 new v6 Q2.2 elements had no NRM1 rows | Added: 5.2L, 5.7a, 5.8a, 5.8b, 5.8c, 5.9a, 5.9b | NRM1 v3.2 Tab 2 + Tab 7 |
| 4.2 sanitary quantity wrong (GIFA not Nr) | 4.2 unit = Nr; qty = bathroomCount from Q2.2 sub-prompt | NRM1 v3.2 + code |
| 4.3 kitchen priced as £/m² GIFA | 4.3 unit = Nr; qty = kitchenCount from Q2.2 sub-prompt | NRM1 v3.2 + code |
| Programme too long for small projects | Very Small band (<150 m²) added | Programme v3.1 |
| Gateway fixed at 2 wks regardless of scale | Very Small gateway = 1 wk; read from workbook | Programme v3.1 |
| Tender period showed as zero | Sub-£100k: 3–4 wks Very Small; 4–6 wks others | Build Brief v2.2 |
| Doc version refs out of date | All docs now reference NRM1 v3.2, Programme v3.1, Q v6 | This map |
| Q3.1 had no Other field | "Other — please describe" added | Questionnaire v6 ✅ already done |
| Q3.3 options limited | "Other" + expanded list | Questionnaire v6 ✅ already done |
| Q3.5 had no Other field | "Other" option present | Questionnaire v6 ✅ already done |
| Q4.7 was 3 options | 4 options + Other free text | Questionnaire v6 ✅ already done |

---

## Maintenance — how to update

| To change… | Edit… | Auto after… |
|-----------|-------|-------------|
| Any cost rate | NRM1 v3.2 Tab 2, one cell | Next report |
| Any percentage rule | NRM1 v3.2 Tab 3, one row | Next report |
| Any programme duration | Programme Ref v3.1, one cell | Next report |
| BCIS regional factor | NRM1 v3.2 Tab 6 | Next report |
| Add scope item | Q2.2 + NRM1 Tab 2 (new row) + Tab 7 (new mapping) + code | After deploy |
| Add Q2.3 level | Q2.3 + NRM1 Tab 5 (new row) + Programme v3.1 (new multiplier row) + code | After deploy |
| Report layout/wording | Report Template only | Next report |

**After every Excel edit:** check `/api/rates-check` confirms workbook loads correctly.  
**Always update the NRM1 Tab 2 UPDATE LOG** with source and date.

---

*End of Coordination Map — Estates AI Tool — v2.0 — May 2026*
