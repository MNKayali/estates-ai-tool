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

const LOADING_MESSAGES = [
  'Fetching NRM1 rate data from GitHub...',
  'Running deterministic cost calculation...',
  'Calculating programme durations...',
  'Generating AI narrative (prose only)...',
  'Building your Word report...',
]

// ─── Section 1 data ───────────────────────────────────────────────────────────
const PROJECT_TYPES = ['New Build', 'Refurbishment', 'Fit-out', 'Extension', 'External Works', 'Renewable Energy', 'Demolition', 'Mixed']
const BUILDING_AGES = ['Pre-1900', '1900–1945', '1945–1980', '1980–2000', 'Post-2000', 'Not applicable (new build)']

// ─── Section 2 scope picker config ───────────────────────────────────────────
// The scope items themselves are workbook-driven (fetched from /api/scope-items,
// sourced from the NRM1 v4.5 "Master Cost Table"). Only the coarse project-type →
// NRM1-group visibility and the curated M&E sub-selectors live in code.

// Which NRM1 groups (0–8) are offered per Q1.2 project type.
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

// Curated M&E codes handled by special sub-selectors rather than plain checkboxes.
const HEATING_CODES = ['5.2', '5.2L', '5.5']   // 5.2/5.2L = type radio; 5.5 (gas) auto-added with 5.2
const WIRING_MUTEX = ['5.8', '5.8a', '5.8b']    // pick one; 5.8 (full) = 5.8a + 5.8b
const PLUMBING_MUTEX = ['5.1', '5.1b']          // 5.1 (full) supersedes 5.1b (2nd fix)
// Rows folded into a curated control above — not rendered as standalone checkboxes.
const FOLDED_CODES = new Set(['5.2L', '5.5', '5.8'])

// An item needs a quantity input (rather than a lump sum of 1) per its pricing type.
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

// Q2.5 — Standards and compliance requirements
const STANDARDS_OPTIONS = [
  'BREEAM',
  'PAS 2035',
  'NHS design guide',
  'Net zero',
  'University design guide',
  'Acoustic',
  'Food hygiene',
  'MCS',
  'DNO',
  'Highways',
  'Dark sky',
  'None',
  'Other',
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
  'Asbestos known or suspected',
  'Structural concerns',
  'Ageing or inadequate M&E',
  'Damp or water ingress',
  'Drainage issues',
  'Fire safety deficiencies',
  'Contaminated land',
  'Unsure — surveys needed',
  'None identified',
]

const SURVEY_OPTIONS = [
  'Asbestos register',
  'Structural',
  'Condition',
  'Topographic',
  'Ground investigation',
  'Energy audit',
  'Fire risk assessment',
  'None',
  'Other',
]

// Single-select — VALUES match substring checks in costCalculator.js (LBC merged into combined option)
const PLANNING_OPTIONS = [
  'No consent required',
  'Permitted development',
  'Prior approval',
  'Full planning',
  'Full planning + Listed Building Consent',
  'Change of use',
  'Unsure (pre-application advice)',
]

// VALUES match substring checks in costCalculator.js and programmeCalculator.js
const ACCESS_OPTIONS = [
  'Restricted working hours',
  'Shared access with other occupiers',
  'No vehicle access or restricted deliveries',
  'Height or weight restrictions on site',
  'Scaffold licence or highway encroachment required',
  'Term-time only working',
  'No access constraints',
  'Other',
]

// VALUES match substring checks in costCalculator.js and programmeCalculator.js
const OCCUPATION_OPTIONS = [
  'Fully occupied',
  'Partially occupied',
  'Full decant',
  'Currently vacant',
  'Not applicable',
]

// ─── Section 4 data ───────────────────────────────────────────────────────────
const PRIORITIES = [
  'Lowest cost',
  'Fixed / certain final cost',
  'Speed',
  'Design quality',
  'Flexibility',
  'Minimise disruption',
  'Funder / compliance requirement',
]

// Full labels as displayed — backend uses .includes('Stage N') substring check
const DESIGN_STAGE_OPTIONS = [
  'Concept only (Stage 0–1)',
  'Concept complete (Stage 2)',
  'Developed design (Stage 3)',
  'Technical complete (Stage 4)',
]

const UTILITIES_OPTIONS = [
  'Electrical capacity limited or unknown',
  'Gas supply limited or unknown',
  'Drainage capacity limited or unknown',
  'Water supply limited or unknown',
  'No known utility constraints',
]

const FUNDING_OPTIONS = [
  'Internal / commercial',
  'Grant or public funding',
  'Not yet confirmed',
  'Other',
]

// ─── Section 5 data ───────────────────────────────────────────────────────────
const FINANCIAL_BENEFIT_OPTIONS = [
  'Energy or operational cost savings',
  'Rental or commercial income',
  'Grant or funding unlock',
  'Avoidance of compliance cost or penalty',
  'Increased asset value',
  'No direct financial return — strategic or compliance project',
]

