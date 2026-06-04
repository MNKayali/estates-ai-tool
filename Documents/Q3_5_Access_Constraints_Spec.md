# Q3.5 Access Constraints — Programme + Risk Register Spec
**For Estates AI Tool · feeds Programme v4.3 + the AI risk-register prompt · June 2026**

Q3.5 (`q3_5_accessConstraints`, multi-select) now drives **three** things. Cost was already handled (Prelims A in NRM1 Tab 3); this spec adds the programme tier and — the priority — the risk-register seeds.

## 1. Programme uplift (Programme v4.3, Modifiers tab)

Applied to the **Construction** duration only. Apply the **highest** applicable tier — never stack.

| Tier | Modifier | Multiplier | Triggered by |
|------|----------|-----------|--------------|
| Low | ACC-1 | × 1.10 | Restricted hours · Shared access · Height/weight limits · Scaffold licence |
| High | ACC-2 | × 1.175 | No vehicle access · Term-time only |

Term-time-only is a special case: works are confined to vacation windows, which fragments rather than merely lengthens the programme. Where it is selected, also surface phasing (PH-1) and treat the programme date as indicative pending a vacation-window plan.

> Replaces the previously hard-coded `×1.175 / ×1.125` in `programmeCalculator.js`. The rewrite should read ACC-1/ACC-2 from the Modifiers tab, not hard-code them.

## 2. Risk register seeds (priority — the main use)

The risk register is AI prose. To make Q3.5 reliably produce entries, the generate-report route should inject these seeds into the AI context for each selected constraint, and the AI expands them into the register (user reviews before sharing). Likelihood/Impact use the report's existing L/I/RAG scale.

| Q3.5 selection | Seed risk | L | I | RAG | Mitigation seed |
|----------------|-----------|---|---|-----|-----------------|
| No vehicle access | Materials/plant handling and waste removal constrained; productivity loss and double-handling | M | H | **High** | Confirm offload/storage strategy; craneage or hoist plan; logistics method statement at tender |
| Term-time only | Works confined to vacation windows; programme spans multiple terms; risk of overrun into term | H | H | **High** | Phase to vacation windows; agree decant/blackout dates with faculty; build float; consider out-of-hours |
| Scaffold licence | Highway/public-realm licence lead time and conditions; possible refusal/delay | M | M | **Medium** | Apply early; confirm pavement/road licence period and inspection regime with the authority |
| Restricted hours | Reduced working window extends duration; possible premium/out-of-hours rates | M | M | **Medium** | Confirm permitted hours; price out-of-hours where critical; reflect in Prelims |
| Shared access | Coordination with other occupiers; access disputes; protection of shared routes | M | M | **Medium** | Access protocol and signage; agreed routes/times; liaison with neighbouring occupiers |
| Height/weight limits | Plant/delivery size limited; specialist or smaller plant; more deliveries | L | M | **Low** | Survey access route; confirm vehicle limits; plan delivery sizes and frequency |

Notes for the AI prompt: generate **one entry per selected constraint**; do not invent constraints not selected; if "None" is selected, add no access entries; keep mitigations practical and UK-construction specific. These seeds set the floor — the AI may merge or escalate using other answers (e.g. occupied + restricted hours → raise to High).

## 3. What stays in code (for the brief)
- `programmeCalculator.js`: read ACC-1/ACC-2 from Modifiers; apply highest tier to construction; emit a programme note when term-time-only is set.
- generate-report route: pass `q3_5_accessConstraints` + these seeds into `AI_SYSTEM_PROMPT`/context so the register is populated deterministically in *which* risks appear (AI writes only the prose).
