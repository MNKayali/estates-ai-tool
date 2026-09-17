/**
 * lib/prose.js
 *
 * Everything to do with the AI prose call, extracted from
 * app/api/generate-report/route.js so it can be driven two ways:
 *
 *   - app/api/reports/[id]/prose/route.js calls PROSE_HALVES entries one at a
 *     time, each bounded by that request's own fresh 60s deadline (Phase 2).
 *   - generate-report's dev fallback (no KV configured) calls
 *     runProseSequential() to reproduce the old single-invocation behaviour.
 *
 * The AI never calculates a number — every figure here comes from the
 * deterministic cost/programme objects passed in.
 */
import { PROSE_MODEL, PROSE_TOOL_NARRATIVE, PROSE_TOOL_RISK, AI_SYSTEM_PROMPT, getAnthropicKey } from '@/lib/proseSchema'

// The shape of a submission that is safe to send to a third-party processor:
// enough to reproduce a pipeline crash, with nothing that identifies the project
// or the client. Everything here is a category, a code or a bucket.
//
// Deliberately EXCLUDED, because the full `answers` object used to be attached
// verbatim: project name, postcode, stated budget, target date, and the three
// free-text fields (objective, additional context, custom report instructions).
// Postcode plus project name for a named UK institution is readily
// re-identifiable, and the free-text fields are wherever a colleague will paste
// something confidential. An allowlist is used rather than a denylist so a new
// question added to the questionnaire is private by default.
//
// Shared between generate-report (Phase 1 errors) and the prose route
// (Phase 2 errors) so both scrub the same way before anything reaches Sentry.
export function scrubAnswers(answers = {}) {
  const arr = v => (Array.isArray(v) ? v : v ? [v] : [])
  const gifa = Number(answers.q1_5_size)
  return {
    projectType:       answers.q1_2_projectType,
    storeys:           answers.q1_2_storeys,
    buildingUse:       answers.q1_3_buildingUse,
    buildingAge:       answers.q1_4_buildingAge,
    // Bucketed, not exact: the precise GIFA is a fingerprint, the band is not.
    gifaBand:          !Number.isFinite(gifa) ? 'invalid'
                        : gifa <= 150 ? '<=150' : gifa <= 500 ? '<=500'
                        : gifa <= 1500 ? '<=1500' : gifa <= 3000 ? '<=3000' : '>3000',
    gifaValid:         Number.isFinite(gifa) && gifa > 0,
    interventionLevel: answers.q2_3_interventionLevel,
    specLevel:         answers.q2_4_specLevel,
    scopeItemCount:    arr(answers.q2_2_scopeItems).length,
    scopeItems:        arr(answers.q2_2_scopeItems),   // element codes, not prose
    standards:         arr(answers.q2_5_standards),
    knownIssues:       arr(answers.q3_1_knownIssues),
    surveys:           arr(answers.q3_3_surveys),
    accessConstraints: arr(answers.q3_5_accessConstraints),
    occupation:        answers.q3_6_occupation,
    designStage:       answers.q4_5_designStage,
    phasing:           answers.q4_6_phasing,
    funding:           answers.q4_7_funding,
    hasBudget:         !!answers.q4_3_budget,
    hasTargetDate:     !!answers.q4_1_targetDate,
    financialBenefit:  arr(answers.q5_1_financialBenefit),
  }
}

export const PROSE_ORDER = ['narrative', 'risk']

// Per-half minimum viable attempt window, from measured p50s. Below this there
// is no point starting the call — it would just be cancelled part-way and cost
// a wasted attempt. Replaces the old flat MIN_ATTEMPT_MS now that each half is
// checked against its own fresh deadline rather than a shared reserve.
export const PROSE_HALVES = {
  narrative: { tool: PROSE_TOOL_NARRATIVE, maxTokens: 2000, minAttemptMs: 14_000, validate: validateNarrative },
  risk:      { tool: PROSE_TOOL_RISK,      maxTokens: 2200, minAttemptMs: 20_000, validate: validateRiskProcurement },
}

const MAX_ATTEMPTS = 3
// Pause before a retry, multiplied by the attempt number. A dropped connection
// ("fetch failed", "terminated") comes back instantly, so without this the
// retries burn through in a few hundred milliseconds and all hit the same bad
// moment. A short, growing pause costs nothing against the budget and lets a
// transient reset clear.
const RETRY_BACKOFF_MS = 1_500

