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
  'Calculating NRM1 cost estimate...',
  'Building your risk register...',
  'Generating programme timeline...',
  'Preparing your feasibility report...',
]

// ─── Section 1 ───────────────────────────────────────────────────────────────

const PROJECT_TYPES = ['New Build', 'Refurbishment', 'Fit-Out', 'Extension', 'External Works', 'Renewable Energy', 'Demolition', 'Mixed']

const BUILDING_USE_OPTIONS = [
  'Residential',
  'Office / Commercial',
  'Education',
  'Healthcare',
  'Retail',
  'Industrial / Warehouse',
  'Specialist',
  'Mixed Use',
]

const RESIDENTIAL_SUBTYPES = [
  'Flat or apartment',
  'House',
  'HMO or shared housing',
  'Student accommodation',
]

const SPECIALIST_SUBTYPES = [
  'Laboratory',
  'Data centre',
  'Theatre or performance space',
  'Clinical healthcare',
  'Other specialist',
]

const BUILDING_AGES = ['Pre-1900', '1900–1945', '1945–1980', '1980–2000', 'Post-2000']
const STOREYS = ['Single storey', '2–4 storeys', '5–10 storeys', '10+ storeys']

// ─── Section 2 ───────────────────────────────────────────────────────────────

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
      'Structural frame (steel, concrete, or timber)',
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
      'External works and landscaping',
      'Car parking',
    ],
  },
  {
    group: 'MECHANICAL SERVICES',
    items: [
      'Heating system (new or replacement)',
      'Ventilation or air handling',
      'Air conditioning or cooling',
      'Plumbing — first fix (pipework and drainage)',
      'Plumbing — second fix (sanitary fittings and taps)',
      'Sprinkler or fire suppression system',
      'Gas installation',
    ],
  },
  {
    group: 'ELECTRICAL SERVICES',
    items: [
      'Electrical distribution and main switchgear',
      'Electrical wiring — first fix',
      'Electrical fittings and lighting — second fix',
      'Emergency lighting and fire alarm',
      'External lighting',
      'Solar PV or renewable energy',
      'EV charging points',
    ],
  },
  {
    group: 'INTERNAL FIT-OUT & FINISHES',
    note: 'Loose furniture and white goods are excluded',
    items: [
      'Internal partitions and walls',
      'Internal doors and ironmongery',
      'Ceilings (new or replacement)',
      'Flooring (new or replacement)',
      'Redecoration (walls and ceilings)',
      'Joinery and built-in furniture',
      'Kitchen or break-out area',
      'Toilets or wet rooms',
    ],
  },
  {
    group: 'TECHNOLOGY & DATA',
    items: [
      'IT infrastructure and data cabling',
      'Access control and security systems',
      'CCTV',
    ],
  },
  {
    group: 'ACCESSIBILITY',
    items: [
      'Lift or platform lift',
      'Accessible toilet or changing facilities',
      'Ramps or level access works',
      'Wayfinding and signage',
    ],
  },
]

// Conditional scope items that depend on other answers
const CONDITIONAL_SCOPE = {
  'Battery storage system': (answers) => {
    const type = answers.q1_2_projectType || ''
    const scope = answers.q2_2_scopeItems || []
    return type === 'Renewable Energy' || scope.includes('Solar PV or renewable energy')
  },
  'Grid connection upgrade or DNO approval': (answers) => {
    const scope = answers.q2_2_scopeItems || []
    return scope.includes('Solar PV or renewable energy') || scope.includes('Battery storage system')
  },
  'Building energy management system (BEMS)': (answers) => {
    const type = answers.q1_2_projectType || ''
    return type === 'Renewable Energy'
  },
  'AV systems': (answers) => {
    const use = answers.q1_3_buildingUse || ''
    return ['Education', 'Healthcare', 'Specialist'].includes(use)
  },
  'Laboratory fit-out': (answers) => {
    const use = answers.q1_3_buildingUse || ''
    const sub = answers.q1_3_buildingSubtype || ''
    return use === 'Specialist' || sub === 'Laboratory'
  },
  'Clinical or healthcare fit-out': (answers) => {
    const use = answers.q1_3_buildingUse || ''
    const sub = answers.q1_3_buildingSubtype || ''
    return use === 'Healthcare' || sub === 'Clinical healthcare'
  },
  'Data centre or server room': (answers) => {
    const use = answers.q1_3_buildingUse || ''
    const sub = answers.q1_3_buildingSubtype || ''
    return use === 'Specialist' || sub === 'Data centre'
  },
}

const NATURE_OF_WORKS_OPTIONS = [
  'Like-for-like replacement — same layout, same use, replacing worn elements with equivalent new ones',
  'Improvement within existing layout — same layout retained, elements upgraded, services improved',
  'Reconfiguration or change of use — layout changes or space repurposed, new design required',
  'Complete repurpose — space fundamentally transformed, new layout, new use, new services strategy',
]

const SPEC_LEVEL_OPTIONS = [
  { value: 'Budget — functional and durable, standard materials, minimal design', label: 'Budget', tag: 'Lowest cost', detail: 'Functional and durable, standard materials, minimal design' },
  { value: 'Standard — good quality finish appropriate for the building and its users', label: 'Standard', tag: 'Mid-range cost', detail: 'Good quality finish appropriate for the building and its users' },
  { value: 'Enhanced — above-standard quality, considered design, some bespoke elements', label: 'Enhanced', tag: 'Above mid-range cost', detail: 'Above-standard quality, considered design, some bespoke elements' },
  { value: 'Prestige — premium finish, bespoke design, specialist contractors throughout', label: 'Prestige', tag: 'Highest cost', detail: 'Premium finish, bespoke design, specialist contractors throughout' },
]

// ─── Section 3 ───────────────────────────────────────────────────────────────

const KNOWN_ISSUES_REFURB = [
  'Asbestos known or suspected',
  'Structural concerns',
  'Ageing or inadequate M&E and power supply',
  'Damp or water ingress',
  'Drainage issues',
  'Fire safety deficiencies',
  'Roof condition poor or unknown',
  'Contaminated land',
  'None identified',
  'Unsure — surveys will be needed',
]

