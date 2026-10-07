/**
 * POST /api/reports/[id]/prose
 *
 * Phase 2 of two. Drives whichever prose half(s) are still outstanding on a
 * deterministic-only record created by /api/generate-report, within this
 * request's own fresh 60s ceiling.
 *
 * Resumability is the mechanism, not a fallback: this route checks the
 * remaining time budget against each half's own minAttemptMs before starting
 * it, and simply doesn't attempt a half it can't finish. It returns whatever
 * progress it made; /report/[id] (the driver) calls this again — a brand new
 * invocation with a brand new 60s — until the record's status is 'complete'.
 * A slow API day costs extra round trips, not a lost, already-paid-for report.
 *
 * Locking: each half has its own KV lock (report:<id>:lock:<half>, 75s TTL).
 * Two tabs open on the same report at once don't duplicate spend — whichever
 * grabs a half's lock first works on it; the other moves on to (or waits on)
 * the remaining half. A half already locked by someone else is skipped, not
 * retried in a hot loop — the caller gets a 409 only when this invocation made
 * no progress at all, so it knows to back off and poll /status instead.
 */
import * as Sentry from '@sentry/nextjs'
import {
  getProseHalf, saveProseHalf,
  claimLock, releaseLock, finaliseReport,
} from '@/lib/kv'
import {
  PROSE_ORDER, PROSE_HALVES, requestProseHalf,
  buildProsePrompts, finaliseProse, scrubAnswers,
} from '@/lib/prose'
import { checkRateLimit, rateLimitedResponse } from '@/lib/rateLimit'
import { loadReport, reportNotFoundResponse, REPORT_ID } from '@/lib/auth'
import { checkConsistency } from '@/lib/consistency'

// Consistency findings are advisory: a failure inside the check must never lose a finished report.
function safeConsistency(record, aiProse) {
  try {
    const issues = checkConsistency({ programme: record.programme, procurement: record.procurement, aiProse, budget: record.budget })
    if (issues.length) console.warn('[consistency]', issues.map(i => i.code).join(','))
    return issues
  } catch (e) {
    console.warn('[consistency] check failed:', e.message)
    return []
  }
}

export const maxDuration = 60

// Reserved off the end of the 60s ceiling for the finalise step (merging the
// two halves and writing the ~90-day final KV record). The .docx used to be
// built here too; it is now built on download (/api/reports/[id]/docx). The
// reserve is kept as it was — generous, and cheap to leave.
const FINALISE_RESERVE_MS = 8_000

function capturePipelineError(e, step, answers) {
  Sentry.captureException(e, {
    tags: { pipeline_step: step },
    extra: { answers: scrubAnswers(answers) },
  })
}

export async function POST(request, { params }) {
  const { id } = await params
  if (!id || !REPORT_ID.test(id)) {
    return Response.json({ error: 'Invalid report ID.' }, { status: 400 })
  }

  // Generous: the resumability driver legitimately calls this route several
  // times per report, and a shared-office IP may have several colleagues
  // generating concurrently. This exists to bound a genuinely runaway client
  // (a broken retry loop with no backoff) hammering the real Anthropic API,
  // not to throttle normal use.
  const rl = await checkRateLimit('prose', request, { requests: 60, window: '10 m' })
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSeconds)

  const requestStart = Date.now()
  const deadline = requestStart + 60_000 - FINALISE_RESERVE_MS

  const { response, record, caller } = await loadReport(request, id)
  if (response) return response

  // Already finished — by this invocation's own earlier work, another tab, or
  // a legacy pre-Phase-2 record that was always generated in one shot. Return
  // it as-is so a driver that calls this defensively is a no-op, not an error.
  if (!record.status || record.status === 'complete') {
    return Response.json({ success: true, ...record })
  }

  const senseCheck = {
    budget: record.budget,
    hasClientWarnings: record.senseCheck?.hasClientWarnings || false,
    clientWarnings: record.senseCheck?.clientWarnings || [],
  }
  const { narrativePrompt, riskPrompt, isROI } = buildProsePrompts(
    record.answers, record.cost, record.programme, senseCheck, record.confidence, record.procurement || null
  )
  const prompts = { narrative: narrativePrompt, risk: riskPrompt }

  // Which halves already exist, so a half finished by an earlier invocation is
  // never re-run. getReport() read both sidecar keys to build prosePending, so
  // skipping a finished half costs no extra KV read.
  let madeProgress = false
  let anyLocked = false
  let lastError = null

  for (const half of PROSE_ORDER) {
    if (!record.prosePending?.[half]) continue // already done

    const token = await claimLock(id, half)
    if (!token) { anyLocked = true; continue } // another invocation is on it right now

    try {
      // A concurrent tab may have finished this half (and released its lock)
      // since getReport() read it: check again under the lock before paying.
      if (await getProseHalf(id, half)) continue
      const remaining = deadline - Date.now()
      if (remaining < PROSE_HALVES[half].minAttemptMs) break // out of runway this call — next call gets a fresh 60s
      const out = await requestProseHalf(half, prompts[half], deadline, {
        // Kept and trimmed, never failed — but worth knowing how often the model misses the shape.
        onShapeMiss: (h, message) => Sentry.captureMessage(`[prose] shape miss (${h}): ${message}`, 'warning'),
        procurement: record.procurement || null,
      })
      await saveProseHalf(id, half, out)
      madeProgress = true
    } catch (e) {
      console.warn(`[prose route] ${half} failed: ${e.message}`)
      lastError = e
      capturePipelineError(e, `prose:${half}`, record.answers)
    } finally {
      await releaseLock(id, half, token)
    }
  }

  // Re-read fresh rather than trust local state: a concurrent tab may have
  // completed the other half while this request was running its own half.
  const [narrative, risk] = await Promise.all([
    getProseHalf(id, 'narrative'),
    getProseHalf(id, 'risk'),
  ])

  if (narrative && risk) {
    const aiProse = finaliseProse({ narrative, risk }, isROI, record.confidence, record.answers, record.cost, senseCheck)

    // The .docx is no longer built here: GET /api/reports/[id]/docx builds it
    // on download (embedded fonts made it too large to keep in the KV record).
    const finalRecord = {
      reportId: id,
      projectName: record.projectName,
      cost: record.cost,
      programme: record.programme,
      ...(record.procurement && { procurement: record.procurement }),
      budget: record.budget,
      aiProse,
      consistency: safeConsistency(record, aiProse),
      answers: record.answers,
      generatedAt: record.generatedAt,
      ownerId: record.ownerId,
      ...(record.anonId && { anonId: record.anonId }),
    }
    // null: the owner deleted the report while its text was being written —
    // it stays deleted (finaliseReport never recreates a missing record).
    if ((await finaliseReport(id, finalRecord)) === null) return reportNotFoundResponse(caller.user)
    return Response.json({ success: true, status: 'complete', ...finalRecord })
  }

  // Not complete. If we made no progress at all this call and every
  // outstanding half is locked by someone else, tell the client to back off
  // and poll /status rather than hot-loop calling this route.
  if (!madeProgress && anyLocked) {
    return Response.json({ error: 'locked', retryAfterMs: 3000 }, { status: 409 })
  }

  return Response.json({
    success: true,
    reportId: id,
    status: 'deterministic',
    prose: { narrative: !!narrative, risk: !!risk },
    ...(lastError && !madeProgress ? { error: lastError.message } : {}),
  })
}