// One half, retried up to MAX_ATTEMPTS with the previous failure fed back.
// Bounded by `deadline` — an absolute timestamp the caller sets. Each attempt
// re-checks the remaining budget against the half's own minAttemptMs, so this
// naturally stops rather than needing a separate reserve/cap scheme: whichever
// half runs out of runway simply isn't attempted, and the caller's next
// invocation (with a fresh deadline) picks it up.
export async function requestProseHalf(half, prompt, deadline) {
  const { tool, maxTokens, minAttemptMs, validate } = PROSE_HALVES[half]
  let lastErr
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const budget = deadline - Date.now()
    if (budget < minAttemptMs) break
    const attemptPrompt = attempt === 0
      ? prompt
      : `${prompt}\n\nYOUR PREVIOUS ATTEMPT FAILED VALIDATION: ${lastErr.message}\nCall the tool again with the complete, corrected payload.`
    const startedAt = Date.now()
    try {
      const out = await requestProse(attemptPrompt, budget, tool, maxTokens)
      validate(out)
      console.log(`[prose] ${half} ok in ${Date.now() - startedAt}ms (attempt ${attempt + 1}, budget ${budget}ms)`)
      return out
    } catch (e) {
      lastErr = e
      console.warn(`[prose] ${half} attempt ${attempt + 1} failed: ${e.message}`)
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS * (attempt + 1)))
      }
    }
  }
  throw lastErr || new Error(`${half}: insufficient time budget remaining (${Math.max(0, deadline - Date.now())}ms left, needs ${minAttemptMs}ms)`)
}

