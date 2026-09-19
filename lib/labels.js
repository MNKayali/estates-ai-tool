/**
 * lib/labels.js — questionnaire/report wording that depends on an answer.
 *
 * Pure, dependency-free, imported by the questionnaire (client), both report
 * renderers and the prose prompt builder, so the same project type gets the
 * same words everywhere.
 *
 * Q1.5 is stored as `q1_5_size` whatever the project type. For External Works
 * there is no internal floor area — a car park or landscaping scheme is priced
 * per m² of SITE — so the question, the report and the AI prompt all call the
 * same number "site area" rather than "GIFA". The key and the arithmetic are
 * unchanged; only the label is.
 */

export function isExternalWorks(projectType) {
  return String(projectType || '').toLowerCase().includes('external works')
}

/** Short noun for tables and headers: "GIFA" or "Site area". */
export function areaLabel(projectType) {
  return isExternalWorks(projectType) ? 'Site area' : 'GIFA'
}

/** Q1.5 question label. */
export function areaQuestionLabel(projectType) {
  return isExternalWorks(projectType)
    ? 'Q1.5 — Approximate site area (m²)'
    : 'Q1.5 — Approximate size (GIFA m²)'
}

/** Q1.5 help text. */
export function areaHelpText(projectType) {
  return isExternalWorks(projectType)
    ? 'Area of the external site being worked on, in square metres (paving, parking, landscaping, drainage). Used as the primary pricing quantity for external elements.'
    : 'Gross Internal Floor Area in square metres. Used as the primary pricing quantity for all elements.'
}
