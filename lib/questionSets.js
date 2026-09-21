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
  q1_2_storeys:           ['Fit-out', 'External works only', 'Demolition only', 'Other or mixed'],
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

// ── Section inventory, for counting what is ahead ────────────────────────────
// Listed in render order. Only used for counts and for the required test —
// the questionnaire still renders each question itself.
export const QUESTIONS_BY_SECTION = {
  1: ['q1_0_projectName', 'q1_1_postcode', 'q1_2_projectType', 'q1_2_storeys',
      'q1_3_buildingUse', 'q1_4_buildingAge', 'q1_6_heightOver18m', 'q1_5_size'],
  2: ['q2_1_objective', 'q2_3_interventionLevel', 'q2_2_scopeItems',
      'q2_4_specLevel', 'q2_5_standards'],
  3: ['q3_1_knownIssues', 'q3_2_previousWorks', 'q3_3_surveys', 'q3_4_planningConsents',
      'q3_5_accessConstraints', 'q3_6_occupation', 'q3_7_additionalContext',
      'q3_8_siteContext'],
  4: ['q4_1_targetDate', 'q4_0_startDate', 'q4_3_budget', 'q4_4_priorities',
      'q4_5_designStage', 'q4_6_phasing', 'q4_7_funding',
      'q5_1_financialBenefit', 'q5_2_annualBenefit', 'q6_2_instructions'],
}

/**
 * Questions whose blank answer silently becomes a priced assumption.
 *
 * September 2026: the six Section 3 entries and q4_5_designStage were all
 * marked optional while a blank meant "no risk uplift", "no planning
 * development cost", "the building is empty", and so on — assumptions the user
 * never made. Each already has a one-click None / Unsure / No-constraints
 * option, so requiring them costs a tap and buys an honest report.
 *
 * Anything NOT here is genuinely optional: blank is either harmless or already
 * disclosed in the report ("assumed: the report date", "no budget comparison").
 */
const REQUIRED_KEYS = new Set([
  'q1_0_projectName', 'q1_1_postcode', 'q1_2_projectType', 'q1_3_buildingUse',
  'q1_4_buildingAge', 'q1_5_size',
  'q2_1_objective', 'q2_2_scopeItems', 'q2_3_interventionLevel', 'q2_4_specLevel',
  'q3_1_knownIssues', 'q3_3_surveys', 'q3_4_planningConsents',
  'q3_5_accessConstraints', 'q3_6_occupation', 'q3_8_siteContext',
  'q4_5_designStage',
])

/**
 * Required, but ONLY where the question is actually shown. A question demanded
 * while hidden deadlocks its section with an error the user can neither see nor
 * clear — that is what slice 2 shipped and had to fix, and every caller must go
 * through this function rather than test the set directly.
 */
export function isQuestionRequired(questionKey, projectType) {
  return REQUIRED_KEYS.has(questionKey) && isQuestionShown(questionKey, projectType)
}

// Two questions in section 1 and one in section 4 depend on an ANSWER rather
// than the project type, so counting needs the answers as well.
function isOnScreen(questionKey, projectType, answers) {
  if (!isQuestionShown(questionKey, projectType)) return false
  if (questionKey === 'q1_6_heightOver18m') return showsHeightQuestion(answers?.q1_2_storeys)
  if (questionKey === 'q5_2_annualBenefit') {
    const b = answers?.q5_1_financialBenefit
    const list = Array.isArray(b) ? b : (b ? [b] : [])
    return list.length > 0 && !list.some(v => String(v).startsWith('No direct'))
  }
  return true
}

function isAnswered(value) {
  if (Array.isArray(value)) return value.length > 0
  if (value === null || value === undefined) return false
  return String(value).trim() !== ''
}

/** How many questions this section holds for this user, and how many need an answer. */
export function sectionCounts(section, projectType, answers = {}) {
  const keys = (QUESTIONS_BY_SECTION[section] || [])
    .filter(k => isOnScreen(k, projectType, answers))
  return {
    total: keys.length,
    required: keys.filter(k => isQuestionRequired(k, projectType)).length,
  }
}

/** The required questions in this section that still have no answer. */
export function unansweredRequired(section, projectType, answers = {}) {
  return (QUESTIONS_BY_SECTION[section] || [])
    .filter(k => isOnScreen(k, projectType, answers))
    .filter(k => isQuestionRequired(k, projectType))
    .filter(k => !isAnswered(answers[k]))
}

/**
 * Progress by section, not by question — the user asked for page-level.
 * Reaches 100% only on submit, so it never overstates how far along someone is.
 */
export function progressPercent(section, totalSections) {
  if (!totalSections) return 0
  return Math.round(((section - 1) / totalSections) * 100)
}
