# Questionnaire v7 → v7.1 — Amendment Sheet
**June 2026 · Nabil Kayali · merge these six changes into the master questionnaire**

> Issued separately because the project copy of the questionnaire is a text export that lost the Q2.2 checkbox labels — editing it directly would degrade it. Apply these to your master `.docx`. All six are reflected in `CLAUDE_CODE_REBUILD_BRIEF.md` §3 / §3A and the coordination map v4.2.

## 1 · Q2.3 now controls Q2.2 (no contradictions)
Q2.3 *Level of Works* is asked first (already the v7 order). New rule: the Q2.2 scope list **only enables items valid at the chosen Level**. Each scope item carries a minimum level (NRM1 v3.7 Tab 7 `Min_Level`: 1 Fabric & finishes · 2 Finishes + minor services · 3 Full systems · 4 Reconfiguration). Items above the chosen Level are greyed with a hint ("available at *Full systems replacement* and above"). Replace the old "auto-escalation" wording with: *"You can only select scope appropriate to the Level of Works chosen above; to add deeper work, raise the Level."* (Auto-escalation remains only as a backstop for the Other field.)

## 2 · Q2.2 list is filtered by Q1.2 and Q1.3
Add to the Q2.2 preamble: *"The list below is tailored to your project type (Q1.2) and building use (Q1.3) — only relevant items are shown."* Mechanism: show an item only if its NRM1 group is used by the project type (NRM1 Tab 4) and it is not hidden by the residential filter (Q1.3 = Residential hides emergency lighting, sub-distribution/containment, structured data cabling, commercial AHU, BEMS, DNO upgrade, access control/CCTV).

## 3 · Other / specialist scope — wording correction
**Delete** the line "AI will estimate cost using NRM1 benchmarks and published rate data." **Replace with:** *"Describe any scope not covered above. If you can, add an approximate budget. Items with a budget are shown as a provisional sum; items without are listed as provisional and excluded from the cost total, to be quantified at Stage 2."* (Reason: the AI must never calculate a cost — that is the core architectural rule.) Add an optional numeric field "Approximate budget (£, optional)".

## 4 · Q2.5 Specification standards → free text
Change Q2.5 from multi-select to a **single free-text box**: *"List any standards or funder requirements (e.g. BREEAM Excellent, PAS 2035, net zero, NHS design guide, acoustic). Leave blank if none."* Type: `○ OPTIONAL │ Free text`. (BREEAM and similar are detected from the text; spell them in full.)

## 5 · Q3.4 Planning consents → single choice
Change Q3.4 from multi-select to **single choice**. Options: *No consent required · Permitted development · Prior approval · Full planning · Full planning + Listed Building Consent · Change of use · Unsure (pre-application advice)*. The combined option covers the listed-building case without allowing contradictory multi-ticks.

## 6 · Q5.1 Primary financial benefit → multi-select (confirmed)
Keep Q5.1 as **multi-select** ("Select all that apply"). Add the rule: *"No direct return"* is mutually exclusive — selecting it clears the others and hides the ROI section and Q5.2 (a strategic case is framed instead).

---
*Header line to update: "coordinated with NRM1 Cost Tool **v3.7** and Programme Duration Reference **v4.3**". Version → v7.1.*

---

# Addendum — procurement drivers (September 2026)
**29 September 2026 · two questions added to Section 4 for the Procurement Reference workbook. Wording to be confirmed by Nabil before release.**

> The report's procurement section (Section 7) is now chosen by `Projento_Procurement_Reference.xlsx` from four drivers: construction value, construction duration, the number of risks rated High, and the client's single top priority. Framework and negotiated routes also depend on whether the client is public. Q4.4 alone could not give one top priority, and nothing asked about the client type, hence these two questions.

## 7 · Q4.4a Which ONE of these matters most? (new)
Asked **only when two priorities are ticked in Q4.4**. It offers just those two as a single choice. **Required when shown.** Key `q4_4_topPriority`.
Help text: *"Used to choose the preferred procurement route and route to market."*
Q4.4's help text changes to: *"Choose up to two. Your top priority counts double in the procurement recommendation; both inform the programme options."* (It no longer says the first tick is the primary one.)
With one tick, that tick is the top priority. A saved draft from before this question, with two ticks, uses the one listed first in Q4.4's option order until the user answers Q4.4a. Unticking the chosen priority clears the answer.

## 8 · Q4.8 Public client (new)
*"Is the client a public-sector body, or eligible for public frameworks (e.g. a housing association)?"* Yes / No, single choice. Placed after Q4.7 (funding). **Required.** Key `q4_8_publicClient`.
Help text: *"Framework routes to market are offered only to public and eligible clients; a negotiated contract only to private ones."*
Effect: Yes removes 'Private only' options (Negotiated); No removes 'Public only' options (both framework routes). Unanswered (a report or draft from before this question) removes both.

*Also: the Q4.4 labels "Fixed / certain final cost" and "Funder / compliance requirement" are matched to the workbook's "Fixed/certain final cost" and "Funder/compliance requirement" ignoring spaces and case, so neither side needs renaming.*
