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
import { VISIBLE_GROUPS, priceableFor } from '@/lib/projectTypes'

export const maxDuration = 30

const LEVEL_TIER = {
  'Fabric and finishes only': 1,
  'Finishes with minor services': 2,
  'Full systems replacement': 3,
  'Reconfiguration or full redesign': 4,
}
// Codes with no tile of their own — the picker folds them into a parent
// (5.5 rides with 5.2; 5.8 is derived from 5.8a + 5.8b; 5.2L is the
// like-for-like-boiler alternative to 5.2, offered as a radio choice rather
// than its own tile), so they are never offered directly. Must stay in step
// with FOLDED_CODES in app/questionnaire/page.jsx — when 5.2L was missing
// here, the model could return both 5.2 and 5.2L (mutually exclusive by
// construction), and applySuggestedScope's scopeCodeSelectable filter tests
// group/use/tier/priceable but not this folded set, so both survived and
// calculateCost (no heating mutex) priced them together.
const FOLDED = new Set(['5.2L', '5.5', '5.8'])

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

  // The "never propose what the objective does not support" rule, on its own,
  // made the model return an EMPTY list for any objective that states a goal
  // rather than a list of elements ("the house needs modernisation"), which is
  // how most people write it. The general-objective clause below is what stops
  // a reasonable brief dead-ending in an error.
  const system = `You are a UK quantity surveyor helping a client tick the right NRM1 scope items for a RIBA Stage 0–1 feasibility estimate.
Rules:
- Propose a typical, defensible starting scope, not a maximal one.
- If the objective names specific works, propose those and their unavoidable companions.
- If the objective is GENERAL (e.g. "modernisation", "refurbishment", "bring it up to standard"), do NOT return an empty list. Propose the scope such a project normally includes for this project type, building use and level of intervention, and say so in the reason for each item, e.g. "typically included in a full systems replacement of a dwelling of this age".
- Return at least three items unless the objective is genuinely unintelligible.
- Never propose an item that plainly contradicts the objective.
- Give each item ONE SHORT reason, at most 20 words, in British English, no markdown. Use only codes from the catalogue you are given. Do not mention rates, costs or quantities.`
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
        // A full domestic refurb suggestion is ~790 output tokens with terse
        // reasons and more with generous ones. At the old 900 the tool call was
        // truncated, and a truncated tool_use arrives with no parsable `items`,
        // so the route reported "no scope could be suggested" for a perfectly
        // good objective. Sized well clear of the worst case instead, and the
        // truncation case is now detected below rather than read as an empty
        // answer.
        max_tokens: 2500,
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
    // Distinguish "the model had nothing to say" from "the answer was cut off".
    // Conflating the two is what made a truncated call look like an empty one.
    if (raw.length === 0 && msg.stop_reason === 'max_tokens') {
      return Response.json({ error: 'The suggestion was cut short before it could be read. Try again, or use the typical scope.' }, { status: 502 })
    }
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
