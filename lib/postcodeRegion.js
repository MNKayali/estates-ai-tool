/**
 * lib/postcodeRegion.js — which ▶ location_factors region a postcode falls in.
 *
 * Pure, no imports: used by the cost engine (lib/costCalculator.js) and by the
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
// A postcode must have a valid format and a real postcode area. Where the
// district numbers of an area are known, a district that does not exist
// (CV14) is refused too. Only the areas in DISTRICTS_BY_AREA are checked at
// district level — an area missing from it accepts any well-formed district
// rather than reject a real one; extend the table from the Royal Mail
// postcode-district list as areas are confirmed.
const AREAS = new Set(('AB AL B BA BB BD BH BL BN BR BS BT CA CB CF CH CM CO CR CT CV CW DA DD DE DG DH DL DN DT DY E EC EH EN EX FK FY G GL GU GY HA HD HG HP HR HS HU HX IG IM IP IV JE KA KT KW KY L LA LD LE LL LN LS LU M ME MK ML N NE NG NN NP NR NW OL OX PA PE PH PL PO PR RG RH RM S SA SE SG SK SL SM SN SO SP SR SS ST SW SY TA TD TF TN TQ TR TS TW UB W WA WC WD WF WN WR WS WV YO ZE').split(' '))

/** District numbers that exist, by postcode area. */
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
const DISTRICTS_BY_AREA = {
  CV: new Set([...range(1, 13), 21, 22, 23, ...range(31, 37), 47]),
}

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
  if (!AREAS.has(area)) return { ok: false, reason: `"${area}" is not a UK postcode area` }
  const known = DISTRICTS_BY_AREA[area]
  const district = Number((outward.slice(area.length).match(/^\d+/) || [''])[0])
  if (known && !known.has(district)) return { ok: false, reason: `${area}${district} is not a postcode district — check the postcode` }
  return { ok: true }
}
