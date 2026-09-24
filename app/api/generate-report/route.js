/**
 * /api/generate-report
 *
 * Phase 1 of two. This route is now deterministic-only — no AI call — and
 * returns in a few seconds:
 *
 *   Step 1 — costCalculator.js  → deterministic cost JSON (no AI)
 *   Step 2 — programmeCalculator.js → deterministic programme JSON (no AI)
 *   Step 2b — re-run cost with the known programme length (inflation + prelims)
 *   Step 2c — senseCheck.js → deterministic warnings + confidence grade
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
 * Rule: the AI never calculates a number.
 */
import * as Sentry from '@sentry/nextjs'
import { calculateCost, getScopeCatalogue } from '@/lib/costCalculator'
import { projectTypeUsesLevel } from '@/lib/scopeEngine'
import { calculateProgramme } from '@/lib/programmeCalculator'
import { buildReport } from '@/lib/reportBuilder'
import { createReport } from '@/lib/kv'
import { runSenseCheck, budgetVerdict } from '@/lib/senseCheck'
import { computeConfidence, runProseSequential, scrubAnswers } from '@/lib/prose'
import { checkRateLimit, rateLimitedResponse } from '@/lib/rateLimit'

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

export async function POST(request) {
  // Generous relative to /api/check-access — this route is now cheap
  // CPU-only work in production, but still creates a KV record and (with no
  // KV configured) makes a real AI call, so it isn't unbounded.
  const rl = await checkRateLimit('generate-report', request, { requests: 30, window: '10 m' })
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSeconds)

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
      programme = await calculateProgramme(answers, cost.total.mid, { scope: cost.scopeSummary })
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

    // ── Step 2c: Sense check + confidence grade ───────────────────────────────
    const senseCheck = await runSenseCheck(cost, programme, answers)
    const confidence = computeConfidence(answers, cost, senseCheck)

    // ── Step 2d: Final cost pass with the confidence-linked range ────────────
    // The estimate range widens with the deterministic confidence grade (Tab
    // ▶ range_widths on '3. Settings'), and the grade is only known now. Warnings and the
    // grade itself depend on works.mid, which the range does not touch, so
    // the sense check is not re-run — only the budget verdict, which compares
    // the stated budget against the (now wider or narrower) gross range.
    cost = await calculateCost(answers, programme.totalWeeks, programme.constructionWeeks, { rangeGrade: confidence.score })
    senseCheck.budget = budgetVerdict(answers, cost)

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
    }

    const kvOk = await createReport(reportId, record)

    if (kvOk) {
      return Response.json({
        success: true,
        reportId,
        status: 'deterministic',
        projectName: record.projectName,
        cost:        costData,
        programme:   progData,
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
      aiProse = await runProseSequential(answers, cost, programme, senseCheck, proseDeadline)
    } catch (e) {
      console.error('[Step 3 error]', e.message)
      capturePipelineError(e, 'prose', answers)
      return Response.json({ error: 'AI prose generation failed: ' + e.message }, { status: 500 })
    }

    let docxBuffer, templateError
    try {
      docxBuffer = await buildReport({ answers, cost, programme, aiProse, budget })
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
      budget,
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
    designResponsibility: programme.designResponsibility,
    procurementRationale: programme.procurementRationale,
    procurementSource:   programme.procurementSource,
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
