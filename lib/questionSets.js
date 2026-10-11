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
  // NRM1 v5.2 ▶ project_types: only Refurbishment and Fit-out use level of
  // intervention (confirmed 23 September 2026). Extension prices on its own
  // Ext columns with no band multiplier.
  q2_3_interventionLevel: ['New Build', 'Extension', 'External works only', 'Demolition only', 'Other or mixed'],
  q2_4_specLevel:         ['External works only', 'Demolition only'],
  q5_1_financialBenefit:  ['Demolition only'],
  q5_2_annualBenefit:     ['Demolition only'],
  // Demolition only and Other or mixed ask storeys since October 2026 (their
  // footprint was the whole floor area without it).
  q1_2_storeys:           ['Fit-out', 'External works only'],
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
export const STOREYS_MAX = 80

// ── Industrial / warehouse: offices share and main space (October 2026) ──────
// Asked on New Build and Extension only (on a refurbishment or fit-out the
// area is already the area of works). Q1.3a is the share of the floor that is
// offices, welfare and staff areas, in %; blank = the NRM1 workbook's
// suggestion (▶ quantity_ratios office_share). Q1.3b says what the rest is.
// The workbook's quantity rules (inputs OFFICES and PRODUCTION) do the rest.
export const INDUSTRIAL_USE = 'Industrial / warehouse'
export const MAIN_SPACE = { storage: 'Storage / warehouse', factory: 'Factory / production' }
export const MAIN_SPACE_OPTIONS = Object.values(MAIN_SPACE)
export function asksOfficeSplit(answers) {
  return answers?.q1_3_buildingUse === INDUSTRIAL_USE && ['New Build', 'Extension'].includes(answers?.q1_2_projectType)
}
/** Q1.3a as a number 0–100, or undefined when blank or out of range. */
export function officeSharePct(answers) {
  const v = answers?.q1_3a_officeShare
  if (v === '' || v === null || v === undefined) return undefined
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined
}

export function showsHeightQuestion(storeys) {
  return (Number(storeys) || 0) >= 5
}

// ── Q3.5 access and working restrictions (October 2026) ─────────────────────
// Redesigned with the owner after test batch 3: "Term-time only working" was
// read both ways (vacation-only and term-only) and never moved a date, and
// only two of the eight options changed the cost. Each option now has a
// stable key; `accessFlags()` reads both these labels and the old ones, so
// drafts and KV reports from before the change keep their meaning. The
// cost workbook's percentage rules and the programme's ACC tiers test the
// flags, not the label text.
export const ACCESS = {
  periods:    'Works limited to certain periods (holidays, seasons or blackout dates)',
  hours:      'Restricted working hours (no noisy work, no weekends)',
  shared:     'Access routes shared with occupiers, neighbours or the public',
  deliveries: 'Restricted deliveries or no vehicle access',
  tight:      'Tight site: little storage space, headroom or weight limits',
  road:       'Site fronts a public road or pavement (hoarding, scaffold or crane licence)',
  none:       'No access constraints',
  other:      'Other',
}
// "Works limited to certain periods" is no longer offered (October 2026): when
// in the year work can happen is asked once, in Section 4 (Q4.2a / Q4.2b,
// construction blackouts). ACCESS.periods stays only so reports and drafts
// that ticked it keep their meaning.
export const ACCESS_OPTIONS = Object.values(ACCESS).filter(o => o !== ACCESS.periods)
export const ACCESS_NONE = ACCESS.none

// Old label → new label (Term-time only working also sets the holidays window).
const LEGACY_ACCESS = {
  'Restricted working hours': ACCESS.hours,
  'Shared access with other occupiers': ACCESS.shared,
  'No vehicle access or restricted deliveries': ACCESS.deliveries,
  'Height or weight restrictions on site': ACCESS.tight,
  'Scaffold licence or highway encroachment required': ACCESS.road,
  'Term-time only working': ACCESS.periods,
}

// Q3.5a, asked only when ACCESS.periods is ticked.
export const WORK_WINDOW = {
  holidays: 'School / university holidays only',
  except:   'Any time except set dates',
  only:     'Only within set dates',
}
export const WORK_WINDOW_OPTIONS = Object.values(WORK_WINDOW)
export const WORK_PERIODS_MAX = 3

