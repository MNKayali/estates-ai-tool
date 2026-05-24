/**
 * reportBuilder.js — Fills the Word template with calculated data + AI prose.
 * Downloads template from GitHub, fills {TAG} placeholders with docxtemplater,
 * returns the completed .docx as a Buffer.
 *
 * CRITICAL: Never modifies template styles, fonts, margins, or headers/footers.
 * Every {TAG} in the template is provided a value — empty string if not applicable.
 */
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'

let _templateCache = { buf: null, fetchedAt: 0 }

async function fetchTemplate() {
  const now = Date.now()
  if (_templateCache.buf && now - _templateCache.fetchedAt < 10 * 60 * 1000) {
    return _templateCache.buf
  }
  const url = process.env.TEMPLATE_FILE_URL
  if (!url) throw new Error('TEMPLATE_FILE_URL environment variable not set')
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Failed to fetch Word template: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  _templateCache = { buf, fetchedAt: now }
  return buf
}

// ─── Formatters ───────────────────────────────────────────────────────────────
const f  = n => `£${Math.round(n || 0).toLocaleString('en-GB')}`
const f1k = n => `£${(Math.round((n || 0) / 1000) * 1000).toLocaleString('en-GB')}`
const pct = n => `${Math.round((n || 0) * 10) / 10}%`

