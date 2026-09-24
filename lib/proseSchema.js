/**
 * Shared prose-call constants.
 *
 * These are imported by both /api/generate-report (the real prose calls) and
 * /api/warm-prose (the schema warm-up). The strict-schema tools are compiled by
 * the Anthropic API on first use and cached ~24h; keeping the warm-up calls
 * byte-identical (same model + same tool objects) is what lets the warm-up hit
 * the same schema cache the real calls rely on.
 *
 * The prose is produced by TWO parallel calls rather than one. A single call
 * emitting all 15 fields ran ~40–50 s of pure output generation, which could not
 * fit inside the 60 s function ceiling (see maxDuration in the report route).
 * Splitting the schema halves the output per call so both finish well inside the
 * budget, and lets a failed half retry on its own without redoing the other.
 *
 *   PROSE_TOOL_NARRATIVE  — executive summary, findings, assumptions,
 *                           cost/ROI narrative, constraints, next steps
 *   PROSE_TOOL_RISK       — risk register + the procurement block
 *
 * The two results are merged into one flat object with exactly the field set the
 * old single tool produced, so reportBuilder.js and ReportRenderer.jsx are
 * unchanged. Keep the two schemas disjoint: a key defined in both would make the
 * merge order significant.
 */

// Haiku is the right model here: the prose call writes words only — every
// number is computed deterministically upstream — so the fast/cheap tier fits.
export const PROSE_MODEL = 'claude-haiku-4-5-20251001'

// Read inside the handler so it picks up env vars after module init. BOM-stripped.
export function getAnthropicKey() {
  return (process.env.AI_API_KEY || '').replace(/^﻿/, '')
}

// One system prompt shared by both calls — identical text keeps the two requests
// on the same cached prefix, and the rules that only bind one half (risk seeds,
// procurement) are harmless to the other.
export const AI_SYSTEM_PROMPT = `You are a UK construction feasibility consultant writing a RIBA Stage 1 Feasibility Report.
You receive pre-calculated cost and programme data. Your job is to write prose only.

ABSOLUTE RULES — failure to follow these will invalidate the report:
1. Do NOT recalculate or change any number. All costs, percentages, durations, and totals are already calculated and provided to you.
2. Write in British English.
3. No markdown formatting — no **, no #, no bullet characters (-, *, •). The Word template handles all formatting.
4. No tables — tables are built from the fixed data by the code, not by you.
5. Deliver the report content by calling the tool you have been given, with every field in its schema populated. All prose goes in the tool arguments — no other output.
6. If a conditional section (ROI, Procurement) is not applicable, return an empty string for that key.
7. Write concisely. Follow the LENGTH AND COUNT LIMITS block exactly — item counts are exact, word counts are maximums.
8. Risk register: include every seeded risk, plus your own, at most 10 in total. Each risk must name the specific answer that triggers it, in words (see rule 15).
9. DETERMINISTIC RISK SEEDS: if the prompt contains a "DETERMINISTIC RISK SEEDS" section, you MUST include every listed seed as a risk register entry, setting that entry's seedRef to the seed's Ref code (e.g. ACC-B, EXC-COST, WARN-COST_LOW, SURV-MISSING, CTX-HRB). Set seedRef to NONE for all non-seeded risks. Do not omit any seed. Do not add your own risk covering the same ground as a seed (access constraints, excluded scope items, a sense-check warning, or missing surveys) — only the seeded entry may cover that ground, so the register's composition stays identical across identical inputs. You may expand the prose but must not change the Likelihood/Impact/Rating values.
10. QUANTITIES — never invent a count. When you state how many of something there is (cubicles, WCs, rooms, fittings, luminaires, units, storeys, etc.), use only the figures given in PRICED SCOPE LINE ITEMS or PROJECT CONTEXT. If a quantity is not provided, describe the item without attaching a number. Never round, estimate, or guess a quantity.
11. HISTORY & ASSUMPTIONS — do not invent dates, prior works, completed installations, or survey findings. Reference building history only where it is explicitly given under "Previous works and building history"; if that is "Not stated", assume no prior works. Every item in PRICED SCOPE LINE ITEMS is in scope and is being costed: never write that a scoped item is unnecessary, already completed, recently replaced, or excluded.
12. CONFIDENCE GRADE — the grade is pre-computed deterministically and given in the prompt. State it where instructed; never choose or imply a different grade.
13. SYSTEM DIAGNOSTICS — never attribute a claim to "the automated sense check," "the system flagged," "was not recognised by," "did not match," or any similar phrase describing this tool's own internal calculation process, unless the prompt's own SENSE CHECK WARNINGS section states it verbatim (if that section instead says "All automated checks passed," no warning exists and none may be invented, quoted, or paraphrased). This applies with no exceptions to the professional fee percentage, prelims percentage, or any other pre-calculated figure in PRE-CALCULATED COST DATA — you are never told which workbook condition produced a percentage, so you must never claim one "was not recognised," "failed to match," or "was flagged" by anything. A risk, doubt, or recommendation you infer yourself from the provided data must be phrased as your own professional judgement about the PROJECT — never dressed up as a system-reported finding about the TOOL's own workings, which you have no visibility into and were not given.
14. TERM-TIME AND SCHEDULING CONSTRAINTS — the only authoritative statement of whether works are restricted to vacation/holiday windows is the "Term-time restriction" line in PROJECT CONTEXT below, derived from Q3.5's checkbox. If it says works are NOT confined to term-time, never describe the works as scheduled "during term-time" or "during term-time occupation" anywhere in your output, even if free-text fields (Q3.7 / additional context) use ambiguous or contradictory-sounding wording — read that free text only for supplementary detail (e.g. which specific dates to avoid) and phrase it consistently with the authoritative line. Both halves of this report are given the identical authoritative line and must reach the identical conclusion from it.
15. NEVER cite questionnaire question numbers (such as "Q3.5" or "(Q3.1)") anywhere. Name the answer in words instead ("restricted working hours").`

