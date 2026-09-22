/**
 * POST /api/compare  { answers, axis }
 *
 * Side-by-side scenarios for a report: the same answers re-run through the
 * deterministic pipeline with ONE input varied.
 *
 *   axis = 'spec'          → Q2.4 Basic / Standard / High
 *   axis = 'intervention'  → Q2.2 the four levels of works
 *
 * Deterministic only — no AI, so it costs nothing to run and cannot disagree
 * with the report (same lib/pipeline.js). Returns per-variant headline
 * figures, never a full record. Gated by the access cookie (proxy.ts) and
 * rate-limited like every other calculator-touching route.
 */
import { runDeterministicPipeline } from '@/lib/pipeline'
import { checkRateLimit, rateLimitedResponse } from '@/lib/rateLimit'
import { isQuestionShown } from '@/lib/questionSets'

export const maxDuration = 60

const AXES = {
  spec: {
    key: 'q2_4_specLevel',
    label: 'Specification level (Q2.4)',
    variants: (answers) => {
      // Mirrors the questionnaire: Demolition only has no Q2.4 at all
      // (isQuestionShown), so it gets no priced variants on this axis rather
      // than falling through to the general case below.
      if (!isQuestionShown('q2_4_specLevel', answers.q1_2_projectType)) return []
      const pt = String(answers.q1_2_projectType || '').toLowerCase()
      // No Basic column for new build/extension, a single column for
      // external works.
      if (pt.includes('external works')) return ['Standard']
      if (pt.includes('new build') || pt.includes('extension')) return ['Standard', 'High']
      return ['Basic', 'Standard', 'High']
    },
  },
  intervention: {
    key: 'q2_3_interventionLevel',
    label: 'Level of works (Q2.2)',
    variants: (answers) => {
      const pt = String(answers.q1_2_projectType || '')
      if (!['Refurbishment', 'Fit-out', 'Extension'].includes(pt)) return []
      return ['Fabric and finishes only', 'Finishes with minor services', 'Full systems replacement', 'Reconfiguration or full redesign']
    },
  },
}

export async function POST(request) {
  const rl = await checkRateLimit('compare', request, { requests: 30, window: '10 m' })
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSeconds)

  let body
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body.' }, { status: 400 }) }
  const { answers, axis } = body || {}
  if (!answers || typeof answers !== 'object') return Response.json({ error: 'Missing answers.' }, { status: 400 })
  const def = AXES[axis]
  if (!def) return Response.json({ error: `Unknown axis. Use one of: ${Object.keys(AXES).join(', ')}.` }, { status: 400 })
  const gifa = Number(answers.q1_5_size)
  if (!Number.isFinite(gifa) || gifa <= 0) return Response.json({ error: 'Q1.5 size must be a positive number.' }, { status: 400 })
  if (!Array.isArray(answers.q2_2_scopeItems) || answers.q2_2_scopeItems.length === 0) {
    return Response.json({ error: 'At least one scope item is required.' }, { status: 400 })
  }

  const variants = def.variants(answers)
  if (variants.length < 2) {
    return Response.json({ axis, label: def.label, current: answers[def.key] || null, scenarios: [], note: 'This project type has only one option on this axis.' })
  }

  const scenarios = []
  for (const value of variants) {
    try {
      const { cost, programme, confidence } = await runDeterministicPipeline({ ...answers, [def.key]: value })
      scenarios.push({
        value,
        isCurrent: value === (answers[def.key] || (def.key === 'q2_4_specLevel' ? 'Standard' : 'Full systems replacement')),
        works: cost.works,
        construction: cost.construction,
        total: cost.total,
        vat: cost.vat,
        percentages: cost.percentages,
        breakdown: cost.breakdown,
        costPerSqm: Math.round(cost.works.mid / (cost.gifa || 1)),
        totalWeeks: programme.totalWeeks,
        totalWeeksBestCase: programme.totalWeeksBestCase,
        designWeeks: programme.designWeeks,
        constructionWeeks: programme.constructionWeeks,
        confidence: confidence.score,
        excludedCount: (cost.excludedNoQuantity || []).length,
      })
    } catch (e) {
      scenarios.push({ value, error: e.message })
    }
  }

  return Response.json({ axis, label: def.label, key: def.key, current: answers[def.key] || null, scenarios })
}