// Single API round-trip: forced tool call, schema-validated by the API.
// Streamed (stream: true) so the AbortController is a true wall-clock guard and
// a slow/idle connection can't silently consume the whole budget with no
// progress. The forced tool's arguments arrive as input_json_delta fragments
// which we concatenate and JSON.parse once the stream ends.
async function requestProse(prompt, timeoutMs, tool, maxTokens) {
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
        max_tokens: maxTokens,
        temperature: 0.3,
        stream: true,
        system: AI_SYSTEM_PROMPT,
        tools: [tool],
        tool_choice: { type: 'tool', name: tool.name, disable_parallel_tool_use: true },
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
      throw new Error(`Claude returned no ${tool.name} tool call (stop_reason: ${stopReason})`)
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
// triggers the retry rather than producing a hollow report. One validator per
// half, so a retry only ever re-runs the call that actually came back thin.
function validateNarrative(prose) {
  if (!prose || typeof prose !== 'object')
    throw new Error('Claude narrative payload is not an object')
  if (typeof prose.executiveSummary !== 'string' || !prose.executiveSummary.trim())
    throw new Error('executiveSummary is empty')
  if (!Array.isArray(prose.keyFindings) || prose.keyFindings.length === 0)
    throw new Error('keyFindings is empty')
  if (!Array.isArray(prose.nextSteps) || prose.nextSteps.length === 0)
    throw new Error('nextSteps is empty')
}

function validateRiskProcurement(prose) {
  if (!prose || typeof prose !== 'object')
    throw new Error('Claude risk/procurement payload is not an object')
  if (!Array.isArray(prose.riskRegister) || prose.riskRegister.length === 0)
    throw new Error('riskRegister is empty — provide 5 to 8 risks')
  if (typeof prose.procurementRoute !== 'string' || !prose.procurementRoute.trim())
    throw new Error('procurementRoute is empty')
}

// ─── Deterministic confidence grade ──────────────────────────────────────────
// The most important calibration signal in the report is computed from the
// answers and sense check, not chosen by the model. The AI only writes the
// sentence that states it. `senseCheck` here only needs to carry
// `clientWarnings` — see the small projection stored on the KV record by
// generate-report and reused by the prose route (lib/kv.js's getReport()).
export function computeConfidence(answers, cost, senseCheck) {
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
  // Client-facing warnings only: the grade measures how much is unknown about
  // the client's project, so a defect in our own workbook must not downgrade it
  // (nor add "automated sense check raised warnings" to the stated reasons).
  const sevs = (senseCheck?.clientWarnings || []).map(w => w.severity)
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

// Absolute seed guarantee: any required deterministic seed the model dropped
// is appended deterministically from buildDeterministicSeeds() (the full
// wording lives in code, so no information is lost by repairing here).
// `cost` and `senseCheck` are optional so existing access-only call sites and
// tests keep working — omitting them just means only the access-constraint
// seeds are considered, as before.
export function ensureSeedRisks(prose, answers, cost, senseCheck) {
  const required = buildDeterministicSeeds(answers, cost, senseCheck)
  if (required.length === 0) return
  const present = new Set((prose.riskRegister || []).map(r => r.seedRef).filter(ref => ref && ref !== 'NONE'))
  for (const seed of required) {
    if (present.has(seed.ref)) continue
    console.warn(`[prose] Seed ${seed.ref} missing from riskRegister — appended deterministically`)
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

// Severity (as already computed by senseCheck.js) drives L/I/Rating uniformly,
// so a warning's risk-register weight always matches how seriously senseCheck
// itself treated it — no separate judgement call duplicated here.
const SEVERITY_TO_LIR = {
  high:   { likelihood: 'High',   impact: 'High',   rating: 'High' },
  medium: { likelihood: 'Medium', impact: 'Medium', rating: 'Medium' },
  low:    { likelihood: 'Low',    impact: 'Low',     rating: 'Low' },
}

// clientWarnings code → fixed risk-register category + mitigation. Ratings
// come from the warning's own severity (SEVERITY_TO_LIR), not chosen here.
const WARNING_SEED_META = {
  COST_LOW:          { ref: 'WARN-COST_LOW',        category: 'Cost',      mitigation: 'Re-check that every applicable scope item has been selected and priced before relying on this estimate for budget approval.' },
  COST_HIGH:         { ref: 'WARN-COST_HIGH',        category: 'Cost',      mitigation: 'Verify scope for double-counting; confirm the high rate is explained by project-specific factors (e.g. a small, high-density space) before relying on the figure.' },
  BUDGET_SHORTFALL:  { ref: 'WARN-BUDGET_SHORTFALL', category: 'Cost',      mitigation: 'Revisit scope, specification, or the stated budget with the client before proceeding to Stage 2.' },
  PROG_SHORT:        { ref: 'WARN-PROG_SHORT',       category: 'Programme', mitigation: 'Confirm no survey, design, or procurement period has been omitted; extend the programme accordingly before it is relied upon.' },
  PROG_LONG:         { ref: 'WARN-PROG_LONG',        category: 'Programme', mitigation: 'Confirm the extended programme is intentional (e.g. phased or complex delivery) and acceptable to the client.' },
}

// Every deterministic risk seed this report can generate, from every source —
// Q3.5 access constraints, excluded (unpriced) scope items, clientWarnings
// codes, and surveys not yet commissioned. Extends the original access-only
// seeding (IBRB brief item 9): "any item in excludedNoQuantity", "any
// clientWarnings code", and "any Q3.3 survey listed as required but
// unavailable" must each become a seed whose category and rating are fixed in
// code, not left to the model — which is exactly why identical inputs used to
// produce differently-composed, differently-rated risk registers.
function buildDeterministicSeeds(answers, cost, senseCheck) {
  const seeds = []

  const ac = (answers.q3_5_accessConstraints || []).map(a => String(a).toLowerCase())
  if (!ac.some(a => a.includes('no access constraints') || a.includes('none'))) {
    seeds.push(...ACCESS_RISK_SEEDS.filter(s => ac.some(a => a.includes(s.trigger))))
  }

  const excluded = cost?.excludedNoQuantity || []
  if (excluded.length > 0) {
    seeds.push({
      ref: 'EXC-COST',
      category: 'Cost',
      description: `Selected but unpriced scope: ${excluded.map(e => e.description).join(', ')} — excluded from the estimate pending a confirmed quantity, rate, or code match, so the true cost is understated by an unknown amount.`,
      likelihood: 'High', impact: 'High', rating: 'High',
      mitigation: 'Confirm quantities/details for each excluded item at Stage 2 and re-run the estimate before relying on the total for budget approval.',
    })
  }

  for (const w of senseCheck?.clientWarnings || []) {
    const meta = WARNING_SEED_META[w.code]
    if (!meta) continue
    const lir = SEVERITY_TO_LIR[w.severity] || SEVERITY_TO_LIR.medium
    seeds.push({
      ref: meta.ref,
      category: meta.category,
      description: w.message,
      ...lir,
      mitigation: meta.mitigation,
    })
  }

  const surveys = Array.isArray(answers.q3_3_surveys) ? answers.q3_3_surveys : (answers.q3_3_surveys ? [answers.q3_3_surveys] : [])
  if (surveys.length === 0 || surveys.includes('None') || surveys.includes('None yet')) {
    seeds.push({
      ref: 'SURV-MISSING',
      category: 'Technical',
      description: 'No condition, structural, or other surveys have yet been commissioned — building condition and any latent defects remain unconfirmed.',
      likelihood: 'Medium', impact: 'High', rating: 'High',
      mitigation: 'Commission the surveys identified as required before Stage 2 design proceeds; treat all condition-dependent figures as provisional until they report.',
    })
  }

  return seeds
}

function buildDeterministicSeedsBlock(answers, cost, senseCheck) {
  const seeds = buildDeterministicSeeds(answers, cost, senseCheck)
  if (seeds.length === 0) return ''
  const lines = seeds.map(s =>
    `- Ref: ${s.ref} | Category: ${s.category} | ${s.description} | L: ${s.likelihood} | I: ${s.impact} | RAG: ${s.rating} | Mitigation: ${s.mitigation}`
  ).join('\n')
  return `\nDETERMINISTIC RISK SEEDS — include ALL of these in riskRegister exactly as seeded (do not alter L/I/Rating; set the entry's seedRef to the given Ref):\n${lines}\n`
}

// Builds both half-prompts. Everything above the field guidance is byte-identical
// between the two, so the halves share a cacheable prefix and — more importantly —
// see exactly the same facts, which is what keeps the two outputs consistent
// without either waiting on the other.
export function buildProsePrompts(answers, cost, programme, senseCheck, confidence) {
  const f1k = n => `£${(Math.round((n || 0) / 1000) * 1000).toLocaleString('en-GB')}`
  const f = n => `£${Math.round(n || 0).toLocaleString('en-GB')}`

  const q5_1 = Array.isArray(answers.q5_1_financialBenefit)
    ? answers.q5_1_financialBenefit.join(' | ')
    : (answers.q5_1_financialBenefit || '')
  const isROI = q5_1 && !q5_1.includes('No direct') && answers.q5_2_annualBenefit

  // Deterministic authority for term-time wording (item 6 of the IBRB brief):
  // Q3.7 is free text the AI interprets, and each prose half used to reach its
  // own (sometimes contradictory) conclusion about whether works fall inside
  // or outside term-time from the same ambiguous wording. Q3.5's checkbox is
  // the one structured, unambiguous signal for this, so it — not the free
  // text — is what both halves are told to treat as authoritative.
  const isTermTimeOnly = (answers.q3_5_accessConstraints || []).some(a =>
    String(a).toLowerCase().includes('term-time'))

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

  const context = `Generate prose sections for a RIBA Stage 1 Feasibility Report by calling the tool you have been given.

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
Term-time restriction (authoritative — see system rule on term-time wording): ${isTermTimeOnly ? 'Yes — works are confined to vacation/holiday windows only.' : 'No — works are NOT confined to term-time. Do not describe the works as scheduled "during term-time" anywhere in the report, regardless of how the additional context below reads.'}
Occupation during works: ${answers.q3_6_occupation || 'Not stated'}
Additional context (supplementary detail only — must not contradict the authoritative term-time line above): ${answers.q3_7_additionalContext || 'None'}
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
${buildDeterministicSeedsBlock(answers, cost, senseCheck)}${answers.q6_2_instructions || answers.q6_2_reportInstructions ? `\nCUSTOM INSTRUCTIONS FROM CLIENT (apply these to your prose writing — tone, emphasis, audience focus):\n${answers.q6_2_instructions || answers.q6_2_reportInstructions}` : ''}
${senseCheck?.hasClientWarnings
  ? `\nSENSE CHECK WARNINGS (automatically detected — respond to these in your prose):\n` +
    senseCheck.clientWarnings.map(w =>
      `[${w.severity.toUpperCase()} / ${w.code}] ${w.message}`
    ).join('\n') +
    `\n\nInstructions for warnings:\n- HIGH warnings: flag prominently in the Executive Summary (the pre-computed confidence grade already reflects them).\n- MEDIUM warnings: include as a cost or programme risk entry in riskRegister with a verification recommendation.\n- LOW warnings: mention briefly in the costNarrative or procurementNarrative as a programme note.\n`
  : `\nSENSE CHECK: All automated checks passed — no anomalies detected.\n`
}
`

  // ── Call A: narrative ──────────────────────────────────────────────────────
  // Where this half would otherwise need the other's output (the headline risk,
  // the procurement route) it is pointed at the deterministic source instead, so
  // the two calls agree without either one blocking on the other.
  const narrativeGuidance = `Populate the tool arguments following this field guidance:
{
  "executiveSummary": "3 to 4 sentences. State project name, type, location, GIFA, objective. Quote total cost as ${f1k(cost.total.low)} to ${f1k(cost.total.high)} (excluding VAT). State the pre-computed confidence grade and target date status. Name the single most material risk in one phrase, taken from the known issues, access constraints, DETERMINISTIC RISK SEEDS and SENSE CHECK WARNINGS above — do not introduce a risk that none of those support.",
  "keyFindings": [
    "One sentence. Start with the single most important cost or programme finding.",
    "One sentence. State whether the target date is achievable or not, with reason.",
    ${senseCheck?.budget && senseCheck.budget.status !== 'none'
      ? `"One sentence. State whether the stated budget is sufficient against the estimate, using the BUDGET CHECK verdict (${senseCheck.budget.status}) and citing the pre-computed margin or shortfall — do NOT recompute it.",`
      : ''}
    "One sentence. Name the most significant risk or survey gap.",
    "One sentence. State the recommended procurement route — use exactly '${programme.procurementRoute}' — and why it suits this project."
  ],
  "scopeAssumptions": [
    "Assumption 1 — one sentence. Ground it in the provided inputs; where you cite a quantity, use the exact figure from PRICED SCOPE LINE ITEMS.",
    "Assumption 2 — one sentence. Do not state that any scoped item is already complete, recently replaced, or unnecessary, and do not invent dates or prior works.",
    "Assumption 3 — one sentence."
  ],
  "costNarrative": "1 to 2 sentences. Describe the main cost drivers for this project. Do not quote any number — the numbers are in the table.",
  "roiNarrative": "${isROI ? `Write 2 sentences. Use these pre-calculated figures verbatim — do NOT recompute: project cost mid-point ${f1k(roiMid)}, annual benefit ${f(roiAnnual)}, simple payback ${roiPayback} years. State the simple payback, then identify the key financial risk.` : 'No ROI analysis applies to this project — return an empty string for this field and write nothing else in it.'}",
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

  // ── Call B: risk register + procurement ────────────────────────────────────
  const riskGuidance = `Populate the tool arguments following this field guidance:
{
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
  "procurementRoute": "Name of recommended procurement route — use exactly '${programme.procurementRoute}'",
  "procurementContractForm": "Name of recommended contract form — use exactly '${programme.contractForm}'",
  "procurementDesignResp": "Who holds design responsibility: Client design team or Contractor",
  "procurementTenderType": "Single stage | Two stage | Direct award",
  "procurementNarrative": "2 sentences. Explain why this route suits this project's type, value and programme, AND how it serves the client's stated priorities (${(answers.q4_4_priorities || []).join(', ') || 'not stated'}).",
  "procurementConsiderations": ["Commercial consideration 1", "Commercial consideration 2", "Commercial consideration 3"],
  "procurementConflicts": []
}`

  return {
    narrativePrompt: `${context}\n${narrativeGuidance}`,
    riskPrompt: `${context}\n${riskGuidance}`,
    isROI,
  }
}

// Merges the two completed halves into the single flat `aiProse` object that
// reportBuilder.js and ReportRenderer.jsx expect — unchanged from before the
// two-phase split. The schemas are disjoint so the merge is order-independent.
export function finaliseProse(parts, isROI, confidence, answers, cost, senseCheck) {
  const prose = Object.assign({}, parts.narrative, parts.risk)

  // Whether an ROI section exists is decided in code, not by the model. The
  // schema requires the key, so a non-ROI project asks for an empty string —
  // and a model that fills it anyway would put an ROI section in the report
  // that the deterministic data does not support. Blank it rather than trust it.
  if (!isROI) prose.roiNarrative = ''

  ensureSeedRisks(prose, answers, cost, senseCheck)
  prose.confidenceScore = confidence.score
  prose.confidenceLabel = confidence.label
  return prose
}

// Dev-only fallback used by generate-report when KV is not configured (so the
// two-phase split has no shared state channel to resume across requests).
// Reproduces the old single-invocation behaviour: both halves run one after
// the other inside this same request, bounded by one shared deadline.
export async function runProseSequential(answers, cost, programme, senseCheck, deadline) {
  const confidence = computeConfidence(answers, cost, senseCheck)
  const { narrativePrompt, riskPrompt, isROI } = buildProsePrompts(answers, cost, programme, senseCheck, confidence)
  const prompts = { narrative: narrativePrompt, risk: riskPrompt }
  const parts = {}
  for (const half of PROSE_ORDER) {
    parts[half] = await requestProseHalf(half, prompts[half], deadline)
  }
  return finaliseProse(parts, isROI, confidence, answers, cost, senseCheck)
}