const KNOWN_ISSUES_NEWBUILD = [
  'Poor or unknown ground conditions',
  'High water table',
  'Contaminated land',
  'Existing underground infrastructure present',
  'None identified',
  'Unsure — surveys will be needed',
]

const SURVEYS = [
  'Asbestos register',
  'Structural survey',
  'Condition survey',
  'Topographic or measured building survey',
  'Ground investigation report',
  'Energy audit',
  'Fire risk assessment',
  'None — surveys will be needed',
]

const PLANNING_CONSENTS = [
  'Full planning permission',
  'Listed Building Consent',
  'Prior approval',
  'Change of use consent',
  'Permitted development — no consent needed',
  'Unsure — pre-application advice needed',
]

const ACCESS_CONSTRAINTS = [
  'No vehicle access to site',
  'Restricted working hours',
  'Shared access with other occupiers',
  'Height or weight restrictions on access routes',
  'Scaffold licence required from highway authority',
  'Works only permitted outside term time or business hours',
  'No significant access constraints',
]

const OCCUPATION_OPTIONS = [
  'Fully occupied throughout',
  'Partially occupied — phased works required',
  'Full decant required before works can start',
  'Currently vacant',
  'Not applicable',
]

// ─── Section 4 ───────────────────────────────────────────────────────────────

const BUDGET_INCLUDES = [
  'Includes professional fees',
  'Includes VAT',
  'Includes contingency',
  'Construction cost only',
]

const PRIORITIES = [
  'Keeping costs as low as possible',
  'Fixed price and cost certainty',
  'Completing as quickly as possible',
  'High quality design and finish',
  'Minimising disruption to the building or occupants',
  'Meeting a funder or compliance deadline',
]

const DESIGN_STAGES = [
  'No design work done yet — concept only',
  'Early design started — brief or sketch drawings only',
  'Concept design complete (RIBA Stage 2)',
  'Developed design complete (RIBA Stage 3)',
  'Full technical design complete (RIBA Stage 4)',
]

const UTILITIES_OPTIONS = [
  'Electrical capacity limited or unknown',
  'Gas supply limited or unknown',
  'Drainage capacity limited or unknown',
  'Water supply limited or unknown',
  'No known constraints',
  'Not applicable',
]

const FUNDING_SOURCES = [
  'Internal capital budget',
  'Internal maintenance or revenue budget',
  'External grant (e.g. Salix, UKRI, heritage funding)',
  'Commercial loan or private finance',
  'Combination of sources',
  'Not yet confirmed',
]

// ─── Section 5 ───────────────────────────────────────────────────────────────

const FINANCIAL_BENEFITS = [
  'Rental or commercial income',
  'Energy or operational cost savings',
  'Grant or funding unlock',
  'Avoidance of statutory penalty or compliance cost',
  'Increased asset value',
  'No direct financial return — strategic or compliance project',
]

// ─── Section 6 ───────────────────────────────────────────────────────────────

const MANDATORY_SECTIONS = [
  { id: 'executive-summary', label: 'Executive Summary' },
  { id: 'scope-of-works', label: 'Scope of Works' },
  { id: 'risk-register', label: 'Top Risks Register' },
  { id: 'programme', label: 'High-Level Programme' },
  { id: 'recommendations', label: 'Recommendations & Next Steps' },
]

const OPTIONAL_SECTIONS = [
  { id: 'cost-estimate', label: 'Order of Cost Estimate (NRM1)' },
  { id: 'roi', label: 'ROI & Financial Case' },
  { id: 'procurement', label: 'Procurement Recommendation' },
  { id: 'constraints', label: 'Constraints Summary' },
]

// ─── Helper components ────────────────────────────────────────────────────────

function Label({ children, required }) {
  return (
    <label className="block font-bold mb-1.5" style={{ color: '#1F3864', fontSize: '16px' }}>
      {children}
      {required && <span style={{ color: '#C00000' }} className="ml-1">*</span>}
    </label>
  )
}

function HelpText({ children }) {
  return (
    <p className="mb-2 italic" style={{ color: '#444444', fontSize: '14px' }}>{children}</p>
  )
}

function FieldError({ msg }) {
  if (!msg) return null
  return <p className="mt-1 text-sm font-medium" style={{ color: '#C00000' }}>{msg}</p>
}

function TextInput({ value, onChange, placeholder, className = '' }) {
  return (
    <input
      type="text"
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-[#2E75B6] ${className}`}
      style={{ border: '1px solid #CCCCCC', minHeight: '48px', color: '#1A1A1A', backgroundColor: '#FFFFFF', fontSize: '16px' }}
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
      className="w-full rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
      style={{ border: '1px solid #CCCCCC', minHeight: '48px', color: '#1A1A1A', backgroundColor: '#FFFFFF', fontSize: '16px' }}
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
      className="w-full rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-[#2E75B6] resize-none"
      style={{ border: '1px solid #CCCCCC', color: '#1A1A1A', backgroundColor: '#FFFFFF', fontSize: '16px', lineHeight: '1.6' }}
    />
  )
}

function SelectInput({ value, onChange, children }) {
  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      className="w-full rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
      style={{ border: '1px solid #CCCCCC', minHeight: '48px', color: value ? '#1A1A1A' : '#888888', backgroundColor: '#FFFFFF', fontSize: '16px' }}
    >
      {children}
    </select>
  )
}

function RadioGroup({ options, value, onChange, twoCol = false }) {
  return (
    <div className={twoCol ? 'grid grid-cols-2 gap-2' : 'flex flex-col gap-3'}>
      {options.map(opt => (
        <label key={opt} className="flex items-center gap-3 cursor-pointer" style={{ minHeight: '44px' }}>
          <input
            type="radio"
            value={opt}
            checked={value === opt}
            onChange={() => onChange(opt)}
            className="w-5 h-5 flex-shrink-0"
            style={{ accentColor: '#2E75B6' }}
          />
          <span style={{ color: '#1A1A1A', fontSize: '16px' }}>{opt}</span>
        </label>
      ))}
    </div>
  )
}