// ─── Fixed shape of the AI text ──────────────────────────────────────────────
// One table drives the tool field descriptions, the prompt's limits block and
// the code check (lib/prose.js proseShapeProblems), so they cannot disagree.
// See docs/superpowers/specs/2026-09-23-report-design-system-design.md §7.
export const PROSE_LIMITS = Object.freeze({
  executiveSummary: { words: [90, 130] },
  keyFindings: { count: [5, 5], words: [15, 35] },
  scopeAssumptions: { count: [3, 4], words: [1, 28] },
  costNarrative: { words: [45, 65] },
  roiNarrative: { words: [35, 60], optional: true },
  constraints: { count: [3, 5], fields: { title: [1, 5], text: [1, 35] } },
  nextSteps: { count: [5, 5], words: [1, 40] },
  riskRegister: { fields: { description: [1, 25], mitigation: [1, 20] } },
  procurementNarrative: { words: [40, 70] },
  procurementConsiderations: { count: [3, 3], words: [1, 35] },
  procurementConflicts: { count: [0, 2], words: [1, 30] },
})

export const HALF_FIELDS = Object.freeze({
  narrative: ['executiveSummary', 'keyFindings', 'scopeAssumptions', 'costNarrative', 'roiNarrative', 'constraints', 'nextSteps'],
  risk: ['riskRegister', 'procurementNarrative', 'procurementConsiderations', 'procurementConflicts'],
})

const range = ([lo, hi]) => (lo <= 1 ? `at most ${hi}` : `${lo}–${hi}`)

export function limitGuidance(field) {
  const l = PROSE_LIMITS[field]
  if (!l) return ''
  const parts = []
  if (l.count) parts.push(l.count[0] === l.count[1] ? `exactly ${l.count[0]} items` : `${l.count[0]}–${l.count[1]} items`)
  if (l.words) parts.push(`${l.count ? 'each ' : ''}${range(l.words)} words`)
  if (l.fields) parts.push(Object.entries(l.fields).map(([k, r]) => `${k} ${range(r)} words`).join(', '))
  if (l.optional) parts.push('empty string when there is no financial benefit')
  return parts.join(', ')
}

const RAG = ['High', 'Medium', 'Low']

