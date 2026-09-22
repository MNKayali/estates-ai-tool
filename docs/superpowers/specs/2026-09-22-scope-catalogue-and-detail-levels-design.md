# Scope catalogue and detail levels — design

**Date:** 22 September 2026
**Status:** awaiting user review
**Extends:** the questionnaire remap (PRs #7, #9, #10, #11)

---

## 1. The problem

Q2.2 offers up to 98 tiles. That was the original complaint. Two rounds of
investigation since have shown the tile count is a symptom, not the disease:

1. **The catalogue has gaps.** Sixteen elements that a UK Stage 0–1 feasibility
   should be able to price have no row at all — including fire stopping,
   biodiversity net gain, tree removal and service diversions. Three of those
   are things the questionnaire already asks about in Section 3.
2. **Some tiles mean the same thing as other tiles.** `7.4 M&E overhaul`
   overlaps all 33 rows of group 5. Tick both and services are priced twice,
   silently.
3. **Every tile is presented as equally important, and they are not.** Four
   elements are 60% of a new build. Thirteen of the twenty-two in the new-build
   preset are individually too small to move the answer outside its own stated
   range.
4. **Nothing records how much the user actually knew.** `computeConfidence()`
   counts six deficiencies; not one of them looks at scope. A user who ticked
   four tiles and a user who ticked forty get the same grade.

Point 4 is what produced the report that started this: a 95 m² coffee shop
priced from eight lines at £189/m², graded **A — High Confidence**.

## 2. The evidence

Ranking each element in the existing "typical scope" presets by its share of
that preset's total £/m². Rates read from NRM1 v4.5 Tab 2 on 22 Sep 2026.

**New build — 22 elements, £1,989/m²**

| Rank | Element | Share | Cumulative |
|---|---|---|---|
| 1 | 2.5 External walls & facade | 22.6% | 23% |
| 2 | 2.1 Structural frame | 17.6% | 40% |
| 3 | 2.6 Windows & external doors | 12.6% | 53% |
| 4 | 2.3 Roof structure & covering | 7.5% | **60%** |
| 5–9 | slab, foundations, partitions, internal doors, upper floors | 20% | **81%** |
| 10–22 | all finishes and all M&E | 19% | 100% |

**Refurbishment — 15 elements, £630/m².** Flat: nothing above 12.7%, eight
elements to reach 76%.

**The operative rule.** The report quotes a range of roughly ±11% at the legacy
width. An element worth less than ~5% of the total therefore *cannot* move the
answer outside its own stated range. Asking about it individually buys nothing.

- New build: **13 of 22 tiles fail that test.**
- Refurbishment: **5 of 15 fail it.**

So the correct granularity is not one setting. New build can be simplified
radically; refurbishment and fit-out cannot.

**A second finding worth recording.** Q2.4 spec level already carries more
leverage than most scope tiles — the Basic→High spread is 10× on `4.1`, 4.5× on
`5.3`, 4.4× on `3.2`, 3.7× on `2.5`. Accuracy is cheaper to buy through spec
level than through scope granularity.

## 3. The design

### 3.1 Three declaration levels

The user chooses, per group, how much they know. They are not penalised for
knowing less; they are told honestly what it costs in certainty.

| Level | The user says | What they tick |
|---|---|---|
| 1 | "I don't know the detail" | One **package tile**, priced £/m² |
| 2 | "I know roughly what's involved" | Individual element tiles (today's behaviour) |
| 3 | "I know specifics" | Elements plus quantities where a row captures one |

### 3.2 Package tiles

Three new workbook rows, each a whole-group £/m²:

| Code | Element | Replaces, when ticked |
|---|---|---|
| `2.0` | Building fabric — complete package | all of group 2 |
| `5.0` | Building services (M&E) — complete package | all of group 5, **and `7.4`** |
| `8.0` | External works — complete package | all of group 8 |

**Mutual exclusivity is enforced by the picker**, using the mechanism that
already exists for `5.8 / 5.8a / 5.8b` (`toggleWiring`) and `5.1 / 5.1b`
(`togglePlumbing`):

- Ticking a package tile unticks and disables every detail tile in its group.
- Ticking any detail tile unticks the package tile.
- The two states can never both be selected, so a package can never double-count
  against its own details.

Folding `7.4` into `5.0`'s exclusivity set also closes the existing
`7.4`-versus-group-5 double-count, which is a live defect today.

### 3.3 Detail level per project type

Which groups offer a package tile — and which default to it — is driven by the
concentration data in §2. A group whose share of the estimate is small can be
packaged with no meaningful accuracy loss; a group that dominates cannot.

| | Fabric (2) | M&E (5) | Externals (8) |
|---|---|---|---|
| **New build** | Detailed | **Package** | **Package** |
| **Extension** | Detailed | **Package** | **Package** |
| **Refurbishment** | Detailed | Detailed | **Package** |
| **Fit-out** | n/a | Detailed | n/a |
| **External works only** | n/a | n/a | Detailed |
| **Demolition only** | n/a | n/a | n/a |
| **Other or mixed** | Detailed | Detailed | Detailed |

**Group 3 (finishes) gets no package tile.** It holds three elements — wall,
floor and ceiling — so packaging them would replace three ticks with one and
save nothing, while costing the user the ability to say "floors only". Group 4
(fittings) likewise stays detailed: its rows are sector-specific and largely
independent of one another, so a single blended rate would be meaningless across
a laboratory, a retail unit and a coffee shop.

"Package" means the package tile is shown first and the detail tiles are folded
behind the standard disclosure. **It never means the details are unreachable.**

A new build drops from ~98 tiles to roughly a dozen visible, with no loss of
accuracy that the report's own range can detect.

### 3.4 Confidence reads the declaration level

`computeConfidence()` in `lib/prose.js` gains a seventh deficiency:

> **A package tile costs one deficiency when the package lines together exceed
> 20% of the works subtotal.**

Computed from the priced result, not from a static table, so it self-adjusts:

- M&E package on a new build → ~8% of the estimate → **no deficiency.**
- The same package on a fit-out → most of the estimate → **one deficiency.**

`lib/costCalculator.js` returns a new `packagedShare` (package-tile line totals
÷ works subtotal) for this purpose. Reason string:
`"scope declared at package level for N% of the estimate"`.

**On the 20% threshold living in code rather than the workbook:** the
no-numbers-in-code rule governs *money*. `computeConfidence()` already holds its
grading thresholds in code (`deficiencies === 0 ? 'A' : …`), and this is a
grading threshold of the same kind. It is a named exported constant so a future
move to the workbook is a one-line change.

### 3.5 Building use stops hiding things

Today four gates decide whether a tile renders, and three of them **delete**
silently:

| Gate | Input | Today | After |
|---|---|---|---|
| 1 | Q1.2 project type → `VISIBLE_GROUPS` | Deletes whole groups | **Replaced by the relevance sheet cell** |
| 2 | Q1.2 → `priceableFor` (no rate) | Deletes | Unchanged — a workbook fact |
| 3 | Q1.3 building use tag | **Deletes** | **Demotes Core → Optional. Never deletes.** |
| 4 | Q2.3 intervention level vs `Min Lvl` | Greys out, stays visible | Unchanged — already the honest behaviour |

Gate 3 deleting is what removed `4.12 Bar counter and back bar` from a
university coffee shop: the row is tagged `Hospitality`, the building was
`Education`, and the single most café-defining element was unreachable with no
indication it existed.

**After this change an element is in exactly one of three states, and two of
them are reachable:**

- **Core** — rendered immediately.
- **Optional** — behind one consistent `Show N more` per group, always the same
  wording and position. No hard-coded exceptions (the current group-4
  "Sector-Specific Equipment" fold is replaced by the standard one).
- **N/A** — not rendered, and no second rule can bring it back.

**Core is not pre-ticked.** Nothing enters the priced scope except by the user
ticking it. "Use typical scope" remains the only bulk action, and it stays a
deliberate, visible, reversible choice.

## 4. Workbook changes (NRM1 v4.5 → v4.7)

Cell-by-cell, to be applied by the user in Excel. Nothing here rewrites the
file. Every parser tolerates absence, so the app keeps working at each step.

Tab 2 `2. Master Cost Table` column layout, for reference:

`A Code · B NRM1 Ref · C Grp · D Building Use · E Element/Description · F Unit ·
G Pricing Type · H Min Lvl · I Quantity to capture · J Rfb Basic · K Rfb Std ·
L Rfb High · M NB Std · N NB High · O Ext Std · P Ext High · Q Ext Works ·
R BCIS · S Notes/source · T Source · U Help text (new)`

### 4.1 New column U — "Help text"

Add the header `Help text` in **U4**. Optional; when blank the picker shows no
sub-line. This is where the technical wording goes once column E becomes plain
English (§4.4).

### 4.2 Sixteen new element rows

Rates are **deliberately left blank** — the user sets them later. A row with no
rate in the applicable family is simply not offered (`priceableFor`), so blank
rates are safe: the row is inert until priced.

**Group 0 — facilitating works** (insert after `0.5`)

| A Code | C | D Building Use | E Element | F Unit | G Pricing Type | H Min Lvl | I Quantity to capture | R BCIS |
|---|---|---|---|---|---|---|---|---|
| `0.6` | 0 | All | Tree removal and arboricultural works | Nr | `per_nr` | 1 | Number of trees | Yes |
| `0.7` | 0 | All | Diversion of existing underground services | Item | `per_item` | 1 | — | Yes |
| `0.8` | 0 | All | Invasive species treatment (Japanese knotweed) | Item | `per_item` | 1 | — | Yes |
| `0.9` | 0 | All | Archaeological investigation | m² | `gifa_rate` | 1 | GIFA (automatic, m²) | Yes |
| `0.10` | 0 | All | Temporary works and propping | m² | `gifa_rate` | 2 | GIFA (automatic, m²) | Yes |

**Group 1 — substructure** (insert after `1.4`)

| A | C | D | E | F | G | H | I | R |
|---|---|---|---|---|---|---|---|---|
| `1.5` | 1 | All | Underpinning to existing foundations | m² | `gifa_rate` | 4 | GIFA (automatic, m²) | Yes |

**Group 2 — superstructure** (insert after `2.9`)

| A | C | D | E | F | G | H | I | R |
|---|---|---|---|---|---|---|---|---|
| `2.10` | 2 | All | Balconies and external stairs | Nr | `per_nr` | 4 | Number of balconies or stairs | Yes |

**Group 5 — fire, life safety and services** (use the free numbers 5.17, 5.22,
5.28, then 5.31–5.32)

| A | C | D | E | F | G | H | I | R |
|---|---|---|---|---|---|---|---|---|
| `5.17` | 5 | All | Fire stopping and compartmentation | m² | `gifa_rate` | **1** | GIFA (automatic, m²) | Yes |
| `5.22` | 5 | All | Dry and wet risers | Nr | `per_nr` | 3 | Number of risers | Yes |
| `5.28` | 5 | All | Smoke ventilation and automatic opening vents | Nr | `per_nr` | 3 | Number of vents | Yes |
| `5.31` | 5 | All | Lightning protection | Item | `per_item` | 3 | — | Yes |
| `5.32` | 5 | Non-Residential | Water hygiene and legionella remedial works | m² | `gifa_rate` | 1 | GIFA (automatic, m²) | Yes |

`5.17` is **Min Lvl 1 deliberately**: fire stopping is never optional on a real
job, at any level of intervention.

**Group 7 — work to existing** (insert after `7.5`)

| A | C | D | E | F | G | H | I | R |
|---|---|---|---|---|---|---|---|---|
| `7.6` | 7 | All | External wall system remediation (cladding) | m² | `gifa_rate` | 1 | GIFA (automatic, m²) | Yes |
| `7.7` | 7 | Non-Residential | Fire door replacement programme | Nr | `per_nr` | 1 | Number of doors | Yes |

**Group 8 — external works** (insert after `8.13`)

| A | C | D | E | F | G | H | I | R |
|---|---|---|---|---|---|---|---|---|
| `8.14` | 8 | All | Biodiversity net gain and habitat creation | m² | `gifa_rate` | 1 | Site area (automatic, m²) | Yes |
| `8.15` | 8 | All | Retaining walls and external structures | Item | `per_item` | 1 | — | Yes |

`8.14` is mandatory in England for most planning applications since February
2024 and currently has no row anywhere in the catalogue.

### 4.3 Three new package rows

Insert each as the **first row of its group**, above the existing detail rows.

| A | C | D | E | F | G | H | I | R |
|---|---|---|---|---|---|---|---|---|
| `2.0` | 2 | All | Building fabric — complete package | m² | `gifa_rate` | 1 | GIFA (automatic, m²) | Yes |
| `5.0` | 5 | All | Building services (M&E) — complete package | m² | `gifa_rate` | 1 | GIFA (automatic, m²) | Yes |
| `8.0` | 8 | All | External works — complete package | m² | `gifa_rate` | 1 | Site area (automatic, m²) | Yes |

Each package rate should be set to approximately the sum of that group's typical
detail rates for the project type — the point is that a package is *equivalent*
to its details, not cheaper or dearer. Setting these is the user's judgement and
is not attempted here.

### 4.4 Plain-English descriptions

Replace column **E** with the plain label; move the technical wording to the new
column **U**. Codes never change, so nothing in the app or in a stored report
breaks.

| Code | E — new plain label | U — help text |
|---|---|---|
| `0.1` | Asbestos and hazardous material removal | Asbestos; increase if confirmed present |
| `0.5` | Strip out existing finishes and fittings | Soft strip |
| `1.2` | Piled foundations | Specialist piled solution |
| `1.3` | Ground floor slab | Lowest floor construction |
| `2.9` | Waterproofing to basements and below ground | Tanking and waterproof membranes |
| `4.1` | Built-in joinery and fittings | General fittings, fixtures and built-in joinery |
| `4.4` | Specialist equipment | Laboratory, AV or medical equipment |
| `4.31-NR` | Toilet cubicles | Solid grade laminate or solid surface partitions |
| `4.32-HOH` | Washroom vanity units and mirrors | Vanity counter, basin surround and mirror wall, per run |
| `5.1b` | Plumbing and heating — final connections only | Mechanical second fix |
| `5.2` | Heating and hot water | LTHW distribution or heat pump |
| `5.2L` | Boiler replacement — like for like | No new pipework or distribution |
| `5.7` | Main electrical supply and distribution | Incoming supply, main switchgear |
| `5.7a` | Power distribution around the building | Sub-DBs, cable tray, trunking, busbar |
| `5.8a` | Electrical rewiring — cables only | New circuit cables; existing sockets and luminaires retained |
| `5.8b` | Electrical — new sockets and switches only | Replacement sockets, switches, FCUs; existing wiring reused |
| `5.8c` | New lighting and controls | Luminaires, layout, controls, occupancy sensors |
| `5.9a` | Fire alarm system | Detection, call points, sounders, visual alarms, panel (L1–L3) |
| `5.9b` | Emergency lighting | Maintained and non-maintained luminaires, central test system |
| `5.13` | Electricity supply upgrade | Grid connection / DNO reinforcement |
| `5.14` | Building energy management system | BEMS controls and head end |
| `5.16` | Data cabling and IT infrastructure | Cat6A structured cabling, comms room |
| `5.20` | Cutting and making good for services | Builder's work in connection (BWIC) |
| `5.24` | Process ventilation and fume extraction | Industrial LEV |
| `5.25` | Standby generator | Generator and automatic transfer switch |
| `5.26` | Uninterruptible power supply | UPS and battery |
| `5.29` | Precision cooling for server or plant rooms | CRAC and CRAH units |
| `5.30-NR` | Hand dryers | Recessed or surface-mounted commercial units |
| `6.2` | Mezzanine floor | Pre-engineered mezzanine system |
| `7.5` | Making good after building works | Making good after structural alterations |

### 4.5 Group 7 wording — repair versus replace

Group 7 currently overlaps groups 2 and 5 with no guidance. Make the choice
explicit in the text, so the user can see it is one or the other:

| Code | E — new label | U — help text |
|---|---|---|
| `7.1` | Structural repairs — repair, not replacement | Choose this **or** the group 2 structural elements, never both |
| `7.2` | Fabric repairs — repair, not replacement | Choose this **or** external walls, roof and windows, never both |
| `7.4` | M&E overhaul — repair, not replacement | Choose this **or** individual services, never both. Mutually exclusive with `5.0` and group 5 in the picker. |

### 4.6 Split three rows by pricing basis

Where the building *is* the use, equipment scales with floor area and must be
`gifa_rate` — which also picks up the BCIS location factor and the Q2.3 band
multiplier, neither of which `per_item` receives. Where the facility is a room
inside a larger building, a count or lump remains correct.

Replace each of `4.10`, `4.11`, `4.12` with two rows:

| Old | New code | D Building Use | G Pricing Type |
|---|---|---|---|
| `4.10` | `4.10-HOSP` | Hospitality, Retail | `gifa_rate` |
| | `4.10-INST` | Education, Healthcare | `per_item` |
| `4.11` | `4.11-HOSP` | Hospitality, Retail | `gifa_rate` |
| | `4.11-INST` | Education, Healthcare | `per_item` |
| `4.12` | `4.12-HOSP` | Hospitality, Retail | `gifa_rate` |
| | `4.12-INST` | Education, Office, Commercial | `per_item` |

Note `4.12-INST` is tagged for Education and Office: a servery or coffee bar
inside a university or office building is common, and the current
`Hospitality`-only tag is what made the element unreachable.

This follows the pattern already established by `4.2-COM / 4.2-HC / 4.2-HG /
4.2-HP / 4.2-RES`.

### 4.7 Min Lvl corrections

| Code | Element | H today | H should be |
|---|---|---|---|
| `1.2` | Piled foundations | **1** | 4 |
| `1.4` | Basement excavation & structure | **1** | 4 |
| `4.13` | Pallet racking and storage systems | **1** | 2 |
| `4.15` | Roller shutter and sectional doors | **1** | 2 |

Piled foundations and a basement are currently selectable at *"Fabric and
finishes only"* while a strip footing requires *"Reconfiguration or full
redesign"*. This is consistent with blank cells defaulting to 1 — worth
confirming against the source rather than assuming.

### 4.8 The £0 preset entries

`5.8a` and `5.8b` are in the New Build "typical scope" preset but carry **£0 in
columns M and N** — they are refurbishment-only splits of `5.8`. Two ticks on
every new build that contribute nothing.

Fix in code, not the workbook: remove `5.8a` and `5.8b` from `NEW_BUILD_SCOPE`
in `app/questionnaire/page.jsx` and add `5.8`.

## 5. Code changes

### 5.1 `lib/costCalculator.js`
- Recognise package codes (`2.0`, `5.0`, `8.0`) and return `packagedShare` —
  package line totals ÷ works subtotal.

### 5.2 `lib/prose.js`
- `computeConfidence()` gains the seventh deficiency (§3.4), reading
  `cost.packagedShare` against an exported `PACKAGE_CONFIDENCE_THRESHOLD = 0.20`.

### 5.3 `lib/scopeDetail.js` (new)
- The per-project-type detail table from §3.3, as one exported map, plus
  `packageCodeFor(group)` and `detailLevelFor(projectType, group)`.
- Pure JS, no React and no node-only imports — same constraint as
  `lib/projectTypes.js` and `lib/buildingUse.js`, because the questionnaire and
  `app/api/suggest-scope/route.js` both import it.

### 5.4 `app/questionnaire/page.jsx`
- Package tile rendering, one per group that has a package row.
- Mutual exclusivity: package ↔ its group's details, and `5.0` ↔ `7.4`.
- Building use demotes Core → Optional instead of filtering the item out.
- One consistent `Show N more` disclosure per group; the hard-coded group-4
  "Sector-Specific Equipment" fold is removed in favour of it.
- `NEW_BUILD_SCOPE`: drop `5.8a`/`5.8b`, add `5.8`.

### 5.5 `app/api/suggest-scope/route.js`
- `LEVEL_TIER` and the folded-code set are currently **hand-duplicated** between
  this route and the questionnaire, and have disagreed before. Move both into
  `lib/scopeDetail.js` while it is being created, and import from there in both
  places.

### 5.6 `scripts/build-scope-relevance-sheet.mjs`
- New editable column: **Building use (override)**, pre-filled from the workbook
  tag, blank meaning "keep the workbook value".
- New read-only column: **Package tile?** so the user can see which rows are
  packages and which are details.
- **Merge mode.** Re-running the script must read the existing filled sheet and
  carry every answered cell forward, so the user can start filling today against
  the current 112 rows and not lose that work when the new rows land. Rows
  present in the old sheet but absent from the workbook are dropped with a
  printed warning.

### 5.7 Tests
- Vitest for `packagedShare`, the confidence deficiency at the threshold
  boundary, and `detailLevelFor` across all seven project types.
- **One jsdom test parametrised over the seven project types**, asserting that
  every key returned by `unansweredRequired()` has a DOM control and that every
  collapsed disclosure reveals content. This closes the gap that let several
  defects through the last three slices: `scripts/baseline.mjs` builds answer
  objects in code and never renders the form, so no visibility change can move a
  baseline figure. One defect survived build, lint and 164 passing tests.

## 6. Sequencing

The relevance sheet reads the workbook, so the new rows must exist before the
sheet can carry them. Merge mode (§5.6) is what stops that blocking the user.

1. User fills the **existing** 112 rows in `docs/scope-relevance-TO-FILL.xlsx`,
   starting with New Build, Refurbishment and Fit-out. **Can start immediately.**
2. User applies the workbook changes in §4.
3. Regenerate the sheet in merge mode — step 1's answers carry forward; the new
   element rows and the three package rows arrive pre-filled with a suggestion.
4. User fills the new rows only.
5. Code changes in §5, gated on `npm run build`, `npm test`, a
   `scripts/baseline.mjs` diff showing no unintended movement, and browser
   verification across all seven project types.

## 7. Not in this slice

| Item | Why |
|---|---|
| Rates for the new rows | The user sets rates; blank rates are inert |
| Package rates | Same — and they need judgement about equivalence |
| Adding a `Fit-out \| Education` band to Tab 8 | Separate defect from the report review |
| The sense check failing silently when no benchmark band matches | Same defect. Logged as a `console.log`; should warn and block Grade A. **This is the more urgent of the two.** |
| Sections 4 and 5 review, ROI rework | Queued behind this |
| Print/screenshot CSS | The user reserved a separate session |
| Spec level as a relevance axis | Q2.4 picks a rate column, not whether an element applies |

## 8. Open questions for the user

1. **Are there estate works missing that only you would know?** The new rows
   come from UK regulation and from what the questionnaire already asks.
   Recurring programmes specific to your estate — lift replacement cycles, roof
   programmes, window replacement rounds — may deserve their own rows.
2. **Package rates: equivalent, or deliberately cautious?** Setting a package
   slightly above the sum of its details would make "I don't know" cost a little
   more than knowing, which is arguably honest. Setting it equal is simpler.
3. **Is 20% the right threshold** for a package tile to cost a confidence grade?
