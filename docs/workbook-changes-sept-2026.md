# Workbook changes — September 2026

> **Status (23 September 2026): the NRM1 half of this spec is superseded.** The
> rates workbook is now NRM1 v5.x (`NRM1_Cost_Estimate_Tool_v5_2.xlsx`, content
> v5.3), read by `lib/nrmWorkbook.js` — the v4.5 tabs named below no longer
> exist. From this spec, v5.3 carries only the range widths (now '3. Settings'
> ▶ range_widths, same illustrative values). **Not carried into v5.x:** the base
> date row, the three higher-risk-building percentage rows and the extra
> benchmark bands — add them to '3. Settings' ▶ percentage_rules / ▶ benchmarks
> (and a base date to ▶ workbook_info, which also needs a small loader change)
> if still wanted. **The Programme half below is still to apply.**

Cell-by-cell spec for the two reference workbooks. Apply these in Excel (not via
a script, so cell formatting, comments and the UPDATE LOG survive), then push
and check `/api/rates-check`.

Every item here is read by a parser in `lib/costCalculator.js` or
`lib/programmeCalculator.js` that **tolerates the column or sheet being
absent** — the code ships first and behaves exactly as before until the
workbook catches up. Where a parser keys on a specific token in a cell, the
token is called out in **bold**; keep it.

Rates and durations marked *(illustrative)* are placeholders for you to set.
Rows left with blank rate cells are simply not priced until filled — they never
produce a wrong number.

---

## NRM1 workbook — `NRM1_Cost_Estimate_Tool_v4_5.xlsx`

**Keep the filename exactly as it is.** `RATES_FILE_URL` points at this file by
name, so renaming it to v4.6 breaks the live app until the environment variable
is changed in Vercel *and* in `.env.local`. Bump the version *inside* the
workbook instead (see Tab 1 below); that text is what the report prints as its
data source, so it still updates.

### Tab 1 `1. Instructions`

Insert one row directly under row 2 (the "Coordinated cost workbook…" line):

| A | B |
|---|---|
| **Base date** | 2Q 2026 |

Column A must read exactly `Base date` (case-insensitive). Column B is the
quarter the rates are current at; the report prints this as the estimate base
date instead of the generation date. Update it every time you re-benchmark.

Also bump the title in A1 to `NRM1 COST ESTIMATE TOOL - v4.6` and the issue
line in A2, so the report's "Data sources" line shows the new version. The
*filename* stays `..._v4_5.xlsx` for the reason given at the top of this
section.

### Tab 2 `2. Master Cost Table`

**New column T (index 19) — `Source`.** Header cell T4 = `Source`. Fill per
row with the origin and date of the rate, e.g. `BCIS 2Q26`, `Spon's 2026`,
`Contractor quote Jun 2026`, `Estimate — calibrate`. Blank is tolerated and is
counted as "unsourced" in the report's Estimate Basis.

**Fix `5.1b Mechanical second fix`** — all eight rate cells are blank, which is
why the tier-2 "Use typical scope" preset produced a "selected but excluded"
line and a confidence downgrade. Suggested *(illustrative)*: Rfb Basic 12 · Rfb
Std 18 · Rfb High 30; leave NB and Ext blank (refurb-only, same convention as
5.8b). Notes: `Refurb only. 2nd fix only — taps, radiators, TRVs, visible
fittings.`

**Fix three `Quantity to capture` cells** (column I) that leak into the
questionnaire as prompt labels:

| Row | Current | Change to |
|---|---|---|
| 8.9 | `GIFA (automatic, m²)` | `Number of columns / fittings` |
| 4.4 | `Per listed element (WC count + GIFA)` | `Number of items` |
| 5.3 | `Per listed element (WC count + GIFA)` | `GIFA (automatic, m²)` |
| 5.4 | `Per listed element (WC count + GIFA)` | `GIFA (automatic, m²)` |

**New rows.** Building Use `All` unless stated; BCIS `Yes` unless stated;
Min Lvl 1 for fabric, 3 for services. Leave the rate columns blank until you
have a figure. `per_kw` is a **new pricing type** the code now understands
(quantity × rate, no BCIS, no band — same as `per_kwp`).