function SpecLevelRadio({ value, onChange }) {
  return (
    <div className="flex flex-col gap-3">
      {SPEC_LEVEL_OPTIONS.map(opt => (
        <label
          key={opt.value}
          className="flex items-start gap-3 cursor-pointer rounded-lg p-3"
          style={{
            border: value === opt.value ? '2px solid #2E75B6' : '1px solid #CCCCCC',
            backgroundColor: value === opt.value ? '#D5E8F0' : '#FFFFFF',
            minHeight: '44px',
          }}
        >
          <input
            type="radio"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="w-5 h-5 flex-shrink-0 mt-0.5"
            style={{ accentColor: '#2E75B6' }}
          />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold" style={{ color: '#1F3864', fontSize: '16px' }}>{opt.label}</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#1F3864', color: '#FFFFFF' }}>{opt.tag}</span>
            </div>
            <p style={{ color: '#444444', fontSize: '14px' }}>{opt.detail}</p>
          </div>
        </label>
      ))}
    </div>
  )
}

function CheckboxGroup({ options, values = [], onChange, note }) {
  const toggle = (opt) => {
    const arr = Array.isArray(values) ? values : []
    onChange(arr.includes(opt) ? arr.filter(v => v !== opt) : [...arr, opt])
  }
  return (
    <div className="flex flex-col gap-2">
      {note && <p className="text-sm mb-1 italic" style={{ color: '#444444' }}>{note}</p>}
      {options.map(opt => (
        <label key={opt} className="flex items-start gap-3 cursor-pointer" style={{ minHeight: '44px' }}>
          <input
            type="checkbox"
            checked={Array.isArray(values) && values.includes(opt)}
            onChange={() => toggle(opt)}
            className="w-5 h-5 flex-shrink-0 mt-0.5 rounded"
            style={{ accentColor: '#2E75B6' }}
          />
          <span style={{ color: '#1A1A1A', fontSize: '16px' }}>{opt}</span>
        </label>
      ))}
    </div>
  )
}

function CheckboxWithOther({ options, values = [], onChange, otherValue = '', onOtherChange, otherPlaceholder = 'Please describe...' }) {
  const toggle = (opt) => {
    const arr = Array.isArray(values) ? values : []
    onChange(arr.includes(opt) ? arr.filter(v => v !== opt) : [...arr, opt])
  }
  const otherChecked = Array.isArray(values) && values.includes('Other — please describe:')
  return (
    <div className="flex flex-col gap-2">
      {options.map(opt => (
        <label key={opt} className="flex items-start gap-3 cursor-pointer" style={{ minHeight: '44px' }}>
          <input
            type="checkbox"
            checked={Array.isArray(values) && values.includes(opt)}
            onChange={() => toggle(opt)}
            className="w-5 h-5 flex-shrink-0 mt-0.5 rounded"
            style={{ accentColor: '#2E75B6' }}
          />
          <span style={{ color: '#1A1A1A', fontSize: '16px' }}>{opt}</span>
        </label>
      ))}
      <label className="flex items-start gap-3 cursor-pointer" style={{ minHeight: '44px' }}>
        <input
          type="checkbox"
          checked={otherChecked}
          onChange={() => toggle('Other — please describe:')}
          className="w-5 h-5 flex-shrink-0 mt-0.5 rounded"
          style={{ accentColor: '#2E75B6' }}
        />
        <span style={{ color: '#1A1A1A', fontSize: '16px' }}>Other — please describe:</span>
      </label>
      {otherChecked && (
        <div className="ml-8">
          <TextInput value={otherValue} onChange={onOtherChange} placeholder={otherPlaceholder} />
        </div>
      )}
    </div>
  )
}

