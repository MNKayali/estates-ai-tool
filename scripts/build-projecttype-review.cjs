/* Builds docs/Project_types_question_sets_FOR_REVIEW.docx — the other seven
   project types, in the same shape as the New Build review document. */
const fs = require('fs')
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, PageOrientation, PageBreak,
} = require('docx')

const NAVY = '1A2E4A', AMBER = '9D6B15', GREY = '6D7182', LINE = 'D8D5CE', TINT = 'F4F1EA'
const W = 13958

const B = {
  top: { style: BorderStyle.SINGLE, size: 2, color: LINE },
  bottom: { style: BorderStyle.SINGLE, size: 2, color: LINE },
  left: { style: BorderStyle.SINGLE, size: 2, color: LINE },
  right: { style: BorderStyle.SINGLE, size: 2, color: LINE },
}
const run = (text, o = {}) => new TextRun({
  text, bold: o.bold, italics: o.italics, size: o.size ?? 19,
  color: o.color ?? '1A1A1A', font: 'Arial',
})
const p = (text, o = {}) => new Paragraph({
  spacing: { before: o.before ?? 0, after: o.after ?? 80 }, children: [run(text, o)],
})
const bullet = (text, o = {}) => new Paragraph({
  bullet: { level: 0 }, spacing: { after: 60 }, children: [run(text, { size: 18, ...o })],
})
const cell = (children, width, o = {}) => new TableCell({
  width: { size: width, type: WidthType.DXA }, borders: B,
  shading: o.shade ? { type: ShadingType.CLEAR, fill: o.shade, color: 'auto' } : undefined,
  margins: { top: 90, bottom: 90, left: 120, right: 120 }, children,
})
const hdr = (labels, widths) => new TableRow({
  tableHeader: true,
  children: labels.map((l, i) => cell([new Paragraph({ children: [run(l, { bold: true, size: 18, color: 'FFFFFF' })] })], widths[i], { shade: NAVY })),
})
const row = (cells, widths) => new TableRow({
  children: cells.map((c, i) => cell(
    (Array.isArray(c) ? c : [c]).map(l => typeof l === 'string'
      ? new Paragraph({ spacing: { after: 40 }, children: [run(l, { size: 18 })] }) : l),
    widths[i], { shade: i === cells.length - 1 ? TINT : undefined })),
})

const AW = [900, 3300, 3700, 3400, 2658]   // Part A widths
const BW = [800, 4300, 3400, 2800, 2658]   // Part B widths

const typeHeading = (name, sub) => [
  new Paragraph({
    spacing: { before: 0, after: 40 },
    children: [run(name.toUpperCase(), { bold: true, size: 30, color: NAVY })],
  }),
  new Paragraph({
    spacing: { after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: AMBER, space: 6 } },
    children: [run(sub, { size: 18, color: GREY })],
  }),
]
const sectionLabel = (text, note) => [
  p(text, { bold: true, size: 22, color: NAVY, before: 220, after: 60 }),
  ...(note ? [p(note, { italics: true, size: 18, color: GREY, after: 100 })] : []),
]
const defectBox = lines => new Paragraph({
  spacing: { before: 60, after: 160 },
  border: { left: { style: BorderStyle.SINGLE, size: 18, color: AMBER, space: 10 } },
  indent: { left: 200 },
  children: lines.flatMap((l, i) => [
    ...(i ? [new TextRun({ break: 1 })] : []),
    run(l, { size: 18, bold: i === 0 }),
  ]),
})

const partA = rows => new Table({
  columnWidths: AW, width: { size: W, type: WidthType.DXA },
  rows: [hdr(['Q', 'The question today', 'Recommendation', 'Why', 'Your comment'], AW),
    ...rows.map(([q, today, rec, why]) => row([
      [new Paragraph({ children: [run(q, { bold: true, size: 18, color: NAVY })] })],
      today,
      [new Paragraph({ children: [run(rec, { bold: true, size: 18, color: /HIDE|REPLACE|DEFECT/.test(rec) ? AMBER : NAVY })] })],
      why, '',
    ], AW))],
})
const partB = rows => new Table({
  columnWidths: BW, width: { size: W, type: WidthType.DXA },
  rows: [hdr(['#', 'Proposed question and options', 'What it changes in the report', 'Workbook change needed?', 'Your comment'], BW),
    ...rows.map(([id, q, opts, drives, wb]) => row([
      [new Paragraph({ children: [run(id, { bold: true, size: 18, color: NAVY })] })],
      [new Paragraph({ spacing: { after: 60 }, children: [run(q, { bold: true, size: 18 })] }),
        ...opts.map(o => new Paragraph({ bullet: { level: 0 }, spacing: { after: 20 }, children: [run(o, { size: 17, color: GREY })] }))],
      drives,
      [new Paragraph({ children: [run(wb, { size: 17, bold: wb.startsWith('YES'), color: wb.startsWith('YES') ? AMBER : '1A1A1A' })] })],
      '',
    ], BW))],
})

