'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

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

// ─── Section 2 data — NRM1 v3.2 codes ────────────────────────────────────────
// Each item: { code, label, desc }
// Special sentinels: { code: '__WIRING__', isWiringSection: true }
//                    { code: '__HEATING__', isHeatingGroup: true }
const SCOPE_GROUPS = [
  {
    id: 'GRP0',
    group: 'GRP 0 — FACILITATING WORKS',
    note: 'Demolition · Refurbishment · Brownfield new build',
    items: [
      { code: '0.1', label: 'Asbestos and hazardous material removal', desc: 'Surveys, containment, licensed removal and disposal' },
      { code: '0.2', label: 'Demolition, strip-out or structural alterations', desc: 'Full or partial demolition, structural openings and enabling works' },
      { code: '0.3', label: 'Contaminated land treatment and remediation', desc: 'Land investigation, treatment, removal and sign-off' },
    ],
  },
  {
    id: 'GRP1',
    group: 'GRP 1 — SUBSTRUCTURE',
    note: 'New build and extension only',
    items: [
      { code: '1.1-1.3', label: 'Foundations and ground floor slab', desc: 'Pad, strip, raft or pile foundations; ground floor slab, DPM and insulation' },
      { code: '1.4', label: 'Basement excavation and structure', desc: 'Retaining structure, waterproofing and drainage' },
    ],
  },
  {
    id: 'GRP2',
    group: 'GRP 2 — SUPERSTRUCTURE & ENVELOPE',
    note: 'Structure, fabric, openings and waterproofing',
    items: [
      { code: '2.1-2.2', label: 'Structural frame and upper floors', desc: 'Steel or concrete frame, composite or precast floors' },
      { code: '2.3', label: 'Roof — new, replacement or major repair', desc: 'New structure, replacement covering or major repair and renewal' },
      { code: '2.5', label: 'External walls and facade', desc: 'New build envelope, overcladding or repair to existing facade' },
      { code: '2.6', label: 'Windows and external doors', desc: 'Replacement or new curtain walling, windows, fire exits and entrance doors' },
      { code: '2.7', label: 'Internal partitions and doors', desc: 'New layout, demountable or permanent partitions and internal doors' },
      { code: '2.9', label: 'Waterproofing and tanking', desc: 'Flat roof membrane, below-ground tanking or wet room waterproofing' },
    ],
  },
  {
    id: 'GRP3',
    group: 'GRP 3 — INTERNAL FINISHES',
    note: 'Specification level (Q2.4) controls the rate applied',
    items: [
      { code: '3.1', label: 'Wall finishes', desc: 'Plaster skim, paint, tiling, dry lining or wall boarding' },
      { code: '3.2', label: 'Floor finishes', desc: 'Screeds, vinyl, carpet, ceramic tile, timber or stone' },
      { code: '3.3', label: 'Ceiling finishes', desc: 'Plasterboard, suspended grid and tile, or acoustic treatment' },
      { code: '3.4', label: 'Internal doors and ironmongery', desc: 'Door sets, frames, handles and door closers (where not part of partition works)' },
      { code: '3.5', label: 'Internal decoration', desc: 'Full redecoration — walls, ceilings, woodwork, including preparation' },
    ],
  },
  {
    id: 'GRP4',
    group: 'GRP 4 — FITTINGS, FURNISHINGS & EQUIPMENT',
    note: 'FF&E and specialist fit-out',
    items: [
      { code: '4.1', label: 'Joinery and built-in furniture', desc: 'Reception counters, shelving, worktops, fitted wardrobes' },
      { code: '4.2', label: 'Sanitary fittings and toilet fit-out', desc: 'Inc accessible, changing and assisted wash facilities' },
      { code: '4.3', label: 'Kitchen or servery', desc: 'Units, worktops, appliances and break-out area' },
      { code: '4.4', label: 'Specialist or process equipment', desc: 'Lab, clinical, retail, data centre or plant room fit-out' },
    ],
  },
  {
    id: 'GRP5A',
    group: 'GRP 5A — MECHANICAL SERVICES',
    items: [
      { code: '5.1',  label: 'Plumbing', desc: 'HWS, cold water supply, drainage and waste — 1st and 2nd fix' },
      { code: '__HEATING__', isHeatingGroup: true },
      { code: '5.3',  label: 'Ventilation and air handling', desc: 'AHU, MVHR, heat recovery, mechanical extract — lab or healthcare ventilation' },
      { code: '5.4',  label: 'Air conditioning and cooling', desc: 'VRF, splits, chilled beam, cold store or process cooling' },
      { code: '5.6',  label: 'Sprinkler or fire suppression', desc: 'Wet or dry sprinkler system throughout' },
    ],
  },
  {
    id: 'GRP5B',
    group: 'GRP 5B — ELECTRICAL SERVICES',
    items: [
      { code: '5.7',  label: 'Main LV panel and switchgear', desc: 'New main distribution board, LV panel, incoming metering and earthing' },
      { code: '5.7a', label: 'Sub-distribution and containment', desc: 'Sub-DBs, cable tray, trunking, conduit runs and busbar trunking throughout the building' },
      { code: '5.8a', label: '1st fix wiring', desc: 'New circuit cables and containment throughout; existing sockets and switches retained', isWiringItem: true },
      { code: '5.8b', label: '2nd fix wiring', desc: 'Replacement sockets, switches and FCUs; existing circuit wiring reused', isWiringItem: true },
      { code: '5.8c', label: '2nd fix lighting', desc: 'New luminaires, lighting layout and controls' },
      { code: '5.9a', label: 'Fire alarm system', desc: 'Detection, call points, sounders and control panel — L1 to L3 system' },
      { code: '5.9b', label: 'Emergency lighting', desc: 'Maintained and non-maintained emergency luminaires with central test facility' },
    ],
  },
  {
    id: 'GRP5C',
    group: 'GRP 5C — LOW CARBON & RENEWABLES',
    items: [
      { code: '5.11', label: 'Solar PV', desc: 'Panels, inverters, racking and monitoring — state kWp capacity in project size field' },
      { code: '5.12', label: 'Battery storage (BESS)', desc: 'Battery energy storage system — state kWh capacity in project size field' },
      { code: '5.13', label: 'Grid connection or DNO upgrade', desc: 'New supply, reinforcement, protection relays and metering' },
      { code: '5.14', label: 'BEMS', desc: 'Building energy management system, controls, remote monitoring and sub-metering' },
      { code: '5.15', label: 'EV charging points', desc: 'Charge points and cabling — state number required in project size field' },
    ],
  },
  {
    id: 'GRP5D',
    group: 'GRP 5D — COMMUNICATIONS, SECURITY & TRANSPORT',
    items: [
      { code: '5.16', label: 'IT and data infrastructure', desc: 'Cat6A cabling, patch panels, containment and comms room' },
      { code: '5.18', label: 'Access control, CCTV and security', desc: 'Door access, cameras, intruder detection and PA system' },
      { code: '5.19', label: 'Lift or platform lift', desc: 'State number of installations in project size field' },
    ],
  },
  {
    id: 'GRP6',
    group: 'GRP 6 — SPECIALIST STRUCTURES',
    note: 'Office, industrial and data-centre projects',
    items: [
      { code: '6.2', label: 'Raised access floor or mezzanine', desc: 'Structural supports, infill panels and access hatches' },
    ],
  },
  {
    id: 'GRP7',
    group: 'GRP 7 — WORK TO EXISTING BUILDINGS',
    note: 'Refurbishment and extension only',
    items: [
      { code: '7.1', label: 'Structural repairs', desc: 'Crack stitching, bearing repairs, beam or column strengthening' },
      { code: '7.2', label: 'Fabric and envelope repairs', desc: 'Repointing, render, weathertight works, overcladding patch' },
      { code: '7.3', label: 'Damp proof course and damp remediation', desc: 'Chemical injection, tanking or membrane systems' },
      { code: '7.4', label: 'M&E overhaul', desc: 'Like-for-like replacement of end-of-life plant and distribution (not new installation)' },
      { code: '7.5', label: 'Making good after structural works', desc: 'Patch plaster, redecoration, fire stopping' },
    ],
  },
  {
    id: 'GRP8',
    group: 'GRP 8 — EXTERNAL WORKS',
    note: 'Always consider — primary scope for External Works projects',
    items: [
      { code: '8.1', label: 'Site preparation and clearance', desc: 'Strip topsoil, temporary fencing and hoarding' },
      { code: '8.2', label: 'Roads, paths and hard paving', desc: 'Macadam, block paving, edging and kerbs' },
      { code: '8.3', label: 'Car parking', desc: 'Surfacing, line marking, disabled bays — state number of spaces in project size field' },
      { code: '8.4', label: 'Drainage', desc: 'Surface water, foul drainage and sewer connections' },
      { code: '8.6', label: 'External utility services', desc: 'Gas, water and electric diversions or new connections' },
      { code: '8.7', label: 'Soft landscaping', desc: 'Planting, seeding, topsoil and planters' },
      { code: '8.8', label: 'Boundary enclosures', desc: 'Security fencing, gates, walls and bollards' },
      { code: '8.9', label: 'External lighting', desc: 'Site-wide column or wall-mounted lighting' },
    ],
  },
]

