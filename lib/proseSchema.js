/**
 * Shared prose-call constants.
 *
 * These are imported by both /api/generate-report (the real prose call) and
 * /api/warm-prose (the schema warm-up). The strict-schema tool is compiled by
 * the Anthropic API on first use and cached ~24h; keeping the warm-up call
 * byte-identical (same model + same PROSE_TOOL) is what lets the warm-up hit
 * the same schema cache the real call relies on.
 */

// Haiku is the right model here: the prose call writes words only — every
// number is computed deterministically upstream — so the fast/cheap tier fits.
export const PROSE_MODEL = 'claude-haiku-4-5-20251001'

// Read inside the handler so it picks up env vars after module init. BOM-stripped.
export function getAnthropicKey() {
  return (process.env.AI_API_KEY || '').replace(/^﻿/, '')
}

export const AI_SYSTEM_PROMPT = `You are a UK construction feasibility consultant writing a RIBA Stage 1 Feasibility Report.
You receive pre-calculated cost and programme data. Your job is to write prose only.

ABSOLUTE RULES — failure to follow these will invalidate the report:
1. Do NOT recalculate or change any number. All costs, percentages, durations, and totals are already calculated and provided to you.
2. Write in British English.
3. No markdown formatting — no **, no #, no bullet characters (-, *, •). The Word template handles all formatting.
4. No tables — tables are built from the fixed data by the code, not by you.
5. Deliver the report content by calling the submit_report_prose tool with every field populated. All prose goes in the tool arguments — no other output.
6. If a conditional section (ROI, Procurement) is not applicable, return an empty string for that key.
7. Write concisely — each prose section should be 2–4 sentences maximum unless specified otherwise.
8. Risk register: provide 5 to 8 risks. Each risk must cite a specific questionnaire input as its trigger.
9. DETERMINISTIC RISK SEEDS: if the prompt contains a "DETERMINISTIC RISK SEEDS" section, you MUST include every listed seed as a risk register entry, setting that entry's seedRef to the seed's Ref code (e.g. ACC-B). Set seedRef to NONE for all non-seeded risks. Do not omit any seed. Do not add access-constraint risks that are not seeded. You may expand the prose but must not change the Likelihood/Impact/Rating values.
10. QUANTITIES — never invent a count. When you state how many of something there is (cubicles, WCs, rooms, fittings, luminaires, units, storeys, etc.), use only the figures given in PRICED SCOPE LINE ITEMS or PROJECT CONTEXT. If a quantity is not provided, describe the item without attaching a number. Never round, estimate, or guess a quantity.
11. HISTORY & ASSUMPTIONS — do not invent dates, prior works, completed installations, or survey findings. Reference building history only where it is explicitly given under "Previous works and building history"; if that is "Not stated", assume no prior works. Every item in PRICED SCOPE LINE ITEMS is in scope and is being costed: never write that a scoped item is unnecessary, already completed, recently replaced, or excluded.
12. CONFIDENCE GRADE — the grade is pre-computed deterministically and given in the prompt. State it where instructed; never choose or imply a different grade.`

// Strict-schema tool the model is forced to call. The API validates the
// arguments against this schema, so "Claude returned non-JSON prose" is no
// longer a failure mode and enums (likelihood/rating/category) are enforced
// upstream rather than policed by prompt text.
const RAG = ['High', 'Medium', 'Low']
export const PROSE_TOOL = {
  name: 'submit_report_prose',
  description: 'Submit the prose sections of the RIBA Stage 1 feasibility report. Call exactly once with every field populated.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      executiveSummary: { type: 'string' },
      keyFindings: { type: 'array', items: { type: 'string' } },
      riskRegister: {
        type: 'array',
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
            seedRef: { type: 'string', enum: ['ACC-A', 'ACC-B', 'ACC-C', 'ACC-D', 'ACC-E', 'ACC-F', 'NONE'] },
          },
          required: ['ref', 'category', 'description', 'likelihood', 'impact', 'rating', 'mitigation', 'seedRef'],
        },
      },
      scopeAssumptions: { type: 'array', items: { type: 'string' } },
      costNarrative: { type: 'string' },
      roiNarrative: { type: 'string' },
      procurementRoute: { type: 'string' },
      procurementContractForm: { type: 'string' },
      procurementDesignResp: { type: 'string' },
      procurementTenderType: { type: 'string' },
      procurementNarrative: { type: 'string' },
      procurementConsiderations: { type: 'array', items: { type: 'string' } },
      procurementConflicts: { type: 'array', items: { type: 'string' } },
      constraints: {
        type: 'array',
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
      nextSteps: { type: 'array', items: { type: 'string' } },
    },
    required: [
      'executiveSummary', 'keyFindings', 'riskRegister', 'scopeAssumptions',
      'costNarrative', 'roiNarrative', 'procurementRoute', 'procurementContractForm',
      'procurementDesignResp', 'procurementTenderType', 'procurementNarrative',
      'procurementConsiderations', 'procurementConflicts', 'constraints', 'nextSteps',
    ],
  },
}