| Code | Grp | Building Use | Element / Description | Unit | Pricing Type | Min Lvl | Quantity to capture | BCIS | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 2.10 | 2 | All | Cladding remediation / recladding | m² | gifa_rate | 1 | GIFA (automatic, m²) | Yes | Refurb only. EWS1 / PAS 9980 driven. Per m² GIFA proxy. |
| 2.11 | 2 | All | Fabric insulation upgrade — loft / roof | m² | footprint_rate | 1 | footprint_rate | Yes | Decarbonisation (PSDS). |
| 2.12 | 2 | All | Fabric insulation upgrade — external / internal wall (EWI / IWI) | m² | gifa_rate | 1 | GIFA (automatic, m²) | Yes | Decarbonisation (PSDS). |
| 2.13 | 2 | All | Window refurbishment / secondary glazing (heritage) | m² | gifa_rate | 1 | GIFA (automatic, m²) | Yes | Listed / conservation-area alternative to 2.6. |
| 2.14 | 2 | All | Fire door replacement | Nr | per_nr | 1 | Number of fire doors | Yes | FD30/FD60 doorsets inc. ironmongery. |
| 2.15 | 2 | All | Fire compartmentation & fire stopping | m² | gifa_rate | 1 | GIFA (automatic, m²) | Yes | Post-Grenfell remediation; FRA actions. |
| 2.16 | 2 | All | Roof access & fall arrest | m² | footprint_rate | 1 | footprint_rate | Yes | Mansafe / guardrails. |
| 5.2H | 5 | All | Air / ground source heat pump plant | kW | per_kw | 3 | Plant capacity (kW) | No | Decarbonisation. £/kW installed. Pair with 5.2 for distribution. |
| 5.31 | 5 | All | Accessible WC / Changing Places facility | Nr | per_nr | 2 | Number of facilities | Yes | Doc M / Changing Places spec. |

Optionally tag rows `Non-Residential` in column D where they should be hidden
for residential uses.

### Tab 3 `3. Percentage Rules`

Three new `ADD` rows for higher-risk buildings (Building Safety Act 2022). The
evaluator keys on the token **`higher-risk`** in the Condition cell.

| Code | Addition | Type | Adjust % | Cap % | Condition (questionnaire trigger) |
|---|---|---|---|---|---|
| C | Professional Fees | ADD | 1.5 *(illustrative)* | | Q3.8 = Higher-risk building (BSA principal designer duties, Gateway 2 submission) |
| D | Developer & Project Costs | ADD | 1 *(illustrative)* | | Q3.8 = Higher-risk building (BSR Gateway 2 application and fees) |
| E | Risk Allowance | ADD | 1 *(illustrative)* | 10 | Q3.8 = Higher-risk building |

### Tab 8 `8. Benchmark Check`

Add bands for the project types the sense check currently skips. Values
*(illustrative)*:

| Project Type (Q1.2) | Building Use (Q1.3) | Expected Low £/m² | Expected High £/m² |
|---|---|---|---|
| Extension | Office/Commercial | 1600 | 2600 |
| Extension | Residential | 1500 | 2500 |
| Extension | Education | 1800 | 3000 |
| Fit-out | Education | 600 | 1400 |
| Fit-out | Healthcare | 1200 | 2600 |
| External Works | All | 60 | 250 |

The External Works row is per m² **site area** (Q1.5 is relabelled for that
project type). The building-use cell `All` matches every use.

### New Tab 9 `9. Range Widths`

Sheet name must be exactly `9. Range Widths`. The cost range that used to be a
flat ±11% now widens with the deterministic confidence grade.

| Confidence grade | Low factor | High factor |
|---|---|---|
| A | 0.90 | 1.10 |
| B | 0.85 | 1.15 |
| C | 0.80 | 1.25 |
| D | 0.75 | 1.30 |

Factors are *(illustrative)*. Header row is skipped; a row is read when column
A is a single letter A–D and columns B and C are numbers. Absent sheet → the
old 0.89 / 1.11.

---

## Programme workbook — `Estates_AI_Programme_v4_3.xlsx`

**Keep the filename exactly as it is**, for the same reason as the NRM1 file:
`PROGRAMME_FILE_URL` points at it by name. Bump the `Version` cell on the
README sheet to `v4.4 · September 2026 · …` instead; that is what the report
quotes.

### Sheet `Durations`

Two new rows, same column layout as the existing ones (ID · Phase · Activity ·
S1_Lo … S6_Hi · Unit · Type · ParallelWith · ScaledByQ2.3 · Trigger · Notes).
Weeks *(illustrative)*, same for all six bands unless you differentiate:

| ID | Phase | Activity | Lo | Hi | Unit | Type | ParallelWith | Scaled | Trigger | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| SV7 | Survey | Ecology / bat survey | 2 | 4 | wks | PARALLEL | Stage2-3 | N | Q3.8 = Ecological features OR roof scope (2.3/2.16/7.2) on a pre-2000 building | Seasonal: emergence surveys May–September only. A miss can cost a full year. |
| BS1 | BuildingSafety | Building Safety Regulator — Gateway 2 approval | 12 | 24 | wks | CRITICAL | - | N | Q3.8 = Higher-risk building | Statutory 12 weeks, sequential after Stage 4 and Building Control, before tender award. Real-world determinations frequently exceed 20 weeks. |

The code reads rows by ID (`SV7`, `BS1`); the other columns are documentation.