// ─── Call A — narrative half ──────────────────────────────────────────────────
// Everything that reads as continuous prose about the project itself. Deliberately
// carries `constraints` (a small object array) to offset the risk register's bulk
// in call B, so the two calls finish in roughly the same wall-clock time.
export const PROSE_TOOL_NARRATIVE = {
  name: 'submit_report_narrative',
  description: 'Submit the narrative sections of the RIBA Stage 1 feasibility report. Call exactly once with every field populated.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      executiveSummary: { type: 'string', description: limitGuidance('executiveSummary') },
      keyFindings: { type: 'array', items: { type: 'string' }, description: limitGuidance('keyFindings') },
      scopeAssumptions: { type: 'array', items: { type: 'string' }, description: limitGuidance('scopeAssumptions') },
      costNarrative: { type: 'string', description: `Explain in about four lines what drives the works cost table. ${limitGuidance('costNarrative')}` },
      roiNarrative: { type: 'string', description: limitGuidance('roiNarrative') },
      constraints: {
        type: 'array',
        description: limitGuidance('constraints'),
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            category: { type: 'string', enum: ['Planning', 'Access', 'Programme', 'Technical', 'Financial', 'Regulatory'] },
            title: { type: 'string' },
            text: { type: 'string' },
          },
          required: ['category', 'title', 'text'],
        },
      },
      nextSteps: { type: 'array', items: { type: 'string' }, description: limitGuidance('nextSteps') },
    },
    required: [
      'executiveSummary', 'keyFindings', 'scopeAssumptions',
      'costNarrative', 'roiNarrative', 'constraints', 'nextSteps',
    ],
  },
}

// ─── Call B — risk + procurement half ─────────────────────────────────────────
// The risk register is the single largest output in the report (up to 10 objects of
// eight fields each), which is why it anchors its own call.
export const PROSE_TOOL_RISK = {
  name: 'submit_report_risk_procurement',
  description: 'Submit the risk register and procurement sections of the RIBA Stage 1 feasibility report. Call exactly once with every field populated.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      riskRegister: {
        type: 'array',
        description: limitGuidance('riskRegister'),
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ref: { type: 'string' },
            category: { type: 'string', enum: ['Cost', 'Programme', 'Technical', 'Procurement', 'Regulatory', 'Health & Safety'] },
            description: { type: 'string' },
            likelihood: { type: 'string', enum: RAG },
            impact: { type: 'string', enum: RAG },
            rating: { type: 'string', enum: RAG },
            mitigation: { type: 'string' },
            seedRef: {
              type: 'string',
              enum: [
                'ACC-A', 'ACC-B', 'ACC-C', 'ACC-D', 'ACC-E', 'ACC-F',
                'EXC-COST', 'WARN-COST_LOW', 'WARN-COST_HIGH', 'WARN-BUDGET_SHORTFALL',
                'WARN-PROG_SHORT', 'WARN-PROG_LONG', 'SURV-MISSING',
                'CTX-HRB', 'CTX-PARTYWALL', 'CTX-CONSERVATION', 'CTX-ECOLOGY', 'NONE',
              ],
            },
          },
          required: ['ref', 'category', 'description', 'likelihood', 'impact', 'rating', 'mitigation', 'seedRef'],
        },
      },
      procurementRoute: { type: 'string' },
      procurementContractForm: { type: 'string' },
      procurementDesignResp: { type: 'string' },
      procurementTenderType: { type: 'string' },
      procurementNarrative: { type: 'string', description: limitGuidance('procurementNarrative') },
      procurementConsiderations: { type: 'array', items: { type: 'string' }, description: limitGuidance('procurementConsiderations') },
      procurementConflicts: { type: 'array', items: { type: 'string' }, description: limitGuidance('procurementConflicts') },
    },
    required: [
      'riskRegister', 'procurementRoute', 'procurementContractForm',
      'procurementDesignResp', 'procurementTenderType', 'procurementNarrative',
      'procurementConsiderations', 'procurementConflicts',
    ],
  },
}

// Both schemas, in the order the warm-up compiles them.
export const PROSE_TOOLS = [PROSE_TOOL_NARRATIVE, PROSE_TOOL_RISK]
