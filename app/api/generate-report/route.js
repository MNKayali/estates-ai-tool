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
import * as Sentry from '@sentry/nextjs'
import { calculateCost } from '@/lib/costCalculator'
import { calculateProgramme } from '@/lib/programmeCalculator'
import { buildReport } from '@/lib/reportBuilder'
import { saveReport } from '@/lib/kv'
import { runSenseCheck } from '@/lib/senseCheck'
import { PROSE_MODEL, PROSE_TOOL, AI_SYSTEM_PROMPT, getAnthropicKey } from '@/lib/proseSchema'

// Report a caught pipeline failure to Sentry with the exact answers that
// triggered it, so a crash a colleague never reports still arrives reproducible.
// No-ops when NEXT_PUBLIC_SENTRY_DSN is unset. answers is attached as `extra`
// (not contexts) so it is never used for issue-grouping.
function capturePipelineError(e, step, answers) {
  Sentry.captureException(e, {
    tags: { pipeline_step: step },
    extra: { answers },
  })
}

// The Claude prose call can take 20–40s; allow headroom on the serverless runtime.
export const maxDuration = 60

export async function POST(request) {
  // Request-level clock. The AI call's deadline is derived from this so it never
  // overruns the 60 s function ceiling once the docx build + KV write are added.
  const requestStart = Date.now()
  try {
    const body = await request.json()
    const { answers } = body
    if (!answers) return Response.json({ error: 'Missing answers' }, { status: 400 })

    const required = ['q1_0_projectName', 'q1_2_projectType', 'q1_1_postcode', 'q1_5_size']
    const missing = required.filter(f => !answers[f])
    if (missing.length > 0) {
      return Response.json({ error: `Missing required fields: ${missing.join(', ')}` }, { status: 400 })
    }

    // GIFA must be a positive, finite number — otherwise the calculator either
    // silently falls back to 100 m² (non-numeric) or produces negative costs.
    const gifa = Number(answers.q1_5_size)
    if (!Number.isFinite(gifa) || gifa <= 0) {
      return Response.json({
        error: 'Q1.5 — Approximate size must be a positive number (m²).',
        field: 'q1_5_size',
      }, { status: 400 })
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
      capturePipelineError(e, 'cost', answers)
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
      capturePipelineError(e, 'programme', answers)
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
    // Construction weeks are passed explicitly (not stashed on `answers`) so the
    // user's answer object is never mutated before it is persisted / returned.
    cost = await calculateCost(answers, programme.totalWeeks, programme.constructionWeeks)

    // ── Step 2c: Sense check ──────────────────────────────────────────────────
    const senseCheck = await runSenseCheck(cost, programme, answers)

    // ── Step 3: Single AI call — prose only ───────────────────────────────────
    console.log('[Step 3] Calling Claude for prose...')
    let aiProse
    try {
      // Leave ~7 s of the 60 s ceiling for the docx build + KV write that follow.
      const proseDeadline = requestStart + 53_000
      aiProse = await callClaudeForProse(answers, cost, programme, senseCheck, proseDeadline)
    } catch (e) {
      console.error('[Step 3 error]', e.message)
      capturePipelineError(e, 'prose', answers)
      return Response.json({ error: 'AI prose generation failed: ' + e.message }, { status: 500 })
    }

    // ── Step 4: Build Word document ───────────────────────────────────────────
    console.log('[Step 4] Building Word report...')
    const reportId    = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    const generatedAt = new Date().toISOString()
    const costData    = serializeCost(cost)
    const progData    = serializeProgramme(programme)
    const budget      = senseCheck?.budget || { status: 'none' }

    let docxBuffer, templateError
    try {
      docxBuffer = await buildReport({ answers, cost, programme, aiProse, budget })
    } catch (e) {
      console.error('[Step 4 error]', e.message)
      capturePipelineError(e, 'reportBuilder', answers)
      templateError = e.message
    }

    // ── Save to KV (best-effort — failure never blocks the response) ──────────
    const kvPayload = {
      reportId,
      projectName: answers.q1_0_projectName,
      cost:        costData,
      programme:   progData,
      budget,
      aiProse,
      answers,                                   // included so shared links work without localStorage
      generatedAt,
      ...(docxBuffer   && { docx: docxBuffer.toString('base64') }),
      ...(templateError && { templateError }),
    }
    // Await the write: on a serverless platform the function may be frozen the
    // instant the response is returned, so an un-awaited write can be dropped —
    // breaking shared /report/<id> links. saveReport swallows its own errors.
    await saveReport(reportId, kvPayload)

    return Response.json({
      success: true,
      reportId,
      projectName: answers.q1_0_projectName,
      cost:        costData,
      programme:   progData,
      budget,
      aiProse,
      generatedAt,
      ...(docxBuffer   && { docx: docxBuffer.toString('base64') }),
      ...(templateError && { templateError }),
    })

  } catch (error) {
    console.error('[generate-report]', error)
    Sentry.captureException(error, { tags: { pipeline_step: 'handler' } })
    return Response.json({ error: 'Report generation failed', detail: error.message }, { status: 500 })
  }
}

// ─── AI prose call ────────────────────────────────────────────────────────────
// PROSE_MODEL, PROSE_TOOL, AI_SYSTEM_PROMPT and getAnthropicKey live in
// lib/proseSchema.js so the warm-up route (/api/warm-prose) can compile the
// exact same strict schema into the shared 24h schema cache.

async function callClaudeForProse(answers, cost, programme, senseCheck, deadline) {
  const confidence = computeConfidence(answers, cost, senseCheck)
  const basePrompt = buildProsePrompt(answers, cost, programme, senseCheck, confidence)

  // One retry with the validation error fed back, bounded by `deadline` — an
  // absolute timestamp the caller sets from the request clock so it already
  // reserves the 60 s Vercel Hobby ceiling minus the deterministic steps
  // (which ran before this) and the docx build + KV write (which run after).
  // The first attempt is capped so a second can fire if the first fails fast;
  // with the strict schema kept warm (see /api/warm-prose) and a lean
  // max_tokens, a full report runs ~20–30 s on Haiku.
  const FIRST_ATTEMPT_MS = 35_000
  const MIN_ATTEMPT_MS = 8_000
  let lastErr
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now()
    if (remaining < MIN_ATTEMPT_MS) break
    const budget = attempt === 0 ? Math.min(FIRST_ATTEMPT_MS, remaining) : remaining
    const prompt = attempt === 0
      ? basePrompt
      : `${basePrompt}\n\nYOUR PREVIOUS ATTEMPT FAILED VALIDATION: ${lastErr.message}\nCall the tool again with the complete, corrected payload.`
    try {
      const prose = await requestProse(prompt, budget)
      validateProse(prose)
      ensureSeedRisks(prose, answers)
      prose.confidenceScore = confidence.score
      prose.confidenceLabel = confidence.label
      return prose
    } catch (e) {
      lastErr = e
      console.warn(`[Step 3] Prose attempt ${attempt + 1} failed: ${e.message}`)
    }
  }
  throw lastErr
}

