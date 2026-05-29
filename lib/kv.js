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
    return true
  } catch (e) {
    console.warn('[KV] saveReport skipped:', e.message)
    return false
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
