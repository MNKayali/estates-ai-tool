/**
 * /api/warm-prose
 *
 * Compiles the strict prose-tool schema into Anthropic's ~24h schema cache so
 * the real /api/generate-report call doesn't pay the one-off compile (~10s) that
 * otherwise pushes the first-after-idle report past the 60s Vercel ceiling.
 *
 * Issues a tiny forced-tool call with the EXACT same model + PROSE_TOOL as the
 * real call (a true max_tokens:0 pre-warm is rejected when tool_choice forces a
 * tool, so we ask for a handful of real tokens). Fire-and-forget from the client
 * — it never blocks the UI and always returns 200 so a warm failure is silent.
 */
import { PROSE_MODEL, PROSE_TOOL, getAnthropicKey } from '@/lib/proseSchema'

export const maxDuration = 30

async function warm() {
  const key = getAnthropicKey()
  if (!key) return { ok: false, skipped: 'no AI_API_KEY' }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25_000)
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
        tools: [PROSE_TOOL],
        tool_choice: { type: 'tool', name: PROSE_TOOL.name, disable_parallel_tool_use: true },
        messages: [{ role: 'user', content: 'warm' }],
      }),
      signal: controller.signal,
    })
    // We don't need the body — the schema compile happens server-side regardless
    // of whether the (truncated) tool call completes. Drain to free the socket.
    await res.text().catch(() => {})
    return { ok: res.ok, status: res.status, ms: Date.now() - startedAt }
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'timeout' : e.message, ms: Date.now() - startedAt }
  } finally {
    clearTimeout(timeout)
  }
}

export async function GET() {
  return Response.json(await warm())
}

export async function POST() {
  return Response.json(await warm())
}
