# Slice 2 — ask each project type only the questions that apply

*21 September 2026 · design for approval*

## What this is

Today three questions in the whole form react to Q1.2. Everything else is asked
of everyone, which is why a New Build is asked about asbestos and previous works
on a building that does not exist, and why External works only is asked how old
the building is.

This slice makes Section 3 type-aware, moves the Building Safety Act question to
where it belongs, and fixes three questions asked outside Section 3 that cannot
apply. It changes **no rate, no duration and no percentage** — with one
exception found in the fix-wave review, see §9.

Decided live with the user on 21 September 2026, type by type.

## The constraint that shapes everything here

The NRM1 Tab 3 percentage rules match **answer option text literally**. Twenty-three
rules quote a Section 3 answer:

```
E   Q3.1 = Asbestos known or suspected
E   Q3.1 = Contaminated land
A   Q3.6 = Fully occupied throughout
A   Q3.5 includes Restricted working hours
D   Q3.4 = Full planning (3–4%, use 3.5%)
…
```

So, without exception:

| Change | Effect |
|---|---|
| **Removing** an option from a type's list | **Safe.** The rule simply never fires for that type. |
| **Adding** a new option | **Captured, but changes no number** until a Tab 3 row is added for it. |
| **Renaming** an existing option | **Breaks the rule that quotes it.** Never do this. |

Every new option below is therefore narrative-only on delivery, and goes on the
workbook list for the laptop session. Every re-wording below changes a **question
label or help text**, never a stored option value.

## 1. Q3.1 — retitled "Known issues", options per type

Drop "building" from the title everywhere; vary the options.

| Type | Options |
|---|---|
| **New Build** | Contaminated land · *Made ground or fill* · *High water table* · *Existing structures on site to demolish* · *Underground services or obstructions* · *Trees or hedgerow on site* · Unsure — surveys needed · None identified |
| **Refurbishment** | All nine current options, unchanged |
| **Fit-out** | All current options **except Contaminated land** — that is the landlord's, not the fit-out's. A fit-out often sits in an old building, so damp, structural and drainage stay |
| **Extension** | The widest list of any type: every existing-building option **and** every site/ground option above. An extension carries both sets of risk |
| **External works only** | Contaminated land · *Made ground or fill* · *High water table* · *Underground services or obstructions* · *Existing hardstanding to break out* · *Trees or hedgerow on site* · Unsure — surveys needed · None identified |
| **Demolition only** | Asbestos known or suspected · Structural concerns · Contaminated land · *Structures attached to neighbouring buildings* · Unsure — surveys needed · None identified |
| **Other or mixed** | Everything — it is the catch-all |

*Italicised options are new* and carry no Tab 3 rule yet.

## 2. Q3.2 — previous works

| Shown | Hidden |
|---|---|
| Refurbishment, Fit-out, Extension, Demolition only, Other or mixed | **New Build, External works only** |

Safe to hide: only the AI narrative reads this answer, so hiding it moves no
number. On Demolition only it stays because past structural alterations change
the demolition method.

## 3. Q3.3 — surveys, per type, gated on building age

| Type | Options |
|---|---|
| **New Build** | Topographical · Ground investigation · Contamination (Phase 1 / Phase 2) · *Ecological appraisal* · *Biodiversity Net Gain assessment* · *Arboricultural (BS5837)* · *Flood risk assessment* · *Archaeological assessment* · *Utilities / statutory services search* |
| **Refurbishment** | Current list, but **split the asbestos option** — see below |
| **Fit-out** | Asbestos survey (per the split) · Condition · Fire risk assessment |
| **Extension** | Both sets — the existing-building surveys and the new-build site surveys |
| **External works only** | Topographical · Ground investigation · Contamination · *Ecological appraisal* · *Biodiversity Net Gain assessment* · *Arboricultural (BS5837)* · *Utilities / statutory services search* · *Drainage / percolation testing* |
| **Demolition only** | *Refurbishment & demolition asbestos survey* · Structural · *Bat / ecology survey* |
| **Other or mixed** | Everything |

**Split the asbestos option.** Today there is one, "Asbestos register", covering
two different things. A **management survey** records what a building holds day
to day. A **refurbishment & demolition survey** is intrusive and is what the law
requires before refurbishment or demolition work starts. Only the second lets
you price with confidence, so they must be separable.

**Gate both on Q1.4 building age**, everywhere an existing building is involved
(Refurbishment, Fit-out, Extension, Demolition only):

- **Post-2000** → hide the asbestos options entirely. Asbestos was fully banned
  in the UK in 1999; offering the option invites a survey cost for nothing.
- **Pre-2000** → the refurbishment & demolition survey is the expected answer,
  and leaving surveys blank should carry the existing risk uplift rather than
  passing quietly.

The building-age bands already exist for this reason — their own comment says the
1980 and 2000 boundaries are what decide whether an asbestos survey is listed. It
simply was never wired to Q3.3.

## 4. Q3.4, Q3.5, Q3.7 — unchanged everywhere

Planning consent, access constraints and additional context apply to every
project type as written. No change.

## 5. Q3.6 — occupation, re-worded per type

**The stored option values do not change** — `Fully occupied`, `Partially
occupied`, `Vacant or decanted` stay exactly as they are, because four Tab 3
rules quote them. Only the question label and help text vary:

| Type | What the question asks about |
|---|---|
| New Build | The surrounding site or campus, which is usually live |
| Refurbishment, Fit-out | The building itself — unchanged |
| Extension | The existing building, which stays in use while the extension goes up alongside |
| External works only | The site — a car park resurfaced in sections is the normal case, and it prices |
| Demolition only | Adjacent buildings and whether the surrounding site is operational. The building being demolished is empty by definition |
| Other or mixed | Unchanged |