/** Q3.5 answers with old labels translated (order kept, duplicates dropped). */
export function migrateAccessAnswers(list) {
  if (!Array.isArray(list)) return list
  return [...new Set(list.map(a => LEGACY_ACCESS[a] || a))]
}

/** Which Q3.5 restrictions apply, from current or old labels. */
export function accessFlags(answers) {
  const ac = (Array.isArray(answers?.q3_5_accessConstraints) ? answers.q3_5_accessConstraints : [])
    .map(a => String(a).toLowerCase())
  // "No access constraints" wins over anything ticked beside it (the form
  // makes them exclusive; an old or API answer may not have).
  const none = ac.some(a => a.includes('no access constraints'))
  const has = (...keys) => !none && ac.some(a => keys.some(k => a.includes(k)))
  return {
    periods:    has('certain periods', 'term-time'),
    hours:      has('restricted working'),
    shared:     has('shared'),
    deliveries: has('deliveries', 'no vehicle'),
    tight:      has('tight site', 'height or weight'),
    road:       has('public road', 'scaffold licence'),
  }
}

/**
 * The construction window from Q3.5a: { type: 'holidays' | 'except' | 'only',
 * periods: [{ from, to }] } or null when works may happen any time. An old
 * "Term-time only working" answer means holidays only.
 */
export function workWindow(answers) {
  if (!accessFlags(answers).periods) return null
  const legacyTermTime = (answers?.q3_5_accessConstraints || []).some(a => String(a).toLowerCase().includes('term-time'))
  const choice = String(answers?.q3_5a_workWindow || '')
  const type = choice === WORK_WINDOW.except ? 'except' : choice === WORK_WINDOW.only ? 'only'
    : choice === WORK_WINDOW.holidays || legacyTermTime ? 'holidays' : null
  if (!type) return null
  const iso = /^\d{4}-\d{2}-\d{2}$/
  const periods = (Array.isArray(answers?.q3_5b_workPeriods) ? answers.q3_5b_workPeriods : [])
    .filter(p => iso.test(p?.from || '') && iso.test(p?.to || '') && p.from <= p.to)
    .slice(0, WORK_PERIODS_MAX)
  if (type !== 'holidays' && !periods.length) return null
  return { type, periods: type === 'holidays' ? [] : periods }
}

// ── Q4.2a / Q4.2b construction blackouts (October 2026, owner's design) ──────
// One simple question in Section 4: are there periods when construction work
// cannot take place on site? If yes, the user ticks one or more periods: the
// options for their building use (Programme workbook Modifiers rows BLK-*,
// repeated every year) and/or specific dates (up to three ranges). Every ticked
// period is blocked; construction is fitted around them. Choices only, no free
// text. Replaces Q3.5 "Works limited to certain periods" with Q3.5a / Q3.5b.
export const BLACKOUT = { no: 'No', yes: 'Yes' }
export const BLACKOUT_OPTIONS = Object.values(BLACKOUT)
export const BLACKOUT_DATES = 'Specific dates'
export const BLACKOUT_DATES_MAX = 3

/** The building-use options from the workbook (`{ id, label, uses }`) that this building use sees. */
export function blackoutOptionsFor(options, buildingUse) {
  return (Array.isArray(options) ? options : []).filter(o => (o.uses || []).includes(buildingUse))
}

/** Q4.2c specific date ranges that are complete and in order. */
function validBlackoutDates(answers) {
  const iso = /^\d{4}-\d{2}-\d{2}$/
  return (Array.isArray(answers?.q4_2c_blackoutDates) ? answers.q4_2c_blackoutDates : [])
    .filter(p => iso.test(p?.from || '') && iso.test(p?.to || '') && p.from <= p.to)
    .slice(0, BLACKOUT_DATES_MAX)
}

/**
 * The blocked periods the programme fits construction around:
 * { type: 'blackout', labels, recurring: [['MM-DD', 'MM-DD'], …], periods: [{ from, to }] },
 * or null when there are none. `options` are the workbook's BLK rows with
 * their `ranges`; a ticked option the building use no longer sees is ignored.
 */
