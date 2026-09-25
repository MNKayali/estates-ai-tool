# Report review brief

You are checking a generated RIBA Stage 0–1 feasibility report (PDF) against
the scenario whose answers produced it. The goal is a list of **issues**:
places where the report is wrong, contradicts the answers, misses something
the answers should have produced, is internally inconsistent, or reads badly.

## How the app works (so you judge fairly)
- Every figure (costs, £/m², weeks, dates, grade) is calculated in code from a
  cost workbook and a programme workbook. The AI only writes the prose and is
  forbidden from inventing or changing a figure. So: a figure that differs
  between two pages, or prose quoting a number not in the tables, is an issue.
- Scope items and their quantities come from the questionnaire's scope picker.
  "(your figure)" / "your figure" marks a quantity the user typed; others are
  estimated. A † marks a rate still flagged "AI estimate – verify" in the
  workbook — that is expected, not an issue by itself.
- "Use typical scope" can tick items the scenario did not list (e.g. asbestos
  removal on an old building). That is app behaviour; only flag it if it
  contradicts the scenario (e.g. asbestos removal on a Post-2000 building).
- The postcode district sets the BCIS region / location factor. Check the
  region printed on the report matches the real UK location of the postcode
  (e.g. BS1 = Bristol = South West; LS = Leeds = Yorkshire and the Humber;
  M = Manchester = North West; G = Glasgow = Scotland; CF = Cardiff = Wales).
- Higher-risk building (Building Safety Act / Gateway 2) content should appear
  only when the building is 18 m+ or 7+ storeys with residential-type use; it
  should not appear otherwise.
- Budget: the stated budget includes fees, contingency and VAT, compared with
  the report's gross range. No budget → no shortfall/surplus verdict.

## Read
1. The scenario: `test-reports/<ID>/scenario.md` (story, every answer, and
   "What the report should show").
2. The PDF: `C:\Users\nabil\Downloads\Agent test\<ID> - report.pdf`. Read ALL
   pages (use the Read tool with `pages`, e.g. "1-10", then the rest).

## Check, in this order
1. **Answers carried through** — title, project type, building use (and the
   "Other" description), area, postcode and region, storeys/height, building
   age, spec level, level of intervention (Refurbishment / Fit-out only),
   design stage, phasing, funding, start and target dates.
2. **Scope** — every item the scenario ticked (and chosen options such as
   "Piled", "Pods", "Ground source heat pump", "Large") appears; user
   quantities appear as the user's figure; nothing obviously wrong is priced.
3. **Risks** — Q3.1 known issues, Q3.8 site context, Q3.5 access and Q3.6
   occupation are reflected in the risk register / narrative.
4. **Programme** — starts on the Q4.2 date; the target date (Q4.1) is tested
   and the verdict is right given the weeks shown; planning route (Q3.4) shows
   as a stage where it should; phasing reflected; Gateway 2 only if applicable.
5. **Cost and budget** — figures consistent across cover, summary and cost
   pages; budget verdict correct for the stated budget (or absent if none);
   £/m² plausible for the UK in 2026 for this type/use/spec (flag only clear
   outliers, say why).
6. **Financial case** — present only if Q5.1 gives a financial benefit, and it
   uses the Q5.2 annual figure when one is given.
7. **Report instructions (Q6.1)** — honoured if given.
8. **Prose quality** — contradictions with the answers, invented facts, claims
   about "automated checks" that aren't supported, questionnaire numbers like
   "(Q3.5)" left in the text, repetition, typos, placeholder text, empty or
   cut-off sections, layout faults you can see.
9. **Expectations** — each bullet under "What the report should show":
   Pass / Fail / Partly, with a one-line reason.

## Write `test-reports/<ID>/review.md`

```markdown
# Review — <ID>

Verdict: <one sentence overall>

## Issues
| # | Severity | Category | Page | Report says | Expected (scenario) | Issue |
|---|---|---|---|---|---|---|
| 1 | High | Region | 1 | "West Midlands, BS1" | BS1 is Bristol (South West) | Wrong region; likely wrong location factor |

## Expectations
| Expectation | Result | Note |
|---|---|---|
```

Severity: **High** = wrong figure, wrong fact from the answers, or misleading
advice a client could act on; **Medium** = an answer not reflected, an
inconsistency, or an unclear/unsupported claim; **Low** = wording, typo,
layout. Categories: Answers, Region, Scope, Risk, Programme, Cost, Budget,
Financial case, Instructions, Prose, Layout. Quote the report exactly (short).
Be specific and evidence-based; don't pad — if there are no issues, say so.
Do not edit anything except your review.md files.