// ─── UI Components ────────────────────────────────────────────────────────────
function Label({ children, required }) {
  return (
    <label className="block mb-1.5" style={{ color: '#1A2E4A', fontSize: '15px', fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.1px' }}>
      {children}{required && <span style={{ color: '#C8102E' }} className="ml-1">*</span>}
    </label>
  )
}
function HelpText({ children }) {
  return <p className="mb-2" style={{ color: '#6B7280', fontSize: '13.5px', lineHeight: 1.6 }}>{children}</p>
}
function TextInput({ value, onChange, placeholder }) {
  return (
    <input type="text" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
      style={{ border: '1px solid #CCC', minHeight: '48px', fontSize: '16px', color: '#1A1A1A', backgroundColor: '#FFF' }} />
  )
}
function NumberInput({ value, onChange, placeholder, min = 0 }) {
  return (
    <input type="number" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} min={min}
      className="w-full rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
      style={{ border: '1px solid #CCC', minHeight: '48px', fontSize: '16px', color: '#1A1A1A', backgroundColor: '#FFF' }} />
  )
}
function Textarea({ value, onChange, placeholder, rows = 4 }) {
  return (
    <textarea value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      className="w-full rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-[#2E75B6] resize-none"
      style={{ border: '1px solid #CCC', fontSize: '16px', color: '#1A1A1A', backgroundColor: '#FFF', lineHeight: '1.6' }} />
  )
}
function SelectInput({ value, onChange, children }) {
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)}
      className="w-full rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
      style={{ border: '1px solid #CCC', minHeight: '48px', fontSize: '16px', color: value ? '#1A1A1A' : '#888', backgroundColor: '#FFF' }}>
      {children}
    </select>
  )
}
function RadioGroup({ options, value, onChange }) {
  return (
    <div className="flex flex-col gap-3">
      {options.map(opt => (
        <label key={opt} className="flex items-center gap-3 cursor-pointer" style={{ minHeight: '44px' }}>
          <input type="radio" value={opt} checked={value === opt} onChange={() => onChange(opt)}
            className="w-5 h-5 flex-shrink-0" style={{ accentColor: '#2E75B6' }} />
          <span style={{ color: '#1A1A1A', fontSize: '16px' }}>{opt}</span>
        </label>
      ))}
    </div>
  )
}
function CheckboxGroup({ options, values = [], onChange, note }) {
  const toggle = opt => {
    const arr = Array.isArray(values) ? values : []
    onChange(arr.includes(opt) ? arr.filter(v => v !== opt) : [...arr, opt])
  }
  return (
    <div className="flex flex-col gap-2">
      {note && <p className="text-sm mb-1 italic" style={{ color: '#555' }}>{note}</p>}
      {options.map(opt => (
        <label key={opt} className="flex items-start gap-3 cursor-pointer" style={{ minHeight: '44px' }}>
          <input type="checkbox" checked={Array.isArray(values) && values.includes(opt)} onChange={() => toggle(opt)}
            className="w-5 h-5 flex-shrink-0 mt-0.5 rounded" style={{ accentColor: '#2E75B6' }} />
          <span style={{ color: '#1A1A1A', fontSize: '16px' }}>{opt}</span>
        </label>
      ))}
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
  // Scope catalogue from the NRM1 v4.5 workbook ({ groups: [{ group, label, items }] })
  const [scopeData, setScopeData] = useState(null)

  // Restore draft
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setAnswers(JSON.parse(saved))
    } catch {}
  }, [])

  // Fetch the workbook-driven scope item catalogue once.
  useEffect(() => {
    let alive = true
    fetch('/api/scope-items')
      .then(r => r.json())
      .then(d => { if (alive && Array.isArray(d.groups)) setScopeData(d) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // Auto-save draft
  useEffect(() => {
    if (Object.keys(answers).length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(answers))
    }
  }, [answers])

  // Loading message cycle
  useEffect(() => {
    if (!loading) { setLoadingMsg(0); return }
    const id = setInterval(() => setLoadingMsg(m => (m + 1) % LOADING_MESSAGES.length), 3500)
    return () => clearInterval(id)
  }, [loading])

  const set = (field, val) => setAnswers(prev => ({ ...prev, [field]: val }))
  const isRefurb = ['Refurbishment', 'Fit-out', 'Extension'].includes(answers.q1_2_projectType)

  // Flat { code → item } lookup over the fetched catalogue.
  const itemByCode = useMemo(() => {
    const m = {}
    for (const grp of scopeData?.groups || []) for (const it of grp.items) m[it.code] = it
    return m
  }, [scopeData])

  const WIRING_MIN_TIER = { '5.8': 3, '5.8a': 3, '5.8b': 2, '5.8c': 2 }
  const currentTier = isRefurb ? (LEVEL_TIER[answers.q2_3_interventionLevel] || 4) : 4

  // Drop selected scope codes no longer valid for the current project type,
  // building use or intervention tier (runs as any of those answers change).
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

  // Validate current section
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
      // Store result for report page (include answers so /report/[id] works without localStorage)
      sessionStorage.setItem('estatesAI_result', JSON.stringify({ ...data, answers }))
      // Navigate to canonical shareable URL if the API returned a reportId
      router.push(data.reportId ? `/report/${data.reportId}` : '/report')
    } catch (e) {
      setError('Network error — please check your connection and try again.')
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5 px-4"
        style={{ backgroundColor: '#F4F7FC' }}>
        <div style={{ width: 48, height: 48, border: '3px solid #E2E8F0', borderTopColor: '#2E75B6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}
          className="animate-spin" />
        <p className="text-center text-lg" style={{ color: '#1A2E4A', fontFamily: 'var(--font-display)', fontWeight: 600 }}>{LOADING_MESSAGES[loadingMsg]}</p>
        <p className="text-center text-sm" style={{ color: '#9CA3AF', maxWidth: 320, textAlign: 'center' }}>Costs calculated deterministically from NRM1 benchmark data. This takes 20–40 seconds.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F7F9FC' }}>
      {/* Header */}
      <header className="sticky top-0 z-10 px-4 shadow-md" style={{ backgroundColor: '#1A2E4A', height: 56, display: 'flex', alignItems: 'center' }}>
        <div className="max-w-2xl mx-auto w-full flex items-center justify-between">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, background: '#2E75B6', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, letterSpacing: '0.4px', flexShrink: 0 }}>AI</div>
            <span style={{ color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, letterSpacing: '-0.2px' }}>Estates AI</span>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 500 }}>
            {SECTIONS[section - 1]?.title}
          </span>
        </div>
      </header>

      {/* Progress bar */}
      <div style={{ height: 3, backgroundColor: '#E2E8F0' }}>
        <div style={{ height: 3, backgroundColor: '#2E75B6', width: `${(section / SECTIONS.length) * 100}%`, transition: 'width 0.35s ease', boxShadow: '0 0 6px rgba(46,117,182,0.4)' }} />
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Section header */}
        <div className="mb-8">
          <div style={{ marginBottom: 8 }}>
            <span style={{ background: '#EBF3FA', color: '#2E75B6', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, padding: '3px 10px', borderRadius: 20, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              {section} / {SECTIONS.length}
            </span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '22px', color: '#1A2E4A', letterSpacing: '-0.4px', margin: '0 0 4px' }}>{SECTIONS[section - 1].title}</h1>
          <p style={{ color: '#6B7280', fontSize: '14px', margin: 0 }}>{SECTIONS[section - 1].subtitle}</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg border" style={{ backgroundColor: '#FEF2F2', borderColor: '#C00000', color: '#C00000' }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* ─── SECTION 1 ─────────────────────────────────────────────────────── */}
        {section === 1 && (
          <div className="flex flex-col gap-6 section-enter">
            <div>
              <Label required>Q1.0 — Project title</Label>
              <HelpText>This becomes the heading of your report. Include the work type, building type, and location — e.g. "Full Refurbishment — Accommodation Flat, B91 1SF, Solihull" or "New Sports Hall, University of Birmingham, Edgbaston".</HelpText>
              <TextInput value={answers.q1_0_projectName} onChange={v => set('q1_0_projectName', v)} placeholder="e.g. Full Refurbishment — Accommodation Flat, B91 1SF, Solihull" />
              {validationErrors.q1_0_projectName && <p className="mt-1 text-sm" style={{ color: '#C00000' }}>{validationErrors.q1_0_projectName}</p>}
            </div>
            <div>
              <Label required>Q1.1 — Postcode</Label>
              <HelpText>Used to apply the BCIS regional cost factor. First 2–3 characters are sufficient.</HelpText>
              <TextInput value={answers.q1_1_postcode} onChange={v => set('q1_1_postcode', v)} placeholder="e.g. B15" />
              {validationErrors.q1_1_postcode && <p className="mt-1 text-sm" style={{ color: '#C00000' }}>{validationErrors.q1_1_postcode}</p>}
            </div>
            <div>
              <Label required>Q1.2 — Project type</Label>
              <SelectInput value={answers.q1_2_projectType} onChange={v => set('q1_2_projectType', v)}>
                <option value="">Select project type...</option>
                {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </SelectInput>
              {validationErrors.q1_2_projectType && <p className="mt-1 text-sm" style={{ color: '#C00000' }}>{validationErrors.q1_2_projectType}</p>}
            </div>

            {/* Storeys — only shown when Extension is selected */}
            {answers.q1_2_projectType === 'Extension' && (
              <div>
                <Label>Q1.2a — Number of storeys in the extension</Label>
                <HelpText>Used to determine whether single-storey or multi-storey construction durations apply.</HelpText>
                <SelectInput value={answers.q1_2_storeys || '1'} onChange={v => set('q1_2_storeys', v)}>
                  <option value="1">1 storey</option>
                  <option value="2">2 storeys</option>
                  <option value="3">3 storeys</option>
                  <option value="4">4+ storeys</option>
                </SelectInput>
              </div>
            )}

            <div>
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
                <div className="mt-2">
                  <TextInput value={answers.q1_3_buildingUseOther} onChange={v => set('q1_3_buildingUseOther', v)} placeholder="Please describe the building use" />
                </div>
              )}
            </div>
            <div>
              <Label required>Q1.4 — Building age</Label>
              <RadioGroup options={BUILDING_AGES} value={answers.q1_4_buildingAge} onChange={v => set('q1_4_buildingAge', v)} />
            </div>
            <div>
              <Label required>Q1.5 — Approximate size (GIFA m²)</Label>
              <HelpText>Gross Internal Floor Area in square metres. Used as the primary pricing quantity for all elements.</HelpText>
              <NumberInput value={answers.q1_5_size} onChange={v => set('q1_5_size', v)} placeholder="e.g. 500" min={1} />
              {validationErrors.q1_5_size && <p className="mt-1 text-sm" style={{ color: '#C00000' }}>{validationErrors.q1_5_size}</p>}
            </div>
          </div>
        )}

        {/* ─── SECTION 2 ─────────────────────────────────────────────────────── */}
        {section === 2 && (
          <div className="flex flex-col gap-8 section-enter">
            <div>
              <Label required>Q2.1 — Project objective</Label>
              <HelpText>Describe what you are trying to achieve and why this project is needed.</HelpText>
              <Textarea value={answers.q2_1_objective} onChange={v => set('q2_1_objective', v)} placeholder="e.g. Refurbish the first floor to provide modern open-plan office space and upgrade the M&E to current standards." rows={4} />
              {validationErrors.q2_1_objective && <p className="mt-1 text-sm" style={{ color: '#C00000' }}>{validationErrors.q2_1_objective}</p>}
            </div>

            {/* Q2.2 — Level of Intervention: shown first so it gates the scope list below */}
            {isRefurb && (
              <div>
                <Label>Q2.2 — Level of intervention</Label>
                <HelpText>Determines the rate band applied to costs and the design duration multiplier. Scope items that require a higher level are greyed out below.</HelpText>
                <div className="flex flex-col gap-3">
                  {INTERVENTION_LEVELS.map(opt => (
                    <label key={opt.value} className="flex items-start gap-3 cursor-pointer rounded-lg p-3"
                      style={{
                        border: answers.q2_3_interventionLevel === opt.value ? '2px solid #2E75B6' : '1px solid #CCC',
                        backgroundColor: answers.q2_3_interventionLevel === opt.value ? '#D5E8F0' : '#FFF',
                      }}>
                      <input type="radio" value={opt.value} checked={answers.q2_3_interventionLevel === opt.value}
                        onChange={() => set('q2_3_interventionLevel', opt.value)}
                        className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ accentColor: '#2E75B6' }} />
                      <div>
                        <div className="font-bold" style={{ color: '#1F3864' }}>{opt.value}</div>
                        <div style={{ color: '#2E75B6', fontSize: '12px', fontWeight: 500, marginTop: '2px' }}>{opt.signal}</div>
                        <div style={{ color: '#555', fontSize: '14px', marginTop: '2px' }}>{opt.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label>Q2.3 — Scope of works</Label>
              <HelpText>Tick every element that is in scope. Use Other / Specialist below for anything not listed.</HelpText>
              {(() => {
                const scopeArr = Array.isArray(answers.q2_2_scopeItems) ? answers.q2_2_scopeItems : []
                const quantities = answers.q2_2_quantities || {}
                const setQty = (code, val) => set('q2_2_quantities', { ...(answers.q2_2_quantities || {}), [code]: val })
                const toggleScope = code => {
                  set('q2_2_scopeItems', scopeArr.includes(code) ? scopeArr.filter(v => v !== code) : [...scopeArr, code])
                }
                // Heating: 5.2 (new/upgraded, +5.5 gas) vs 5.2L (like-for-like). One only.
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
                // Wiring checkboxes: 5.8a and 5.8b are independent; if both ticked = full rewire (5.8)
                const toggleWiring = (code) => {
                  const newScope = scopeArr.includes(code)
                    ? scopeArr.filter(v => v !== code)
                    : [...scopeArr, code]
                  const has8a = newScope.includes('5.8a')
                  const has8b = newScope.includes('5.8b')
                  set('q2_2_scopeItems', newScope)
                  set('q2_2_wiring', (has8a && has8b) ? '5.8' : has8a ? '5.8a' : has8b ? '5.8b' : 'none')
                }
                // Plumbing checkboxes: 5.1 (full) and 5.1b (2nd fix only) are mutually exclusive
                const togglePlumbing = (code) => {
                  const other = code === '5.1' ? '5.1b' : '5.1'
                  const newScope = scopeArr.includes(code)
                    ? scopeArr.filter(v => v !== code)
                    : [...scopeArr.filter(v => v !== other), code]
                  set('q2_2_scopeItems', newScope)
                }
                const tierName = mlvl => Object.entries(LEVEL_TIER).find(([, v]) => v === mlvl)?.[0]
                // Inline styles (no external CSS needed)
                const S = {
                  grpBlock: { marginBottom: 16 },
                  grpHeader: { display: 'flex', alignItems: 'baseline', gap: 8, padding: '6px 0 4px 0', borderBottom: '1px solid #e0e4ea', marginBottom: 4 },
                  grpLabel: { fontWeight: 700, fontSize: 13, color: '#1a2744', textTransform: 'uppercase', letterSpacing: '0.3px' },
                  grpNote: { fontWeight: 400, fontSize: 11, color: '#888' },
                  itemRow: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '5px 6px', borderRadius: 4, cursor: 'pointer' },
                  itemCheck: { marginTop: 2, flexShrink: 0, accentColor: '#1a4fa8', width: 15, height: 15 },
                  itemText: { display: 'flex', flexDirection: 'column', gap: 1 },
                  itemLabel: { fontWeight: 600, fontSize: 13, color: '#1a1a2e', lineHeight: 1.3 },
                  itemDesc: { fontWeight: 400, fontSize: 11, color: '#666', lineHeight: 1.4 },
                  subPrompt: { background: '#f5f7fa', borderLeft: '3px solid #2e75b6', padding: '8px 12px', margin: '3px 0 3px 25px', borderRadius: '0 4px 4px 0' },
                  subLabel: { fontSize: 11, color: '#555', display: 'block', marginBottom: 4 },
                  subInput: { width: 70, fontSize: 14, padding: '3px 6px', border: '1px solid #ccc', borderRadius: 4 },
                  radioRow: { display: 'flex', alignItems: 'flex-start', gap: 8, padding: '3px 0', cursor: 'pointer' },
                  radioCheck: { marginTop: 2, flexShrink: 0, accentColor: '#1a4fa8', width: 14, height: 14 },
                  radioLabel: { fontWeight: 600, fontSize: 12, color: '#1a1a2e', lineHeight: 1.3 },
                  radioDesc: { fontWeight: 400, fontSize: 11, color: '#666', lineHeight: 1.4 },
                  reqNote: { fontSize: 10, color: '#B06000', fontStyle: 'italic', fontWeight: 500 },
                  subGrpHeader: { display: 'flex', alignItems: 'baseline', padding: '5px 0 3px 0', borderBottom: '1px dashed #c5cfe0', marginBottom: 3, marginTop: 10 },
                  subGrpLabel: { fontWeight: 600, fontSize: 11, color: '#2e75b6', textTransform: 'uppercase', letterSpacing: '0.4px' },
                }
                if (!scopeData) return <p style={{ color: '#888', fontSize: 13, padding: '8px 0' }}>Loading scope items…</p>
                if (!answers.q1_2_projectType) return <p style={{ color: '#888', fontSize: 13, padding: '8px 0' }}>Select a project type (Q1.2) above to see the relevant scope items.</p>
                const visibleGroups = VISIBLE_GROUPS[answers.q1_2_projectType] || scopeData.groups.map(g => g.group)
                const bu = answers.q1_3_buildingUse || ''
                const displayedGroups = scopeData.groups
                  .filter(g => visibleGroups.includes(g.group))
                  .map(g => ({ ...g, items: g.items.filter(it => matchesBuildingUse(it.buildingUse, bu) && !FOLDED_CODES.has(it.code)) }))
                  .filter(g => g.items.length > 0)
                if (displayedGroups.length === 0) return <p style={{ color: '#888', fontSize: 13, padding: '8px 0' }}>No scope items match this project type and building use yet.</p>
                // Group 5 split: codes 5.7+ → Electrical; specialist mechanical items with higher
                // codes (lifts, BWIC, compressed air, process drainage, industrial vent, precision
                // cooling) stay Mechanical via explicit set.
                const MECH_CODES_5 = new Set(['5.19', '5.20', '5.21', '5.23', '5.24', '5.29'])
                const getMechElec = code => {
                  if (MECH_CODES_5.has(code)) return 'mech'
                  const m = code.match(/^5\.(\d+)/)
                  return (m && Number(m[1]) >= 7) ? 'elec' : 'mech'
                }
                // Group 4 split: codes 4.1–4.9 = general fittings/sanitary; 4.10+ = sector-specific
                const getGroup4Split = code => {
                  const m = code.match(/^4\.(\d+)/)
                  return (m && Number(m[1]) <= 9) ? 'general' : 'specialist'
                }
                const renderItem = item => {
                  const minLvl = item.minLvl || 1
                  const isEnabled = !isRefurb || currentTier >= minLvl
                  const disStyle = isEnabled ? {} : { opacity: 0.4, cursor: 'not-allowed' }
                  // ── HEATING block (rendered when we reach 5.2; 5.2L/5.5 are folded out) ──
                  if (item.code === '5.2') {
                    const min2 = itemByCode['5.2']?.minLvl || 3
                    const min2L = itemByCode['5.2L']?.minLvl || 2
                    const lowestMin = Math.min(min2, min2L)
                    const heatingEnabled = !isRefurb || currentTier >= lowestMin
                    const can2 = !isRefurb || currentTier >= min2
                    const can2L = !isRefurb || currentTier >= min2L
                    const hDisStyle = heatingEnabled ? {} : { opacity: 0.4, cursor: 'not-allowed' }
                    return (
                      <div key="__heating__">
                        <label style={{ ...S.itemRow, ...hDisStyle }}>
                          <input type="checkbox" checked={heatingSelected && heatingEnabled} disabled={!heatingEnabled}
                            onChange={() => { if (heatingEnabled) toggleHeating() }} style={S.itemCheck} />
                          <div style={S.itemText}>
                            <span style={S.itemLabel}>Heating system</span>
                            <span style={S.itemDesc}>New, upgraded or replaced heating — LTHW, heat pump, underfloor heating or gas</span>
                            {!heatingEnabled && <span style={S.reqNote}>Requires: {tierName(lowestMin)}</span>}
                          </div>
                        </label>
                        {heatingSelected && heatingEnabled && (
                          <div style={S.subPrompt}>
                            <span style={S.subLabel}>Type of heating works</span>
                            {[
                              { value: '5.2',  label: 'New or upgraded system', desc: 'Full design and installation — LTHW, heat pump or underfloor heating', can: can2, min: min2 },
                              { value: '5.2L', label: 'Like-for-like boiler replacement', desc: 'Swap end-of-life unit only — no new pipework or system redesign', can: can2L, min: min2L },
                            ].map(opt => (
                              <label key={opt.value} style={{ ...S.radioRow, ...(opt.can ? {} : { opacity: 0.4, cursor: 'not-allowed' }) }}>
                                <input type="radio" value={opt.value} checked={heatingType === opt.value} disabled={!opt.can}
                                  onChange={() => { if (opt.can) selectHeatingType(opt.value) }} style={S.radioCheck} />
                                <div style={S.itemText}>
                                  <span style={S.radioLabel}>{opt.label}</span>
                                  <span style={S.radioDesc}>{opt.desc}</span>
                                  {!opt.can && <span style={S.reqNote}>Requires: {tierName(opt.min)}</span>}
                                </div>
                              </label>
                            ))}
                            <p style={{ fontSize: 11, color: '#777', marginTop: 6, fontStyle: 'italic' }}>Gas supply pipework is included automatically when a new or upgraded system is selected.</p>
                          </div>
                        )}
                      </div>
                    )
                  }
                  // ── Regular checkbox item ──────────────────────────
                  const isWiring = WIRING_MUTEX.includes(item.code)
                  const isPlumbing = PLUMBING_MUTEX.includes(item.code)
                  const isTicked = scopeArr.includes(item.code)
                  const showQty = isTicked && isEnabled && itemNeedsQty(item)
                  return (
                    <div key={item.code}>
                      <label style={{ ...S.itemRow, ...disStyle }}>
                        <input type="checkbox" checked={isTicked && isEnabled} disabled={!isEnabled}
                          onChange={() => {
                            if (!isEnabled) return
                            if (isWiring)        toggleWiring(item.code)
                            else if (isPlumbing) togglePlumbing(item.code)
                            else                 toggleScope(item.code)
                          }}
                          style={S.itemCheck} />
                        <div style={S.itemText}>
                          <span style={S.itemLabel}>{item.description}</span>
                          {!isEnabled && <span style={S.reqNote}>Requires: {tierName(minLvl)}</span>}
                        </div>
                      </label>
                      {showQty && (
                        <div style={S.subPrompt}>
                          <span style={S.subLabel}>{item.qtyCapture || 'Quantity'}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="number" value={quantities[item.code] ?? ''}
                              onChange={e => setQty(item.code, e.target.value)}
                              placeholder="e.g. 4" min={0}
                              style={{ ...S.subInput, width: 90 }} />
                            <span style={{ fontSize: 12, color: '#555' }}>{item.unit}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {displayedGroups.map(grp => {
                      if (grp.group === 4) {
                        const generalItems    = grp.items.filter(it => getGroup4Split(it.code) === 'general')
                        const specialistItems = grp.items.filter(it => getGroup4Split(it.code) === 'specialist')
                        return (
                          <div key={grp.group} style={S.grpBlock}>
                            <div style={S.grpHeader}><span style={S.grpLabel}>{grp.label}</span></div>
                            {generalItems.length > 0 && (
                              <>
                                <div style={S.subGrpHeader}><span style={S.subGrpLabel}>Fittings, Furniture &amp; Sanitary</span></div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>{generalItems.map(renderItem)}</div>
                              </>
                            )}
                            {specialistItems.length > 0 && (
                              <>
                                <div style={S.subGrpHeader}><span style={S.subGrpLabel}>Sector-Specific Equipment</span></div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>{specialistItems.map(renderItem)}</div>
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
                            <div style={S.grpHeader}><span style={S.grpLabel}>{grp.label}</span></div>
                            {mechItems.length > 0 && (
                              <>
                                <div style={S.subGrpHeader}><span style={S.subGrpLabel}>Mechanical Services</span></div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>{mechItems.map(renderItem)}</div>
                              </>
                            )}
                            {elecItems.length > 0 && (
                              <>
                                <div style={S.subGrpHeader}><span style={S.subGrpLabel}>Electrical Services</span></div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>{elecItems.map(renderItem)}</div>
                              </>
                            )}
                          </div>
                        )
                      }
                      return (
                        <div key={grp.group} style={S.grpBlock}>
                          <div style={S.grpHeader}><span style={S.grpLabel}>{grp.label}</span></div>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>{grp.items.map(renderItem)}</div>
                        </div>
                      )
                    })}
                    {/* Other / Specialist scope */}
                    <div style={{ marginTop: 8 }}>
                      <div style={{ ...S.grpHeader, marginBottom: 8 }}>
                        <span style={S.grpLabel}>OTHER / SPECIALIST SCOPE</span>
                      </div>
                      <Textarea value={answers.q2_2_additionalScope?.text}
                        onChange={v => set('q2_2_additionalScope', { ...(answers.q2_2_additionalScope || {}), text: v })}
                        placeholder="Any specialist scope not listed above — e.g. AV systems, heritage restoration, acoustic treatment, signage, modular pods" rows={2} />
                      <div className="mt-2">
                        <p className="text-sm mb-1 italic" style={{ color: '#555' }}>Approximate value of specialist scope (optional — leave blank for provisional exclusion)</p>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 font-medium" style={{ color: '#555' }}>£</span>
                          <input type="number" value={answers.q2_2_additionalScope?.approxValue || ''}
                            onChange={e => set('q2_2_additionalScope', { ...(answers.q2_2_additionalScope || {}), approxValue: e.target.value })}
                            placeholder="e.g. 50000" min={0}
                            className="w-full rounded-lg pl-7 pr-3 focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
                            style={{ border: '1px solid #CCC', minHeight: '48px', fontSize: '16px', color: '#1A1A1A', backgroundColor: '#FFF' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>

            {validationErrors.q2_2_scopeItems && <p className="mt-1 text-sm" style={{ color: '#C00000' }}>{validationErrors.q2_2_scopeItems}</p>}

            {/* Q2.4 — Specification Level */}
            <div>
              <Label required>Q2.4 — Specification level</Label>
              <HelpText>Selects the rate column from the NRM1 benchmark table.</HelpText>
              <div className="flex flex-col gap-3">
                {SPEC_LEVELS.map(opt => (
                  <label key={opt.value} className="flex items-start gap-3 cursor-pointer rounded-lg p-3"
                    style={{
                      border: answers.q2_4_specLevel === opt.value ? '2px solid #2E75B6' : '1px solid #CCC',
                      backgroundColor: answers.q2_4_specLevel === opt.value ? '#D5E8F0' : '#FFF',
                    }}>
                    <input type="radio" value={opt.value} checked={answers.q2_4_specLevel === opt.value}
                      onChange={() => set('q2_4_specLevel', opt.value)}
                      className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ accentColor: '#2E75B6' }} />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold" style={{ color: '#1F3864' }}>{opt.value}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#1F3864', color: '#FFF' }}>{opt.tag}</span>
                      </div>
                      <div style={{ color: '#555', fontSize: '14px' }}>{opt.description}</div>
                    </div>
                  </label>
                ))}
              </div>
              {validationErrors.q2_4_specLevel && <p className="mt-1 text-sm" style={{ color: '#C00000' }}>{validationErrors.q2_4_specLevel}</p>}
            </div>

            <div>
              <Label>Q2.5 — Standards and compliance requirements</Label>
              <HelpText>List any standards, certifications or funder conditions that apply — e.g. BREEAM, PAS 2035, NHS design guide, net zero, MCS, DNO requirements.</HelpText>
              <Textarea value={answers.q2_5_standards} onChange={v => set('q2_5_standards', v)}
                placeholder="e.g. BREEAM Very Good required by funder; PAS 2035 for retrofit works" rows={2} />
            </div>
          </div>
        )}

        {/* ─── SECTION 3 ─────────────────────────────────────────────────────── */}
        {section === 3 && (
          <div className="flex flex-col gap-6 section-enter">
            <div>
              <Label>Q3.1 — Known building issues</Label>
              <HelpText>Tick all that apply. These trigger risk allowance adjustments.</HelpText>
              <CheckboxGroup options={KNOWN_ISSUES} values={answers.q3_1_knownIssues} onChange={v => set('q3_1_knownIssues', v)} />
            </div>
            <div>
              <Label>Q3.2 — Previous works or relevant history</Label>
              <Textarea value={answers.q3_2_previousWorks} onChange={v => set('q3_2_previousWorks', v)} placeholder="e.g. M&E replaced in 2015. New roof in 2018. No structural works since original construction." rows={3} />
            </div>
            <div>
              <Label>Q3.3 — Surveys and reports available</Label>
              <HelpText>Tick all that apply. Surveys reduce the risk allowance and survey programme time.</HelpText>
              <CheckboxGroup
                options={SURVEY_OPTIONS}
                values={answers.q3_3_surveys}
                onChange={v => set('q3_3_surveys', v)}
              />
              {Array.isArray(answers.q3_3_surveys) && answers.q3_3_surveys.includes('Other') && (
                <div className="mt-2 ml-8">
                  <Textarea value={answers.q3_3_surveysOther} onChange={v => set('q3_3_surveysOther', v)}
                    placeholder="Please describe the survey or report available" rows={2} />
                </div>
              )}
            </div>
            <div>
              <Label>Q3.4 — Planning consent required</Label>
              <HelpText>Select the most likely planning pathway. If unsure, choose 'Unsure' — pre-application advice is recommended.</HelpText>
              <RadioGroup
                options={PLANNING_OPTIONS}
                value={answers.q3_4_planningConsents}
                onChange={v => set('q3_4_planningConsents', v)}
              />
            </div>
            <div>
              <Label>Q3.5 — Access constraints</Label>
              <HelpText>Tick all that apply. These affect the contractor's preliminaries allowance.</HelpText>
              <CheckboxGroup options={ACCESS_OPTIONS} values={answers.q3_5_accessConstraints} onChange={v => set('q3_5_accessConstraints', v)} />
              {Array.isArray(answers.q3_5_accessConstraints) && answers.q3_5_accessConstraints.includes('Other') && (
                <div className="mt-2 ml-8">
                  <Textarea value={answers.q3_5_accessConstraintsOther} onChange={v => set('q3_5_accessConstraintsOther', v)}
                    placeholder="Please describe the access constraint" rows={2} />
                </div>
              )}
            </div>
            <div>
              <Label>Q3.6 — Occupation during works</Label>
              <HelpText>Affects construction duration and preliminary costs.</HelpText>
              <RadioGroup options={OCCUPATION_OPTIONS} value={answers.q3_6_occupation} onChange={v => set('q3_6_occupation', v)} />
            </div>
            <div>
              <Label>Q3.7 — Additional context</Label>
              <Textarea value={answers.q3_7_additionalContext} onChange={v => set('q3_7_additionalContext', v)} placeholder="Anything else that might affect the cost, programme or risk — location, operational constraints, heritage status, etc." rows={3} />
            </div>
          </div>
        )}

        {/* ─── SECTION 4 ─────────────────────────────────────────────────────── */}
        {section === 4 && (
          <div className="flex flex-col gap-6 section-enter">
            <div>
              <Label>Q4.1 — Target completion date</Label>
              <HelpText>Used to assess programme feasibility. Leave blank if no specific deadline.</HelpText>
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="radio" checked={answers.q4_1_targetDate === 'No specific deadline'} onChange={() => set('q4_1_targetDate', 'No specific deadline')}
                    className="w-5 h-5" style={{ accentColor: '#2E75B6' }} />
                  <span style={{ fontSize: '16px', color: '#1A1A1A' }}>No specific deadline</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="radio" checked={!!answers.q4_1_targetDate && answers.q4_1_targetDate !== 'No specific deadline'} onChange={() => set('q4_1_targetDate', '')}
                    className="w-5 h-5" style={{ accentColor: '#2E75B6' }} />
                  <span style={{ fontSize: '16px', color: '#1A1A1A' }}>Specific target date:</span>
                </label>
                {answers.q4_1_targetDate !== 'No specific deadline' && (
                  <input type="date" value={answers.q4_1_targetDate || ''} onChange={e => set('q4_1_targetDate', e.target.value)}
                    className="w-full rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
                    style={{ border: '1px solid #CCC', minHeight: '48px', fontSize: '16px', color: '#1A1A1A', backgroundColor: '#FFF', boxSizing: 'border-box' }} />
                )}
              </div>
            </div>
            <div>
              <Label required>Q4.2 — Do you have a budget figure?</Label>
              <HelpText>Controls whether the report compares your budget against the NRM1 estimate, or generates a benchmark independently.</HelpText>
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-3 cursor-pointer" style={{ minHeight: '44px' }}>
                  <input type="radio" checked={answers.q4_2_budgetKnown === 'Yes'} onChange={() => set('q4_2_budgetKnown', 'Yes')}
                    className="w-5 h-5" style={{ accentColor: '#2E75B6' }} />
                  <span style={{ fontSize: '16px', color: '#1A1A1A' }}>Yes — I have a budget figure</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer" style={{ minHeight: '44px' }}>
                  <input type="radio" checked={answers.q4_2_budgetKnown === 'No'} onChange={() => set('q4_2_budgetKnown', 'No')}
                    className="w-5 h-5" style={{ accentColor: '#2E75B6' }} />
                  <span style={{ fontSize: '16px', color: '#1A1A1A' }}>No — generate a benchmark estimate</span>
                </label>
              </div>
              {answers.q4_2_budgetKnown === 'Yes' && (
                <div className="mt-3">
                  <Label>Q4.3 — Budget figure</Label>
                  <HelpText>State what the figure covers — fees, VAT, contingency, or construction cost only.</HelpText>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-medium" style={{ color: '#555' }}>£</span>
                    <input type="number" value={answers.q4_3_budget || ''} onChange={e => set('q4_3_budget', e.target.value)} placeholder="e.g. 1500000" min={0}
                      className="w-full rounded-lg pl-7 pr-3 focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
                      style={{ border: '1px solid #CCC', minHeight: '48px', fontSize: '16px', color: '#1A1A1A', backgroundColor: '#FFF' }} />
                  </div>
                </div>
              )}
            </div>
            <div>
              <Label>Q4.3 — What matters most on this project?</Label>
              <HelpText>Select all that apply. Drives the procurement recommendation and programme approach.</HelpText>
              <CheckboxGroup options={PRIORITIES} values={answers.q4_4_priorities} onChange={v => set('q4_4_priorities', v)} />
            </div>
            <div>
              <Label>Q4.4 — Design stage already reached</Label>
              <HelpText>Determines the professional fees percentage applied to the cost estimate and the viable procurement routes.</HelpText>
              <RadioGroup options={DESIGN_STAGE_OPTIONS} value={answers.q4_5_designStage} onChange={v => set('q4_5_designStage', v)} />
            </div>
            <div>
              <Label>Q4.5 — Single or phased delivery?</Label>
              <HelpText>Phased delivery extends the total construction programme. Each phase is assumed to be roughly equal in size at Stage 0–1.</HelpText>
              <SelectInput value={answers.q4_6_phasing || 'Single phase'} onChange={v => set('q4_6_phasing', v)}>
                <option value="Single phase">Single phase — full project delivered in one continuous programme</option>
                <option value="Multiple phases">Multiple phases — phased delivery (e.g. floor by floor, building by building, or rolling programme)</option>
              </SelectInput>
            </div>
            <div>
              <Label>Q4.6 — Funding source</Label>

              <HelpText>Grant or public funding adds a governance approval allowance to the programme.</HelpText>
              <div className="flex flex-col gap-3">
                {FUNDING_OPTIONS.map(opt => (
                  <label key={opt} className="flex items-center gap-3 cursor-pointer" style={{ minHeight: '44px' }}>
                    <input type="radio" value={opt} checked={answers.q4_7_funding === opt}
                      onChange={() => set('q4_7_funding', opt)}
                      className="w-5 h-5 flex-shrink-0" style={{ accentColor: '#2E75B6' }} />
                    <span style={{ color: '#1A1A1A', fontSize: '16px' }}>{opt}</span>
                  </label>
                ))}
              </div>
              {answers.q4_7_funding === 'Other' && (
                <div className="mt-3 ml-8">
                  <Textarea value={answers.q4_7_fundingOther} onChange={v => set('q4_7_fundingOther', v)}
                    placeholder="Please describe the funding source" rows={2} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── SECTION 5 ─────────────────────────────────────────────────────── */}
        {section === 5 && (
          <div className="flex flex-col gap-6 section-enter">
            <div className="p-4 rounded-lg" style={{ backgroundColor: '#EEF4FA', border: '1px solid #B8D3ED' }}>
              <p style={{ color: '#1F3864', fontWeight: 'bold', fontSize: '15px' }}>Optional section</p>
              <p style={{ color: '#555', fontSize: '14px' }}>Complete this section only if you want the report to include an ROI or financial case analysis. Skip to Section 6 if not applicable.</p>
            </div>
            <div>
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
            </div>
            {Array.isArray(answers.q5_1_financialBenefit) && answers.q5_1_financialBenefit.length > 0 && !answers.q5_1_financialBenefit.includes('No direct financial return — strategic or compliance project') && (
              <div>
                <Label>Q5.2 — Estimated annual benefit (£)</Label>
                <HelpText>Used to calculate simple payback period and ROI.</HelpText>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-medium" style={{ color: '#555' }}>£</span>
                  <input type="number" value={answers.q5_2_annualBenefit || ''} onChange={e => set('q5_2_annualBenefit', e.target.value)} placeholder="e.g. 80000" min={0}
                    className="w-full rounded-lg pl-7 pr-3 focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
                    style={{ border: '1px solid #CCC', minHeight: '48px', fontSize: '16px', color: '#1A1A1A', backgroundColor: '#FFF' }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── SECTION 6 ─────────────────────────────────────────────────────── */}
        {section === 6 && (
          <div className="flex flex-col gap-6 section-enter">
            <div className="p-4 rounded-lg" style={{ backgroundColor: '#F0FDF4', border: '1px solid #86EFAC' }}>
              <p className="font-bold mb-1" style={{ color: '#166534' }}>Ready to generate</p>
              <p style={{ color: '#166534', fontSize: '14px' }}>Costs are calculated deterministically from NRM1 Excel benchmark data. The AI writes prose only — it never invents a number.</p>
            </div>
            <div>
              <Label>Q6.1 — Optional report sections</Label>
              <HelpText>The core sections (Executive Summary, Scope, Risk, Programme, Recommendations) are always included.</HelpText>
              <CheckboxGroup
                options={['Order of Cost Estimate (NRM1)', 'ROI & Financial Case', 'Procurement Recommendation', 'Constraints Summary']}
                values={answers.q6_1_sections}
                onChange={v => set('q6_1_sections', v)}
              />
            </div>
            <div>
              <Label>Q6.2 — Additional report instructions</Label>
              <HelpText>Any specific tone, emphasis, or content requirements for the AI narrative.</HelpText>
              <Textarea value={answers.q6_2_instructions} onChange={v => set('q6_2_instructions', v)} placeholder="e.g. Emphasise the compliance risk. Write for a non-technical audience. Focus on the programme risk." rows={3} />
            </div>

            {/* Summary card */}
            <div className="rounded-lg p-4" style={{ backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB' }}>
              <p className="font-bold mb-3" style={{ color: '#1F3864' }}>Your inputs at a glance</p>
              <div className="flex flex-col gap-1 text-sm" style={{ color: '#444' }}>
                <p><strong>Project:</strong> {answers.q1_0_projectName || '—'}</p>
                <p><strong>Type:</strong> {answers.q1_2_projectType || '—'} | <strong>Size:</strong> {answers.q1_5_size ? `${answers.q1_5_size} m²` : '—'}</p>
                <p><strong>Postcode:</strong> {answers.q1_1_postcode || '—'} | <strong>Spec:</strong> {answers.q2_4_specLevel || '—'}</p>
                <p><strong>Scope items:</strong> {(answers.q2_2_scopeItems || []).length} selected</p>
              </div>
            </div>
          </div>
        )}

        {/* ─── Navigation ────────────────────────────────────────────────────── */}
        <div className="mt-10 flex gap-3">
          {section > 1 && (
            <button onClick={back} className="flex-1 py-3 rounded-xl"
              style={{ border: '1.5px solid #CBD5E1', color: '#1A2E4A', backgroundColor: '#fff', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '15px' }}>
              ← Back
            </button>
          )}
          {section < 6 ? (
            <button onClick={next} className="flex-1 py-3 rounded-xl text-white"
              style={{ backgroundColor: '#1A2E4A', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', boxShadow: '0 2px 10px rgba(26,46,74,0.28)' }}>
              Continue →
            </button>
          ) : (
            <button onClick={submit} className="flex-1 py-4 rounded-xl text-white"
              style={{ backgroundColor: '#1A5C2E', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '17px', boxShadow: '0 4px 16px rgba(26,92,46,0.35)', letterSpacing: '-0.2px' }}>
              Generate Report
            </button>
          )}
        </div>

        {/* Draft note */}
        <p className="mt-4 text-center text-xs" style={{ color: '#999' }}>
          Your answers are saved automatically. You can return to this page to resume.
        </p>
      </div>
    </div>
  )
}
