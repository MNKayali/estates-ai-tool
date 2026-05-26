/**
 * /api/generate-report
 *
 * Pipeline:
 *   Step 1 — costCalculator.js  → deterministic cost JSON (no AI)
 *   Step 2 — programmeCalculator.js → deterministic programme JSON (no AI)
 *   Step 3 — one Claude call → prose JSON only (no numbers invented)
 *   Step 4 — reportBuilder.js  → fills Word template → returns .docx buffer as base64
 *
 * Rule: the AI never calculates a number.
 */
import { calculateCost } from '@/lib/costCalculator'
import { calculateProgramme } from '@/lib/programmeCalculator'
import { buildReport } from '@/lib/reportBuilder'

// Read inside handler so it picks up env vars after module init
function getAnthropicKey() {
  return (process.env.AI_API_KEY || '').replace(/^﻿/, '')
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { answers } = body
    if (!answers) return Response.json({ error: 'Missing answers' }, { status: 400 })

    const required = ['q1_0_projectName', 'q1_2_projectType', 'q1_1_postcode', 'q1_5_size']
    const missing = required.filter(f => !answers[f])
    if (missing.length > 0) {
      return Response.json({ error: `Missing required fields: ${missing.join(', ')}` }, { status: 400 })
    }

    // ── Q2.3 validation (refurb/fit-out/extension only) ───────────────────────
    const refurbTypes = ['Refurbishment', 'Fit-out', 'Extension']
    const validInterventionLevels = [
      'Fabric and finishes only',
      'Finishes with minor services',
      'Full systems replacement',
      'Reconfiguration or full redesign',
    ]
    if (refurbTypes.includes(answers.q1_2_projectType) && !validInterventionLevels.includes(answers.q2_3_interventionLevel)) {
      return Response.json({
        error: 'Q2.3 — Level of works is required. Please select one of the four options.',
        field: 'q2_3_interventionLevel',
      }, { status: 400 })
    }

    // ── Step 1: Deterministic cost calculation ────────────────────────────────
    console.log('[Step 1] Running cost calculator...')
    let cost
    try {
      // First pass: programme unknown → estimate construction weeks for inflation
      cost = await calculateCost(answers, 0)
    } catch (e) {
      console.error('[Step 1 error]', e.message)
      return Response.json({ error: 'Cost calculation failed: ' + e.message }, { status: 500 })
    }

    // ── Step 2: Deterministic programme calculation ────────────────────────────
    console.log('[Step 2] Running programme calculator...')
    let programme
    try {
      programme = await calculateProgramme(answers, cost.total.mid)
    } catch (e) {
      console.error('[Step 2 error]', e.message)
      return Response.json({ error: 'Programme calculation failed: ' + e.message }, { status: 500 })
    }

    // ── Re-run cost with programme weeks (for inflation + prelims cap) ────────
    answers._constructionWeeks = programme.constructionWeeks
    cost = await calculateCost(answers, programme.totalWeeks)

    // ── Step 3: Single AI call — prose only ───────────────────────────────────
    console.log('[Step 3] Calling Claude for prose...')
    let aiProse
    try {
      aiProse = await callClaudeForProse(answers, cost, programme)
    } catch (e) {
      console.error('[Step 3 error]', e.message)
      return Response.json({ error: 'AI prose generation failed: ' + e.message }, { status: 500 })
    }

    // ── Step 4: Build Word document ───────────────────────────────────────────
    console.log('[Step 4] Building Word report...')
    let docxBuffer
    try {
      docxBuffer = await buildReport({ answers, cost, programme, aiProse })
    } catch (e) {
      console.error('[Step 4 error]', e.message)
      // Return data even if template fails — client can show preview
      return Response.json({
        success: true,
        templateError: e.message,
        projectName: answers.q1_0_projectName,
        cost: serializeCost(cost),
        programme: serializeProgramme(programme),
        aiProse,
        generatedAt: new Date().toISOString(),
      })
    }

    return Response.json({
      success: true,
      projectName: answers.q1_0_projectName,
      docx: docxBuffer.toString('base64'),
      cost: serializeCost(cost),
      programme: serializeProgramme(programme),
      aiProse,
      generatedAt: new Date().toISOString(),
    })

  } catch (error) {
    console.error('[generate-report]', error)
    return Response.json({ error: 'Report generation failed', detail: error.message }, { status: 500 })
  }
}

