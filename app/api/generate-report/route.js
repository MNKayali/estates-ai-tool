/**
 * /api/generate-report
 *
 * Phase 1 of two. This route is now deterministic-only — no AI call — and
 * returns in a few seconds:
 *
 *   Steps 1–2 — lib/pipeline.js's runDeterministicPipeline(): cost, programme,
 *     cost again with the programme length, sense check and confidence, the
 *     procurement recommendation (lib/procurementCalculator.js), then the final
 *     programme (tender period from the recommendation) and cost passes. The
 *     order, and why, is in that file's header. No AI.
 *   Step 3 — write the record to KV with status 'deterministic' and return
 *
 * The AI prose lives in app/api/reports/[id]/prose/route.js (Phase 2), which
 * /report/[id] drives immediately after this returns. Splitting here is the
 * whole point: this phase is fast and never touches the network, so it cannot
 * time out, and the AI phase gets its own fresh 60s ceiling instead of sharing
 * this one — see CLAUDE.md "Why step 3 is two calls" for the history of why a
 * single shared budget for both AI halves was structurally unreliable.
 *
 * If KV is not configured (e.g. local dev with no store), there is no shared
 * state channel for a second request to resume from, so this route falls back
 * to running the AI prose and the docx build inline, exactly as the old
 * single-invocation pipeline did — see the bottom of POST().
 *
 * Who may call it: a signed-in user (the report is owned — ownerId) or a
 * free-trial visitor within their TRIAL_LIMIT reports (anonId, lib/trial.js).
 * A trial place is reserved before generating and given back unless the record
 * is saved, so a failed generation never counts. Over the limit the route
 * answers 403 with `signupRequired`, and the questionnaire opens sign-up.
 *
 * Rule: the AI never calculates a number.
 */
import * as Sentry from '@sentry/nextjs'
import { getScopeCatalogue } from '@/lib/costCalculator'
import { projectTypeUsesLevel } from '@/lib/scopeEngine'
import { validatePostcode } from '@/lib/postcodeRegion'
import { runDeterministicPipeline } from '@/lib/pipeline'
import { buildReport } from '@/lib/reportBuilder'
import { createReport, recordReportStat } from '@/lib/kv'
import { runProseSequential, scrubAnswers } from '@/lib/prose'
import { checkRateLimit, rateLimitedResponse } from '@/lib/rateLimit'
import { getSessionUser, getTrialId } from '@/lib/auth'
import { TRIAL_LIMIT, reserveTrialReport, recordTrialReport } from '@/lib/trial'
import { recordActivity } from '@/lib/users'

// Report a caught pipeline failure to Sentry with a scrubbed projection of the
// answers that triggered it, so a crash a colleague never reports still arrives
// reproducible. No-ops when NEXT_PUBLIC_SENTRY_DSN is unset. Attached as `extra`
// (not contexts) so it is never used for issue-grouping.
function capturePipelineError(e, step, answers) {
  Sentry.captureException(e, {
    tags: { pipeline_step: step },
    extra: { answers: scrubAnswers(answers) },
  })
}

// This deployment is on Vercel Hobby, where the platform kills the invocation at
// 60s no matter what this value says. This phase runs in a few seconds — cost,
// programme and a re-run of cost, all pure computation — so 60s is a ceiling
// with enormous headroom, not a target. Kept at 60 (rather than lowered) only
// so the KV-unavailable dev fallback below, which does make the AI call inline,
// still has its old budget.
export const maxDuration = 60

const TRIAL_REFUSED = {
  'visitor-limit': `You have used your ${TRIAL_LIMIT} free reports. Create a free account to keep going — your answers are saved and this report will generate straight away.`,
  'ip-limit': 'The free reports available from your network have been used. Create a free account to keep going — your answers are saved and this report will generate straight away.',
}

