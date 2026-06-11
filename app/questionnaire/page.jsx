'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { matchesBuildingUse } from '../../lib/buildingUse.js'

const STORAGE_KEY = 'estatesAI_v4_answers'

const SECTIONS = [
  { id: 1, title: 'Project Identity & Location', subtitle: 'Tell us about your building and where it is' },
  { id: 2, title: 'Project Scope', subtitle: 'What work needs to be done?' },
  { id: 3, title: 'Building Condition & Constraints', subtitle: 'What do you know about the building?' },
  { id: 4, title: 'Programme, Budget & Procurement', subtitle: 'Timelines, costs and priorities' },
  { id: 5, title: 'ROI & Financial Case', subtitle: 'Is there a measurable financial return?' },
  { id: 6, title: 'Report Preferences', subtitle: 'Finalise your report' },
]

// Step-by-step generation indicator. Purely visual pacing — the API runs the
// real pipeline in one request; the final step holds until the response lands.
const GEN_STEPS = [
  { label: 'Calculating costs',   detail: 'Deterministic NRM1 estimate from benchmark rates' },
  { label: 'Building programme',  detail: 'RIBA stage durations, size-banded and adjusted' },
  { label: 'Writing report',      detail: 'AI narrative — prose only, no figures invented' },
]
const GEN_STEP_ADVANCE_MS = [7000, 14000]   // when steps 2 and 3 become active

// ─── Section 1 data ───────────────────────────────────────────────────────────
const PROJECT_TYPES = ['New Build', 'Refurbishment', 'Fit-out', 'Extension', 'External Works', 'Renewable Energy', 'Demolition', 'Mixed']
const BUILDING_AGES = ['Pre-1900', '1900–1945', '1945–1980', '1980–2000', 'Post-2000', 'Not applicable (new build)']

// ─── Section 2 scope picker config ───────────────────────────────────────────
const VISIBLE_GROUPS = {
  'New Build':        [0, 1, 2, 3, 4, 5, 6, 8],
  'Refurbishment':    [0, 2, 3, 4, 5, 7, 8],
  'Fit-out':          [3, 4, 5],
  'Extension':        [0, 1, 2, 3, 4, 5, 6, 7, 8],
  'External Works':   [0, 8],
  'Renewable Energy': [5, 8],
  'Demolition':       [0],
  'Mixed':            [0, 1, 2, 3, 4, 5, 6, 7, 8],
}

const HEATING_CODES = ['5.2', '5.2L', '5.5']
const WIRING_MUTEX = ['5.8', '5.8a', '5.8b']
const PLUMBING_MUTEX = ['5.1', '5.1b']
const FOLDED_CODES = new Set(['5.2L', '5.5', '5.8'])

function itemNeedsQty(item) {
  if (!item) return false
  const pt = item.pricingType
  return pt === 'per_nr' || pt === 'per_kwp' || pt === 'per_kwh' ||
    (pt === 'per_item' && /^(number of|per )/i.test(item.qtyCapture || ''))
}

