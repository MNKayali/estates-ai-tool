'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { matchesBuildingUse } from '../../lib/buildingUse.js'
import { areaQuestionLabel, areaHelpText } from '../../lib/labels.js'
import { SITE_CONTEXT_OPTIONS, SITE_CONTEXT_NONE, hrbLikelyFromAnswers, isHigherRiskBuilding } from '../../lib/siteContext.js'
import { PROJECT_TYPES, VISIBLE_GROUPS, priceableFor } from '../../lib/projectTypes.js'
import {
  isQuestionShown, knownIssuesFor, surveysFor, occupationCopyFor,
  showsHeightQuestion, KNOWN_ISSUE_NONE, SURVEY_NONE,
} from '../../lib/questionSets.js'

const STORAGE_KEY = 'estatesAI_v4_answers'
// Bumped whenever the answer-key schema changes in a way that could make a
// stored draft actively wrong to rehydrate (a renamed/repurposed key, a
// changed option set the calculators no longer recognise) rather than just
// missing a new field, which is harmless. A mismatch means "discard, don't
// guess" — the alternative is silently mixing an old draft's shape into a
// calculator that no longer expects it.
// v2 (September 2026): Q6.1 changed from an include-list (`q6_1_sections`) to
// an exclude-list (`q6_1_excludeSections`) — a v1 draft's include-list would
// otherwise be silently ignored, which is the "changed meaning" case above.
// v3 (September 2026): Q1.2 lost "Renewable Energy" and renamed three options.
// A v2 draft can hold a project type the form no longer offers, which would
// leave the select blank while the rest of the draft rehydrates around it.
// v4 (September 2026): Section 3 option lists now vary by project type, Q3.8
// lost its higher-risk option, and Q1.6 (building height) is new. A v3 draft
// can hold ticked options the current type no longer offers.
const STORAGE_SCHEMA_VERSION = 4

// Four steps, down from six.
//
// ROI was a whole step for one question and a conditional follow-up, already
// flagged "optional" — it now sits at the end of step 4 with the other money
// questions. Report preferences was a step for two questions, one of which the
// web report and PDF ignored entirely; those now live on the review panel at the
// end of step 4, next to the Generate button, which is where a user decides what
// they want out rather than three clicks earlier.
//
// `short` is the progress-bar caption. It used to be derived as
// `title.split(' ')[0]`, which rendered steps 1 and 2 as "PROJECT" and
// "PROJECT" — two of six steps indistinguishable. Captions are now written, not
// derived, so they stay distinct if a title changes.
const SECTIONS = [
  { id: 1, short: 'Project',     title: 'Project & Location',            subtitle: 'Tell us about your building and where it is' },
  { id: 2, short: 'Scope',       title: 'Project Scope',                 subtitle: 'What work needs to be done?' },
  { id: 3, short: 'Condition',   title: 'Condition & Constraints',       subtitle: 'What do you know about the building?' },
  { id: 4, short: 'Programme',   title: 'Programme, Budget & Delivery',  subtitle: 'Timelines, costs, funding and the report itself' },
]

// Step-by-step generation indicator for the deterministic pipeline only — this
// call no longer writes the AI narrative (that runs on the report page once
// this returns, each attempt with its own fresh 60s; see /report/[id]). Purely
// visual pacing for a call that now typically resolves in a few seconds.
const GEN_STEPS = [
  { label: 'Calculating costs',   detail: 'Deterministic NRM1 estimate from benchmark rates' },
  { label: 'Building programme',  detail: 'RIBA stage durations, size-banded and adjusted' },
]
const GEN_STEP_ADVANCE_MS = [2000]   // when step 2 becomes active

// ─── Section 1 data ───────────────────────────────────────────────────────────
// Was six bands. Only "Pre-1900" changes a number (a +2% heritage fee and a
// Stage-2 programme uplift); the remaining boundaries that matter are 1980 and
// 2000, which decide whether an asbestos survey is listed. 1900–1945 and
// 1945–1980 were therefore the same answer, and "Not applicable (new build)"
// was unreachable — the question is hidden for New Build. Four bands, identical
// output.
const BUILDING_AGES = ['Pre-1900', '1900–1979', '1980–1999', 'Post-2000']

// ─── Section 2 scope picker config ───────────────────────────────────────────
const HEATING_CODES = ['5.2', '5.2L', '5.5']
const WIRING_MUTEX = ['5.8', '5.8a', '5.8b']
const PLUMBING_MUTEX = ['5.1', '5.1b']
// Must stay in step with FOLDED in app/api/suggest-scope/route.js — its own
// copy of this set previously missed '5.2L' and let the AI suggester return
// both 5.2 and 5.2L (mutually exclusive heating options), which this file's
// selectable filter doesn't catch either.
const FOLDED_CODES = new Set(['5.2L', '5.5', '5.8'])

function itemNeedsQty(item) {
  if (!item) return false
  const pt = item.pricingType
  return pt === 'per_nr' || pt === 'per_kwp' || pt === 'per_kwh' || pt === 'per_kw' ||
    (pt === 'per_item' && /^(number of|per )/i.test(item.qtyCapture || ''))
}

// Label for a count prompt. The workbook's "Quantity to capture" cell is used
// when it reads as a count ("Number of …", "Per …", "System size (kWp)");
// anything else (a stray "GIFA (automatic, m²)" on a per-nr row, as 8.9 had)
// is replaced with a plain count label so workbook plumbing never reaches the
// user as a question.
function qtyPromptLabel(item) {
  const raw = String(item?.qtyCapture || '').trim()
  if (/^(number of|per |system size|capacity|plant capacity)/i.test(raw)) return raw
  const unit = String(item?.unit || '').trim()
  if (/^kw/i.test(unit)) return `Capacity (${unit})`
  return unit && unit !== 'Nr' && unit !== 'Item' ? `Number of ${unit}` : 'Number of units'
}

const LEVEL_TIER = {
  'Fabric and finishes only': 1,
  'Finishes with minor services': 2,
  'Full systems replacement': 3,
  'Reconfiguration or full redesign': 4,
}

/**
 * Starting scopes for "Use typical scope".
 *
 * The picker can show up to 109 tiles across nine groups, and working through
 * them is where most of the questionnaire's time goes. This gives a defensible
 * starting point the user then edits — it is never the final answer, and the
 * full picker stays exactly as it was underneath.
 *
 * These are not invented. The refurbishment tiers are a direct transcription of
 * the Q2.3 option descriptions already shown to the user — "decoration, floor
 * and wall finishes, ceilings, fixtures and fittings" is 3.1/3.2/3.3/4.1/2.8,
 * "second-fix only M&E" is 5.1b/5.8b/5.8c, "complete replacement of heating,
 * plumbing and electrical" is 5.1/5.2/5.8a+5.8b, and "walls moved or removed"
 * is 0.2/2.7/7.5. So the preset says back what the user just told us.
 *
 * Two deliberate exclusions:
 *  - Count-driven items (per_nr / per_kwp / per_kwh). Pre-ticking one with no
 *    quantity would drop it into `excludedNoQuantity` and quietly produce an
 *    "excluded pending quantity" line in the report the user never asked for.
 *  - Anything condition-specific (asbestos removal, damp, contamination). Those
 *    belong to Q3.1, not to a typical scope.
 *
 * Project types absent from this map get no button — Other or mixed is too
 * varied for a default to be honest (it is the catch-all by definition).
 */
const REFURB_TIER_SCOPE = {
  // Tier 1 — fabric and finishes only.
  1: ['0.5', '2.8', '3.1', '3.2', '3.3', '4.1'],
  // Tier 2 — the above plus second-fix-only services.
  2: ['0.5', '2.8', '3.1', '3.2', '3.3', '4.1', '5.1b', '5.8b', '5.8c'],
  // Tier 3 — full systems: heating, plumbing and electrics replaced throughout.
  // 5.5 rides with 5.2 exactly as the heating tile writes it; 5.8a + 5.8b
  // together are what the picker resolves to "1st & 2nd fix" wiring.
  3: ['0.5', '2.8', '3.1', '3.2', '3.3', '4.1', '5.1', '5.2', '5.5', '5.8a', '5.8b', '5.8c'],
  // Tier 4 — plus the structural work implied by moving or removing walls.
  4: ['0.2', '0.5', '2.7', '2.8', '3.1', '3.2', '3.3', '4.1', '5.1', '5.2', '5.5',
      '5.8a', '5.8b', '5.8c', '7.5'],
}

const NEW_BUILD_SCOPE = [
  '1.1', '1.3',                                   // substructure
  '2.1', '2.2', '2.3', '2.5', '2.6', '2.7', '2.8', // frame, envelope, internal
  '3.1', '3.2', '3.3', '4.1',                      // finishes and fittings
  '5.1', '5.2', '5.5', '5.3', '5.7', '5.8a', '5.8b', '5.8c', // services
  '8.1',                                           // site preparation
]

function presetScopeFor(projectType, tier) {
  const pt = String(projectType || '')
  if (pt === 'New Build' || pt === 'Extension') return NEW_BUILD_SCOPE
  if (pt === 'Refurbishment' || pt === 'Fit-out') return REFURB_TIER_SCOPE[tier] || REFURB_TIER_SCOPE[3]
  if (pt === 'External works only') return ['8.1', '8.2', '8.4', '8.7', '8.8']
  if (pt === 'Demolition only') return ['0.2', '0.5']
  // No honest default for Other or mixed — it is the catch-all by definition,
  // so ScopePresetBar hides itself rather than guessing.
  return null
}

const STANDARDS_OPTIONS = [
  'BREEAM', 'PAS 2035', 'NHS design guide', 'Net zero', 'University design guide',
  'Acoustic', 'Food hygiene', 'MCS', 'DNO', 'Highways', 'Dark sky', 'None', 'Other',
]

const INTERVENTION_LEVELS = [
  {
    value: 'Fabric and finishes only',
    signal: 'Lower cost · Minimal design',
    description: 'Decoration, floor and wall finishes, ceilings, fixtures and fittings replaced in-place. No mechanical or electrical work whatsoever. No walls moved.',
  },
  {
    value: 'Finishes with minor services',
    signal: 'Moderate cost · Light design',
    description: 'All of the above, plus second-fix only M&E: replacement sockets, switches, light fittings, radiators, TRVs, taps and visible fittings only. No new pipe runs or cable routes — the existing first-fix wiring and pipework is retained in place.',
  },
  {
    value: 'Full systems replacement',
    signal: 'Higher cost · Moderate design',
    description: 'Complete replacement of heating, plumbing and electrical systems throughout. Everything replaced in the same position — no layout changes, no structural alterations. The building is essentially rewired and re-plumbed.',
  },
  {
    value: 'Reconfiguration or full redesign',
    signal: 'Highest cost · Full design team required',
    description: 'Layout changes, walls moved or removed, or the building is stripped back to structure and redesigned. Requires architect, structural engineer, building control, and possibly planning consent.',
  },
]

const SPEC_LEVELS = [
  { value: 'Basic', tag: 'Lowest cost', description: 'Functional and durable. Standard materials, minimal detailing. Back-of-house, student accommodation, warehouses.' },
  { value: 'Standard', tag: 'Mid-range', description: 'Good commercial standard. Durable mid-range materials. Typical offices, education, general academic space.' },
  { value: 'High', tag: 'Premium', description: 'Flagship or prestige finish. High-end materials, bespoke elements, enhanced M&E. Boardrooms, reception, executive areas.' },
]

// ─── Section 3 data ───────────────────────────────────────────────────────────
// KNOWN_ISSUES and SURVEY_OPTIONS were static arrays here; Q3.1 and Q3.3 now
// vary by project type via knownIssuesFor()/surveysFor() in lib/questionSets.js.
const PLANNING_OPTIONS = [
  'No consent required', 'Permitted development', 'Prior approval', 'Full planning',
  'Full planning + Listed Building Consent', 'Change of use', 'Unsure (pre-application advice)',
]

const ACCESS_OPTIONS = [
  'Restricted working hours', 'Shared access with other occupiers',
  'No vehicle access or restricted deliveries', 'Height or weight restrictions on site',
  'Scaffold licence or highway encroachment required', 'Term-time only working',
  'No access constraints', 'Other',
]

// Was five options. "Full decant", "Currently vacant" and "Not applicable" are
// indistinguishable to both engines — 0pp on Prelims, 0pp on Risk, and no OCC
// construction uplift — so they asked the user to make a distinction that
// changed nothing. Collapsed to the three states that actually price.
const OCCUPATION_OPTIONS = [
  'Fully occupied', 'Partially occupied', 'Vacant or decanted',
]

