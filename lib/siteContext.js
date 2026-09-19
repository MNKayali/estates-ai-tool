/**
 * lib/siteContext.js — Q3.8 "Site and building context" (September 2026).
 *
 * Pure and dependency-free: imported by the questionnaire (client), both
 * calculators, and the prose seed builder, so the option wording and the
 * tests that key on it live in exactly one place.
 *
 * Each option is matched by the substring in SITE_CONTEXT, not the full
 * string, so the questionnaire can reword an option without breaking the
 * engines as long as the key phrase survives.
 */

export const SITE_CONTEXT_OPTIONS = [
  'Conservation area or Article 4 direction',
  'Attached to or within 3 m of a neighbouring building (party wall)',
  'Higher-risk building — 7+ storeys or 18 m+, residential / care / hospital use',
  'Ecological features — roof voids, mature trees, water bodies, bat roost potential',
  'None of these',
]
export const SITE_CONTEXT_NONE = 'None of these'

export const SITE_CONTEXT = {
  conservation: 'conservation area',
  partyWall:    'party wall',
  higherRisk:   'higher-risk building',
  ecology:      'ecological features',
}

export function hasSiteContext(answers, key) {
  const needle = SITE_CONTEXT[key]
  if (!needle) return false
  return (answers?.q3_8_siteContext || []).some(v => String(v).toLowerCase().includes(needle))
}

export function isHigherRiskBuilding(answers) {
  return hasSiteContext(answers, 'higherRisk')
}

// The answers already given make HRB status likely: 7+ storeys with a
// residential, care or hospital use. Used only for an on-screen hint under
// the Q3.8 option — the user confirms; the engines never infer it.
const HRB_USES = ['Residential', 'Student accommodation (PBSA / halls)', 'Healthcare']
export function hrbLikelyFromAnswers(answers) {
  return Number(answers?.q1_2_storeys) >= 7 && HRB_USES.includes(answers?.q1_3_buildingUse)
}