// Single API round-trip: forced tool call, schema-validated by the API.
// Streamed (stream: true) so the AbortController is a true wall-clock guard and
// a slow/idle connection can't silently consume the whole budget with no
// progress — the documented practice for high-max_tokens calls. The forced
// tool's arguments arrive as input_json_delta fragments which we concatenate
// and JSON.parse once the stream ends.
async function requestProse(prompt, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': getAnthropicKey(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: PROSE_MODEL,
        max_tokens: 3500,
        temperature: 0.3,
        stream: true,
        system: AI_SYSTEM_PROMPT,
        tools: [PROSE_TOOL],
        tool_choice: { type: 'tool', name: 'submit_report_prose', disable_parallel_tool_use: true },
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`Claude API ${res.status}: ${JSON.stringify(err)}`)
    }
    const { toolJson, stopReason } = await readToolUseStream(res.body)
    if (!toolJson) {
      throw new Error(`Claude returned no ${PROSE_TOOL.name} tool call (stop_reason: ${stopReason})`)
    }
    let input
    try {
      input = JSON.parse(toolJson)
    } catch {
      throw new Error('Claude tool arguments were not valid JSON (response likely truncated)')
    }
    return input
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`Claude API timed out after ${Math.round(timeoutMs / 1000)}s`)
    throw e
  } finally {
    clearTimeout(timeout)
  }
}

