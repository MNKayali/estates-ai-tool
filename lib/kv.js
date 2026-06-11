/**
 * lib/kv.js
 *
 * Thin wrapper around @vercel/kv with graceful degradation.
 * If KV env vars (KV_REST_API_URL + KV_REST_API_TOKEN) are not set
 * — e.g. in local dev without a KV store — all operations return
 * null / false silently without throwing.
 *
 * Reports expire after 90 days (7,776,000 seconds).
 */
import { kv } from '@vercel/kv'

const REPORT_TTL = 60 * 60 * 24 * 90  // 90 days in seconds

/**
 * Save a report payload under key `report:<id>`.
 * Returns true on success, false if KV is not configured or the write fails.
 */
export async function saveReport(id, data) {
  try {
    await kv.set(`report:${id}`, data, { ex: REPORT_TTL })
    // Maintain a lightweight index so the admin dashboard can list reports without
    // fetching every multi-MB payload (each report stores the .docx inline). The
    // index entry holds metadata only; a failure here must not lose the report.
    const meta = {
      reportId:    id,
      projectName: data?.projectName || 'Untitled',
      generatedAt: data?.generatedAt || new Date().toISOString(),
      totalLow:    data?.cost?.total?.low ?? null,
      totalHigh:   data?.cost?.total?.high ?? null,
      totalMid:    data?.cost?.total?.mid ?? null,
      totalWeeks:  data?.programme?.totalWeeks ?? null,
      hasDocx:     !!data?.docx,
    }
    await kv.lpush(REPORT_INDEX_KEY, meta)
    await kv.ltrim(REPORT_INDEX_KEY, 0, REPORT_INDEX_MAX - 1)
    await kv.expire(REPORT_INDEX_KEY, REPORT_TTL)
    return true
  } catch (e) {
    console.warn('[KV] saveReport skipped:', e.message)
    return false
  }
}

// ─── Report index ─────────────────────────────────────────────────────────────
// Newest-first capped list of report metadata, written by saveReport. Read by the
// admin dashboard. Same capped-list pattern as feedback below.
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
 * Fetch a report payload by ID.
 * Returns the data object, or null if not found / KV unavailable.
 */
export async function getReport(id) {
  try {
    return await kv.get(`report:${id}`)
  } catch (e) {
    console.warn('[KV] getReport failed:', e.message)
    return null
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
