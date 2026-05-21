import { getRates, buildRatesPrompt, getBcisFactorForRegion } from '@/lib/parseRates'

// Strip BOM from API key in case env var was saved with UTF-8 BOM
const ANTHROPIC_KEY = (process.env.ANTHROPIC_API_KEY || '').replace(/^﻿/, '')

export async function POST(request) {
  try {
    const body = await request.json()
    const { answers, sections, confirmedContradictions } = body

    if (!answers) return Response.json({ error: 'Missing answers' }, { status: 400 })

    const required = ['q2_1_objective', 'q1_2_projectType', 'q1_1_postcode']
    const missing = required.filter(f => !answers[f])
    if (missing.length > 0) {
      return Response.json({ error: `Missing required fields: ${missing.join(', ')}` }, { status: 400 })
    }

    let ratesPromptSection = ''
    let bcisFactor = 0.94
    try {
      const rates = await getRates()
      const sheetNames = Object.keys(rates)
      console.log('[rates] ✅ Loaded successfully')
      console.log('[rates] Sheet names:', sheetNames)
      sheetNames.forEach(name => {
        const rowCount = rates[name]?.length ?? 0
        console.log(`[rates] Sheet "${name}": ${rowCount} rows`)
        if (rowCount > 0) {
          console.log(`[rates] Sheet "${name}" first row:`, JSON.stringify(rates[name][0]))
        }
      })
      bcisFactor = getBcisFactorForRegion(answers.q1_1_postcode)
      console.log('[rates] BCIS factor for', answers.q1_1_postcode, '→', bcisFactor)
      ratesPromptSection = buildRatesPrompt(rates, resolveProjectType(answers.q1_2_projectType), 'standard', bcisFactor)
      console.log('[rates] Prompt section length:', ratesPromptSection.length, 'chars')
    } catch (e) {
      console.error('[rates] ❌ Failed:', e.message)
      ratesPromptSection = '=== RATES UNAVAILABLE — use general UK construction cost knowledge Q2 2026 ==='
    }

    const layer1 = await runLayer1(answers, bcisFactor)
    if (!layer1.success) return Response.json({ error: 'Validation failed', detail: layer1.error }, { status: 500 })

    const intel = layer1.intelligence

    if (intel.contradictions?.length > 0 && !confirmedContradictions) {
      return Response.json({
        requiresConfirmation: true,
        contradictions: intel.contradictions,
        confidence: intel.confidenceScore,
        message: 'Please review the following before your report is generated.',
      })
    }

    const layer2 = await runLayer2(answers, sections, intel, ratesPromptSection)
    if (!layer2.success) return Response.json({ error: 'Report generation failed', detail: layer2.error }, { status: 500 })

    return Response.json({
      success: true,
      report: layer2.report,
      projectName: answers.q1_0_projectName || intel.projectName || 'Estates Project',
      intel: intel,
      meta: {
        confidenceScore: intel.confidenceScore,
        confidenceLabel: intel.confidenceLabel,
        specLevel: intel.specLevel,
        riskLevel: intel.percentageAdditions?.risk?.riskLevel || 'Medium',
        contradictionsConfirmed: confirmedContradictions || false,
        generatedAt: new Date().toISOString(),
        model: 'claude-sonnet-4-6',
        gifa: answers.q1_5_size,
        annualBenefit: answers.q5_2_annualBenefit || null,
        benefitType: Array.isArray(answers.q5_1_financialBenefit)
          ? answers.q5_1_financialBenefit[0] || null
          : answers.q5_1_financialBenefit || null,
      }
    })
  } catch (error) {
    console.error('[generate-report]', error)
    return Response.json({ error: 'Report generation failed', detail: error.message }, { status: 500 })
  }
}

async function runLayer1(answers, bcisFactor) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        system: LAYER1_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildLayer1Prompt(answers, bcisFactor) }],
      }),
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      throw new Error(`Claude API ${res.status}: ${JSON.stringify(errBody)}`)
    }
    const data = await res.json()
    const clean = (data.content?.[0]?.text || '').replace(/```json|```/g, '').trim()
    return { success: true, intelligence: JSON.parse(clean) }
  } catch (e) {
    console.error('[layer1 error]', e.message)
    return { success: false, error: e.message }
  }
}

