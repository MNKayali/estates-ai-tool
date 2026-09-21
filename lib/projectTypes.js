/**
 * lib/projectTypes.js — the Q1.2 project-type axis, in one place.
 *
 * Imported by BOTH the client questionnaire (app/questionnaire/page.jsx) and
 * server route handlers (app/api/suggest-scope/route.js), so it must stay pure
 * JS with no React and no node-only imports — same constraint as
 * lib/buildingUse.js.
 *
 * Before this module the option list, VISIBLE_GROUPS and priceableFor existed
 * as two hand-synchronised copies that CLAUDE.md warned "must stay in step".
 * They are now one copy.
 *
 * September 2026: eight types became seven on a single axis — what the project
 * does to the building fabric. "Renewable Energy" described a scope rather than
 * a fabric operation and was removed; "Mixed" became "Other or mixed", an
 * explicit catch-all. Retired values survive in KV reports for 90 days, so
 * every lookup here tolerates them.
 */

export const PROJECT_TYPES = [
  { value: 'New Build',           help: 'A new standalone building or structure' },
  { value: 'Extension',           help: 'New floor area added to an existing building' },
  { value: 'Refurbishment',       help: 'Works to an existing building, including its fabric or envelope' },
  { value: 'Fit-out',             help: 'Internal fit-out or refit — no work to the building fabric' },
  { value: 'External works only', help: 'Site works with no building work' },
  { value: 'Demolition only',     help: 'Removing a structure, with no replacement in this project' },
  { value: 'Other or mixed',      help: 'Spans more than one of the above, or doesn\'t fit any. You choose exactly what\'s included in the scope list.' },
]

export const PROJECT_TYPE_VALUES = PROJECT_TYPES.map(t => t.value)

/** NRM1 groups the scope picker offers per project type. */
export const VISIBLE_GROUPS = {
  'New Build':           [0, 1, 2, 3, 4, 5, 6, 8],
  'Extension':           [0, 1, 2, 3, 4, 5, 6, 7, 8],
  'Refurbishment':       [0, 2, 3, 4, 5, 7, 8],
  // Fit-out changes what is inside the box, not the box: no facilitating
  // works, no superstructure or envelope, no work to existing, no externals.
  'Fit-out':             [3, 4, 5],
  'External works only': [0, 8],
  'Demolition only':     [0],
  'Other or mixed':      [0, 1, 2, 3, 4, 5, 6, 7, 8],
  // Retired values, kept so a 90-day-old KV report still resolves.
  'External Works':      [0, 8],
  'Demolition':          [0],
  'Mixed':               [0, 1, 2, 3, 4, 5, 6, 7, 8],
  'Renewable Energy':    [5, 8],
}

/**
 * Which rate-column family the calculator reads. Mirrors getRateForElement()
 * in lib/costCalculator.js, which matches on lowercase substrings — so
 * "Demolition only" and "External works only" resolve the same way the older
 * "Demolition" and "External Works" did.
 */
export function rateFamilyFor(projectType) {
  const pt = String(projectType || '').toLowerCase()
  if (pt.includes('new build')) return 'newBuild'
  if (pt.includes('extension')) return 'extension'
  if (pt.includes('external works')) return 'externalWorks'
  return 'refurb'
}

/**
 * Other or mixed spans new and existing work but can only pick one rate
 * family, and the substructure group has no refurbishment rate — so without a
 * fallback a mixed project silently carries no foundations at all. Scoped to
 * this one type: Refurbishment's own gaps (0.4, 8.10) are missing workbook
 * data, not a design flaw, and belong with the rate work.
 */
export function usesRateFallback(projectType) {
  const pt = String(projectType || '').toLowerCase()
  return pt.includes('other or mixed') || pt === 'mixed'
}

/**
 * Is this element offerable for this project type? An element with no rate in
 * the applicable family could only ever be excluded as "no applicable rate",
 * so the picker does not offer it.
 */
export function priceableFor(item, projectType) {
  if (!item?.priceable) return true   // older /api/scope-items payload — no flags, no filtering
  const family = rateFamilyFor(projectType)
  if (item.priceable[family]) return true
  if (usesRateFallback(projectType) && item.priceable.newBuild) return true
  return false
}
