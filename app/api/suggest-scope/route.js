/**
 * POST /api/suggest-scope  { objective, projectType, buildingUse, interventionLevel }
 *
 * Proposes Q2.2 scope codes from the plain-English objective in Q2.1. The
 * model is shown ONLY the codes the picker would offer for these answers
 * (same visible-group, building-use, intervention-tier and priceable filters
 * as app/questionnaire/page.jsx) and must answer with a strict tool whose
 * `code` enum is that list — it cannot name an item that does not exist or is
 * not selectable. The user reviews and edits the result; the deterministic
 * engine prices it. The AI never sees a rate and never touches a number.
 *
 * Gated by the access cookie (proxy.ts). Rate-limited: each call is a small
 * Haiku request (~£0.001), but an unbounded endpoint is still a cheap way to
 * burn credit.
 */
import { getScopeItems } from '@/lib/costCalculator'
import { matchesBuildingUse } from '@/lib/buildingUse'
import { PROSE_MODEL, getAnthropicKey } from '@/lib/proseSchema'
import { checkRateLimit, rateLimitedResponse } from '@/lib/rateLimit'

export const maxDuration = 30

// Mirrors VISIBLE_GROUPS in app/questionnaire/page.jsx.
const VISIBLE_GROUPS = {
  'New Build':        [0, 1, 2, 3, 4, 5, 6, 8],
  'Refurbishment':    [0, 2, 3, 4, 5, 7, 8],
  'Fit-out':          [3, 4, 5],
  'Extension':        [0, 1, 2, 3, 4, 5, 6, 7, 8],
  'External Works':   [0, 8],
  'Renewable Energy': [5, 8],
  'Demolition':       [0],
  'Mixed':            [0, 1, 2, 3, 4, 5, 6, 7, 8],
}
const LEVEL_TIER = {
  'Fabric and finishes only': 1,
  'Finishes with minor services': 2,
  'Full systems replacement': 3,
  'Reconfiguration or full redesign': 4,
}
// Codes with no tile of their own — the picker folds them into a parent
// (5.5 rides with 5.2; 5.8 is derived from 5.8a + 5.8b), so they are never
// offered directly.
const FOLDED = new Set(['5.5', '5.8'])

function priceableFor(item, projectType) {
  const family = projectType === 'New Build' ? 'newBuild'
    : projectType === 'Extension' ? 'extension'
    : projectType === 'External Works' ? 'externalWorks'
    : 'refurb'
  return !!item.priceable?.[family]
}

export async function POST(request) {
  const rl = await checkRateLimit('suggest-scope', request, { requests: 20, window: '10 m' })
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSeconds)

  let body
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body.' }, { status: 400 }) }
  const objective = String(body?.objective || '').trim().slice(0, 2000)
  const projectType = String(body?.projectType || '')
  const buildingUse = String(body?.buildingUse || '')
  const interventionLevel = String(body?.interventionLevel || '')
  if (objective.length < 20) return Response.json({ error: 'Describe the objective in a sentence or two first (at least 20 characters).' }, { status: 400 })
  if (!VISIBLE_GROUPS[projectType]) return Response.json({ error: 'Select a project type first.' }, { status: 400 })
  if (!getAnthropicKey()) return Response.json({ error: 'AI is not configured on this deployment.' }, { status: 503 })

  const isRefurb = ['Refurbishment', 'Fit-out', 'Extension'].includes(projectType)
  const tier = isRefurb ? (LEVEL_TIER[interventionLevel] || 4) : 4
  const { groups } = await getScopeItems()
  const candidates = groups
    .filter(g => VISIBLE_GROUPS[projectType].includes(g.group))
    .flatMap(g => g.items)
    .filter(it => !FOLDED.has(it.code))
    .filter(it => matchesBuildingUse(it.buildingUse, buildingUse))
    .filter(it => !isRefurb || (it.minLvl || 1) <= tier)
    .filter(it => priceableFor(it, projectType))
  if (candidates.length === 0) return Response.json({ items: [], note: 'No scope items are available for these answers.' })

  const catalogue = candidates.map(c => `${c.code} — ${c.description}${c.unit && c.unit !== 'm²' ? ` (per ${c.unit})` : ''}`).join('\n')
  const tool = {
    name: 'suggest_scope',
    description: 'Propose the NRM1 scope items implied by the project objective. Call exactly once.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              code: { type: 'string', enum: candidates.map(c => c.code) },
              reason: { type: 'string' },
            },
            required: ['code', 'reason'],
          },
        },
      },
      required: ['items'],
    },
  }

  const system = `You are a UK quantity surveyor helping a client tick the right NRM1 scope items for a RIBA Stage 0–1 feasibility estimate.
Rules: propose only items clearly implied by the objective — a typical, defensible starting scope, not a maximal one. Never propose an item the objective does not support. Give each item a one-sentence reason in British English, no markdown. Use only codes from the catalogue you are given. Do not mention rates, costs or quantities.`
  const user = `PROJECT TYPE: ${projectType}${buildingUse ? ` | BUILDING USE: ${buildingUse}` : ''}${interventionLevel ? ` | LEVEL OF INTERVENTION: ${interventionLevel}` : ''}

OBJECTIVE (the client's own words):
${objective}

CATALOGUE (the only codes you may use):
${catalogue}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': getAnthropicKey(), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: PROSE_MODEL,
        max_tokens: 900,
        temperature: 0,
        system,
        tools: [tool],
        tool_choice: { type: 'tool', name: 'suggest_scope', disable_parallel_tool_use: true },
        messages: [{ role: 'user', content: user }],
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return Response.json({ error: `AI request failed (${res.status}).`, detail: err?.error?.message }, { status: 502 })
    }
    const msg = await res.json()
    const block = (msg.content || []).find(b => b.type === 'tool_use' && b.name === 'suggest_scope')
    const raw = Array.isArray(block?.input?.items) ? block.input.items : []
    const byCode = new Map(candidates.map(c => [c.code, c]))
    const seen = new Set()
    const items = raw
      .filter(i => byCode.has(i.code) && !seen.has(i.code) && seen.add(i.code))
      .map(i => ({ code: i.code, description: byCode.get(i.code).description, reason: String(i.reason || '').slice(0, 300) }))
    return Response.json({ items, candidateCount: candidates.length })
  } catch (e) {
    const timedOut = e?.name === 'AbortError'
    return Response.json({ error: timedOut ? 'The suggestion timed out — try again.' : 'Suggestion failed: ' + e.message }, { status: timedOut ? 504 : 502 })
  } finally {
    clearTimeout(timeout)
  }
}
