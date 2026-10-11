# Procurement and the programme — brief for the engine

*11 October 2026 · follows the RIBA Plan of Work 2020 · owner's decisions of 11 Oct included · not built yet*

## 1. The principle

Three separate things, never mixed:

| | Decides | Lives in |
|---|---|---|
| **Procurement route** (RIBA Plan of Work 2020) | **When** the contractor is brought in, and who does Stage 4 | Procurement Reference tab 2 (which route is suggested) |
| **Contract** (chosen within the route) | The contract name; Minor Works and CDP also change the design time | Procurement Reference tab 3 (choice) and **tab 5 'Routes and contracts'** (the full list per route) |
| **Route to market** | **How long** the tender takes | Procurement Reference tab 2 (choice), Programme workbook TN rows (weeks) |

The commercial model (lump sum, GMP, target cost…) only narrows which contracts fit. It never changes the weeks.

## 2. The four routes and the programme

**No overlap (owner):** on every route, work on site starts only when Stage 4 is complete. **Contractor-led is not offered.**

| Route | Contractor brought in | Sequence the programme shows |
|---|---|---|
| **Traditional** | Tender at the end of Stage 4 | Stage 2 → Stage 3 → Stage 4 (client) → tender → build |
| **Design & Build 1 Stage** | Employer's Requirements at the end of Stage 3 | Stage 2 → Stage 3 → tender → Stage 4 (contractor) → build |
| **Design & Build 2 Stage** | ER at the end of Stage 2; contractor under a PCSA through Stage 3; price agreed at the end of Stage 3 | Stage 2 → Stage 3 with the first-stage tender alongside → second-stage price → Stage 4 (contractor) → build |
| **Management Contract / Construction Management** | Contractor appointed at the end of Stage 2 | Stage 2 → Stage 3 with the appointment alongside → Stage 4 (packages let during it) → build |

Planning: the application goes in at the end of Stage 3 on every route. No construction contract and no start on site before consent.

## 3. Contracts within the routes (full list: Procurement Reference tab 5)

| Route | Contracts | Effect on the programme |
|---|---|---|
| Traditional | **JCT MW / MWD, NEC4 ECS** (small, simple) | **Stage 3 and Stage 4 combined into one short design-and-specification stage** |
| Traditional | **JCT ICD, SBC + CDP** (the CDP option) | **Client's Stage 4 shorter** (named parts designed by the contractor after award) |
| Traditional | JCT IC, SBC, MTC, PCC; NEC4 ECC A/B | None |
| Design & Build 1 Stage | JCT DB (MWD when small); NEC4 ECC A with contractor's design | None (the route sets the sequence) |
| Design & Build 2 Stage | JCT PCSA then DB / CE; NEC4 ECC C with X22 | None |
| Management / CM | JCT MC, CM Appointment + trade contracts; NEC4 ECC F | None |

## 4. When Minor Works is suggested (all must hold)

| Check | Rule |
|---|---|
| Project type | Refurbishment, Fit-out or External works |
| Value | Construction cost **under £1m** (owner) |
| Level of work | Not "Reconfiguration or full redesign" |
| Specialist design | None of: laboratory, clinical, cleanroom, medical gases, fume extraction, lifts, sprinklers, smoke ventilation. One such item on a small job: **MWD** |
| Size | Up to 500 m² (owner to confirm) |
| Client preference | Favoured when the top priority is Lowest cost or Speed |

All of these limits are workbook cells, not code.

## 5. Tender periods (Programme workbook, weeks by size band)

| Row | Route to market | S1 | S2 | S3 | S4 | S5 | S6 |
|---|---|---|---|---|---|---|---|
| TN1 | Open or selective tender | 4–6 | 5–7 | 6–8 | 8–10 | 10–12 | 10–12 |
| TN2 | Quotations | 3–4 | 3–4 | 4–6 | 4–6 | 4–6 | 4–6 |
| TN3 | Framework mini-competition | 3–4 | 4–5 | 4–5 | 4–6 | 4–6 | 4–6 |
| TN4 | Negotiated | 2–3 | 2–3 | 3–4 | 3–4 | 3–5 | 3–5 |
| **TN5 (new)** | Framework direct award | 1–2 | 1–2 | 2–3 | 2–3 | 2–3 | 2–3 |
| **TN7 (new)** | D&B 2 Stage: second-stage price | 3–4 | 3–4 | 3–4 | 4–6 | 6–8 | 6–10 |

A tender that runs alongside a design stage (the D&B 2 Stage first stage, the management contractor's appointment) adds time only if it outlasts that stage.

## 6. New figures in the Programme workbook ('Procurement' sheet)

| Row | Meaning | Proposed |
|---|---|---|
| Route rows (4) | The stage after which the contractor comes in, who does Stage 4, which tender rows apply | as section 2 |
| DS34-MW | Minor Works: combined design-and-specification stage (weeks) | S1 1–2 · S2 2–3 · S3 2–4 · S4 3–5 |
| CDP-S4 | CDP: client's Stage 4 as a share of the normal Stage 4 | 0.8 |

## 7. Examples (Programme v4.10)

**300 m² toilet refurbishment, Stage 0–1, no planning, quotations — Traditional**

| Contract | Weeks incl. float |
|---|---|
| JCT IC (today) | 40 |
| **JCT Minor Works** | **29** |

**2,500 m² office new build, Stage 0–1, full planning, open tender** (no overlap)

| Route | Weeks incl. float |
|---|---|
| Traditional (JCT SBC) | 104 |
| Traditional with CDP | 101 |
| Design & Build 1 Stage | 102 (one fewer client gateway) |
| Design & Build 2 Stage | 98 (the first-stage tender runs alongside Stage 3) |
| Management / CM | 93 (the appointment runs alongside Stage 3) |

## 8. Build and check

1. Programme workbook v4.11: the 'Procurement' sheet, TN5, TN7, DS34-MW, CDP-S4.
2. Procurement Reference: RIBA route names in tab 2 ("Design & Build 1 Stage", "Design & Build 2 Stage", "Management Contract / Construction Management"); Minor Works / MWD / ECS and the CDP option as contract rows in tab 3, with the section 4 rules. Tab 5 (done, v2.2) is the reference list.
3. Engine: the route sets the sequence, the contract applies its design effect, the route to market sets the tender length.
4. Report: the programme page names the route and the contract.
5. Tests for every route, both contract effects and every gate; the 30 batch-4 scenarios and the real projects re-run.

## Owner decisions still open

1. Minor Works size limit: 500 m², or no size limit (value alone)?
2. CDP: client's Stage 4 at 80%?
