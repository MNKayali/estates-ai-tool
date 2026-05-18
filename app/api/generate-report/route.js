/**
 * app/api/generate-report/route.js
 * Estates AI Tool — Report Generation API Route
 * Version 2.0 — Two-Layer Architecture
 */

import { getRates, buildRatesPrompt, getBcisFactorForRegion } from '@/lib/parseRates'

export async function POST(request) {
  try {
    const body = await request.json()
    const { answers, sections, confirmedContradictions } = body

    if (!answers) {
      return Response.json({ error: 'Missing answers' }, { status: 400 })
    }

    const required = ['q2_1_objective', 'q1_2_projectType', 'q1_1_postcode']
    const missing = required.filter(f => !answers[f])
    if (missing.length > 0) {
      return Response.json(
        { error: `Missing required fields: ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    let ratesPromptSection = ''
    let bcisFactor = 0.94
    try {
      const rates = await getRates()
      const projectType = resolveProjectType(answers.q1_2_projectType)
      bcisFactor = getBcisFactorForRegion(answers.q1_1_postcode)
      ratesPromptSection = buildRatesPrompt(rates, projectType, 'standard', bcisFactor)
    } catch (ratesError) {
      console.error('[generate-report] Rates fetch failed:', ratesError.message)
      ratesPromptSection = '=== RATES UNAVAILABLE — use general UK construction cost knowledge for Q2 2026 ==='
    }

    const layer1Result = await runLayer1(answers, bcisFactor)
    if (!layer1Result.success) {
      return Response.json(
        { error: 'Validation call failed', detail: layer1Result.error },
        { status: 500 }
      )
    }

    const intelligence = layer1Result.intelligence

    if (
      intelligence.contradictions &&
      intelligence.contradictions.length > 0 &&
      !confirmedContradictions
    ) {
      return Response.json({
        requiresConfirmation: true,
        contradictions: intelligence.contradictions,
        confidence: intelligence.confidenceScore,
        message: 'Please review the following before your report is generated.',
      })
    }

    const reportResult = await runLayer2(answers, sections, intelligence, ratesPromptSection)
    if (!reportResult.success) {
      return Response.json(
        { error: 'Report generation failed', detail: reportResult.error },
        { status: 500 }
      )
    }

    return Response.json({
      success: true,
      report: reportResult.report,
      meta: {
        confidenceScore: intelligence.confidenceScore,
        confidenceLabel: intelligence.confidenceLabel,
        specLevel: intelligence.specLevel,
        riskLevel: intelligence.percentageAdditions?.risk?.riskLevel || 'Medium',
        contradictionsConfirmed: confirmedContradictions || false,
        ratesSource: 'GitHub — NRM1_Cost_Estimate_Tool_v2.xlsx',
        generatedAt: new Date().toISOString(),
        model: 'claude-sonnet-4-20250514',
      }
    })

  } catch (error) {
    console.error('[generate-report] Error:', error)
    return Response.json(
      { error: 'Report generation failed', detail: error.message },
      { status: 500 }
    )
  }
}

async function runLayer1(answers, bcisFactor) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: LAYER1_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildLayer1Prompt(answers, bcisFactor) }],
      }),
    })
    if (!response.ok) throw new Error(`Claude API error: ${response.status}`)
    const data = await response.json()
    const rawText = data.content?.[0]?.text || ''
    const clean = rawText.replace(/```json|```/g, '').trim()
    const intelligence = JSON.parse(clean)
    return { success: true, intelligence }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function runLayer2(answers, sections, intelligence, ratesSection) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        system: LAYER2_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildLayer2Prompt(answers, sections, intelligence, ratesSection) }],
      }),
    })
    if (!response.ok) throw new Error(`Claude API error: ${response.status}`)
    const data = await response.json()
    return { success: true, report: data.content?.[0]?.text || '' }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

const LAYER1_SYSTEM_PROMPT = `You are a specialist UK construction cost and feasibility consultant.
Analyse questionnaire answers for a RIBA Stage 0-1 feasibility project and return a structured JSON intelligence object.
You do NOT write any report text. You ONLY return a JSON object.
CRITICAL: Return ONLY valid JSON. No preamble, no explanation, no markdown fences.

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
    "contingency": {"fixed":5,"rationale":"Fixed at 5% — standard client contingency at RIBA Stage 0-1"},
    "inflation": {"low":number,"high":number,"rationale":"string"}
  },
  "programmeFlags": {
    "targetDateAchievable": boolean,
    "targetDateRationale": "string",
    "minimumProgrammeWeeks": number,
    "surveyAllowanceWeeks": number,
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
    {"ref":"R01","category":"string","description":"string","likelihood":"High|Medium|Low",
     "impact":"High|Medium|Low","rating":"High|Medium|Low","mitigation":"string","owner":"string"}
  ],
  "fundingFlags": "string|null",
  "utilitiesFlags": "string|null",
  "immediateActions": ["string"],
  "showstoppers": ["string"]
}`

function buildLayer1Prompt(answers, bcisFactor) {
  return `Analyse these project questionnaire answers and return the intelligence JSON.

PROJECT ANSWERS:
Q1.0 Project Name: ${answers.q1_0_projectName || 'Not provided'}
Q1.1 Postcode: ${answers.q1_1_postcode}
Q1.2 Project Type: ${answers.q1_2_projectType}
Q1.3 Building Use: ${answers.q1_3_buildingUse || 'Not provided'}
Q1.3a Residential Units: ${answers.q1_3a_units || 'N/A'}
Q1.3b Storeys: ${answers.q1_3b_storeys || 'N/A'}
Q1.4 Building Age: ${answers.q1_4_buildingAge || 'Not provided'}
Q1.5 Size: ${answers.q1_5_size ? answers.q1_5_size + ' m²' : 'Not provided'}
Q2.1 Objective: ${answers.q2_1_objective}
Q2.2 Scope: ${formatList(answers.q2_2_scopeItems)}
Q2.3 Intervention Level: ${answers.q2_3_interventionLevel || 'Not provided'}
Q2.4 Standards: ${formatList(answers.q2_4_standards)}
Q3.1 Known Issues: ${formatList(answers.q3_1_knownIssues)}
Q3.2 Recent Works: ${answers.q3_2_recentWorks || 'None'}
Q3.3 Surveys: ${formatList(answers.q3_3_surveys)}
Q3.4 Planning: ${formatList(answers.q3_4_planningConsents)}
Q3.5 Access: ${formatList(answers.q3_5_accessConstraints)}
Q3.6 Occupation: ${answers.q3_6_occupation || 'Not specified'}
Q3.7 Additional Context: ${answers.q3_7_additionalContext || 'None'}
Q4.1 Target Date: ${answers.q4_1_targetDate || 'No deadline'}
Q4.2 Budget Known: ${answers.q4_2_budgetKnown || 'No'}
Q4.3 Budget: ${answers.q4_3_budgetFigure ? '£' + Number(answers.q4_3_budgetFigure).toLocaleString() : 'N/A'}
Q4.3 Includes: ${formatList(answers.q4_3_budgetIncludes)}
Q4.4 Anything Else: ${answers.q4_4_anythingElse || 'Nothing'}
Q4.5 Priorities: ${formatList(answers.q4_5_priorities)}
Q4.6 Design Stage: ${answers.q4_6_designStage || 'Stage 0-1'}
Q4.7 Phasing: ${answers.q4_7_phasing || 'Single phase'}
Q4.8 Utilities: ${formatList(answers.q4_8_utilities)}
Q4.9 Funding: ${formatList(answers.q4_9_funding)}
Q5.1 Financial Benefit: ${formatList(answers.q5_1_financialBenefit)}
Q5.2 Annual Benefit: ${answers.q5_2_annualBenefit || 'Not provided'}
Q6.2 Report Instructions: ${answers.q6_2_reportInstructions || 'None'}
BCIS Factor: ${bcisFactor}

ANALYSIS RULES:

CONFIDENCE SCORE:
A = Surveys available + clear scope + known budget + Stage 2+ + standard project type
B = Some surveys + defined scope + standard project + minor unknowns
C = No surveys + broad scope + Stage 0-1 + conflicting inputs
D = No surveys + specialist + fully occupied + multiple unknowns + hard deadline

SPEC LEVEL:
basic = light touch + residential/storage + maintenance objective
standard = full refurb + office/education + normal commercial quality
high = flagship/premium objective + public-facing + bespoke standards
specialist = lab/healthcare/data centre + specialist fit-out + technical standards

CONTRADICTIONS (check all seven):
C1 (blocker): light touch + full M&E replacement items ticked
C2 (blocker): light touch + structural alterations ticked
C3 (warning): new build + building age answered
C4 (warning): asbestos suspected + no surveys + fully occupied + pre-2000
C5 (blocker): complete strip-out + fully occupied throughout
C6 (warning): grant funding + no design done + hard deadline within 6 months
C7 (blocker): size under 20m² + multiple major M&E and structural items

NRM1 MAPPING (Q2.2 checkboxes → NRM1 groups):
Demolition/strip-out, ground remediation → Group 0
Substructure/foundations → Group 1
Structural frame, alterations, roof, facade, windows, waterproofing, internal partitions, internal doors → Group 2
Wall finishes, floor finishes, ceiling finishes, redecoration → Group 3 (ALWAYS include Group 3)
Joinery, kitchens, toilets, lab fit-out, clinical fit-out, data centre → Group 4
All mechanical + electrical services, IT, AV, solar, battery, EV, lift, BEMS → Group 5
Repairs, making good (refurb only) → Group 7
External works, landscaping, car parking, external lighting → Group 8

PERCENTAGE RULES:
Prelims 8-10%: baseline 8%. +1.0% fully occupied. +0.5% partially occupied. +0.5% restricted access. +0.5% 6-18mo programme. +1.0% over 18mo. Cap 10%.
OH&P 8-12%: over £5M=8-9%. £1M-£5M=9-10%. under £1M=10-12%. Lower if lowest cost priority. Higher if speed/flexibility.
Fees 5-15%: Stage 0-1=12-15%. Stage 2=10-13%. Stage 3=7-10%. Stage 4=5-7%. +1-2% M&E in scope. +1-2% structural. +2% pre-1900/listed. +1-2% BREEAM/specialist standard.
Dev Costs 2-4%: full planning=3-4%. listed+full=4%. permitted dev=2%. unsure=3%. +0.5% no surveys.
Risk 5-10%: start 5%. +2.0% no surveys. +1.0% some surveys. +1.5% asbestos. +1.0% structural. +0.5% ageing M&E. +1.5% contaminated. +1.5% pre-1900/listed. +0.5% 1900-1980. +0.5% fully occupied. +1.0% hard deadline. +0.5% damp. +0.5% fire safety. +1.5% poor ground. Cap 10%.
Contingency: always 5% fixed.
Inflation 2-12%: Component 1 (tender): <3mo=1-2%, 3-9mo=2-4%, 9-18mo=3-6%, 18+mo=5-8%. Component 2 (construction): <6mo=0.5-1%, 6-12mo=1-2%, 12-24mo=2-4%, >24mo=3-5%. Sum both. Cap 12%.

PROGRAMME: Calculate minimum duration from surveys + design stages + planning + tender + construction.
Fully occupied = +25% construction. Partially occupied = +10-15%.
Tender: over £100k = 10-12 weeks formal. Under £100k = 6 weeks.
Compare against Q4.1 target date.

PROCUREMENT: Derive from Q4.5 + Q4.6.
Fixed price = Traditional JCT SBC. Speed = D&B. Flexibility = PCSA. Design quality = Traditional.
Stage 0-1 concept only = PCSA or D&B viable. Stage 4 complete = Traditional viable.

RISKS: Generate minimum 8, maximum 15 from all trigger signals.

Return ONLY the JSON object.`
}

const LAYER2_SYSTEM_PROMPT = `You are an expert UK construction and estates consultant specialising in RIBA Stage 0-1 feasibility reports.
Write in clear British English suitable for university estates teams, senior management, and funders.
CRITICAL: All intelligence has been pre-validated. Use it exactly. Do not recalculate.
Present all costs as LOW–HIGH ranges. Never single-point estimates.
Include the mandatory disclaimer on every cost estimate.
Keep executive summary to 3-4 paragraphs maximum.
Follow any report instructions from Q6.2 regarding tone and audience.`

function buildLayer2Prompt(answers, sections, intelligence, ratesSection) {
  const requestedSections = sections || ['executive-summary','scope-of-works','risk-register','programme','cost-estimate','recommendations']
  const hasROI = answers.q5_1_financialBenefit && !answers.q5_1_financialBenefit.includes('No direct financial return')
  const hasProcurement = requestedSections.includes('procurement')
  const hasConstraints = requestedSections.includes('constraints')

  return `Generate a RIBA Stage 1 Feasibility Report. All calculations are pre-validated — use them exactly.

PROJECT:
Name: ${intelligence.projectName || answers.q1_0_projectName || 'Estates Project'}
Type: ${answers.q1_2_projectType} | Location: ${answers.q1_1_postcode} | Size: ${answers.q1_5_size}m²
Building Use: ${answers.q1_3_buildingUse} | Age: ${answers.q1_4_buildingAge}
Intervention Level: ${answers.q2_3_interventionLevel}
Objective: ${answers.q2_1_objective}
Scope: ${formatList(answers.q2_2_scopeItems)}
Standards: ${formatList(answers.q2_4_standards)}
Target Date: ${answers.q4_1_targetDate} | Occupation: ${answers.q3_6_occupation}
Known Issues: ${formatList(answers.q3_1_knownIssues)}
Recent Works: ${answers.q3_2_recentWorks || 'None'}
Surveys: ${formatList(answers.q3_3_surveys)}
Planning: ${formatList(answers.q3_4_planningConsents)}
Access: ${formatList(answers.q3_5_accessConstraints)}
Utilities: ${formatList(answers.q4_8_utilities)}
Funding: ${formatList(answers.q4_9_funding)}
Priorities: ${formatList(answers.q4_5_priorities)}
Design Stage: ${answers.q4_6_designStage}
Budget: ${answers.q4_2_budgetKnown === 'Yes — I have a budget figure in mind' ? '£' + Number(answers.q4_3_budgetFigure).toLocaleString() : 'Not specified'}
Financial Benefit: ${formatList(answers.q5_1_financialBenefit)}
Annual Benefit: ${answers.q5_2_annualBenefit || 'N/A'}
Additional Context: ${answers.q3_7_additionalContext || 'None'}
Report Instructions: ${answers.q6_2_reportInstructions || 'None'}

INTELLIGENCE BRIEF (USE EXACTLY):
Confidence: ${intelligence.confidenceScore} — ${intelligence.confidenceLabel}: ${intelligence.confidenceRationale}
Spec Level: ${intelligence.specLevel} — ${intelligence.specLevelRationale}
BCIS: ${intelligence.bcisRegion} | Factor: ${intelligence.bcisFactor}

NRM1 INCLUSIONS:
${intelligence.nrm1Inclusions?.map(i => `Group ${i.group} — ${i.element}: ${i.reason}`).join('\n') || 'See scope'}

NRM1 EXCLUSIONS:
${intelligence.nrm1Exclusions?.map(e => `Group ${e.group} — ${e.element}: ${e.reason}`).join('\n') || 'None'}

ADDITIONS:
Prelims: ${intelligence.percentageAdditions?.prelims?.low}%–${intelligence.percentageAdditions?.prelims?.high}% | ${intelligence.percentageAdditions?.prelims?.rationale}
OH&P: ${intelligence.percentageAdditions?.ohp?.low}%–${intelligence.percentageAdditions?.ohp?.high}% | ${intelligence.percentageAdditions?.ohp?.rationale}
Fees: ${intelligence.percentageAdditions?.fees?.low}%–${intelligence.percentageAdditions?.fees?.high}% | ${intelligence.percentageAdditions?.fees?.rationale}
Dev Costs: ${intelligence.percentageAdditions?.devCosts?.low}%–${intelligence.percentageAdditions?.devCosts?.high}% | ${intelligence.percentageAdditions?.devCosts?.rationale}
Risk: ${intelligence.percentageAdditions?.risk?.low}%–${intelligence.percentageAdditions?.risk?.high}% (${intelligence.percentageAdditions?.risk?.riskLevel}) | ${intelligence.percentageAdditions?.risk?.rationale}
Contingency: 5% fixed
Inflation: ${intelligence.percentageAdditions?.inflation?.low}%–${intelligence.percentageAdditions?.inflation?.high}% | ${intelligence.percentageAdditions?.inflation?.rationale}

PROGRAMME:
Target achievable: ${intelligence.programmeFlags?.targetDateAchievable ? 'YES' : 'NO'} — ${intelligence.programmeFlags?.targetDateRationale}
Minimum: ${intelligence.programmeFlags?.minimumProgrammeWeeks} weeks total
Surveys: ${intelligence.programmeFlags?.surveyAllowanceWeeks}w | Planning: ${intelligence.programmeFlags?.planningAllowanceWeeks}w | Tender: ${intelligence.programmeFlags?.tenderAllowanceWeeks}w | Construction: ${intelligence.programmeFlags?.constructionAllowanceWeeks}w
Uplift: ${intelligence.programmeFlags?.programmeUpliftReason || 'None'}

PROCUREMENT: ${intelligence.procurementRecommendation?.route} | ${intelligence.procurementRecommendation?.contractForm}
Rationale: ${intelligence.procurementRecommendation?.rationale}
${intelligence.procurementRecommendation?.conflicts ? 'Conflicts: ' + intelligence.procurementRecommendation.conflicts : ''}

FUNDING FLAGS: ${intelligence.fundingFlags || 'None'}
UTILITIES FLAGS: ${intelligence.utilitiesFlags || 'None'}

TOP RISK SIGNALS:
${intelligence.topRiskSignals?.map(r => `${r.ref} [${r.category}] ${r.description} | L:${r.likelihood} I:${r.impact} Rating:${r.rating} | ${r.mitigation} | Owner: ${r.owner}`).join('\n') || 'See questionnaire inputs'}

SHOWSTOPPERS: ${intelligence.showstoppers?.join(' | ') || 'None'}
IMMEDIATE ACTIONS: ${intelligence.immediateActions?.join(' | ') || 'None'}

${ratesSection}

SECTIONS: ${requestedSections.join(', ')}

GENERATE EACH SECTION NOW:

## Executive Summary
3-4 paragraphs. Include: project description + location + size + objective. Indicative Total Project Cost range. Confidence score: ${intelligence.confidenceScore} — ${intelligence.confidenceLabel}. Target date achievable: ${intelligence.programmeFlags?.targetDateAchievable ? 'YES' : 'NO'}. Top 2-3 risks. Recommended procurement route. Key immediate actions. One-line recommendation.

## Scope of Works
Two columns — INCLUDED and EXCLUDED. Expand each ticked scope item professionally. List all major excluded items with reason. Note any recently completed works that reduce scope.

## Top Risks Register
Use EXACTLY the risk signals provided. Table format: Ref | Category | Risk Description | Likelihood | Impact | Rating | Mitigation | Owner. Minimum 8 risks. Flag HIGH risks prominently. ${intelligence.confidenceScore === 'C' || intelligence.confidenceScore === 'D' ? 'Add note: This risk register is based on limited information. Additional risks may be identified once surveys are completed.' : ''}

## High-Level Programme
RIBA stage-based timeline in weeks from project start (not calendar dates). Include: pre-design surveys, Stage 2, Stage 3, Stage 4, Tender, Construction, Handover, Gateway decision points. State whether target date achievable. List programme assumptions.

## Order of Cost Estimate (NRM1)
Use ONLY the NRM1 groups from inclusions list. For each group: Code | Element | Low £/m² | High £/m² | Low Total £ | High Total £ | Rationale. Apply spec level: ${intelligence.specLevel}. Apply BCIS factor: ${intelligence.bcisFactor}. Group 3 ALWAYS included. Group 5 marked as KEY ELEMENT.

Calculation sequence (use EXACTLY these percentages):
1. Works Cost = sum of all included groups
2. Prelims A = Works Cost × ${intelligence.percentageAdditions?.prelims?.low}%–${intelligence.percentageAdditions?.prelims?.high}%
3. OH&P B = Works Cost × ${intelligence.percentageAdditions?.ohp?.low}%–${intelligence.percentageAdditions?.ohp?.high}%
4. Construction Cost = Works Cost + A + B
5. Fees C = Construction Cost × ${intelligence.percentageAdditions?.fees?.low}%–${intelligence.percentageAdditions?.fees?.high}%
6. Dev Costs D = Construction Cost × ${intelligence.percentageAdditions?.devCosts?.low}%–${intelligence.percentageAdditions?.devCosts?.high}%
7. Risk E = Works Cost × ${intelligence.percentageAdditions?.risk?.low}%–${intelligence.percentageAdditions?.risk?.high}%
8. Contingency H = Works Cost × 5%
9. Inflation F = Works Cost × ${intelligence.percentageAdditions?.inflation?.low}%–${intelligence.percentageAdditions?.inflation?.high}%
10. TOTAL PROJECT COST = Construction Cost + C + D + E + H + F (EXCLUDES VAT)
11. VAT = Total × 20% — shown separately for reference only
Round all totals to nearest £1,000.

Show assumptions and exclusions after the table.
DISCLAIMER: This order of cost estimate is indicative only, produced at RIBA Stage 0-1 without measured quantities or detailed design information. Rates are based on BCIS £/m² benchmarks adjusted by regional location factor. This estimate should be reviewed and validated by a Chartered Quantity Surveyor before use in any business case, budget approval, or funding application.

${hasROI ? `## ROI & Financial Case
Annual benefit: ${answers.q5_2_annualBenefit}. Type: ${formatList(answers.q5_1_financialBenefit)}.
Calculate: Simple payback, Simple ROI %, NPV at 5% discount rate. State all assumptions. Note principal financial risk.` : ''}

${hasProcurement ? `## Procurement Recommendation
Route: ${intelligence.procurementRecommendation?.route}. Contract: ${intelligence.procurementRecommendation?.contractForm}.
Rationale: ${intelligence.procurementRecommendation?.rationale}.
List 4-6 key commercial considerations specific to this project.
${intelligence.fundingFlags ? 'Funding: ' + intelligence.fundingFlags : ''}` : ''}

${hasConstraints ? `## Constraints Summary
Group by: Occupancy, Access, Building Condition, Planning, Utilities, Funding. State impact of each on cost, programme, or procurement.` : ''}

## Recommendations & Next Steps
1. SHOWSTOPPERS — must be resolved before proceeding
2. IMMEDIATE ACTIONS — numbered list
3. GATEWAY CONDITIONS — Stage 2, Stage 3, Stage 4

End report here. No additional commentary after final section.`
}

function formatList(items) {
  if (!items || items.length === 0) return 'None identified'
  if (Array.isArray(items)) return items.map(i => `• ${i}`).join('\n')
  return String(items)
}

function resolveProjectType(projectType) {
  if (!projectType) return 'refurb'
  const t = projectType.toLowerCase()
  if (t.includes('new build') || t.includes('newbuild')) return 'newbuild'
  if (t.includes('extension')) return 'extension'
  if (t.includes('external')) return 'external'
  if (t.includes('fit-out') || t.includes('fitout')) return 'fitout'
  if (t.includes('renewable')) return 'renewable'
  if (t.includes('demolition')) return 'demolition'
  return 'refurb'
}