async function runLayer2(answers, sections, intel, ratesSection) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: LAYER2_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildLayer2Prompt(answers, sections, intel, ratesSection) }],
      }),
    })
    if (!res.ok) throw new Error(`Claude API ${res.status}`)
    const data = await res.json()
    return { success: true, report: data.content?.[0]?.text || '' }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

const LAYER1_SYSTEM_PROMPT = `You are a specialist UK construction cost and feasibility consultant.
Analyse questionnaire answers and return a structured JSON intelligence object.
Return ONLY valid JSON. No preamble, no markdown fences.

Return this exact structure:
{
  "projectName": "string",
  "confidenceScore": "A|B|C|D",
  "confidenceLabel": "High Confidence|Moderate Confidence|Limited Confidence|High Uncertainty",
  "confidenceRationale": "string",
  "specLevel": "basic|standard|high|specialist",
  "specLevelRationale": "string",
  "bcisRegion": "string",
  "bcisFactor": number,
  "contradictions": [{"code":"C1-C7","message":"string","severity":"warning|blocker"}],
  "nrm1Inclusions": [{"group":"string","element":"string","reason":"string"}],
  "nrm1Exclusions": [{"group":"string","element":"string","reason":"string"}],
  "percentageAdditions": {
    "prelims": {"low":number,"high":number,"rationale":"string"},
    "ohp": {"low":number,"high":number,"rationale":"string"},
    "fees": {"low":number,"high":number,"rationale":"string"},
    "devCosts": {"low":number,"high":number,"rationale":"string"},
    "risk": {"low":number,"high":number,"rationale":"string","riskLevel":"Low|Medium|High"},
    "contingency": {"fixed":5,"rationale":"Fixed at 5% standard RIBA Stage 0-1"},
    "inflation": {"low":number,"high":number,"rationale":"string"}
  },
  "programmeFlags": {
    "targetDateAchievable": boolean,
    "targetDateRationale": "string",
    "minimumProgrammeWeeks": number,
    "surveyAllowanceWeeks": number,
    "designAllowanceWeeks": number,
    "planningAllowanceWeeks": number,
    "tenderAllowanceWeeks": number,
    "constructionAllowanceWeeks": number,
    "programmeUpliftReason": "string|null"
  },
  "procurementRecommendation": {
    "route": "string",
    "contractForm": "string",
    "rationale": "string",
    "conflicts": "string|null"
  },
  "topRiskSignals": [
    {"ref":"R01","category":"string","description":"string",
     "likelihood":"High|Medium|Low","impact":"High|Medium|Low",
     "rating":"High|Medium|Low","mitigation":"string","owner":"string"}
  ],
  "fundingFlags": "string|null",
  "utilitiesFlags": "string|null",
  "immediateActions": ["string"],
  "showstoppers": ["string"]
}`