export async function POST(request) {
  // Generous relative to sign-in — this route is now cheap
  // CPU-only work in production, but still creates a KV record and (with no
  // KV configured) makes a real AI call, so it isn't unbounded.
  const rl = await checkRateLimit('generate-report', request, { requests: 30, window: '10 m' })
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSeconds)

  // A signed-in user, or a free-trial visitor within their allowance. The
  // report is stamped with one or the other (ownerId / anonId).
  const user = await getSessionUser(request)
  let trialId = null
  let reservation = null
  if (!user) {
    trialId = await getTrialId(request)
    if (!trialId) {
      return Response.json({
        error: 'Your browser did not keep our cookie, so the free trial cannot count your reports. Allow cookies for this site, or create a free account.',
        signupRequired: true,
      }, { status: 401 })
    }
    // Tighter than for accounts: the public can spend API credit here.
    const trl = await checkRateLimit('generate-report-trial', request, { requests: 5, window: '1 h' })
    if (!trl.allowed) return rateLimitedResponse(trl.retryAfterSeconds)
    try {
      reservation = await reserveTrialReport(trialId, request)
    } catch (e) {
      // Without KV the allowance cannot be counted. Production refuses rather
      // than generate uncounted; local development (no KV) carries on.
      console.warn('[generate-report] trial allowance unavailable:', e.message)
      if (process.env.NODE_ENV === 'production') {
        return Response.json({ error: 'The free trial is unavailable right now. Please try again shortly, or create a free account.' }, { status: 503 })
      }
      reservation = { ok: true, release: async () => {} }
    }
    if (!reservation.ok) {
      return Response.json({ error: TRIAL_REFUSED[reservation.reason], signupRequired: true, reason: reservation.reason }, { status: 403 })
    }
  }

  const outcome = { reportId: null }
  const response = await generate(request, { user, trialId }, outcome)
  // A free report counts only when Phase 1 saved the record; anything else
  // (a validation error, a calculator failure) gives it back.
  if (reservation) {
    if (outcome.reportId) await recordTrialReport(trialId, outcome.reportId).catch(e => console.warn('[generate-report] recordTrialReport:', e.message))
    else await reservation.release()
  }
  if (outcome.reportId) {
    await recordReportStat(user ? 'user' : 'anon')
    if (user) await recordActivity(user.uid)
  }
  return response
}