// ─── Section 4 data ───────────────────────────────────────────────────────────
const PRIORITIES = [
  'Lowest cost', 'Fixed / certain final cost', 'Speed', 'Design quality',
  'Flexibility', 'Minimise disruption', 'Funder / compliance requirement',
]

const DESIGN_STAGE_OPTIONS = [
  'Concept only (Stage 0–1)', 'Concept complete (Stage 2)',
  'Developed design (Stage 3)', 'Technical complete (Stage 4)',
]

// (UTILITIES_OPTIONS removed — it was declared but never rendered; there is no
// utilities question in the flow and no engine reads one.)

// Only "grant or public" changes anything (a +6-week funding-governance stage).
// "Other" plus its free-text follow-up was a fourth click and a text box that no
// engine, prompt or report section ever read.
const FUNDING_OPTIONS = ['Internal / commercial', 'Grant or public funding', 'Not yet confirmed']

// ─── Financial case data (asked at the end of step 4) ────────────────────────
const NO_FINANCIAL_RETURN = 'No direct financial return — strategic or compliance project'
const FINANCIAL_BENEFIT_OPTIONS = [
  'Energy or operational cost savings', 'Rental or commercial income',
  'Grant or funding unlock', 'Avoidance of compliance cost or penalty',
  'Increased asset value', NO_FINANCIAL_RETURN,
]

// ─── Report preference data (asked at the end of step 4) ─────────────────────
// (The optional-report-sections list lived here. Q6.1 has been removed
// entirely — every section is always included. resolveSectionFlags() in
// lib/reportShared.js still honours the old answer keys so reports already in
// KV keep rendering the way they were generated.)

// ─── UI Components ────────────────────────────────────────────────────────────

function QCard({ children }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '28px', boxShadow: 'var(--shadow-1)' }}>
      {children}
    </div>
  )
}

function Label({ children, required }) {
  return (
    <label className="block mb-1.5" style={{ color: 'var(--ink)', fontSize: '15px', fontFamily: 'var(--font-body)', fontWeight: 700, letterSpacing: '-0.1px' }}>
      {children}{required && <span style={{ color: 'var(--danger)' }} className="ml-1">*</span>}
    </label>
  )
}
function HelpText({ children }) {
  return <p className="mb-3" style={{ color: 'var(--text-soft)', fontSize: '13.5px', lineHeight: 1.6 }}>{children}</p>
}
// Divides a long step into named runs of questions. Step 4 absorbed what used to
// be two separate steps, so without a break it reads as one undifferentiated
// wall of cards.
// Sticky so that in the long step 4 the user can always see which run of
// questions they are in (programme and money, financial case, or the report).
function SubHead({ title, note }) {
  return (
    <div style={{ marginTop: 14, paddingTop: 18, borderTop: '1px solid var(--border)', position: 'sticky', top: 56, zIndex: 5, background: 'var(--bg)' }}>
      <p className="eyebrow" style={{ marginBottom: note ? 6 : 0 }}>{title}</p>
      {note && <p style={{ color: 'var(--text-soft)', fontSize: '13.5px', lineHeight: 1.6, margin: 0 }}>{note}</p>}
    </div>
  )
}
function TextInput({ value, onChange, placeholder }) {
  return (
    <input type="text" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="field" style={{ minHeight: '48px', fontSize: '16px' }} />
  )
}
function NumberInput({ value, onChange, placeholder, min = 0 }) {
  return (
    <input type="number" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} min={min}
      className="field" style={{ minHeight: '48px', fontSize: '16px' }} />
  )
}
function Textarea({ value, onChange, placeholder, rows = 4 }) {
  return (
    <textarea value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      className="field" style={{ fontSize: '16px', lineHeight: '1.6', resize: 'none' }} />
  )
}
function SelectInput({ value, onChange, children }) {
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)}
      className="field" style={{ minHeight: '48px', fontSize: '16px', color: value ? 'var(--text)' : 'var(--text-mute)' }}>
      {children}
    </select>
  )
}

// Compact card-row radio — works at any text length.
//
// Was a column of plain <button>s with no indication to a screen reader that
// they formed a single-choice group, or which (if any) option was selected —
// each just read as "button, [option text]". Now a real ARIA radiogroup with
// roving tabindex: Tab reaches one stop (the selected option, or the first if
// none is selected yet), and Up/Down/Left/Right move and select within the
// group — matching how a native <input type="radio"> set already behaves,
// which this custom control is standing in for.
function RadioGroup({ options, value, onChange, ariaLabel }) {
  const refs = useRef([])
  const move = (fromIdx, dir) => {
    const next = (fromIdx + dir + options.length) % options.length
    refs.current[next]?.focus()
    onChange(options[next])
  }
  const selIdx = options.findIndex(o => o === value)
  return (
    <div role="radiogroup" aria-label={ariaLabel} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {options.map((opt, i) => {
        const sel = value === opt
        // Roving tabindex: exactly one stop in the group. The checked option
        // if there is one, otherwise the first option — so the group is
        // still keyboard-reachable before any choice has been made.
        const isTabStop = selIdx === -1 ? i === 0 : sel
        return (
          <button key={opt} type="button" role="radio" aria-checked={sel}
            ref={el => { refs.current[i] = el }}
            tabIndex={isTabStop ? 0 : -1}
            onClick={() => onChange(opt)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); move(i, 1) }
              else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); move(i, -1) }
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 11,
              padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
              border: sel ? '1.5px solid var(--navy)' : '1.5px solid var(--border)',
              background: sel ? 'rgba(26,46,74,.06)' : 'var(--surface)',
              textAlign: 'left', width: '100%',
              transition: 'border-color 0.13s ease, background 0.13s ease, box-shadow 0.13s ease',
              boxShadow: sel ? '0 1px 6px rgba(26,46,74,0.14)' : 'none',
            }}>
            <span style={{
              width: 18, height: 18, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
              border: sel ? '5px solid var(--navy)' : '1.5px solid var(--border-2)',
              background: '#fff',
            }} />
            <span style={{
              fontFamily: 'var(--font-body)', fontWeight: sel ? 700 : 500,
              fontSize: '14px', color: sel ? 'var(--ink)' : 'var(--text-mid)', lineHeight: 1.35,
            }}>{opt}</span>
          </button>
        )
      })}
    </div>
  )
}