function formatDate() {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ─── Works cost table rows ─────────────────────────────────────────────────────
function buildWorksRows(lineItems) {
  if (!lineItems || lineItems.length === 0) return []
  const rows = []
  let lastGroup = null
  const groupNames = {
    0: 'GROUP 0 — FACILITATING WORKS',
    1: 'GROUP 1 — SUBSTRUCTURE',
    2: 'GROUP 2 — SUPERSTRUCTURE',
    3: 'GROUP 3 — INTERNAL FINISHES',
    4: 'GROUP 4 — FITTINGS, FURNISHINGS & EQUIPMENT',
    5: 'GROUP 5 — MECHANICAL & ELECTRICAL SERVICES',
    6: 'GROUP 6 — PREFABRICATED / MODULAR',
    7: 'GROUP 7 — WORK TO EXISTING BUILDINGS',
    8: 'GROUP 8 — EXTERNAL WORKS',
  }
  for (const item of lineItems) {
    if (item.group !== lastGroup) {
      rows.push({ code: '', description: groupNames[item.group] || `GROUP ${item.group}`, unit: '', rate: '', qty: '', lineMid: '' })
      lastGroup = item.group
    }
    rows.push({
      code: item.code,
      description: item.description,
      unit: item.unit,
      rate: f(item.rate),
      qty: String(item.qty),
      lineMid: f1k(item.lineMid),
    })
  }
  return rows
}

// ─── Construction cost table rows ─────────────────────────────────────────────
function buildConstructionRows(cost) {
  const w = cost.works
  const c = cost.construction
  const b = cost.breakdown
  const p = cost.percentages
  return [
    { item: 'Works Cost', rate: '', amount: f1k(w.mid) },
    { item: `Contractor's Preliminaries (A)`, rate: pct(p.prelims) + ' of Works', amount: f1k(b.prelims) },
    { item: 'Overheads & Profit (B)', rate: pct(p.ohp) + ' of Works', amount: f1k(b.ohp) },
    { item: 'CONSTRUCTION COST TOTAL', rate: '', amount: f1k(c.mid) },
  ]
}

// ─── Total project cost table rows ────────────────────────────────────────────
function buildTotalRows(cost) {
  const c = cost.construction
  const t = cost.total
  const b = cost.breakdown
  const p = cost.percentages
  const vatAmt = cost.vat
  return [
    { item: 'Construction Cost', rate: '', amount: f1k(c.mid) },
    { item: 'Professional Fees (C)', rate: pct(p.fees) + ' of Construction', amount: f1k(b.fees) },
    { item: 'Developer & Project Costs (D)', rate: pct(p.devCosts) + ' of Construction', amount: f1k(b.devCosts) },
    { item: 'Risk Allowance (E)', rate: pct(p.risk) + ' of Works', amount: f1k(b.risk) },
    { item: 'Client Contingency (H)', rate: pct(p.contingency) + ' of Works', amount: f1k(b.contingency) },
    { item: 'Inflation Allowance (F)', rate: pct(p.inflation) + ' of Works', amount: f1k(b.inflation) },
    { item: 'TOTAL PROJECT COST (excl. VAT)', rate: '', amount: f1k(t.mid) },
    { item: 'VAT @ 20% (reference — recoverability to be confirmed)', rate: '20%', amount: f1k(vatAmt) },
  ]
}

// ─── Programme stage rows ──────────────────────────────────────────────────────
function buildProgRows(stages) {
  return (stages || []).map(s => ({
    stage:       s.stage,
    activity:    s.activity,
    durationWks: String(s.durationWks),
  }))
}

// ─── Risk register rows ────────────────────────────────────────────────────────
function buildRiskRows(riskRegister) {
  return (riskRegister || []).map((r, i) => ({
    ref:        r.ref || `R${String(i + 1).padStart(2, '0')}`,
    category:   r.category || '',
    description: r.description || '',
    likelihood: r.likelihood || '',
    impact:     r.impact || '',
    rating:     r.rating || '',
    mitigation: r.mitigation || '',
  }))
}

// ─── Constraint rows ───────────────────────────────────────────────────────────
function buildConstraintRows(constraints) {
  return (constraints || []).map(c => ({
    category: c.category || '',
    title:    c.title || '',
    text:     c.text || '',
  }))
}

// ─── ROI calculation ────────────────────────────────────────────────────────────
function calcRoi(answers, cost) {
  const annual = Number(answers.q5_2_annualBenefit) || 0
  const mid = cost.total.mid
  if (!annual || !mid) return null
  const paybackYears = Math.round((mid / annual) * 10) / 10
  return { annual, mid, paybackYears }
}

// ─── Scope text builders ────────────────────────────────────────────────────────
function buildScopeIncluded(lineItems) {
  if (!lineItems || lineItems.length === 0) return 'To be confirmed following completion of surveys and Stage 2 design.'
  const groups = {}
  for (const item of lineItems) {
    const g = item.group
    if (!groups[g]) groups[g] = []
    groups[g].push(item.description)
  }
  return Object.entries(groups)
    .map(([g, items]) => `Group ${g}:\n${items.map(d => `  - ${d}`).join('\n')}`)
    .join('\n\n')
}

// ─── Main export ───────────────────────────────────────────────────────────────

export async function buildReport({ answers, cost, programme, aiProse }) {
  const templateBuf = await fetchTemplate()
  const zip = new PizZip(templateBuf)
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  })

  const roi = calcRoi(answers, cost)
  const worksRows = buildWorksRows(cost.lineItems)
  const constructionRows = buildConstructionRows(cost)
  const totalRows = buildTotalRows(cost)
  const progRows = buildProgRows(programme.stages)
  const riskRows = buildRiskRows(aiProse.riskRegister)
  const constraintRows = buildConstraintRows(aiProse.constraints)

  const confidenceLabels = { A: 'Grade A — High Confidence', B: 'Grade B — Moderate Confidence', C: 'Grade C — Limited Confidence', D: 'Grade D — High Uncertainty' }
  const riskBadge = cost.percentages.riskLevel || 'Medium'

  // Build scope included text
  const scopeIncluded = buildScopeIncluded(cost.lineItems)

  // Build prog milestones as bullet text
  const milestoneText = (programme.milestones || []).map(m => `- ${m}`).join('\n')

  // Build prog assumptions
  const progAssumptionsText = (programme.standardAssumptions || []).map(a => `- ${a}`).join('\n')

  // Key findings bullets
  const kf = aiProse.keyFindings || []

  // Next steps bullets
  const nextStepsText = (aiProse.nextSteps || []).map(s => `- ${s}`).join('\n')

  // Scope assumptions bullets
  const scopeAssumptionsText = (aiProse.scopeAssumptions || []).map(s => `- ${s}`).join('\n')

  // Cost assumptions bullets
  const costAssumptionsText = [
    `- All rates are at Q2 2026 national mean (BCIS/RICS). BCIS location factor ${cost.bcisFactor} applied for ${cost.bcisRegion}.`,
    `- GIFA of ${cost.gifa} m² used as the pricing quantity. Rates are £/m² unless stated.`,
    `- Band position factor of ${cost.bandFactor} applied (${cost.interventionLevel}).`,
    `- Professional fees at ${cost.percentages.fees}% reflect the project being at RIBA Stage ${answers.q4_6_designStage || '0–1'}.`,
    `- Contingency fixed at 5% (RIBA Stage 0–1 standard). Survey uncertainty is captured in Risk Allowance (E).`,
    `- VAT at 20% is shown for reference only. Recoverability to be confirmed by the client's Finance team.`,
    `- This estimate has not been prepared from measured quantities. A formal cost plan by a Chartered Quantity Surveyor is required before any financial commitment.`,
  ].join('\n')

  const costExclusionsText = [
    '- VAT (unless stated above)',
    '- Loose furniture, fittings and equipment (FF&E)',
    '- IT and AV equipment (unless explicitly included in scope)',
    '- Land acquisition, legal fees, and stamp duty',
    '- Party wall awards and neighbourly matters',
    '- Archaeological investigation',
    '- Asbestos removal beyond the survey allowance in Risk Allowance (E)',
    '- Costs arising from unforeseen ground conditions beyond the risk allowance',
  ].join('\n')

  const data = {
    // Cover
    PROJ_NAME:       answers.q1_0_projectName || 'Estates Project',
    PROJ_DATE:       formatDate(),
    PROJ_CONFIDENCE: confidenceLabels[aiProse.confidenceScore] || `Grade ${aiProse.confidenceScore}`,
    PROJ_RISK_BADGE: riskBadge + ' Cost Risk',

    // Executive Summary
    EXEC_SUMMARY:   aiProse.executiveSummary || '',
    KEY_FINDING_1:  kf[0] ? `1. ${kf[0]}` : '',
    KEY_FINDING_2:  kf[1] ? `2. ${kf[1]}` : '',
    KEY_FINDING_3:  kf[2] ? `3. ${kf[2]}` : '',
    KEY_FINDING_4:  kf[3] ? `4. ${kf[3]}` : '',

    // Scope
    SCOPE_INCLUDED:    scopeIncluded,
    SCOPE_EXCLUDED:    'Loose furniture and fittings; IT and AV equipment (unless explicitly scoped); land acquisition; legal fees; VAT; asbestos removal beyond allowance; unforeseen ground conditions.',
    SCOPE_ASSUMPTIONS: scopeAssumptionsText || '- Scope to be confirmed following completion of surveys and Stage 2 design.',

    // Risk
    riskRows,

    // Programme
    PROG_TOTAL_WEEKS:  String(programme.totalWeeks),
    PROG_ROUTE:        programme.procurementRoute,
    PROG_TARGET_STATUS: programme.targetNote,
    progRows,
    PROG_MILESTONES:   milestoneText,
    PROG_ASSUMPTIONS:  progAssumptionsText,

    // Cost
    COST_GIFA:          String(cost.gifa),
    COST_REGION:        cost.bcisRegion,
    COST_FACTOR:        String(cost.bcisFactor),
    COST_SPEC:          cost.specLevel,
    COST_NARRATIVE:     aiProse.costNarrative || '',
    worksRows,
    constructionRows,
    totalRows,
    COST_TOTAL_RANGE:   `${f1k(cost.total.low)} – ${f1k(cost.total.high)} (excl. VAT)`,
    COST_RISK_BADGE:    riskBadge,
    COST_ASSUMPTIONS:   costAssumptionsText,
    COST_EXCLUSIONS:    costExclusionsText,

    // ROI (conditional — empty string if not applicable)
    ROI_BENEFIT_TYPE: roi ? (Array.isArray(answers.q5_1_financialBenefit) ? answers.q5_1_financialBenefit[0] : answers.q5_1_financialBenefit) || '' : '',
    ROI_ANNUAL:       roi ? f(roi.annual) + ' per annum' : '',
    ROI_MID_COST:     roi ? f1k(roi.mid) : '',
    ROI_PAYBACK:      roi ? `${roi.paybackYears} years (simple payback)` : '',
    ROI_NARRATIVE:    roi ? (aiProse.roiNarrative || '') : 'Not applicable — no financial benefit has been identified for this project.',

    // Procurement
    PROC_ROUTE:          aiProse.procurementRoute || programme.procurementRoute,
    PROC_CONTRACT:       aiProse.procurementContractForm || '',
    PROC_DESIGN_RESP:    aiProse.procurementDesignResp || '',
    PROC_TENDER_TYPE:    aiProse.procurementTenderType || '',
    PROC_NARRATIVE:      aiProse.procurementNarrative || '',
    PROC_CONSIDERATIONS: (aiProse.procurementConsiderations || []).map(c => `- ${c}`).join('\n'),
    PROC_CONFLICTS:      (aiProse.procurementConflicts || []).length > 0
                           ? (aiProse.procurementConflicts || []).map(c => `⚠ ${c}`).join('\n')
                           : 'No procurement conflicts identified.',

    // Constraints
    constraintRows,

    // Next Steps
    NEXT_STEPS: nextStepsText || '- Commission outstanding surveys.\n- Appoint design team.\n- Proceed to RIBA Stage 2.',

    // Disclaimer is static in template — leave as-is (no tag)
  }

  doc.render(data)

  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}