// Items that need a quantity sub-prompt when ticked — keyed by NRM1 code
const QUANTITY_ITEMS = {
  '4.2':  { field: 'q2_2_bathrooms',  label: 'How many bathroom / sanitary fit-out suites?', unit: 'Nr', placeholder: 'e.g. 4' },
  '4.3':  { field: 'q2_2_kitchens',   label: 'How many kitchens or serveries?', unit: 'Nr', placeholder: 'e.g. 1' },
  '5.11': { field: 'q2_5_pvKwp',      label: 'Solar PV capacity (kWp)', unit: 'kWp', placeholder: 'e.g. 50' },
  '5.12': { field: 'q2_5_battKwh',    label: 'Battery storage capacity (kWh)', unit: 'kWh', placeholder: 'e.g. 100' },
  '5.15': { field: 'q2_5_evNr',       label: 'Number of EV charging points', unit: 'Nr', placeholder: 'e.g. 10' },
  '5.19': { field: 'q2_5_liftNr',     label: 'Number of lifts or platform lifts', unit: 'Nr', placeholder: 'e.g. 1' },
  '8.3':  { field: 'q2_5_carParksNr', label: 'Number of car parking spaces', unit: 'Nr', placeholder: 'e.g. 20' },
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
    description: 'All of the above, plus light-touch M&E: replacement light fittings, sockets and switches, or 2nd fix fixtures only. Existing wiring and pipework stays. No new systems installed.',
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

// Multi-select — VALUES match substring checks in costCalculator.js
const PLANNING_OPTIONS = [
  'Full planning',
  'Listed Building Consent',
  'Prior approval',
  'Change of use',
  'Permitted development',
  'Unsure',
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
    <label className="block font-bold mb-1.5" style={{ color: '#1F3864', fontSize: '16px' }}>
      {children}{required && <span style={{ color: '#C00000' }} className="ml-1">*</span>}
    </label>
  )
}
function HelpText({ children }) {
  return <p className="mb-2 italic" style={{ color: '#555', fontSize: '14px' }}>{children}</p>
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

  // Restore draft
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setAnswers(JSON.parse(saved))
    } catch {}
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
  const isNewBuild = answers.q1_2_projectType === 'New Build'

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
      // Store result for report page
      sessionStorage.setItem('estatesAI_result', JSON.stringify(data))
      router.push('/report')
    } catch (e) {
      setError('Network error — please check your connection and try again.')
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4"
        style={{ backgroundColor: '#F7F9FC' }}>
        <div className="w-12 h-12 border-4 border-[#2E75B6] border-t-transparent rounded-full animate-spin" />
        <p className="text-center font-medium text-lg" style={{ color: '#1F3864' }}>{LOADING_MESSAGES[loadingMsg]}</p>
        <p className="text-center text-sm" style={{ color: '#666' }}>Costs calculated deterministically from NRM1 Excel data. This takes 20–40 seconds.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F7F9FC' }}>
      {/* Header */}
      <header className="sticky top-0 z-10 px-4 py-3 shadow-sm" style={{ backgroundColor: '#1F3864' }}>
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <span className="font-bold text-white text-lg">Estates AI</span>
          <span className="text-sm text-white/70">Section {section} of {SECTIONS.length}</span>
        </div>
      </header>

      {/* Progress bar */}
      <div className="h-1" style={{ backgroundColor: '#E5E7EB' }}>
        <div className="h-1 transition-all duration-300" style={{ backgroundColor: '#2E75B6', width: `${(section / SECTIONS.length) * 100}%` }} />
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Section header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1" style={{ color: '#1F3864' }}>{SECTIONS[section - 1].title}</h1>
          <p style={{ color: '#555' }}>{SECTIONS[section - 1].subtitle}</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg border" style={{ backgroundColor: '#FEF2F2', borderColor: '#C00000', color: '#C00000' }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* ─── SECTION 1 ─────────────────────────────────────────────────────── */}
        {section === 1 && (
          <div className="flex flex-col gap-6">
            <div>
              <Label required>Q1.0 — Project name</Label>
              <TextInput value={answers.q1_0_projectName} onChange={v => set('q1_0_projectName', v)} placeholder="e.g. Science Block Refurbishment" />
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
            <div>
              <Label>Q1.3 — Building use</Label>
              <SelectInput value={answers.q1_3_buildingUse} onChange={v => set('q1_3_buildingUse', v)}>
                <option value="">Select building use...</option>
                <option>Residential</option>
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
          <div className="flex flex-col gap-8">
            <div>
              <Label required>Q2.1 — Project objective</Label>
              <HelpText>Describe what you are trying to achieve and why this project is needed.</HelpText>
              <Textarea value={answers.q2_1_objective} onChange={v => set('q2_1_objective', v)} placeholder="e.g. Refurbish the first floor to provide modern open-plan office space and upgrade the M&E to current standards." rows={4} />
              {validationErrors.q2_1_objective && <p className="mt-1 text-sm" style={{ color: '#C00000' }}>{validationErrors.q2_1_objective}</p>}
            </div>

            <div>
              <Label>Q2.2 — Scope of works</Label>
              <HelpText>Tick every element that is in scope. Use Other / Specialist below for anything not listed.</HelpText>
              {(() => {
                const scopeArr = Array.isArray(answers.q2_2_scopeItems) ? answers.q2_2_scopeItems : []
                const toggleScope = code => {
                  set('q2_2_scopeItems', scopeArr.includes(code) ? scopeArr.filter(v => v !== code) : [...scopeArr, code])
                }
                const heatingSelected = !!answers.q2_2_heatingGroup || scopeArr.includes('5.2') || scopeArr.includes('5.2L')
                const heatingType = answers.q2_2_heatingType || ''
                const toggleHeating = () => {
                  if (heatingSelected) {
                    set('q2_2_heatingGroup', false)
                    set('q2_2_heatingType', '')
                    set('q2_2_scopeItems', scopeArr.filter(v => !['5.2', '5.2L', '5.5'].includes(v)))
                  } else {
                    set('q2_2_heatingGroup', true)
                  }
                }
                const selectHeatingType = (type) => {
                  set('q2_2_heatingType', type)
                  set('q2_2_heatingGroup', true)
                  const cleaned = scopeArr.filter(v => !['5.2', '5.2L', '5.5'].includes(v))
                  set('q2_2_scopeItems', type === '5.2' ? [...cleaned, '5.2', '5.5'] : [...cleaned, '5.2L'])
                }
                // Wiring checkboxes: 5.8a and 5.8b are independent; if both ticked = full rewire (5.8)
                const toggleWiring = (code) => {
                  const newScope = scopeArr.includes(code)
                    ? scopeArr.filter(v => v !== code)
                    : [...scopeArr, code]
                  const has8a = newScope.includes('5.8a')
                  const has8b = newScope.includes('5.8b')
                  const newWiring = (has8a && has8b) ? '5.8' : has8a ? '5.8a' : has8b ? '5.8b' : 'none'
                  set('q2_2_scopeItems', newScope)
                  set('q2_2_wiring', newWiring)
                }
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
                  subgroup: { borderLeft: '3px solid #2e75b6', padding: '6px 12px', margin: '4px 0 4px 16px', background: '#fafbfc', borderRadius: '0 4px 4px 0' },
                  subgroupLabel: { fontWeight: 600, fontSize: 12, color: '#444', display: 'block', marginBottom: 6 },
                  radioRow: { display: 'flex', alignItems: 'flex-start', gap: 8, padding: '3px 0', cursor: 'pointer' },
                  radioCheck: { marginTop: 2, flexShrink: 0, accentColor: '#1a4fa8', width: 14, height: 14 },
                  radioLabel: { fontWeight: 600, fontSize: 12, color: '#1a1a2e', lineHeight: 1.3 },
                  radioDesc: { fontWeight: 400, fontSize: 11, color: '#666', lineHeight: 1.4 },
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {SCOPE_GROUPS.map(grp => (
                      <div key={grp.id} style={S.grpBlock}>
                        <div style={S.grpHeader}>
                          <span style={S.grpLabel}>{grp.group}</span>
                          {grp.note && <span style={S.grpNote}>{grp.note}</span>}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {grp.items.map(item => {
                            // ── HEATING sentinel ──────────────────────────────
                            if (item.isHeatingGroup) {
                              return (
                                <div key="__heating__">
                                  <label style={S.itemRow}>
                                    <input type="checkbox" checked={heatingSelected} onChange={toggleHeating} style={S.itemCheck} />
                                    <div style={S.itemText}>
                                      <span style={S.itemLabel}>Heating system</span>
                                      <span style={S.itemDesc}>New, upgraded or replaced heating — LTHW, heat pump, underfloor heating or gas</span>
                                    </div>
                                  </label>
                                  {heatingSelected && (
                                    <div style={S.subPrompt}>
                                      <span style={S.subLabel}>Type of heating works</span>
                                      {[
                                        { value: '5.2',  label: 'New or upgraded system', desc: 'Full design and installation — LTHW, heat pump or underfloor heating' },
                                        { value: '5.2L', label: 'Like-for-like boiler replacement', desc: 'Swap end-of-life unit only — no new pipework or system redesign' },
                                      ].map(opt => (
                                        <label key={opt.value} style={S.radioRow}>
                                          <input type="radio" value={opt.value} checked={heatingType === opt.value}
                                            onChange={() => selectHeatingType(opt.value)} style={S.radioCheck} />
                                          <div style={S.itemText}>
                                            <span style={S.radioLabel}>{opt.label}</span>
                                            <span style={S.radioDesc}>{opt.desc}</span>
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
                            const isTicked = scopeArr.includes(item.code)
                            const qItem = QUANTITY_ITEMS[item.code]
                            return (
                              <div key={item.code}>
                                <label style={S.itemRow}>
                                  <input type="checkbox" checked={isTicked}
                                    onChange={() => item.isWiringItem ? toggleWiring(item.code) : toggleScope(item.code)}
                                    style={S.itemCheck} />
                                  <div style={S.itemText}>
                                    <span style={S.itemLabel}>{item.label}</span>
                                    {item.desc && <span style={S.itemDesc}>{item.desc}</span>}
                                  </div>
                                </label>
                                {isTicked && item.code === '4.2' && (
                                  <div style={S.subPrompt}>
                                    <span style={S.subLabel}>Number of bathrooms / wet rooms</span>
                                    <input type="number" min={1} max={50} value={answers.q2_2_bathrooms || 1}
                                      onChange={e => set('q2_2_bathrooms', e.target.value)} style={S.subInput} />
                                  </div>
                                )}
                                {isTicked && item.code === '4.3' && (
                                  <div style={S.subPrompt}>
                                    <span style={S.subLabel}>Number of kitchens or kitchenettes</span>
                                    <input type="number" min={1} max={20} value={answers.q2_2_kitchens || 1}
                                      onChange={e => set('q2_2_kitchens', e.target.value)} style={S.subInput} />
                                  </div>
                                )}
                                {isTicked && qItem && item.code !== '4.2' && item.code !== '4.3' && (
                                  <div style={S.subPrompt}>
                                    <span style={S.subLabel}>{qItem.label}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <input type="number" value={answers[qItem.field] || ''}
                                        onChange={e => set(qItem.field, e.target.value)}
                                        placeholder={qItem.placeholder} min={0}
                                        style={{ ...S.subInput, width: 80 }} />
                                      <span style={{ fontSize: 12, color: '#555' }}>{qItem.unit}</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                    {/* Other / Specialist scope */}
                    <div style={{ marginTop: 8 }}>
                      <div style={{ ...S.grpHeader, marginBottom: 8 }}>
                        <span style={S.grpLabel}>OTHER / SPECIALIST SCOPE</span>
                      </div>
                      <Textarea value={answers.q2_2_other} onChange={v => set('q2_2_other', v)}
                        placeholder="Any specialist scope not listed above — e.g. AV systems, heritage restoration, acoustic treatment, signage, modular pods" rows={2} />
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Q2.3 — Level of Intervention (refurb/fit-out/extension only) */}
            {isRefurb && (
              <div>
                <Label>Q2.3 — Level of intervention</Label>
                <HelpText>Determines the rate band applied to costs and the design duration multiplier.</HelpText>
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
          <div className="flex flex-col gap-6">
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
              <Label>Q3.4 — Planning consents required</Label>
              <HelpText>Select all that apply. If unsure, choose 'Unsure' — pre-application advice is recommended.</HelpText>
              <CheckboxGroup
                options={PLANNING_OPTIONS}
                values={answers.q3_4_planningConsents}
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
          <div className="flex flex-col gap-6">
            <div>
              <Label>Q4.1 — Target completion date</Label>
              <HelpText>Used to assess programme feasibility. Leave blank if no specific deadline.</HelpText>
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="radio" checked={answers.q4_1_targetDate === 'No specific deadline'} onChange={() => set('q4_1_targetDate', 'No specific deadline')}
                    className="w-5 h-5" style={{ accentColor: '#2E75B6' }} />
                  <span style={{ fontSize: '16px' }}>No specific deadline</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="radio" checked={!!answers.q4_1_targetDate && answers.q4_1_targetDate !== 'No specific deadline'} onChange={() => set('q4_1_targetDate', '')}
                    className="w-5 h-5" style={{ accentColor: '#2E75B6' }} />
                  <span style={{ fontSize: '16px' }}>Specific target date:</span>
                </label>
                {answers.q4_1_targetDate !== 'No specific deadline' && (
                  <input type="date" value={answers.q4_1_targetDate || ''} onChange={e => set('q4_1_targetDate', e.target.value)}
                    className="w-full rounded-lg px-3 ml-8 focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
                    style={{ border: '1px solid #CCC', minHeight: '48px', fontSize: '16px', color: '#1A1A1A', backgroundColor: '#FFF' }} />
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
                  <span style={{ fontSize: '16px' }}>Yes — I have a budget figure</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer" style={{ minHeight: '44px' }}>
                  <input type="radio" checked={answers.q4_2_budgetKnown === 'No'} onChange={() => set('q4_2_budgetKnown', 'No')}
                    className="w-5 h-5" style={{ accentColor: '#2E75B6' }} />
                  <span style={{ fontSize: '16px' }}>No — generate a benchmark estimate</span>
                </label>
              </div>
              {answers.q4_2_budgetKnown === 'Yes' && (
                <div className="mt-3">
                  <Label>Q4.3 — Budget figure</Label>
                  <HelpText>State what the figure covers — fees, VAT, contingency, or construction cost only.</HelpText>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-medium" style={{ color: '#555' }}>£</span>
                    <input type="number" value={answers.q4_2_budgetFigure || ''} onChange={e => set('q4_2_budgetFigure', e.target.value)} placeholder="e.g. 1500000" min={0}
                      className="w-full rounded-lg pl-7 pr-3 focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
                      style={{ border: '1px solid #CCC', minHeight: '48px', fontSize: '16px', color: '#1A1A1A', backgroundColor: '#FFF' }} />
                  </div>
                </div>
              )}
            </div>
            <div>
              <Label>Q4.4 — What matters most on this project?</Label>
              <HelpText>Select all that apply. Drives the procurement recommendation and programme approach.</HelpText>
              <CheckboxGroup options={PRIORITIES} values={answers.q4_5_priorities} onChange={v => set('q4_5_priorities', v)} />
            </div>
            <div>
              <Label>Q4.5 — Design stage already reached</Label>
              <HelpText>Determines the professional fees percentage applied to the cost estimate and the viable procurement routes.</HelpText>
              <RadioGroup options={DESIGN_STAGE_OPTIONS} value={answers.q4_6_designStage} onChange={v => set('q4_6_designStage', v)} />
            </div>
            <div>
              <Label>Q4.6 — Single or phased delivery?</Label>
              <Textarea value={answers.q4_7_phasing} onChange={v => set('q4_7_phasing', v)} placeholder="e.g. Single phase, full decant before start. Or: Two phases — Phase 1 ground floor 2025, Phase 2 first floor 2026." rows={2} />
            </div>
            <div>
              <Label>Q4.8 — Utility constraints</Label>
              <HelpText>Utility upgrades add cost and programme time. Tick all that apply.</HelpText>
              <CheckboxGroup options={UTILITIES_OPTIONS} values={answers.q4_8_utilities} onChange={v => set('q4_8_utilities', v)} />
            </div>
            <div>
              <Label>Q4.7 — Funding source</Label>
              <HelpText>Grant or public funding adds a governance approval allowance to the programme.</HelpText>
              <div className="flex flex-col gap-3">
                {FUNDING_OPTIONS.map(opt => (
                  <label key={opt} className="flex items-center gap-3 cursor-pointer" style={{ minHeight: '44px' }}>
                    <input type="radio" value={opt} checked={answers.q4_9_funding === opt}
                      onChange={() => set('q4_9_funding', opt)}
                      className="w-5 h-5 flex-shrink-0" style={{ accentColor: '#2E75B6' }} />
                    <span style={{ color: '#1A1A1A', fontSize: '16px' }}>{opt}</span>
                  </label>
                ))}
              </div>
              {answers.q4_9_funding === 'Other' && (
                <div className="mt-3 ml-8">
                  <Textarea value={answers.q4_9_fundingOther} onChange={v => set('q4_9_fundingOther', v)}
                    placeholder="Please describe the funding source" rows={2} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── SECTION 5 ─────────────────────────────────────────────────────── */}
        {section === 5 && (
          <div className="flex flex-col gap-6">
            <div className="p-4 rounded-lg" style={{ backgroundColor: '#EEF4FA', border: '1px solid #B8D3ED' }}>
              <p style={{ color: '#1F3864', fontWeight: 'bold', fontSize: '15px' }}>Optional section</p>
              <p style={{ color: '#555', fontSize: '14px' }}>Complete this section only if you want the report to include an ROI or financial case analysis. Skip to Section 6 if not applicable.</p>
            </div>
            <div>
              <Label>Q5.1 — Financial benefit type</Label>
              <SelectInput value={answers.q5_1_financialBenefit} onChange={v => set('q5_1_financialBenefit', v)}>
                <option value="">Select benefit type...</option>
                {FINANCIAL_BENEFIT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </SelectInput>
            </div>
            {answers.q5_1_financialBenefit && !answers.q5_1_financialBenefit.includes('No direct') && (
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
          <div className="flex flex-col gap-6">
            <div className="p-4 rounded-lg" style={{ backgroundColor: '#F0FDF4', border: '1px solid #86EFAC' }}>
              <p className="font-bold mb-1" style={{ color: '#166534' }}>Ready to generate</p>
              <p style={{ color: '#166534', fontSize: '14px' }}>Costs are calculated deterministically from NRM1 Excel benchmark data. The AI writes prose only — it never invents a number.</p>
            </div>
            <div>
              <Label>Q6.1 — Optional report sections</Label>
              <HelpText>The core sections (Executive Summary, Scope, Risk, Programme, Recommendations) are always included.</HelpText>
              <CheckboxGroup
                options={['Order of Cost Estimate (NRM1)', 'ROI & Financial Case', 'Procurement Recommendation', 'Constraints Summary']}
                values={answers.q6_1_reportSections}
                onChange={v => set('q6_1_reportSections', v)}
              />
            </div>
            <div>
              <Label>Q6.2 — Additional report instructions</Label>
              <HelpText>Any specific tone, emphasis, or content requirements for the AI narrative.</HelpText>
              <Textarea value={answers.q6_2_reportInstructions} onChange={v => set('q6_2_reportInstructions', v)} placeholder="e.g. Emphasise the compliance risk. Write for a non-technical audience. Focus on the programme risk." rows={3} />
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
        <div className="mt-10 flex gap-4">
          {section > 1 && (
            <button onClick={back} className="flex-1 py-3 rounded-lg font-medium" style={{ border: '2px solid #1F3864', color: '#1F3864', backgroundColor: '#FFF' }}>
              Back
            </button>
          )}
          {section < 6 ? (
            <button onClick={next} className="flex-1 py-3 rounded-lg font-bold text-white"
              style={{ backgroundColor: '#1F3864' }}>
              Continue
            </button>
          ) : (
            <button onClick={submit} className="flex-1 py-4 rounded-lg font-bold text-white text-lg"
              style={{ backgroundColor: '#375623' }}>
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
