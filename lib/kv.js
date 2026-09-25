/**
 * lib/kv.js
 *
 * Thin wrapper around @vercel/kv with graceful degradation.
 * If KV env vars (KV_REST_API_URL + KV_REST_API_TOKEN) are not set
 * — e.g. in local dev without a KV store — all operations return
 * null / false silently without throwing.
 *
 * A complete report with an owner (a signed-in user) is kept until the owner
 * deletes it; one without keeps the 90-day expiry (7,776,000 seconds).
 *
 * ─── Two-phase generation record lifecycle ───────────────────────────────────
 * A report moves through KV in two writes, not one:
 *
 *   1. createReport()   — written by generate-report in ~4s: cost, programme,
 *      budget, confidence and answers, with status 'deterministic'. TTL 24h —
 *      short, because an abandoned questionnaire submission (browser closed
 *      before prose ever runs) shouldn't linger for 90 days.
 *   2. saveProseHalf()  — written by the prose route as each half completes,
 *      to its own sidecar key `report:<id>:half:<half>`. Two independent keys
 *      rather than a read-modify-write on the main record, so two halves
 *      finishing at nearly the same moment can never lose one's write to the
 *      other's.
 *   3. finaliseReport() — written once both halves exist: the full record
 *      (now including aiProse), status 'complete', kept with no expiry when it
 *      has an owner (else re-stamped to 90 days), and only now pushed onto the
 *      admin index and the owner's report list — so a report
 *      that never finishes prose never clutters the admin dashboard.
 *
 * getReport() is the single read path every caller uses (report-pdf, the
 * /api/reports/[id] route, the prose route). It transparently merges the
 * sidecar halves into a preview `aiProse` while status is still
 * 'deterministic', and passes a 'complete' or legacy pre-Phase-2 record
 * through untouched — reportBuilder.js and ReportRenderer.jsx already
 * optional-chain every aiProse field, so a partial or absent aiProse renders
 * as an empty section rather than throwing.
 */
import { kv } from '@vercel/kv'

const REPORT_TTL = 60 * 60 * 24 * 90  // 90 days, once complete
const PENDING_TTL = 60 * 60 * 24      // 24h while incomplete — see file header
const LOCK_TTL = 75                    // seconds — comfortably above one half's max attempt window
const PROSE_ORDER = ['narrative', 'risk']

/**
 * Create the deterministic-only record for a new report. Returns true on
 * success, false if KV is not configured or the write fails — the caller
 * (generate-report) falls back to running the whole pipeline inline when this
 * returns false, since there is then no shared state channel for a second
 * request to resume from.
 */
export async function createReport(id, data) {
  try {
    await kv.set(`report:${id}`, { ...data, status: 'deterministic' }, { ex: PENDING_TTL })
    return true
  } catch (e) {
    console.warn('[KV] createReport skipped:', e.message)
    return false
  }
}

/**
 * Save one completed prose half to its own sidecar key. Independent of the
 * other half's key and of the main record, so concurrent writes can't clobber
 * each other.
 */
export async function saveProseHalf(id, half, data) {
  try {
    await kv.set(`report:${id}:half:${half}`, data, { ex: PENDING_TTL })
    return true
  } catch (e) {
    console.warn(`[KV] saveProseHalf(${half}) skipped:`, e.message)
    return false
  }
}

/** Read one prose half's sidecar value, or null if not yet written / KV unavailable. */
export async function getProseHalf(id, half) {
  try {
    return await kv.get(`report:${id}:half:${half}`)
  } catch (e) {
    console.warn(`[KV] getProseHalf(${half}) failed:`, e.message)
    return null
  }
}

/**
 * Try to claim the lock for one prose half. Returns a token to release with
 * later, or null if another invocation already holds it. `nx` makes the claim
 * atomic — two invocations racing to claim the same half can never both win.
 */