## 6. Q3.8 — site context loses an option

Drop **"higher-risk building"** from the multi-select entirely. It becomes
derived — see §7. Conservation area, party wall and ecological features stay,
for every type.

## 7. The Building Safety Act moves to Section 1

Higher-risk status is not a constraint sitting alongside "conservation area" —
it is a different regulatory regime that adds a construction gateway. Asking it
in Section 3 is also too late: by then the user has chosen their whole scope and
specification under the assumption of a normal approval route.

It is also derivable from answers Section 1 already collects. The one thing the
app cannot infer is **height** — the statute is 18 metres *or* 7 storeys,
whichever comes first, and a six-storey hospital or laboratory clears 18m easily.

**New question, shown only when Q1.2a is 5 or more** (the point at which 18m
first becomes possible):

> **Q1.6 — Building height**
> Is the building 18 metres or taller, measured to the floor level of the top storey?
> ○ Yes ○ No ○ Not sure

**Derive, do not ask, the status:**

```
higherRisk = (height18mPlus OR storeys >= 7)
             AND buildingUse in { Residential, Student accommodation (PBSA / halls), Healthcare }
```

A ten-storey office is not a higher-risk building — no residential units — so
the use gate matters as much as the height.

When it resolves true, show the consequence rather than the jargon:

> This is a higher-risk building under the Building Safety Act. Construction
> cannot start until Gateway 2 approval is granted, which is added to the
> programme.

`lib/siteContext.js` already holds `isHigherRiskBuilding()` and
`hrbLikelyFromAnswers()`, and the cost engine already tests for the token
`higher-risk`. This slice changes where the answer comes from, not what consumes
it — so the existing Tab 3 rules and the `BS1` Gateway 2 programme stage keep
working unchanged.

**Not applicable to Demolition only or External works only.** The gateways govern
*building work*. Demolishing a tall residential block is a CDM and party-wall
matter, not a Gateway 2 one.

## 8. Three fixes outside Section 3

| Type | Fix |
|---|---|
| External works only | **Hide Q1.4 building age.** There is no building. Asked today only because the question's sole condition is "not a New Build" |
| Demolition only | **Hide Q2.4 specification level.** There is no specification standard for knocking something down |
| Demolition only | **Hide Q5.1 / Q5.2 financial benefit and ROI.** Rarely meaningful, and the ROI section already self-hides when blank |

## 9. Two decisions from the fix-wave review

**A pre-branch report's declined Q3.8 tick can now derive true when re-run
through `/api/compare`.** A report generated before this slice, where the user
left the Q3.8 "higher-risk building" tickbox unticked, will derive
`isHigherRiskBuilding()` = true if re-run through `/api/compare` and the
stored answers otherwise qualify (7+ storeys or Q1.6 = Yes, a residential /
student / healthcare use, and a project type other than Demolition only or
External works only) — so the compare panel can show a Gateway 2 stage the
originally printed report doesn't have. **Accepted, not fixed:** under the
statute, 7+ storeys with a residential use IS a higher-risk building
regardless of what the old Q3.8 tick captured, so the declined tick was very
likely wrong; and `/api/compare` already diverges from an older report
whenever a workbook rate or duration changes, so this is one more source of
legitimate divergence, not a new class of bug. See the matching comment above
the legacy `hasSiteContext(answers, 'higherRisk')` branch in
`lib/siteContext.js`.

**The "changes no rate, no duration and no percentage" claim above does not
hold for External works only.** Hiding Q1.4 building age for that type (§8)
also removes the only way an External works only project could ever answer
"Pre-1900" and reach the Tab 3 heritage percentage uplift — so for that one
type this slice DOES remove a reachable percentage. Hiding Q1.4 there was a
deliberate decision (there is no building on an External works only project,
so its age is meaningless), not an oversight the code should be changed to
avoid; the claim above should be read with this one exception rather than
literally.

## How it's verified

1. `npm run build`, `npm run lint`, `npm test`.
2. `scripts/baseline.mjs` before and after. **Expected: IDENTICAL across all 76
   scenarios.** This slice adds and removes questions but changes no rule, no
   rate and no option value that a rule quotes — so any movement means an option
   string was altered by accident, which is the one mistake that would be easy
   to make and expensive to miss.
3. New Vitest cases: the asbestos options disappear for a post-2000 building; the
   higher-risk derivation is true for 7 storeys residential and false for 10
   storeys office; each type's Q3.1 and Q3.3 option lists match this spec.
4. In the browser, each of the seven types in turn: Section 3 shows the right
   questions with the right options, Q1.6 appears at 5 storeys and not at 4, and
   the higher-risk consequence line appears for a 7-storey residential building.

## Not in this slice

| | Where it goes |
|---|---|
| Filtering the Q2.2 scope tile list by project type | The scope relevance sheet — needs Excel, and must key on intervention level and specification level as well as project type |
| Sprinklers required in residential buildings over 11m | A scope element, so it belongs in the same sheet |
| Biodiversity Net Gain as a priced element | Needs a Master Cost Table row. Mandatory in England since February 2024 and the tool cannot express it at all |
| Tab 3 rows for the new Q3.1 and Q3.3 options | The workbook list — until then those options capture but change no figure |
| The NB1–NB7 style separate site questions proposed in the earlier review document | **Superseded.** Retitling Q3.1 and varying its options does the same job with one question instead of four |

## Open question

None. Every decision in this document was taken live with the user on
21 September 2026.
