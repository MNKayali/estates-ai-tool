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
import { saveReport } from '@/lib/kv'
import { runSenseCheck } from '@/lib/senseCheck'

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

    // ── Fix 9: Validation guards ──────────────────────────────────────────────

    // Guard 1 — Q2.3 must be recognised (refurb/fit-out/extension only)
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

    // Guard 2 — scope must have at least one item
    if (!answers.q2_2_scopeItems || answers.q2_2_scopeItems.length === 0) {
      return Response.json({
        error: 'At least one scope item must be selected in Q2.2.',
        field: 'q2_2_scopeItems',
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

    // Guard 3 — cost calculator must return line items
    if (!cost.lineItems || cost.lineItems.length === 0) {
      return Response.json({
        error: 'Cost calculator returned no line items. Check scope inputs and workbook connection.',
        debug: { scope: answers.q2_2_scopeItems, interventionLevel: answers.q2_3_interventionLevel },
      }, { status: 500 })
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

    // Guard 4 — tender stage must not be zero
    const tenderStage = (programme.stages || []).find(s => s.stage === 'Tender / Procurement')
    if (!tenderStage || (tenderStage.weeks || 0) === 0) {
      console.error('[Guard 4] Tender period is zero — getTenderWeeks() may have failed')
    }

    // Guard 5 — assumptions must have no unfilled placeholders
    const allAssumptionText = (programme.assumptions || []).join(' ')
    if (allAssumptionText.includes('[') && allAssumptionText.includes(']')) {
      console.warn('[Guard 5] Unfilled placeholder found in programme assumptions')
    }

    // ── Re-run cost with programme weeks (for inflation + prelims cap) ────────
    answers._constructionWeeks = programme.constructionWeeks
    cost = await calculateCost(answers, programme.totalWeeks)

    // ── Step 2c: Sense check ──────────────────────────────────────────────────
    const senseCheck = runSenseCheck(cost, programme)

    // ── Step 3: Single AI call — prose only ───────────────────────────────────
    console.log('[Step 3] Calling Claude for prose...')
    let aiProse
    try {
      aiProse = await callClaudeForProse(answers, cost, programme, senseCheck)
    } catch (e) {
      console.error('[Step 3 error]', e.message)
      return Response.json({ error: 'AI prose generation failed: ' + e.message }, { status: 500 })
    }

    // ── Step 4: Build Word document ───────────────────────────────────────────
    console.log('[Step 4] Building Word report...')
    const reportId    = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    const generatedAt = new Date().toISOString()
    const costData    = serializeCost(cost)
    const progData    = serializeProgramme(programme)

    let docxBuffer, templateError
    try {
      docxBuffer = await buildReport({ answers, cost, programme, aiProse })
    } catch (e) {
      console.error('[Step 4 error]', e.message)
      templateError = e.message
    }

    // ── Save to KV (best-effort — failure never blocks the response) ──────────
    const kvPayload = {
      reportId,
      projectName: answers.q1_0_projectName,
      cost:        costData,
      programme:   progData,
      aiProse,
      answers,                                   // included so shared links work without localStorage
      generatedAt,
      ...(docxBuffer   && { docx: docxBuffer.toString('base64') }),
      ...(templateError && { templateError }),
    }
    saveReport(reportId, kvPayload)              // fire-and-forget; errors are caught inside saveReport

    return Response.json({
      success: true,
      reportId,
      projectName: answers.q1_0_projectName,
      cost:        costData,
      programme:   progData,
      aiProse,
      generatedAt,
      ...(docxBuffer   && { docx: docxBuffer.toString('base64') }),
      ...(templateError && { templateError }),
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
8. Risk register: provide 5 to 8 risks. Each risk must cite a specific questionnaire input as its trigger.
9. DETERMINISTIC RISK SEEDS: if the prompt contains a "DETERMINISTIC RISK SEEDS" section, you MUST include every listed seed as a risk register entry. Do not omit any seed. Do not add access-constraint risks that are not seeded. You may expand the prose but must not change the Likelihood/Impact/Rating values.`

async function callClaudeForProse(answers, cost, programme, senseCheck) {
  const prompt = buildProsePrompt(answers, cost, programme, senseCheck)
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

// Q3.5 access constraint → deterministic risk seed
const ACCESS_RISK_SEEDS = [
  {
    trigger: 'no vehicle access',
    ref: 'ACC-A',
    description: 'Materials, plant handling and waste removal constrained; productivity loss and double-handling due to no vehicle access.',
    likelihood: 'Medium', impact: 'High', rating: 'High',
    mitigation: 'Confirm offload and storage strategy; craneage or hoist plan; logistics method statement required at tender.',
  },
  {
    trigger: 'term-time',
    ref: 'ACC-B',
    description: 'Works confined to vacation windows; programme spans multiple academic terms; risk of overrun into term time.',
    likelihood: 'High', impact: 'High', rating: 'High',
    mitigation: 'Phase works to vacation windows; agree blackout dates with faculty; build programme float; consider out-of-hours working.',
  },
  {
    trigger: 'scaffold licence',
    ref: 'ACC-C',
    description: 'Highway or public-realm scaffold licence lead time and conditions; possible refusal or delay by local authority.',
    likelihood: 'Medium', impact: 'Medium', rating: 'Medium',
    mitigation: 'Apply for licence early; confirm pavement/road licence period and inspection regime with the authority before tender.',
  },
  {
    trigger: 'restricted',
    ref: 'ACC-D',
    description: 'Restricted working hours extend construction duration and may attract premium or out-of-hours rates.',
    likelihood: 'Medium', impact: 'Medium', rating: 'Medium',
    mitigation: 'Confirm permitted hours with the client; price out-of-hours working where programme-critical; reflect in Prelims.',
  },
  {
    trigger: 'shared access',
    ref: 'ACC-E',
    description: 'Coordination required with other occupiers; risk of access disputes and need to protect shared circulation routes.',
    likelihood: 'Medium', impact: 'Medium', rating: 'Medium',
    mitigation: 'Agree access protocol, signage, and routes/times with neighbouring occupiers before works commence.',
  },
  {
    trigger: 'height',
    ref: 'ACC-F',
    description: 'Height or weight limits on site restrict plant and delivery vehicle size, requiring specialist or smaller plant and more frequent deliveries.',
    likelihood: 'Low', impact: 'Medium', rating: 'Low',
    mitigation: 'Survey access route; confirm vehicle dimension and weight limits; plan delivery sizes and frequency accordingly.',
  },
]

function buildAccessRiskSeeds(accessConstraints) {
  const ac = (accessConstraints || []).map(a => a.toLowerCase())
  if (ac.some(a => a.includes('no access constraints') || a.includes('none'))) return ''
  const seeds = ACCESS_RISK_SEEDS.filter(s => ac.some(a => a.includes(s.trigger)))
  if (seeds.length === 0) return ''
  const lines = seeds.map(s =>
    `- ${s.description} | L: ${s.likelihood} | I: ${s.impact} | RAG: ${s.rating} | Mitigation: ${s.mitigation}`
  ).join('\n')
  return `\nDETERMINISTIC RISK SEEDS — include ALL of these in riskRegister exactly as seeded (do not alter L/I/Rating):\n${lines}\n`
}

function buildProsePrompt(answers, cost, programme, senseCheck) {
  const f1k = n => `£${(Math.round((n || 0) / 1000) * 1000).toLocaleString('en-GB')}`
  const f = n => `£${Math.round(n || 0).toLocaleString('en-GB')}`

  const q5_1 = Array.isArray(answers.q5_1_financialBenefit)
    ? answers.q5_1_financialBenefit.join(' | ')
    : (answers.q5_1_financialBenefit || '')
  const isROI = q5_1 && !q5_1.includes('No direct') && answers.q5_2_annualBenefit

  // Pre-calculate the ROI figures here so the AI never computes a number. Mid-point
  // of the published cost range, matching the ROI box in the report builder.
  const roiAnnual  = Number(answers.q5_2_annualBenefit) || 0
  const roiMid     = Math.round(((cost.total.low + cost.total.high) / 2) / 1000) * 1000
  const roiPayback = roiAnnual ? Math.round((roiMid / roiAnnual) * 10) / 10 : 0

  return `Generate prose sections for a RIBA Stage 1 Feasibility Report. Return ONLY valid JSON.

PROJECT CONTEXT:
Name: ${answers.q1_0_projectName}
Type: ${answers.q1_2_projectType} | Postcode: ${answers.q1_1_postcode} | GIFA: ${answers.q1_5_size} m²
Building use: ${answers.q1_3_buildingUse || 'Not stated'} | Age: ${answers.q1_4_buildingAge || 'Not stated'}
Specification level: ${cost.specLevel} | Level of intervention: ${cost.interventionLevel}
Objective: ${answers.q2_1_objective || 'Not stated'}
Scope items: ${(answers.q2_2_scopeItems || []).join(', ') || 'None specified'}
Specialist / additional scope notes: ${typeof answers.q2_2_additionalScope === 'object' ? (answers.q2_2_additionalScope?.text || 'None') : (answers.q2_2_additionalScope || 'None')}
Standards and compliance requirements: ${answers.q2_5_standards || 'None stated'}
Known issues: ${(answers.q3_1_knownIssues || []).join(', ') || 'None identified'}
Previous works and building history: ${answers.q3_2_recentWorks || answers.q3_2_previousWorks || 'Not stated'}
Surveys: ${Array.isArray(answers.q3_3_surveys) ? answers.q3_3_surveys.join(', ') : (answers.q3_3_surveys || 'Not stated')} | Planning: ${answers.q3_4_planningConsents || 'Not stated'}
Access constraints: ${(answers.q3_5_accessConstraints || []).join(', ') || 'None'}
Occupation during works: ${answers.q3_6_occupation || 'Not stated'}
Additional context: ${answers.q3_7_additionalContext || 'None'}
Target date: ${answers.q4_1_targetDate || 'None specified'} | Budget: ${answers.q4_3_budget ? f(answers.q4_3_budget) : 'Not stated'}
Client priorities (what matters most): ${(answers.q4_4_priorities || []).join(', ') || 'Not stated'}
Funding source: ${answers.q4_7_funding || 'Not stated'}
Design stage reached: ${answers.q4_5_designStage || 'Stage 0–1'}
Financial benefit: ${q5_1 || 'None'}
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
${buildAccessRiskSeeds(answers.q3_5_accessConstraints)}${answers.q6_2_instructions || answers.q6_2_reportInstructions ? `\nCUSTOM INSTRUCTIONS FROM CLIENT (apply these to your prose writing — tone, emphasis, audience focus):\n${answers.q6_2_instructions || answers.q6_2_reportInstructions}` : ''}
${senseCheck?.hasWarnings
  ? `\nSENSE CHECK WARNINGS (automatically detected — respond to these in your prose):\n` +
    senseCheck.warnings.map(w =>
      `[${w.severity.toUpperCase()} / ${w.code}] ${w.message}`
    ).join('\n') +
    `\n\nInstructions for warnings:\n- HIGH warnings: flag prominently in the Executive Summary; lower confidenceScore by one grade from what you would otherwise assign.\n- MEDIUM warnings: include as a cost or programme risk entry in riskRegister with a verification recommendation.\n- LOW warnings: mention briefly in the costNarrative or procurementNarrative as a programme note.\n`
  : `\nSENSE CHECK: All automated checks passed — no anomalies detected.\n`
}
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
  "roiNarrative": "${isROI ? `Write 2 sentences. Use these pre-calculated figures verbatim — do NOT recompute: project cost mid-point ${f1k(roiMid)}, annual benefit ${f(roiAnnual)}, simple payback ${roiPayback} years. State the simple payback, then identify the key financial risk.` : ''}",
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

// ─── Serialisers ──────────────────────────────────────────────────────────────
// Fix 1: include lineItems and stages so the HTML report page has all data
function serializeCost(cost) {
  return {
    lineItems: cost.lineItems,          // Fix 2: needed by scope section in HTML
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
  }
}

function serializeProgramme(programme) {
  return {
    stages:              programme.stages,
    milestones:          programme.milestones,
    assumptions:         programme.assumptions,
    standardAssumptions: programme.standardAssumptions,
    totalWeeks:          programme.totalWeeks,
    surveyWeeks:         programme.surveyWeeks,
    designWeeks:         programme.designWeeks,
    tenderWeeks:         programme.tenderWeeks,
    constructionWeeks:   programme.constructionWeeks,
    handoverWeeks:       programme.handoverWeeks,
    planningWeeks:       programme.planningWeeks,
    bcWeeks:             programme.bcWeeks,
    targetStatus:        programme.targetStatus,
    targetNote:          programme.targetNote,
    procurementRoute:    programme.procurementRoute,
    occupationUplift:    programme.occupationUplift,
    constructionType:    programme.constructionType,
    grantGovernanceWeeks: programme.grantGovernanceWeeks,
    procurementNote:     programme.procurementNote,
  }
}
