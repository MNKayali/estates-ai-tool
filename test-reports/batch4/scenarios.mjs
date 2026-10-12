// Test batch 4 (11 Oct 2026): 3 scenarios per building use (30), spread over the
// seven project types. Each has the answers to enter and my own estimate made
// before running Projento: construction = works + prelims + OH&P (excl. fees,
// risk, VAT); total = everything incl. fees, risk and the VAT the client pays;
// weeks = construction on site / whole programme from today's stage.
// Scope: typical = "Use typical scope"; add / remove Scope IDs; opt = { id: rate key };
// qty = { rate key: number }.

const BASE = {
  q4_1_targetDate: 'No specific deadline', q4_0_startDate: '2027-01-11',
  q4_6_phasing: 'Single phase', q4_7_funding: 'Internal / commercial', q4_8_publicClient: 'No',
  q3_2_previousWorks: '', q3_7_additionalContext: '', q6_2_instructions: '',
}
const NONE_ACCESS = ['No access constraints']
const A = {
  hours: 'Restricted working hours (no noisy work, no weekends)',
  shared: 'Access routes shared with occupiers, neighbours or the public',
  deliveries: 'Restricted deliveries or no vehicle access',
  tight: 'Tight site: little storage space, headroom or weight limits',
  road: 'Site fronts a public road or pavement (hoarding, scaffold or crane licence)',
  periods: 'Works limited to certain periods (holidays, seasons or blackout dates)',
}
const PARTY = 'Attached to or within 3 m of a neighbouring building (party wall)'
const CONS = 'Conservation area or Article 4 direction'
const ECO = 'Ecological features — roof voids, mature trees, water bodies, bat roost potential'
const NOCTX = ['None of these']

const S = (id, use, type, a, scope, est) => ({ id, use, type, answers: { ...BASE, q1_2_projectType: type, q1_3_buildingUse: use, ...a }, scope, est })