export async function claimLock(id, half) {
  try {
    const token = crypto.randomUUID()
    const ok = await kv.set(`report:${id}:lock:${half}`, token, { nx: true, ex: LOCK_TTL })
    return ok ? token : null
  } catch (e) {
    console.warn(`[KV] claimLock(${half}) failed:`, e.message)
    return null
  }
}

/**
 * Release a lock this invocation holds. Compares the token before deleting so
 * a lock that has already expired and been re-claimed by someone else is never
 * torn down out from under them.
 */
export async function releaseLock(id, half, token) {
  try {
    const key = `report:${id}:lock:${half}`
    const current = await kv.get(key)
    if (current === token) await kv.del(key)
  } catch (e) {
    console.warn(`[KV] releaseLock(${half}) failed:`, e.message)
  }
}

/**
 * Write the final, complete record (aiProse included), push it onto the admin
 * index and the owner's report list for the first time, and clean up the
 * now-redundant sidecar keys and locks.
 */
export async function finaliseReport(id, data) {
  try {
    // A report with an owner is kept until its owner deletes it (no TTL); one
    // without (the no-account path) keeps the 90-day expiry.
    if (data?.ownerId) {
      await kv.set(`report:${id}`, { ...data, status: 'complete' })
      await kv.hset(userReportsKey(data.ownerId), { [id]: reportSummary(id, data) })
    } else {
      await kv.set(`report:${id}`, { ...data, status: 'complete' }, { ex: REPORT_TTL })
    }
    const meta = {
      reportId:    id,
      projectName: data?.projectName || 'Untitled',
      generatedAt: data?.generatedAt || new Date().toISOString(),
      totalLow:    data?.cost?.total?.low ?? null,
      totalHigh:   data?.cost?.total?.high ?? null,
      totalMid:    data?.cost?.total?.mid ?? null,
      totalWeeks:  data?.programme?.totalWeeks ?? null,
      hasDocx:     !!data?.docx,
      ownerId:     data?.ownerId || null,
    }
    await kv.lpush(REPORT_INDEX_KEY, meta)
    await kv.ltrim(REPORT_INDEX_KEY, 0, REPORT_INDEX_MAX - 1)
    await kv.expire(REPORT_INDEX_KEY, REPORT_TTL)
    await Promise.all(
      PROSE_ORDER.flatMap(half => [
        kv.del(`report:${id}:half:${half}`),
        kv.del(`report:${id}:lock:${half}`),
      ])
    ).catch(() => {}) // best-effort tidy-up — an orphaned sidecar just expires in 24h
    return true
  } catch (e) {
    console.warn('[KV] finaliseReport skipped:', e.message)
    return false
  }
}

// ─── Report index ─────────────────────────────────────────────────────────────
// Newest-first capped list of report metadata, written by finaliseReport. Read
// by the admin dashboard. Same capped-list pattern as feedback below.
const REPORT_INDEX_KEY = 'report:index'
const REPORT_INDEX_MAX = 1000

/**
 * List report metadata (newest first). Returns [] if KV is unavailable.
 */
export async function listReports(limit = REPORT_INDEX_MAX) {
  try {
    return (await kv.lrange(REPORT_INDEX_KEY, 0, limit - 1)) || []
  } catch (e) {
    console.warn('[KV] listReports failed:', e.message)
    return []
  }
}

/**
 * Count of indexed reports (capped at REPORT_INDEX_MAX). Returns 0 if KV is unavailable.
 */
export async function countReports() {
  try {
    return (await kv.llen(REPORT_INDEX_KEY)) || 0
  } catch (e) {
    console.warn('[KV] countReports failed:', e.message)
    return 0
  }
}

/**
 * Fetch a report by ID, merging in whichever prose halves have completed.
 *
 * - Not found at all → null.
 * - status 'complete', or a legacy record from before this split (no `status`
 *   field at all — it was always fully generated) → returned as-is.
 * - status 'deterministic' → sidecar halves are merged into a preview
 *   `aiProse` (only the fields written so far; reportBuilder/ReportRenderer
 *   already tolerate a partial or absent aiProse), plus a `prosePending` map
 *   the report page uses to know which half(s) still need `/prose` calls.
 */
