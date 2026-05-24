'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const STORAGE_KEY = 'estatesAI_v3_answers'

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

// ─── Section 2 data — NAMES MUST MATCH TAB 7 EXACTLY ─────────────────────────
const SCOPE_GROUPS = [
  {
    group: 'ENABLING & DEMOLITION',
    items: [
      'Demolition and strip-out',
      'Ground remediation or enabling works',
    ],
  },
  {
    group: 'STRUCTURAL & CIVIL',
    items: [
      'Substructure or foundations',
      'Structural frame',
      'Structural alterations or new openings',
    ],
  },
  {
    group: 'FABRIC & ENVELOPE',
    items: [
      'Roof (new or replacement)',
      'Facade or external walls',
      'Windows and external doors',
      'Waterproofing or tanking',
    ],
  },
  {
    group: 'EXTERNAL WORKS',
    items: [
      'External works and landscaping',
      'Car parking',
      'External lighting',
    ],
  },
  {
    group: 'MECHANICAL SERVICES',
    items: [
      'Heating system',
      'Ventilation or air handling',
      'Air conditioning or cooling',
      'Plumbing first fix',
      'Plumbing second fix and fittings',
      'Sprinkler or fire suppression',
      'Gas installation',
    ],
  },
  {
    group: 'ELECTRICAL SERVICES',
    items: [
      'Electrical distribution and switchgear',
      'Electrical wiring first fix',
      'Electrical fittings and lighting second fix',
      'Emergency lighting and fire alarm',
    ],
  },
  {
    group: 'LOW CARBON & ENERGY',
    items: [
      'Solar PV or renewable energy',
      'Battery storage system',
      'Grid connection upgrade or DNO approval',
      'Building energy management system (BEMS)',
      'EV charging points',
    ],
  },
  {
    group: 'INTERNAL FIT-OUT & FINISHES',
    note: 'Wall, floor and ceiling finishes are always included in the cost estimate.',
    items: [
      'Internal partitions and walls',
      'Internal doors and ironmongery',
      'Ceilings',
      'Flooring',
      'Redecoration',
      'Joinery and built-in furniture',
      'Kitchen or break-out area',
      'Toilets or wet rooms',
    ],
  },
  {
    group: 'SPECIALIST FIT-OUT',
    items: [
      'Laboratory fit-out',
      'Clinical or healthcare fit-out',
      'Data centre or server room',
    ],
  },
  {
    group: 'TECHNOLOGY & SECURITY',
    items: [
      'IT infrastructure and data cabling',
      'AV systems',
      'Access control and security',
      'CCTV',
    ],
  },
  {
    group: 'ACCESSIBILITY',
    items: [
      'Lift or platform lift',
      'Accessible toilet or changing facilities',
      'Ramps or level access',
      'Wayfinding and signage',
    ],
  },
]

// Items that need a quantity field when ticked
const QUANTITY_ITEMS = {
  'Solar PV or renewable energy':    { field: 'q2_5_pvKwp',     label: 'Approximate solar PV capacity (kWp)', unit: 'kWp', placeholder: 'e.g. 50' },
  'Battery storage system':          { field: 'q2_5_battKwh',   label: 'Approximate battery capacity (kWh)', unit: 'kWh', placeholder: 'e.g. 100' },
  'EV charging points':              { field: 'q2_5_evNr',      label: 'Number of EV charging points', unit: 'Nr', placeholder: 'e.g. 10' },
  'Lift or platform lift':           { field: 'q2_5_liftNr',    label: 'Number of lifts or platform lifts', unit: 'Nr', placeholder: 'e.g. 1' },
  'Car parking':                     { field: 'q2_5_carParksNr',label: 'Number of car parking spaces', unit: 'Nr', placeholder: 'e.g. 20' },
  'Toilets or wet rooms':            { field: 'q2_5_sanitNr',   label: 'Number of sanitary fittings (WC packs)', unit: 'Nr', placeholder: 'e.g. 8' },
}