function GroupedScopeCheckboxes({ answers, values = [], onChange }) {
  const toggle = (opt) => {
    const arr = Array.isArray(values) ? values : []
    onChange(arr.includes(opt) ? arr.filter(v => v !== opt) : [...arr, opt])
  }

  const allGroups = [
    ...SCOPE_GROUPS,
    {
      group: 'ELECTRICAL SERVICES (conditional)',
      conditionalItems: [
        { key: 'Battery storage system', condition: CONDITIONAL_SCOPE['Battery storage system'] },
        { key: 'Grid connection upgrade or DNO approval', condition: CONDITIONAL_SCOPE['Grid connection upgrade or DNO approval'] },
        { key: 'Building energy management system (BEMS)', condition: CONDITIONAL_SCOPE['Building energy management system (BEMS)'] },
      ]
    },
    {
      group: 'TECHNOLOGY & DATA (conditional)',
      conditionalItems: [
        { key: 'AV systems', condition: CONDITIONAL_SCOPE['AV systems'] },
      ]
    },
    {
      group: 'INTERNAL FIT-OUT & FINISHES (conditional)',
      conditionalItems: [
        { key: 'Laboratory fit-out', condition: CONDITIONAL_SCOPE['Laboratory fit-out'] },
        { key: 'Clinical or healthcare fit-out', condition: CONDITIONAL_SCOPE['Clinical or healthcare fit-out'] },
        { key: 'Data centre or server room', condition: CONDITIONAL_SCOPE['Data centre or server room'] },
      ]
    }
  ]

  return (
    <div className="flex flex-col gap-6">
      {SCOPE_GROUPS.map(g => (
        <div key={g.group}>
          <p className="font-bold mb-2 pb-1" style={{ color: '#1F3864', fontSize: '14px', borderBottom: '1px solid #CCCCCC' }}>{g.group}</p>
          {g.note && <p className="text-sm mb-2 italic" style={{ color: '#444444' }}>{g.note}</p>}
          <div className="flex flex-col gap-2 pl-1">
            {g.items.map(opt => {
              const cond = CONDITIONAL_SCOPE[opt]
              if (cond && !cond(answers)) return null
              return (
                <label key={opt} className="flex items-start gap-3 cursor-pointer" style={{ minHeight: '44px' }}>
                  <input
                    type="checkbox"
                    checked={Array.isArray(values) && values.includes(opt)}
                    onChange={() => toggle(opt)}
                    className="w-5 h-5 flex-shrink-0 mt-0.5 rounded"
                    style={{ accentColor: '#2E75B6' }}
                  />
                  <span style={{ color: '#1A1A1A', fontSize: '16px' }}>{opt}</span>
                </label>
              )
            })}
            {/* Conditional extras that logically belong to this group */}
            {g.group === 'ELECTRICAL SERVICES' && (
              <>
                {CONDITIONAL_SCOPE['Battery storage system'](answers) && (
                  <label className="flex items-start gap-3 cursor-pointer" style={{ minHeight: '44px' }}>
                    <input type="checkbox" checked={values.includes('Battery storage system')} onChange={() => toggle('Battery storage system')} className="w-5 h-5 flex-shrink-0 mt-0.5 rounded" style={{ accentColor: '#2E75B6' }} />
                    <span style={{ color: '#1A1A1A', fontSize: '16px' }}>Battery storage system</span>
                  </label>
                )}
                {CONDITIONAL_SCOPE['Grid connection upgrade or DNO approval'](answers) && (
                  <label className="flex items-start gap-3 cursor-pointer" style={{ minHeight: '44px' }}>
                    <input type="checkbox" checked={values.includes('Grid connection upgrade or DNO approval')} onChange={() => toggle('Grid connection upgrade or DNO approval')} className="w-5 h-5 flex-shrink-0 mt-0.5 rounded" style={{ accentColor: '#2E75B6' }} />
                    <span style={{ color: '#1A1A1A', fontSize: '16px' }}>Grid connection upgrade or DNO approval</span>
                  </label>
                )}
                {CONDITIONAL_SCOPE['Building energy management system (BEMS)'](answers) && (
                  <label className="flex items-start gap-3 cursor-pointer" style={{ minHeight: '44px' }}>
                    <input type="checkbox" checked={values.includes('Building energy management system (BEMS)')} onChange={() => toggle('Building energy management system (BEMS)')} className="w-5 h-5 flex-shrink-0 mt-0.5 rounded" style={{ accentColor: '#2E75B6' }} />
                    <span style={{ color: '#1A1A1A', fontSize: '16px' }}>Building energy management system (BEMS)</span>
                  </label>
                )}
              </>
            )}
            {g.group === 'TECHNOLOGY & DATA' && CONDITIONAL_SCOPE['AV systems'](answers) && (
              <label className="flex items-start gap-3 cursor-pointer" style={{ minHeight: '44px' }}>
                <input type="checkbox" checked={values.includes('AV systems')} onChange={() => toggle('AV systems')} className="w-5 h-5 flex-shrink-0 mt-0.5 rounded" style={{ accentColor: '#2E75B6' }} />
                <span style={{ color: '#1A1A1A', fontSize: '16px' }}>AV systems</span>
              </label>
            )}
            {g.group === 'INTERNAL FIT-OUT & FINISHES' && (
              <>
                {CONDITIONAL_SCOPE['Laboratory fit-out'](answers) && (
                  <label className="flex items-start gap-3 cursor-pointer" style={{ minHeight: '44px' }}>
                    <input type="checkbox" checked={values.includes('Laboratory fit-out')} onChange={() => toggle('Laboratory fit-out')} className="w-5 h-5 flex-shrink-0 mt-0.5 rounded" style={{ accentColor: '#2E75B6' }} />
                    <span style={{ color: '#1A1A1A', fontSize: '16px' }}>Laboratory fit-out</span>
                  </label>
                )}
                {CONDITIONAL_SCOPE['Clinical or healthcare fit-out'](answers) && (
                  <label className="flex items-start gap-3 cursor-pointer" style={{ minHeight: '44px' }}>
                    <input type="checkbox" checked={values.includes('Clinical or healthcare fit-out')} onChange={() => toggle('Clinical or healthcare fit-out')} className="w-5 h-5 flex-shrink-0 mt-0.5 rounded" style={{ accentColor: '#2E75B6' }} />
                    <span style={{ color: '#1A1A1A', fontSize: '16px' }}>Clinical or healthcare fit-out</span>
                  </label>
                )}
                {CONDITIONAL_SCOPE['Data centre or server room'](answers) && (
                  <label className="flex items-start gap-3 cursor-pointer" style={{ minHeight: '44px' }}>
                    <input type="checkbox" checked={values.includes('Data centre or server room')} onChange={() => toggle('Data centre or server room')} className="w-5 h-5 flex-shrink-0 mt-0.5 rounded" style={{ accentColor: '#2E75B6' }} />
                    <span style={{ color: '#1A1A1A', fontSize: '16px' }}>Data centre or server room</span>
                  </label>
                )}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function QuestionCard({ children }) {
  return (
    <div className="mb-6 p-4 rounded-lg" style={{ border: '1px solid #CCCCCC', backgroundColor: '#FFFFFF', borderRadius: '8px' }}>
      {children}
    </div>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ current, total }) {
  const pct = Math.round((current / total) * 100)
  const sectionName = SECTIONS[current - 1]?.title || ''
  return (
    <div className="mb-6">
      <div className="flex justify-between mb-1.5" style={{ fontSize: '14px', color: '#1A1A1A' }}>
        <span className="font-medium">Section {current} of {total} — {sectionName}</span>
        <span>{pct}%</span>
      </div>
      <div className="w-full rounded-full h-3" style={{ backgroundColor: '#D5E8F0' }}>
        <div
          className="h-3 rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: '#2E75B6' }}
        />
      </div>
    </div>
  )
}

// ─── Loading overlay ──────────────────────────────────────────────────────────

function LoadingOverlay({ message }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: '#1F3864', opacity: 0.97 }}>
      <div className="text-center px-6" style={{ color: '#FFFFFF' }}>
        <div className="mb-6">
          <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto" style={{ borderTopColor: 'transparent' }} />
        </div>
        <h2 className="text-xl font-semibold mb-3">Generating Your Report</h2>
        <p style={{ color: '#D5E8F0', fontSize: '16px' }}>{message}</p>
      </div>
    </div>
  )
}

// ─── Substitute "Other" text into answer arrays before API call ───────────────

function substituteOtherAnswers(answers) {
  const result = { ...answers }
  const otherFields = [
    'q3_3_surveys',
    'q3_5_accessConstraints',
    'q4_5_priorities',
    'q4_9_funding',
    'q5_1_financialBenefit',
  ]
  for (const field of otherFields) {
    if (Array.isArray(result[field]) && result[field].includes('Other — please describe:')) {
      const text = result[`${field}Other`]
      if (text) {
        result[field] = result[field].map(v =>
          v === 'Other — please describe:' ? `Other: ${text}` : v
        )
      }
    }
  }
  return result
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
  const [savedBanner, setSavedBanner] = useState(false)
  const msgRef = useRef(0)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.answers && Object.keys(parsed.answers).length > 0) {
          setAnswers(parsed.answers || {})
          setOptionalSections(parsed.optionalSections || ['cost-estimate'])
          setSavedBanner(true)
        }
      }
    } catch {}
  }, [])

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
  const showNatureAndSpec = ['Refurbishment', 'Fit-Out', 'Extension', 'Mixed'].includes(projectType)

  const buildingUse = get('q1_3_buildingUse') || ''
  const isResidential = buildingUse === 'Residential'
  const isSpecialist = buildingUse === 'Specialist'
  const showSubtype = isResidential || isSpecialist

  const scopeItems = get('q2_2_scopeItems') || []
  const projectSize = parseFloat(get('q1_5_size') || '0')
  const financialBenefit = get('q5_1_financialBenefit') || []
  const budgetFigure = get('q4_2_budgetFigure') || ''

  const showUtilities = Array.isArray(scopeItems) && scopeItems.some(i =>
    ['Laboratory fit-out', 'Clinical or healthcare fit-out', 'Data centre or server room',
     'Kitchen or break-out area', 'EV charging points', 'Solar PV or renewable energy',
     'Battery storage system', 'Grid connection upgrade or DNO approval', 'Lift or platform lift'].includes(i)
  )

  const showROIAmount = financialBenefit.length > 0 &&
    !financialBenefit.every(f => f === 'No direct financial return — strategic or compliance project')

  // ─── Validation ─────────────────────────────────────────────────────────────

  function validateSection(s) {
    const errs = {}
    if (s === 1) {
      if (!get('q1_0_projectName')) errs.q1_0_projectName = 'Project name is required'
      if (!get('q1_1_postcode')) errs.q1_1_postcode = 'Postcode is required'
      if (!get('q1_2_projectType')) errs.q1_2_projectType = 'Please select a project type'
      if (!get('q1_3_buildingUse')) errs.q1_3_buildingUse = 'Please select a building use'
      if (!isNewBuild && !isExternalWorks && !isDemolition && !get('q1_4_buildingAge')) errs.q1_4_buildingAge = 'Building age is required'
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
      setSavedBanner(false)
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  async function handleSubmit() {
    setLoading(true)
    msgRef.current = 0
    const interval = setInterval(() => {
      msgRef.current = (msgRef.current + 1) % LOADING_MESSAGES.length
      setLoadingMsg(LOADING_MESSAGES[msgRef.current])
    }, 3000)

    const allSections = [
      ...MANDATORY_SECTIONS.map(s => s.id),
      ...optionalSections,
    ]

    const processedAnswers = substituteOtherAnswers(answers)

    try {
      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: processedAnswers, sections: allSections }),
      })
      const data = await res.json()
      clearInterval(interval)

      if (data.requiresConfirmation) {
        sessionStorage.setItem('estatesAI_contradictions', JSON.stringify({
          contradictions: data.contradictions,
          answers: processedAnswers,
          sections: allSections,
        }))
        router.push('/contradiction')
        return
      }

      if (data.success) {
        sessionStorage.setItem('estatesAI_report', JSON.stringify({
          reportText: data.report,
          intel: data.intel,
          answers: processedAnswers,
          reportSections: allSections,
          meta: data.meta,
        }))
        router.push('/report')
      } else {
        alert(`Error: ${data.error || 'Report generation failed. Please try again.'}`)
      }
    } catch {
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

  // ─── Section renderers ────────────────────────────────────────────────────

  function renderSection1() {
    return (
      <>
        <QuestionCard>
          <Label required>Q1.0 — Project Name</Label>
          <TextInput
            value={get('q1_0_projectName')}
            onChange={v => set('q1_0_projectName', v)}
            placeholder="e.g. Block C Refurbishment — Westwood Campus"
          />
          <FieldError msg={errors.q1_0_projectName} />
        </QuestionCard>

        <QuestionCard>
          <Label required>Q1.1 — Postcode</Label>
          <HelpText>Used to apply the correct regional cost factor to your estimate</HelpText>
          <TextInput
            value={get('q1_1_postcode')}
            onChange={v => set('q1_1_postcode', v)}
            placeholder="e.g. CV4 7AL"
            className="max-w-xs"
          />
          <FieldError msg={errors.q1_1_postcode} />
        </QuestionCard>

        <QuestionCard>
          <Label required>Q1.2 — Project Type</Label>
          <RadioGroup options={PROJECT_TYPES} value={get('q1_2_projectType')} onChange={v => {
            set('q1_2_projectType', v)
            set('q1_4_buildingAge', '')
            set('q1_3b_storeys', '')
          }} twoCol />
          <FieldError msg={errors.q1_2_projectType} />
        </QuestionCard>

        {projectType && (
          <QuestionCard>
            <Label required>Q1.3 — Building Use</Label>
            <SelectInput value={get('q1_3_buildingUse')} onChange={v => {
              set('q1_3_buildingUse', v)
              set('q1_3_buildingSubtype', '')
            }}>
              <option value="">Select building use...</option>
              {BUILDING_USE_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </SelectInput>
            <FieldError msg={errors.q1_3_buildingUse} />

            {showSubtype && (
              <div className="mt-3">
                <SelectInput value={get('q1_3_buildingSubtype')} onChange={v => set('q1_3_buildingSubtype', v)}>
                  <option value="">Select sub-type...</option>
                  {(isResidential ? RESIDENTIAL_SUBTYPES : SPECIALIST_SUBTYPES).map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </SelectInput>
              </div>
            )}
          </QuestionCard>
        )}

        {isResidential && (
          <QuestionCard>
            <Label>Q1.3a — Number of Residential Units</Label>
            <HelpText>Enter total number of flats or units if this project covers more than one</HelpText>
            <NumberInput value={get('q1_3a_units')} onChange={v => set('q1_3a_units', v)} placeholder="e.g. 24" min="1" />
          </QuestionCard>
        )}

        {isNewBuild && (
          <QuestionCard>
            <Label>Q1.3b — Number of Storeys</Label>
            <RadioGroup options={STOREYS} value={get('q1_3b_storeys')} onChange={v => set('q1_3b_storeys', v)} />
          </QuestionCard>
        )}

        {!isNewBuild && !isExternalWorks && !isDemolition && (
          <QuestionCard>
            <Label required>Q1.4 — Approximate Age of Building</Label>
            <HelpText>Buildings constructed before 2000 require asbestos to be considered under CAR 2012</HelpText>
            <RadioGroup options={BUILDING_AGES} value={get('q1_4_buildingAge')} onChange={v => set('q1_4_buildingAge', v)} />
            <FieldError msg={errors.q1_4_buildingAge} />
          </QuestionCard>
        )}

        <QuestionCard>
          <Label required>
            Q1.5 —{' '}
            {isExternalWorks ? 'Area m² or linear metres' :
             isRenewable ? 'Roof area m² or target system size kWp' :
             'Gross Internal Floor Area (GIFA) m²'}
          </Label>
          <NumberInput value={get('q1_5_size')} onChange={v => set('q1_5_size', v)} placeholder="e.g. 250" min="1" />
          <FieldError msg={errors.q1_5_size} />
        </QuestionCard>
      </>
    )
  }

  function renderSection2() {
    return (
      <>
        <QuestionCard>
          <Label required>Q2.1 — Project Objective</Label>
          <Textarea
            value={get('q2_1_objective')}
            onChange={v => set('q2_1_objective', v)}
            placeholder="Describe: (1) the problem you are solving, (2) what the space will be used for when complete, and (3) any specific outcomes you need to achieve. 3–5 sentences gives the best results."
            rows={5}
          />
          <FieldError msg={errors.q2_1_objective} />
        </QuestionCard>

        <QuestionCard>
          <Label required>Q2.2 — Scope of Works</Label>
          <HelpText>Tick everything that applies to this project</HelpText>
          <GroupedScopeCheckboxes answers={answers} values={get('q2_2_scopeItems')} onChange={v => set('q2_2_scopeItems', v)} />
          <FieldError msg={errors.q2_2_scopeItems} />
        </QuestionCard>

        {showNatureAndSpec && (
          <>
            <QuestionCard>
              <Label required>Q2.3a — Nature of Works</Label>
              <HelpText>Which best describes what you are doing to this space?</HelpText>
              <RadioGroup
                options={NATURE_OF_WORKS_OPTIONS}
                value={get('q2_3a_natureOfWorks')}
                onChange={v => set('q2_3a_natureOfWorks', v)}
              />
            </QuestionCard>

            <QuestionCard>
              <Label required>Q2.3b — Specification Level</Label>
              <HelpText>This directly affects your cost estimate — select the option that best matches your quality expectations</HelpText>
              <SpecLevelRadio value={get('q2_3b_specLevel')} onChange={v => set('q2_3b_specLevel', v)} />
            </QuestionCard>
          </>
        )}

        <QuestionCard>
          <Label>Q2.4 — Standards and Requirements (optional)</Label>
          <HelpText>Are there any specific standards, certifications, or requirements this project must meet?</HelpText>
          <Textarea
            value={get('q2_4_standards')}
            onChange={v => set('q2_4_standards', v)}
            placeholder="e.g. BREEAM rating, net zero carbon target, NHS design guide, PAS 2035, university design standards, acoustic requirements, funder conditions. Leave blank if Building Regulations only."
            rows={3}
          />
        </QuestionCard>

        <QuestionCard>
          <Label>Q2.5 — Upload Supporting Documents (optional)</Label>
          <HelpText>Floor plans, photos, or condition reports help improve report accuracy</HelpText>
          <p className="text-sm mb-2" style={{ color: '#444444' }}>Accepted: JPG, PNG, PDF. Max 10 files. Note: uploads are for your reference — documents are not sent to the AI in this version.</p>
          <input type="file" multiple accept=".jpg,.jpeg,.png,.pdf" className="text-sm" style={{ color: '#1A1A1A' }} />
        </QuestionCard>
      </>
    )
  }

  function renderSection3() {
    const knownIssuesOpts = (isNewBuild || isExternalWorks || isDemolition) ? KNOWN_ISSUES_NEWBUILD : KNOWN_ISSUES_REFURB
    return (
      <>
        <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: '#D5E8F0', border: '1px solid #2E75B6' }}>
          <p className="text-sm font-medium" style={{ color: '#1F3864' }}>Answers in this section directly populate your risk register and cost contingency.</p>
        </div>

        <QuestionCard>
          <Label required>Q3.1 — Known Building or Site Issues</Label>
          <CheckboxGroup options={knownIssuesOpts} values={get('q3_1_knownIssues')} onChange={v => set('q3_1_knownIssues', v)} />
          <FieldError msg={errors.q3_1_knownIssues} />
        </QuestionCard>

        {!isNewBuild && !isDemolition && (
          <QuestionCard>
            <Label>Q3.2 — Previous Major Works (optional)</Label>
            <HelpText>Describe any significant construction or refurbishment works carried out on this building or space within the last five years, including the approximate year of completion. For example: full electrical rewire (2022), roof replacement (2019). This is used to identify elements already renewed and adjust the cost estimate accordingly.</HelpText>
            <Textarea
              value={get('q3_2_previousWorks')}
              onChange={v => set('q3_2_previousWorks', v)}
              placeholder="e.g. Full electrical rewire (2022), roof replacement (2019), heating system replacement (2021)"
              rows={3}
            />
          </QuestionCard>
        )}

        <QuestionCard>
          <Label>Q3.3 — Existing Surveys Available (optional)</Label>
          <HelpText>Do you have any existing surveys or reports for this building?</HelpText>
          <CheckboxWithOther
            options={SURVEYS}
            values={get('q3_3_surveys')}
            onChange={v => set('q3_3_surveys', v)}
            otherValue={get('q3_3_surveysOther') || ''}
            onOtherChange={v => set('q3_3_surveysOther', v)}
            otherPlaceholder="Describe other survey or report..."
          />
        </QuestionCard>

        <QuestionCard>
          <Label required>Q3.4 — Planning Consents Required</Label>
          <CheckboxGroup options={PLANNING_CONSENTS} values={get('q3_4_planningConsents')} onChange={v => set('q3_4_planningConsents', v)} />
          <FieldError msg={errors.q3_4_planningConsents} />
        </QuestionCard>

        <QuestionCard>
          <Label>Q3.5 — Access Constraints (optional)</Label>
          <CheckboxWithOther
            options={ACCESS_CONSTRAINTS}
            values={get('q3_5_accessConstraints')}
            onChange={v => set('q3_5_accessConstraints', v)}
            otherValue={get('q3_5_accessConstraintsOther') || ''}
            onOtherChange={v => set('q3_5_accessConstraintsOther', v)}
            otherPlaceholder="Describe other access constraint..."
          />
        </QuestionCard>

        <QuestionCard>
          <Label required>Q3.6 — Occupation During Works</Label>
          <HelpText>Will the building or space be occupied during the works?</HelpText>
          <RadioGroup options={OCCUPATION_OPTIONS} value={get('q3_6_occupation')} onChange={v => set('q3_6_occupation', v)} />
          <FieldError msg={errors.q3_6_occupation} />
        </QuestionCard>

        <QuestionCard>
          <Label>Q3.7 — Additional Project Context (optional)</Label>
          <Textarea
            value={get('q3_7_additionalContext')}
            onChange={v => set('q3_7_additionalContext', v)}
            placeholder="Please provide any further information about this project not captured above — for example: site-specific constraints, known sensitivities, stakeholder pressures, funding conditions, programme pressures, or anything else that should be reflected in the feasibility report."
            rows={4}
          />
        </QuestionCard>
      </>
    )
  }

  function renderSection4() {
    return (
      <>
        <QuestionCard>
          <Label required>Q4.1 — Target Completion Date</Label>
          <Textarea
            value={get('q4_1_targetDate')}
            onChange={v => set('q4_1_targetDate', v)}
            placeholder="e.g. Must be complete before September 2026 for the start of the academic year. Or: No fixed deadline."
            rows={2}
          />
          <FieldError msg={errors.q4_1_targetDate} />
        </QuestionCard>

        <QuestionCard>
          <Label>Q4.2 — Indicative Budget (optional)</Label>
          <HelpText>If you enter a budget, we will compare it against our benchmark estimate and flag any significant difference.</HelpText>
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg" style={{ color: '#1A1A1A' }}>£</span>
            <NumberInput
              value={get('q4_2_budgetFigure')}
              onChange={v => set('q4_2_budgetFigure', v)}
              placeholder="Leave blank if unknown"
              min="0"
            />
          </div>
          {budgetFigure && (
            <div className="mt-3">
              <p className="text-sm font-medium mb-2" style={{ color: '#1A1A1A' }}>This budget figure includes:</p>
              <CheckboxGroup options={BUDGET_INCLUDES} values={get('q4_2_budgetIncludes')} onChange={v => set('q4_2_budgetIncludes', v)} />
            </div>
          )}
        </QuestionCard>

        <QuestionCard>
          <Label required>Q4.5 — Project Priorities</Label>
          <HelpText>What matters most on this project? Select all that apply.</HelpText>
          <CheckboxWithOther
            options={PRIORITIES}
            values={get('q4_5_priorities')}
            onChange={v => set('q4_5_priorities', v)}
            otherValue={get('q4_5_prioritiesOther') || ''}
            onOtherChange={v => set('q4_5_prioritiesOther', v)}
            otherPlaceholder="Describe other priority..."
          />
          <FieldError msg={errors.q4_5_priorities} />
        </QuestionCard>

        <QuestionCard>
          <Label required>Q4.6 — Design Stage Reached</Label>
          <RadioGroup options={DESIGN_STAGES} value={get('q4_6_designStage')} onChange={v => set('q4_6_designStage', v)} />
          <FieldError msg={errors.q4_6_designStage} />
        </QuestionCard>

        {projectSize > 1000 && (
          <QuestionCard>
            <Label>Q4.7 — Phased Delivery</Label>
            <RadioGroup
              options={['Single phase — all works in one continuous programme', 'Multiple phases — works delivered in separate stages']}
              value={get('q4_7_phasing')}
              onChange={v => set('q4_7_phasing', v)}
            />
          </QuestionCard>
        )}

        {showUtilities && (
          <QuestionCard>
            <Label>Q4.8 — Utilities Capacity (optional)</Label>
            <HelpText>Are there any known constraints on the building's existing utility supplies?</HelpText>
            <CheckboxGroup options={UTILITIES_OPTIONS} values={get('q4_8_utilities')} onChange={v => set('q4_8_utilities', v)} />
          </QuestionCard>
        )}

        <QuestionCard>
          <Label>Q4.9 — Funding Source (optional)</Label>
          <HelpText>How is this project being funded?</HelpText>
          <CheckboxWithOther
            options={FUNDING_SOURCES}
            values={get('q4_9_funding')}
            onChange={v => set('q4_9_funding', v)}
            otherValue={get('q4_9_fundingOther') || ''}
            onOtherChange={v => set('q4_9_fundingOther', v)}
            otherPlaceholder="Describe other funding source..."
          />
        </QuestionCard>
      </>
    )
  }

  function renderSection5() {
    return (
      <>
        <QuestionCard>
          <Label required>Q5.1 — Financial Benefit of this Project</Label>
          <CheckboxWithOther
            options={FINANCIAL_BENEFITS}
            values={get('q5_1_financialBenefit')}
            onChange={v => set('q5_1_financialBenefit', v)}
            otherValue={get('q5_1_financialBenefitOther') || ''}
            onOtherChange={v => set('q5_1_financialBenefitOther', v)}
            otherPlaceholder="Describe other financial benefit..."
          />
          <FieldError msg={errors.q5_1_financialBenefit} />
        </QuestionCard>

        {showROIAmount && (
          <QuestionCard>
            <Label>Q5.2 — Annual Financial Benefit (optional)</Label>
            <Textarea
              value={get('q5_2_annualBenefit')}
              onChange={v => set('q5_2_annualBenefit', v)}
              placeholder="e.g. £12,500 rental income per year. Or: £8,000 energy cost saving per year. If relevant, note over how many years you expect to receive this benefit."
              rows={3}
            />
          </QuestionCard>
        )}
      </>
    )
  }

  function renderSection6() {
    const roiBlocked = financialBenefit.length > 0 &&
      financialBenefit.every(f => f === 'No direct financial return — strategic or compliance project')

    return (
      <>
        <QuestionCard>
          <p className="font-bold mb-3" style={{ color: '#1F3864', fontSize: '16px' }}>Mandatory Sections (always included)</p>
          <div className="flex flex-col gap-2">
            {MANDATORY_SECTIONS.map(s => (
              <label key={s.id} className="flex items-center gap-3 opacity-50 cursor-not-allowed" style={{ minHeight: '44px' }}>
                <input type="checkbox" checked readOnly className="w-5 h-5 rounded" style={{ accentColor: '#2E75B6' }} />
                <span style={{ color: '#1A1A1A', fontSize: '16px' }}>{s.label}</span>
              </label>
            ))}
          </div>
        </QuestionCard>

        <QuestionCard>
          <p className="font-bold mb-3" style={{ color: '#1F3864', fontSize: '16px' }}>Optional Sections (choose what you need)</p>
          <div className="flex flex-col gap-2">
            {OPTIONAL_SECTIONS.map(s => {
              const blocked = s.id === 'roi' && roiBlocked
              return (
                <label key={s.id} className={`flex items-center gap-3 ${blocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`} style={{ minHeight: '44px' }}>
                  <input
                    type="checkbox"
                    checked={!blocked && optionalSections.includes(s.id)}
                    disabled={blocked}
                    onChange={() => !blocked && toggleOptional(s.id)}
                    className="w-5 h-5 rounded"
                    style={{ accentColor: '#2E75B6' }}
                  />
                  <span style={{ color: '#1A1A1A', fontSize: '16px' }}>
                    {s.label}
                    {blocked && <span className="ml-2 text-sm" style={{ color: '#888888' }}>(not applicable — no financial return identified)</span>}
                  </span>
                </label>
              )
            })}
          </div>
        </QuestionCard>

        <QuestionCard>
          <Label>Q6.2 — Report Preferences (optional)</Label>
          <Textarea
            value={get('q6_2_reportInstructions')}
            onChange={v => set('q6_2_reportInstructions', v)}
            placeholder="Any specific instructions about how this report should be written — for example: non-technical language for a board presentation, focus on cost risks, confidential draft, or specific sections to emphasise."
            rows={3}
          />
        </QuestionCard>
      </>
    )
  }

  const currentSection = SECTIONS[section - 1]

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFFFFF' }}>
      {loading && <LoadingOverlay message={loadingMsg} />}

      {/* Header */}
      <header className="sticky top-0 z-10 shadow" style={{ backgroundColor: '#1F3864' }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded flex items-center justify-center font-bold text-sm" style={{ backgroundColor: '#2E75B6', color: '#FFFFFF' }}>AI</div>
            <span className="font-semibold" style={{ color: '#FFFFFF', fontSize: '16px' }}>Estates AI Tool</span>
          </div>
          <button onClick={clearAll} className="text-sm hover:underline" style={{ color: '#D5E8F0' }}>
            Clear &amp; start again
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Saved answers banner */}
        {savedBanner && (
          <div className="mb-4 flex items-center justify-between px-4 py-3 rounded-lg" style={{ backgroundColor: '#D5E8F0', border: '1px solid #2E75B6' }}>
            <p className="text-sm font-medium" style={{ color: '#1F3864' }}>Saved answers restored</p>
            <button onClick={() => setSavedBanner(false)} className="text-sm" style={{ color: '#2E75B6' }}>Dismiss</button>
          </div>
        )}

        <ProgressBar current={section} total={6} />

        {/* Section header */}
        <div className="mb-6 px-4 py-4 rounded-lg" style={{ backgroundColor: '#1F3864' }}>
          <h1 className="text-xl font-bold" style={{ color: '#FFFFFF' }}>{currentSection.title}</h1>
          <p className="mt-1" style={{ color: '#D5E8F0', fontSize: '14px' }}>{currentSection.subtitle}</p>
        </div>

        {/* Validation summary */}
        {Object.keys(errors).length > 0 && (
          <div className="mb-6 px-4 py-3 rounded-lg" style={{ backgroundColor: '#FFF0F0', border: '1px solid #C00000' }}>
            <p className="font-medium" style={{ color: '#C00000', fontSize: '14px' }}>Please complete the required fields before continuing.</p>
          </div>
        )}

        {/* Section content */}
        <div>
          {section === 1 && renderSection1()}
          {section === 2 && renderSection2()}
          {section === 3 && renderSection3()}
          {section === 4 && renderSection4()}
          {section === 5 && renderSection5()}
          {section === 6 && renderSection6()}
        </div>

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between gap-4">
          {section > 1 ? (
            <button
              onClick={goBack}
              className="px-5 py-3 rounded-lg font-medium transition-colors"
              style={{ border: '1px solid #CCCCCC', color: '#1A1A1A', backgroundColor: '#FFFFFF', fontSize: '16px', minHeight: '48px' }}
            >
              Back
            </button>
          ) : <div />}

          {section < 6 ? (
            <button
              onClick={goNext}
              className="px-6 py-3 rounded-lg font-semibold transition-colors"
              style={{ backgroundColor: '#2E75B6', color: '#FFFFFF', fontSize: '16px', minHeight: '48px' }}
            >
              Next Section →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="rounded-lg font-bold transition-colors"
              style={{ backgroundColor: '#1F3864', color: '#FFFFFF', fontSize: '18px', minHeight: '56px', padding: '0 32px', width: '100%', maxWidth: '400px' }}
            >
              Generate My Feasibility Report →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
