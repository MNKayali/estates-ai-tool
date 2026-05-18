'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const STORAGE_KEY = 'estatesAI_answers'

const SECTIONS = [
  { id: 1, title: 'Project Identity & Location', subtitle: 'Tell us about your building and where it is' },
  { id: 2, title: 'Project Scope', subtitle: 'What work needs to be done?' },
  { id: 3, title: 'Building Condition & Constraints', subtitle: 'What do you know about the building?' },
  { id: 4, title: 'Programme, Budget & Procurement', subtitle: 'Timelines, costs and priorities' },
  { id: 5, title: 'ROI & Financial Case', subtitle: 'What is the financial benefit of this project?' },
  { id: 6, title: 'Report Preferences', subtitle: 'What sections do you want in your report?' },
]

const LOADING_MESSAGES = [
  'Analysing your project inputs...',
  'Calculating NRM1 cost estimates...',
  'Building your risk register...',
  'Generating programme timeline...',
  'Preparing your feasibility report...',
]

// ─── Section 1 options ───────────────────────────────────────────────────────

const PROJECT_TYPES = ['New Build', 'Refurbishment', 'Fit-Out', 'Extension', 'External Works', 'Renewable Energy', 'Demolition', 'Mixed']

function getBuildingUseOptions(projectType) {
  if (projectType === 'External Works') {
    return ['Car park', 'Pedestrian routes', 'Campus or estate-wide', 'Sports facilities', 'Building perimeter']
  }
  return [
    'Residential flat or apartment', 'Residential house', 'Residential HMO',
    'Commercial office', 'Commercial retail', 'Commercial food and beverage',
    'Commercial leisure', 'Education', 'Healthcare', 'Industrial or warehouse',
    'Specialist', 'Mixed use',
  ]
}

const BUILDING_AGES = ['Pre-1900', '1900–1945', '1945–1980', '1980–2000', 'Post-2000']
const STOREYS = ['Single storey', '2–4', '5–10', '10+']

// ─── Section 2 options ───────────────────────────────────────────────────────

const SCOPE_GROUPS = [
  {
    group: 'Enabling & Demolition',
    items: ['Demolition of existing structures', 'Strip-out of internal fit-out', 'Ground remediation / contamination removal', 'Asbestos removal'],
  },
  {
    group: 'Structural & Civil',
    items: ['Structural frame alterations', 'New foundations / substructure', 'Structural repairs and strengthening', 'Roof replacement', 'Roof repairs'],
  },
  {
    group: 'Fabric & Envelope',
    items: ['External facade replacement', 'New or replacement windows and doors', 'External waterproofing / cladding', 'Internal partitions and walls', 'Internal doors and ironmongery'],
  },
  {
    group: 'Mechanical Services',
    items: ['Heating system replacement (boilers, plant)', 'Ventilation and air handling', 'Plumbing and drainage', 'Sprinkler / fire suppression system', 'Cooling / air conditioning'],
  },
  {
    group: 'Electrical Services',
    items: ['Full electrical rewire', 'Distribution boards and switchgear', 'Lighting replacement', 'Fire alarm and detection system', 'Emergency lighting', 'Access control and security', 'Solar PV panels', 'EV charging points', 'Battery storage system', 'Grid connection upgrade', 'Lift / hoist installation or replacement'],
  },
  {
    group: 'Internal Fit-Out & Finishes',
    items: ['Wall finishes and redecoration', 'Floor finishes (screed, tiles, carpet)', 'Suspended ceiling systems', 'Joinery and bespoke furniture', 'Kitchen / staff welfare fit-out', 'Toilet and bathroom fit-out', 'Laboratory fit-out', 'Clinical fit-out', 'Data centre / server room fit-out'],
  },
  {
    group: 'Technology & Data',
    items: ['IT and data cabling (Cat6/fibre)', 'AV and presentation systems', 'Building Energy Management System (BEMS)'],
  },
  {
    group: 'Accessibility',
    items: ['DDA / accessibility improvements', 'External works and landscaping', 'Car parking works', 'External lighting'],
  },
]

const STANDARDS = [
  'BREEAM (any rating)',
  'BREEAM Excellent or Outstanding',
  'Net Zero Carbon in construction',
  'Net Zero Carbon in operation',
  'PAS 2035 (retrofit standard)',
  'Listed building / heritage standards',
  'Secured by Design',
  'NHS or HTM standards',
  'University technical standards (bespoke)',
  'No specific standards required',
]