async function generate(request, { user, trialId }, outcome) {
  // Request-level clock. Only exercised by the KV-unavailable fallback below —
  // the normal path never gets close to it.
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

    const pv = validatePostcode(answers.q1_1_postcode)
    if (!pv.ok) {
      return Response.json({ error: `Q1.1 — ${pv.reason}`, field: 'q1_1_postcode' }, { status: 400 })
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

    // Guard 1 — level of intervention must be recognised where the project
    // type asks it ('Uses level of intervention' on the NRM1 workbook's
    // ▶ project_types: Refurbishment and Fit-out). Keyed q2_3_interventionLevel,
    // displayed as Q2.2 — see the numbering note in app/questionnaire/page.jsx.
    try {
      const cat = await getScopeCatalogue()
      if (projectTypeUsesLevel(cat, answers.q1_2_projectType) &&
          !cat.settings.interventionLevels.some(l => l.name === answers.q2_3_interventionLevel)) {
        return Response.json({
          error: 'Q2.2 — Level of intervention is required. Please select one of the four options.',
          field: 'q2_3_interventionLevel',
        }, { status: 400 })
      }
    } catch (e) {
      capturePipelineError(e, 'cost', answers)
      return Response.json({ error: 'Cost calculation failed: ' + e.message }, { status: 500 })
    }

    // Guard 2 — scope must have at least one item
    if (!answers.q2_2_scopeItems || answers.q2_2_scopeItems.length === 0) {
      return Response.json({
        error: 'At least one scope item must be selected in Q2.3.',
        field: 'q2_2_scopeItems',
      }, { status: 400 })
    }

    // ── Steps 1–2: the deterministic pipeline ──────────────────────────────────
    console.log('[Steps 1–2] Running the deterministic pipeline...')
    let cost, programme, senseCheck, confidence, procurement
    try {
      ({ cost, programme, senseCheck, confidence, procurement } = await runDeterministicPipeline(answers))
    } catch (e) {
      const step = e?.pipelineStep || 'pipeline'
      console.error(`[${step} error]`, e.message)
      capturePipelineError(e, step, answers)
      const label = { cost: 'Cost calculation', programme: 'Programme calculation', procurement: 'Procurement recommendation', senseCheck: 'Sense check' }[step] || 'Report calculation'
      return Response.json({ error: `${label} failed: ${e.message}` }, { status: 500 })
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

    // ── Step 3: Save the deterministic record and return fast ────────────────
    const reportId    = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    const generatedAt = new Date().toISOString()
    const costData    = serializeCost(cost)
    const progData    = serializeProgramme(programme)
    const budget      = senseCheck?.budget || { status: 'none' }

    const record = {
      reportId,
      projectName: answers.q1_0_projectName,
      cost:        costData,
      programme:   progData,
      procurement,
      budget,
      // Only the fields buildProsePrompts()/computeConfidence() actually read —
      // see lib/kv.js's file header for why this can't just be recomputed from
      // the serialized cost/programme (they drop fields senseCheck needs, like
      // cost.projectType and programme.sizeBandUsed).
      senseCheck: {
        hasClientWarnings: senseCheck?.hasClientWarnings || false,
        clientWarnings:    senseCheck?.clientWarnings || [],
      },
      confidence,
      answers,
      generatedAt,
      ownerId:     user?.uid || null,
      ...(trialId && { anonId: trialId }),
    }

    const kvOk = await createReport(reportId, record)

    if (kvOk) {
      outcome.reportId = reportId
      return Response.json({
        success: true,
        reportId,
        status: 'deterministic',
        projectName: record.projectName,
        cost:        costData,
        programme:   progData,
        procurement,
        budget,
        confidence,
        generatedAt,
      })
    }

    // ── KV unavailable (local dev without a store) ────────────────────────────
    // No shared state channel exists for a second request to resume from, so
    // fall back to the old single-invocation behaviour: run both prose halves
    // and the docx build inline, bounded by this request's own clock.
    console.warn('[generate-report] KV unavailable — running full pipeline inline (dev fallback)')
    let aiProse
    try {
      // 48s keeps the old behaviour under Vercel's 60s ceiling. Off Vercel
      // (local dev, where this fallback actually runs) nothing kills the
      // request, so both halves get a realistic budget instead of racing a
      // limit that does not exist there — a slow API minute used to fail the
      // sample-report script and every local end-to-end run for no reason.
      const inlineBudgetMs = process.env.VERCEL ? 48_000 : (Number(process.env.PROSE_INLINE_BUDGET_MS) || 150_000)
      const proseDeadline = requestStart + inlineBudgetMs
      aiProse = await runProseSequential(answers, cost, programme, senseCheck, proseDeadline, procurement)
    } catch (e) {
      console.error('[Step 3 error]', e.message)
      capturePipelineError(e, 'prose', answers)
      return Response.json({ error: 'Report text generation failed: ' + e.message }, { status: 500 })
    }

    let docxBuffer, templateError
    try {
      docxBuffer = await buildReport({ answers, cost, programme, procurement, aiProse, budget })
    } catch (e) {
      console.error('[Step 4 error]', e.message)
      capturePipelineError(e, 'reportBuilder', answers)
      templateError = e.message
    }

    // No `reportId` here — a share link, a "Ref:" on the cover page, the
    // server-side PDF route, and the feedback tool's report reference are all
    // gated on this field being present (see ReportRenderer.jsx). Sending one
    // back when nothing was actually persisted would make those affordances
    // lie: a copied link would 404 for anyone else (or even this browser once
    // sessionStorage clears), and the PDF route would 404 outright. `reportId`
    // still exists locally above for logging, but only a record KV actually
    // holds is a report anyone else can reach.
    return Response.json({
      success: true,
      status: 'complete',
      projectName: answers.q1_0_projectName,
      cost:        costData,
      programme:   progData,
      procurement,
      budget,
      confidence,
      aiProse,
      answers,
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

// ─── Serialisers ──────────────────────────────────────────────────────────────
// Fix 1: include lineItems and stages so the HTML report page has all data
function serializeCost(cost) {
  return {
    lineItems: cost.lineItems,          // Fix 2: needed by scope section in HTML
    // NRM1 v5.2: BCIS 12 lines printed below the construction total, works by
    // BCIS element, the worked-out quantity inputs, the Group 2 construction
    // method, and the 'When selected' risks/assumptions the scope raised.
    belowLine: cost.belowLine,
    bcisTotals: cost.bcisTotals,
    inputs: cost.inputs,
    constructionMethod: cost.constructionMethod,
    scopeEffects: cost.scopeEffects,
    works: cost.works,
    construction: cost.construction,
    total: cost.total,
    vat: cost.vat,
    bcisFactor: cost.bcisFactor,
    bcisRegion: cost.bcisRegion,
    gifa: cost.gifa,
    projectType: cost.projectType,
    specLevel: cost.specLevel,
    interventionLevel: cost.interventionLevel,
    bandFactor: cost.bandFactor,
    percentages: cost.percentages,
    breakdown: cost.breakdown,
    // On-cost basis and its per-row amounts (the project cost table prints
    // these, so it foots), the cost sensitivities and the flagged scope gaps.
    // Without them a stored report fell back to the old per-row sums.
    onCostBasis: cost.onCostBasis,
    onCosts: cost.onCosts,
    sensitivity: cost.sensitivity,
    scopeGaps: cost.scopeGaps,
    // Estimate Basis data — keeps the HTML report's basis section in step
    // with the docx builder, which receives the full cost object.
    excludedNoQuantity: cost.excludedNoQuantity,
    additionalScopeNote: cost.additionalScopeNote,
    workbookVersion: cost.workbookVersion,
    baseDate: cost.baseDate,
    rangeApplied: cost.rangeApplied,
    vatPct: cost.vatPct,
    // Percentage build-up — which Tab 3 rules fired for each addition.
    trace: cost.trace,
    bcisDefaulted: cost.bcisDefaulted,
    // Scope reconciliation audit trail — see costCalculator.js's reconciliation
    // invariant. Surfaced in the report so the user can verify priced lines
    // against what they actually ticked, rather than trusting it silently.
    autoIncludes: cost.autoIncludes,
    adjustments: cost.adjustments,
    buildingUseHidden: cost.buildingUseHidden,
  }
}

function serializeProgramme(programme) {
  return {
    stages:              programme.stages,
    milestones:          programme.milestones,
    assumptions:         programme.assumptions,
    standardAssumptions: programme.standardAssumptions,
    totalWeeks:          programme.totalWeeks,
    totalWeeksBestCase:  programme.totalWeeksBestCase,
    floatWeeks:          programme.floatWeeks,
    startDate:           programme.startDate,
    startDateAssumed:    programme.startDateAssumed,
    endDate:             programme.endDate,
    fastTrackOptions:    programme.fastTrackOptions,
    tenderType:          programme.tenderType,
    tenderId:            programme.tenderId,
    designResponsibility: programme.designResponsibility,
    procurementRationale: programme.procurementRationale,
    procurementSource:   programme.procurementSource,
    surveyWeeks:         programme.surveyWeeks,
    designWeeks:         programme.designWeeks,
    tenderWeeks:         programme.tenderWeeks,
    constructionWeeks:   programme.constructionWeeks,
    handoverWeeks:       programme.handoverWeeks,
    planningWeeks:       programme.planningWeeks,
    planningStatus:      programme.planningStatus,
    planningAlongside:   programme.planningAlongside,
    bcWeeks:             programme.bcWeeks,
    targetStatus:        programme.targetStatus,
    targetNote:          programme.targetNote,
    procurementRoute:    programme.procurementRoute,
    contractForm:        programme.contractForm,
    occupationUplift:    programme.occupationUplift,
    constructionType:    programme.constructionType,
    grantGovernanceWeeks: programme.grantGovernanceWeeks,
    procurementNote:     programme.procurementNote,
    workbookVersion:     programme.workbookVersion,
    phasingNote:         programme.phasingNote,
    programmeStartNote:  programme.programmeStartNote,
  }
}
