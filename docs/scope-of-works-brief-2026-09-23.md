# Scope of works — brief for Claude Code

*Transcribed from "Scope breif.docx", supplied by Nabil Kayali on 23 September 2026, with the
NRM1 Cost Estimate Tool v5.2 workbook. This is the brief PR #12 implements. The eight decisions
at the end were confirmed that day; build to them. Where this brief and the code differ, the
code's documented choices are listed in CLAUDE.md ("Current state — read this first").*

Every ticked item is priced on an estimate by default, and the user refines only what they know.
No new question is added: Level of intervention stays the control for refurbishment scope. This
brief explains how the Scope of works screen works; the items, rules and prices are all in one
workbook, NRM1 Cost Estimate Tool v5.2, the single source of truth. Questions are named rather
than numbered here, because the app is being renumbered (build rule 2). Claude Code audits the
existing code first and maps this onto it, rather than replacing what already works.

## How the scope step works

The screen has four levels. Each is a tick box, and ticking a level switches on what sits under it.

| Level | Example | What happens |
|---|---|---|
| Group | 5 Services | Ticking it switches on its sections and their pre-ticked items |
| Section | Mechanical | Only in Groups 2, 4, 5 and 8, to keep long groups readable. Ticking or unticking it switches everything under it |
| Item | Heating and hot water | Pre-ticked or not, depending on project type, building use and level of intervention. The user can untick it |
| Refine | "I know this" | Optional. Quantity (including a partial area in m²) and drop-downs. If left closed, the estimate is used |

What a refurbishment user sees after pressing "Use typical scope" (2,000 m² area of works, level
of intervention = Full systems replacement):

```
[x] 5 Services
    [x] Mechanical
        [x] Heating and hot water   System: Air source heat pump ▾  Scope: Full system ▾   ≈ 2,000 m² (estimated)
        [x] Water and drainage                                                         ≈ 2,000 m² (estimated)
        [x] Ventilation                                                                ≈ 2,000 m² (estimated)
        [ ] Cooling
        [ ] Controls and BMS
    [x] Electrical
        [x] Power                   Scope: Full installation ▾                         ≈ 2,000 m² (estimated)
        [x] Lighting                Scope: Full installation ▾                         ≈ 2,000 m² (estimated)
        [x] Emergency lighting                                                         ≈ 2,000 m² (estimated)
        [ ] Electricity supply upgrade
        [ ] Standby power
    [x] Fire safety
        [x] Fire alarm                                                                 ≈ 2,000 m² (estimated)
        [ ] Sprinklers
        [ ] Smoke ventilation
    [ ] Data and security
    [ ] Lifts
    [ ] Renewables and EV
    [ ] Specialist services
```

- **Knows nothing:** presses the existing "Use typical scope" button (or ticks groups one by one), keeps the defaults, and gets a full m²-based estimate.
- **Knows some things:** opens only those items, e.g. Toilets = 12 standard + 1 accessible, and leaves the rest on the estimate.
- **Partial areas:** entered as real m² in "I know this". There's no separate extent or percentage control, so nothing duplicates Level of intervention.
- **Heating needs no kW.** The user picks System and Scope from two drop-downs. Price = floor area × the rate for that system and scope. "Plant only" covers a boiler or heat pump swap; "Radiators and controls only" matches intervention level 2.
- **Refurbishment and fit-out:** the user picks the level of intervention; the app never picks it. The chosen level decides which items start ticked and their drop-down defaults (column "Pre-ticked at intervention levels"). Options only available from a higher level stay greyed out, as the app does now.
- **Report:** each line is marked Estimated or User quantity, feeding the existing confidence handling.

## How it uses the earlier answers

The scope step adds no new question. It reads these existing answers, plus one area input inside Group 8.