// Pill-chip multi-select — each option is a toggleable tag.
//
// Unlike RadioGroup, each pill is an independent on/off toggle, not a
// single-choice set — so it keeps native per-button tab stops (Tab already
// visits each one, exactly like a row of real checkboxes would) rather than
// roving tabindex. It only needed role="checkbox" + aria-checked so a screen
// reader announces state at all instead of a bare, stateless "button".
// `max` caps how many may be ticked at once; the remaining pills are disabled
// (aria-disabled, not removed) so the user can see what they would have to
// untick. Order of ticking is preserved in `values`, which is what lets Q4.4
// treat the first tick as the primary priority.
function CheckboxGroup({ options, values = [], onChange, note, ariaLabel, max }) {
  const arr = Array.isArray(values) ? values : []
  const atMax = Number.isFinite(max) && arr.length >= max
  const toggle = opt => {
    if (arr.includes(opt)) return onChange(arr.filter(v => v !== opt))
    if (atMax) return
    onChange([...arr, opt])
  }
  return (
    <div role="group" aria-label={ariaLabel}>
      {note && <p style={{ color: 'var(--text-soft)', fontSize: '13px', marginBottom: 10 }}>{note}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {options.map(opt => {
          const sel = arr.includes(opt)
          const blocked = !sel && atMax
          return (
            <button key={opt} type="button" role="checkbox" aria-checked={sel} aria-disabled={blocked || undefined} onClick={() => toggle(opt)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 8, cursor: blocked ? 'not-allowed' : 'pointer',
                opacity: blocked ? 0.45 : 1,
                border: sel ? '1.5px solid var(--navy)' : '1.5px solid var(--border)',
                background: sel ? 'rgba(26,46,74,.06)' : 'var(--surface)',
                color: sel ? 'var(--ink)' : 'var(--text-mid)',
                fontFamily: 'var(--font-body)', fontWeight: sel ? 700 : 500,
                fontSize: '13.5px', lineHeight: 1.35,
                transition: 'border-color 0.12s ease, background 0.12s ease, box-shadow 0.12s ease',
                boxShadow: sel ? '0 1px 5px rgba(26,46,74,0.14)' : 'none',
              }}>
              {sel && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--navy)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Makes a "none of these" option mutually exclusive with the rest of a
 * multi-select.
 *
 * Without this, "None" sits alongside real selections and the reader has to
 * guess which the user meant. On Q3.5 it was worse than ambiguous: ticking
 * "No access constraints" next to a real constraint made the report builder
 * discard *every* access risk seed, so a genuine constraint vanished from the
 * risk register with no warning.
 *
 * Picking the none-option clears everything else; picking anything else clears
 * the none-option.
 */
function applyNoneMutex(prev, next, noneOption) {
  const wasNone = prev.includes(noneOption)
  const isNone = next.includes(noneOption)
  if (isNone && !wasNone) return [noneOption]          // just ticked "none"
  if (isNone && next.length > 1) return next.filter(v => v !== noneOption)
  return next
}

// Offers a starting scope for the current project type and intervention level.
// Hidden where no honest default exists (Other or mixed, or before a project
// type is chosen) rather than guessing.
function ScopePresetBar({ projectType, tier, selectedCount, onApply, onClear }) {
  if (!presetScopeFor(projectType, tier)) return null
  const has = selectedCount > 0
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      marginBottom: 16, padding: '12px 14px', borderRadius: 10,
      border: '1px solid var(--border)', backgroundColor: 'var(--tint)',
    }}>
      <button type="button" onClick={onApply}
        style={{
          padding: '9px 16px', borderRadius: 8, cursor: 'pointer',
          border: '1.5px solid var(--navy)', background: 'var(--surface)',
          color: 'var(--ink)', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13.5,
        }}>
        {has ? 'Reset to typical scope' : 'Use typical scope'}
      </button>
      <span style={{ color: 'var(--text-soft)', fontSize: 13, flex: 1, minWidth: 180 }}>
        {has
          ? `${selectedCount} item${selectedCount === 1 ? '' : 's'} selected — add or remove anything below.`
          : 'Starts you off with the elements this type of project usually includes. You can change everything.'}
      </span>
      {has && (
        <button type="button" onClick={onClear}
          style={{
            padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
            border: '1.5px solid var(--border-2)', background: 'transparent',
            color: 'var(--text-soft)', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13.5,
          }}>
          Clear all
        </button>
      )}
    </div>
  )
}

// AI-suggested scope from the Q2.1 objective (September 2026). The model is
// only ever shown the codes the picker would offer and answers with a strict
// enum, so it can propose but never invent; the user reviews the list and the
// deterministic engine prices whatever is finally ticked. Hidden until the
// objective is long enough to mean something.
function ScopeSuggestBar({ objective, projectType, buildingUse, interventionLevel, selectedCount, onApply, onUsePreset, hasPreset }) {
  const [state, setState] = useState({ status: 'idle', items: [], error: '' })
  const ready = String(objective || '').trim().length >= 20 && !!projectType
  if (!projectType) return null

  async function suggest() {
    if (!ready) return
    if (selectedCount > 0 && !window.confirm('Replace the items currently ticked with the suggested scope? You can still edit everything afterwards.')) return
    setState({ status: 'loading', items: [], error: '' })
    try {
      const res = await fetch('/api/suggest-scope', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective, projectType, buildingUse, interventionLevel }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Suggestion failed (${res.status}).`)
      const items = Array.isArray(body.items) ? body.items : []
      // A dead end here used to be the whole story: a perfectly reasonable
      // objective that states a goal rather than a list of elements came back
      // empty and the user was told to go and write more. The route's prompt
      // now handles that case, and if it still returns nothing there is a real
      // starting point one click away rather than an error.
      if (items.length === 0) {
        setState({ status: 'empty', items: [], error: '' })
        return
      }
      const applied = onApply(items.map(i => i.code))
      setState({ status: 'ready', items: items.filter(i => applied.has(i.code)), error: '' })
    } catch (e) {
      setState({ status: 'error', items: [], error: e.message })
    }
  }

  return (
    <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={suggest} disabled={!ready || state.status === 'loading'}
          title={ready ? undefined : 'Describe the project objective in Q2.1 first (at least 20 characters)'}
          style={{
            padding: '9px 16px', borderRadius: 8, cursor: ready && state.status !== 'loading' ? 'pointer' : 'not-allowed',
            border: '1.5px solid var(--amber)', background: 'var(--surface)', opacity: ready ? 1 : 0.55,
            color: 'var(--amber-deep)', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13.5,
          }}>
          {state.status === 'loading' ? 'Suggesting…' : 'Suggest scope from my objective'}
        </button>
        <span style={{ color: 'var(--text-soft)', fontSize: 13, flex: 1, minWidth: 180 }}>
          {ready
            ? 'Reads your Q2.1 objective and ticks the elements it implies. You review and edit; the estimate is still calculated, never guessed.'
            : 'Write a sentence or two in Q2.1 first, then this can propose a starting scope from it.'}
        </span>
      </div>
      {state.status === 'error' && <p role="alert" style={{ margin: '10px 0 0', color: 'var(--danger)', fontSize: 13 }}>{state.error}</p>}
      {state.status === 'empty' && (
        <div role="status" style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--text-mid)' }}>
          <p style={{ margin: 0 }}>That objective did not point at specific elements. {hasPreset ? 'Start from the typical scope for this project type and edit it, or tick the elements below yourself.' : 'Tick the elements below that are in scope.'}</p>
          {hasPreset && (
            <button type="button" onClick={() => { onUsePreset(); setState({ status: 'idle', items: [], error: '' }) }}
              style={{ marginTop: 8, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', border: '1.5px solid var(--navy)', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13 }}>
              Use typical scope instead
            </button>
          )}
        </div>
      )}
      {state.status === 'ready' && state.items.length > 0 && (
        <div role="status" aria-live="polite" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>{state.items.length} item{state.items.length === 1 ? '' : 's'} ticked — why each was suggested:</p>
            <button type="button" onClick={() => setState({ status: 'idle', items: [], error: '' })}
              style={{ background: 'none', border: 'none', color: 'var(--text-soft)', fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'var(--font-body)' }}>
              Dismiss
            </button>
          </div>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--text-mid)', lineHeight: 1.5 }}>
            {state.items.map(i => <li key={i.code}><strong style={{ color: 'var(--ink)' }}>{i.description}</strong> — {i.reason}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

// Resolves Q1.1 to a BCIS region as the user types, and asks for the region
// explicitly when the prefix matches nothing.
//
// The factor this lands on multiplies most of the estimate (0.85 Northern
// Ireland → 1.25 Inner London). Previously an unrecognised prefix was resolved
// server-side to West Midlands 0.94 with no visible sign, so a mistyped London
// postcode understated the whole report by ~25% and still read as confident.
// Showing the match turns a silent assumption into a confirmed one.
function BcisResolver({ postcode, regions, chosen, onChoose }) {
  const typed = (postcode || '').trim()
  if (!typed || !Array.isArray(regions) || regions.length === 0) return null

  const prefix = typed.toUpperCase().replace(/\d.*$/, '').trim()
  const match = prefix ? regions.find(r => r.postcodes.some(p => p === prefix)) : null

  const box = {
    marginTop: 12, padding: '10px 12px', borderRadius: 8, fontSize: 13.5,
    border: '1px solid var(--border)', backgroundColor: 'var(--tint)',
  }

  if (match) {
    return (
      <div style={{ ...box, color: 'var(--text-soft)' }}>
        Regional cost factor:{' '}
        <strong style={{ color: 'var(--ink)' }}>{match.region}</strong>
        <span className="mono" style={{ marginLeft: 8, color: 'var(--amber-deep)' }}>×{match.factor}</span>
      </div>
    )
  }

  return (
    <div style={{ ...box, borderColor: 'var(--amber)', backgroundColor: 'rgba(196,134,26,.07)' }}>
      <p style={{ margin: '0 0 8px', color: 'var(--ink)' }}>
        We don&apos;t recognise <strong>{prefix || typed}</strong> as a UK postcode area. Choose the
        region so the regional cost factor is right — it changes the estimate by up to 25%.
      </p>
      <SelectInput value={chosen} onChange={onChoose}>
        <option value="">Select region...</option>
        {regions.map(r => (
          <option key={r.region} value={r.region}>{r.region} (×{r.factor})</option>
        ))}
      </SelectInput>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function QuestionnairePage() {
  const router = useRouter()
  const [section, setSection] = useState(1)
  const [answers, setAnswers] = useState({})
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState(0)
  const [error, setError] = useState('')
  // Set alongside `error` only for a 401 from the access gate (a stale/expired
  // cookie) — the error banner offers a real link to re-authenticate rather
  // than leaving the user stuck reading the proxy's raw message.
  const [authError, setAuthError] = useState(false)
  const [validationErrors, setValidationErrors] = useState({})
  const [scopeData, setScopeData] = useState(null)
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set())
  // Group 4's sector-specific tail is folded until asked for — see the picker.
  const [showSectorTail, setShowSectorTail] = useState(false)
  const toggleGroupCollapse = g =>
    setCollapsedGroups(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n })

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      // Shape-validate before trusting it: a plain object with the expected
      // schema version, not an array, primitive, or a pre-versioning draft
      // written by an older build. Anything else is discarded rather than
      // rehydrated — a malformed or stale draft silently corrupting the first
      // render is worse than starting blank.
      if (
        parsed && typeof parsed === 'object' && !Array.isArray(parsed) &&
        parsed.schemaVersion === STORAGE_SCHEMA_VERSION &&
        parsed.answers && typeof parsed.answers === 'object' && !Array.isArray(parsed.answers)
      ) {
        setAnswers(parsed.answers)
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      // Corrupted JSON — same treatment as a shape mismatch, not a crash.
      try { localStorage.removeItem(STORAGE_KEY) } catch {}
    }
  }, [])

  useEffect(() => {
    let alive = true
    fetch('/api/scope-items')
      .then(r => r.json())
      .then(d => { if (alive && Array.isArray(d.groups)) setScopeData(d) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // Fire-and-forget: warm the strict prose-tool schema into Anthropic's ~24h
  // cache so the final report generation skips the cold-compile cost that
  // otherwise risks a timeout under the 60s function ceiling. Once on mount,
  // and again when the user reaches the final (Report) section as a top-up.
  useEffect(() => { fetch('/api/warm-prose').catch(() => {}) }, [])
  useEffect(() => { if (section >= 6) fetch('/api/warm-prose').catch(() => {}) }, [section])

  useEffect(() => {
    if (Object.keys(answers).length === 0) return
    // Unguarded, this throws in Safari private browsing / a full storage
    // quota — and an uncaught error inside an effect's commit takes the whole
    // page down (a blank screen on the very first keystroke), not just this
    // save. A failed autosave is a much smaller problem than that.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: STORAGE_SCHEMA_VERSION, answers }))
    } catch (e) {
      console.warn('[questionnaire] autosave failed (storage unavailable or full):', e)
    }
  }, [answers])

  useEffect(() => {
    if (!loading) { setLoadingMsg(0); return }
    const timers = GEN_STEP_ADVANCE_MS.map((ms, i) => setTimeout(() => setLoadingMsg(i + 1), ms))
    return () => timers.forEach(clearTimeout)
  }, [loading])

  const set = (field, val) => setAnswers(prev => ({ ...prev, [field]: val }))
  // Q2.5 is stored as a comma-joined string so the cost engine's BREEAM
  // substring test and the AI prompt keep reading the same shape they always
  // have; the UI works in a list.
  const standardsList = String(answers.q2_5_standards || '')
    .split(',').map(s => s.trim()).filter(Boolean)

  // Spec levels the workbook can actually price differently for this project
  // type. New build and extension have no Basic rate column (Basic resolves to
  // the Standard column), and External Works has a single column for everything.
  const specLevelsForType = (() => {
    const pt = String(answers.q1_2_projectType || '').toLowerCase()
    if (pt.includes('external works')) return []
    if (pt.includes('new build') || pt.includes('extension')) {
      return SPEC_LEVELS.filter(o => o.value !== 'Basic')
    }
    return SPEC_LEVELS
  })()

  // The annual-benefit field only makes sense once a benefit type is chosen and
  // it isn't the "no direct return" option.
  const financialBenefits = Array.isArray(answers.q5_1_financialBenefit) ? answers.q5_1_financialBenefit : []
  const showRoiAmount = financialBenefits.length > 0 && !financialBenefits.includes(NO_FINANCIAL_RETURN)

  const isRefurb = ['Refurbishment', 'Fit-out', 'Extension'].includes(answers.q1_2_projectType)

  const itemByCode = useMemo(() => {
    const m = {}
    for (const grp of scopeData?.groups || []) for (const it of grp.items) m[it.code] = it
    return m
  }, [scopeData])

  const WIRING_MIN_TIER = { '5.8': 3, '5.8a': 3, '5.8b': 2, '5.8c': 2 }
  const currentTier = isRefurb ? (LEVEL_TIER[answers.q2_3_interventionLevel] || 4) : 4

  // Is this code selectable right now? Same four tests the pruning effect below
  // applies, so a preset can never tick a tile the picker would not show — a
  // preset that selected a hidden item would be invisible to the user but still
  // priced in the report.
  const scopeCodeSelectable = code => {
    const it = itemByCode[code]
    if (!it) return false
    const visibleGroups = VISIBLE_GROUPS[answers.q1_2_projectType]
    if (visibleGroups && !visibleGroups.includes(it.group)) return false
    if (!matchesBuildingUse(it.buildingUse, answers.q1_3_buildingUse || '')) return false
    if (isRefurb && (it.minLvl || 1) > currentTier) return false
    if (!priceableFor(it, answers.q1_2_projectType)) return false
    return true
  }

  function applyScopePreset() {
    const preset = presetScopeFor(answers.q1_2_projectType, currentTier)
    if (!preset || !scopeData) return
    // FOLDED_CODES have no tile of their own but are written alongside their
    // parent (5.5 rides with the heating tile), so they bypass the selectable
    // test and are kept only when their parent survived it.
    const chosen = preset.filter(c => (FOLDED_CODES.has(c) ? true : scopeCodeSelectable(c)))
    const withoutOrphanedFolds = chosen.filter(c => (c === '5.5' ? chosen.includes('5.2') : true))

    // Mirror the wiring derivation the tiles perform, so q2_2_wiring stays
    // consistent with the codes — the cost engine reads it to pick which of
    // 5.8 / 5.8a / 5.8b to price, and throws if more than one is present.
    const hasA = withoutOrphanedFolds.includes('5.8a')
    const hasB = withoutOrphanedFolds.includes('5.8b')
    const wiring = (hasA && hasB) ? '5.8' : hasA ? '5.8a' : hasB ? '5.8b' : 'none'

    setAnswers(prev => ({ ...prev, q2_2_scopeItems: withoutOrphanedFolds, q2_2_wiring: wiring }))

    // Fold away the groups the preset did not touch. The long tail (sector
    // equipment, specialist/modular) is the bulk of the tile count and most
    // projects never open it; it stays one click away.
    const touched = new Set(withoutOrphanedFolds.map(c => itemByCode[c]?.group).filter(g => g !== undefined))
    setCollapsedGroups(new Set((scopeData.groups || []).map(g => g.group).filter(g => !touched.has(g))))
  }

  function clearScope() {
    setAnswers(prev => ({ ...prev, q2_2_scopeItems: [], q2_2_wiring: 'none' }))
    setCollapsedGroups(new Set())
  }

  // Applies an AI-suggested code list through exactly the same gates as the
  // preset (selectable filter, 5.5 folded with 5.2, wiring derivation), and
  // returns the set of codes that survived so the UI can show only those.
  function applySuggestedScope(codes) {
    if (!scopeData) return new Set()
    const chosen = (codes || []).filter(c => scopeCodeSelectable(c))
    if (chosen.includes('5.2') && itemByCode['5.5'] && !chosen.includes('5.5')) chosen.push('5.5')
    const hasA = chosen.includes('5.8a'), hasB = chosen.includes('5.8b')
    const wiring = (hasA && hasB) ? '5.8' : hasA ? '5.8a' : hasB ? '5.8b' : 'none'
    setAnswers(prev => ({ ...prev, q2_2_scopeItems: chosen, q2_2_wiring: wiring }))
    const touched = new Set(chosen.map(c => itemByCode[c]?.group).filter(g => g !== undefined))
    setCollapsedGroups(new Set((scopeData.groups || []).map(g => g.group).filter(g => !touched.has(g))))
    return new Set(chosen)
  }

  useEffect(() => {
    if (!scopeData) return
    const visibleGroups = VISIBLE_GROUPS[answers.q1_2_projectType]
    const bu = answers.q1_3_buildingUse || ''
    setAnswers(prev => {
      const prevItems = prev.q2_2_scopeItems || []
      const kept = prevItems.filter(code => {
        const it = itemByCode[code]
        if (!it) return false
        if (visibleGroups && !visibleGroups.includes(it.group)) return false
        if (!matchesBuildingUse(it.buildingUse, bu)) return false
        if (isRefurb && (it.minLvl || 1) > currentTier) return false
        if (!FOLDED_CODES.has(code) && !priceableFor(it, prev.q1_2_projectType)) return false
        return true
      })
      const wiringTier = WIRING_MIN_TIER[prev.q2_2_wiring] || 0
      const newWiring = (prev.q2_2_wiring && prev.q2_2_wiring !== 'none' && wiringTier <= currentTier)
        ? prev.q2_2_wiring : 'none'

      // Keep the stored spec level inside the set currently on offer. Picking
      // Basic on a refurb then switching to New Build would otherwise leave
      // "Basic" stored with no tile selected — and the calculator prices it as
      // Standard regardless. Snapping makes the stored answer agree with both
      // the UI and the arithmetic. Folded into this effect rather than its own
      // because it reacts to the same answer (project type).
      const allowedSpec = specLevelsForType.map(o => o.value)
      const newSpec = allowedSpec.length === 0
        ? 'Standard'
        : (!prev.q2_4_specLevel || allowedSpec.includes(prev.q2_4_specLevel))
          ? prev.q2_4_specLevel
          : 'Standard'

      if (kept.length === prevItems.length
        && newWiring === (prev.q2_2_wiring || 'none')
        && newSpec === prev.q2_4_specLevel) return prev
      return { ...prev, q2_2_scopeItems: kept, q2_2_wiring: newWiring, q2_4_specLevel: newSpec }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers.q1_2_projectType, answers.q1_3_buildingUse, answers.q2_3_interventionLevel, scopeData])

  // Section 3 option lists vary by project type. Switching type must drop any
  // ticked option the new type does not offer, or the engines price an answer
  // the user can no longer see. Same reasoning as the scope-pruning effect above.
  useEffect(() => {
    setAnswers(prev => {
      const pt = prev.q1_2_projectType
      if (!pt) return prev
      const issues = knownIssuesFor(pt)
      const surveys = surveysFor(pt, prev.q1_4_buildingAge)
      const keptIssues = (prev.q3_1_knownIssues || []).filter(v => issues.includes(v))
      const keptSurveys = (prev.q3_3_surveys || []).filter(v => surveys.includes(v))
      if (keptIssues.length === (prev.q3_1_knownIssues || []).length
        && keptSurveys.length === (prev.q3_3_surveys || []).length) return prev
      return { ...prev, q3_1_knownIssues: keptIssues, q3_3_surveys: keptSurveys }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers.q1_2_projectType, answers.q1_4_buildingAge])

  function validateSection(sec) {
    const errs = {}
    if (sec === 1) {
      if (!answers.q1_0_projectName?.trim()) errs.q1_0_projectName = 'Project name is required'
      if (!answers.q1_1_postcode?.trim()) errs.q1_1_postcode = 'Postcode is required'
      if (!answers.q1_2_projectType) errs.q1_2_projectType = 'Project type is required'
      // GIFA is the single most load-bearing number in the report — it is linear
      // on most priced rows and selects the programme size band. The old check
      // was `!answers.q1_5_size` against the raw string from the input, so "0"
      // and "-5" both passed, and a blank was silently priced as 100 m² by the
      // calculator's fallback. Anything that is not a positive finite number is
      // rejected here instead.
      const gifa = Number(answers.q1_5_size)
      if (!answers.q1_5_size) errs.q1_5_size = 'Approximate size is required'
      else if (!Number.isFinite(gifa) || gifa <= 0) errs.q1_5_size = 'Enter a size greater than zero (m²)'
      // Marked required on screen (hidden entirely for types isQuestionShown
      // excludes, where it's genuinely not applicable) but never actually
      // enforced — a user could continue past it blank. It's load-bearing
      // (Pre-1900 alone changes the heritage fee and a Stage 2 programme
      // uplift), so it earns the marker it already carries rather than having
      // the marker dropped. Must mirror the question's own render condition —
      // demanding a value for a type that never sees the question deadlocks
      // the section with an error the user cannot see or clear.
      if (isQuestionShown('q1_4_buildingAge', answers.q1_2_projectType) && !answers.q1_4_buildingAge) {
        errs.q1_4_buildingAge = 'Building age is required'
      }
      // Load-bearing despite reading as optional. Left blank, matchesBuildingUse
      // treats it as a wildcard so every scope tile shows, AND senseCheck finds
      // no Sheet 8 benchmark band, so the COST_LOW / COST_HIGH checks — the main
      // guard against a mispriced estimate — silently never run.
      if (!answers.q1_3_buildingUse) errs.q1_3_buildingUse = 'Building use is required'
    }
    if (sec === 2) {
      if (!answers.q2_1_objective?.trim()) errs.q2_1_objective = 'Project objective is required'
      if (!answers.q2_2_scopeItems || answers.q2_2_scopeItems.length === 0) errs.q2_2_scopeItems = 'Please select at least one scope item'
      // Only required when the question is actually shown — External Works has a
      // single rate column, so there is nothing to choose and demanding a value
      // would deadlock the section. Must mirror the question's own render
      // condition exactly (both specLevelsForType.length > 0 AND
      // isQuestionShown — Demolition only has spec levels but is excluded by
      // isQuestionShown), so the next person changing one changes the other.
      if (specLevelsForType.length > 0 && isQuestionShown('q2_4_specLevel', answers.q1_2_projectType) && !answers.q2_4_specLevel) {
        errs.q2_4_specLevel = 'Specification level is required'
      }
      // Mirrors Guard 1 in app/api/generate-report/route.js, which is the only
      // thing that enforced this before — so a user could leave it blank, fill
      // in two more steps, press Generate and only then be rejected. Same
      // condition as the question's own visibility (refurb / fit-out /
      // extension), so it can never deadlock a type that isn't asked.
      if (isRefurb && !answers.q2_3_interventionLevel) {
        errs.q2_3_interventionLevel = 'Level of intervention is required'
      }
    }
    setValidationErrors(errs)
    return Object.keys(errs).length === 0
  }

  function next() {
    if (!validateSection(section)) return
    setSection(s => Math.min(s + 1, SECTIONS.length))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function back() {
    setSection(s => Math.max(s - 1, 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // The 30-day access cookie previously had no way to revoke short of clearing
  // browser data by hand — relevant on a shared machine.
  async function logout() {
    try { await fetch('/api/logout', { method: 'POST' }) } catch {}
    router.push('/access')
  }

  async function submit() {
    if (!validateSection(section)) return
    setLoading(true)
    setError('')
    setAuthError(false)
    try {
      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      // A non-JSON body (a platform-level 502, an empty response) used to throw
      // here and land in the catch block below as a misleading "Network error"
      // even though a response was actually received.
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        setError(data.error || data.detail || 'Report generation failed. Please try again.')
        setAuthError(res.status === 401)
        setLoading(false)
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
      // The report is already saved server-side at this point — a failure
      // writing to sessionStorage (quota exceeded, private browsing blocking
      // storage) must not be treated the same as the request itself failing.
      // It was previously inside this same try, so it fell into the catch
      // block below and showed "Network error" for a report that had in fact
      // generated successfully, and never navigated the user to it.
      try {
        sessionStorage.setItem('estatesAI_result', JSON.stringify({ ...data, answers }))
      } catch (storageErr) {
        console.warn('[submit] sessionStorage write failed (report was still generated):', storageErr)
      }
      router.push(data.reportId ? `/report/${data.reportId}` : '/report')
    } catch (e) {
      console.error('[submit] request failed:', e)
      setError('Network error — please check your connection and try again.')
      setLoading(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4"
        style={{ backgroundColor: 'transparent' }}>
        <div role="status" aria-live="polite" className="section-enter" style={{ width: '100%', maxWidth: 460, background: 'var(--surface)', border: '1px solid var(--border)', borderTop: '3px solid var(--amber)', borderRadius: 12, boxShadow: 'var(--shadow-2)', padding: '36px 36px 30px' }}>
          <p className="mono" style={{ fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--amber-deep)', margin: '0 0 6px' }}>Generating report</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, color: 'var(--ink)', margin: '0 0 26px', letterSpacing: '-0.2px' }}>
            {answers.q1_0_projectName || 'Your feasibility report'}
          </h1>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {GEN_STEPS.map((step, i) => {
              const state = i < loadingMsg ? 'done' : i === loadingMsg ? 'active' : 'todo'
              return (
                <div key={step.label} className={state === 'active' ? 'gen-step-active' : ''}
                  style={{ display: 'flex', gap: 14, alignItems: 'flex-start', position: 'relative' }}>
                  {/* connector */}
                  {i < GEN_STEPS.length - 1 && (
                    <span style={{ position: 'absolute', left: 10, top: 24, bottom: 0, width: 2, background: state === 'done' ? 'var(--navy)' : 'var(--border)' }} />
                  )}
                  <span className="gen-dot" style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 1, zIndex: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: state === 'done' ? 'var(--navy)' : state === 'active' ? 'var(--amber)' : 'var(--surface)',
                    border: state === 'todo' ? '2px solid var(--border-2)' : 'none',
                  }}>
                    {state === 'done' && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    )}
                    {state === 'active' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />}
                  </span>
                  <div style={{ paddingBottom: i < GEN_STEPS.length - 1 ? 22 : 0 }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: state === 'todo' ? 500 : 700, color: state === 'todo' ? 'var(--text-mute)' : 'var(--ink)' }}>
                      {step.label}{state === 'active' ? '…' : ''}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-mute)' }}>{step.detail}</p>
                  </div>
                </div>
              )
            })}
          </div>
          <p style={{ margin: '26px 0 0', paddingTop: 18, borderTop: '1px solid var(--border)', fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-mute)' }}>
            Costs are calculated deterministically from NRM1 benchmark data — the AI never invents a figure. This usually takes 20–40 seconds.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'transparent' }}>
      {/* Header */}
      <header className="sticky top-0 z-10 px-4" style={{ backgroundColor: 'var(--navy)', height: 56, display: 'flex', alignItems: 'center', boxShadow: '0 2px 10px rgba(14,27,46,.25)' }}>
        <div className="max-w-2xl mx-auto w-full flex items-center justify-between">
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
            <div style={{ width: 28, height: 28, background: 'var(--amber)', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 11, letterSpacing: '0.4px', flexShrink: 0 }}>AI</div>
            <span style={{ color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 17, letterSpacing: '0.2px' }}>Estates AI</span>
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span className="mono" style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase' }}>
              Stage 0–1 Questionnaire
            </span>
            <button onClick={logout}
              style={{ background: 'none', border: 'none', padding: 0, color: 'rgba(255,255,255,0.55)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              Log out
            </button>
          </div>
        </div>
      </header>

      {/* Section progress indicator */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-2xl mx-auto px-4" style={{ padding: '14px 16px 12px' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {SECTIONS.map((s, i) => {
              const state = s.id < section ? 'done' : s.id === section ? 'current' : 'todo'
              return (
                <div key={s.id} style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    height: 3, borderRadius: 2, marginBottom: 7,
                    background: state === 'done' ? 'var(--navy)' : state === 'current' ? 'var(--amber)' : 'var(--border)',
                    transition: 'background 0.3s ease',
                  }} />
                  <span className={state === 'current' ? '' : 'hide-sm'} style={{
                    display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10,
                    letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    color: state === 'current' ? 'var(--amber-deep)' : state === 'done' ? 'var(--ink)' : 'var(--text-mute)',
                    fontWeight: state === 'current' ? 500 : 400,
                  }}>
                    {String(s.id).padStart(2, '0')} {s.short}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Section header */}
        <div className="mb-8">
          <div style={{ marginBottom: 10 }}>
            <span className="mono" style={{ color: 'var(--amber-deep)', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase' }}>
              Section {section} of {SECTIONS.length}
            </span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '28px', color: 'var(--ink)', letterSpacing: '-0.2px', margin: '0 0 6px' }}>{SECTIONS[section - 1].title}</h1>
          <p style={{ color: 'var(--text-soft)', fontSize: '14.5px', margin: 0 }}>{SECTIONS[section - 1].subtitle}</p>
          {section === 1 && answers.q1_0_projectName && (
            <button
              onClick={() => {
                if (!window.confirm('Clear this form and start a new report? This cannot be undone.')) return
                try { localStorage.removeItem(STORAGE_KEY) } catch {}
                setAnswers({})
                setValidationErrors({})
              }}
              style={{ marginTop: 10, background: 'none', border: 'none', padding: 0, color: 'var(--text-soft)', fontSize: '12.5px', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              Clear form &amp; start a new report
            </button>
          )}
        </div>

        {error && (
          <div role="alert" aria-live="assertive" className="mb-6 p-4 rounded-lg border" style={{ backgroundColor: '#FEF2F2', borderColor: 'var(--danger)', color: 'var(--danger)' }}>
            <strong>Error:</strong> {error}
            {authError && (
              <>
                {' '}
                <Link href="/access" style={{ color: 'var(--danger)', textDecoration: 'underline', fontWeight: 600 }}>
                  Sign in again →
                </Link>
              </>
            )}
          </div>
        )}

        {/* ─── SECTION 1 ─────────────────────────────────────────────────────── */}
        {section === 1 && (
          <div className="flex flex-col gap-5 section-enter">
            <QCard>
              <Label required>Q1.0 — Project title</Label>
              <HelpText>This becomes the heading of your report. Include the work type, building type, and location — e.g. "Full Refurbishment — Accommodation Flat, B91 1SF, Solihull" or "New Sports Hall, University of Birmingham, Edgbaston".</HelpText>
              <TextInput value={answers.q1_0_projectName} onChange={v => set('q1_0_projectName', v)} placeholder="e.g. Full Refurbishment — Accommodation Flat, B91 1SF, Solihull" />
              {validationErrors.q1_0_projectName && <p className="mt-1 text-sm" style={{ color: 'var(--danger)' }}>{validationErrors.q1_0_projectName}</p>}
            </QCard>

            <QCard>
              <Label required>Q1.1 — Postcode</Label>
              <HelpText>Used to apply the BCIS regional cost factor. First 2–3 characters are sufficient.</HelpText>
              <TextInput value={answers.q1_1_postcode} onChange={v => set('q1_1_postcode', v)} placeholder="e.g. B15" />
              {validationErrors.q1_1_postcode && <p className="mt-1 text-sm" style={{ color: 'var(--danger)' }}>{validationErrors.q1_1_postcode}</p>}
              <BcisResolver
                postcode={answers.q1_1_postcode}
                regions={scopeData?.bcisRegions}
                chosen={answers.q1_1_bcisRegion}
                onChoose={v => set('q1_1_bcisRegion', v)}
              />
            </QCard>

            <QCard>
              <Label required>Q1.2 — Project type</Label>
              <SelectInput value={answers.q1_2_projectType} onChange={v => set('q1_2_projectType', v)}>
                <option value="">Select project type...</option>
                {PROJECT_TYPES.map(t => <option key={t.value} value={t.value}>{t.value}</option>)}
              </SelectInput>
              {/* The help line sits under the select and follows the choice,
                  rather than being crammed into the option text — seven long
                  options make a dropdown unreadable. */}
              {PROJECT_TYPES.find(t => t.value === answers.q1_2_projectType) && (
                <HelpText>{PROJECT_TYPES.find(t => t.value === answers.q1_2_projectType).help}</HelpText>
              )}
              {validationErrors.q1_2_projectType && <p className="mt-1 text-sm" style={{ color: 'var(--danger)' }}>{validationErrors.q1_2_projectType}</p>}

              {['New Build', 'Refurbishment', 'Extension'].includes(answers.q1_2_projectType) && (
                <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                  <Label>Q1.2a — Number of storeys{answers.q1_2_projectType === 'Extension' ? ' in the extension' : ''}</Label>
                  <SelectInput value={answers.q1_2_storeys || '1'} onChange={v => set('q1_2_storeys', v)}>
                    <option value="1">1 storey</option>
                    <option value="2">2 storeys</option>
                    <option value="3">3 storeys</option>
                    <option value="4">4 storeys</option>
                    <option value="5">5 storeys</option>
                    <option value="6">6 storeys</option>
                    {/* 7+ is the Building Safety Act higher-risk threshold for
                        residential / care / hospital use — see Q1.6. */}
                    <option value="7">7 or more storeys</option>
                  </SelectInput>
                </div>
              )}
            </QCard>

            <QCard>
              <Label required>Q1.3 — Building use</Label>
              <HelpText>Filters the scope list to the elements that apply, and selects the benchmark band the estimate is sense-checked against.</HelpText>
              <SelectInput value={answers.q1_3_buildingUse} onChange={v => set('q1_3_buildingUse', v)}>
                <option value="">Select building use...</option>
                <option>Residential</option>
                <option>Student accommodation (PBSA / halls)</option>
                <option>Commercial offices</option>
                <option>Education</option>
                <option>Healthcare</option>
                <option>Retail</option>
                <option>Industrial / warehouse</option>
                <option>Hospitality / leisure</option>
                <option>Mixed use</option>
                <option>Other</option>
              </SelectInput>
              {validationErrors.q1_3_buildingUse && <p className="mt-1 text-sm" style={{ color: 'var(--danger)' }}>{validationErrors.q1_3_buildingUse}</p>}
              {answers.q1_3_buildingUse === 'Other' && (
                <div className="mt-3">
                  <TextInput value={answers.q1_3_buildingUseOther} onChange={v => set('q1_3_buildingUseOther', v)} placeholder="Please describe the building use" />
                </div>
              )}
            </QCard>

            {isQuestionShown('q1_4_buildingAge', answers.q1_2_projectType) && (
              <QCard>
                <Label required>Q1.4 — Building age</Label>
                <div style={{ marginTop: 4 }}>
                  <RadioGroup options={BUILDING_AGES} value={answers.q1_4_buildingAge} onChange={v => set('q1_4_buildingAge', v)} />
                </div>
                {validationErrors.q1_4_buildingAge && <p className="mt-1 text-sm" style={{ color: 'var(--danger)' }}>{validationErrors.q1_4_buildingAge}</p>}
              </QCard>
            )}

            {showsHeightQuestion(answers.q1_2_storeys) && (
              <QCard>
                <Label>Q1.6 — Building height</Label>
                <HelpText>Is the building 18 metres or taller, measured to the floor level of the top storey?</HelpText>
                <RadioGroup
                  options={['Yes', 'No', 'Not sure']}
                  value={answers.q1_6_heightOver18m}
                  onChange={v => set('q1_6_heightOver18m', v)}
                  ariaLabel="Is the building 18 metres or taller"
                />
                {/* The consequence, not the jargon — "higher-risk building"
                    means nothing to most clients, and the gateway is what
                    actually changes their programme. */}
                {isHigherRiskBuilding(answers) && (
                  <p role="status" style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, fontSize: 13, border: '1px solid var(--amber)', backgroundColor: 'rgba(196,134,26,.07)', color: 'var(--ink)' }}>
                    This is a <strong>higher-risk building</strong> under the Building Safety Act. Construction cannot start until Gateway 2 approval is granted, which is added to the programme.
                  </p>
                )}
              </QCard>
            )}

            <QCard>
              <Label required>{areaQuestionLabel(answers.q1_2_projectType)}</Label>
              <HelpText>{areaHelpText(answers.q1_2_projectType)}</HelpText>
              <NumberInput value={answers.q1_5_size} onChange={v => set('q1_5_size', v)} placeholder="e.g. 500" min={1} />
              {validationErrors.q1_5_size && <p className="mt-1 text-sm" style={{ color: 'var(--danger)' }}>{validationErrors.q1_5_size}</p>}
            </QCard>
          </div>
        )}

        {/* ─── SECTION 2 ─────────────────────────────────────────────────────── */}
        {section === 2 && (
          <div className="flex flex-col gap-5 section-enter">
            <QCard>
              <Label required>Q2.1 — Project objective</Label>
              <HelpText>Describe what you are trying to achieve and why this project is needed.</HelpText>
              <Textarea value={answers.q2_1_objective} onChange={v => set('q2_1_objective', v)} placeholder="e.g. Refurbish the first floor to provide modern open-plan office space and upgrade the M&E to current standards." rows={4} />
              {validationErrors.q2_1_objective && <p className="mt-1 text-sm" style={{ color: 'var(--danger)' }}>{validationErrors.q2_1_objective}</p>}
            </QCard>

            {isRefurb && (
              <QCard>
                <Label required>Q2.3 — Level of intervention</Label>
                <HelpText>Determines the rate band applied to costs and the design duration multiplier. Scope items that require a higher level are greyed out below.</HelpText>
                <div className="flex flex-col gap-3">
                  {INTERVENTION_LEVELS.map(opt => (
                    <label key={opt.value} className="flex items-start gap-3 cursor-pointer rounded-xl p-4"
                      style={{
                        border: answers.q2_3_interventionLevel === opt.value ? '2px solid var(--navy)' : '1.5px solid var(--border)',
                        backgroundColor: answers.q2_3_interventionLevel === opt.value ? 'rgba(26,46,74,.06)' : 'var(--tint)',
                        transition: 'border-color 0.13s ease, background 0.13s ease',
                      }}>
                      <input type="radio" value={opt.value} checked={answers.q2_3_interventionLevel === opt.value}
                        onChange={() => set('q2_3_interventionLevel', opt.value)}
                        className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ accentColor: 'var(--navy)' }} />
                      <div>
                        <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, color: '#1A2E4A', fontSize: '14px' }}>{opt.value}</div>
                        <div style={{ color: 'var(--navy)', fontSize: '12px', fontWeight: 600, marginTop: '3px' }}>{opt.signal}</div>
                        <div style={{ color: '#6B7280', fontSize: '13px', marginTop: '4px', lineHeight: 1.5 }}>{opt.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
                {validationErrors.q2_3_interventionLevel && <p className="mt-2 text-sm" style={{ color: 'var(--danger)' }}>{validationErrors.q2_3_interventionLevel}</p>}
              </QCard>
            )}

            {/* Q2.3 Scope picker — its own visual container */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '28px', boxShadow: 'var(--shadow-1)' }}>
              <Label>Q2.2 — Scope of works</Label>
              <HelpText>Tick every element that is in scope. Use Other / Specialist below for anything not listed.</HelpText>
              <ScopePresetBar
                projectType={answers.q1_2_projectType}
                tier={currentTier}
                selectedCount={(answers.q2_2_scopeItems || []).length}
                onApply={applyScopePreset}
                onClear={clearScope}
              />
              <ScopeSuggestBar
                objective={answers.q2_1_objective}
                projectType={answers.q1_2_projectType}
                buildingUse={answers.q1_3_buildingUse}
                interventionLevel={answers.q2_3_interventionLevel}
                selectedCount={(answers.q2_2_scopeItems || []).length}
                onApply={applySuggestedScope}
                onUsePreset={applyScopePreset}
                hasPreset={!!presetScopeFor(answers.q1_2_projectType, currentTier)}
              />
              {(() => {
                const scopeArr = Array.isArray(answers.q2_2_scopeItems) ? answers.q2_2_scopeItems : []
                const quantities = answers.q2_2_quantities || {}
                const setQty = (code, val) => set('q2_2_quantities', { ...(answers.q2_2_quantities || {}), [code]: val })
                const toggleScope = code => {
                  set('q2_2_scopeItems', scopeArr.includes(code) ? scopeArr.filter(v => v !== code) : [...scopeArr, code])
                }
                const heatingSelected = scopeArr.includes('5.2') || scopeArr.includes('5.2L')
                const heatingType = scopeArr.includes('5.2') ? '5.2' : scopeArr.includes('5.2L') ? '5.2L' : ''
                const clearHeating = arr => arr.filter(v => !HEATING_CODES.includes(v))
                const toggleHeating = () => {
                  set('q2_2_scopeItems', heatingSelected ? clearHeating(scopeArr) : [...clearHeating(scopeArr), '5.2', '5.5'])
                }
                const selectHeatingType = (type) => {
                  const cleaned = clearHeating(scopeArr)
                  set('q2_2_scopeItems', type === '5.2' ? [...cleaned, '5.2', '5.5'] : [...cleaned, '5.2L'])
                }
                const toggleWiring = (code) => {
                  const newScope = scopeArr.includes(code)
                    ? scopeArr.filter(v => v !== code)
                    : [...scopeArr, code]
                  const has8a = newScope.includes('5.8a')
                  const has8b = newScope.includes('5.8b')
                  set('q2_2_scopeItems', newScope)
                  set('q2_2_wiring', (has8a && has8b) ? '5.8' : has8a ? '5.8a' : has8b ? '5.8b' : 'none')
                }
                const togglePlumbing = (code) => {
                  const other = code === '5.1' ? '5.1b' : '5.1'
                  const newScope = scopeArr.includes(code)
                    ? scopeArr.filter(v => v !== code)
                    : [...scopeArr.filter(v => v !== other), code]
                  set('q2_2_scopeItems', newScope)
                }
                const tierName = mlvl => Object.entries(LEVEL_TIER).find(([, v]) => v === mlvl)?.[0]
                const groupSelectedCount = items =>
                  items.reduce((n, it) => n + (scopeArr.includes(it.code) ? 1 : 0), 0)
                const S = {
                  grpBlock: { marginBottom: 12 },
                  groupHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '11px 14px', background: 'var(--tint-2)', border: '1px solid var(--border)', borderRadius: 9, cursor: 'pointer', userSelect: 'none' },
                  groupLabel: { fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 12, color: '#1A2E4A', textTransform: 'uppercase', letterSpacing: '0.4px' },
                  countPill: { fontFamily: 'var(--font-body)', background: 'rgba(26,46,74,.06)', color: 'var(--navy)', fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20 },
                  chevron: { width: 16, height: 16, color: 'var(--text-mute)', transition: 'transform 0.18s ease', flexShrink: 0 },
                  // minmax(240px, 1fr) alone never shrinks a column below
                  // 240px even when the grid's own container is narrower —
                  // at a 320px viewport (minus the page's side padding) that
                  // overflowed the whole page horizontally. min(240px, 100%)
                  // caps the minimum to whatever width is actually available.
                  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))', gap: 8, padding: '10px 0 4px' },
                  tile: { display: 'flex', alignItems: 'flex-start', gap: 9, border: '1.5px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: '#fff', cursor: 'pointer' },
                  // Full `border` shorthand, not a `borderColor` override: this
                  // object is spread over `tile`, which sets the shorthand, and
                  // React warns (35 times per render of this picker) that mixing
                  // the two can drop the value on re-render.
                  tileSel: { border: '1.5px solid var(--navy)', background: 'rgba(26,46,74,.06)', boxShadow: '0 1px 6px rgba(26,46,74,0.12)' },
                  tileDis: { opacity: 0.45, cursor: 'not-allowed' },
                  checkBox: { width: 18, height: 18, borderRadius: 5, border: '1.5px solid var(--border-2)', flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' },
                  // Full shorthand, same reason as `tileSel` above: spread over
                  // `checkBox` (which sets `border`), a bare `borderColor` made
                  // React log a shorthand/longhand conflict once per ticked tile.
                  checkBoxSel: { background: 'var(--navy)', border: '1.5px solid var(--navy)', color: '#fff' },
                  tileText: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
                  tileLabel: { fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, color: '#1A2E4A', lineHeight: 1.3 },
                  subPrompt: { background: 'var(--tint)', borderLeft: '3px solid var(--navy)', padding: '10px 14px', margin: '6px 0 2px', borderRadius: '0 8px 8px 0' },
                  subLabel: { fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 5, fontWeight: 500 },
                  subInput: { fontSize: 14, padding: '6px 10px', border: '1.5px solid var(--border)', borderRadius: 7, color: '#111827', outline: 'none' },
                  radioRow: { display: 'flex', alignItems: 'flex-start', gap: 9, padding: '5px 0', cursor: 'pointer' },
                  radioCheck: { marginTop: 2, flexShrink: 0, accentColor: 'var(--navy)', width: 15, height: 15 },
                  radioLabel: { fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12.5, color: '#1A2E4A', lineHeight: 1.3 },
                  radioDesc: { fontWeight: 400, fontSize: 11.5, color: '#6B7280', lineHeight: 1.45 },
                  reqNote: { fontSize: 10.5, color: '#B06000', fontWeight: 500 },
                  subGrpLabel: { display: 'inline-block', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 10.5, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.6px', background: 'rgba(26,46,74,.06)', padding: '3px 10px', borderRadius: 6, marginTop: 12 },
                }
                const Check = () => (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                )
                if (!scopeData) return <p style={{ color: '#6B7280', fontSize: 13, padding: '8px 0' }}>Loading scope items…</p>
                if (!answers.q1_2_projectType) return <p style={{ color: '#6B7280', fontSize: 13, padding: '8px 0' }}>Select a project type (Q1.2) above to see the relevant scope items.</p>
                const visibleGroups = VISIBLE_GROUPS[answers.q1_2_projectType] || scopeData.groups.map(g => g.group)
                const bu = answers.q1_3_buildingUse || ''
                const displayedGroups = scopeData.groups
                  .filter(g => visibleGroups.includes(g.group))
                  .map(g => ({ ...g, items: g.items.filter(it => matchesBuildingUse(it.buildingUse, bu) && !FOLDED_CODES.has(it.code) && priceableFor(it, answers.q1_2_projectType)) }))
                  .filter(g => g.items.length > 0)
                if (displayedGroups.length === 0) return <p style={{ color: '#6B7280', fontSize: 13, padding: '8px 0' }}>No scope items match this project type and building use yet.</p>
                const MECH_CODES_5 = new Set(['5.19', '5.20', '5.21', '5.23', '5.24', '5.29'])
                const getMechElec = code => {
                  if (MECH_CODES_5.has(code)) return 'mech'
                  const m = code.match(/^5\.(\d+)/)
                  return (m && Number(m[1]) >= 7) ? 'elec' : 'mech'
                }
                const getGroup4Split = code => {
                  const m = code.match(/^4\.(\d+)/)
                  return (m && Number(m[1]) <= 9) ? 'general' : 'specialist'
                }
                const hiddenInput = { position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' }
                const renderItem = item => {
                  const minLvl = item.minLvl || 1
                  const isEnabled = !isRefurb || currentTier >= minLvl
                  if (item.code === '5.2') {
                    const min2 = itemByCode['5.2']?.minLvl || 3
                    const min2L = itemByCode['5.2L']?.minLvl || 2
                    const lowestMin = Math.min(min2, min2L)
                    const heatingEnabled = !isRefurb || currentTier >= lowestMin
                    const can2 = (!isRefurb || currentTier >= min2) && priceableFor(itemByCode['5.2'], answers.q1_2_projectType)
                    // 5.2L is refurb-only in the workbook (no NB/Ext rate) — on a
                    // new build it used to be offered, ticked, and then excluded.
                    const can2L = (!isRefurb || currentTier >= min2L) && priceableFor(itemByCode['5.2L'], answers.q1_2_projectType)
                    const sel = heatingSelected && heatingEnabled
                    return (
                      <div key="__heating__" style={{ gridColumn: '1 / -1' }}>
                        <label className={`scope-tile${heatingEnabled ? '' : ' is-disabled'}`}
                          style={{ ...S.tile, ...(sel ? S.tileSel : {}), ...(heatingEnabled ? {} : S.tileDis) }}>
                          <input type="checkbox" checked={sel} disabled={!heatingEnabled}
                            onChange={() => { if (heatingEnabled) toggleHeating() }} style={hiddenInput} />
                          <span style={{ ...S.checkBox, ...(sel ? S.checkBoxSel : {}) }}>{sel && <Check />}</span>
                          <div style={S.tileText}>
                            <span style={S.tileLabel}>Heating system</span>
                            {!heatingEnabled && <span style={S.reqNote}>Requires: {tierName(lowestMin)}</span>}
                          </div>
                        </label>
                        {sel && (
                          <div style={S.subPrompt}>
                            <span style={S.subLabel}>Type of heating works</span>
                            {[
                              { value: '5.2',  label: 'New or upgraded system', desc: 'Full design and installation — LTHW, heat pump or underfloor heating', can: can2, min: min2 },
                              { value: '5.2L', label: 'Like-for-like boiler replacement', desc: 'Swap end-of-life unit only — no new pipework or system redesign', can: can2L, min: min2L },
                            ].map(opt => (
                              <label key={opt.value} style={{ ...S.radioRow, ...(opt.can ? {} : { opacity: 0.4, cursor: 'not-allowed' }) }}>
                                <input type="radio" value={opt.value} checked={heatingType === opt.value} disabled={!opt.can}
                                  onChange={() => { if (opt.can) selectHeatingType(opt.value) }} style={S.radioCheck} />
                                <div style={S.tileText}>
                                  <span style={S.radioLabel}>{opt.label}</span>
                                  <span style={S.radioDesc}>{opt.desc}</span>
                                  {!opt.can && <span style={S.reqNote}>Requires: {tierName(opt.min)}</span>}
                                </div>
                              </label>
                            ))}
                            <p style={{ fontSize: 11, color: '#6B7280', marginTop: 8, fontStyle: 'italic' }}>Gas supply pipework is included automatically when a new or upgraded system is selected.</p>
                          </div>
                        )}
                      </div>
                    )
                  }
                  const isWiring = WIRING_MUTEX.includes(item.code)
                  const isPlumbing = PLUMBING_MUTEX.includes(item.code)
                  const isTicked = scopeArr.includes(item.code)
                  const sel = isTicked && isEnabled
                  const showQty = sel && itemNeedsQty(item)
                  const onToggle = () => {
                    if (!isEnabled) return
                    if (isWiring)        toggleWiring(item.code)
                    else if (isPlumbing) togglePlumbing(item.code)
                    else                 toggleScope(item.code)
                  }
                  const tile = (
                    <label className={`scope-tile${isEnabled ? '' : ' is-disabled'}`}
                      style={{ ...S.tile, ...(sel ? S.tileSel : {}), ...(isEnabled ? {} : S.tileDis) }}>
                      <input type="checkbox" checked={sel} disabled={!isEnabled} onChange={onToggle} style={hiddenInput} />
                      <span style={{ ...S.checkBox, ...(sel ? S.checkBoxSel : {}) }}>{sel && <Check />}</span>
                      <div style={S.tileText}>
                        <span style={S.tileLabel}>{item.description}</span>
                        {!isEnabled && <span style={S.reqNote}>Requires: {tierName(minLvl)}</span>}
                      </div>
                    </label>
                  )
                  if (!showQty) return <div key={item.code}>{tile}</div>
                  return (
                    <div key={item.code} style={{ gridColumn: '1 / -1' }}>
                      {tile}
                      <div style={S.subPrompt}>
                        <span style={S.subLabel}>{qtyPromptLabel(item)}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input type="number" value={quantities[item.code] ?? ''}
                            onChange={e => setQty(item.code, e.target.value)}
                            placeholder="e.g. 4" min={0}
                            style={{ ...S.subInput, width: 100 }} />
                          <span style={{ fontSize: 12, color: '#6B7280' }}>{item.unit}</span>
                        </div>
                      </div>
                    </div>
                  )
                }
                const GroupHead = ({ grp, count }) => {
                  const collapsed = collapsedGroups.has(grp.group)
                  // Was a <div onClick> — invisible to keyboard users entirely
                  // (no tabIndex, no key handler), so a group could only ever
                  // be collapsed or reopened with a mouse. A real <button>
                  // gets Tab reachability and Enter/Space activation for free.
                  return (
                    <button type="button" className="scope-group-head" style={{ ...S.groupHead, width: '100%', font: 'inherit', textAlign: 'left' }}
                      aria-expanded={!collapsed}
                      onClick={() => toggleGroupCollapse(grp.group)}>
                      <span style={S.groupLabel}>{grp.label}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {count > 0 && <span style={S.countPill}>{count} selected</span>}
                        <svg style={{ ...S.chevron, transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </button>
                  )
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {displayedGroups.map(grp => {
                      const collapsed = collapsedGroups.has(grp.group)
                      const count = groupSelectedCount(grp.items)
                      if (grp.group === 4) {
                        const generalItems    = grp.items.filter(it => getGroup4Split(it.code) === 'general')
                        const specialistItems = grp.items.filter(it => getGroup4Split(it.code) === 'specialist')
                        return (
                          <div key={grp.group} style={S.grpBlock}>
                            <GroupHead grp={grp} count={count} />
                            {!collapsed && (
                              <>
                                {generalItems.length > 0 && (
                                  <>
                                    <div style={S.subGrpLabel}>Fittings, Furniture &amp; Sanitary</div>
                                    <div style={S.grid}>{generalItems.map(renderItem)}</div>
                                  </>
                                )}
                                {/* The sector-specific tail (4.10–4.32) is over
                                    twenty tiles — catering canopies, fume
                                    cupboards, dock levellers, spectator seating
                                    — and most projects need none of it. Folded
                                    behind a disclosure unless something in it is
                                    already selected, so it stays one click away
                                    without padding the list everyone scrolls. */}
                                {specialistItems.length > 0 && (() => {
                                  const specialistCount = groupSelectedCount(specialistItems)
                                  const open = showSectorTail || specialistCount > 0
                                  return (
                                    <>
                                      <button type="button" onClick={() => setShowSectorTail(v => !v)}
                                        style={{
                                          ...S.subGrpLabel, display: 'flex', alignItems: 'center', gap: 6,
                                          background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer',
                                          textAlign: 'left', width: '100%', fontFamily: 'var(--font-body)',
                                        }}>
                                        <span>Sector-Specific Equipment</span>
                                        {specialistCount > 0
                                          ? <span style={S.countPill}>{specialistCount} selected</span>
                                          : <span style={{ color: 'var(--text-mute)' }}>
                                              ({specialistItems.length}) {open ? '−' : '+'}
                                            </span>}
                                      </button>
                                      {open && <div style={S.grid}>{specialistItems.map(renderItem)}</div>}
                                    </>
                                  )
                                })()}
                              </>
                            )}
                          </div>
                        )
                      }
                      if (grp.group === 5) {
                        const mechItems = grp.items.filter(it => getMechElec(it.code) === 'mech')
                        const elecItems = grp.items.filter(it => getMechElec(it.code) === 'elec')
                        return (
                          <div key={grp.group} style={S.grpBlock}>
                            <GroupHead grp={grp} count={count} />
                            {!collapsed && (
                              <>
                                {mechItems.length > 0 && (
                                  <>
                                    <div style={S.subGrpLabel}>Mechanical Services</div>
                                    <div style={S.grid}>{mechItems.map(renderItem)}</div>
                                  </>
                                )}
                                {elecItems.length > 0 && (
                                  <>
                                    <div style={S.subGrpLabel}>Electrical Services</div>
                                    <div style={S.grid}>{elecItems.map(renderItem)}</div>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        )
                      }
                      return (
                        <div key={grp.group} style={S.grpBlock}>
                          <GroupHead grp={grp} count={count} />
                          {!collapsed && <div style={S.grid}>{grp.items.map(renderItem)}</div>}
                        </div>
                      )
                    })}
                    {/* Other / Specialist scope */}
                    <div style={{ marginTop: 12 }}>
                      <div style={{ ...S.groupHead, cursor: 'default', marginBottom: 10 }}>
                        <span style={S.groupLabel}>Other / Specialist scope</span>
                      </div>
                      <Textarea value={answers.q2_2_additionalScope?.text}
                        onChange={v => set('q2_2_additionalScope', { ...(answers.q2_2_additionalScope || {}), text: v })}
                        placeholder="Any specialist scope not listed above — e.g. AV systems, heritage restoration, acoustic treatment, signage, modular pods" rows={2} />
                      <div className="mt-2">
                        <p className="text-sm mb-1" style={{ color: '#6B7280' }}>Approximate value of specialist scope (optional — leave blank for provisional exclusion)</p>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 font-medium" style={{ color: '#555' }}>£</span>
                          <input type="number" value={answers.q2_2_additionalScope?.approxValue || ''}
                            onChange={e => set('q2_2_additionalScope', { ...(answers.q2_2_additionalScope || {}), approxValue: e.target.value })}
                            placeholder="e.g. 50000" min={0}
                            className="w-full rounded-lg pl-7 pr-3 focus:outline-none focus:ring-2 focus:ring-[color:var(--navy)]"
                            style={{ border: '1.5px solid var(--border)', minHeight: '48px', fontSize: '16px', color: '#1A1A1A', backgroundColor: '#FFF' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })()}
              {validationErrors.q2_2_scopeItems && <p className="mt-2 text-sm" style={{ color: 'var(--danger)' }}>{validationErrors.q2_2_scopeItems}</p>}
            </div>

            {/* The NRM1 workbook has no "Basic" rate column for new build or
                extension — getRateForElement returns the Standard column for
                anything that isn't High. Offering a tile labelled "Lowest cost"
                that prices identically to Standard tells the user they have made
                a saving they have not made, so it is hidden where it is a no-op.
                External Works has a single rate column, so the whole question is
                meaningless there. */}
            {specLevelsForType.length > 0 && isQuestionShown('q2_4_specLevel', answers.q1_2_projectType) && (
            <QCard>
              <Label required>Q2.4 — Specification level</Label>
              <HelpText>Selects the rate column from the NRM1 benchmark table.</HelpText>
              <div className="flex flex-col gap-3">
                {specLevelsForType.map(opt => (
                  <label key={opt.value} className="flex items-start gap-3 cursor-pointer rounded-xl p-4"
                    style={{
                      border: answers.q2_4_specLevel === opt.value ? '2px solid var(--navy)' : '1.5px solid var(--border)',
                      backgroundColor: answers.q2_4_specLevel === opt.value ? 'rgba(26,46,74,.06)' : 'var(--tint)',
                      transition: 'border-color 0.13s ease, background 0.13s ease',
                    }}>
                    <input type="radio" value={opt.value} checked={answers.q2_4_specLevel === opt.value}
                      onChange={() => set('q2_4_specLevel', opt.value)}
                      className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ accentColor: 'var(--navy)' }} />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, color: '#1A2E4A', fontSize: '14px' }}>{opt.value}</span>
                        <span style={{ background: '#1A2E4A', color: '#fff', fontSize: '11px', fontWeight: 600, padding: '2px 9px', borderRadius: 20 }}>{opt.tag}</span>
                      </div>
                      <div style={{ color: '#6B7280', fontSize: '13px', marginTop: '4px', lineHeight: 1.5 }}>{opt.description}</div>
                    </div>
                  </label>
                ))}
              </div>
              {validationErrors.q2_4_specLevel && <p className="mt-2 text-sm" style={{ color: 'var(--danger)' }}>{validationErrors.q2_4_specLevel}</p>}
            </QCard>
            )}

            {/* Was a free-text box. The cost engine tests this answer for the
                literal substring "breeam" to apply a +1% professional-fees
                uplift, so a user who wrote "sustainability to funder standard"
                silently lost it. Ticking a box cannot miss. The value is still
                stored as a comma-joined string, which is what the engine and the
                AI prompt already read — no calculator change needed. */}
            <QCard>
              <Label>Q2.5 — Standards and compliance requirements</Label>
              <HelpText>Tick any standards, certifications or funder conditions that apply. BREEAM adds a professional-fees allowance.</HelpText>
              <CheckboxGroup
                options={STANDARDS_OPTIONS}
                values={standardsList}
                onChange={next => set('q2_5_standards', applyNoneMutex(standardsList, next, 'None').join(', '))}
              />
              {standardsList.includes('Other') && (
                <div style={{ marginTop: 12 }}>
                  <Textarea value={answers.q2_5_standardsOther} onChange={v => set('q2_5_standardsOther', v)}
                    placeholder="Which other standard or funder condition applies?" rows={2} />
                </div>
              )}
            </QCard>
          </div>
        )}

        {/* ─── SECTION 3 ─────────────────────────────────────────────────────── */}
        {section === 3 && (
          <div className="flex flex-col gap-5 section-enter">
            <QCard>
              <Label>Q3.1 — Known issues</Label>
              <HelpText>Select all that apply. These trigger risk allowance adjustments.</HelpText>
              <CheckboxGroup options={knownIssuesFor(answers.q1_2_projectType)} values={answers.q3_1_knownIssues}
                onChange={v => set('q3_1_knownIssues', applyNoneMutex(answers.q3_1_knownIssues || [], v, KNOWN_ISSUE_NONE))} />
            </QCard>

            {isQuestionShown('q3_2_previousWorks', answers.q1_2_projectType) && (
              <QCard>
                <Label>Q3.2 — Previous works or relevant history</Label>
                <Textarea value={answers.q3_2_previousWorks} onChange={v => set('q3_2_previousWorks', v)} placeholder="e.g. M&E replaced in 2015. New roof in 2018. No structural works since original construction." rows={3} />
              </QCard>
            )}

            <QCard>
              <Label>Q3.3 — Surveys and reports available</Label>
              {/* The old copy promised surveys also reduce "survey programme
                  time". They do not: survey activities run parallel to design
                  and surveyWeeks is never added to the total. Only the risk
                  claim is true. */}
              <HelpText>Select all that apply. Having surveys in hand reduces the risk allowance in the estimate.</HelpText>
              <CheckboxGroup options={surveysFor(answers.q1_2_projectType, answers.q1_4_buildingAge)} values={answers.q3_3_surveys}
                onChange={v => set('q3_3_surveys', applyNoneMutex(answers.q3_3_surveys || [], v, SURVEY_NONE))} />
              {Array.isArray(answers.q3_3_surveys) && answers.q3_3_surveys.includes('Other') && (
                <div className="mt-3">
                  <Textarea value={answers.q3_3_surveysOther} onChange={v => set('q3_3_surveysOther', v)}
                    placeholder="Please describe the survey or report available" rows={2} />
                </div>
              )}
            </QCard>

            <QCard>
              <Label>Q3.4 — Planning consent required</Label>
              <HelpText>Select the most likely planning pathway. If unsure, choose 'Unsure' — pre-application advice is recommended.</HelpText>
              <RadioGroup options={PLANNING_OPTIONS} value={answers.q3_4_planningConsents} onChange={v => set('q3_4_planningConsents', v)} />
            </QCard>

            <QCard>
              <Label>Q3.5 — Access constraints</Label>
              <HelpText>Select all that apply. These affect the contractor's preliminaries allowance.</HelpText>
              {/* "No access constraints" must be exclusive: ticked alongside a
                  real constraint it silently suppressed every access risk seed
                  in the generated report. */}
              <CheckboxGroup options={ACCESS_OPTIONS} values={answers.q3_5_accessConstraints}
                onChange={v => set('q3_5_accessConstraints', applyNoneMutex(answers.q3_5_accessConstraints || [], v, 'No access constraints'))} />
              {Array.isArray(answers.q3_5_accessConstraints) && answers.q3_5_accessConstraints.includes('Other') && (
                <div className="mt-3">
                  <Textarea value={answers.q3_5_accessConstraintsOther} onChange={v => set('q3_5_accessConstraintsOther', v)}
                    placeholder="Please describe the access constraint" rows={2} />
                </div>
              )}
            </QCard>

            <QCard>
              <Label>{occupationCopyFor(answers.q1_2_projectType).label}</Label>
              <HelpText>{occupationCopyFor(answers.q1_2_projectType).help}</HelpText>
              <RadioGroup options={OCCUPATION_OPTIONS} value={answers.q3_6_occupation} onChange={v => set('q3_6_occupation', v)} />
            </QCard>

            <QCard>
              <Label>Q3.7 — Additional context</Label>
              <Textarea value={answers.q3_7_additionalContext} onChange={v => set('q3_7_additionalContext', v)} placeholder="Anything else that might affect the cost, programme or risk — location, operational constraints, heritage status, etc." rows={3} />
            </QCard>

            {/* Q3.8 (September 2026). Each option is a deterministic trigger:
                a risk-register seed for all four, plus Building Safety Act
                fee/cost rows and a Gateway 2 programme stage for a higher-risk
                building, and an ecology survey stage for ecological features.
                Rendered last so the visible numbers ascend — it used to sit
                above Q3.7, which is exactly the kind of jumble that makes a
                precision tool look careless. */}
            <QCard>
              <Label>Q3.8 — Site and building context</Label>
              <HelpText>Select all that apply. Each one adds a specific statutory or programme risk the report must address.</HelpText>
              <CheckboxGroup options={SITE_CONTEXT_OPTIONS} values={answers.q3_8_siteContext}
                onChange={v => set('q3_8_siteContext', applyNoneMutex(answers.q3_8_siteContext || [], v, SITE_CONTEXT_NONE))} />
            </QCard>
          </div>
        )}

        {/* ─── SECTION 4 ─────────────────────────────────────────────────────── */}
        {section === 4 && (
          <div className="flex flex-col gap-5 section-enter">
            <QCard>
              <Label>Q4.1 — Target completion date</Label>
              <HelpText>Used to assess programme feasibility. Leave blank if no specific deadline.</HelpText>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[
                  { label: 'No specific deadline', value: 'No specific deadline', checked: answers.q4_1_targetDate === 'No specific deadline', onChange: () => set('q4_1_targetDate', 'No specific deadline') },
                  { label: 'Specific target date', value: 'specific', checked: !!answers.q4_1_targetDate && answers.q4_1_targetDate !== 'No specific deadline', onChange: () => set('q4_1_targetDate', '') },
                ].map(opt => (
                  <button key={opt.label} type="button" onClick={opt.onChange}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 11,
                      padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
                      border: opt.checked ? '1.5px solid var(--navy)' : '1.5px solid var(--border)',
                      background: opt.checked ? 'rgba(26,46,74,.06)' : 'var(--tint)',
                      textAlign: 'left', width: '100%',
                      boxShadow: opt.checked ? '0 1px 6px rgba(26,46,74,0.12)' : 'none',
                    }}>
                    <span style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, display: 'inline-block', border: opt.checked ? '5px solid var(--navy)' : '1.5px solid var(--border-2)', background: '#fff' }} />
                    <span style={{ fontFamily: 'var(--font-body)', fontWeight: opt.checked ? 700 : 500, fontSize: '14px', color: opt.checked ? '#1A2E4A' : '#374151' }}>{opt.label}</span>
                  </button>
                ))}
                {answers.q4_1_targetDate !== 'No specific deadline' && (
                  <input type="date" value={answers.q4_1_targetDate || ''} onChange={e => set('q4_1_targetDate', e.target.value)}
                    className="w-full rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-[color:var(--navy)]"
                    style={{ border: '1.5px solid var(--border)', minHeight: '48px', fontSize: '16px', color: '#1A1A1A', backgroundColor: '#FFF', boxSizing: 'border-box', marginTop: 4 }} />
                )}
              </div>
            </QCard>

            {/* Expected start (September 2026). The programme used to run from
                "today" with no calendar dates at all, and the target-date check
                assumed the project started the moment the report was generated.
                It takes the 4.2 slot left free when the dead budget-gate
                question was removed, and sits after Q4.1 so the visible numbers
                ascend. The stored key stays `q4_0_startDate` — the calculators
                read it by key, and renaming keys is how this questionnaire has
                broken itself before. */}
            <QCard>
              <Label>Q4.2 — Expected project start</Label>
              <HelpText>When do you expect to start (Stage 1 gateway approval)? Leave blank to assume the programme starts on the report date. Used to put calendar dates on the programme and to test the target date above.</HelpText>
              <input type="date" value={answers.q4_0_startDate || ''} onChange={e => set('q4_0_startDate', e.target.value)}
                aria-label="Expected project start date"
                className="w-full rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-[color:var(--navy)]"
                style={{ border: '1.5px solid var(--border)', minHeight: '48px', fontSize: '16px', color: '#1A1A1A', backgroundColor: '#FFF', boxSizing: 'border-box' }} />
            </QCard>

            {/* The old "Do you have a budget figure?" gate (q4_2_budgetKnown) is
                gone. Its value was read by nothing — not the calculators, the AI
                prompt, the confidence grade or the report — it only decided
                whether to reveal the amount field below. Leaving the amount
                always visible removes a required click and a duplicated "Q4.3"
                label without changing any output: an empty budget already yields
                a "no budget stated" verdict. The 4.2 number is now reused by the
                expected-start question above. */}
            <QCard>
              {/* Labelled Q4.3 to match its key `q4_3_budget`. There is no Q4.2
                  any more — the dead budget-gate question held that number. A gap
                  in the visible sequence is harmless; a label that disagrees with
                  the key is what caused the confusion this pass is removing. */}
              <Label>Q4.3 — Total budget, if you have one</Label>
              <HelpText>Include all professional fees, contingency and VAT, so it can be compared against the report&apos;s gross estimate. Leave blank to get a benchmark estimate with no budget comparison.</HelpText>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-medium" style={{ color: '#555' }}>£</span>
                <input type="number" value={answers.q4_3_budget || ''} onChange={e => set('q4_3_budget', e.target.value)} placeholder="e.g. 1500000" min={0}
                  className="w-full rounded-lg pl-7 pr-3 focus:outline-none focus:ring-2 focus:ring-[color:var(--navy)]"
                  style={{ border: '1.5px solid var(--border)', minHeight: '48px', fontSize: '16px', color: '#1A1A1A', backgroundColor: '#FFF' }} />
              </div>
            </QCard>

            {/* There is no VAT-position question. It briefly existed as Q4.3a
                and was removed: it never changed a cost, only the wording of
                the budget comparison, which is a poor return for asking a user
                to classify their organisation's VAT recovery. The budget check
                grosses up by the full workbook VAT rate, which is the
                conservative reading. */}

            <QCard>
              <Label>Q4.4 — What matters most on this project?</Label>
              <HelpText>Choose up to two. The first you tick is treated as the primary priority and drives the procurement recommendation; the second informs the programme options.</HelpText>
              <CheckboxGroup options={PRIORITIES} values={answers.q4_4_priorities} onChange={v => set('q4_4_priorities', v)} max={2} ariaLabel="Project priorities" />
              {Array.isArray(answers.q4_4_priorities) && answers.q4_4_priorities.length > 0 && (
                <p style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text-soft)' }}>
                  Primary: <strong style={{ color: 'var(--ink)' }}>{answers.q4_4_priorities[0]}</strong>
                  {answers.q4_4_priorities[1] ? <> · Secondary: <strong style={{ color: 'var(--ink)' }}>{answers.q4_4_priorities[1]}</strong></> : null}
                </p>
              )}
            </QCard>

            {/* Visible numbers below now match their answer keys. They used to
                run one behind from Q4.3 onward (two questions were both labelled
                "Q4.3"), so a colleague quoting "Q4.5" meant a different question
                to the one the code, CLAUDE.md and the report all call Q4.5. The
                keys are canonical and unchanged; only the labels moved. */}
            <QCard>
              <Label>Q4.5 — Design stage already reached</Label>
              <HelpText>Determines the professional fees percentage applied to the cost estimate and the viable procurement routes.</HelpText>
              <RadioGroup options={DESIGN_STAGE_OPTIONS} value={answers.q4_5_designStage} onChange={v => set('q4_5_designStage', v)} />
            </QCard>

            <QCard>
              <Label>Q4.6 — Single or phased delivery?</Label>
              <HelpText>Phased delivery extends the total construction programme. Each phase is assumed to be roughly equal in size at Stage 0–1.</HelpText>
              <SelectInput value={answers.q4_6_phasing || 'Single phase'} onChange={v => set('q4_6_phasing', v)}>
                <option value="Single phase">Single phase — full project delivered in one continuous programme</option>
                <option value="Multiple phases">Multiple phases — phased delivery (e.g. floor by floor, building by building, or rolling programme)</option>
              </SelectInput>
            </QCard>

            <QCard>
              <Label>Q4.7 — Funding source</Label>
              <HelpText>Grant or public funding adds a governance approval allowance to the programme.</HelpText>
              <RadioGroup options={FUNDING_OPTIONS} value={answers.q4_7_funding} onChange={v => set('q4_7_funding', v)} />
            </QCard>

            {/* ── Financial case (was its own step) ──────────────────────────── */}
            <SubHead
              title="Financial case"
              note="Optional. Complete only if you want the report to include an ROI analysis."
            />

            {isQuestionShown('q5_1_financialBenefit', answers.q1_2_projectType) && (
            <QCard>
              <Label>Q5.1 — Financial benefit type</Label>
              <HelpText>Select all that apply. &lsquo;No direct financial return&rsquo; is mutually exclusive.</HelpText>
              <CheckboxGroup
                options={FINANCIAL_BENEFIT_OPTIONS}
                values={answers.q5_1_financialBenefit}
                onChange={v => set('q5_1_financialBenefit',
                  applyNoneMutex(answers.q5_1_financialBenefit || [], v, NO_FINANCIAL_RETURN))}
              />
            </QCard>
            )}

            {showRoiAmount && isQuestionShown('q5_2_annualBenefit', answers.q1_2_projectType) && (
              <QCard>
                <Label>Q5.2 — Estimated annual benefit (£)</Label>
                <HelpText>Used to calculate simple payback period and ROI.</HelpText>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-medium" style={{ color: '#555' }}>£</span>
                  <input type="number" value={answers.q5_2_annualBenefit || ''} onChange={e => set('q5_2_annualBenefit', e.target.value)} placeholder="e.g. 80000" min={0}
                    className="w-full rounded-lg pl-7 pr-3 focus:outline-none focus:ring-2 focus:ring-[color:var(--navy)]"
                    style={{ border: '1.5px solid var(--border)', minHeight: '48px', fontSize: '16px', color: '#1A1A1A', backgroundColor: '#FFF' }} />
                </div>
              </QCard>
            )}

            {/* ── Report preferences (was its own step) ──────────────────────── */}
            {/* There is no "which sections do you want" question any more. It
                asked the user to make a decision they had no basis for before
                seeing a report, and it was nearly redundant: the ROI section
                already hides itself when no financial benefit was given, and
                the constraints section when the AI returns none. Every section
                is now always included. */}
            <SubHead
              title="Your report"
              note="Every section is included: Executive Summary, Scope, Risk Register, Programme, Order of Cost Estimate, Procurement, Constraints, ROI where you gave a financial benefit, and Recommendations."
            />

            <QCard>
              <Label>Q6.1 — Additional report instructions</Label>
              <HelpText>Any specific tone, emphasis, or content requirements for the AI narrative.</HelpText>
              <Textarea value={answers.q6_2_instructions} onChange={v => set('q6_2_instructions', v)} placeholder="e.g. Emphasise the compliance risk. Write for a non-technical audience. Focus on the programme risk." rows={3} />
            </QCard>

            {/* Review panel — sits immediately above the Generate button so the
                last thing seen before committing is what was actually captured. */}
            <div style={{ background: 'var(--tint)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontWeight: 700, color: 'var(--ink)', fontSize: '14px', marginBottom: 14 }}>Your inputs at a glance</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  ['Project', answers.q1_0_projectName || '—'],
                  ['Type', `${answers.q1_2_projectType || '—'} · ${answers.q1_3_buildingUse || 'use not set'} · ${answers.q1_5_size ? `${answers.q1_5_size} m²` : '—'}`],
                  ['Location', `${answers.q1_1_postcode || '—'}${answers.q2_4_specLevel ? ` · Spec: ${answers.q2_4_specLevel}` : ''}`],
                  // The four below are the answers that most change the report,
                  // so the last thing seen before Generate shows them rather
                  // than only the identifying details.
                  ['Scope', `${(answers.q2_2_scopeItems || []).length} items${answers.q2_3_interventionLevel ? ` · ${answers.q2_3_interventionLevel}` : ''}`],
                  ['Budget', answers.q4_3_budget ? `£${Number(answers.q4_3_budget).toLocaleString('en-GB')} (incl. fees & VAT)` : 'Not stated — no budget comparison'],
                  ['Start', answers.q4_0_startDate
                    ? new Date(answers.q4_0_startDate + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
                    : 'Assumed: the report date'],
                  ['Priorities', (answers.q4_4_priorities || []).join(' · ') || 'Not stated'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 8, fontSize: '13.5px' }}>
                    <span style={{ color: 'var(--text-soft)', fontFamily: 'var(--font-body)', fontWeight: 600, minWidth: 84 }}>{k}</span>
                    <span style={{ color: 'var(--ink)' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: 'linear-gradient(135deg, #1A2E4A 0%, #12233A 100%)', borderRadius: 14, padding: '24px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 40, height: 40, background: 'rgba(196,134,26,0.25)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E8C275" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <div>
                <p style={{ fontFamily: 'var(--font-body)', fontWeight: 700, color: '#fff', fontSize: '15px', marginBottom: 6 }}>Ready to generate</p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13.5px', lineHeight: 1.6 }}>Costs are calculated deterministically from NRM1 Excel benchmark data. The AI writes prose only — it never invents a number.</p>
              </div>
            </div>
          </div>
        )}

        {/* ─── Navigation ────────────────────────────────────────────────────── */}
        <div className="mt-10 flex gap-3">
          {section > 1 && (
            <button onClick={back} className="flex-1 py-3 rounded-lg"
              style={{ border: '1.5px solid var(--border-2)', color: 'var(--ink)', backgroundColor: 'var(--surface)', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '15px', cursor: 'pointer' }}>
              ← Back
            </button>
          )}
          {section < SECTIONS.length ? (
            <button onClick={next} className="flex-1 py-3 rounded-lg text-white"
              style={{ background: 'linear-gradient(150deg, var(--navy) 0%, var(--ink-deep) 100%)', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '15px', boxShadow: '0 6px 18px rgba(26,46,74,0.28)', cursor: 'pointer' }}>
              Continue →
            </button>
          ) : (
            <button onClick={submit} className="flex-1 py-4 rounded-lg text-white"
              style={{ background: 'linear-gradient(150deg, var(--amber) 0%, var(--amber-deep) 100%)', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '17px', boxShadow: '0 8px 22px rgba(196,134,26,0.35)', letterSpacing: '-0.2px', cursor: 'pointer' }}>
              Generate Report
            </button>
          )}
        </div>

        <p className="mt-4 text-center text-xs" style={{ color: '#6B7280' }}>
          Your answers are saved automatically. You can return to this page to resume.
        </p>
      </div>
    </div>
  )
}
