/**
 * buildingUse.js — Shared, dependency-free building-use filter.
 *
 * Imported by BOTH the client scope picker (app/questionnaire/page.jsx) and the
 * server cost engine (lib/costCalculator.js), so it must stay pure JS with no
 * node-only imports (no xlsx, no fs).
 *
 * The NRM1 v4.5 "Master Cost Table" tags every item with a Building Use cell —
 * a comma-separated list of tokens, or "All" / "Non-Residential". A user's
 * Q1.3 building-use answer maps to a set of tags; an item is shown when its
 * tokens include "All", or "Non-Residential" (for non-residential uses), or any
 * token matches one of the mapped tags.
 */

// Q1.3 option string → workbook tokens (tags) it reveals. Keys MUST match the
// Q1.3 <option> values in the questionnaire exactly.
export const BUILDING_USE_TAGS = {
  'Residential': ['residential'],
  'Student accommodation (PBSA / halls)': ['residential'],
  'Commercial offices': ['office', 'commercial'],
  'Education': ['education'],
  'Healthcare': ['healthcare'],
  'Retail': ['retail'],
  'Industrial / warehouse': ['industrial'],
  'Hospitality / leisure': ['hospitality', 'sports'],
}

// Uses that show the full list (no use restriction). Anything not in
// BUILDING_USE_TAGS (incl. blank / unknown) is treated as wildcard too.
const WILDCARD_USES = new Set(['Mixed use', 'Other'])

function isWildcard(buildingUse) {
  const bu = buildingUse || ''
  if (WILDCARD_USES.has(bu)) return true
  return !Object.prototype.hasOwnProperty.call(BUILDING_USE_TAGS, bu)
}

/** Residential uses keep Non-Residential items hidden. */
export function isNonResidential(buildingUse) {
  const tags = BUILDING_USE_TAGS[buildingUse]
  if (!tags) return true // wildcard / unknown — treat as non-residential (shows everything anyway)
  return !tags.includes('residential')
}

/**
 * @param {string} rawTokens  the workbook "Building Use" cell (e.g. "Education, Office, Commercial")
 * @param {string} buildingUse the Q1.3 answer
 * @returns {boolean} whether the item is visible for this building use
 */
export function matchesBuildingUse(rawTokens, buildingUse) {
  if (isWildcard(buildingUse)) return true
  const tokens = String(rawTokens || '')
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean)
  if (tokens.length === 0) return true // untagged row — never hide
  if (tokens.includes('all')) return true
  if (tokens.includes('non-residential') && isNonResidential(buildingUse)) return true
  const tags = BUILDING_USE_TAGS[buildingUse] || []
  // Match remaining use tokens by tag. Exclude the special tokens (handled above);
  // "non-residential" notably *contains* the substring "residential" and must not
  // leak into the residential match. A token like "hospitality (guest room)" still
  // matches the "hospitality" tag via substring.
  const useTokens = tokens.filter(t => t !== 'all' && t !== 'non-residential')
  return useTokens.some(tok => tags.some(tag => tok.includes(tag)))
}