| Existing question | Effect on Scope of works |
|---|---|
| Q1.2 Project type | Which items are shown and ticked ("Shown on" and "Pre-ticked on" codes) and which rate columns are read |
| Q1.3 Building use | Never hides an item. Tagged items are listed first and can start ticked; the rest sit under "More items". Also picks building-use rate rows, falling back to ALL |
| Q1.4 Building age | Pre-2000: Asbestos removal starts ticked on Refurbishment, Fit-out and Demolition only |
| Q1.5 Approximate size (GIFA) | Base for every m² estimate. On Refurbishment and Fit-out it means area of works |
| Q2.1 Objective | Feeds the existing "Suggest scope from my objective" button. No change |
| Level of intervention | Picked by the user, never by the app. Existing: rate band, design duration and greying-out ("Available from intervention level"). Added: which option rows start ticked at each level ("Pre-ticked at intervention levels"). Where the existing code differs, the code wins |
| Q2.4 Specification level | Picks the rate column only. Never changes which items appear |
| Q2.5 Standards and compliance | Comes after scope, so it can't pre-select. It can add risk entries (e.g. DNO, Highways) through the existing handling |
| Number of storeys | Existing question. Used for footprint (GIFA ÷ storeys) and storey conditions. Defaults to 1 only if blank |
| External works area (new) | Asked on the Group 8 header, not as a separate question. Estimated from footprint; must be entered on External works only |

## The workbook is the app's brain

The app takes every scope item, option, rule, list and number from NRM1 Cost Estimate Tool v5.2
at runtime. Editing the workbook changes the app's scope and costs without a code release.

- **Load at runtime,** as v4.5 is today: from GitHub, cached about 10 minutes. No copies of rates, items, lists or percentages in code, and no hard-coded fallback values.
- **Read by name, not position.** Find columns by their header text and Settings tables by their ▶ markers, so rows and columns can be added without breaking anything.
- **Questionnaire lists come from Settings too:** project types (Q1.2), building uses (Q1.3), levels of intervention and specification levels.
- **Check before use.** Load a new version only if the required headers are present, formula cells have values, and every self-check on "1. Instructions" reads 0. Otherwise keep the last good version and warn the admin.
- **Stamp the version.** Every report records the workbook version it was priced with (workbook_info on "3. Settings"). A saved report keeps its numbers; re-running it uses the current workbook.

### How quantities and choices are coded

- **Quantity rule on every item:** a short formula the app runs when the user hasn't entered a quantity, e.g. `ROUND(GIFA / r.m2_per_person / r.persons_per_wc, 0)`. The names (GIFA, STOREYS, FOOTPRINT, EXT_AREA …) and their defaults are in the inputs table on '3. Settings'; `r.name` reads quantity_ratios for the building use, else ALL; `ENTER` means the user must enter it. The full language is on '1. Instructions'. Write a small, safe evaluator for it; never use `eval()`.
- **Options: pick:** One = a drop-down; Several = the user can tick more than one option, each with its own quantity (toilets, lifts, standby power).
- **Other conditions** use the same names, e.g. `PT=NB & USE=RES STU & STOREYS>=4 → tick`.
- **Rate column** = the project_types row for the project type, read at the chosen specification level (Basic, Standard or High column).

| Changes live, no code needed | Needs a code change |
|---|---|
| Rates and factors; price sources; new options and building-use rates; new items; quantity rules and ratios; Shown on / Pre-ticked on lists; conditions using existing names; BCIS mapping; percentages, location factors, benchmarks; new project types or building uses added to their Settings tables | A new column; a new pricing type; a new input name or function in quantity rules; a new kind of 'When selected' effect; renamed ▶ markers or column headers |

## Build rules for Claude Code