// ─── AI prose call ────────────────────────────────────────────────────────────

const AI_SYSTEM_PROMPT = `You are a UK construction feasibility consultant writing a RIBA Stage 1 Feasibility Report.
You receive pre-calculated cost and programme data. Your job is to write prose only.

ABSOLUTE RULES — failure to follow these will invalidate the report:
1. Do NOT recalculate or change any number. All costs, percentages, durations, and totals are already calculated and provided to you.
2. Write in British English.
3. No markdown formatting — no **, no #, no bullet characters (-, *, •). The Word template handles all formatting.
4. No tables — tables are built from the fixed data by the code, not by you.
5. Return ONLY valid JSON with exactly the keys specified. No preamble, no markdown fences.
6. If a conditional section (ROI, Procurement) is not applicable, return an empty string for that key.
7. Write concisely — each prose section should be 2–4 sentences maximum unless specified otherwise.
8. Risk register: provide 5 to 8 risks. Each risk must cite a specific questionnaire input as its trigger.`

async function callClaudeForProse(answers, cost, programme) {
  const prompt = buildProsePrompt(answers, cost, programme)
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getAnthropicKey(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 6000,
      system: AI_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Claude API ${res.status}: ${JSON.stringify(err)}`)
  }
  const data = await res.json()
  const text = (data.content?.[0]?.text || '').replace(/```json|```/g, '').trim()
  return JSON.parse(text)
}

function buildProsePrompt(answers, cost, programme) {
  const f1k = n => `£${(Math.round((n || 0) / 1000) * 1000).toLocaleString('en-GB')}`
  const f = n => `£${Math.round(n || 0).toLocaleString('en-GB')}`

  const isROI = answers.q5_1_financialBenefit &&
    !String(answers.q5_1_financialBenefit).includes('No direct') &&
    answers.q5_2_annualBenefit

  return `Generate prose sections for a RIBA Stage 1 Feasibility Report. Return ONLY valid JSON.

PROJECT CONTEXT:
Name: ${answers.q1_0_projectName}
Type: ${answers.q1_2_projectType} | Postcode: ${answers.q1_1_postcode} | GIFA: ${answers.q1_5_size} m²
Building use: ${answers.q1_3_buildingUse || 'Not stated'} | Age: ${answers.q1_4_buildingAge || 'Not stated'}
Specification level: ${cost.specLevel} | Level of intervention: ${cost.interventionLevel}
Objective: ${answers.q2_1_objective || 'Not stated'}
Scope items: ${(answers.q2_2_scopeItems || []).join(', ') || 'None specified'}
Known issues: ${(answers.q3_1_knownIssues || []).join(', ') || 'None identified'}
Surveys: ${Array.isArray(answers.q3_3_surveys) ? answers.q3_3_surveys.join(', ') : (answers.q3_3_surveys || 'Not stated')} | Planning: ${Array.isArray(answers.q3_4_planningConsents) ? answers.q3_4_planningConsents.join(', ') : (answers.q3_4_planningConsents || 'Not stated')}
Access constraints: ${(answers.q3_5_accessConstraints || []).join(', ') || 'None'}
Occupation during works: ${answers.q3_6_occupation || 'Not stated'}
Target date: ${answers.q4_1_targetDate || 'None specified'} | Budget: ${answers.q4_2_budgetFigure ? f(answers.q4_2_budgetFigure) : 'Not stated'}
Design stage reached: ${answers.q4_6_designStage || 'Stage 0–1'}
Financial benefit: ${answers.q5_1_financialBenefit || 'None'}
Annual benefit: ${answers.q5_2_annualBenefit ? f(answers.q5_2_annualBenefit) : 'N/A'}

PRE-CALCULATED COST DATA (do not change any of these figures):
BCIS region: ${cost.bcisRegion} | Factor: ${cost.bcisFactor}
Works cost mid: ${f1k(cost.works.mid)} (range: ${f1k(cost.works.low)} – ${f1k(cost.works.high)})
Construction cost mid: ${f1k(cost.construction.mid)}
Total project cost mid: ${f1k(cost.total.mid)} (range: ${f1k(cost.total.low)} – ${f1k(cost.total.high)})
VAT (reference): ${f1k(cost.vat)}
Prelims: ${cost.percentages.prelims}% | OH&P: ${cost.percentages.ohp}%
Professional fees: ${cost.percentages.fees}% | Dev costs: ${cost.percentages.devCosts}%
Risk allowance: ${cost.percentages.risk}% | Contingency: ${cost.percentages.contingency}%
Inflation: ${cost.percentages.inflation}% | Risk level: ${cost.percentages.riskLevel}

PRE-CALCULATED PROGRAMME DATA (do not change any of these figures):
Total weeks: ${programme.totalWeeks}
Surveys: ${programme.surveyWeeks} wks | Design: ${programme.designWeeks} wks | Tender: ${programme.tenderWeeks} wks
Construction: ${programme.constructionWeeks} wks | Handover: ${programme.handoverWeeks} wks
Procurement route: ${programme.procurementRoute}
Target status: ${programme.targetStatus} | ${programme.targetNote}

Return this exact JSON structure:
{
  "confidenceScore": "A|B|C|D",
  "confidenceLabel": "High Confidence|Moderate Confidence|Limited Confidence|High Uncertainty",
  "executiveSummary": "3 to 4 sentences. State project name, type, location, GIFA, objective. Quote total cost as ${f1k(cost.total.low)} to ${f1k(cost.total.high)} (excluding VAT). State confidence grade and target date status. Name the top risk in one phrase.",
  "keyFindings": [
    "One sentence. Start with the single most important cost or programme finding.",
    "One sentence. State whether the target date is achievable or not, with reason.",
    "One sentence. Name the most significant risk or survey gap.",
    "One sentence. State the recommended procurement route and why."
  ],
  "riskRegister": [
    {
      "ref": "R01",
      "category": "Cost|Programme|Technical|Procurement|Regulatory|Health & Safety",
      "description": "One sentence describing the risk. Reference the specific trigger from questionnaire answers.",
      "likelihood": "High|Medium|Low",
      "impact": "High|Medium|Low",
      "rating": "High|Medium|Low",
      "mitigation": "One sentence specific mitigation action."
    }
  ],
  "scopeAssumptions": [
    "Assumption 1 — one sentence",
    "Assumption 2 — one sentence",
    "Assumption 3 — one sentence"
  ],
  "costNarrative": "1 to 2 sentences. Describe the main cost drivers for this project. Do not quote any number — the numbers are in the table.",
  "roiNarrative": "${isROI ? 'Write 2 sentences: state the simple payback using the pre-calculated figure, and identify the key financial risk.' : ''}",
  "procurementRoute": "Name of recommended procurement route (match programme.procurementRoute)",
  "procurementContractForm": "Recommended contract form, e.g. JCT Minor Works 2024, JCT Standard Building Contract 2024",
  "procurementDesignResp": "Who holds design responsibility: Client design team or Contractor",
  "procurementTenderType": "Single stage | Two stage | Direct award",
  "procurementNarrative": "2 sentences. Why this route suits this project type, value, and programme.",
  "procurementConsiderations": ["Commercial consideration 1", "Commercial consideration 2", "Commercial consideration 3"],
  "procurementConflicts": [],
  "constraints": [
    {"category": "Planning|Access|Programme|Technical|Financial|Regulatory", "title": "Short title", "text": "One-sentence impact statement."}
  ],
  "nextSteps": [
    "Next step 1 — most urgent action",
    "Next step 2",
    "Next step 3",
    "Next step 4",
    "Next step 5"
  ]
}`
}

// ─── Serialisers (safe for JSON response — remove buffer) ─────────────────────
function serializeCost(cost) {
  return {
    works: cost.works,
    construction: cost.construction,
    total: cost.total,
    vat: cost.vat,
    bcisFactor: cost.bcisFactor,
    bcisRegion: cost.bcisRegion,
    gifa: cost.gifa,
    specLevel: cost.specLevel,
    interventionLevel: cost.interventionLevel,
    bandFactor: cost.bandFactor,
    percentages: cost.percentages,
    breakdown: cost.breakdown,
    lineItemCount: (cost.lineItems || []).length,
  }
}

function serializeProgramme(programme) {
  const { stages, milestones, standardAssumptions, ...rest } = programme
  return {
    ...rest,
    stageCount: (stages || []).length,
    milestoneCount: (milestones || []).length,
  }
}