// Parse the Anthropic SSE stream and reassemble the forced tool_use arguments.
// We only care about the single tool_use block's input_json_delta fragments and
// the final stop_reason; everything else is ignored.
async function readToolUseStream(body) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let toolJson = ''
  let stopReason = null
  let sawToolUse = false

  const handleData = (json) => {
    let evt
    try { evt = JSON.parse(json) } catch { return }
    if (evt.type === 'content_block_start' && evt.content_block?.type === 'tool_use') {
      sawToolUse = true
    } else if (evt.type === 'content_block_delta' && evt.delta?.type === 'input_json_delta') {
      toolJson += evt.delta.partial_json || ''
    } else if (evt.type === 'message_delta' && evt.delta?.stop_reason) {
      stopReason = evt.delta.stop_reason
    } else if (evt.type === 'error') {
      throw new Error(`Claude API stream error: ${JSON.stringify(evt.error || evt)}`)
    }
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    // SSE frames are separated by a blank line; each frame may carry a data: line.
    let sep
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      for (const line of frame.split('\n')) {
        const trimmed = line.trimStart()
        if (trimmed.startsWith('data:')) handleData(trimmed.slice(5).trim())
      }
    }
  }
  // An empty tool_use block with no deltas should still surface as "no tool call".
  if (!sawToolUse) toolJson = ''
  return { toolJson, stopReason }
}

// Structural safety net behind the API-side schema validation — kept so a
// degenerate-but-schema-valid payload (e.g. empty risk register) still
// triggers the retry rather than producing a hollow report.
function validateProse(prose) {
  if (!prose || typeof prose !== 'object')
    throw new Error('Claude prose payload is not an object')
  if (typeof prose.executiveSummary !== 'string' || !prose.executiveSummary.trim())
    throw new Error('executiveSummary is empty')
  if (!Array.isArray(prose.riskRegister) || prose.riskRegister.length === 0)
    throw new Error('riskRegister is empty — provide 5 to 8 risks')
  if (!Array.isArray(prose.nextSteps) || prose.nextSteps.length === 0)
    throw new Error('nextSteps is empty')
}

// ─── Deterministic confidence grade ──────────────────────────────────────────
// The most important calibration signal in the report is computed from the
// answers and sense check, not chosen by the model. The AI only writes the
// sentence that states it.
function computeConfidence(answers, cost, senseCheck) {
  let deficiencies = 0
  const reasons = []

  const surveys = Array.isArray(answers.q3_3_surveys)
    ? answers.q3_3_surveys
    : (answers.q3_3_surveys ? [answers.q3_3_surveys] : [])
  if (surveys.length === 0 || surveys.includes('None') || surveys.includes('None yet')) {
    deficiencies += 1
    reasons.push('no surveys commissioned yet')
  }
  if ((answers.q3_1_knownIssues || []).some(i => String(i).toLowerCase().includes('unsure'))) {
    deficiencies += 1
    reasons.push('building condition unknown (surveys needed)')
  }
  const planning = String(Array.isArray(answers.q3_4_planningConsents)
    ? answers.q3_4_planningConsents.join(' ')
    : answers.q3_4_planningConsents || '')
  if (planning.toLowerCase().includes('unsure')) {
    deficiencies += 1
    reasons.push('planning route not yet established')
  }
  const sevs = (senseCheck?.warnings || []).map(w => w.severity)
  if (sevs.includes('high')) {
    deficiencies += 2
    reasons.push('automated sense check raised a high-severity warning')
  } else if (sevs.includes('medium')) {
    deficiencies += 1
    reasons.push('automated sense check raised warnings')
  }
  if ((cost.excludedNoQuantity || []).length > 0) {
    deficiencies += 1
    reasons.push('selected scope items excluded pending quantities')
  }
  if (cost.additionalScopeNote) {
    deficiencies += 1
    reasons.push('specialist scope noted but not priced')
  }

  const score = deficiencies === 0 ? 'A' : deficiencies === 1 ? 'B' : deficiencies <= 3 ? 'C' : 'D'
  const labels = { A: 'High Confidence', B: 'Moderate Confidence', C: 'Limited Confidence', D: 'High Uncertainty' }
  return { score, label: labels[score], reasons }
}

