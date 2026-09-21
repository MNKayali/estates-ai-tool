# Slice 3 — honest progress, and honest optionality

*21 September 2026 · design*

## Why

The user's priority, in their words: *"the most important bit is that we need
people not to get bored and leave it."*

Two things work against that today, and they compound.

**The progress bar lies about length.** It shows four steps of very different
size, and the longest is last:

| Step | Questions |
|---|---|
| 1 Project | ~8 |
| 2 Scope | 5, but one is a ~100-tile picker |
| 3 Condition | 8, now fewer per type after slice 2 |
| **4 Programme** | **10** — Q4.1–4.7, Q5.1–5.2, Q6.1 |

Someone reaching "4 of 4" believes they are nearly finished and meets the
biggest block of questions in the form.

**"Optional" is doing a lot of lying.** Only 10 of ~38 questions are required.
A conscientious user answers all 28 optional ones because nothing tells them
which matter — and a hurried one skips questions whose blank silently becomes a
priced assumption.

## 1. Reclassify required and optional

Six Section 3 questions, plus Q4.5, are marked optional while **blank silently
becomes a priced assumption the user never made**:

| Question | What blank means today |
|---|---|
| Q3.1 Known issues | Priced as if there are none — no risk uplift |
| Q3.3 Surveys | Already documented as "blank means None", and carries a risk uplift |
| Q3.4 Planning | No planning row matches, so no planning-related development cost fires |
| Q3.5 Access | Priced as if the site is unconstrained — no preliminaries uplift |
| Q3.6 Occupation | Priced and programmed as if the building is empty |
| Q3.8 Site context | No conservation, party-wall or ecology risk |
| Q4.5 Design stage | Drives the professional-fee ladder, a large part of the estimate |

Every one already has a **"None" / "Unsure" / "No constraints" option**, so
answering is a single tap. They become **required**.

This does not make the form feel longer. A one-click "None" is not experienced
the way a text box is; slice 2 already removed questions per type; and the
genuinely optional questions can now be skipped with confidence because they are
labelled honestly instead of everything being nominally optional.

**Genuinely optional, and staying so:** Q1.6 height, Q2.5 standards, Q3.2
previous works, Q3.7 context, Q4.1 target date, Q4.2 start date, Q4.3 budget,
Q4.4 priorities, Q4.6 phasing, Q4.7 funding, Q5.1/Q5.2 ROI, Q6.1 instructions.
Blank on these is harmless or **already disclosed in the report** — the start
date prints "assumed: the report date", the budget prints "no budget
comparison". That is the pattern the seven above should have followed and did
not.

**Required only where shown.** Every required test is gated by
`isQuestionShown`, so a hidden question can never block a section. That is the
exact defect slice 2 shipped and had to fix; it must not return.

## 2. Progress as a percentage, by section

Per the user: page-level, not per-question.

```
percent = round(((section - 1) / SECTIONS.length) * 100)
```

0% · 25% · 50% · 75%, reaching 100% only on submit. It never overstates.

## 3. Say what is ahead

The section header gains one line, derived for **this user's project type**:

> **Section 3 of 4 · 50% complete**
> 6 questions · 4 need an answer

And above the Continue button, a live count:

> 2 answers still needed in this section — or, once clear, All set — continue
> when you're ready.

Both counts come from `lib/questionSets.js`, which after slice 2 knows exactly
which questions this project type is asked. Before that work the app could not
have counted them honestly, because everyone got everything.

## 4. Rebalance step 4

Q5.1 / Q5.2 (financial case) and Q6.1 (report instructions) are entirely
optional and sit at the end of the longest step. Put each behind a collapsed
disclosure:

- **Add a financial case** — payback and ROI *(optional)*
- **Add instructions for the report** *(optional)*

Expanded automatically when an answer already exists, so a returning draft never
hides the user's own input. This takes the default last step from ten questions
to seven, of which one is required.

## Files touched

| File | Change |
|---|---|
| `lib/questionSets.js` | `QUESTIONS_BY_SECTION`, `isQuestionRequired`, `sectionCounts` |
| `lib/__tests__/questionSets.test.js` | Cover the above |
| `app/questionnaire/page.jsx` | `validateSection` gains section 3 and 4 branches; required markers; header line; remaining-count; two disclosures |

## How it's verified

1. `npm run build`, `npm run lint`, `npm test`.
2. `scripts/baseline.mjs` before and after. **Expected: IDENTICAL across all 76
   scenarios.** This slice changes no rule, rate or option value — it changes
   which answers are *demanded*. Any movement means an option array was touched
   by accident.
3. In the browser, per project type: the header counts match what is actually
   rendered; a hidden question never blocks a section; the two disclosures start
   collapsed on a fresh form and expanded on a draft that has answers; Section 3
   cannot be passed with its six required questions blank.

## Not in this slice

Narrowing the Q2.2 scope picker. That is the largest single contributor to
perceived length, and it waits on the relevance sheet the user fills. The ROI
option-list rework waits with it.

## Assumption

The user agreed to this slice and asked for the required/optional split to be
reconsidered, but did not confirm the final call between making the seven
required and leaving them optional with the assumption shown inline. **Required
is what is built here**, per the recommendation given. Reversing it is a change
to one table in `lib/questionSets.js`.
