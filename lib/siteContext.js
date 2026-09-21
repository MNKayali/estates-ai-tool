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

const HRB_USES = ['Residential', 'Student accommodation (PBSA / halls)', 'Healthcare']

/**
 * Higher-risk building under the Building Safety Act 2022: 18 m or 7+ storeys,
 * AND a residential, care-home or hospital use. A ten-storey office is not one.
 *
 * September 2026: derived from Section 1 rather than ticked in Q3.8. Height is
 * asked (Q1.6) because storeys alone cannot answer it — the statute is 18 m OR
 * 7 storeys, whichever comes first.
 *
 * The legacy branch is load-bearing: reports sit in KV for 90 days and
 * /api/compare re-runs the whole pipeline on their stored answers, so a report
 * generated when this was a Q3.8 tick must keep resolving to true.
 */
export function isHigherRiskBuilding(answers) {
  if (hasSiteContext(answers, 'higherRisk')) return true
  const tallEnough = String(answers?.q1_6_heightOver18m || '').trim() === 'Yes'
    || Number(answers?.q1_2_storeys) >= 7
  return tallEnough && HRB_USES.includes(answers?.q1_3_buildingUse)
}

/**
 * The answers so far make the height question worth asking — used only to
 * decide whether to show Q1.6's explanatory note, never by an engine.
 */
export function hrbLikelyFromAnswers(answers) {
  return (Number(answers?.q1_2_storeys) || 0) >= 5
    && HRB_USES.includes(answers?.q1_3_buildingUse)
}
