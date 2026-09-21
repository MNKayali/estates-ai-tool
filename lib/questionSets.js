/**
 * lib/questionSets.js — which questions each project type asks, and with which
 * options.
 *
 * Pure JS, no React and no node-only imports: imported by the questionnaire
 * (a 'use client' component) and available to server code. Same constraint as
 * lib/buildingUse.js and lib/projectTypes.js.
 *
 * ── The rule that governs every list in this file ────────────────────────────
 * The NRM1 Tab 3 percentage rules match answer option TEXT literally — 23 rules
 * quote a Section 3 answer ("Q3.1 = Asbestos known or suspected", "Q3.6 =
 * Fully occupied throughout"). So:
 *   · removing an option from a type's list is safe — the rule never fires
 *   · adding one is safe but inert until the workbook gains a rule for it
 *   · renaming one silently breaks the money rule that quotes it
 * Never rename. The options marked NEW below carry no Tab 3 rule yet and are
 * captured for the narrative only.
 */

// ── Q3.1 known issues ────────────────────────────────────────────────────────
export const KNOWN_ISSUE_NONE = 'None identified'
const UNSURE = 'Unsure — surveys needed'

// Original nine, every one of which a Tab 3 rule quotes except the none option.
const BUILDING_ISSUES = [
  'Asbestos known or suspected',
  'Structural concerns',
  'Ageing or inadequate M&E',
  'Damp or water ingress',
  'Drainage issues',
  'Fire safety deficiencies',
]
// NEW — no Tab 3 rule yet.
const GROUND_ISSUES = [
  'Made ground or fill',
  'High water table',
  'Underground services or obstructions',
  'Trees or hedgerow on site',
]

const KNOWN_ISSUES_BY_TYPE = {
  'New Build': [
    'Contaminated land', ...GROUND_ISSUES,
    'Existing structures on site to demolish',   // NEW
  ],
  'Refurbishment': [...BUILDING_ISSUES, 'Contaminated land'],
  // A fit-out often sits in an old building, so damp and structural stay.
  // Contamination is the landlord's problem, not the fit-out's.
  'Fit-out': [...BUILDING_ISSUES],
  // The widest list of any type — an extension carries both sets of risk.
  'Extension': [
    ...BUILDING_ISSUES, 'Contaminated land', ...GROUND_ISSUES,
    'Existing structures on site to demolish',
  ],
  'External works only': [
    'Contaminated land', ...GROUND_ISSUES,
    'Existing hardstanding to break out',        // NEW
  ],
  'Demolition only': [
    'Asbestos known or suspected', 'Structural concerns', 'Contaminated land',
    'Structures attached to neighbouring buildings',  // NEW
  ],
}

const ALL_KNOWN_ISSUES = [
  ...BUILDING_ISSUES, 'Contaminated land', ...GROUND_ISSUES,
  'Existing structures on site to demolish',
  'Existing hardstanding to break out',
  'Structures attached to neighbouring buildings',
]

/** Q3.1 options for a project type. Always ends with the none option. */
export function knownIssuesFor(projectType) {
  const base = KNOWN_ISSUES_BY_TYPE[projectType] || ALL_KNOWN_ISSUES
  return [...base, UNSURE, KNOWN_ISSUE_NONE]
}

// ── Q3.3 surveys ─────────────────────────────────────────────────────────────
export const SURVEY_NONE = 'None'
const ASBESTOS_MANAGEMENT = 'Asbestos management survey'
const ASBESTOS_RD = 'Asbestos refurbishment & demolition survey'

// NEW — no Tab 3 rule yet.
const SITE_SURVEYS = [
  'Topographic',
  'Ground investigation',
  'Contamination survey (Phase 1 / Phase 2)',
  'Ecological appraisal',
  'Biodiversity Net Gain assessment',
  'Arboricultural survey (BS5837)',
  'Utilities / statutory services search',
]