// Absolute seed guarantee: any required access-constraint seed the model
// dropped is appended deterministically from ACCESS_RISK_SEEDS (the full
// wording lives in code, so no information is lost by repairing here).
function ensureSeedRisks(prose, answers) {
  const ac = (answers.q3_5_accessConstraints || []).map(a => a.toLowerCase())
  if (ac.some(a => a.includes('no access constraints') || a.includes('none'))) return
  const required = ACCESS_RISK_SEEDS.filter(s => ac.some(a => a.includes(s.trigger)))
  if (required.length === 0) return
  const present = new Set((prose.riskRegister || []).map(r => r.seedRef).filter(ref => ref && ref !== 'NONE'))
  for (const seed of required) {
    if (present.has(seed.ref)) continue
    console.warn(`[Step 3] Seed ${seed.ref} missing from riskRegister — appended deterministically`)
    prose.riskRegister.push({
      ref: `R${String(prose.riskRegister.length + 1).padStart(2, '0')}`,
      category: seed.category,
      description: seed.description,
      likelihood: seed.likelihood,
      impact: seed.impact,
      rating: seed.rating,
      mitigation: seed.mitigation,
      seedRef: seed.ref,
    })
  }
}

// Q3.5 access constraint → deterministic risk seed
const ACCESS_RISK_SEEDS = [
  {
    trigger: 'no vehicle access',
    ref: 'ACC-A',
    category: 'Technical',
    description: 'Materials, plant handling and waste removal constrained; productivity loss and double-handling due to no vehicle access.',
    likelihood: 'Medium', impact: 'High', rating: 'High',
    mitigation: 'Confirm offload and storage strategy; craneage or hoist plan; logistics method statement required at tender.',
  },
  {
    trigger: 'term-time',
    ref: 'ACC-B',
    category: 'Programme',
    description: 'Works confined to vacation windows; programme spans multiple academic terms; risk of overrun into term time.',
    likelihood: 'High', impact: 'High', rating: 'High',
    mitigation: 'Phase works to vacation windows; agree blackout dates with faculty; build programme float; consider out-of-hours working.',
  },
  {
    trigger: 'scaffold licence',
    ref: 'ACC-C',
    category: 'Regulatory',
    description: 'Highway or public-realm scaffold licence lead time and conditions; possible refusal or delay by local authority.',
    likelihood: 'Medium', impact: 'Medium', rating: 'Medium',
    mitigation: 'Apply for licence early; confirm pavement/road licence period and inspection regime with the authority before tender.',
  },
  {
    trigger: 'restricted working',
    ref: 'ACC-D',
    category: 'Programme',
    description: 'Restricted working hours extend construction duration and may attract premium or out-of-hours rates.',
    likelihood: 'Medium', impact: 'Medium', rating: 'Medium',
    mitigation: 'Confirm permitted hours with the client; price out-of-hours working where programme-critical; reflect in Prelims.',
  },
  {
    trigger: 'shared access',
    ref: 'ACC-E',
    category: 'Programme',
    description: 'Coordination required with other occupiers; risk of access disputes and need to protect shared circulation routes.',
    likelihood: 'Medium', impact: 'Medium', rating: 'Medium',
    mitigation: 'Agree access protocol, signage, and routes/times with neighbouring occupiers before works commence.',
  },
  {
    trigger: 'height',
    ref: 'ACC-F',
    category: 'Technical',
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
    `- Ref: ${s.ref} | Category: ${s.category} | ${s.description} | L: ${s.likelihood} | I: ${s.impact} | RAG: ${s.rating} | Mitigation: ${s.mitigation}`
  ).join('\n')
  return `\nDETERMINISTIC RISK SEEDS — include ALL of these in riskRegister exactly as seeded (do not alter L/I/Rating; set the entry's seedRef to the given Ref):\n${lines}\n`
}