function buildLayer1Prompt(answers, bcisFactor) {
  return `Analyse these answers and return the intelligence JSON.

Q1.0 Project Name: ${answers.q1_0_projectName || 'Not provided'}
Q1.1 Postcode: ${answers.q1_1_postcode}
Q1.2 Project Type: ${answers.q1_2_projectType}
Q1.3 Building Use: ${answers.q1_3_buildingUse || 'Not provided'}
Q1.3 Building Sub-type: ${answers.q1_3_buildingSubtype || 'N/A'}
Q1.3a Units: ${answers.q1_3a_units || 'N/A'}
Q1.3b Storeys: ${answers.q1_3b_storeys || 'N/A'}
Q1.4 Building Age: ${answers.q1_4_buildingAge || 'Not provided'}
Q1.5 Size: ${answers.q1_5_size ? answers.q1_5_size + ' m²' : 'Not provided'}
Q2.1 Objective: ${answers.q2_1_objective}
Q2.2 Scope: ${formatList(answers.q2_2_scopeItems)}
Q2.3a Nature of Works: ${answers.q2_3a_natureOfWorks || 'Not provided'}
Q2.3b Specification Level: ${answers.q2_3b_specLevel || 'Not provided'}
Q2.4 Standards: ${answers.q2_4_standards || 'None stated'}
Q3.1 Known Issues: ${formatList(answers.q3_1_knownIssues)}
Q3.2 Previous Works: ${answers.q3_2_previousWorks || 'None'}
Q3.3 Surveys: ${formatList(answers.q3_3_surveys)}
Q3.4 Planning: ${formatList(answers.q3_4_planningConsents)}
Q3.5 Access: ${formatList(answers.q3_5_accessConstraints)}
Q3.6 Occupation: ${answers.q3_6_occupation || 'Not specified'}
Q3.7 Additional Context: ${answers.q3_7_additionalContext || 'None'}
Q4.1 Target Date: ${answers.q4_1_targetDate || 'No deadline'}
Q4.2 Budget: ${answers.q4_2_budgetFigure ? '£' + Number(answers.q4_2_budgetFigure).toLocaleString() + ' (' + formatList(answers.q4_2_budgetIncludes) + ')' : 'Not provided'}
Q4.5 Priorities: ${formatList(answers.q4_5_priorities)}
Q4.6 Design Stage: ${answers.q4_6_designStage || 'Stage 0-1'}
Q4.7 Phasing: ${answers.q4_7_phasing || 'Single phase'}
Q4.8 Utilities: ${formatList(answers.q4_8_utilities)}
Q4.9 Funding: ${formatList(answers.q4_9_funding)}
Q5.1 Financial Benefit: ${formatList(answers.q5_1_financialBenefit)}
Q5.2 Annual Benefit: ${answers.q5_2_annualBenefit || 'N/A'}
Q6.2 Report Instructions: ${answers.q6_2_reportInstructions || 'None'}
BCIS Factor: ${bcisFactor}

CONFIDENCE: A=surveys+clear scope+known budget+Stage2+. B=some surveys+defined scope. C=no surveys+broad scope. D=no surveys+specialist+occupied+unknowns+hard deadline.

SPEC LEVEL — derive from Q2.3b primarily:
Budget spec → basic. Standard spec → standard. Enhanced spec → high. Prestige spec → specialist rates.

NATURE OF WORKS — derive from Q2.3a:
Like-for-like → minimal design, lower fees, shorter programme.
Improvement → standard design team, standard programme.
Reconfiguration/change of use → full design team, longer programme, planning risk flagged.
Complete repurpose → full specialist team, longest programme, highest fees.

RATE BAND SELECTION — combine Q2.3a + Q2.3b to select a NARROW rate band (max 25-30% spread):
Like-for-like + Budget → bottom 20% of rate range
Like-for-like + Standard → lower-mid range
Improvement + Standard → mid range
Reconfiguration + Enhanced → upper-mid range
Complete repurpose + Prestige → top 25% of rate range
The AI must select a SPECIFIC narrow band — not the full low-to-high range.
This is critical to keeping the cost estimate variance under 30%.

CONTRADICTIONS:
C1 (blocker): light touch scope + full M&E replacement ticked in Q2.2
C2 (blocker): Budget spec level + structural alterations in scope
C3 (warning): new build + building age answered
C4 (warning): asbestos suspected + no surveys + fully occupied + pre-2000
C5 (blocker): complete repurpose + fully occupied throughout
C6 (warning): grant funding + no design done + hard deadline within 6 months
C7 (blocker): size under 20m² + multiple major M&E and structural items

NRM1 MAPPING:
Demolition/strip-out, ground remediation → Group 0
Substructure/foundations → Group 1
Structural frame, alterations, roof, facade, windows, external doors, waterproofing → Group 2
Wall finishes, floor finishes, ceiling finishes, redecoration → Group 3 (ALWAYS include)
Internal partitions, internal doors and ironmongery → Group 2
Joinery, kitchens, toilets, lab, clinical, data centre fit-out → Group 4
All M&E services, IT, AV, solar, battery, EV, BEMS → Group 5
Lift or platform lift → Group 5
Repairs, making good (refurb only) → Group 7
External works, landscaping, car parking, external lighting → Group 8

PERCENTAGE RULES:
Prelims 8-10%: baseline 8%. +1.0% fully occupied. +0.5% partially occupied. +0.5% restricted access. +0.5% 6-18mo programme. +1.0% over 18mo. Cap 10%.
OH&P 8-12%: over £5M=8-9%. £1M-£5M=9-10%. under £1M=10-12%.
Fees — USE Q2.3a AND Q2.3b TOGETHER:
  Like-for-like + Budget = 8-10%. Like-for-like + Standard = 10-12%.
  Improvement + Standard = 11-13%. Reconfiguration + Enhanced = 13-15%.
  Complete repurpose + Prestige = 15-18%. Apply Stage adjustments on top.
Dev Costs 2-4%: full planning=3-4%. listed=4%. permitted dev=2%. unsure=3%. +0.5% no surveys.
Risk 5-10%: baseline 5%. +2.0% no surveys. +1.5% asbestos. +1.0% structural. +0.5% ageing M&E.
  +1.5% contaminated. +1.5% pre-1900/listed. +0.5% 1900-1980. +0.5% occupied. +1.0% hard deadline.
  +0.5% damp. +0.5% fire safety. +1.5% poor ground. Cap 10%.
Contingency: 5% fixed always.
Inflation 2-12%: tender component + construction mid-point component. Cap 12%.

PROGRAMME DURATION MATRIX — use this table exactly, not generic formulas. NEVER apply office durations to residential flat projects.

CONSTRUCTION DURATION (base, before occupation uplift):
Residential flat, like-for-like, under 100m²    → 6-8 weeks
Residential flat, full refurb, under 100m²       → 8-10 weeks
Residential flat, strip-out/rebuild, under 100m² → 10-12 weeks
Residential house, like-for-like, under 150m²    → 8-10 weeks
Residential house, full refurb, under 150m²      → 10-13 weeks
Office/Education, like-for-like, 100-500m²       → 10-14 weeks
Office/Education, full refurb, 100-500m²         → 12-18 weeks
Office/Education, reconfiguration, 100-500m²     → 14-20 weeks
Office/Education, complete repurpose, 100-500m²  → 18-24 weeks
Healthcare/Lab/Specialist, any size              → 16-28 weeks
New build, under 500m²                           → 20-36 weeks
New build, over 500m²                            → 36-60 weeks
External works, any                              → 6-16 weeks
Renewable energy, any                            → 4-10 weeks

OCCUPATION UPLIFT (multiply base construction duration):
Fully occupied throughout → ×1.25
Partially occupied / phased → ×1.10–1.15
Full decant or vacant → ×1.00

DESIGN DURATION (Stages 2–4 combined, parallel with planning):
Residential flat, like-for-like → 6-8 weeks
Residential flat, full refurb   → 8-10 weeks
Office/Education, like-for-like → 10-14 weeks
Office/Education, full refurb   → 12-16 weeks
Office/Education, reconfiguration → 14-18 weeks
Complete repurpose, any type    → 18-24 weeks
New build, under 500m²          → 20-26 weeks
New build, over 500m²           → 24-36 weeks

TENDER DURATION:
Works cost under £100k → 6 weeks (direct quotation)
Works cost over £100k  → 10-12 weeks (competitive tender)

PRE-DESIGN SURVEYS:
No surveys commissioned    → 3-4 weeks
Asbestos register only     → 2-3 weeks (R&D survey still needed)
Full survey pack available → 0 weeks
Partial surveys            → 2 weeks

HANDOVER: Always 1 week.
TOTAL = surveys + design + tender + construction + handover.

Set programmeFlags fields as follows:
- surveyAllowanceWeeks = pre-design survey weeks (from PRE-DESIGN SURVEYS table)
- designAllowanceWeeks = design weeks from DESIGN DURATION table (stages 2-4)
- tenderAllowanceWeeks = tender weeks from TENDER DURATION table
- constructionAllowanceWeeks = construction weeks from CONSTRUCTION DURATION table × occupation uplift
- minimumProgrammeWeeks = surveyAllowanceWeeks + designAllowanceWeeks + tenderAllowanceWeeks + constructionAllowanceWeeks + 1 (handover)

EXAMPLE — 84m² flat, like-for-like, partial occupation, asbestos register only:
surveyAllowanceWeeks=3, designAllowanceWeeks=7, tenderAllowanceWeeks=6, constructionAllowanceWeeks=8, minimumProgrammeWeeks=25.
Surveys 3w + Design 7w + Tender 6w + Construction 7w×1.15=8w + Handover 1w = 25w TOTAL.
This is the correct answer. 17 or 44 weeks would both be wrong for this project type.

PROCUREMENT: Q4.5 + Q4.6. Fixed price = Traditional. Speed = D&B. Flexibility = PCSA.

RISKS: minimum 8, maximum 15. Build from all trigger signals.

Return ONLY the JSON.`
}