const INTERVENTION_LEVELS = [
  { value: 'Light touch', description: 'Cosmetic works only — decoration, minor repairs, like-for-like replacement. Limited design required.' },
  { value: 'Full refurbishment', description: 'Major refurbishment — systems replaced or upgraded, layout largely retained, full design team required.' },
  { value: 'Complete strip-out', description: 'Gut refurbishment — strip to structure, all services removed and replaced, new layout. Maximum design and survey allowance.' },
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
  'Full survey pack available',
  'Partial surveys',
  'Asbestos register only',
  'None yet',
]

// VALUES must match conditions checked in costCalculator.js
const PLANNING_OPTIONS = [
  'Full planning',
  'Full planning + Listed Building Consent',
  'Change of use consent',
  'Prior approval',
  'Permitted development',
  'Unsure / pre-application',
  'No consent required',
]

// VALUES must match conditions checked in costCalculator.js
const ACCESS_OPTIONS = [
  'Restricted working hours',
  'Shared access with other occupiers',
  'Term-time only working',
  'No vehicle access or restricted deliveries',
  'No constraints',
]

// VALUES must match conditions checked in costCalculator.js
const OCCUPATION_OPTIONS = [
  'Fully occupied throughout',
  'Partially occupied',
  'Fully decanted before works begin',
  'Not applicable (new build)',
]

// ─── Section 4 data ───────────────────────────────────────────────────────────
const PRIORITIES = [
  'Keeping costs as low as possible',
  'Fixed price and cost certainty',
  'Completing as quickly as possible',
  'High quality design and finish',
  'Minimising disruption to occupants',
  'Meeting a funder or compliance deadline',
]

// VALUES must match conditions checked in costCalculator.js
const DESIGN_STAGE_OPTIONS = [
  'Stage 0–1',
  'Stage 2',
  'Stage 3',
  'Stage 4',
]

const UTILITIES_OPTIONS = [
  'Electrical capacity limited or unknown',
  'Gas supply limited or unknown',
  'Drainage capacity limited or unknown',
  'Water supply limited or unknown',
  'No known utility constraints',
]