// ─── Template health check ─────────────────────────────────────────────────────
export async function getTemplateInfo() {
  try {
    const buf = await fetchTemplate()
    const zip = new PizZip(buf)
    const content = zip.files['word/document.xml']?.asText() || ''
    const tagMatches = content.match(/\{[A-Z_a-z][^{}]*\}/g) || []
    const uniqueTags = [...new Set(tagMatches)]
    const expectedTags = [
      'PROJ_NAME','PROJ_DATE','PROJ_CONFIDENCE','PROJ_RISK_BADGE','EXEC_SUMMARY',
      'KEY_FINDING_1','KEY_FINDING_2','KEY_FINDING_3','KEY_FINDING_4',
      'SCOPE_INCLUDED','SCOPE_EXCLUDED','SCOPE_ASSUMPTIONS','COST_GIFA','COST_REGION',
      'COST_FACTOR','COST_SPEC','COST_TOTAL_RANGE','COST_RISK_BADGE','COST_NARRATIVE',
      'COST_ASSUMPTIONS','COST_EXCLUSIONS','PROG_TOTAL_WEEKS','PROG_ROUTE',
      'PROG_TARGET_STATUS','PROG_MILESTONES','PROG_ASSUMPTIONS','ROI_NARRATIVE',
      'PROC_ROUTE','PROC_CONTRACT','NEXT_STEPS',
    ]
    const found = uniqueTags.filter(t => !t.includes('#') && !t.includes('/'))
    const missing = expectedTags.filter(t => !content.includes(`{${t}}`))
    return {
      templateOk: missing.length === 0,
      templateTags: found.length,
      missingTags: missing,
      fetchedAt: new Date(_templateCache.fetchedAt).toISOString(),
    }
  } catch (e) {
    return { templateOk: false, templateTags: 0, missingTags: [], error: e.message }
  }
}
