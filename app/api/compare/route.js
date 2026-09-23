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
import { getScopeCatalogue } from '@/lib/costCalculator'
import { loadNrmWorkbook, distinctSpecLevels } from '@/lib/nrmWorkbook'
import { projectTypeCode, projectTypeUsesLevel } from '@/lib/scopeEngine'

export const maxDuration = 60

// Both axes read their options from the NRM1 workbook ('3. Settings'), so a
// variant is offered only where it can actually price differently.
const AXES = {
  spec: {
    key: 'q2_4_specLevel',
    label: 'Specification level (Q2.4)',
    variants: async (answers) => {
      // Mirrors the questionnaire: Demolition only and External works only
      // have no Q2.4 at all (isQuestionShown).
      if (!isQuestionShown('q2_4_specLevel', answers.q1_2_projectType)) return []
      const model = await loadNrmWorkbook()
      // A level that reads the same rate column as another (new build has no
      // Basic column — Basic reads NB Std) is not a real variant.
      return distinctSpecLevels(model.settings, projectTypeCode(model, answers.q1_2_projectType))
    },
  },
  intervention: {
    key: 'q2_3_interventionLevel',
    label: 'Level of intervention (Q2.2)',
    variants: async (answers) => {
      const cat = await getScopeCatalogue()
      if (!projectTypeUsesLevel(cat, answers.q1_2_projectType)) return []
      return cat.settings.interventionLevels.map(l => l.name)
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

  const variants = await def.variants(answers)
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
