# Test scenario format

Each report lives in its own folder: `test-reports/<CODE>-<n>-<use-slug>/`
(e.g. `FO-2-retail/`). The scenario writer creates `scenario.md` there. The
report generator later adds `report.pdf` and `run-notes.md` to the same folder.

## The 21 scenarios

| Type | 1 | 2 | 3 |
|---|---|---|---|
| NB New Build | Residential | Education | Industrial / warehouse |
| EX Extension | Student accommodation (PBSA / halls) | Healthcare | Residential |
| RF Refurbishment | Commercial offices | Student accommodation (PBSA / halls) | Healthcare |
| FO Fit-out | Commercial offices | Retail | Hospitality / leisure |
| EW External works only | Education | Industrial / warehouse | Mixed use |
| DM Demolition only | Industrial / warehouse | Other | Retail |
| OM Other or mixed | Mixed use | Other | Hospitality / leisure |

Folder slugs: residential, student, offices, education, healthcare, retail,
industrial, hospitality, mixed, other.

## Make the three scenarios for a type genuinely different

Vary across the three: size (one small < 250 m², one mid, one large > 1,500 m²
where plausible), spec level, intervention level (Refurbishment / Fit-out),
occupied vs vacant, known issues, planning route, budget (one comfortably above
the likely cost, one tight or below, one with no budget), start / target dates
(one with a hard target date), priorities, funding, and whether a financial case
(Q5) is given. Use real UK postcodes districts (e.g. `M13`, `LS2`, `BS1`) spread
across regions. Realistic, specific, and each one a project an estates team
could actually commission.

## scenario.md

```markdown
# <CODE>-<n> — <short title>

## Story
One paragraph, 80–150 words: who the client is, the building, why the project
is happening, what worries them. Written like a brief from an estates manager.

## Answers
Exactly what to enter in the form at https://estates-ai-tool.vercel.app/questionnaire,
in form order. Use the option text EXACTLY as listed in
`test-reports/_reference/scope-<CODE>.md` and below. Omit a question the form
doesn't ask for this project type. "(leave blank)" is allowed for optional
questions.

### Section 1 — Project & Location
- Q1.0 Project title: [TEST] <title>
- Q1.1 Postcode: <district, e.g. LS2>
- Q1.2 Project type: <exact label>
- Q1.2a Number of storeys: <1–6, or "7 or more storeys">   (only New Build, Refurbishment, Extension)
- Q1.3 Building use: <exact label>
- Q1.4 Building age: Pre-1900 | 1900–1979 | 1980–1999 | Post-2000   (skip if not asked)
- Q1.6 Building height over 18 m: Yes | No | Not sure   (only if 5+ storeys and NB/RF/EX)
- Q1.5 Area (m²): <number>   (External works only: the external works area)

### Section 2 — Scope
- Q2.1 Project objective: <2–4 sentences>
- Q2.2 Level of intervention: <exact level name>   (Refurbishment / Fit-out only)
- Q2.3 Scope of works:
  - Start: "Use typical scope" | "Tick individually"
  - Add: S-00xx <name>; …          (items to tick on top)
  - Remove: S-00xx <name>; …       (typical items to untick)
  - Options: S-00xx <name> → S-00xx-0y "<option label>"; …   (only where you change the default)
  - Quantities ("I know this"): S-00xx-0y "<option label>" = <number>; …   (REQUIRED for any ticked item marked qty ENTER)
  - Construction method: Traditional | Modular   (New Build only, optional)
- Q2.4 Specification level: Basic | Standard | High   (only the levels the reference lists for this type)
- Q2.5 Standards: <one or more of: BREEAM, PAS 2035, NHS design guide, Net zero, University design guide, Acoustic, Food hygiene, MCS, DNO, Highways, Dark sky, None, Other>

### Section 3 — Condition & Constraints
- Q3.1 Known issues: <options from the reference for this type>
- Q3.2 Previous works: <text or (leave blank)>
- Q3.3 Surveys available: <options from the reference; mind the building age>
- Q3.4 Planning consent: No consent required | Permitted development | Prior approval | Full planning | Full planning + Listed Building Consent | Change of use | Unsure (pre-application advice)
- Q3.5 Access constraints: <Restricted working hours | Shared access with other occupiers | No vehicle access or restricted deliveries | Height or weight restrictions on site | Scaffold licence or highway encroachment required | Term-time only working | No access constraints | Other>
- Q3.6 Occupation: Fully occupied | Partially occupied | Vacant or decanted
- Q3.7 Additional context: <text or (leave blank)>
- Q3.8 Site context: <Conservation area or Article 4 direction | Attached to or within 3 m of a neighbouring building (party wall) | Ecological features — roof voids, mature trees, water bodies, bat roost potential | None of these>

### Section 4 — Programme, Budget & Delivery
- Q4.1 Target completion: No specific deadline | <YYYY-MM-DD>
- Q4.2 Expected start: <YYYY-MM-DD, 2026-11 to 2027-09> | (leave blank)
- Q4.3 Budget (£, incl. fees, contingency and VAT): <number> | (leave blank)
- Q4.4 Priorities (max 2, first = primary): Lowest cost | Fixed / certain final cost | Speed | Design quality | Flexibility | Minimise disruption | Funder / compliance requirement
- Q4.5 Design stage: Concept only (Stage 0–1) | Concept complete (Stage 2) | Developed design (Stage 3) | Technical complete (Stage 4)
- Q4.6 Phasing: Single phase | Multiple phases
- Q4.7 Funding: Internal / commercial | Grant or public funding | Not yet confirmed
- Q5.1 Financial benefit: <Energy or operational cost savings | Rental or commercial income | Grant or funding unlock | Avoidance of compliance cost or penalty | Increased asset value | No direct financial return — strategic or compliance project> | (leave blank)
- Q5.2 Annual benefit (£): <number> | (leave blank)
- Q6.1 Report instructions: <text> | (leave blank)

## What the report should show
6–10 checkable bullets tying answers to the report, e.g.
- Cover/summary: [TEST] title, Fit-out, Retail, 180 m², postcode district
- Scope page lists the items ticked above (name them), toilets at the entered count
- Risk register includes asbestos (Q3.1) and a conservation-area risk (Q3.8)
- Programme includes a planning stage (Full planning) and ends before the Q4.1 target, or the report flags it can't
- Budget verdict: expect "shortfall" (budget deliberately tight)
- No "higher-risk building" content (3 storeys)
Never predict exact £ figures or weeks — the engines decide those.
```