const LAYER2_SYSTEM_PROMPT = `You are a UK construction feasibility consultant producing a concise RIBA Stage 0-1 report.
Write in clear British English for university estates directors and finance teams.

CRITICAL RULES — follow every one:
1. CONCISE: total narrative text (excluding tables) must not exceed 500 words.
2. No preambles, no introductory sentences, no closing remarks — start each section with content immediately.
3. Do NOT repeat information across sections.
4. Use pre-validated intelligence exactly — do not recalculate any numbers.
5. Costs as LOW–HIGH ranges only. Range spread must not exceed 30%.
6. Tables: standard markdown pipe format with separator row.
7. Risk mitigations: max 10 words per row.
8. Follow Q6.2 report tone instructions.`

function buildLayer2Prompt(answers, sections, intel, ratesSection) {
  const requestedSections = sections || ['executive-summary','scope-of-works','risk-register','programme','cost-estimate','recommendations']
  const hasROI = answers.q5_1_financialBenefit && !answers.q5_1_financialBenefit.includes('No direct financial return — strategic or compliance project')
  const hasProcurement = requestedSections.includes('procurement')
  const hasConstraints = requestedSections.includes('constraints')

  return `Generate a RIBA Stage 1 Feasibility Report. Use pre-validated intelligence exactly.

PROJECT:
Name: ${intel.projectName || answers.q1_0_projectName || 'Estates Project'}
Type: ${answers.q1_2_projectType} | Location: ${answers.q1_1_postcode} | Size: ${answers.q1_5_size}m²
Building: ${answers.q1_3_buildingUse} ${answers.q1_3_buildingSubtype || ''} | Age: ${answers.q1_4_buildingAge || 'N/A'}
Nature of Works: ${answers.q2_3a_natureOfWorks || 'N/A'}
Specification Level: ${answers.q2_3b_specLevel || 'N/A'}
Objective: ${answers.q2_1_objective}
Scope: ${formatList(answers.q2_2_scopeItems)}
Standards: ${answers.q2_4_standards || 'Building Regulations only'}
Target Date: ${answers.q4_1_targetDate} | Occupation: ${answers.q3_6_occupation}
Issues: ${formatList(answers.q3_1_knownIssues)} | Previous Works: ${answers.q3_2_previousWorks || 'None'}
Surveys: ${formatList(answers.q3_3_surveys)} | Planning: ${formatList(answers.q3_4_planningConsents)}
Access: ${formatList(answers.q3_5_accessConstraints)} | Utilities: ${formatList(answers.q4_8_utilities)}
Funding: ${formatList(answers.q4_9_funding)} | Priorities: ${formatList(answers.q4_5_priorities)}
Design Stage: ${answers.q4_6_designStage}
Budget: ${answers.q4_2_budgetFigure ? '£' + Number(answers.q4_2_budgetFigure).toLocaleString() : 'Not specified'}
Financial Benefit: ${formatList(answers.q5_1_financialBenefit)} | Annual: ${answers.q5_2_annualBenefit || 'N/A'}
Additional Context: ${answers.q3_7_additionalContext || 'None'}
Report Instructions: ${answers.q6_2_reportInstructions || 'None'}

INTELLIGENCE (USE EXACTLY):
Confidence: ${intel.confidenceScore} — ${intel.confidenceLabel}: ${intel.confidenceRationale}
Spec Level: ${intel.specLevel} — ${intel.specLevelRationale}
BCIS: ${intel.bcisRegion} | Factor: ${intel.bcisFactor}

NRM1 INCLUSIONS:
${intel.nrm1Inclusions?.map(i => `Group ${i.group} — ${i.element}: ${i.reason}`).join('\n') || 'See scope'}

NRM1 EXCLUSIONS:
${intel.nrm1Exclusions?.map(e => `Group ${e.group} — ${e.element}: ${e.reason}`).join('\n') || 'None'}

ADDITIONS (USE EXACTLY — DO NOT RECALCULATE):
Prelims: ${intel.percentageAdditions?.prelims?.low}%–${intel.percentageAdditions?.prelims?.high}% | ${intel.percentageAdditions?.prelims?.rationale}
OH&P: ${intel.percentageAdditions?.ohp?.low}%–${intel.percentageAdditions?.ohp?.high}% | ${intel.percentageAdditions?.ohp?.rationale}
Fees: ${intel.percentageAdditions?.fees?.low}%–${intel.percentageAdditions?.fees?.high}% | ${intel.percentageAdditions?.fees?.rationale}
Dev Costs: ${intel.percentageAdditions?.devCosts?.low}%–${intel.percentageAdditions?.devCosts?.high}% | ${intel.percentageAdditions?.devCosts?.rationale}
Risk: ${intel.percentageAdditions?.risk?.low}%–${intel.percentageAdditions?.risk?.high}% (${intel.percentageAdditions?.risk?.riskLevel}) | ${intel.percentageAdditions?.risk?.rationale}
Contingency: 5% fixed
Inflation: ${intel.percentageAdditions?.inflation?.low}%–${intel.percentageAdditions?.inflation?.high}% | ${intel.percentageAdditions?.inflation?.rationale}

PROGRAMME:
Achievable: ${intel.programmeFlags?.targetDateAchievable ? 'YES' : 'NO'} — ${intel.programmeFlags?.targetDateRationale}
Total: ${intel.programmeFlags?.minimumProgrammeWeeks} weeks | Surveys: ${intel.programmeFlags?.surveyAllowanceWeeks}w | Planning: ${intel.programmeFlags?.planningAllowanceWeeks}w | Tender: ${intel.programmeFlags?.tenderAllowanceWeeks}w | Construction: ${intel.programmeFlags?.constructionAllowanceWeeks}w
Uplift: ${intel.programmeFlags?.programmeUpliftReason || 'None'}

PROCUREMENT: ${intel.procurementRecommendation?.route} | ${intel.procurementRecommendation?.contractForm}
${intel.procurementRecommendation?.rationale}
${intel.procurementRecommendation?.conflicts ? 'Conflicts: ' + intel.procurementRecommendation.conflicts : ''}

RISKS:
${intel.topRiskSignals?.map(r => `${r.ref} [${r.category}] ${r.description} | L:${r.likelihood} I:${r.impact} Rating:${r.rating} | ${r.mitigation} | ${r.owner}`).join('\n') || 'None'}

SHOWSTOPPERS: ${intel.showstoppers?.join(' | ') || 'None'}
IMMEDIATE ACTIONS: ${intel.immediateActions?.join(' | ') || 'None'}
FUNDING FLAGS: ${intel.fundingFlags || 'None'}
UTILITIES FLAGS: ${intel.utilitiesFlags || 'None'}

${ratesSection}

SECTIONS: ${requestedSections.join(', ')}

GENERATE REPORT NOW:

# ${intel.projectName || answers.q1_0_projectName || 'Feasibility Report'}

## Executive Summary
COST CONSISTENCY — calculate the total project cost table FIRST (mentally), then use that exact same £LOW–£HIGH figure here. A discrepancy destroys client confidence.

Write exactly 2 short paragraphs (max 60 words each):
Paragraph 1: project description (type, location, size, objective) and total project cost (excl. VAT) — must exactly match the cost table total row.
Paragraph 2: confidence score, target date achievable/not, top risk in one phrase, procurement route, one-line recommendation.

After the 2 paragraphs, write:

**Key Findings**
1. [Most critical finding — cost driver, budget gap, or major risk]
2. [Programme finding — whether target date is achievable and why]
3. [Procurement or surveys finding]
4. [One other significant finding from the intelligence data]

Each finding: exactly one sentence. Bold the key term at the start of each sentence.

## Scope of Works
**Included** — group items under trade headings. Use ONLY headings that have items. Format each group:

TRADE HEADING (pick from: ENABLING & DEMOLITION | STRUCTURAL & CIVIL | FABRIC & ENVELOPE | MECHANICAL SERVICES | ELECTRICAL SERVICES | INTERNAL FIT-OUT & FINISHES | TECHNOLOGY & DATA | ACCESSIBILITY)
✓ Item one
✓ Item two

Map these NRM1 items to the correct trade heading:
${intel.nrm1Inclusions?.map(i => `Group ${i.group}: ${i.element}`).join('\n') || '- See scope items'}

**Excluded**
${intel.nrm1Exclusions?.map(e => `- ${e.element}`).join('\n') || '- Loose furniture and fittings\n- IT and AV equipment\n- Land acquisition costs'}

**Assumptions**
- Write 3 key scope assumptions as dash-bullets. One line each.

## Top Risks Register
${intel.confidenceScore === 'C' || intel.confidenceScore === 'D' ? '> ⚠️ Register based on limited information — additional risks will emerge once surveys are complete.\n\n' : ''}| Ref | Risk | Category | L | I | Rating | Mitigation |
|-----|------|----------|---|---|--------|------------|
${intel.topRiskSignals?.map(r => `| ${r.ref} | ${r.description} | ${r.category} | ${r.likelihood} | ${r.impact} | ${r.rating} | ${r.mitigation} |`).join('\n') || '| R01 | Risk data not available | General | Medium | Medium | Medium | Undertake surveys to identify risks |'}

## High-Level Programme
Programme: ${intel.programmeFlags?.minimumProgrammeWeeks || '—'} weeks total (Surveys ${intel.programmeFlags?.surveyAllowanceWeeks || '—'}w | Design/Planning ${intel.programmeFlags?.planningAllowanceWeeks || '—'}w | Tender ${intel.programmeFlags?.tenderAllowanceWeeks || '—'}w | Construction ${intel.programmeFlags?.constructionAllowanceWeeks || '—'}w).
Target date ${intel.programmeFlags?.targetDateAchievable ? '**is achievable**' : '**is NOT achievable**'}: ${intel.programmeFlags?.targetDateRationale || ''}

**Programme assumptions**
- Write 3 concise programme assumptions as dash-bullets.
${intel.programmeFlags?.programmeUpliftReason ? `- ${intel.programmeFlags.programmeUpliftReason}` : ''}

## Order of Cost Estimate (NRM1)
CRITICAL: LOW to HIGH range must NOT exceed 30%. Spec level: ${intel.specLevel}. BCIS factor: ${intel.bcisFactor}.

**Section 1 — Works Cost**
Output a single table with GROUP HEADER ROWS between NRM1 groups. Group header rows use bold text in the Code cell. Replace ALL [calc] with actual calculated £ figures — never leave [calc] in the output.

| Code | Element | Low £/m² | High £/m² | Low Total £ | High Total £ |
|------|---------|----------|----------|------------|-------------|
| **GRP** | **GROUP 0 — ENABLING & DEMOLITION** | | | | |
[items from Group 0 if included]
| **GRP** | **GROUP 2 — FABRIC & ENVELOPE** | | | | |
[items from Group 2 if included]
| **GRP** | **GROUP 3 — INTERNAL FINISHES** | | | | |
[items from Group 3 — ALWAYS include]
| **GRP** | **GROUP 5 — SERVICES (M&E) ★ KEY ELEMENT** | | | | |
[items from Group 5 if included]
[continue for any other included groups]
| | **WORKS COST SUBTOTAL** | | | **[calc]** | **[calc]** |

Only include group header rows for groups that have items in scope. Replace [items from Group N] with the actual line items.

**Section 2 — Construction Cost**
| Item | Rate | Low £ | High £ |
|------|------|-------|--------|
| Prelims (A) | ${intel.percentageAdditions?.prelims?.low}%–${intel.percentageAdditions?.prelims?.high}% of Works | [calc] | [calc] |
| OH&P (B) | ${intel.percentageAdditions?.ohp?.low}%–${intel.percentageAdditions?.ohp?.high}% of Works | [calc] | [calc] |
| **Construction Cost Subtotal** | | **[calc]** | **[calc]** |

**Section 3 — Total Project Cost**
| Item | Rate | Low £ | High £ |
|------|------|-------|--------|
| Professional Fees (C) | ${intel.percentageAdditions?.fees?.low}%–${intel.percentageAdditions?.fees?.high}% | [calc] | [calc] |
| Developer Costs (D) | ${intel.percentageAdditions?.devCosts?.low}%–${intel.percentageAdditions?.devCosts?.high}% | [calc] | [calc] |
| Risk Allowance (E) | ${intel.percentageAdditions?.risk?.low}%–${intel.percentageAdditions?.risk?.high}% | [calc] | [calc] |
| Contingency (H) | 5% fixed | [calc] | [calc] |
| Inflation (F) | ${intel.percentageAdditions?.inflation?.low}%–${intel.percentageAdditions?.inflation?.high}% | [calc] | [calc] |
| **TOTAL PROJECT COST (excl. VAT)** | | **[calc]** | **[calc]** |
| *VAT @ 20% (for reference only)* | | *[calc]* | *[calc]* |

IMPORTANT: Replace every [calc] with the actual calculated £ figure. Round to nearest £1,000.

**Assumptions**
- Write 3–4 key cost assumptions as dash-bullets.

*Disclaimer: This order of cost estimate is indicative only, produced at RIBA Stage 0–1 without measured quantities. Rates based on BCIS £/m² benchmarks adjusted for region. Review by a Chartered Quantity Surveyor required before use in any budget approval or funding application.*

${hasROI ? `## ROI & Financial Case
Annual benefit: ${answers.q5_2_annualBenefit}. Write 2 sentences only: state simple payback period and simple ROI %. One sentence on key financial risk.` : ''}

${hasProcurement ? `## Procurement Recommendation
Write 2 sentences: why this route suits this project. Then list 3 bullet commercial considerations.` : ''}

${hasConstraints ? `## Constraints Summary
List each constraint as a bullet. Format: **Category — Title**: one-line impact. Max 8 constraints.` : ''}

## Recommendations & Next Steps
Do NOT repeat procurement content here — it is already in Section 7.
This section has THREE sub-sections only:

**SHOWSTOPPERS — Must be resolved before proceeding to Stage 2:**
${intel.showstoppers?.length ? intel.showstoppers.map(s => `- ${s}`).join('\n') : '- No critical showstoppers identified. Project is clear to proceed to RIBA Stage 2 subject to the immediate actions below.'}

**IMMEDIATE ACTIONS — steps the client must take in the next 2-4 weeks:**
${intel.immediateActions?.map((a, i) => `${i + 1}. ${a}`).join('\n') || '1. Commission outstanding surveys\n2. Confirm project scope and agree brief\n3. Appoint project manager and QS'}

**GATEWAY CONDITIONS:**
- Gateway 2 (End of Concept Design): [3-4 specific conditions that must be met before Stage 3 begins — e.g. surveys complete, brief signed off, budget confirmed, Stage 2 report approved]
- Gateway 3 (End of Developed Design): [3-4 conditions before Stage 4 — e.g. planning approved, specification agreed, pre-tender estimate within budget, client sign-off obtained]
- Gateway 4 (Pre-Construction): [3-4 conditions before construction starts — e.g. tender returned and accepted, contract executed, CDM appointments confirmed, decant complete]`
}

function formatList(items) {
  if (!items || items.length === 0) return 'None identified'
  if (Array.isArray(items)) return items.map(i => `• ${i}`).join('\n')
  return String(items)
}

function resolveProjectType(t) {
  if (!t) return 'refurb'
  const s = t.toLowerCase()
  if (s.includes('new build')) return 'newbuild'
  if (s.includes('extension')) return 'extension'
  if (s.includes('external')) return 'external'
  if (s.includes('fit-out') || s.includes('fitout')) return 'fitout'
  if (s.includes('renewable')) return 'renewable'
  if (s.includes('demolition')) return 'demolition'
  return 'refurb'
}