const FUNDING_OPTIONS = [
  'Internal capital budget',
  'Internal maintenance or revenue budget',
  'External grant (e.g. Salix, UKRI, heritage)',
  'Commercial loan or private finance',
  'Combination of sources',
  'Not yet confirmed',
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
              <TextInput value={answers.q1_3_buildingUse} onChange={v => set('q1_3_buildingUse', v)} placeholder="e.g. Office, Education, Healthcare, Residential" />
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
              <HelpText>Tick every element you expect to be included. Wall, floor and ceiling finishes are always priced. Tick items even if uncertain — you can exclude them later.</HelpText>
              {SCOPE_GROUPS.map(grp => (
                <div key={grp.group} className="mb-5">
                  <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: '#2E75B6' }}>{grp.group}</p>
                  {grp.note && <p className="text-xs italic mb-2" style={{ color: '#777' }}>{grp.note}</p>}
                  <CheckboxGroup
                    options={grp.items}
                    values={answers.q2_2_scopeItems}
                    onChange={v => set('q2_2_scopeItems', v)}
                  />
                  {/* Quantity fields for items needing quantities */}
                  {grp.items.filter(item =>
                    QUANTITY_ITEMS[item] && Array.isArray(answers.q2_2_scopeItems) && answers.q2_2_scopeItems.includes(item)
                  ).map(item => {
                    const q = QUANTITY_ITEMS[item]
                    return (
                      <div key={q.field} className="mt-2 ml-8 p-3 rounded-lg" style={{ backgroundColor: '#EEF4FA', border: '1px solid #B8D3ED' }}>
                        <Label>{q.label}</Label>
                        <div className="flex items-center gap-2">
                          <NumberInput value={answers[q.field]} onChange={v => set(q.field, v)} placeholder={q.placeholder} min={0} />
                          <span className="text-sm font-medium" style={{ color: '#1F3864', whiteSpace: 'nowrap' }}>{q.unit}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
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
                        <div style={{ color: '#555', fontSize: '14px' }}>{opt.description}</div>
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
              <label className="flex items-center gap-3 cursor-pointer mt-3" style={{ minHeight: '44px' }}>
                <input type="checkbox" checked={!!answers.q2_4_breeam} onChange={e => set('q2_4_breeam', e.target.checked)}
                  className="w-5 h-5 flex-shrink-0 rounded" style={{ accentColor: '#2E75B6' }} />
                <span style={{ color: '#1A1A1A', fontSize: '16px' }}>BREEAM or equivalent sustainability certification required</span>
              </label>
            </div>

            <div>
              <Label>Q2.5 — Additional scope notes</Label>
              <HelpText>Any specific scope requirements, exclusions, or items needing clarification.</HelpText>
              <Textarea value={answers.q2_5_notes} onChange={v => set('q2_5_notes', v)} placeholder="e.g. Retain existing structural frame. New roof only if survey confirms end-of-life." rows={3} />
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
              <Label>Q3.3 — Surveys completed</Label>
              <HelpText>What surveys or assessments have already been carried out?</HelpText>
              <RadioGroup options={SURVEY_OPTIONS} value={answers.q3_3_surveys} onChange={v => set('q3_3_surveys', v)} />
            </div>
            <div>
              <Label>Q3.4 — Planning consents required</Label>
              <SelectInput value={answers.q3_4_planningConsents} onChange={v => set('q3_4_planningConsents', v)}>
                <option value="">Select planning type...</option>
                {PLANNING_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </SelectInput>
            </div>
            <div>
              <Label>Q3.5 — Access constraints</Label>
              <HelpText>Tick all that apply. These affect the contractor's preliminaries allowance.</HelpText>
              <CheckboxGroup options={ACCESS_OPTIONS} values={answers.q3_5_accessConstraints} onChange={v => set('q3_5_accessConstraints', v)} />
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
              <Label>Q4.2 — Budget figure (if known)</Label>
              <HelpText>Optional. Helps assess whether the budget is sufficient for the scope.</HelpText>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-medium" style={{ color: '#555' }}>£</span>
                <input type="number" value={answers.q4_2_budgetFigure || ''} onChange={e => set('q4_2_budgetFigure', e.target.value)} placeholder="e.g. 1500000" min={0}
                  className="w-full rounded-lg pl-7 pr-3 focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
                  style={{ border: '1px solid #CCC', minHeight: '48px', fontSize: '16px', color: '#1A1A1A', backgroundColor: '#FFF' }} />
              </div>
            </div>
            <div>
              <Label>Q4.5 — Project priorities</Label>
              <CheckboxGroup options={PRIORITIES} values={answers.q4_5_priorities} onChange={v => set('q4_5_priorities', v)} />
            </div>
            <div>
              <Label>Q4.6 — Design stage already reached</Label>
              <HelpText>Determines the professional fees percentage applied to the cost estimate.</HelpText>
              <RadioGroup options={DESIGN_STAGE_OPTIONS} value={answers.q4_6_designStage} onChange={v => set('q4_6_designStage', v)} />
            </div>
            <div>
              <Label>Q4.7 — Phasing</Label>
              <Textarea value={answers.q4_7_phasing} onChange={v => set('q4_7_phasing', v)} placeholder="e.g. Two phases planned — Phase 1 ground floor 2025, Phase 2 first floor 2026. Or: Single phase, full decant before start." rows={2} />
            </div>
            <div>
              <Label>Q4.8 — Utility constraints</Label>
              <CheckboxGroup options={UTILITIES_OPTIONS} values={answers.q4_8_utilities} onChange={v => set('q4_8_utilities', v)} />
            </div>
            <div>
              <Label>Q4.9 — Funding source</Label>
              <SelectInput value={answers.q4_9_funding} onChange={v => set('q4_9_funding', v)}>
                <option value="">Select funding source...</option>
                {FUNDING_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </SelectInput>
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