export const SCENARIOS = [
  // ── Residential ──
  S('RES-1', 'Residential', 'New Build', {
    q1_0_projectName: '[TEST4] Twelve flats, Easton', q1_1_postcode: 'BS5', q1_2_storeys: '3', q1_5_size: 900,
    q2_1_objective: 'Build a three-storey block of 12 one- and two-bed flats for private rent on a cleared corner plot, with air source heat pumps and cycle storage.',
    q2_4_specLevel: 'Standard', q2_5_standards: 'Net zero',
    q3_1_knownIssues: ['Made ground or fill'], q3_3_surveys: ['Topographic', 'Ground investigation'], q3_4_planningConsents: 'Full planning',
    q3_5_accessConstraints: [A.road], q3_6_occupation: 'Vacant or decanted', q3_8_siteContext: [PARTY],
    q4_3_budget: 2800000, q4_4_priorities: ['Lowest cost', 'Fixed / certain final cost'], q4_5_designStage: 'Concept complete (Stage 2)',
    q5_1_financialBenefit: ['Rental or commercial income'], q5_2_annualBenefit: 150000,
  }, { typical: true, add: ['S-0081'], opt: { 'S-0039': 'S-0039-02' }, qty: { 'S-0081-01': 24 } },
  { cLo: 2.0e6, cHi: 2.4e6, tLo: 2.5e6, tHi: 3.0e6, wLo: 45, wHi: 55, pLo: 95, pHi: 120, note: 'New-build homes zero-rated for VAT' }),

  S('RES-2', 'Residential', 'Refurbishment', {
    q1_0_projectName: '[TEST4] Marfleet council flats upgrade', q1_1_postcode: 'HU9', q1_2_storeys: '4', q1_4_buildingAge: '1900–1979', q1_5_size: 2400,
    q2_1_objective: 'Renew heating, wiring, kitchens and bathrooms in 32 occupied council flats in a 1965 four-storey block, and replace the windows.',
    q2_3_interventionLevel: 'Full systems replacement', q2_4_specLevel: 'Standard', q2_5_standards: 'PAS 2035',
    q3_1_knownIssues: ['Asbestos known or suspected', 'Ageing or inadequate M&E'], q3_3_surveys: ['Asbestos management survey', 'Condition'], q3_4_planningConsents: 'No consent required',
    q3_5_accessConstraints: [A.hours, A.shared], q3_6_occupation: 'Fully occupied', q3_8_siteContext: NOCTX,
    q4_4_priorities: ['Minimise disruption', 'Fixed / certain final cost'], q4_5_designStage: 'Concept only (Stage 0–1)', q4_7_funding: 'Grant or public funding', q4_8_publicClient: 'Yes',
  }, { typical: true, add: ['S-0017'] },
  { cLo: 2.2e6, cHi: 3.1e6, tLo: 3.3e6, tHi: 4.7e6, wLo: 50, wHi: 65, pLo: 100, pHi: 130, note: 'Occupied, flat by flat' }),

  S('RES-3', 'Residential', 'External works only', {
    q1_0_projectName: '[TEST4] Gipton estate parking and landscaping', q1_1_postcode: 'LS9', q1_5_size: 3000,
    q2_1_objective: 'Resurface the estate car park and paths, add EV charging, new lighting and planting across 3,000 m² of housing estate grounds.',
    q2_4_specLevel: 'Standard', q2_5_standards: 'None',
    q3_1_knownIssues: ['Existing hardstanding to break out', 'Underground services or obstructions'], q3_3_surveys: ['Topographic', 'Utilities / statutory services search'], q3_4_planningConsents: 'No consent required',
    q3_5_accessConstraints: [A.shared], q3_6_occupation: 'Fully occupied', q3_8_siteContext: NOCTX,
    q4_3_budget: 450000, q4_3a_vatRecovery: 'No', q4_4_priorities: ['Lowest cost'], q4_5_designStage: 'Concept complete (Stage 2)', q4_8_publicClient: 'Yes',
  }, { typical: true, add: ['S-0057', 'S-0080'], qty: { 'S-0057-01': 6 } },
  { cLo: 300e3, cHi: 480e3, tLo: 430e3, tHi: 690e3, wLo: 10, wHi: 14, pLo: 35, pHi: 50, note: 'Budget tight' }),

  // ── Student accommodation ──
  S('STU-1', 'Student accommodation (PBSA / halls)', 'New Build', {
    q1_0_projectName: '[TEST4] Lenton 220-bed student block', q1_1_postcode: 'NG7', q1_2_storeys: '6', q1_6_heightOver18m: 'Yes', q1_5_size: 6000,
    q2_1_objective: 'Build a six-storey purpose-built student block of 220 en-suite rooms in cluster flats, with a ground-floor common room, sprinklers and solar PV.',
    q2_4_specLevel: 'Standard', q2_5_standards: 'BREEAM',
    q3_1_knownIssues: ['Contaminated land', 'Existing structures on site to demolish'], q3_3_surveys: ['Topographic', 'Ground investigation', 'Contamination survey (Phase 1 / Phase 2)'], q3_4_planningConsents: 'Full planning',
    q3_5_accessConstraints: [A.road], q3_6_occupation: 'Vacant or decanted', q3_8_siteContext: NOCTX,
    q4_1_targetDate: '2029-08-31', q4_3_budget: 24000000, q4_3a_vatRecovery: 'No', q4_4_priorities: ['Speed', 'Fixed / certain final cost'], q4_5_designStage: 'Concept complete (Stage 2)',
    q5_1_financialBenefit: ['Rental or commercial income'], q5_2_annualBenefit: 1900000,
  }, { typical: true, add: ['S-0050', 'S-0054', 'S-0055', 'S-0002'], opt: { 'S-0008': 'S-0008-02' }, qty: { 'S-0002-01': 800 } },
  { cLo: 13.8e6, cHi: 16.8e6, tLo: 20.7e6, tHi: 25.2e6, wLo: 70, wHi: 85, pLo: 120, pHi: 145, note: 'Gateway 2 (18 m+), hard Aug 2029 target' }),

  S('STU-2', 'Student accommodation (PBSA / halls)', 'Refurbishment', {
    q1_0_projectName: '[TEST4] Bowland halls summer refresh', q1_1_postcode: 'LA1', q1_2_storeys: '4', q1_4_buildingAge: '1900–1979', q1_5_size: 3200,
    q2_1_objective: 'Refresh 120 study bedrooms and kitchens in a 1972 hall over one summer vacation: new floors, decoration, kitchens and LED lighting.',
    q2_3_interventionLevel: 'Finishes with minor services', q2_4_specLevel: 'Standard', q2_5_standards: 'University design guide',
    q3_1_knownIssues: ['Asbestos known or suspected'], q3_3_surveys: ['Asbestos refurbishment & demolition survey'], q3_4_planningConsents: 'No consent required',
    q3_5_accessConstraints: [A.periods], q3_5a_workWindow: 'Only within set dates', q3_5b_workPeriods: [{ from: '2027-06-14', to: '2027-09-17' }],
    q3_6_occupation: 'Vacant or decanted', q3_8_siteContext: NOCTX,
    q4_1_targetDate: '2027-09-17', q4_3_budget: 3000000, q4_3a_vatRecovery: 'Not sure', q4_4_priorities: ['Speed', 'Lowest cost'], q4_5_designStage: 'Developed design (Stage 3)', q4_8_publicClient: 'Yes',
  }, { typical: true },
  { cLo: 1.8e6, cHi: 2.6e6, tLo: 2.6e6, tHi: 3.8e6, wLo: 12, wHi: 14, pLo: 30, pHi: 40, note: 'Must fit the 14-week summer window' }),

  S('STU-3', 'Student accommodation (PBSA / halls)', 'Extension', {
    q1_0_projectName: '[TEST4] Parkwood halls 16-room extension', q1_1_postcode: 'CT2', q1_2_storeys: '2', q1_4_buildingAge: '1980–1999', q1_5_size: 450,
    q2_1_objective: 'Add a two-storey wing of 16 en-suite study bedrooms and a shared kitchen to an existing 1990s hall of residence.',
    q2_4_specLevel: 'Standard', q2_5_standards: 'University design guide',
    q3_1_knownIssues: ['Trees or hedgerow on site'], q3_3_surveys: ['Topographic', 'Arboricultural survey (BS5837)'], q3_4_planningConsents: 'Full planning',
    q3_5_accessConstraints: [A.shared], q3_6_occupation: 'Fully occupied', q3_8_siteContext: [ECO],
    q4_4_priorities: ['Design quality'], q4_5_designStage: 'Concept only (Stage 0–1)', q4_8_publicClient: 'Yes',
  }, { typical: true, add: ['S-0025', 'S-0027'] },
  { cLo: 1.26e6, cHi: 1.53e6, tLo: 1.9e6, tHi: 2.3e6, wLo: 32, wHi: 40, pLo: 90, pHi: 110, note: 'Ecology / trees' }),

  // ── Commercial offices ──
  S('OFF-1', 'Commercial offices', 'Fit-out', {
    q1_0_projectName: '[TEST4] Moorgate Cat A floor', q1_1_postcode: 'EC2', q1_4_buildingAge: 'Post-2000', q1_5_size: 1200,
    q2_1_objective: 'Cat A fit-out of a 1,200 m² open-plan floor for letting: raised floor, ceilings, LED lighting, VRF cooling and WCs.',
    q2_3_interventionLevel: 'Finishes with minor services', q2_4_specLevel: 'High', q2_5_standards: 'BREEAM',
    q3_1_knownIssues: ['None identified'], q3_3_surveys: ['Condition'], q3_4_planningConsents: 'No consent required',
    q3_5_accessConstraints: [A.hours, A.deliveries], q3_6_occupation: 'Partially occupied', q3_8_siteContext: NOCTX,
    q4_3_budget: 1700000, q4_3a_vatRecovery: 'Yes — fully', q4_4_priorities: ['Speed', 'Design quality'], q4_5_designStage: 'Developed design (Stage 3)',
    q5_1_financialBenefit: ['Rental or commercial income'], q5_2_annualBenefit: 900000,
  }, { typical: true, add: ['S-0042'], opt: { 'S-0022': 'S-0022-02' } },
  { cLo: 1.1e6, cHi: 1.6e6, tLo: 1.3e6, tHi: 1.9e6, wLo: 12, wHi: 16, pLo: 26, pHi: 36, note: 'London, VAT recovered' }),

  S('OFF-2', 'Commercial offices', 'Refurbishment', {
    q1_0_projectName: '[TEST4] Portland Street office refurbishment', q1_1_postcode: 'M1', q1_2_storeys: '4', q1_4_buildingAge: '1980–1999', q1_5_size: 2500,
    q2_1_objective: 'Strip back a vacant 1992 four-storey office to shell and core and replace all building services, lifts and finishes to bring it to EPC B.',
    q2_3_interventionLevel: 'Full systems replacement', q2_4_specLevel: 'Standard', q2_5_standards: 'Net zero, BREEAM',
    q3_1_knownIssues: ['Ageing or inadequate M&E', 'Asbestos known or suspected'], q3_3_surveys: ['Asbestos refurbishment & demolition survey', 'Condition', 'Energy audit'], q3_4_planningConsents: 'Permitted development',
    q3_5_accessConstraints: [A.road], q3_6_occupation: 'Vacant or decanted', q3_8_siteContext: [PARTY],
    q4_3_budget: 5000000, q4_3a_vatRecovery: 'Yes — fully', q4_4_priorities: ['Fixed / certain final cost'], q4_5_designStage: 'Concept complete (Stage 2)',
    q5_1_financialBenefit: ['Increased asset value'],
  }, { typical: true, add: ['S-0054'], opt: { 'S-0039': 'S-0039-02' } },
  { cLo: 3.25e6, cHi: 4.5e6, tLo: 4.1e6, tHi: 5.6e6, wLo: 36, wHi: 45, pLo: 70, pHi: 90, note: '' }),

  S('OFF-3', 'Commercial offices', 'New Build', {
    q1_0_projectName: '[TEST4] Cambridge Science Park office', q1_1_postcode: 'CB4', q1_2_storeys: '2', q1_5_size: 600,
    q2_1_objective: 'Build a two-storey 600 m² office for a growing tech firm on its own car park, all-electric with solar PV and EV charging.',
    q2_4_specLevel: 'Standard', q2_5_standards: 'BREEAM, Net zero',
    q3_1_knownIssues: ['None identified'], q3_3_surveys: ['Topographic', 'Ground investigation'], q3_4_planningConsents: 'Full planning',
    q3_5_accessConstraints: NONE_ACCESS, q3_6_occupation: 'Vacant or decanted', q3_8_siteContext: NOCTX,
    q4_4_priorities: ['Design quality', 'Speed'], q4_5_designStage: 'Concept only (Stage 0–1)',
  }, { typical: true, add: ['S-0055', 'S-0057'], opt: { 'S-0039': 'S-0039-02' } },
  { cLo: 1.56e6, cHi: 1.92e6, tLo: 2.3e6, tHi: 2.9e6, wLo: 36, wHi: 44, pLo: 90, pHi: 110, note: 'No budget' }),

  // ── Education ──
  S('EDU-1', 'Education', 'Extension', {
    q1_0_projectName: '[TEST4] Mile Cross primary two-classroom extension', q1_1_postcode: 'NR3', q1_2_storeys: '1', q1_4_buildingAge: '1900–1979', q1_5_size: 220,
    q2_1_objective: 'Add two single-storey classrooms with a shared WC block to an occupied primary school to take a bulge class from September 2028.',
    q2_4_specLevel: 'Standard', q2_5_standards: 'Net zero',
    q3_1_knownIssues: ['Asbestos known or suspected', 'Drainage issues'], q3_3_surveys: ['Asbestos management survey', 'Topographic'], q3_4_planningConsents: 'Full planning',
    q3_5_accessConstraints: [A.hours, A.shared], q3_6_occupation: 'Fully occupied', q3_8_siteContext: NOCTX,
    q4_1_targetDate: '2028-08-31', q4_3_budget: 900000, q4_3a_vatRecovery: 'Yes — fully', q4_4_priorities: ['Minimise disruption', 'Lowest cost'], q4_5_designStage: 'Concept only (Stage 0–1)', q4_7_funding: 'Grant or public funding', q4_8_publicClient: 'Yes',
  }, { typical: true },
  { cLo: 660e3, cHi: 790e3, tLo: 830e3, tHi: 990e3, wLo: 26, wHi: 32, pLo: 80, pHi: 95, note: 'Target Aug 2028' }),

  S('EDU-2', 'Education', 'Refurbishment', {
    q1_0_projectName: '[TEST4] Erdington secondary block envelope', q1_1_postcode: 'B23', q1_2_storeys: '2', q1_4_buildingAge: '1900–1979', q1_5_size: 1500,
    q2_1_objective: 'Replace the windows and flat roof and insulate the walls of a 1970s two-storey teaching block, working only in school holidays.',
    q2_3_interventionLevel: 'Fabric and finishes only', q2_4_specLevel: 'Standard', q2_5_standards: 'PAS 2035',
    q3_1_knownIssues: ['Asbestos known or suspected', 'Damp or water ingress'], q3_3_surveys: ['Asbestos refurbishment & demolition survey', 'Condition'], q3_4_planningConsents: 'No consent required',
    q3_5_accessConstraints: [A.periods], q3_5a_workWindow: 'School / university holidays only', q3_6_occupation: 'Fully occupied', q3_8_siteContext: NOCTX,
    q4_3_budget: 1100000, q4_3a_vatRecovery: 'Yes — fully', q4_4_priorities: ['Funder / compliance requirement', 'Minimise disruption'], q4_5_designStage: 'Concept complete (Stage 2)', q4_7_funding: 'Grant or public funding', q4_8_publicClient: 'Yes',
    q5_1_financialBenefit: ['Energy or operational cost savings'], q5_2_annualBenefit: 40000,
  }, { typical: true },
  { cLo: 680e3, cHi: 1.05e6, tLo: 900e3, tHi: 1.4e6, wLo: 10, wHi: 14, pLo: 40, pHi: 70, note: 'Holidays only, so construction spread out' }),

  S('EDU-3', 'Education', 'Fit-out', {
    q1_0_projectName: '[TEST4] Chemistry teaching lab fit-out', q1_1_postcode: 'OX1', q1_4_buildingAge: 'Post-2000', q1_5_size: 400,
    q2_1_objective: 'Turn a 400 m² open floor into a chemistry teaching lab with fume cupboards, lab benching, gases and new ventilation.',
    q2_3_interventionLevel: 'Reconfiguration or full redesign', q2_4_specLevel: 'High', q2_5_standards: 'University design guide',
    q3_1_knownIssues: ['Ageing or inadequate M&E'], q3_3_surveys: ['Condition'], q3_4_planningConsents: 'No consent required',
    q3_5_accessConstraints: [A.shared, A.hours], q3_6_occupation: 'Partially occupied', q3_8_siteContext: NOCTX,
    q4_3_budget: 2200000, q4_3a_vatRecovery: 'Partly', q4_4_priorities: ['Design quality'], q4_5_designStage: 'Concept complete (Stage 2)', q4_8_publicClient: 'Yes',
  }, { typical: true, add: ['S-0033', 'S-0059'] },
  { cLo: 1.2e6, cHi: 1.8e6, tLo: 1.7e6, tHi: 2.6e6, wLo: 20, wHi: 28, pLo: 55, pHi: 70, note: '' }),

  // ── Healthcare ──
  S('HEA-1', 'Healthcare', 'New Build', {
    q1_0_projectName: '[TEST4] Aylestone GP surgery', q1_1_postcode: 'LE2', q1_2_storeys: '2', q1_5_size: 900,
    q2_1_objective: 'Build a two-storey 900 m² GP surgery with 14 consulting rooms, a lift and a pharmacy to replace two outgrown practices.',
    q2_4_specLevel: 'Standard', q2_5_standards: 'NHS design guide, BREEAM',
    q3_1_knownIssues: ['Trees or hedgerow on site'], q3_3_surveys: ['Topographic', 'Ground investigation', 'Ecological appraisal'], q3_4_planningConsents: 'Full planning',
    q3_5_accessConstraints: NONE_ACCESS, q3_6_occupation: 'Vacant or decanted', q3_8_siteContext: [ECO],
    q4_3_budget: 4200000, q4_3a_vatRecovery: 'No', q4_4_priorities: ['Fixed / certain final cost', 'Design quality'], q4_5_designStage: 'Concept complete (Stage 2)',
  }, { typical: true, add: ['S-0054', 'S-0034'] },
  { cLo: 2.7e6, cHi: 3.2e6, tLo: 4.0e6, tHi: 4.9e6, wLo: 45, wHi: 55, pLo: 100, pHi: 120, note: '' }),

  S('HEA-2', 'Healthcare', 'Fit-out', {
    q1_0_projectName: '[TEST4] Finnieston physiotherapy clinic', q1_1_postcode: 'G3', q1_4_buildingAge: '1980–1999', q1_5_size: 300,
    q2_1_objective: 'Fit out a 300 m² ground-floor shell as a private physiotherapy clinic with six treatment rooms, a small gym and accessible WCs.',
    q2_3_interventionLevel: 'Full systems replacement', q2_4_specLevel: 'Standard', q2_5_standards: 'None',
    q3_1_knownIssues: ['None identified'], q3_3_surveys: ['Asbestos management survey'], q3_4_planningConsents: 'Change of use',
    q3_5_accessConstraints: [A.road], q3_6_occupation: 'Vacant or decanted', q3_8_siteContext: NOCTX,
    q4_3_budget: 600000, q4_3a_vatRecovery: 'No', q4_4_priorities: ['Lowest cost', 'Speed'], q4_5_designStage: 'Concept only (Stage 0–1)',
    q5_1_financialBenefit: ['Rental or commercial income'], q5_2_annualBenefit: 120000,
  }, { typical: true, add: ['S-0034'] },
  { cLo: 450e3, cHi: 630e3, tLo: 680e3, tHi: 950e3, wLo: 14, wHi: 20, pLo: 45, pHi: 60, note: 'Scotland; budget short' }),

  S('HEA-3', 'Healthcare', 'Extension', {
    q1_0_projectName: '[TEST4] Derriford 28-bed ward extension', q1_1_postcode: 'PL6', q1_2_storeys: '2', q1_4_buildingAge: '1900–1979', q1_5_size: 1200,
    q2_1_objective: 'Add a two-storey 28-bed ward block beside a working hospital, with medical gases, nurse call and a bed lift, linked to the existing corridor.',
    q2_4_specLevel: 'High', q2_5_standards: 'NHS design guide, Net zero',
    q3_1_knownIssues: ['Underground services or obstructions', 'Asbestos known or suspected'], q3_3_surveys: ['Topographic', 'Utilities / statutory services search', 'Asbestos management survey'], q3_4_planningConsents: 'Full planning',
    q3_5_accessConstraints: [A.shared, A.hours, A.deliveries], q3_6_occupation: 'Fully occupied', q3_8_siteContext: NOCTX,
    q4_3_budget: 9000000, q4_3a_vatRecovery: 'Partly', q4_4_priorities: ['Minimise disruption', 'Fixed / certain final cost'], q4_5_designStage: 'Concept complete (Stage 2)', q4_7_funding: 'Grant or public funding', q4_8_publicClient: 'Yes',
  }, { typical: true, add: ['S-0061', 'S-0062', 'S-0054', 'S-0048'], opt: { 'S-0054': 'S-0054-03' } },
  { cLo: 5.4e6, cHi: 6.6e6, tLo: 8.0e6, tHi: 10.3e6, wLo: 55, wHi: 70, pLo: 110, pHi: 135, note: 'Live hospital' }),

  // ── Retail ──
  S('RET-1', 'Retail', 'Fit-out', {
    q1_0_projectName: '[TEST4] North Laine shop fit-out', q1_1_postcode: 'BN1', q1_4_buildingAge: 'Pre-1900', q1_5_size: 180,
    q2_1_objective: 'Fit out a 180 m² shop unit for a clothing brand: new floor, lighting, fitting rooms, a staff WC and shopfront signage.',
    q2_3_interventionLevel: 'Finishes with minor services', q2_4_specLevel: 'Standard', q2_5_standards: 'None',
    q3_1_knownIssues: ['Damp or water ingress'], q3_3_surveys: ['Condition'], q3_4_planningConsents: 'No consent required',
    q3_5_accessConstraints: [A.deliveries, A.road], q3_6_occupation: 'Vacant or decanted', q3_8_siteContext: [CONS],
    q4_1_targetDate: '2027-04-30', q4_3_budget: 200000, q4_3a_vatRecovery: 'Yes — fully', q4_4_priorities: ['Speed'], q4_5_designStage: 'Developed design (Stage 3)',
  }, { typical: true, add: ['S-0035'] },
  { cLo: 130e3, cHi: 200e3, tLo: 150e3, tHi: 240e3, wLo: 6, wHi: 8, pLo: 14, pHi: 20, note: 'Hard Apr 2027 opening' }),

  S('RET-2', 'Retail', 'Refurbishment', {
    q1_0_projectName: '[TEST4] Fargate department store refurbishment', q1_1_postcode: 'S1', q1_2_storeys: '3', q1_4_buildingAge: '1900–1979', q1_5_size: 1800,
    q2_1_objective: 'Refurbish a 1930s three-storey store while the ground floor keeps trading: new services, escalator replaced by a lift, roof repairs and new finishes.',
    q2_3_interventionLevel: 'Full systems replacement', q2_4_specLevel: 'Standard', q2_5_standards: 'None',
    q3_1_knownIssues: ['Asbestos known or suspected', 'Fire safety deficiencies', 'Ageing or inadequate M&E'], q3_3_surveys: ['Asbestos refurbishment & demolition survey', 'Structural'], q3_4_planningConsents: 'Full planning',
    q3_5_accessConstraints: [A.hours, A.road], q3_6_occupation: 'Partially occupied', q3_8_siteContext: [CONS, PARTY],
    q4_3a_vatRecovery: 'Yes — fully', q4_4_priorities: ['Minimise disruption', 'Fixed / certain final cost'], q4_5_designStage: 'Concept only (Stage 0–1)',
  }, { typical: true, add: ['S-0054', 'S-0064'] },
  { cLo: 2.3e6, cHi: 3.2e6, tLo: 2.9e6, tHi: 4.1e6, wLo: 36, wHi: 46, pLo: 85, pHi: 105, note: 'No budget' }),

  S('RET-3', 'Retail', 'Demolition only', {
    q1_0_projectName: '[TEST4] Former retail warehouse demolition', q1_1_postcode: 'SN1', q1_2_storeys: '1', q1_4_buildingAge: '1980–1999', q1_5_size: 1500,
    q2_1_objective: 'Demolish a vacant 1,500 m² single-storey retail warehouse to slab level and clear the site for sale.',
    q2_5_standards: 'None',
    q3_1_knownIssues: ['Asbestos known or suspected'], q3_3_surveys: ['Asbestos refurbishment & demolition survey'], q3_4_planningConsents: 'Prior approval',
    q3_5_accessConstraints: NONE_ACCESS, q3_6_occupation: 'Vacant or decanted', q3_8_siteContext: NOCTX,
    q4_3_budget: 250000, q4_3a_vatRecovery: 'Yes — fully', q4_4_priorities: ['Lowest cost'], q4_5_designStage: 'Concept complete (Stage 2)',
  }, { typical: true },
  { cLo: 100e3, cHi: 170e3, tLo: 120e3, tHi: 210e3, wLo: 6, wHi: 10, pLo: 20, pHi: 30, note: '' }),

  // ── Industrial / warehouse ──
  S('IND-1', 'Industrial / warehouse', 'New Build', {
    q1_0_projectName: '[TEST4] Coventry distribution warehouse', q1_1_postcode: 'CV3', q1_2_storeys: '1', q1_3a_officeShare: 10, q1_3b_mainSpace: 'Storage / warehouse', q1_5_size: 4000,
    q2_1_objective: 'Build a 4,000 m² steel-frame distribution warehouse with a two-storey office block (10%), a service yard and car parking.',
    q2_4_specLevel: 'Basic', q2_5_standards: 'BREEAM',
    q3_1_knownIssues: ['Made ground or fill'], q3_3_surveys: ['Topographic', 'Ground investigation'], q3_4_planningConsents: 'Full planning',
    q3_5_accessConstraints: NONE_ACCESS, q3_6_occupation: 'Vacant or decanted', q3_8_siteContext: NOCTX,
    q4_3_budget: 4500000, q4_3a_vatRecovery: 'Yes — fully', q4_4_priorities: ['Lowest cost', 'Speed'], q4_5_designStage: 'Concept complete (Stage 2)',
    q5_1_financialBenefit: ['Rental or commercial income'], q5_2_annualBenefit: 380000,
  }, { typical: true, add: ['S-0075', 'S-0074'], qty: { 'S-0073-01': 600, 'S-0074-01': 40, 'S-0075-01': 3000 } },
  { cLo: 3.4e6, cHi: 4.6e6, tLo: 4.1e6, tHi: 5.5e6, wLo: 30, wHi: 38, pLo: 70, pHi: 85, note: 'Shed pricing was ~2× benchmark in batch 3' }),

  S('IND-2', 'Industrial / warehouse', 'Extension', {
    q1_0_projectName: '[TEST4] Longton factory extension', q1_1_postcode: 'ST4', q1_2_storeys: '1', q1_4_buildingAge: '1980–1999', q1_3a_officeShare: 5, q1_3b_mainSpace: 'Factory / production', q1_5_size: 800,
    q2_1_objective: 'Extend a working ceramics factory by 800 m² of single-storey production space with compressed air and a new power supply.',
    q2_4_specLevel: 'Standard', q2_5_standards: 'None',
    q3_1_knownIssues: ['Underground services or obstructions'], q3_3_surveys: ['Topographic', 'Utilities / statutory services search'], q3_4_planningConsents: 'Full planning',
    q3_5_accessConstraints: [A.shared], q3_6_occupation: 'Fully occupied', q3_8_siteContext: NOCTX,
    q4_4_priorities: ['Speed', 'Minimise disruption'], q4_5_designStage: 'Concept only (Stage 0–1)',
  }, { typical: true, add: ['S-0058', 'S-0044'] },
  { cLo: 900e3, cHi: 1.2e6, tLo: 1.05e6, tHi: 1.45e6, wLo: 20, wHi: 26, pLo: 60, pHi: 75, note: 'VAT not asked (no budget)' }),

  S('IND-3', 'Industrial / warehouse', 'External works only', {
    q1_0_projectName: '[TEST4] Doncaster HGV yard extension', q1_1_postcode: 'DN4', q1_5_size: 5000,
    q2_1_objective: 'Build a new 5,000 m² concrete HGV yard with drainage, interceptor, lighting and security fencing next to an existing warehouse.',
    q2_4_specLevel: 'Standard', q2_5_standards: 'Highways',
    q3_1_knownIssues: ['High water table'], q3_3_surveys: ['Topographic', 'Ground investigation', 'Drainage / percolation testing'], q3_4_planningConsents: 'Full planning',
    q3_5_accessConstraints: [A.shared], q3_6_occupation: 'Fully occupied', q3_8_siteContext: NOCTX,
    q4_3_budget: 1000000, q4_3a_vatRecovery: 'Yes — fully', q4_4_priorities: ['Lowest cost'], q4_5_designStage: 'Concept complete (Stage 2)',
  }, { typical: true, add: ['S-0075', 'S-0079'], qty: { 'S-0073-01': 500, 'S-0075-01': 4500 } },
  { cLo: 600e3, cHi: 900e3, tLo: 720e3, tHi: 1.08e6, wLo: 12, wHi: 18, pLo: 45, pHi: 60, note: '' }),

  // ── Hospitality / leisure ──
  S('HOS-1', 'Hospitality / leisure', 'Fit-out', {
    q1_0_projectName: '[TEST4] Old Town restaurant fit-out', q1_1_postcode: 'EH1', q1_4_buildingAge: 'Pre-1900', q1_5_size: 250,
    q2_1_objective: 'Fit out a 250 m² restaurant in a listed Old Town building: full commercial kitchen, bar, new WCs, extract and a high-end dining room.',
    q2_3_interventionLevel: 'Reconfiguration or full redesign', q2_4_specLevel: 'High', q2_5_standards: 'Food hygiene',
    q3_1_knownIssues: ['Damp or water ingress', 'Fire safety deficiencies'], q3_3_surveys: ['Condition', 'Asbestos refurbishment & demolition survey'], q3_4_planningConsents: 'Full planning + Listed Building Consent',
    q3_5_accessConstraints: [A.deliveries, A.road], q3_6_occupation: 'Vacant or decanted', q3_8_siteContext: [CONS, PARTY],
    q4_3_budget: 650000, q4_3a_vatRecovery: 'Yes — fully', q4_4_priorities: ['Design quality', 'Speed'], q4_5_designStage: 'Concept complete (Stage 2)',
    q5_1_financialBenefit: ['Rental or commercial income'], q5_2_annualBenefit: 180000,
  }, { typical: true, add: ['S-0032'] },
  { cLo: 500e3, cHi: 700e3, tLo: 600e3, tHi: 840e3, wLo: 10, wHi: 14, pLo: 40, pHi: 55, note: 'Scotland, listed' }),

  S('HOS-2', 'Hospitality / leisure', 'Refurbishment', {
    q1_0_projectName: '[TEST4] Lime Street hotel bedroom refurbishment', q1_1_postcode: 'L1', q1_2_storeys: '5', q1_6_heightOver18m: 'No', q1_4_buildingAge: 'Pre-1900', q1_5_size: 3000,
    q2_1_objective: 'Refurbish 90 bedrooms and en-suites in a trading Victorian hotel, two floors at a time, with new corridors and fire doors.',
    q2_3_interventionLevel: 'Finishes with minor services', q2_4_specLevel: 'Standard', q2_5_standards: 'None',
    q3_1_knownIssues: ['Fire safety deficiencies', 'Asbestos known or suspected'], q3_3_surveys: ['Asbestos refurbishment & demolition survey', 'Fire risk assessment'], q3_4_planningConsents: 'No consent required',
    q3_5_accessConstraints: [A.hours, A.shared], q3_6_occupation: 'Partially occupied', q3_8_siteContext: [CONS],
    q4_3_budget: 3500000, q4_3a_vatRecovery: 'Yes — fully', q4_4_priorities: ['Minimise disruption'], q4_5_designStage: 'Developed design (Stage 3)',
    q4_6_phasing: 'Multiple phases', q4_6a_phaseCount: 3, q4_6b_phaseGapWeeks: 0,
  }, { typical: true, add: ['S-0025', 'S-0020'] },
  { cLo: 2.1e6, cHi: 3.0e6, tLo: 2.6e6, tHi: 3.75e6, wLo: 30, wHi: 40, pLo: 50, pHi: 65, note: '3 phases' }),

  S('HOS-3', 'Hospitality / leisure', 'New Build', {
    q1_0_projectName: '[TEST4] Swansea community leisure centre', q1_1_postcode: 'SA1', q1_2_storeys: '2', q1_5_size: 2500,
    q2_1_objective: 'Build a two-storey 2,500 m² leisure centre with a sports hall, gym, studios, changing rooms and a café, powered by heat pumps and solar PV.',
    q2_4_specLevel: 'Standard', q2_5_standards: 'BREEAM, Net zero',
    q3_1_knownIssues: ['Contaminated land', 'High water table'], q3_3_surveys: ['Topographic', 'Ground investigation', 'Flood risk assessment'], q3_4_planningConsents: 'Full planning',
    q3_5_accessConstraints: NONE_ACCESS, q3_6_occupation: 'Vacant or decanted', q3_8_siteContext: NOCTX,
    q4_3_budget: 11000000, q4_3a_vatRecovery: 'Yes — fully', q4_4_priorities: ['Funder / compliance requirement', 'Fixed / certain final cost'], q4_5_designStage: 'Concept complete (Stage 2)', q4_7_funding: 'Grant or public funding', q4_8_publicClient: 'Yes',
  }, { typical: true, add: ['S-0037', 'S-0026', 'S-0055', 'S-0032'], opt: { 'S-0008': 'S-0008-02', 'S-0039': 'S-0039-02' }, qty: { 'S-0026-01': 20, 'S-0037-01': 600 } },
  { cLo: 8.0e6, cHi: 10.0e6, tLo: 10.0e6, tHi: 13.0e6, wLo: 60, wHi: 72, pLo: 110, pHi: 130, note: 'Wales' }),

  // ── Mixed use ──
  S('MIX-1', 'Mixed use', 'Other or mixed', {
    q1_0_projectName: '[TEST4] Grainger Street shop and flats conversion', q1_1_postcode: 'NE1', q1_2_storeys: '4', q1_4_buildingAge: 'Pre-1900', q1_5_size: 1400,
    q2_1_objective: 'Convert a vacant Victorian four-storey building into a ground-floor shop with 12 flats above: new services, windows, a lift and repairs to the stone facade.',
    q2_4_specLevel: 'Standard', q2_5_standards: 'None',
    q3_1_knownIssues: ['Damp or water ingress', 'Structural concerns', 'Asbestos known or suspected'], q3_3_surveys: ['Structural', 'Asbestos refurbishment & demolition survey'], q3_4_planningConsents: 'Change of use',
    q3_5_accessConstraints: [A.road, A.tight], q3_6_occupation: 'Vacant or decanted', q3_8_siteContext: [CONS, PARTY],
    q4_3_budget: 3200000, q4_3a_vatRecovery: 'Partly', q4_4_priorities: ['Lowest cost', 'Design quality'], q4_5_designStage: 'Concept only (Stage 0–1)',
    q5_1_financialBenefit: ['Rental or commercial income'], q5_2_annualBenefit: 190000,
  }, { typical: false, add: ['S-0001', 'S-0003', 'S-0017', 'S-0018', 'S-0019', 'S-0021', 'S-0022', 'S-0023', 'S-0025', 'S-0027', 'S-0039', 'S-0040', 'S-0045', 'S-0046', 'S-0049', 'S-0054', 'S-0064', 'S-0066', 'S-0020'] },
  { cLo: 2.0e6, cHi: 2.7e6, tLo: 2.7e6, tHi: 3.7e6, wLo: 40, wHi: 50, pLo: 90, pHi: 115, note: 'Other or mixed: tick individually' }),

  S('MIX-2', 'Mixed use', 'New Build', {
    q1_0_projectName: '[TEST4] Reading station quarter mixed-use block', q1_1_postcode: 'RG1', q1_2_storeys: '4', q1_5_size: 3200,
    q2_1_objective: 'Build a four-storey block with ground-floor commercial space and 30 flats above, on a former car park near the station.',
    q2_4_specLevel: 'Standard', q2_5_standards: 'Net zero',
    q3_1_knownIssues: ['Made ground or fill', 'Underground services or obstructions'], q3_3_surveys: ['Topographic', 'Ground investigation', 'Utilities / statutory services search'], q3_4_planningConsents: 'Full planning',
    q3_5_accessConstraints: [A.road, A.tight], q3_6_occupation: 'Vacant or decanted', q3_8_siteContext: [PARTY],
    q4_3_budget: 10000000, q4_3a_vatRecovery: 'Partly', q4_4_priorities: ['Fixed / certain final cost', 'Lowest cost'], q4_5_designStage: 'Developed design (Stage 3)',
    q5_1_financialBenefit: ['Rental or commercial income'], q5_2_annualBenefit: 620000,
  }, { typical: true, add: ['S-0054', 'S-0081'], qty: { 'S-0081-01': 40 } },
  { cLo: 7.7e6, cHi: 9.3e6, tLo: 10.0e6, tHi: 12.0e6, wLo: 60, wHi: 70, pLo: 95, pHi: 115, note: 'Budget tight' }),

  S('MIX-3', 'Mixed use', 'Demolition only', {
    q1_0_projectName: '[TEST4] Above Bar mixed block demolition', q1_1_postcode: 'SO14', q1_2_storeys: '3', q1_4_buildingAge: '1900–1979', q1_5_size: 2800,
    q2_1_objective: 'Demolish a vacant 1960s three-storey block of shops and offices that adjoins a listed neighbour, remove asbestos and leave a level site.',
    q2_5_standards: 'None',
    q3_1_knownIssues: ['Asbestos known or suspected', 'Structures attached to neighbouring buildings'], q3_3_surveys: ['Asbestos refurbishment & demolition survey', 'Structural'], q3_4_planningConsents: 'Prior approval',
    q3_5_accessConstraints: [A.road, A.hours], q3_6_occupation: 'Vacant or decanted', q3_8_siteContext: [PARTY, CONS],
    q4_4_priorities: ['Minimise disruption'], q4_5_designStage: 'Concept only (Stage 0–1)', q4_8_publicClient: 'Yes',
  }, { typical: true },
  { cLo: 330e3, cHi: 560e3, tLo: 450e3, tHi: 800e3, wLo: 12, wHi: 18, pLo: 35, pHi: 50, note: 'Party wall to listed building' }),

  // ── Other ──
  S('OTH-1', 'Other', 'Other or mixed', {
    q1_0_projectName: '[TEST4] Splott community centre', q1_1_postcode: 'CF10', q1_2_storeys: '1', q1_4_buildingAge: '1900–1979', q1_5_size: 650,
    q1_3_buildingUseOther: 'Community centre',
    q2_1_objective: 'Refurbish a 500 m² 1960s community centre and add a 150 m² hall extension, with new heating, kitchen, accessible WCs and roof.',
    q2_4_specLevel: 'Standard', q2_5_standards: 'Net zero',
    q3_1_knownIssues: ['Asbestos known or suspected', 'Ageing or inadequate M&E'], q3_3_surveys: ['Asbestos refurbishment & demolition survey', 'Condition'], q3_4_planningConsents: 'Full planning',
    q3_5_accessConstraints: NONE_ACCESS, q3_6_occupation: 'Vacant or decanted', q3_8_siteContext: NOCTX,
    q4_3_budget: 1600000, q4_3a_vatRecovery: 'No', q4_4_priorities: ['Funder / compliance requirement', 'Lowest cost'], q4_5_designStage: 'Concept complete (Stage 2)', q4_7_funding: 'Grant or public funding',
  }, { typical: false, add: ['S-0001', 'S-0003', 'S-0008', 'S-0009', 'S-0015', 'S-0016', 'S-0017', 'S-0018', 'S-0019', 'S-0021', 'S-0022', 'S-0023', 'S-0024', 'S-0027', 'S-0039', 'S-0040', 'S-0045', 'S-0046', 'S-0049'], opt: { 'S-0039': 'S-0039-02' } },
  { cLo: 1.0e6, cHi: 1.4e6, tLo: 1.6e6, tHi: 2.1e6, wLo: 30, wHi: 38, pLo: 75, pHi: 95, note: 'Charity cannot recover VAT' }),

  S('OTH-2', 'Other', 'Refurbishment', {
    q1_0_projectName: '[TEST4] St Saviourgate church hall', q1_1_postcode: 'YO1', q1_2_storeys: '1', q1_4_buildingAge: 'Pre-1900', q1_5_size: 300,
    q1_3_buildingUseOther: 'Church hall',
    q2_1_objective: 'Bring a Victorian church hall back into use: new heating, rewiring, accessible WC, kitchen, roof repairs and redecoration.',
    q2_3_interventionLevel: 'Full systems replacement', q2_4_specLevel: 'Standard', q2_5_standards: 'None',
    q3_1_knownIssues: ['Damp or water ingress', 'Ageing or inadequate M&E', 'Asbestos known or suspected'], q3_3_surveys: ['Condition'], q3_4_planningConsents: 'Full planning + Listed Building Consent',
    q3_5_accessConstraints: [A.tight], q3_6_occupation: 'Vacant or decanted', q3_8_siteContext: [CONS, ECO],
    q4_3_budget: 700000, q4_3a_vatRecovery: 'No', q4_4_priorities: ['Lowest cost'], q4_5_designStage: 'Concept only (Stage 0–1)', q4_7_funding: 'Not yet confirmed',
  }, { typical: true, add: ['S-0064', 'S-0066'], opt: { 'S-0064': 'S-0064-03' } },
  { cLo: 540e3, cHi: 750e3, tLo: 800e3, tHi: 1.1e6, wLo: 20, wHi: 26, pLo: 70, pHi: 90, note: 'Budget short' }),

  S('OTH-3', 'Other', 'Fit-out', {
    q1_0_projectName: '[TEST4] Exeter branch library fit-out', q1_1_postcode: 'EX4', q1_4_buildingAge: 'Post-2000', q1_5_size: 500,
    q1_3_buildingUseOther: 'Public library',
    q2_1_objective: 'Fit out a 500 m² ground-floor unit as a branch library: shelving, study areas, a children’s corner, WCs and new lighting.',
    q2_3_interventionLevel: 'Finishes with minor services', q2_4_specLevel: 'Standard', q2_5_standards: 'None',
    q3_1_knownIssues: ['None identified'], q3_3_surveys: ['Condition'], q3_4_planningConsents: 'Change of use',
    q3_5_accessConstraints: [A.road], q3_6_occupation: 'Vacant or decanted', q3_8_siteContext: NOCTX,
    q4_3_budget: 600000, q4_3a_vatRecovery: 'Yes — fully', q4_4_priorities: ['Lowest cost', 'Speed'], q4_5_designStage: 'Concept complete (Stage 2)', q4_8_publicClient: 'Yes',
  }, { typical: true, add: ['S-0028', 'S-0031'] },
  { cLo: 300e3, cHi: 450e3, tLo: 380e3, tHi: 560e3, wLo: 10, wHi: 14, pLo: 35, pHi: 50, note: 'Budget comfortable' }),
]
