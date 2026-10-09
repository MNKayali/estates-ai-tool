/**
 * lib/postcodeRegion.js — which ▶ location_factors region a postcode falls in.
 *
 * Pure (imports only its district data): used by the cost engine (lib/costCalculator.js) and by the
 * questionnaire's live "Regional cost factor" line, so the form can never show
 * one region while the estimate is priced at another.
 *
 * The workbook lists postcode AREAS ("BS", "M") and, where an area is split
 * across regions, DISTRICTS ("SW1", "SY10"). The most specific entry wins, so
 * "SW1" (Inner London) beats "SW" (Outer London) and "SY10" (Shropshire) beats
 * "SY" (Wales). A district entry matches the district itself or its lettered
 * sub-districts (SW1 → SW1A, SW1P) but never a longer number (SW1 ≠ SW10).
 *
 * The previous matcher cut the postcode at its first digit and compared areas
 * only, so the workbook's district entries (SW1, SE1, E1W) could never match
 * and those Inner London postcodes priced as Outer London.
 */

import { UK_POSTCODE_DISTRICTS } from './data/ukPostcodeDistricts.js'

/** Outward code ("SW1A" from "sw1a 1aa", "BS1" from "BS1", "M13" from "M139PL"). */
export function outwardCode(postcode) {
  const s = String(postcode || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim()
  if (!s) return ''
  const [first, ...rest] = s.split(/\s+/)
  // A full postcode typed without its space: the inward part is always digit + two letters.
  if (!rest.length && /^[A-Z]{1,2}\d[A-Z0-9]?\d[A-Z]{2}$/.test(first)) return first.slice(0, -3)
  return first
}

/** The letters-only postcode area ("SW" from "SW1A"). */
export const postcodeArea = postcode => (outwardCode(postcode).match(/^[A-Z]+/) || [''])[0]

function entryMatches(entry, outward) {
  if (/^[A-Z]+$/.test(entry)) return (outward.match(/^[A-Z]+/) || [''])[0] === entry
  if (outward === entry) return true
  return outward.startsWith(entry) && /[A-Z]/.test(outward.charAt(entry.length))
}

/**
 * The region whose most specific entry matches, or null.
 * @param {string} postcode
 * @param {{ postcodes: string[] }[]} regions  ▶ location_factors rows
 */
export function matchRegion(postcode, regions) {
  const outward = outwardCode(postcode)
  if (!outward) return null
  let best = null, bestLen = 0
  for (const region of regions || []) {
    for (const entry of region.postcodes || []) {
      if (entry.length > bestLen && entryMatches(entry, outward)) { best = region; bestLen = entry.length }
    }
  }
  return best
}

// ─── Validation ──────────────────────────────────────────────────────────────
// A postcode must have a valid format, a real postcode area and a district
// that exists in that area (CV14 is refused) — checked against every UK
// postcode district (lib/data/ukPostcodeDistricts.js, Royal Mail data).
const DISTRICTS = Object.fromEntries(Object.entries(UK_POSTCODE_DISTRICTS).map(([area, nums]) => [area, new Set(nums)]))

/** { ok: true } or { ok: false, reason } for an outward code or a full postcode. */
export function validatePostcode(postcode) {
  const raw = String(postcode || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim()
  if (!raw) return { ok: false, reason: 'Postcode is required' }
  const full = /^([A-Z]{1,2}\d[A-Z0-9]?)\s*\d[A-Z]{2}$/.exec(raw)
  const outward = full ? full[1] : raw
  if (!/^[A-Z]{1,2}\d{1,2}[A-Z]?$/.test(outward)) {
    return { ok: false, reason: `"${String(postcode).trim()}" is not a valid UK postcode — enter a postcode or its first part, e.g. B15 or CV4 7AL` }
  }
  const area = (outward.match(/^[A-Z]+/) || [''])[0]
  if (!DISTRICTS[area]) return { ok: false, reason: `"${area}" is not a UK postcode area` }
  const known = DISTRICTS[area]
  const district = Number((outward.slice(area.length).match(/^\d+/) || [''])[0])
  if (!known.has(district)) return { ok: false, reason: `${area}${district} is not a postcode district — check the postcode` }
  return { ok: true }
}