### Sheet `Modifiers`

Nothing to add. `PROG-FLOAT` (`+1 wk per 13 wks`) is already present and is
now applied: the headline programme includes the float and the best-case
(no-float) figure is reported alongside it. The parser reads the number after
`per`.

### New sheet `Procurement`

Sheet name exactly `Procurement`. Replaces the value-only route/contract logic
that used to live in code. **First matching row wins**, so order rows from most
specific to most general. Row 1 is the header.

Columns (A–K):

| Rule | Primary priority | Cost mid ≥ £ | Cost mid < £ | Design stage reached | Route | Contract form | Tender type | Tender ID | Design responsibility | Rationale |
|---|---|---|---|---|---|---|---|---|---|---|

- **Primary priority** — the first-ticked Q4.4 option, exactly as worded in the
  questionnaire (`Lowest cost`, `Fixed / certain final cost`, `Speed`, `Design
  quality`, `Flexibility`, `Minimise disruption`, `Funder / compliance
  requirement`), or `Any`.
- **Cost mid ≥ / <** — total project cost mid-point band in £; blank means no
  bound.
- **Design stage reached** — `Any`, or a Q4.5 stage token such as `Stage 4`
  (matches when the answer's stage number ≥ the token's).
- **Tender ID** — `TN1`, `TN2` or `TN3` from the Durations sheet; sets the
  tender duration.
- **Tender type** — one of `Single stage`, `Two stage`, `Direct award`.
- **Design responsibility** — `Client design team` or `Contractor`.

Suggested rows *(illustrative — edit freely)*:

| Rule | Primary priority | ≥ £ | < £ | Stage | Route | Contract form | Tender type | Tender ID | Design resp. | Rationale |
|---|---|---|---|---|---|---|---|---|---|---|
| P1 | Speed | 1000000 | | Any | Two-stage Design & Build with PCSA | JCT Design and Build Contract 2024 | Two stage | TN1 | Contractor | Early contractor involvement compresses the pre-construction programme on a larger scheme. |
| P2 | Speed | | 1000000 | Any | Framework call-off | JCT Intermediate Building Contract 2024 | Direct award | TN3 | Client design team | A pre-procured framework removes the formal tender period. |
| P3 | Fixed / certain final cost | 1000000 | | Any | Design & Build — Single Stage | JCT Design and Build Contract 2024 | Single stage | TN1 | Contractor | Transfers design and cost risk to the contractor for price certainty. |
| P4 | Any | 1000000 | | Any | Traditional — Single Stage Tender | JCT Standard Building Contract 2024 | Single stage | TN1 | Client design team | Standard route for a fully designed scheme above £1m. |
| P5 | Any | 250000 | 1000000 | Any | Traditional — Single Stage Tender | JCT Intermediate Building Contract 2024 | Single stage | TN1 | Client design team | Proportionate contract form for a mid-value scheme. |
| P6 | Any | 100000 | 250000 | Any | Traditional — Single Stage Tender | JCT Minor Works Building Contract 2024 | Single stage | TN1 | Client design team | Formal competition above the internal £100k threshold. |
| P7 | Any | | 100000 | Any | Direct Award — 3 Quotations | JCT Minor Works Building Contract 2024 | Direct award | TN2 | Client design team | Three quotations below the internal threshold. |

Absent sheet → the code falls back to exactly the previous behaviour (value-only
route and contract-form bands).

---

## Where these files live, and how a change goes live

Both workbooks are files in **this repository's root folder**, on `main`, and
the app fetches them at request time over raw GitHub:

```
https://raw.githubusercontent.com/MNKayali/estates-ai-tool/main/NRM1_Cost_Estimate_Tool_v4_5.xlsx
https://raw.githubusercontent.com/MNKayali/estates-ai-tool/main/Estates_AI_Programme_v4_3.xlsx
```

So the cycle is: edit in Excel, save, commit, push to `main`. **No deploy and
no code change** — the workbook is data, not code. Each calculator caches its
workbook in memory for ten minutes, so a change is live within ten minutes of
the push.

Every edit in this document is **optional and independent**. A missing sheet,
column or row falls back to exactly the previous behaviour, and a new Tab 2 row
with blank rate cells is simply never priced. Nothing here has to be done in
one sitting, and the app stays correct throughout.

Excel leaves a `~$<filename>.xlsx` lock file beside an open workbook. It is
ignored by git, so it will not be committed by accident — but close Excel
before committing anyway, or the saved file may not be the one that gets
pushed.

## After every edit

1. Commit and push the workbook to `main`.
2. Open `/api/rates-check` — it now reports `baseDate`, whether the `Range
   Widths` and `Procurement` sheets were found, and the new row IDs.
3. Add a line to Tab 2's UPDATE LOG with the source and date.