// ─────────────────────────────────────────────────────────────────────────────
const TYPES = [
  {
    name: 'Refurbishment',
    sub: 'Shows 98 elements at a wildcard building use, 72 for Education. Groups 0, 2, 3, 4, 5, 7, 8. This is the type the questionnaire was designed around, so it needs the least change.',
    defects: [
      'Two elements cannot be priced on a refurbishment:',
      '0.4 Ground stabilisation — no refurbishment rate, so underpinning or subsidence work cannot be included.',
      '8.10 HGV hardstanding and turning area — no refurbishment rate.',
      '5.1b Mechanical second fix has no rate in any project type. It is already listed for correction in the workbook change note.',
    ],
    a: [
      ['Q3.1', 'Known building issues — 9 options', 'KEEP unchanged', 'This is its home ground. All nine options are meaningful on a refurbishment.'],
      ['Q3.3', 'Surveys and reports available', 'KEEP, but split the asbestos option', 'See RF1. "Asbestos register" currently covers two very different things, only one of which is legally sufficient before intrusive work.'],
      ['—', 'Everything else in Sections 1, 3 and 4', 'KEEP unchanged', 'The form already fits this project type.'],
    ],
    b: [
      ['RF1', 'Asbestos survey status',
        ['No survey', 'Management survey only', 'Refurbishment & demolition survey completed', 'Not applicable — building is post-2000'],
        'A management survey is not sufficient before intrusive refurbishment work — a refurbishment & demolition survey is. Today Q3.3 offers one option, "Asbestos register", which conflates the two. Drives the risk allowance and a survey lead time.',
        'YES — a Tab 3 risk rule keyed to the survey status.'],
      ['RF2', 'Current EPC rating / MEES position',
        ['A–B', 'C–D', 'E or below — MEES action required', 'Not known', 'Not applicable'],
        'Identifies decarbonisation and compliance-driven scope, and tells the report whether the project is discretionary or forced by legislation.',
        'YES — a Tab 3 rule if it should move a cost; otherwise narrative only.'],
      ['RF3', 'Are new loads being added to the existing structure?',
        ['No', 'Rooftop plant or PV', 'Additional floor or mezzanine', 'Heavy equipment', 'Not known'],
        'Triggers a structural survey and possible strengthening (element 7.1), which is a common cause of a refurbishment estimate moving late.',
        'PARTLY — element 7.1 exists. Needs a Tab 3 rule and a survey duration row.'],
      ['RF4', 'Age and condition of the existing services',
        ['Recently replaced (under 10 years)', 'Mid-life (10–20 years)', 'Life-expired (over 20 years)', 'Mixed across the building', 'Not known'],
        'Decides whether M&E replacement belongs in scope at all, rather than relying on the user to work it out from the element list.',
        'NO — can drive the scope preset and the narrative without a workbook change.'],
    ],
  },
  {
    name: 'Fit-out',
    sub: 'Shows 68 elements at a wildcard building use, 42 for Education. Groups 3, 4 and 5 only — no structure, no envelope, no external works.',
    defects: [
      'One element cannot be priced:',
      '5.1b Mechanical second fix — no rate in any project type, which matters most here because a second-fix-only fit-out is exactly what this element is for. Already listed in the workbook change note.',
    ],
    a: [
      ['Q3.1', 'Known building issues — 9 options', 'KEEP, but trim the options', 'Damp, drainage and structural concerns belong to the landlord, not the fit-out. Asbestos, fire safety and ageing M&E do matter. Suggest keeping those three.'],
      ['Q3.2', 'Previous works or relevant history', 'HIDE', 'Read only by the AI narrative, so hiding it changes no number.'],
      ['Q3.4', 'Planning consent required', 'KEEP unchanged', 'Usually "no consent required" for an internal fit-out, but change of use and shopfront work both occur.'],
    ],
    b: [
      ['FO1', 'Fit-out category',
        ['Cat A — landlord finish to open-plan standard', 'Cat B — tenant-specific fit-out', 'Cat A+ / plug-and-play', 'Refit of existing occupied space'],
        'The single most useful thing to know about a fit-out, and the form currently never asks it. Decides the specification level and most of the scope.',
        'NO — can drive the scope preset directly.'],
      ['FO2', 'Condition of the space being taken on',
        ['Shell and core', 'Cat A complete', 'Existing fitted space to be stripped out', 'Currently occupied and trading'],
        'Decides whether a soft strip (0.5) is needed and how much of the services installation already exists.',
        'NO — 0.5 already has a refurbishment rate.'],
      ['FO3', 'Landlord consent or licence to alter required?',
        ['Not required', 'Required — not yet applied for', 'Applied for', 'Granted'],
        'A licence to alter routinely takes 6–12 weeks and is a common cause of a fit-out programme slipping. Nothing in the programme accounts for it today.',
        'YES — a Durations row for the approval period.'],
      ['FO4', 'Dilapidations or reinstatement obligation at lease end?',
        ['None', 'Reinstatement to Cat A required', 'Full reinstatement required', 'Not known'],
        'A real and often large cost that the estimate cannot currently carry at all.',
        'YES — a new Master Cost Table row, or an explicit exclusion in the report.'],
      ['FO5', 'Is the existing services capacity sufficient for the new layout?',
        ['Yes — confirmed', 'No — upgrade needed', 'Not yet assessed'],
        'Decides whether the fit-out carries a services upgrade or only a distribution change. Drives the difference between second-fix and full replacement.',
        'NO — drives the scope preset and the risk narrative.'],
    ],
  },
  {
    name: 'Extension',
    sub: 'Shows 76 elements at a wildcard building use, 66 for Education. All nine groups. An extension is a hybrid — new build work attached to an existing building — and the form currently treats it as neither.',
    defects: [
      'Thirty-three elements are allowed by group but have no Extension rate, so they never appear:',
      'The entire sector-specific equipment range (4.9 to 4.30) — catering kitchens, dock levellers, medical gas, clinical furniture, laboratory benching, fume cupboards, AV systems, retail fixtures, gym and changing equipment.',
      'Specialist M&E: compressed air, process drainage, industrial ventilation, standby generator, UPS, nurse call, precision cooling.',
      'Modular bathroom pods and cleanroom structure.',
      'The effect: a hospital, laboratory, school or industrial extension cannot price the equipment that is the reason for building it.',
    ],
    a: [
      ['Q1.2a', 'Number of storeys in the extension', 'KEEP unchanged', 'Already worded correctly for this type — one of the few places the form adapts.'],
      ['Q3.1', 'Known building issues', 'KEEP, and add the ground questions', 'Both halves matter here: the existing building AND the ground being built on. See EX2.'],
      ['Q3.6', 'Occupation during works', 'KEEP, but re-word', 'The question should be about the existing building remaining in use while the extension is built alongside it.'],
    ],
    b: [
      ['EX1', 'How does the extension connect to the existing building?',
        ['Abutting — structurally independent', 'Structurally tied into the existing frame', 'Linked by a walkway or corridor', 'Wrap-around or over-roof'],
        'Drives structural complexity, the party wall position, and whether the existing foundations need underpinning. The single biggest cost variable on an extension.',
        'YES — a Tab 3 rule.'],
      ['EX2', 'Ground conditions',
        ['Ground investigation done — no issues', 'Made ground or fill', 'High water table', 'Rock or hard strata', 'Not yet investigated'],
        'Standard versus piled foundations (1.1 vs 1.2), and a risk allowance where the ground is unknown. Same question as NB3 on a new build.',
        'YES — a Tab 3 rule.'],
      ['EX3', 'Work needed to the existing building to form the connection',
        ['None — independent structure', 'New openings in an external wall', 'Structural alterations or removal', 'Roof alterations', 'Not yet determined'],
        'Prices demolition and structural alteration (0.2) and making good (7.5), both of which already carry refurbishment rates.',
        'NO — 0.2 and 7.5 already price on an extension.'],
      ['EX4', 'Can the existing services serve the extension?',
        ['Yes — spare capacity confirmed', 'No — plant upgrade required', 'Extension will have independent services', 'Not yet assessed'],
        'Decides whether the extension carries its own plant or extends the existing installation — a large swing in the M&E allowance.',
        'NO — drives the scope preset and the narrative.'],
      ['EX5', 'Must the extension match the existing building?',
        ['No constraint', 'Matching materials required by planning', 'Listed building or conservation area constraint', 'Deliberately contrasting design'],
        'Drives the specification level and a heritage cost uplift where materials must be matched.',
        'YES — a Tab 3 rule, unless Q2.4 is considered to cover it.'],
    ],
  },
  {
    name: 'External Works',
    sub: 'Shows 15 elements at a wildcard building use. Groups 0 and 8 only. Q1.5 is correctly treated as a site area rather than a floor area — but three questions about buildings are still asked.',
    defects: [
      'Two problems, one of them in the form rather than the workbook:',
      'Q1.4 Building age is still asked on an External Works project. There is no building. This is a form defect, not a workbook gap.',
      '0.1 Toxic/hazardous material removal has no External Works rate, so contaminated spoil removal cannot be priced on a site scheme — only 0.3 Contaminated land remediation is available.',
    ],
    a: [
      ['Q1.4', 'Building age', 'HIDE — DEFECT', 'There is no building. It is asked today because the only gate on this question is "not a New Build".'],
      ['Q3.1', 'Known building issues', 'REPLACE with EW1–EW4', 'Every option refers to a building. Contaminated land is the only one that survives, and it is better asked as a site question.'],
      ['Q3.2', 'Previous works or relevant history', 'HIDE', 'Wording only — no number changes.'],
      ['Q3.6', 'Occupation during works', 'KEEP, but re-word', 'Ask whether the site stays in use during the works — a car park being resurfaced in sections is the normal case and it does price.'],
      ['Q2.4', 'Specification level', 'Already hidden', 'Correct — External Works has a single rate column.'],
    ],
    b: [
      ['EW1', 'Existing surface',
        ['Undeveloped or soft landscaping', 'Existing hardstanding to be broken out', 'Mixed'],
        'Drives site preparation (8.1) and the volume of material to be removed from site.',
        'NO — 8.1 already prices.'],
      ['EW2', 'Drainage strategy',
        ['Connect to existing drainage', 'New SuDS required', 'Attenuation tank or soakaway', 'Not yet determined'],
        'SuDS is now a planning requirement on most schemes and is a significant cost. Drives elements 8.5 and 8.6.',
        'YES — a Tab 3 rule, or a new row for attenuation.'],
      ['EW3', 'Adoption or highways agreement required?',
        ['None', 'Section 278 — highway works', 'Section 38 — road adoption', 'Section 104 — sewer adoption', 'Not known'],
        'These agreements run to months and carry their own fees. Nothing in the programme accounts for them today.',
        'YES — a Durations row and a fee rule.'],
      ['EW4', 'Ground contamination',
        ['None known', 'Suspected — no investigation yet', 'Confirmed by investigation', 'Remediation strategy agreed'],
        'Drives contaminated land remediation (0.3) and the risk allowance.',
        'YES — an External Works rate on 0.1, per the defect above.'],
      ['EW5', 'Trees and root protection',
        ['None on site', 'Trees to be retained — root protection areas apply', 'Trees to be removed', 'TPO or conservation-area trees'],
        'Root protection areas constrain where you can dig and can force hand excavation or no-dig construction.',
        'YES — a Tab 3 rule.'],
      ['EW6', 'Levels and retaining',
        ['Level site', 'Gentle slope', 'Significant level change — retaining structures needed', 'Not known'],
        'Retaining structures are a step change in cost on an otherwise simple site scheme.',
        'YES — a Tab 3 rule.'],
      ['EW7', 'Statutory services crossing the site',
        ['None known', 'Services present — no diversion needed', 'Diversion required', 'Not yet searched'],
        'Utility diversions run to months and are the commonest cause of a site scheme overrunning.',
        'YES — a new element row and a Durations row.'],
    ],
  },
  {
    name: 'Renewable Energy',
    sub: 'Shows 42 elements at a wildcard building use. Groups 5 and 8. Priced almost entirely per kWp, kWh or kW rather than per square metre — which is where the current form fits it worst.',
    defects: [
      'Two questions do not fit this project type:',
      'Q1.5 asks for a floor area and is required, but a solar or battery scheme is priced per kWp or kWh. The area is collected, validated and then barely used.',
      'Q2.4 Specification level is shown, but the per_kwp, per_kwh and per_kw pricing types do not read a specification column at all, so the answer changes nothing.',
      'There is also no "typical scope" button for this type, because the scope is too quantity-driven for a default to be honest. RE1 below is a better answer than a preset.',
    ],
    a: [
      ['Q1.5', 'Approximate size (GIFA m²)', 'Make optional, or re-word', 'Required today. For a ground-mounted scheme there is no floor area to give. Relevant only for a roof-mounted system on a known building.'],
      ['Q2.4', 'Specification level', 'HIDE — it changes nothing', 'The quantity-driven pricing types ignore the specification column entirely.'],
      ['Q1.4', 'Building age', 'KEEP only where roof-mounted', 'Relevant to a roof-mounted system, meaningless for a ground-mounted one.'],
      ['Q3.1', 'Known building issues', 'REPLACE with RE3', 'Roof structural capacity is the one building issue that matters here, and it is not on the list.'],
    ],
    b: [
      ['RE1', 'Technology',
        ['Solar PV', 'Battery storage (BESS)', 'Air or ground source heat pump', 'CHP', 'Solar thermal', 'Biomass', 'Wind'],
        'Decides which elements are offered at all. Replaces the missing "typical scope" button with something honest.',
        'NO — the elements exist; this drives the picker.'],
      ['RE2', 'Mounting and location',
        ['Roof-mounted', 'Ground-mounted', 'Car park canopy', 'Within an existing plant room', 'New plant enclosure'],
        'Drives groundworks and foundations for a ground-mounted scheme, and structural survey work for a roof-mounted one.',
        'YES — ground-mount foundations have no element today.'],
      ['RE3', 'Has the roof structural capacity been confirmed? (roof-mounted only)',
        ['Yes — structural engineer has confirmed', 'No — not yet assessed', 'Strengthening known to be required'],
        'The commonest reason a rooftop PV scheme fails at design stage. Drives a structural survey and possible strengthening.',
        'YES — a Tab 3 rule and a survey duration row.'],
      ['RE4', 'Grid connection status',
        ['Existing capacity confirmed sufficient', 'DNO application not yet made', 'Budget quote received', 'Connection offer accepted'],
        'Almost always the longest lead item on a renewables scheme and the one most likely to move the completion date. Element 5.13 exists but nothing adds the lead time.',
        'YES — a Durations row for the DNO lead time.'],
      ['RE5', 'Export, self-consumption or PPA?',
        ['Self-consumption only', 'Export to grid', 'Power purchase agreement', 'Not yet decided'],
        'Feeds the ROI section directly — this is the question that makes the payback calculation meaningful rather than assumed.',
        'NO — narrative and ROI only.'],
    ],
  },
  {
    name: 'Demolition',
    sub: 'Shows 4 elements. Group 0 only. The narrowest project type in the tool, and the one where the most questions are asked that cannot apply.',
    defects: [
      'One workbook gap, and several questions that do not apply:',
      '0.4 Ground stabilisation has no rate in the refurbishment family, which is the family Demolition prices from — so ground works after demolition cannot be included.',
      'Q2.4 Specification level, Q3.6 Occupation during works and the Q5 financial benefit questions are all asked and none of them mean anything for a demolition.',
    ],
    a: [
      ['Q2.4', 'Specification level', 'HIDE', 'There is no specification standard for demolishing something.'],
      ['Q3.6', 'Occupation during works', 'REPLACE with DM4', 'The building being demolished is empty by definition. What matters is what is next to it.'],
      ['Q3.3', 'Surveys and reports available', 'REPLACE with DM2', 'A refurbishment & demolition asbestos survey is a legal requirement before demolition, not one option among seven.'],
      ['Q1.4', 'Building age', 'KEEP unchanged', 'Genuinely useful here — pre-2000 drives the asbestos position.'],
      ['Q5.1 / Q5.2', 'Financial benefit and annual benefit', 'HIDE', 'A demolition rarely has a direct financial return, and the ROI section already hides itself when left blank.'],
    ],
    b: [
      ['DM1', 'Structure type and height',
        ['Single storey', '2–4 storeys', '5 storeys or more', 'Steel frame', 'Concrete frame', 'Masonry / traditional'],
        'Drives the demolition method and the rate. A concrete-framed six-storey building and a single-storey masonry shed are not the same job per square metre.',
        'YES — the current single 0.2 rate cannot distinguish them.'],
      ['DM2', 'Asbestos survey status',
        ['Refurbishment & demolition survey completed', 'Management survey only', 'No survey', 'Building is post-2000'],
        'Legally required before demolition. Drives hazardous material removal (0.1), the risk allowance and a survey lead time.',
        'YES — a Tab 3 rule keyed to the survey status.'],
      ['DM3', 'Demolition method',
        ['Mechanical — machine demolition', 'Hand deconstruction', 'Facade retention', 'Not yet determined'],
        'Facade retention and hand deconstruction cost several times mechanical demolition and take far longer.',
        'YES — a Tab 3 rule or separate rate rows.'],
      ['DM4', 'Adjacent structures',
        ['Detached — nothing adjoining', 'Attached to a building that stays', 'Party wall', 'Adjacent to a public highway'],
        'Drives party wall awards (a programme item that routinely takes months), temporary works and propping.',
        'YES — a Durations row for the party wall award period.'],
      ['DM5', 'Below-ground structures',
        ['Slab and foundations to be removed', 'Left in situ', 'Basement to be filled', 'Not yet determined'],
        'A substantial cost that is invisible in the current four-element list.',
        'YES — a new element row.'],
      ['DM6', 'Site condition on completion',
        ['Cleared and levelled', 'Capped or sealed', 'Made ready for a new build', 'Landscaped'],
        'Decides whether ground stabilisation and site preparation belong in scope.',
        'YES — a refurbishment rate on 0.4, per the defect above.'],
      ['DM7', 'Protected species on site',
        ['None known', 'Bats known or suspected', 'Nesting birds', 'Not yet surveyed'],
        'Bats impose a seasonal constraint that can delay a demolition by months. The ecology survey stage (SV7) already exists in the programme workbook.',
        'PARTLY — SV7 exists. Needs the trigger extending to this answer.'],
    ],
  },
  {
    name: 'Mixed',
    sub: 'Shows 102 elements at a wildcard building use — the longest list in the tool. All nine groups. This type needs a different approach from the other seven.',
    defects: [
      'This is the most serious finding in this document.',
      'A Mixed project is priced entirely from the refurbishment rate columns — getRateForElement() groups Mixed with Refurbishment and Fit-out.',
      'Elements 1.1, 1.2, 1.3 and 1.4 — standard foundations, piled foundations, ground floor slab and basement — have no refurbishment rate. So on a Mixed project the entire substructure group is unpriceable and the tiles never appear.',
      'The combined effect: a project that is part new build and part refurbishment prices its new-build work at refurbishment rates and silently carries no foundations at all.',
      'Nothing in the report says any of this has happened.',
    ],
    a: [
      ['Q1.2', 'Project type = Mixed', 'Add a follow-up — see MX1', 'Asking "Mixed" and then showing all 102 elements puts the whole job of working out what is relevant onto the user.'],
      ['—', 'Every Section 3 question', 'Show the blocks that apply to the components chosen', 'Once MX1 tells us a project is new build plus refurbishment, the right question set is the union of those two — not everything, and not a generic list.'],
    ],
    b: [
      ['MX1', 'Which parts does this project include?',
        ['New build element', 'Refurbishment of an existing building', 'Extension to an existing building', 'External works', 'Demolition', '(multi-select)'],
        'Decides which question blocks and which element groups are shown. This one question replaces the current approach of showing everything.',
        'NO — drives the form only.'],
      ['MX2', 'Approximate split of area between new and existing',
        ['New build area (m²)', 'Existing building area (m²)'],
        'The fix for the rate-family defect above: it lets the new-build portion price from the new-build columns and the refurbishment portion from the refurbishment columns, instead of forcing everything through one family.',
        'YES — this is a change to how the cost engine selects a rate column, not only a workbook edit. The largest single piece of work proposed in this document.'],
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
const children = [
  new Paragraph({ spacing: { after: 60 }, children: [run('THE OTHER SEVEN PROJECT TYPES', { bold: true, size: 34, color: NAVY })] }),
  new Paragraph({
    spacing: { after: 260 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: AMBER, space: 8 } },
    children: [run('For review — Estates AI Stage 0–1 tool · 20 September 2026 · companion to the New Build document', { size: 20, color: GREY })],
  }),
  p('How to use this document', { bold: true, size: 22, color: NAVY, after: 100 }),
  bullet('Same shape as the New Build document: what to change about the questions you already ask, then the new questions proposed, then a comment box on every row.'),
  bullet('Each project type starts on its own page. Read the ones you care about and ignore the rest.'),
  bullet('"Problems found" at the top of each type is not a proposal — it is something already wrong that I found while checking the workbook.'),

  p('The three worst problems, if you read nothing else', { bold: true, size: 22, color: NAVY, before: 260, after: 100 }),
  defectBox([
    'Mixed cannot price foundations, a slab, or a basement — at all.',
    'A Mixed project prices from the refurbishment rate columns, and the four substructure elements have no refurbishment rate. A project that is part new build silently carries no substructure and prices its new work at refurbishment rates.',
  ]),
  defectBox([
    'An Extension cannot price any sector-specific equipment.',
    'Thirty-three elements have no Extension rate — catering kitchens, medical gas, laboratory benching, fume cupboards, AV systems, dock levellers, nurse call. A hospital or school extension cannot price the equipment that justifies building it.',
  ]),
  defectBox([
    'External Works still asks how old the building is.',
    'There is no building. The question is asked because the only condition on it is "not a New Build" — which is the pattern this whole exercise exists to fix.',
  ]),
  p('Each of these is set out again under its own project type, with the recommendation.', { italics: true, size: 18, color: GREY, before: 120 }),
]

for (const t of TYPES) {
  children.push(new Paragraph({ children: [new PageBreak()] }))
  children.push(...typeHeading(t.name, t.sub))
  if (t.defects) {
    children.push(...sectionLabel('Problems found'))
    children.push(defectBox(t.defects))
  }
  children.push(...sectionLabel('Part A — questions you are asked today', 'Only the questions that should change are listed. Anything not mentioned stays exactly as it is.'))
  children.push(partA(t.a))
  children.push(...sectionLabel('Part B — questions proposed to be added'))
  children.push(partB(t.b))
}

children.push(new Paragraph({ children: [new PageBreak()] }))
children.push(...typeHeading('What I need back', 'Three things, in whatever form suits you — comments in this document, or just a reply.'))
children.push(new Table({
  columnWidths: [800, 6500, 6658], width: { size: W, type: WidthType.DXA },
  rows: [hdr(['#', 'Decision', 'Your answer'], [800, 6500, 6658]),
    row(['1', 'Which of the proposed questions survive. Cross out anything you do not want. I have proposed 37 new questions across all eight project types, which is more than I would expect to build — the point is to cut them down together.', ''], [800, 6500, 6658]),
    row(['2', 'The three defects above are real today and are independent of everything else in this document. Do you want them fixed first, as their own piece of work, before any question changes?', ''], [800, 6500, 6658]),
    row(['3', 'MX2 — splitting a Mixed project by area so each part prices from its own rate column — is a change to the cost engine, not just the workbook. It is the largest thing proposed here. Is it in or out?', ''], [800, 6500, 6658]),
  ],
}))
children.push(p('Nothing in the application has been changed. This document, the New Build document and the mapping workbook are the only outputs so far.', { italics: true, size: 18, color: GREY, before: 240 }))

const doc = new Document({
  styles: { default: { document: { run: { font: 'Arial', size: 19 } } } },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE },
        margin: { top: 1080, bottom: 1080, left: 1440, right: 1440 },
      },
    },
    children,
  }],
})

const out = 'C:/Users/nabil/estates-ai-tool/docs/Project_types_question_sets_FOR_REVIEW.docx'
Packer.toBuffer(doc).then(b => { fs.writeFileSync(out, b); console.log('Wrote ' + out) })