const SURVEYS_BY_TYPE = {
  'New Build': [...SITE_SURVEYS, 'Flood risk assessment', 'Archaeological assessment'],
  'Refurbishment': [
    ASBESTOS_MANAGEMENT, ASBESTOS_RD,
    'Structural', 'Condition', 'Topographic', 'Ground investigation',
    'Energy audit', 'Fire risk assessment',
  ],
  'Fit-out': [ASBESTOS_MANAGEMENT, ASBESTOS_RD, 'Condition', 'Fire risk assessment'],
  'Extension': [
    ASBESTOS_MANAGEMENT, ASBESTOS_RD, 'Structural', 'Condition',
    ...SITE_SURVEYS, 'Flood risk assessment', 'Archaeological assessment',
  ],
  'External works only': [...SITE_SURVEYS, 'Drainage / percolation testing'],
  'Demolition only': [ASBESTOS_RD, 'Structural', 'Ecological appraisal'],
}

const ALL_SURVEYS = [
  ASBESTOS_MANAGEMENT, ASBESTOS_RD, 'Structural', 'Condition',
  ...SITE_SURVEYS, 'Flood risk assessment', 'Archaeological assessment',
  'Drainage / percolation testing', 'Energy audit', 'Fire risk assessment',
]

/**
 * Q3.3 options for a project type, gated on Q1.4 building age.
 *
 * Asbestos was fully banned in the UK in 1999, so a post-2000 building has
 * nothing to survey and offering the option invites a cost for nothing. The
 * building-age bands exist for exactly this — see their comment in the
 * questionnaire — it was simply never wired to this question.
 */
export function surveysFor(projectType, buildingAge) {
  const base = SURVEYS_BY_TYPE[projectType] || ALL_SURVEYS
  const postMillennium = String(buildingAge || '').trim() === 'Post-2000'
  const filtered = postMillennium ? base.filter(s => !/asbestos/i.test(s)) : base
  return [...filtered, SURVEY_NONE, 'Other']
}

// ── Q3.6 occupation — COPY ONLY. The stored values never change, because four
// Tab 3 rules quote them verbatim.
const OCCUPATION_COPY = {
  'New Build': {
    label: 'Q3.6 — Is the surrounding site in use during the works?',
    help: 'A live campus or operating site around the plot constrains working hours and deliveries, and is allowed for in preliminaries.',
  },
  'Extension': {
    label: 'Q3.6 — Does the existing building stay in use during the works?',
    help: 'Building an extension alongside an occupied building constrains noise, dust, access and working hours.',
  },
  'External works only': {
    label: 'Q3.6 — Does the site stay in use during the works?',
    help: 'A car park or access road resurfaced in sections costs more than one closed and done in a single pass.',
  },
  'Demolition only': {
    label: 'Q3.6 — Are adjacent buildings occupied, or the surrounding site operational?',
    help: 'The building being demolished is empty by definition. What drives cost is what is next to it.',
  },
}
const OCCUPATION_DEFAULT = {
  label: 'Q3.6 — Occupation during works',
  help: 'Affects construction duration and preliminary costs.',
}

/** Label and help text for Q3.6. The OPTIONS are unchanged for every type. */
export function occupationCopyFor(projectType) {
  return OCCUPATION_COPY[projectType] || OCCUPATION_DEFAULT
}

// ── Question visibility ──────────────────────────────────────────────────────
// questionKey → project types that do NOT ask it. Anything absent is asked by
// everyone, so an unknown project type shows the whole form.
const HIDDEN_FOR = {
  q3_2_previousWorks:     ['New Build', 'External works only'],
  q1_4_buildingAge:       ['New Build', 'External works only'],
  q2_4_specLevel:         ['External works only', 'Demolition only'],
  q5_1_financialBenefit:  ['Demolition only'],
  q5_2_annualBenefit:     ['Demolition only'],
}

export function isQuestionShown(questionKey, projectType) {
  const hidden = HIDDEN_FOR[questionKey]
  if (!hidden) return true
  return !hidden.includes(projectType)
}

/**
 * Q1.6 building height appears at 5 storeys, the point at which 18 m first
 * becomes possible. Storeys alone cannot answer the question — the statute is
 * 18 m OR 7 storeys, whichever comes first, and a six-storey hospital with
 * tall floor-to-floors clears 18 m easily.
 */
export function showsHeightQuestion(storeys) {
  return (Number(storeys) || 0) >= 5
}
