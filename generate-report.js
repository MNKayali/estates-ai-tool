/**
 * app/api/generate-report/route.js
 * Estates AI Tool — Report Generation API Route
 * 
 * Receives questionnaire answers, fetches live rates from GitHub,
 * builds the Claude prompt, and streams back the feasibility report.
 * 
 * POST /api/generate-report
 * Body: { answers: QuestionnaireAnswers, sections: string[] }
 */

import { getRates, buildRatesPrompt, getBcisFactorForRegion } from '@/lib/parseRates'

export async function POST(request) {
  try {
    const body = await request.json()
    const { answers, sections } = body

    // ── Validate required fields ────────────────────────────────────────────
    if (!answers) {
      return Response.json({ error: 'Missing answers' }, { status: 400 })
    }

    const required = ['projectObjective', 'projectType', 'postcode']
    const missing = required.filter(f => !answers[f])
    if (missing.length > 0) {
      return Response.json(
        { error: `Missing required fields: ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    // ── Fetch live rates from GitHub ────────────────────────────────────────
    let ratesPromptSection = ''
    try {
      const rates = await getRates()
      const projectType = resolveProjectType(answers.projectType)
      const specLevel   = answers.specLevel || 'standard'
      const bcisFactor  = getBcisFactorForRegion(answers.region || answers.postcode)

      ratesPromptSection = buildRatesPrompt(rates, projectType, specLevel, bcisFactor)
    } catch (ratesError) {
      // Don't fail the whole request if rates fetch fails — log and continue
      // Claude will fall back to general knowledge (less accurate but functional)
      console.error('[generate-report] Rates fetch failed:', ratesError.message)
      ratesPromptSection = '=== RATES UNAVAILABLE — use general UK construction cost knowledge for Q2 2026 ==='
    }

    // ── Build the full prompt ───────────────────────────────────────────────
    const prompt = buildReportPrompt(answers, sections, ratesPromptSection)

    // ── Call Claude API ─────────────────────────────────────────────────────
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!claudeResponse.ok) {
      const err = await claudeResponse.text()
      throw new Error(`Claude API error: ${claudeResponse.status} — ${err}`)
    }

    const data = await claudeResponse.json()
    const reportText = data.content?.[0]?.text || ''

    return Response.json({
      success: true,
      report: reportText,
      meta: {
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

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert UK construction and estates consultant specialising in 
RIBA Stage 0-1 feasibility reports. You have deep knowledge of NRM1 cost planning, procurement 
strategy, risk management, and the RIBA Plan of Work.

Your outputs are professional, concise, and structured. You write in clear British English suitable 
for presentation to university estates teams, senior management, and funders.

CRITICAL RULES FOR COST ESTIMATES:
- Always use the NRM1 benchmark rates provided in the prompt — never substitute your own figures
- Always present costs as LOW–HIGH ranges, never single-point estimates
- Always apply the BCIS regional location factor provided
- Always include the mandatory disclaimer on every cost estimate
- Flag clearly when rates have been excluded for a project type

REPORT STYLE:
- Professional but not overly formal
- Use clear section headings
- Be specific — reference actual figures, not vague ranges
- Flag risks prominently — do not bury them
- Keep the executive summary to 3-4 paragraphs maximum`

// ─── Report prompt builder ────────────────────────────────────────────────────

function buildReportPrompt(answers, sections, ratesSection) {
  const requestedSections = sections || [
    'executive-summary',
    'scope-of-works',
    'risk-register',
    'programme',
    'cost-estimate',
    'procurement',
    'recommendations',
  ]

  return `
Generate a RIBA Stage 1 Feasibility Report based on the following project information.

═══════════════════════════════════════════════
PROJECT INFORMATION
═══════════════════════════════════════════════

Project Objective:
${answers.projectObjective}

Project Type: ${answers.projectType}
Location / Postcode: ${answers.postcode}
Building Type: ${answers.buildingType || 'Not specified'}
Building Age: ${answers.buildingAge || 'Not specified'}
Approximate Size (GIFA): ${answers.gifa ? answers.gifa + ' m²' : 'Not specified'}
Specification Level: ${answers.specLevel || 'Standard'}

Scope of Works Selected:
${formatScopeItems(answers.scopeItems)}

Target Completion: ${answers.targetCompletion || 'No fixed deadline specified'}
Occupation During Works: ${answers.occupationDuringWorks || 'Not specified'}
Access Constraints: ${answers.accessConstraints || 'None identified'}

Known Building Issues:
${formatList(answers.knownIssues)}

Planning Consents Required:
${formatList(answers.planningConsents)}

Existing Surveys Available:
${formatList(answers.existingSurveys)}

Client Budget: ${answers.budgetKnown === 'yes'
    ? `£${Number(answers.budgetFigure).toLocaleString()} (${answers.budgetIncludes || 'scope unclear'})`
    : 'Not specified — independent estimate required'}

Primary Financial Benefit: ${answers.financialBenefit || 'Not specified'}
Estimated Annual Benefit: ${answers.annualBenefit || 'Not specified'}

Design Stage Reached: ${answers.designStage || 'Stage 0-1 — concept only'}
Most Important Factor: ${answers.clientPriority || 'Not specified'}

Biggest Concern: ${answers.biggestConcern || 'Not specified'}

Additional Context: ${answers.additionalContext || 'None provided'}

═══════════════════════════════════════════════
${ratesSection}
═══════════════════════════════════════════════

SECTIONS TO INCLUDE IN THIS REPORT:
${requestedSections.map(s => `- ${s}`).join('\n')}

═══════════════════════════════════════════════
REPORT OUTPUT INSTRUCTIONS
═══════════════════════════════════════════════

Generate the report now using the sections listed above.

For the COST ESTIMATE section:
- Use ONLY the NRM1 benchmark rates provided above
- Show each included NRM1 group with Low and High totals
- Apply the BCIS factor already embedded in the rates
- Show Works Cost subtotal, then all additions (Prelims, OH&P, Fees, Risk, Contingency, Inflation)
- Show Total Project Cost (excl. VAT) as the final figure
- Show VAT separately for reference
- State clearly which elements are excluded and why
- Include the mandatory disclaimer

For the RISK REGISTER section:
- Minimum 8 risks, maximum 15
- Format as a table: Risk | Likelihood (H/M/L) | Impact (H/M/L) | Mitigation
- Flag any HIGH risks prominently

For the PROGRAMME section:
- RIBA stage-based timeline (Stages 1-6)
- Include gateway decision points
- Show planning consent period if required
- Show survey period if surveys are outstanding
- State whether target completion date is achievable

For the PROCUREMENT section:
- Recommend one route: Traditional JCT SBC / Design & Build / PCSA / Two-Stage
- Give a clear rationale based on client priority and design stage

Start the report now. Use clear markdown headings for each section.
`
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatScopeItems(items) {
  if (!items || items.length === 0) return 'No scope items specified'
  if (Array.isArray(items)) return items.map(i => `  • ${i}`).join('\n')
  return String(items)
}

function formatList(items) {
  if (!items || items.length === 0) return 'None identified'
  if (Array.isArray(items)) return items.map(i => `  • ${i}`).join('\n')
  return String(items)
}

function resolveProjectType(projectType) {
  if (!projectType) return 'refurb'
  const t = projectType.toLowerCase()
  if (t.includes('new build') || t.includes('newbuild')) return 'newbuild'
  if (t.includes('extension')) return 'extension'
  if (t.includes('external')) return 'external'
  return 'refurb'
}
