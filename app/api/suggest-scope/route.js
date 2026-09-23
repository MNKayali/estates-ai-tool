/**
 * POST /api/suggest-scope  { objective, projectType, buildingUse, interventionLevel, buildingAge, storeys }
 *
 * Proposes Q2.3 scope items (v5.2 Scope IDs) from the plain-English objective
 * in Q2.1. The model is shown ONLY the items the picker offers for these
 * answers — the same lib/scopeEngine.js tests the questionnaire runs ('Shown
 * on', availability at the chosen level of intervention) — and must answer
 * with a strict tool whose `code` enum is that list, so it cannot name an item
 * that does not exist or is not selectable. Items tagged for the building use
 * are listed first. The user reviews and edits the result; the deterministic
 * engine prices it. The AI never sees a rate and never touches a number.
 *
 * Gated by the access cookie (proxy.ts). Rate-limited: each call is a small
 * Haiku request (~£0.001), but an unbounded endpoint is still a cheap way to
 * burn credit.
 */
import { getScopeCatalogue } from '@/lib/costCalculator'
import { buildContext, isOffered, isItemAvailable, isRelevant } from '@/lib/scopeEngine'
import { PROSE_MODEL, getAnthropicKey } from '@/lib/proseSchema'
import { checkRateLimit, rateLimitedResponse } from '@/lib/rateLimit'

export const maxDuration = 30

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
  const cat = await getScopeCatalogue()
  const ctx = buildContext(cat, {
    q1_2_projectType: projectType, q1_3_buildingUse: buildingUse, q2_3_interventionLevel: interventionLevel,
    q1_4_buildingAge: body?.buildingAge, q1_2_storeys: body?.storeys,
  })
  if (!ctx.PT) return Response.json({ error: 'Select a project type first.' }, { status: 400 })
  if (!getAnthropicKey()) return Response.json({ error: 'AI is not configured on this deployment.' }, { status: 503 })

  const offered = cat.items.filter(it => isOffered(it, ctx) && isItemAvailable(it, ctx))
  // Tagged for this building use first, the rest after — the model sees the
  // same ordering the picker shows ("More items" last).
  const candidates = [...offered.filter(it => isRelevant(it, ctx)), ...offered.filter(it => !isRelevant(it, ctx))]
    .map(it => ({ code: it.id, description: it.name, group: it.groupLabel, included: it.included }))
  if (candidates.length === 0) return Response.json({ items: [], note: 'No scope items are available for these answers.' })

  const catalogue = candidates.map(c => `${c.code} — ${c.group}: ${c.description}${c.included ? ` (${c.included})` : ''}`).join('\n')
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
- Give each item ONE SHORT reason, at most 20 words, in British English, no markdown. Use only codes from the catalogue you are given. Do not mention rates, costs or quantities.
- Builder's work in connection is added automatically; never propose it.`
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