// ─── Section 3 options ───────────────────────────────────────────────────────

const KNOWN_ISSUES_REFURB = [
  'Asbestos suspected or confirmed',
  'Damp or water ingress',
  'Structural defects or movement',
  'Ageing or failing M&E services',
  'Poor energy performance',
  'Fire safety deficiencies',
  'Accessibility / DDA non-compliance',
  'Lead paint suspected',
  'Contaminated ground',
  'Flood risk',
  'No known issues',
]

const KNOWN_ISSUES_NEWBUILD = [
  'Contaminated ground',
  'Flood risk',
  'Poor ground conditions (soft ground, made ground)',
  'Overhead power lines',
  'Underground services crossing site',
  'Access constraints to site',
  'No known issues',
]

const SURVEYS = [
  'Structural survey',
  'Mechanical and electrical condition survey',
  'Asbestos survey (R&D or management)',
  'Topographical survey',
  'Ground investigation / soil survey',
  'Measured building survey',
  'Thermal imaging / energy survey',
  'Fire risk assessment',
  'Drainage survey',
  'No surveys available',
]

const PLANNING_CONSENTS = [
  'Full planning permission required',
  'Listed building consent required',
  'Permitted development — no planning needed',
  'Prior approval only',
  'Planning pre-application advice obtained',
  'Planning already approved',
  'Conservation area — additional constraints',
  'Unknown / not yet assessed',
]

const ACCESS_CONSTRAINTS = [
  'Restricted vehicle access to site',
  'Shared access with other occupants',
  'Working in a live / occupied building',
  'Adjacent to sensitive uses (hospital, school)',
  'Limited laydown / storage area on site',
  'Working at height restrictions',
  'No access constraints identified',
]

const OCCUPATION = [
  'Fully occupied throughout works',
  'Partially occupied — some areas vacated',
  'Fully vacated for duration of works',
  'Phased vacation possible',
  'Unknown',
]

// ─── Section 4 options ───────────────────────────────────────────────────────

const BUDGET_INCLUDES = [
  'Construction costs only',
  'Professional fees',
  'VAT',
  'Risk and contingency',
  'Client-direct costs (furniture, IT, etc.)',
  'Inflation',
]

const PRIORITIES = [
  'Lowest possible cost',
  'Speed of delivery',
  'Flexibility to change scope',
  'Design quality and aesthetics',
  'Minimising disruption to occupants',
  'Sustainability and environmental performance',
  'Long-term maintenance cost',
]

const DESIGN_STAGES = [
  'Stage 0–1 (concept only)',
  'Stage 2 (concept design complete)',
  'Stage 3 (developed design complete)',
  'Stage 4 (technical design complete)',
]

const UTILITIES = [
  'High voltage electrical supply required',
  'New gas connection required',
  'New water / drainage connection required',
  'Telecoms / fibre connection required',
  'Existing utilities require diversion',
  'No utility constraints identified',
]

const FUNDING_SOURCES = [
  'Internal capital budget',
  'Government grant (specify in additional context)',
  'Research council funding',
  'Private finance / developer',
  'Capital receipt',
  'Phased funding over multiple years',
  'Not yet confirmed',
]

// ─── Section 5 options ───────────────────────────────────────────────────────

const FINANCIAL_BENEFITS = [
  'Rental income from new or improved space',
  'Energy cost savings',
  'Operational efficiency savings',
  'Increased student or staff capacity',
  'Avoidance of backlog maintenance costs',
  'Grant match-funding requirement',
  'No direct financial return',
]

// ─── Section 6 options ───────────────────────────────────────────────────────

const MANDATORY_SECTIONS = [
  { id: 'executive-summary', label: 'Executive Summary' },
  { id: 'scope-of-works', label: 'Scope of Works' },
  { id: 'risk-register', label: 'Top Risks Register' },
  { id: 'programme', label: 'High-Level Programme' },
  { id: 'recommendations', label: 'Recommendations & Next Steps' },
]

const OPTIONAL_SECTIONS = [
  { id: 'cost-estimate', label: 'Order of Cost Estimate' },
  { id: 'roi', label: 'ROI & Financial Case' },
  { id: 'procurement', label: 'Procurement Recommendation' },
  { id: 'constraints', label: 'Constraints Summary' },
]