export async function getReport(id) {
  try {
    const record = await kv.get(`report:${id}`)
    if (!record) return null
    if (!record.status || record.status === 'complete') return record

    const [narrative, risk] = await Promise.all([
      getProseHalf(id, 'narrative'),
      getProseHalf(id, 'risk'),
    ])
    const aiProse = (narrative || risk)
      ? {
          ...narrative,
          ...risk,
          confidenceScore: record.confidence?.score,
          confidenceLabel: record.confidence?.label,
        }
      : null

    return {
      ...record,
      aiProse,
      prosePending: { narrative: !narrative, risk: !risk },
    }
  } catch (e) {
    console.warn('[KV] getReport failed:', e.message)
    return null
  }
}

// ─── Each user's reports ──────────────────────────────────────────────────────
// A hash per user, reportId → summary, written at finalise. Kept separately from
// the report records so the "My reports" list is one read, not one per report.
function userReportsKey(uid) { return `user:${uid}:reports` }

function reportSummary(id, data) {
  return {
    reportId:    id,
    projectName: data?.projectName || 'Untitled',
    projectType: data?.answers?.q1_2_projectType || null,
    generatedAt: data?.generatedAt || new Date().toISOString(),
    totalLow:    data?.cost?.total?.low ?? null,
    totalHigh:   data?.cost?.total?.high ?? null,
    totalMid:    data?.cost?.total?.mid ?? null,
    totalWeeks:  data?.programme?.totalWeeks ?? null,
  }
}

/** One user's report summaries, newest first. Returns [] if KV is unavailable. */
export async function listUserReports(uid) {
  try {
    const all = (await kv.hgetall(userReportsKey(uid))) || {}
    return Object.values(all)
      .map(v => (typeof v === 'string' ? JSON.parse(v) : v))
      .sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)))
  } catch (e) {
    console.warn('[KV] listUserReports failed:', e.message)
    return []
  }
}

/**
 * Delete a report and its entry in the owner's list. The caller has already
 * checked ownership. Returns true on success.
 */
export async function deleteReport(id, ownerId) {
  try {
    await kv.del(`report:${id}`)
    if (ownerId) await kv.hdel(userReportsKey(ownerId), id)
    await Promise.all(
      PROSE_ORDER.flatMap(half => [kv.del(`report:${id}:half:${half}`), kv.del(`report:${id}:lock:${half}`)])
    ).catch(() => {})
    return true
  } catch (e) {
    console.warn('[KV] deleteReport failed:', e.message)
    return false
  }
}

// ─── User feedback ────────────────────────────────────────────────────────────
// Issues flagged from the report page are pushed onto a single capped Redis list
// (newest first) rather than per-key, so they can be read back in one call without
// a KEYS scan. The list is trimmed to FEEDBACK_MAX and re-stamped with the same
// 90-day TTL on every write.
const FEEDBACK_KEY = 'feedback:log'
const FEEDBACK_MAX = 500

/**
 * Append one feedback entry. Returns true on success, false if KV is unavailable.
 */
export async function saveFeedback(entry) {
  try {
    await kv.lpush(FEEDBACK_KEY, entry)
    await kv.ltrim(FEEDBACK_KEY, 0, FEEDBACK_MAX - 1)
    await kv.expire(FEEDBACK_KEY, REPORT_TTL)
    return true
  } catch (e) {
    console.warn('[KV] saveFeedback skipped:', e.message)
    return false
  }
}

/**
 * Read the most recent feedback entries (newest first).
 * Returns [] if KV is unavailable.
 */
export async function listFeedback(limit = FEEDBACK_MAX) {
  try {
    return (await kv.lrange(FEEDBACK_KEY, 0, limit - 1)) || []
  } catch (e) {
    console.warn('[KV] listFeedback failed:', e.message)
    return []
  }
}
