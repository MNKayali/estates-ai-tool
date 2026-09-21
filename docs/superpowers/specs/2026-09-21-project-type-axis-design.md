# Slice 1 — fix the Q1.2 project-type list

*21 September 2026 · design for approval*

## The problem

Q1.2 offers eight project types that aren't the same kind of thing. Five describe
what you're doing to the building fabric. **External Works** describes a place,
**Renewable Energy** describes a scope, and **Mixed** describes a combination.

Every defect we found traces back to that mismatch:

| Defect | Cause |
|---|---|
| Mixed cannot price foundations, slab or basement | "A combination" has no rate family, so the code picks refurbishment — and elements 1.1–1.4 have no refurbishment rate |
| Renewable Energy demands a floor area, and shows a spec level that changes nothing | A solar scheme prices per kWp; the quantity-driven pricing types ignore the spec column entirely |
| External Works is asked how old the building is | It's being asked a fabric question when it isn't a building |

## What changes

### 1. The option list

Seven options on one axis. Each maps to a rate family that is actually maintained
in the workbook — new build (100 of 112 rows) or refurbishment (105 of 112).

| Option | Help line |
|---|---|
| New Build | A new standalone building or structure |
| Extension | New floor area added to an existing building |
| Refurbishment | Works to an existing building, including its fabric or envelope |
| Fit-out | Internal fit-out or refit — no work to the building fabric |
| External works only | Site works with no building work |
| Demolition only | Removing a structure, with no replacement in this project |
| Other or mixed | Spans more than one of the above, or doesn't fit any. You choose exactly what's included in the scope list. |

Changes from today: `Mixed` → `Other or mixed`, `Demolition` → `Demolition only`,
`External Works` → `External works only`, and `Renewable Energy` is removed.
Help lines are new — the select currently has bare options.

**Why Fit-out stays.** It prices identically to Refurbishment — same rate family,
same preset, same tier logic, and no Tab 3 rule keys on project type. The real
difference is the picker: Refurbishment shows groups 0, 2, 3, 4, 5, 7, 8 and
Fit-out shows only 3, 4, 5. That is the distinction between changing what's
inside the box and changing the box, and it is worth keeping.

**Where renewables go.** An energy centre is a New Build; rooftop PV on an
existing building is a Refurbishment; anything else is Other or mixed. A
"Specialist project" type is the intended home later — the programme workbook
already has a `CS1 Specialist — Labs / Healthcare` row, triggered from the scope
items rather than from a project type, which is the pattern to build on.

### 2. The rate-family fallback

For **Other or mixed only**: when an element has no refurbishment rate, fall back
to its new build rate.

| | |
|---|---|
| Unpriceable on Mixed today | 7 elements |
| Fixed by the fallback | **6** — 0.4 ground stabilisation, 1.1–1.4 substructure, 8.10 HGV hardstanding |
| Still unpriceable | 5.1b only, which has no rate in any family and is already on the workbook fix list |

**This cannot move an existing number.** 92 elements carry a rate in both
families, so the fallback never fires for them. It can only make priceable
something that previously wasn't.

Scoped to Other or mixed deliberately. Refurbishment has the same gap on 0.4 and
8.10, but that is a missing rate in the workbook rather than a design flaw, and
it belongs with the rate work in a later slice.

**The fallback is not disclosed in the client-facing report** (decided
21 September 2026). No sentence about the mixed rate basis appears in the web
report, the `.docx` or the PDF.

It is recorded internally instead, following the existing `internal: true`
convention in `lib/senseCheck.js` — a diagnostic visible to maintainers and in
the admin view, never to the client. That keeps the information from being lost
without putting it in front of a reader.

Noted once, not re-argued: an Other-or-mixed estimate will therefore use two
rate families without saying so, in a report whose Estimate Basis section
otherwise states where every figure came from. Worth revisiting before the tool
goes in front of external clients; out of scope for this slice.

### 3. Stored data

| | Handling |
|---|---|
| Saved drafts in `localStorage` | Bump `STORAGE_SCHEMA_VERSION` 2 → 3. A mismatched draft is discarded, which the questionnaire already does. |
| Reports in KV (90-day TTL) | No migration. They hold a value the form no longer offers, which is harmless — they are read-only. |

Verified safe for stored values: `getRateForElement` matches on lowercase
substrings, so a stored `Mixed` or `Renewable Energy` still resolves to the
refurbishment family exactly as it does today. `VISIBLE_GROUPS` lookups return
`undefined` and fall back to showing all groups, which only affects the
questionnaire — a page a finished report never re-enters.

## Files touched

| File | Change |
|---|---|
| `app/questionnaire/page.jsx` | `PROJECT_TYPES`, `VISIBLE_GROUPS` keys, the exact-match in `priceableFor`, the two exact-matches in `presetScopeFor`, the Q1.2 render (help lines), `STORAGE_SCHEMA_VERSION` |
| `lib/costCalculator.js` | `getRateForElement` — the fallback |
| `app/api/suggest-scope/route.js` | Its duplicated `VISIBLE_GROUPS` and family exact-match, which must stay in step |
| `scripts/baseline.mjs` | Rename the external-works scenario; **add an other-or-mixed scenario with substructure ticked**, which does not exist today |
| `lib/__tests__/labels.test.js` | The type strings it asserts on |
| `scripts/build-question-scope-map.mjs` | Its copies of the same constants |

`getRateForElement`, `selectConstructionId` and `lib/labels.js` all match on
lowercase substrings, so `Demolition only` and `External works only` continue to
resolve correctly with no change.

## How it's verified

1. `npm run build` and `npm run lint`.
2. `npm test` — plus new Vitest cases: the fallback fires for the six elements,
   does not fire where both families have a rate, and 5.1b stays excluded.
3. `scripts/baseline.mjs` before and after. **Expected: IDENTICAL across all ~75
   scenarios.** No existing scenario uses Mixed, Renewable Energy or Demolition,
   and the fallback cannot fire anywhere else — so any movement means a mistake.
4. In the browser: each of the seven options selected in turn, confirming the
   picker groups, the preset button and the spec-level question behave, and that
   substructure can now be ticked on Other or mixed.

## Not in this slice

| | Slice |
|---|---|
| Hiding questions that can't apply — building age on External works only, spec level on Demolition only | 2 |
| The ~10 proposed new questions that need no workbook edit | 3 |
| Extension priced from New Build rates plus uplifts, instead of its own columns | 4 — moves numbers, needs the workbook |
| The 33 missing Extension rates; substructure rates; 5.1b | 4 — Excel work |
| Splitting Other or mixed by area so each part uses its own rate family | Later — a cost-engine change |
| Narrowing the scope picker itself | The original Q2.2 problem, unchanged by this slice |

## Decisions taken

| Question | Decision (21 September 2026) |
|---|---|
| Rename `External Works` → `External works only`? | **Yes.** Symmetry with `Demolition only` — both read as *this and nothing else*. Costs two exact-match updates and a baseline scenario rename. |
| Disclose the rate fallback in the client report? | **No.** Recorded as an internal diagnostic instead. See §2. |

No open questions. Ready for an implementation plan.