// ─── Helper components ───────────────────────────────────────────────────────

function Label({ children, required }) {
  return (
    <label className="block text-sm font-medium text-gray-800 mb-1.5">
      {children}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
  )
}

function FieldError({ msg }) {
  if (!msg) return null
  return <p className="mt-1 text-xs text-red-600">{msg}</p>
}

function TextInput({ value, onChange, placeholder, className = '' }) {
  return (
    <input
      type="text"
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent ${className}`}
    />
  )
}

function NumberInput({ value, onChange, placeholder, min }) {
  return (
    <input
      type="number"
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      min={min}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent"
    />
  )
}

function Textarea({ value, onChange, placeholder, rows = 4 }) {
  return (
    <textarea
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent resize-none"
    />
  )
}

function RadioGroup({ options, value, onChange }) {
  return (
    <div className="flex flex-col gap-2">
      {options.map(opt => (
        <label key={opt} className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="radio"
            value={opt}
            checked={value === opt}
            onChange={() => onChange(opt)}
            className="w-4 h-4 text-[#2E75B6] border-gray-300 focus:ring-[#2E75B6]"
          />
          <span className="text-sm text-gray-700">{opt}</span>
        </label>
      ))}
    </div>
  )
}

function CheckboxGroup({ options, values = [], onChange }) {
  const toggle = (opt) => {
    const arr = Array.isArray(values) ? values : []
    onChange(arr.includes(opt) ? arr.filter(v => v !== opt) : [...arr, opt])
  }
  return (
    <div className="flex flex-col gap-2">
      {options.map(opt => (
        <label key={opt} className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={Array.isArray(values) && values.includes(opt)}
            onChange={() => toggle(opt)}
            className="mt-0.5 w-4 h-4 text-[#2E75B6] border-gray-300 rounded focus:ring-[#2E75B6]"
          />
          <span className="text-sm text-gray-700">{opt}</span>
        </label>
      ))}
    </div>
  )
}

function GroupedCheckboxes({ groups, values = [], onChange }) {
  const toggle = (opt) => {
    const arr = Array.isArray(values) ? values : []
    onChange(arr.includes(opt) ? arr.filter(v => v !== opt) : [...arr, opt])
  }
  return (
    <div className="flex flex-col gap-5">
      {groups.map(g => (
        <div key={g.group}>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{g.group}</p>
          <div className="flex flex-col gap-2 pl-1">
            {g.items.map(opt => (
              <label key={opt} className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Array.isArray(values) && values.includes(opt)}
                  onChange={() => toggle(opt)}
                  className="mt-0.5 w-4 h-4 text-[#2E75B6] border-gray-300 rounded focus:ring-[#2E75B6]"
                />
                <span className="text-sm text-gray-700">{opt}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function QuestionBlock({ children, className = '' }) {
  return <div className={`mb-6 ${className}`}>{children}</div>
}

// ─── Progress bar ────────────────────────────────────────────────────────────

function ProgressBar({ current, total }) {
  return (
    <div className="mb-8">
      <div className="flex justify-between text-xs text-gray-500 mb-2">
        <span>Section {current} of {total}</span>
        <span>{Math.round((current / total) * 100)}% complete</span>
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`h-2 flex-1 rounded-full transition-colors ${
              i + 1 < current ? 'bg-[#2E75B6]' : i + 1 === current ? 'bg-[#2E75B6] opacity-70' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Loading overlay ──────────────────────────────────────────────────────────

function LoadingOverlay({ message }) {
  return (
    <div className="fixed inset-0 bg-[#1F3864] bg-opacity-95 z-50 flex items-center justify-center">
      <div className="text-center text-white px-6">
        <div className="mb-6">
          <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Generating Your Report</h2>
        <p className="text-blue-200 text-sm">{message}</p>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function QuestionnairePage() {
  const router = useRouter()
  const [section, setSection] = useState(1)
  const [answers, setAnswers] = useState({})
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0])
  const [optionalSections, setOptionalSections] = useState(['cost-estimate'])
  const msgRef = useRef(0)

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        setAnswers(parsed.answers || {})
        setOptionalSections(parsed.optionalSections || ['cost-estimate'])
      }
    } catch {}
  }, [])

  // Save to localStorage whenever answers change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ answers, optionalSections }))
    } catch {}
  }, [answers, optionalSections])

  const set = (key, val) => setAnswers(prev => ({ ...prev, [key]: val }))
  const get = (key) => answers[key]

  const projectType = get('q1_2_projectType') || ''
  const isNewBuild = projectType === 'New Build'
  const isExternalWorks = projectType === 'External Works'
  const isRenewable = projectType === 'Renewable Energy'
  const isDemolition = projectType === 'Demolition'
  const isRefurb = !isNewBuild && !isExternalWorks

  const buildingUse = get('q1_3_buildingUse') || ''
  const isResidential = buildingUse.toLowerCase().includes('residential')

  const interventionLevel = get('q2_3_interventionLevel') || ''
  const scopeItems = get('q2_2_scopeItems') || []
  const budgetKnown = get('q4_2_budgetKnown') || ''
  const financialBenefit = get('q5_1_financialBenefit') || []
  const projectSize = parseFloat(get('q1_5_size') || '0')

  const showAV = ['Education', 'Healthcare', 'Specialist'].some(u => buildingUse.includes(u))
  const showRenewableExtras = isRenewable || (Array.isArray(scopeItems) && scopeItems.includes('Solar PV panels'))
  const showROI = !financialBenefit.includes('No direct financial return') || financialBenefit.length === 0

  // Filter scope groups based on conditionals
  const filteredScopeGroups = SCOPE_GROUPS.map(g => ({
    ...g,
    items: g.items.filter(item => {
      if (!showAV && item === 'AV and presentation systems') return false
      if (!showRenewableExtras && ['Battery storage system', 'Grid connection upgrade', 'Building Energy Management System (BEMS)'].includes(item)) return false
      return true
    }),
  })).filter(g => g.items.length > 0)

  // Validation per section
  function validateSection(s) {
    const errs = {}
    if (s === 1) {
      if (!get('q1_0_projectName')) errs.q1_0_projectName = 'Project name is required'
      if (!get('q1_1_postcode')) errs.q1_1_postcode = 'Postcode is required'
      if (!get('q1_2_projectType')) errs.q1_2_projectType = 'Please select a project type'
      if (!get('q1_3_buildingUse')) errs.q1_3_buildingUse = 'Please select a building use'
      if (!isNewBuild && !isExternalWorks && !get('q1_4_buildingAge')) errs.q1_4_buildingAge = 'Building age is required'
      if (!get('q1_5_size')) errs.q1_5_size = 'Project size is required'
    }
    if (s === 2) {
      if (!get('q2_1_objective')) errs.q2_1_objective = 'Project objective is required'
      if (!get('q2_2_scopeItems') || !get('q2_2_scopeItems').length) errs.q2_2_scopeItems = 'Please select at least one scope item'
    }
    if (s === 3) {
      if (!get('q3_1_knownIssues') || !get('q3_1_knownIssues').length) errs.q3_1_knownIssues = 'Please select at least one option'
      if (!get('q3_4_planningConsents') || !get('q3_4_planningConsents').length) errs.q3_4_planningConsents = 'Please select at least one option'
      if (!get('q3_6_occupation')) errs.q3_6_occupation = 'Please select an occupation status'
    }
    if (s === 4) {
      if (!get('q4_1_targetDate')) errs.q4_1_targetDate = 'Target date is required'
      if (!get('q4_2_budgetKnown')) errs.q4_2_budgetKnown = 'Please indicate if a budget is known'
      if (!get('q4_5_priorities') || !get('q4_5_priorities').length) errs.q4_5_priorities = 'Please select at least one priority'
      if (!get('q4_6_designStage')) errs.q4_6_designStage = 'Please select a design stage'
    }
    if (s === 5) {
      if (!get('q5_1_financialBenefit') || !get('q5_1_financialBenefit').length) errs.q5_1_financialBenefit = 'Please select at least one option'
    }
    return errs
  }

  function goNext() {
    const errs = validateSection(section)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setErrors({})
    setSection(s => s + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function goBack() {
    setErrors({})
    setSection(s => s - 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function clearAll() {
    if (confirm('Clear all answers and start again?')) {
      setAnswers({})
      setOptionalSections(['cost-estimate'])
      setErrors({})
      setSection(1)
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  async function handleSubmit() {
    const errs = validateSection(6)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    setLoading(true)
    msgRef.current = 0
    const interval = setInterval(() => {
      msgRef.current = (msgRef.current + 1) % LOADING_MESSAGES.length
      setLoadingMsg(LOADING_MESSAGES[msgRef.current])
    }, 2500)

    const allSections = [
      ...MANDATORY_SECTIONS.map(s => s.id),
      ...optionalSections,
    ]

    try {
      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, sections: allSections }),
      })
      const data = await res.json()
      clearInterval(interval)

      if (data.requiresConfirmation) {
        sessionStorage.setItem('estatesAI_contradictions', JSON.stringify({
          contradictions: data.contradictions,
          answers,
          sections: allSections,
        }))
        router.push('/contradiction')
        return
      }

      if (data.success) {
        sessionStorage.setItem('estatesAI_report', JSON.stringify({
          report: data.report,
          meta: data.meta,
          projectName: answers.q1_0_projectName,
        }))
        router.push('/report')
      } else {
        alert(`Error: ${data.error || 'Report generation failed. Please try again.'}`)
      }
    } catch (err) {
      clearInterval(interval)
      alert('Something went wrong. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const toggleOptional = (id) => {
    setOptionalSections(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
  }

  // ─── Section renderers ──────────────────────────────────────────────────────

  function renderSection1() {
    return (
      <>
        <QuestionBlock>
          <Label required>Q1.0 — Project Name</Label>
          <TextInput value={get('q1_0_projectName')} onChange={v => set('q1_0_projectName', v)} placeholder="e.g. Bramall Music Building Refurbishment" />
          <FieldError msg={errors.q1_0_projectName} />
        </QuestionBlock>

        <QuestionBlock>
          <Label required>Q1.1 — Project Postcode</Label>
          <TextInput value={get('q1_1_postcode')} onChange={v => set('q1_1_postcode', v)} placeholder="e.g. B15 2TT" className="max-w-xs" />
          <FieldError msg={errors.q1_1_postcode} />
        </QuestionBlock>

        <QuestionBlock>
          <Label required>Q1.2 — Project Type</Label>
          <RadioGroup options={PROJECT_TYPES} value={get('q1_2_projectType')} onChange={v => { set('q1_2_projectType', v); set('q1_3_buildingUse', '') }} />
          <FieldError msg={errors.q1_2_projectType} />
        </QuestionBlock>

        {projectType && (
          <QuestionBlock>
            <Label required>Q1.3 — Building Use and Type</Label>
            <select
              value={get('q1_3_buildingUse') || ''}
              onChange={e => set('q1_3_buildingUse', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
            >
              <option value="">Select...</option>
              {getBuildingUseOptions(projectType).map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <FieldError msg={errors.q1_3_buildingUse} />
          </QuestionBlock>
        )}

        {isResidential && (
          <QuestionBlock>
            <Label>Q1.3a — Number of Residential Units</Label>
            <NumberInput value={get('q1_3a_units')} onChange={v => set('q1_3a_units', v)} placeholder="e.g. 24" min="1" />
          </QuestionBlock>
        )}

        {isNewBuild && (
          <QuestionBlock>
            <Label>Q1.3b — Number of Storeys</Label>
            <RadioGroup options={STOREYS} value={get('q1_3b_storeys')} onChange={v => set('q1_3b_storeys', v)} />
          </QuestionBlock>
        )}

        {!isNewBuild && !isExternalWorks && (
          <QuestionBlock>
            <Label required>Q1.4 — Building Age</Label>
            <RadioGroup options={BUILDING_AGES} value={get('q1_4_buildingAge')} onChange={v => set('q1_4_buildingAge', v)} />
            <FieldError msg={errors.q1_4_buildingAge} />
          </QuestionBlock>
        )}

        <QuestionBlock>
          <Label required>
            Q1.5 — {isExternalWorks ? 'Area (m²) or linear metres' : isRenewable ? 'Roof area (m²) or target system size (kWp)' : 'Gross Internal Floor Area (m²)'}
          </Label>
          <NumberInput value={get('q1_5_size')} onChange={v => set('q1_5_size', v)} placeholder="e.g. 1200" min="1" />
          <FieldError msg={errors.q1_5_size} />
        </QuestionBlock>
      </>
    )
  }

  function renderSection2() {
    return (
      <>
        <QuestionBlock>
          <Label required>Q2.1 — Project Objective</Label>
          <Textarea
            value={get('q2_1_objective')}
            onChange={v => set('q2_1_objective', v)}
            placeholder="Describe: (1) what problem you are solving, (2) what the space will be used for when complete, and (3) any specific outcomes. 3–5 sentences gives the best results."
            rows={5}
          />
          <FieldError msg={errors.q2_1_objective} />
        </QuestionBlock>

        <QuestionBlock>
          <Label required>Q2.2 — Scope of Works</Label>
          <p className="text-xs text-gray-500 mb-3">Tick everything that applies — you can refine later.</p>
          <GroupedCheckboxes groups={filteredScopeGroups} values={get('q2_2_scopeItems')} onChange={v => set('q2_2_scopeItems', v)} />
          <FieldError msg={errors.q2_2_scopeItems} />
        </QuestionBlock>

        {isRefurb && !isDemolition && (
          <QuestionBlock>
            <Label>Q2.3 — Level of Intervention</Label>
            <RadioGroup
              options={['Light touch', 'Full refurbishment', 'Complete strip-out']}
              value={get('q2_3_interventionLevel')}
              onChange={v => set('q2_3_interventionLevel', v)}
            />
          </QuestionBlock>
        )}

        <QuestionBlock>
          <Label>Q2.4 — Standards to be Met (optional)</Label>
          <CheckboxGroup options={STANDARDS} values={get('q2_4_standards')} onChange={v => set('q2_4_standards', v)} />
        </QuestionBlock>

        <QuestionBlock>
          <Label>Q2.5 — Upload Supporting Documents (optional)</Label>
          <p className="text-xs text-gray-500 mb-2">Accepted: JPG, PNG, PDF. Max 10 files. Note: uploads are for your reference — documents are not sent to the AI in this version.</p>
          <input type="file" multiple accept=".jpg,.jpeg,.png,.pdf" className="text-sm text-gray-600" />
        </QuestionBlock>
      </>
    )
  }

  function renderSection3() {
    const knownIssues = isNewBuild ? KNOWN_ISSUES_NEWBUILD : KNOWN_ISSUES_REFURB
    return (
      <>
        <QuestionBlock>
          <Label required>Q3.1 — Known Issues</Label>
          <CheckboxGroup options={knownIssues} values={get('q3_1_knownIssues')} onChange={v => set('q3_1_knownIssues', v)} />
          <FieldError msg={errors.q3_1_knownIssues} />
        </QuestionBlock>

        {!isNewBuild && (
          <QuestionBlock>
            <Label>Q3.2 — Recent Works (optional)</Label>
            <Textarea
              value={get('q3_2_recentWorks')}
              onChange={v => set('q3_2_recentWorks', v)}
              placeholder="Describe any significant work completed in the last 5 years, with approximate year"
            />
          </QuestionBlock>
        )}

        <QuestionBlock>
          <Label>Q3.3 — Existing Surveys Available (optional)</Label>
          <CheckboxGroup options={SURVEYS} values={get('q3_3_surveys')} onChange={v => set('q3_3_surveys', v)} />
        </QuestionBlock>

        <QuestionBlock>
          <Label required>Q3.4 — Planning Consents</Label>
          <CheckboxGroup options={PLANNING_CONSENTS} values={get('q3_4_planningConsents')} onChange={v => set('q3_4_planningConsents', v)} />
          <FieldError msg={errors.q3_4_planningConsents} />
        </QuestionBlock>

        <QuestionBlock>
          <Label>Q3.5 — Access Constraints (optional)</Label>
          <CheckboxGroup options={ACCESS_CONSTRAINTS} values={get('q3_5_accessConstraints')} onChange={v => set('q3_5_accessConstraints', v)} />
        </QuestionBlock>

        <QuestionBlock>
          <Label required>Q3.6 — Occupation During Works</Label>
          <RadioGroup options={OCCUPATION} value={get('q3_6_occupation')} onChange={v => set('q3_6_occupation', v)} />
          <FieldError msg={errors.q3_6_occupation} />
        </QuestionBlock>

        <QuestionBlock>
          <Label>Q3.7 — Additional Context (optional)</Label>
          <Textarea
            value={get('q3_7_additionalContext')}
            onChange={v => set('q3_7_additionalContext', v)}
            placeholder="Anything unusual about this site? Listed building, flood risk, campus setting, shared ownership..."
          />
        </QuestionBlock>
      </>
    )
  }

  function renderSection4() {
    return (
      <>
        <QuestionBlock>
          <Label required>Q4.1 — Target Completion Date</Label>
          <Textarea
            value={get('q4_1_targetDate')}
            onChange={v => set('q4_1_targetDate', v)}
            placeholder="e.g. Summer 2027, or 'No hard deadline — subject to funding approval'"
            rows={2}
          />
          <FieldError msg={errors.q4_1_targetDate} />
        </QuestionBlock>

        <QuestionBlock>
          <Label required>Q4.2 — Do you have a budget in mind?</Label>
          <RadioGroup
            options={['Yes — I have a budget figure in mind', 'No — budget to be determined from this report']}
            value={get('q4_2_budgetKnown')}
            onChange={v => set('q4_2_budgetKnown', v)}
          />
          <FieldError msg={errors.q4_2_budgetKnown} />
        </QuestionBlock>

        {budgetKnown === 'Yes — I have a budget figure in mind' && (
          <>
            <QuestionBlock>
              <Label>Q4.3 — Budget Figure (£)</Label>
              <NumberInput value={get('q4_3_budgetFigure')} onChange={v => set('q4_3_budgetFigure', v)} placeholder="e.g. 2500000" min="0" />
            </QuestionBlock>
            <QuestionBlock>
              <Label>Q4.3 — Budget Includes</Label>
              <CheckboxGroup options={BUDGET_INCLUDES} values={get('q4_3_budgetIncludes')} onChange={v => set('q4_3_budgetIncludes', v)} />
            </QuestionBlock>
          </>
        )}

        <QuestionBlock>
          <Label>Q4.4 — Anything else we should know? (optional)</Label>
          <Textarea value={get('q4_4_anythingElse')} onChange={v => set('q4_4_anythingElse', v)} placeholder="Any other constraints, requirements or context..." />
        </QuestionBlock>

        <QuestionBlock>
          <Label required>Q4.5 — Project Priorities</Label>
          <CheckboxGroup options={PRIORITIES} values={get('q4_5_priorities')} onChange={v => set('q4_5_priorities', v)} />
          <FieldError msg={errors.q4_5_priorities} />
        </QuestionBlock>

        <QuestionBlock>
          <Label required>Q4.6 — Current Design Stage</Label>
          <RadioGroup options={DESIGN_STAGES} value={get('q4_6_designStage')} onChange={v => set('q4_6_designStage', v)} />
          <FieldError msg={errors.q4_6_designStage} />
        </QuestionBlock>

        {projectSize > 1000 && (
          <QuestionBlock>
            <Label>Q4.7 — Phasing</Label>
            <RadioGroup
              options={['Single phase', 'Multiple phases']}
              value={get('q4_7_phasing')}
              onChange={v => set('q4_7_phasing', v)}
            />
          </QuestionBlock>
        )}

        {(Array.isArray(scopeItems) && scopeItems.some(i =>
          ['Laboratory fit-out', 'Clinical fit-out', 'Data centre / server room fit-out', 'High voltage electrical supply required'].includes(i)
        )) && (
          <QuestionBlock>
            <Label>Q4.8 — Utilities Constraints (optional)</Label>
            <CheckboxGroup options={UTILITIES} values={get('q4_8_utilities')} onChange={v => set('q4_8_utilities', v)} />
          </QuestionBlock>
        )}

        <QuestionBlock>
          <Label>Q4.9 — Funding Source (optional)</Label>
          <CheckboxGroup options={FUNDING_SOURCES} values={get('q4_9_funding')} onChange={v => set('q4_9_funding', v)} />
        </QuestionBlock>
      </>
    )
  }

  function renderSection5() {
    return (
      <>
        <QuestionBlock>
          <Label required>Q5.1 — Financial Benefit of this Project</Label>
          <CheckboxGroup options={FINANCIAL_BENEFITS} values={get('q5_1_financialBenefit')} onChange={v => set('q5_1_financialBenefit', v)} />
          <FieldError msg={errors.q5_1_financialBenefit} />
        </QuestionBlock>

        {showROI && financialBenefit.length > 0 && !financialBenefit.every(f => f === 'No direct financial return') && (
          <QuestionBlock>
            <Label>Q5.2 — Estimated Annual Financial Benefit (optional)</Label>
            <Textarea
              value={get('q5_2_annualBenefit')}
              onChange={v => set('q5_2_annualBenefit', v)}
              placeholder="e.g. £120,000 per year in reduced energy costs, or 200 additional student places generating £2M additional income"
              rows={3}
            />
          </QuestionBlock>
        )}
      </>
    )
  }

  function renderSection6() {
    const roiBlocked = financialBenefit.length > 0 && financialBenefit.every(f => f === 'No direct financial return')
    return (
      <>
        <div className="mb-6">
          <p className="text-sm font-medium text-gray-800 mb-3">Mandatory Sections (always included)</p>
          <div className="flex flex-col gap-2">
            {MANDATORY_SECTIONS.map(s => (
              <label key={s.id} className="flex items-center gap-2.5 opacity-60 cursor-not-allowed">
                <input type="checkbox" checked readOnly className="w-4 h-4 text-[#2E75B6] rounded" />
                <span className="text-sm text-gray-700">{s.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <p className="text-sm font-medium text-gray-800 mb-3">Optional Sections (choose what you need)</p>
          <div className="flex flex-col gap-2">
            {OPTIONAL_SECTIONS.map(s => {
              const blocked = s.id === 'roi' && roiBlocked
              return (
                <label key={s.id} className={`flex items-center gap-2.5 ${blocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    checked={!blocked && optionalSections.includes(s.id)}
                    disabled={blocked}
                    onChange={() => !blocked && toggleOptional(s.id)}
                    className="w-4 h-4 text-[#2E75B6] rounded"
                  />
                  <span className="text-sm text-gray-700">
                    {s.label}
                    {blocked && <span className="ml-2 text-xs text-gray-400">(not applicable — no financial return identified)</span>}
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        <QuestionBlock>
          <Label>Q6.2 — Additional Instructions for the Report (optional)</Label>
          <Textarea
            value={get('q6_2_reportInstructions')}
            onChange={v => set('q6_2_reportInstructions', v)}
            placeholder="e.g. Write for a non-technical audience. Focus on sustainability outcomes. Avoid technical jargon."
            rows={3}
          />
        </QuestionBlock>
      </>
    )
  }

  const currentSection = SECTIONS[section - 1]

  return (
    <div className="min-h-screen bg-gray-50">
      {loading && <LoadingOverlay message={loadingMsg} />}

      {/* Header */}
      <header className="bg-[#1F3864] text-white px-4 py-3 sticky top-0 z-10 shadow">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#2E75B6] rounded flex items-center justify-center text-white font-bold text-xs">AI</div>
            <span className="font-semibold text-sm">Estates AI Tool</span>
          </div>
          <button onClick={clearAll} className="text-xs text-blue-300 hover:text-white transition-colors">
            Clear & start again
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <ProgressBar current={section} total={6} />

        {/* Section header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-[#1F3864]">{currentSection.title}</h1>
          <p className="text-sm text-gray-500 mt-1">{currentSection.subtitle}</p>
        </div>

        {/* Validation summary */}
        {Object.keys(errors).length > 0 && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm font-medium text-red-700">Please complete the required fields before continuing.</p>
          </div>
        )}

        {/* Section content */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {section === 1 && renderSection1()}
          {section === 2 && renderSection2()}
          {section === 3 && renderSection3()}
          {section === 4 && renderSection4()}
          {section === 5 && renderSection5()}
          {section === 6 && renderSection6()}
        </div>

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between gap-4">
          {section > 1 ? (
            <button
              onClick={goBack}
              className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Back
            </button>
          ) : <div />}

          {section < 6 ? (
            <button
              onClick={goNext}
              className="px-6 py-2.5 bg-[#2E75B6] hover:bg-[#1F5C99] text-white rounded-lg text-sm font-medium transition-colors"
            >
              Next Section
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="px-8 py-3 bg-[#1F3864] hover:bg-[#162a4e] text-white rounded-lg text-base font-semibold transition-colors shadow"
            >
              Generate My Report
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