export function blackoutPlan(answers, options) {
  if (answers?.q4_2a_blackout !== BLACKOUT.yes) return null
  const ticked = Array.isArray(answers?.q4_2b_blackouts) ? answers.q4_2b_blackouts : []
  const chosen = blackoutOptionsFor(options, answers?.q1_3_buildingUse).filter(o => ticked.includes(o.label))
  const periods = ticked.includes(BLACKOUT_DATES) ? validBlackoutDates(answers) : []
  if (!chosen.length && !periods.length) return null
  return {
    type: 'blackout',
    labels: [...chosen.map(o => o.label), ...(periods.length ? ['On specific dates'] : [])],
    recurring: chosen.flatMap(o => o.ranges),
    periods,
  }
}

// ── Q4.3a VAT (October 2026, owner's decision) ──────────────────────────────
// The budget check added 20% VAT to everything, so a zero-rated housing
// scheme or a council that recovers VAT showed a shortfall it did not have.
// New-build homes are zero-rated without asking; otherwise Q4.3a (shown with
// a budget) says how much of the VAT the budget has to carry.
export const VAT_RECOVERY = {
  full:    'Yes — fully',
  partly:  'Partly',
  no:      'No',
  unsure:  'Not sure',
}
export const VAT_RECOVERY_OPTIONS = Object.values(VAT_RECOVERY)

/** New-build dwellings: zero-rated for VAT (VAT Act 1994 Sch 8 Group 5). */
export function isZeroRatedNewBuild(answers) {
  return answers?.q1_2_projectType === 'New Build' && answers?.q1_3_buildingUse === 'Residential'
}

/**
 * The share of the VAT the budget must carry: 0 (zero-rated, or recovered in
 * full), `partlyShare` when partly recovered (NRM1 ▶ factors vat_partly_share,
 * passed on by the cost engine as cost.vatPartlyShare) or 1 (not recovered /
 * not sure / not answered), with the reason in words.
 */
export function vatBasis(answers, partlyShare) {
  if (isZeroRatedNewBuild(answers)) return { share: 0, reason: 'new-build homes are zero-rated for VAT' }
  const v = String(answers?.q4_3a_vatRecovery || '')
  if (v === VAT_RECOVERY.full) return { share: 0, reason: 'the client recovers VAT, so it is left out' }
  if (v === VAT_RECOVERY.partly) {
    const share = Number(partlyShare)
    if (!(share >= 0 && share <= 1)) throw new Error('VAT basis: no vat_partly_share from the NRM1 workbook')
    return { share, reason: `the client recovers part of the VAT; ${share === 0.5 ? 'half' : `${Math.round(share * 100)}%`} is counted` }
  }
  return { share: 1, reason: v === VAT_RECOVERY.no ? 'the client cannot recover VAT' : 'VAT recovery not confirmed, so full VAT is counted' }
}

// ── Q4.4 priorities and the procurement client type ──────────────────────────
// The seven Q4.4 options, in the order the questionnaire shows them. The
// Procurement Reference workbook ('1. Drivers', Client top priority rows) is
// matched against these labels — its loader rejects a workbook that has lost
// one — so they live here, not in the page, where both can import them.
// Q4.4 is ranked: `q4_4_priorities` is in the client's order of importance.
export const PRIORITY_OPTIONS = [
  'Lowest cost', 'Fixed / certain final cost', 'Speed', 'Design quality',
  'Flexibility', 'Minimise disruption', 'Funder / compliance requirement',
]

export const PRIORITY_MAX = 3

export const PUBLIC_CLIENT_OPTIONS = ['Yes', 'No']

/**
 * The client's top priority: rank 1 of Q4.4. Older drafts hold their ticks in
 * the order they were made, and the old form treated the first tick as the
 * primary one, so their first entry is still the right answer. '' when
 * nothing is ticked.
 */
export function topPriority(answers) {
  const ranked = Array.isArray(answers?.q4_4_priorities) ? answers.q4_4_priorities : []
  return ranked.length ? String(ranked[0]) : ''
}

// ── Q4.6 phased construction ────────────────────────────────────────────────
// Phasing applies to construction only: design, planning and tender run once.
// When Q4.6 is "Multiple phases" the form asks how many phases (Q4.6a, 2–10)
// and the gap between one phase finishing and the next starting (Q4.6b,
// weeks, 0 allowed — decant, moving occupants, or waiting for the next
// vacation). The owner's decision (5 Oct 2026): the gap is the user's input,
// never assumed.
export const PHASE_COUNT_MIN = 2
export const PHASE_COUNT_MAX = 10
export const PHASE_GAP_MAX = 52

