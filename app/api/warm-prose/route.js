/**
 * /api/warm-prose
 *
 * Compiles the strict prose-tool schemas into Anthropic's ~24h schema cache so
 * the real /api/generate-report calls don't pay the one-off compile (~10s) that
 * otherwise pushes the first-after-idle report past the 60s Vercel ceiling.
 *
 * generate-report makes TWO parallel prose calls with two different strict tools
 * (see lib/proseSchema.js), so both schemas have to be warmed or the un-warmed
 * half pays the compile and becomes the straggler that decides the wall clock.
 * The warm calls themselves run in parallel for the same reason.
 *
 * Issues a tiny forced-tool call with the EXACT same model + tool object as the
 * real call (a true max_tokens:0 pre-warm is rejected when tool_choice forces a
 * tool, so we ask for a handful of real tokens). Fire-and-forget from the client
 * — it never blocks the UI and always returns 200 so a warm failure is silent.
 *
 * Who may call it (September 2026, public free trial): anyone the questionnaire
 * serves — a signed-in user, a free-trial visitor or the admin (requireCaller).
 * The spend is bounded globally instead of by caller: at most one real warm per
 * WARM_EVERY seconds across every caller (a KV `nx` key), so however many
 * visitors or scripts call this, it costs two tiny requests per 10 minutes at
 * most. The schema cache lasts ~24h, so nothing is lost by skipping repeats.
 */
import { kv } from '@vercel/kv'
import { PROSE_MODEL, PROSE_TOOLS, getAnthropicKey } from '@/lib/proseSchema'
import { requireCaller } from '@/lib/auth'

const WARM_EVERY = 600 // seconds

// The first compile of a never-seen schema is slow — measured at ~23s per tool,
// which overran the old 25s guard and left one of the two schemas uncompiled, so
// the real call paid the compile instead. Once cached both warm in ~2s.
export const maxDuration = 60

async function warmTool(key, tool, signal) {
  const startedAt = Date.now()
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: PROSE_MODEL,
        max_tokens: 16,
        temperature: 0,
        tools: [tool],
        tool_choice: { type: 'tool', name: tool.name, disable_parallel_tool_use: true },
        messages: [{ role: 'user', content: 'warm' }],
      }),
      signal,
    })
    // We don't need the body — the schema compile happens server-side regardless
    // of whether the (truncated) tool call completes. Drain to free the socket.
    await res.text().catch(() => {})
    return { tool: tool.name, ok: res.ok, status: res.status, ms: Date.now() - startedAt }
  } catch (e) {
    return {
      tool: tool.name,
      ok: false,
      error: e.name === 'AbortError' ? 'timeout' : e.message,
      ms: Date.now() - startedAt,
    }
  }
}

async function warm() {
  const key = getAnthropicKey()
  if (!key) return { ok: false, skipped: 'no AI_API_KEY' }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 50_000)
  const startedAt = Date.now()
  try {
    const tools = await Promise.all(PROSE_TOOLS.map(t => warmTool(key, t, controller.signal)))
    return { ok: tools.every(t => t.ok), tools, ms: Date.now() - startedAt }
  } finally {
    clearTimeout(timeout)
  }
}

// True when this call should warm; false when another did so recently. A KV
// failure means "warm" — the old behaviour, and still bounded by who may call.
async function claimWarmSlot() {
  try {
    return !!(await kv.set('warm-prose:recent', Date.now(), { nx: true, ex: WARM_EVERY }))
  } catch {
    return true
  }
}

async function handle(request) {
  const caller = await requireCaller(request)
  if (caller.response) return caller.response
  if (!(await claimWarmSlot())) return Response.json({ ok: true, skipped: 'warmed recently' })
  return Response.json(await warm())
}

export async function GET(request) {
  return handle(request)
}

export async function POST(request) {
  return handle(request)
}