const LEVEL_TIER = {
  'Fabric and finishes only': 1,
  'Finishes with minor services': 2,
  'Full systems replacement': 3,
  'Reconfiguration or full redesign': 4,
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
const KNOWN_ISSUES = [
  'Asbestos known or suspected', 'Structural concerns', 'Ageing or inadequate M&E',
  'Damp or water ingress', 'Drainage issues', 'Fire safety deficiencies',
  'Contaminated land', 'Unsure — surveys needed', 'None identified',
]

const SURVEY_OPTIONS = [
  'Asbestos register', 'Structural', 'Condition', 'Topographic',
  'Ground investigation', 'Energy audit', 'Fire risk assessment', 'None', 'Other',
]

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

const OCCUPATION_OPTIONS = [
  'Fully occupied', 'Partially occupied', 'Full decant', 'Currently vacant', 'Not applicable',
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

const UTILITIES_OPTIONS = [
  'Electrical capacity limited or unknown', 'Gas supply limited or unknown',
  'Drainage capacity limited or unknown', 'Water supply limited or unknown',
  'No known utility constraints',
]

const FUNDING_OPTIONS = ['Internal / commercial', 'Grant or public funding', 'Not yet confirmed', 'Other']

// ─── Section 5 data ───────────────────────────────────────────────────────────
const FINANCIAL_BENEFIT_OPTIONS = [
  'Energy or operational cost savings', 'Rental or commercial income',
  'Grant or funding unlock', 'Avoidance of compliance cost or penalty',
  'Increased asset value', 'No direct financial return — strategic or compliance project',
]

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

// Compact card-row radio — works at any text length
function RadioGroup({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {options.map(opt => {
        const sel = value === opt
        return (
          <button key={opt} type="button" onClick={() => onChange(opt)}
            style={{
              display: 'flex', alignItems: 'center', gap: 11,
              padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
              border: sel ? '1.5px solid var(--blue)' : '1.5px solid var(--border)',
              background: sel ? 'rgba(26,46,74,.06)' : 'var(--surface)',
              textAlign: 'left', width: '100%',
              transition: 'border-color 0.13s ease, background 0.13s ease, box-shadow 0.13s ease',
              boxShadow: sel ? '0 1px 6px rgba(26,46,74,0.14)' : 'none',
            }}>
            <span style={{
              width: 18, height: 18, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
              border: sel ? '5px solid var(--blue)' : '1.5px solid var(--border-2)',
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

// Pill-chip multi-select — each option is a toggleable tag
function CheckboxGroup({ options, values = [], onChange, note }) {
  const toggle = opt => {
    const arr = Array.isArray(values) ? values : []
    onChange(arr.includes(opt) ? arr.filter(v => v !== opt) : [...arr, opt])
  }
  return (
    <div>
      {note && <p style={{ color: 'var(--text-soft)', fontSize: '13px', marginBottom: 10 }}>{note}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {options.map(opt => {
          const sel = Array.isArray(values) && values.includes(opt)
          return (
            <button key={opt} type="button" onClick={() => toggle(opt)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                border: sel ? '1.5px solid var(--blue)' : '1.5px solid var(--border)',
                background: sel ? 'rgba(26,46,74,.06)' : 'var(--surface)',
                color: sel ? 'var(--ink)' : 'var(--text-mid)',
                fontFamily: 'var(--font-body)', fontWeight: sel ? 700 : 500,
                fontSize: '13.5px', lineHeight: 1.35,
                transition: 'border-color 0.12s ease, background 0.12s ease, box-shadow 0.12s ease',
                boxShadow: sel ? '0 1px 5px rgba(26,46,74,0.14)' : 'none',
              }}>
              {sel && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
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

// ─── Main component ───────────────────────────────────────────────────────────
export default function QuestionnairePage() {
  const router = useRouter()
  const [section, setSection] = useState(1)
  const [answers, setAnswers] = useState({})
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState(0)
  const [error, setError] = useState('')
  const [validationErrors, setValidationErrors] = useState({})
  const [scopeData, setScopeData] = useState(null)
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set())
  const toggleGroupCollapse = g =>
    setCollapsedGroups(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n })

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setAnswers(JSON.parse(saved))
    } catch {}
  }, [])

  useEffect(() => {
    let alive = true
    fetch('/api/scope-items')
      .then(r => r.json())
      .then(d => { if (alive && Array.isArray(d.groups)) setScopeData(d) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (Object.keys(answers).length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(answers))
    }
  }, [answers])

  useEffect(() => {
    if (!loading) { setLoadingMsg(0); return }
    const timers = GEN_STEP_ADVANCE_MS.map((ms, i) => setTimeout(() => setLoadingMsg(i + 1), ms))
    return () => timers.forEach(clearTimeout)
  }, [loading])

  const set = (field, val) => setAnswers(prev => ({ ...prev, [field]: val }))
  const isRefurb = ['Refurbishment', 'Fit-out', 'Extension'].includes(answers.q1_2_projectType)

  const itemByCode = useMemo(() => {
    const m = {}
    for (const grp of scopeData?.groups || []) for (const it of grp.items) m[it.code] = it
    return m
  }, [scopeData])

  const WIRING_MIN_TIER = { '5.8': 3, '5.8a': 3, '5.8b': 2, '5.8c': 2 }
  const currentTier = isRefurb ? (LEVEL_TIER[answers.q2_3_interventionLevel] || 4) : 4

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
        return true
      })
      const wiringTier = WIRING_MIN_TIER[prev.q2_2_wiring] || 0
      const newWiring = (prev.q2_2_wiring && prev.q2_2_wiring !== 'none' && wiringTier <= currentTier)
        ? prev.q2_2_wiring : 'none'
      if (kept.length === prevItems.length && newWiring === (prev.q2_2_wiring || 'none')) return prev
      return { ...prev, q2_2_scopeItems: kept, q2_2_wiring: newWiring }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers.q1_2_projectType, answers.q1_3_buildingUse, answers.q2_3_interventionLevel, scopeData])

  function validateSection(sec) {
    const errs = {}
    if (sec === 1) {
      if (!answers.q1_0_projectName?.trim()) errs.q1_0_projectName = 'Project name is required'
      if (!answers.q1_1_postcode?.trim()) errs.q1_1_postcode = 'Postcode is required'
      if (!answers.q1_2_projectType) errs.q1_2_projectType = 'Project type is required'
      if (!answers.q1_5_size) errs.q1_5_size = 'Approximate size is required'
    }
    if (sec === 2) {
      if (!answers.q2_1_objective?.trim()) errs.q2_1_objective = 'Project objective is required'
      if (!answers.q2_2_scopeItems || answers.q2_2_scopeItems.length === 0) errs.q2_2_scopeItems = 'Please select at least one scope item'
      if (!answers.q2_4_specLevel) errs.q2_4_specLevel = 'Specification level is required'
    }
    setValidationErrors(errs)
    return Object.keys(errs).length === 0
  }

  function next() {
    if (!validateSection(section)) return
    setSection(s => Math.min(s + 1, 6))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function back() {
    setSection(s => Math.max(s - 1, 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submit() {
    if (!validateSection(section)) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error || data.detail || 'Report generation failed. Please try again.')
        setLoading(false)
        return
      }
      sessionStorage.setItem('estatesAI_result', JSON.stringify({ ...data, answers }))
      router.push(data.reportId ? `/report/${data.reportId}` : '/report')
    } catch (e) {
      setError('Network error — please check your connection and try again.')
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4"
        style={{ backgroundColor: 'transparent' }}>
        <div className="section-enter" style={{ width: '100%', maxWidth: 460, background: 'var(--surface)', border: '1px solid var(--border)', borderTop: '3px solid var(--amber)', borderRadius: 12, boxShadow: 'var(--shadow-2)', padding: '36px 36px 30px' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 28, height: 28, background: 'var(--amber)', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 11, letterSpacing: '0.4px', flexShrink: 0 }}>AI</div>
            <span style={{ color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 17, letterSpacing: '0.2px' }}>Estates AI</span>
          </div>
          <span className="mono" style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase' }}>
            Stage 0–1 Questionnaire
          </span>
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
                    {String(s.id).padStart(2, '0')} {s.title.split(' ')[0].replace(',', '')}
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
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg border" style={{ backgroundColor: '#FEF2F2', borderColor: 'var(--danger)', color: 'var(--danger)' }}>
            <strong>Error:</strong> {error}
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
            </QCard>

            <QCard>
              <Label required>Q1.2 — Project type</Label>
              <SelectInput value={answers.q1_2_projectType} onChange={v => set('q1_2_projectType', v)}>
                <option value="">Select project type...</option>
                {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </SelectInput>
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
                    <option value="6">6+ storeys</option>
                  </SelectInput>
                </div>
              )}
            </QCard>

            <QCard>
              <Label>Q1.3 — Building use</Label>
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
              {answers.q1_3_buildingUse === 'Other' && (
                <div className="mt-3">
                  <TextInput value={answers.q1_3_buildingUseOther} onChange={v => set('q1_3_buildingUseOther', v)} placeholder="Please describe the building use" />
                </div>
              )}
            </QCard>

            {answers.q1_2_projectType !== 'New Build' && (
              <QCard>
                <Label required>Q1.4 — Building age</Label>
                <div style={{ marginTop: 4 }}>
                  <RadioGroup options={BUILDING_AGES} value={answers.q1_4_buildingAge} onChange={v => set('q1_4_buildingAge', v)} />
                </div>
              </QCard>
            )}

            <QCard>
              <Label required>Q1.5 — Approximate size (GIFA m²)</Label>
              <HelpText>Gross Internal Floor Area in square metres. Used as the primary pricing quantity for all elements.</HelpText>
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
                <Label>Q2.2 — Level of intervention</Label>
                <HelpText>Determines the rate band applied to costs and the design duration multiplier. Scope items that require a higher level are greyed out below.</HelpText>
                <div className="flex flex-col gap-3">
                  {INTERVENTION_LEVELS.map(opt => (
                    <label key={opt.value} className="flex items-start gap-3 cursor-pointer rounded-xl p-4"
                      style={{
                        border: answers.q2_3_interventionLevel === opt.value ? '2px solid var(--blue)' : '1.5px solid var(--border)',
                        backgroundColor: answers.q2_3_interventionLevel === opt.value ? 'rgba(26,46,74,.06)' : 'var(--tint)',
                        transition: 'border-color 0.13s ease, background 0.13s ease',
                      }}>
                      <input type="radio" value={opt.value} checked={answers.q2_3_interventionLevel === opt.value}
                        onChange={() => set('q2_3_interventionLevel', opt.value)}
                        className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ accentColor: 'var(--blue)' }} />
                      <div>
                        <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, color: '#1A2E4A', fontSize: '14px' }}>{opt.value}</div>
                        <div style={{ color: 'var(--blue)', fontSize: '12px', fontWeight: 600, marginTop: '3px' }}>{opt.signal}</div>
                        <div style={{ color: '#6B7280', fontSize: '13px', marginTop: '4px', lineHeight: 1.5 }}>{opt.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </QCard>
            )}

            {/* Q2.3 Scope picker — its own visual container */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '28px', boxShadow: 'var(--shadow-1)' }}>
              <Label>Q2.3 — Scope of works</Label>
              <HelpText>Tick every element that is in scope. Use Other / Specialist below for anything not listed.</HelpText>
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
                  countPill: { fontFamily: 'var(--font-body)', background: 'rgba(26,46,74,.06)', color: 'var(--blue)', fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20 },
                  chevron: { width: 16, height: 16, color: 'var(--text-mute)', transition: 'transform 0.18s ease', flexShrink: 0 },
                  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8, padding: '10px 0 4px' },
                  tile: { display: 'flex', alignItems: 'flex-start', gap: 9, border: '1.5px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: '#fff', cursor: 'pointer' },
                  tileSel: { borderColor: 'var(--blue)', background: 'rgba(26,46,74,.06)', boxShadow: '0 1px 6px rgba(26,46,74,0.12)' },
                  tileDis: { opacity: 0.45, cursor: 'not-allowed' },
                  checkBox: { width: 18, height: 18, borderRadius: 5, border: '1.5px solid var(--border-2)', flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' },
                  checkBoxSel: { background: 'var(--blue)', borderColor: 'var(--blue)', color: '#fff' },
                  tileText: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
                  tileLabel: { fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, color: '#1A2E4A', lineHeight: 1.3 },
                  subPrompt: { background: 'var(--tint)', borderLeft: '3px solid var(--blue)', padding: '10px 14px', margin: '6px 0 2px', borderRadius: '0 8px 8px 0' },
                  subLabel: { fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 5, fontWeight: 500 },
                  subInput: { fontSize: 14, padding: '6px 10px', border: '1.5px solid var(--border)', borderRadius: 7, color: '#111827', outline: 'none' },
                  radioRow: { display: 'flex', alignItems: 'flex-start', gap: 9, padding: '5px 0', cursor: 'pointer' },
                  radioCheck: { marginTop: 2, flexShrink: 0, accentColor: 'var(--blue)', width: 15, height: 15 },
                  radioLabel: { fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12.5, color: '#1A2E4A', lineHeight: 1.3 },
                  radioDesc: { fontWeight: 400, fontSize: 11.5, color: '#6B7280', lineHeight: 1.45 },
                  reqNote: { fontSize: 10.5, color: '#B06000', fontWeight: 500 },
                  subGrpLabel: { display: 'inline-block', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 10.5, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '0.6px', background: 'rgba(26,46,74,.06)', padding: '3px 10px', borderRadius: 6, marginTop: 12 },
                }
                const Check = () => (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                )
                if (!scopeData) return <p style={{ color: '#888', fontSize: 13, padding: '8px 0' }}>Loading scope items…</p>
                if (!answers.q1_2_projectType) return <p style={{ color: '#888', fontSize: 13, padding: '8px 0' }}>Select a project type (Q1.2) above to see the relevant scope items.</p>
                const visibleGroups = VISIBLE_GROUPS[answers.q1_2_projectType] || scopeData.groups.map(g => g.group)
                const bu = answers.q1_3_buildingUse || ''
                const displayedGroups = scopeData.groups
                  .filter(g => visibleGroups.includes(g.group))
                  .map(g => ({ ...g, items: g.items.filter(it => matchesBuildingUse(it.buildingUse, bu) && !FOLDED_CODES.has(it.code)) }))
                  .filter(g => g.items.length > 0)
                if (displayedGroups.length === 0) return <p style={{ color: '#888', fontSize: 13, padding: '8px 0' }}>No scope items match this project type and building use yet.</p>
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
                    const can2 = !isRefurb || currentTier >= min2
                    const can2L = !isRefurb || currentTier >= min2L
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
                            <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8, fontStyle: 'italic' }}>Gas supply pipework is included automatically when a new or upgraded system is selected.</p>
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
                        <span style={S.subLabel}>{item.qtyCapture || 'Quantity'}</span>
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
                  return (
                    <div className="scope-group-head" style={S.groupHead} onClick={() => toggleGroupCollapse(grp.group)}>
                      <span style={S.groupLabel}>{grp.label}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {count > 0 && <span style={S.countPill}>{count} selected</span>}
                        <svg style={{ ...S.chevron, transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </div>
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
                                {specialistItems.length > 0 && (
                                  <>
                                    <div style={S.subGrpLabel}>Sector-Specific Equipment</div>
                                    <div style={S.grid}>{specialistItems.map(renderItem)}</div>
                                  </>
                                )}
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
                            className="w-full rounded-lg pl-7 pr-3 focus:outline-none focus:ring-2 focus:ring-[color:var(--blue)]"
                            style={{ border: '1.5px solid var(--border)', minHeight: '48px', fontSize: '16px', color: '#1A1A1A', backgroundColor: '#FFF' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })()}
              {validationErrors.q2_2_scopeItems && <p className="mt-2 text-sm" style={{ color: 'var(--danger)' }}>{validationErrors.q2_2_scopeItems}</p>}
            </div>

            <QCard>
              <Label required>Q2.4 — Specification level</Label>
              <HelpText>Selects the rate column from the NRM1 benchmark table.</HelpText>
              <div className="flex flex-col gap-3">
                {SPEC_LEVELS.map(opt => (
                  <label key={opt.value} className="flex items-start gap-3 cursor-pointer rounded-xl p-4"
                    style={{
                      border: answers.q2_4_specLevel === opt.value ? '2px solid var(--blue)' : '1.5px solid var(--border)',
                      backgroundColor: answers.q2_4_specLevel === opt.value ? 'rgba(26,46,74,.06)' : 'var(--tint)',
                      transition: 'border-color 0.13s ease, background 0.13s ease',
                    }}>
                    <input type="radio" value={opt.value} checked={answers.q2_4_specLevel === opt.value}
                      onChange={() => set('q2_4_specLevel', opt.value)}
                      className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ accentColor: 'var(--blue)' }} />
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

            <QCard>
              <Label>Q2.5 — Standards and compliance requirements</Label>
              <HelpText>List any standards, certifications or funder conditions that apply — e.g. BREEAM, PAS 2035, NHS design guide, net zero, MCS, DNO requirements.</HelpText>
              <Textarea value={answers.q2_5_standards} onChange={v => set('q2_5_standards', v)}
                placeholder="e.g. BREEAM Very Good required by funder; PAS 2035 for retrofit works" rows={2} />
            </QCard>
          </div>
        )}

        {/* ─── SECTION 3 ─────────────────────────────────────────────────────── */}
        {section === 3 && (
          <div className="flex flex-col gap-5 section-enter">
            <QCard>
              <Label>Q3.1 — Known building issues</Label>
              <HelpText>Select all that apply. These trigger risk allowance adjustments.</HelpText>
              <CheckboxGroup options={KNOWN_ISSUES} values={answers.q3_1_knownIssues} onChange={v => set('q3_1_knownIssues', v)} />
            </QCard>

            <QCard>
              <Label>Q3.2 — Previous works or relevant history</Label>
              <Textarea value={answers.q3_2_previousWorks} onChange={v => set('q3_2_previousWorks', v)} placeholder="e.g. M&E replaced in 2015. New roof in 2018. No structural works since original construction." rows={3} />
            </QCard>

            <QCard>
              <Label>Q3.3 — Surveys and reports available</Label>
              <HelpText>Select all that apply. Surveys reduce the risk allowance and survey programme time.</HelpText>
              <CheckboxGroup options={SURVEY_OPTIONS} values={answers.q3_3_surveys} onChange={v => set('q3_3_surveys', v)} />
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
              <CheckboxGroup options={ACCESS_OPTIONS} values={answers.q3_5_accessConstraints} onChange={v => set('q3_5_accessConstraints', v)} />
              {Array.isArray(answers.q3_5_accessConstraints) && answers.q3_5_accessConstraints.includes('Other') && (
                <div className="mt-3">
                  <Textarea value={answers.q3_5_accessConstraintsOther} onChange={v => set('q3_5_accessConstraintsOther', v)}
                    placeholder="Please describe the access constraint" rows={2} />
                </div>
              )}
            </QCard>

            <QCard>
              <Label>Q3.6 — Occupation during works</Label>
              <HelpText>Affects construction duration and preliminary costs.</HelpText>
              <RadioGroup options={OCCUPATION_OPTIONS} value={answers.q3_6_occupation} onChange={v => set('q3_6_occupation', v)} />
            </QCard>

            <QCard>
              <Label>Q3.7 — Additional context</Label>
              <Textarea value={answers.q3_7_additionalContext} onChange={v => set('q3_7_additionalContext', v)} placeholder="Anything else that might affect the cost, programme or risk — location, operational constraints, heritage status, etc." rows={3} />
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
                      border: opt.checked ? '1.5px solid var(--blue)' : '1.5px solid var(--border)',
                      background: opt.checked ? 'rgba(26,46,74,.06)' : 'var(--tint)',
                      textAlign: 'left', width: '100%',
                      boxShadow: opt.checked ? '0 1px 6px rgba(26,46,74,0.12)' : 'none',
                    }}>
                    <span style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, display: 'inline-block', border: opt.checked ? '5px solid var(--blue)' : '1.5px solid var(--border-2)', background: '#fff' }} />
                    <span style={{ fontFamily: 'var(--font-body)', fontWeight: opt.checked ? 700 : 500, fontSize: '14px', color: opt.checked ? '#1A2E4A' : '#374151' }}>{opt.label}</span>
                  </button>
                ))}
                {answers.q4_1_targetDate !== 'No specific deadline' && (
                  <input type="date" value={answers.q4_1_targetDate || ''} onChange={e => set('q4_1_targetDate', e.target.value)}
                    className="w-full rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-[color:var(--blue)]"
                    style={{ border: '1.5px solid var(--border)', minHeight: '48px', fontSize: '16px', color: '#1A1A1A', backgroundColor: '#FFF', boxSizing: 'border-box', marginTop: 4 }} />
                )}
              </div>
            </QCard>

            <QCard>
              <Label required>Q4.2 — Do you have a budget figure?</Label>
              <HelpText>Controls whether the report compares your budget against the NRM1 estimate, or generates a benchmark independently.</HelpText>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[
                  { label: 'Yes — I have a budget figure', val: 'Yes' },
                  { label: 'No — generate a benchmark estimate', val: 'No' },
                ].map(opt => {
                  const sel = answers.q4_2_budgetKnown === opt.val
                  return (
                    <button key={opt.val} type="button" onClick={() => set('q4_2_budgetKnown', opt.val)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 11,
                        padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
                        border: sel ? '1.5px solid var(--blue)' : '1.5px solid var(--border)',
                        background: sel ? 'rgba(26,46,74,.06)' : 'var(--tint)',
                        textAlign: 'left', width: '100%',
                        boxShadow: sel ? '0 1px 6px rgba(26,46,74,0.12)' : 'none',
                      }}>
                      <span style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, display: 'inline-block', border: sel ? '5px solid var(--blue)' : '1.5px solid var(--border-2)', background: '#fff' }} />
                      <span style={{ fontFamily: 'var(--font-body)', fontWeight: sel ? 700 : 500, fontSize: '14px', color: sel ? '#1A2E4A' : '#374151' }}>{opt.label}</span>
                    </button>
                  )
                })}
              </div>
              {answers.q4_2_budgetKnown === 'Yes' && (
                <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                  <Label>Q4.3 — Total budget (including all fees and VAT)</Label>
                  <HelpText>Enter the total budget available, including all professional fees, contingency and VAT — so it can be compared against the report&apos;s gross estimate.</HelpText>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-medium" style={{ color: '#555' }}>£</span>
                    <input type="number" value={answers.q4_3_budget || ''} onChange={e => set('q4_3_budget', e.target.value)} placeholder="e.g. 1500000" min={0}
                      className="w-full rounded-lg pl-7 pr-3 focus:outline-none focus:ring-2 focus:ring-[color:var(--blue)]"
                      style={{ border: '1.5px solid var(--border)', minHeight: '48px', fontSize: '16px', color: '#1A1A1A', backgroundColor: '#FFF' }} />
                  </div>
                </div>
              )}
            </QCard>

            <QCard>
              <Label>Q4.3 — What matters most on this project?</Label>
              <HelpText>Select all that apply. Drives the procurement recommendation and programme approach.</HelpText>
              <CheckboxGroup options={PRIORITIES} values={answers.q4_4_priorities} onChange={v => set('q4_4_priorities', v)} />
            </QCard>

            <QCard>
              <Label>Q4.4 — Design stage already reached</Label>
              <HelpText>Determines the professional fees percentage applied to the cost estimate and the viable procurement routes.</HelpText>
              <RadioGroup options={DESIGN_STAGE_OPTIONS} value={answers.q4_5_designStage} onChange={v => set('q4_5_designStage', v)} />
            </QCard>

            <QCard>
              <Label>Q4.5 — Single or phased delivery?</Label>
              <HelpText>Phased delivery extends the total construction programme. Each phase is assumed to be roughly equal in size at Stage 0–1.</HelpText>
              <SelectInput value={answers.q4_6_phasing || 'Single phase'} onChange={v => set('q4_6_phasing', v)}>
                <option value="Single phase">Single phase — full project delivered in one continuous programme</option>
                <option value="Multiple phases">Multiple phases — phased delivery (e.g. floor by floor, building by building, or rolling programme)</option>
              </SelectInput>
            </QCard>

            <QCard>
              <Label>Q4.6 — Funding source</Label>
              <HelpText>Grant or public funding adds a governance approval allowance to the programme.</HelpText>
              <RadioGroup options={FUNDING_OPTIONS} value={answers.q4_7_funding} onChange={v => set('q4_7_funding', v)} />
              {answers.q4_7_funding === 'Other' && (
                <div className="mt-3">
                  <Textarea value={answers.q4_7_fundingOther} onChange={v => set('q4_7_fundingOther', v)}
                    placeholder="Please describe the funding source" rows={2} />
                </div>
              )}
            </QCard>
          </div>
        )}

        {/* ─── SECTION 5 ─────────────────────────────────────────────────────── */}
        {section === 5 && (
          <div className="flex flex-col gap-5 section-enter">
            <div style={{ background: 'rgba(26,46,74,.06)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '16px 20px' }}>
              <p style={{ color: '#1A2E4A', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '14px', marginBottom: 4 }}>Optional section</p>
              <p style={{ color: '#374151', fontSize: '13.5px', lineHeight: 1.6 }}>Complete this section only if you want the report to include an ROI or financial case analysis. Skip to Section 6 if not applicable.</p>
            </div>

            <QCard>
              <Label>Q5.1 — Financial benefit type</Label>
              <HelpText>Select all that apply. 'No direct financial return' is mutually exclusive.</HelpText>
              <CheckboxGroup
                options={FINANCIAL_BENEFIT_OPTIONS}
                values={answers.q5_1_financialBenefit}
                onChange={newVals => {
                  const NO_RETURN = 'No direct financial return — strategic or compliance project'
                  const prevHas = (Array.isArray(answers.q5_1_financialBenefit) ? answers.q5_1_financialBenefit : []).includes(NO_RETURN)
                  const newHas = newVals.includes(NO_RETURN)
                  if (newHas && !prevHas) {
                    set('q5_1_financialBenefit', [NO_RETURN])
                  } else if (newHas && prevHas) {
                    set('q5_1_financialBenefit', newVals.filter(x => x !== NO_RETURN))
                  } else {
                    set('q5_1_financialBenefit', newVals)
                  }
                }}
              />
            </QCard>

            {Array.isArray(answers.q5_1_financialBenefit) && answers.q5_1_financialBenefit.length > 0 && !answers.q5_1_financialBenefit.includes('No direct financial return — strategic or compliance project') && (
              <QCard>
                <Label>Q5.2 — Estimated annual benefit (£)</Label>
                <HelpText>Used to calculate simple payback period and ROI.</HelpText>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-medium" style={{ color: '#555' }}>£</span>
                  <input type="number" value={answers.q5_2_annualBenefit || ''} onChange={e => set('q5_2_annualBenefit', e.target.value)} placeholder="e.g. 80000" min={0}
                    className="w-full rounded-lg pl-7 pr-3 focus:outline-none focus:ring-2 focus:ring-[color:var(--blue)]"
                    style={{ border: '1.5px solid var(--border)', minHeight: '48px', fontSize: '16px', color: '#1A1A1A', backgroundColor: '#FFF' }} />
                </div>
              </QCard>
            )}
          </div>
        )}

        {/* ─── SECTION 6 ─────────────────────────────────────────────────────── */}
        {section === 6 && (
          <div className="flex flex-col gap-5 section-enter">
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

            <QCard>
              <Label>Q6.1 — Optional report sections</Label>
              <HelpText>The core sections (Executive Summary, Scope, Risk, Programme, Recommendations) are always included.</HelpText>
              <CheckboxGroup
                options={['Order of Cost Estimate (NRM1)', 'ROI & Financial Case', 'Procurement Recommendation', 'Constraints Summary']}
                values={answers.q6_1_sections}
                onChange={v => set('q6_1_sections', v)}
              />
            </QCard>

            <QCard>
              <Label>Q6.2 — Additional report instructions</Label>
              <HelpText>Any specific tone, emphasis, or content requirements for the AI narrative.</HelpText>
              <Textarea value={answers.q6_2_instructions} onChange={v => set('q6_2_instructions', v)} placeholder="e.g. Emphasise the compliance risk. Write for a non-technical audience. Focus on the programme risk." rows={3} />
            </QCard>

            {/* Summary card */}
            <div style={{ background: 'var(--tint)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontWeight: 700, color: '#1A2E4A', fontSize: '14px', marginBottom: 14 }}>Your inputs at a glance</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  ['Project', answers.q1_0_projectName || '—'],
                  ['Type', `${answers.q1_2_projectType || '—'} · ${answers.q1_5_size ? `${answers.q1_5_size} m²` : '—'}`],
                  ['Postcode', `${answers.q1_1_postcode || '—'} · Spec: ${answers.q2_4_specLevel || '—'}`],
                  ['Scope items', `${(answers.q2_2_scopeItems || []).length} selected`],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 8, fontSize: '13.5px' }}>
                    <span style={{ color: '#6B7280', fontFamily: 'var(--font-body)', fontWeight: 600, minWidth: 80 }}>{k}</span>
                    <span style={{ color: '#1A2E4A' }}>{v}</span>
                  </div>
                ))}
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
          {section < 6 ? (
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

        <p className="mt-4 text-center text-xs" style={{ color: '#999' }}>
          Your answers are saved automatically. You can return to this page to resume.
        </p>
      </div>
    </div>
  )
}