export function isPhased(answers) {
  return String(answers?.q4_6_phasing || '').toLowerCase().includes('multiple')
}

/**
 * The phase plan the programme uses: { count, gapWeeks }, or null for a
 * single phase or an older report that said "Multiple phases" without the
 * follow-up answers (that one keeps the Modifiers PH-1 uplift).
 */
export function phasePlan(answers) {
  if (!isPhased(answers)) return null
  const count = Math.round(Number(answers?.q4_6a_phaseCount))
  if (!(count >= PHASE_COUNT_MIN && count <= PHASE_COUNT_MAX)) return null
  const rawGap = answers?.q4_6b_phaseGapWeeks
  const gap = Number(rawGap)
  if (rawGap === undefined || rawGap === null || String(rawGap).trim() === '' || !(gap >= 0 && gap <= PHASE_GAP_MAX)) return null
  return { count, gapWeeks: Math.round(gap) }
}

/** Q4.8 as true / false, or null when unanswered (an older draft). */
export function publicClient(answers) {
  const v = String(answers?.q4_8_publicClient || '').trim().toLowerCase()
  return v === 'yes' ? true : v === 'no' ? false : null
}

// ── Section inventory, for counting what is ahead ────────────────────────────
// Listed in render order. Only used for counts and for the required test —
// the questionnaire still renders each question itself.
export const QUESTIONS_BY_SECTION = {
  1: ['q1_0_projectName', 'q1_1_postcode', 'q1_2_projectType', 'q1_2_storeys',
      'q1_3_buildingUse', 'q1_3a_officeShare', 'q1_3b_mainSpace', 'q1_4_buildingAge', 'q1_6_heightOver18m', 'q1_5_size'],
  2: ['q2_1_objective', 'q2_3_interventionLevel', 'q2_2_scopeItems',
      'q2_4_specLevel', 'q2_5_standards'],
  3: ['q3_1_knownIssues', 'q3_2_previousWorks', 'q3_3_surveys', 'q3_4_planningConsents',
      'q3_5_accessConstraints',
      'q3_6_occupation', 'q3_7_additionalContext',
      'q3_8_siteContext'],
  4: ['q4_1_targetDate', 'q4_0_startDate', 'q4_2a_blackout', 'q4_2b_blackouts', 'q4_2c_blackoutDates', 'q4_3_budget', 'q4_3a_vatRecovery', 'q4_4_priorities',
      'q4_5_designStage', 'q4_6_phasing', 'q4_6a_phaseCount', 'q4_6b_phaseGapWeeks', 'q4_7_funding',
      'q4_8_publicClient',
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
  // Industrial new build / extension (October 2026): what the rest of the floor
  // is. Q1.3a (the offices share) may stay blank — the workbook suggests one.
  'q1_3b_mainSpace',
  'q2_1_objective', 'q2_2_scopeItems', 'q2_3_interventionLevel', 'q2_4_specLevel',
  'q3_1_knownIssues', 'q3_3_surveys', 'q3_4_planningConsents',
  'q3_5_accessConstraints', 'q3_6_occupation', 'q3_8_siteContext',
  // Construction blackouts (October 2026): yes / no always; the periods when
  // yes; the dates only when "Specific dates" is ticked.
  'q4_2a_blackout', 'q4_2b_blackouts', 'q4_2c_blackoutDates',
  'q4_5_designStage',
  // Phased construction (October 2026): asked only when Q4.6 is "Multiple
  // phases" (isOnScreen), and both decide the construction period.
  'q4_6a_phaseCount', 'q4_6b_phaseGapWeeks',
  // Procurement driver (September 2026): a blank client type silently
  // removes the framework and negotiated routes to market.
  'q4_8_publicClient',
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

// Two questions in section 1 and three in section 4 depend on an ANSWER rather
// than the project type, so counting needs the answers as well.
function isOnScreen(questionKey, projectType, answers) {
  if (!isQuestionShown(questionKey, projectType)) return false
  if (questionKey === 'q1_6_heightOver18m') {
    // Also require that the project type shows the storeys question, and can
    // be a higher-risk building (Demolition only asks storeys, not height).
    if (!isQuestionShown('q1_2_storeys', projectType) || projectType === 'Demolition only') return false
    return showsHeightQuestion(answers?.q1_2_storeys)
  }
  if (questionKey === 'q1_3a_officeShare' || questionKey === 'q1_3b_mainSpace') return asksOfficeSplit(answers)
  if (questionKey === 'q4_3a_vatRecovery') return Number(answers?.q4_3_budget) > 0 && !isZeroRatedNewBuild(answers)
  if (questionKey === 'q4_2b_blackouts') return answers?.q4_2a_blackout === BLACKOUT.yes
  if (questionKey === 'q4_2c_blackoutDates') {
    return answers?.q4_2a_blackout === BLACKOUT.yes &&
      Array.isArray(answers?.q4_2b_blackouts) && answers.q4_2b_blackouts.includes(BLACKOUT_DATES)
  }
  if (questionKey === 'q4_6a_phaseCount' || questionKey === 'q4_6b_phaseGapWeeks') {
    return isPhased(answers)
  }
  if (questionKey === 'q5_2_annualBenefit') {
    // Match the questionnaire: non-array values are discarded, not wrapped.
    const b = answers?.q5_1_financialBenefit
    const list = Array.isArray(b) ? b : []
    return list.length > 0 && !list.some(v => String(v).startsWith('No direct'))
  }
  return true
}

// Keys that render on screen only inside a collapsed disclosure (the
// financial-case block and the report-instructions block at the end of
// Section 4 — see Disclosure/showFinancialCase/showReportInstructions in
// app/questionnaire/page.jsx). None of these is required.
//
// QUESTIONS_BY_SECTION[4] carries all ten of Section 4's keys because
// sectionCounts()/unansweredRequired() need the full inventory to filter by
// isOnScreen — but a header reading "9 questions" above seven rendered cards
// (three more folded behind two disclosures) contradicts the fold this same
// branch shipped. Excluding these three from `total` while still counting how
// many of them are on screen (`optionalExtras`) keeps the header honest about
// both numbers at once.
const DISCLOSURE_EXTRAS = new Set([
  'q5_1_financialBenefit', 'q5_2_annualBenefit', 'q6_2_instructions',
])

// Required keys for which 0 is a real answer: no gap between phases.
const ZERO_IS_AN_ANSWER = new Set(['q4_6b_phaseGapWeeks'])

function isAnswered(value, questionKey) {
  if (Array.isArray(value)) return value.length > 0
  if (value === null || value === undefined) return false
  if (ZERO_IS_AN_ANSWER.has(questionKey)) return String(value).trim() !== ''
  // Treat 0 and '0' as unanswered: no other key in REQUIRED_KEYS accepts zero as valid.
  const num = Number(value)
  if (!Number.isNaN(num) && num === 0) return false
  return String(value).trim() !== ''
}

/**
 * How many questions this section holds for this user, how many need an
 * answer, and how many on-screen questions are folded behind a disclosure
 * (`optionalExtras` — excluded from `total`, which is what the header adds to
 * `total`). `required` counts across every on-screen key including the
 * extras, unaffected by the split since none of them is ever required.
 */
export function sectionCounts(section, projectType, answers = {}) {
  const keys = (QUESTIONS_BY_SECTION[section] || [])
    .filter(k => isOnScreen(k, projectType, answers))
  const extras = keys.filter(k => DISCLOSURE_EXTRAS.has(k))
  return {
    total: keys.length - extras.length,
    required: keys.filter(k => isQuestionRequired(k, projectType)).length,
    optionalExtras: extras.length,
  }
}

/** The required questions in this section that still have no answer. */
export function unansweredRequired(section, projectType, answers = {}) {
  return (QUESTIONS_BY_SECTION[section] || [])
    .filter(k => isOnScreen(k, projectType, answers))
    .filter(k => isQuestionRequired(k, projectType))
    .filter(k => !isAnswered(answers[k], k))
}

/**
 * Progress by section, not by question — the user asked for page-level.
 * Reaches 100% only on submit, so it never overstates how far along someone is.
 */
export function progressPercent(section, totalSections) {
  if (!totalSections) return 0
  return Math.round(((section - 1) / totalSections) * 100)
}