function buildProsePrompt(answers, cost, programme, senseCheck, confidence) {
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

  // Ground-truth quantities for every priced element. The AI uses these (and only
  // these) when it describes "how many" of anything — it must never guess a count.
  const scopeLineBlock = (cost.lineItems || [])
    .filter(li => li.code !== 'PS')
    .map(li => `- ${li.description}: quantity ${li.qty} ${li.unit}`)
    .join('\n') || '- (no priced line items)'

  // Items the user selected but which carry no quantity, so they were not costed.
  // The AI must note these in the scope assumptions so they are not lost.
  const excludedBlock = (cost.excludedNoQuantity || []).length
    ? `\nSELECTED BUT NOT COSTED (no quantity was provided — state in scopeAssumptions that each was selected but excluded from the estimate pending a confirmed quantity; do NOT invent a count):\n` +
      cost.excludedNoQuantity.map(e => `- ${e.description}`).join('\n') + '\n'
    : ''

  return `Generate prose sections for a RIBA Stage 1 Feasibility Report by calling the submit_report_prose tool.

CONFIDENCE GRADE (pre-computed deterministically — do NOT choose your own): Grade ${confidence.score} (${confidence.label})${confidence.reasons.length ? ` — drivers: ${confidence.reasons.join('; ')}` : ''}. State this grade in the executive summary.

PROJECT CONTEXT:
Name: ${answers.q1_0_projectName}
Type: ${answers.q1_2_projectType} | Postcode: ${answers.q1_1_postcode} | GIFA: ${answers.q1_5_size} m²
Building use: ${answers.q1_3_buildingUse || 'Not stated'}${answers.q1_3_buildingUse === 'Other' && answers.q1_3_buildingUseOther ? ` (${answers.q1_3_buildingUseOther})` : ''} | Age: ${answers.q1_4_buildingAge || (answers.q1_2_projectType === 'New Build' ? 'N/A (new build)' : 'Not stated')}${answers.q1_2_storeys ? ` | Storeys: ${answers.q1_2_storeys}` : ''}
Specification level: ${cost.specLevel} | Level of intervention: ${cost.interventionLevel}
Objective: ${answers.q2_1_objective || 'Not stated'}
Scope items: ${(answers.q2_2_scopeItems || []).join(', ') || 'None specified'}

PRICED SCOPE LINE ITEMS (the exact quantities being costed — use these and ONLY these when describing how many of anything there is; do NOT quote the rates or line totals, those live in the table):
${scopeLineBlock}
${excludedBlock}Specialist / additional scope notes: ${typeof answers.q2_2_additionalScope === 'object' ? (answers.q2_2_additionalScope?.text || 'None') : (answers.q2_2_additionalScope || 'None')}
Standards and compliance requirements: ${answers.q2_5_standards || 'None stated'}
Known issues: ${(answers.q3_1_knownIssues || []).join(', ') || 'None identified'}
Previous works and building history: ${answers.q3_2_recentWorks || answers.q3_2_previousWorks || 'Not stated'}
Surveys: ${Array.isArray(answers.q3_3_surveys) ? answers.q3_3_surveys.join(', ') : (answers.q3_3_surveys || 'Not stated')}${answers.q3_3_surveysOther ? ` (other: ${answers.q3_3_surveysOther})` : ''} | Planning: ${answers.q3_4_planningConsents || 'Not stated'}
Access constraints: ${(answers.q3_5_accessConstraints || []).join(', ') || 'None'}${answers.q3_5_accessConstraintsOther ? ` (other: ${answers.q3_5_accessConstraintsOther})` : ''}
Occupation during works: ${answers.q3_6_occupation || 'Not stated'}
Additional context: ${answers.q3_7_additionalContext || 'None'}
Target date: ${answers.q4_1_targetDate || 'None specified'} | Budget (incl. fees & VAT): ${answers.q4_3_budget ? f(answers.q4_3_budget) : 'Not stated'}
Client priorities (what matters most): ${(answers.q4_4_priorities || []).join(', ') || 'Not stated'}
Funding source: ${answers.q4_7_funding || 'Not stated'}${answers.q4_7_funding === 'Other' && answers.q4_7_fundingOther ? ` (${answers.q4_7_fundingOther})` : ''}
Delivery: ${answers.q4_6_phasing || 'Single phase'}
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
${senseCheck?.budget && senseCheck.budget.status !== 'none'
  ? `BUDGET CHECK (pre-computed — do NOT recompute): ${senseCheck.budget.note}`
  : 'BUDGET CHECK: No budget figure was provided.'}

PRE-CALCULATED PROGRAMME DATA (do not change any of these figures):
Total weeks: ${programme.totalWeeks}
Surveys: ${programme.surveyWeeks} wks | Design: ${programme.designWeeks} wks | Tender: ${programme.tenderWeeks} wks
Construction: ${programme.constructionWeeks} wks | Handover: ${programme.handoverWeeks} wks
Procurement route: ${programme.procurementRoute}${programme.procurementNote ? ` — ${programme.procurementNote}` : ''}
Target status: ${programme.targetStatus} | ${programme.targetNote}${programme.programmeStartNote ? `\nProgramme start point: ${programme.programmeStartNote}` : ''}${programme.phasingNote ? `\nPhasing: ${programme.phasingNote}` : ''}
${buildAccessRiskSeeds(answers.q3_5_accessConstraints)}${answers.q6_2_instructions || answers.q6_2_reportInstructions ? `\nCUSTOM INSTRUCTIONS FROM CLIENT (apply these to your prose writing — tone, emphasis, audience focus):\n${answers.q6_2_instructions || answers.q6_2_reportInstructions}` : ''}
${senseCheck?.hasWarnings
  ? `\nSENSE CHECK WARNINGS (automatically detected — respond to these in your prose):\n` +
    senseCheck.warnings.map(w =>
      `[${w.severity.toUpperCase()} / ${w.code}] ${w.message}`
    ).join('\n') +
    `\n\nInstructions for warnings:\n- HIGH warnings: flag prominently in the Executive Summary (the pre-computed confidence grade already reflects them).\n- MEDIUM warnings: include as a cost or programme risk entry in riskRegister with a verification recommendation.\n- LOW warnings: mention briefly in the costNarrative or procurementNarrative as a programme note.\n`
  : `\nSENSE CHECK: All automated checks passed — no anomalies detected.\n`
}
Populate the tool arguments following this field guidance:
{
  "executiveSummary": "3 to 4 sentences. State project name, type, location, GIFA, objective. Quote total cost as ${f1k(cost.total.low)} to ${f1k(cost.total.high)} (excluding VAT). State the pre-computed confidence grade and target date status. Name the top risk in one phrase.",
  "keyFindings": [
    "One sentence. Start with the single most important cost or programme finding.",
    "One sentence. State whether the target date is achievable or not, with reason.",
    ${senseCheck?.budget && senseCheck.budget.status !== 'none'
      ? `"One sentence. State whether the stated budget is sufficient against the estimate, using the BUDGET CHECK verdict (${senseCheck.budget.status}) and citing the pre-computed margin or shortfall — do NOT recompute it.",`
      : ''}
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
      "mitigation": "One sentence specific mitigation action.",
      "seedRef": "The seed's Ref code (e.g. ACC-B) for entries from DETERMINISTIC RISK SEEDS; NONE for all other risks."
    }
  ],
  "scopeAssumptions": [
    "Assumption 1 — one sentence. Ground it in the provided inputs; where you cite a quantity, use the exact figure from PRICED SCOPE LINE ITEMS.",
    "Assumption 2 — one sentence. Do not state that any scoped item is already complete, recently replaced, or unnecessary, and do not invent dates or prior works.",
    "Assumption 3 — one sentence."
  ],
  "costNarrative": "1 to 2 sentences. Describe the main cost drivers for this project. Do not quote any number — the numbers are in the table.",
  "roiNarrative": "${isROI ? `Write 2 sentences. Use these pre-calculated figures verbatim — do NOT recompute: project cost mid-point ${f1k(roiMid)}, annual benefit ${f(roiAnnual)}, simple payback ${roiPayback} years. State the simple payback, then identify the key financial risk.` : ''}",
  "procurementRoute": "Name of recommended procurement route (match programme.procurementRoute)",
  "procurementContractForm": "Recommended contract form, e.g. JCT Minor Works 2024, JCT Standard Building Contract 2024",
  "procurementDesignResp": "Who holds design responsibility: Client design team or Contractor",
  "procurementTenderType": "Single stage | Two stage | Direct award",
  "procurementNarrative": "2 sentences. Explain why this route suits this project's type, value and programme, AND how it serves the client's stated priorities (${(answers.q4_4_priorities || []).join(', ') || 'not stated'}).",
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
    // Estimate Basis data — keeps the HTML report's basis section in step
    // with the docx builder, which receives the full cost object.
    excludedNoQuantity: cost.excludedNoQuantity,
    additionalScopeNote: cost.additionalScopeNote,
    workbookVersion: cost.workbookVersion,
    bcisDefaulted: cost.bcisDefaulted,
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
    workbookVersion:     programme.workbookVersion,
    phasingNote:         programme.phasingNote,
    programmeStartNote:  programme.programmeStartNote,
  }
}