- **Audit first.** Check how the existing code handles scope items, Level of intervention, BCIS codes, rates, programme, saved projects and reports before changing anything. The v5.2 workbook is target data to map onto that code, not a replacement for it. The app reads v4.5 by sheet name today, so publish v5.2 only together with the code change.
- **Fix the numbering.** The screen shows Level of intervention (labelled Q2.3) above Scope of works (labelled Q2.2). Relabel them Q2.2 Level of intervention and Q2.3 Scope of works, so the numbers follow the page order. Change the labels only; keep the internal field keys, so saved projects and reports still load.
- **Read the workbook, don't copy it.** Three sheets: "2. Scope and Rates" (one row per priced line: Item rows hold the item's details and rules, Option rows below add other options or building-use rates) and "3. Settings" (tables found by their ▶ markers). No rates, rules or lists in code.
- **Rate key** (e.g. S-0039-02) is the permanent ID of an option; **Scope ID** (e.g. S-0039) of an item. Save the rate key with the user's choice. Never reuse either. If the code already has permanent IDs, map to them. "Replaces old codes" lists the v4.5 codes each item covers.
- **Visibility is separate from default selection.** "Shown on" and "Pre-ticked on" hold project-type codes (NB, EX, RF, FO, EW, DM, OM); "Relevant building uses" and "Rate building use" hold building-use codes (RES, STU, OFF, EDU, HEA, RET, IND, HOS, MIX, OTH, ALL). All codes are defined on "3. Settings". A new project type or building use is a new code, not a new column. Reject any code that isn't defined in Settings.
- **Rule order:** project type, then level of intervention (Refurbishment and Fit-out), then building use, building age and storeys ("Other conditions"), then dependencies ("When selected") when the user makes a choice.
- **Four screen levels:** group, section, item, refine. Sections exist only where the Section column has a name.
- **Nothing starts ticked.** The existing "Use typical scope" button ticks every item that should start ticked and applies its default option; ticking one group does the same for that group. Unticking a group or section unticks everything under it.
- **The user picks the level of intervention.** The app keeps greying out options whose "Available from intervention level" is above the chosen level, as now, and ticks the option rows that list the chosen level in "Pre-ticked at intervention levels".
- **Every ticked item shows its quantity and source,** e.g. '≈ 14 toilets (estimated)', worked out from its Quantity rule. 'I know this' takes the real quantity (including a partial m²) and the drop-downs. 'Use estimate' puts it back.
- **Drop-downs pick the option row,** so they change the rate, never the quantity. Heating is priced per m² by System and Scope; never ask for kW. Heating's System and Scope drop-downs show on the item line itself, so the user sees and picks the system without opening 'I know this'.
- **Rate row choice:** the chosen option and building use, falling back to the ALL row. Line = rate × quantity × location factor × band multiplier (last two only where "Apply band + location factor" = Yes). No extent or intervention percentage on top.
- **Items whose Quantity rule gives ENTER** aren't priced until the user gives a quantity.
- **BCIS mapping** is one or two elements per item with a share each, so the report can still total by BCIS group.
- **"When selected" effects** of type risk, assumption or confidence feed the existing handling. "Suggest scope from my objective" and "Other / specialist scope" stay as they are, using the same IDs.
- **One home per cost:** piling in Foundations; basement tanking in Basement; wet-area tanking in wall and floor finishes; balconies in Upper floors; roof access in Roof; toilet pipework in Water and drainage and tiling in Group 3; grease trap in Catering kitchen; fume extract ductwork in Fume extraction; making good inside refurbishment rates; builder's work an automatic line whenever a Group 5 item is ticked; modular is the Group 2 construction-method option.
- **Loose furniture** is part of the construction total (BCIS 4.1). **Biodiversity net gain** (BCIS 12) prints below the construction total.

## Scope structure

82 items in 8 groups, plus one automatic line (builder's work). The workbook holds the detail on
one sheet: each item, its options and prices by building use, where every price came from, how
its quantity is estimated, when it shows and is ticked, what it triggers, its BCIS elements and
the old codes it replaces. The table below is the shape of the screen.

| Group | Section | Items |
|---|---|---|
| 0 Facilitating works | — | Asbestos removal, Demolition of existing building, Strip-out, Contaminated land, Ground improvement, Tree removal, Service diversions |
| 1 Substructure | — | Foundations, Ground floor slab, Basement |
| 2 Superstructure and envelope | Structure | Frame, Upper floors, Stairs and ramps, Mezzanine floor |
| | Roof and walls | Roof, External walls, Windows and external doors |
| | Internal walls and doors | Internal walls, Internal doors, Fire stopping |
| 3 Internal finishes | — | Wall finishes, Floor finishes, Ceiling finishes |
| 4 Toilets, kitchens and fittings | Toilets, bathrooms and kitchens | Toilets, Bathrooms and en-suites, Showers, Kitchens |
| | Fittings and furniture | Fixed joinery, Signage, AV equipment, Loose furniture |
| | Specialist equipment | Catering kitchen, Laboratory, Clinical, Retail, Warehouse, Sports, Cleanroom |
| 5 Services | Mechanical | Heating and hot water, Water and drainage, Ventilation, Cooling, Controls and BMS |
| | Electrical | Electricity supply upgrade, Power, Lighting, Emergency lighting, Standby power |
| | Fire safety | Fire alarm, Sprinklers, Smoke ventilation |
| | Data and security | Data and IT, Security |
| | Lifts | Lifts |
| | Renewables and EV | Solar PV, Battery storage, EV charging |
| | Specialist services | Compressed air, Fume extraction, Process drainage, Medical gases, Nurse call, Server room cooling |
| 7 Work to existing buildings | — | Repairs, Alterations, Damp treatment |
| 8 External works | Site, access and drainage | Site clearance and preparation, Surface water drainage, Foul drainage, External utilities, Highways and site access, Retaining walls and earthworks |
| | Paving and landscaping | Roads, paths and paving, Car parking, HGV yard, Soft landscaping, Roof terrace and green roof, Biodiversity net gain |
| | Boundaries and fixtures | Fences, gates and walls, External lighting, Cycle storage, Bin store |

Group 2 also has a construction-method option on its header (Traditional / Modular). Group 6
isn't shown: its items moved into Groups 2 and 4.

## Test scenarios

Claude Code should run these seven before handing back. Each one fails on the current question
map. (All seven are automated in `lib/__tests__/scopeScenarios.test.js`.)

| Scenario | Answers | Must see |
|---|---|---|
| Toilet refurbishment | RF · Education · 1900–1979 · 60 m² · Intervention 4 | "Use typical scope" ticks asbestos, strip-out, internal walls and doors, finishes and full M&E. Toilets listed first; refined to 12 standard + 1 accessible. Every m² item prices on 60 m² |
| Decoration only | RF · Education · Post-2000 · 800 m² · Intervention 1 | Only strip-out and finishes ticked. Group 5 items greyed out, as now. Asbestos not ticked |
| New-build teaching block | NB · Education · 4,000 m² · 3 storeys | "Use typical scope" ticks all core groups; level of intervention not used. Footprint 1,333 m². Toilets estimated; Lifts show 1. Heating defaults to air source heat pump, Full system, with no kW asked |
| Boiler to heat pump swap | RF · Education · 3,000 m² · Intervention 3 | User keeps Heating, sets System = Air source heat pump and Scope = Plant only, and unticks the rest. DNO capacity and radiator sizing entries appear in the existing risk handling |
| Car-park EV scheme | EW · 2,500 m² external area | Solar PV, supply upgrade and EV charging reachable. No floor area needed. DNO entry appears |
| Flats refurbishment | RF · Residential · 3,000 m² · 4 storeys · Intervention 2 | Power = Second fix only, Lighting = Replace fittings only, Heating = Radiators and controls only. Bathrooms estimated from floor area, then refined to 50 |
| Demolition only | DM · 1980–1999 · 1,500 m² | Ticking Group 0 ticks Demolition (1,500 m²) and Asbestos. Site clearance and fences reachable |

## Decisions (confirmed 23 September 2026)

Confirmed by Nabil. Claude Code builds to these.

1. **Numbering:** agreed. Relabel Level of intervention as Q2.2 and Scope of works as Q2.3; labels only, internal keys unchanged.
2. **Intervention defaults:** agreed as set in the workbook. Level of intervention is asked on Refurbishment and Fit-out.
3. **Heating system:** the user chooses. The System and Scope drop-downs sit on the Heating line, always visible. The starting value (like-for-like gas boiler at levels 3–4) only keeps the estimate working until the user picks.
4. **Number of storeys:** already asked in the app. Use that answer; default to 1 only if it is blank.
5. **Pre-selection:** agreed. Only through 'Use typical scope' and group ticks; nothing is ticked on first load.
6. **Heating on new build:** agreed. Starts on air source heat pump, Full system.
7. **Loose furniture:** above the line, included in the construction total (BCIS 4.1). Biodiversity net gain stays below the line.
8. **Prices and ratios:** deferred. Rates and ratios marked 'AI estimate – verify' are checked once the app is running, against real project examples. Until then the report flags those lines.
