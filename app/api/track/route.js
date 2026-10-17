/**
 * POST /api/track — the site's own visitor counter (lib/visits.js).
 *
 * Open to anyone (not in proxy.ts's matcher): the tracker runs on every public
 * page, signed in or not. Sent with navigator.sendBeacon, so the body arrives
 * as text/plain JSON:
 *   { t: 'view', path, landing, ref, utm }   a page was shown
 *   { t: 'engage', ms }                      time that page was on screen
 * Always answers 204 — a counter must never show an error to a visitor. Bots,
 * the admin area and malformed bodies are dropped without counting.
 */
import { recordView, recordEngagement } from '@/lib/visits'
import { classifySource, normalisePath, isUntrackedPath, deviceOf, isBot } from '@/lib/visitStats'
import { checkRateLimit } from '@/lib/rateLimit'

const done = () => new Response(null, { status: 204 })

export async function POST(request) {
  const ua = request.headers.get('user-agent') || ''
  if (isBot(ua)) return done()

  let body
  try {
    const text = await request.text()
    if (text.length > 2000) return done()
    body = JSON.parse(text)
  } catch { return done() }
  if (!body || typeof body !== 'object') return done()

  const rl = await checkRateLimit('track', request, { requests: 300, window: '10 m' })
  if (!rl.allowed) return done()

  if (body.t === 'engage') {
    await recordEngagement({ ms: body.ms })
    return done()
  }
  if (body.t !== 'view') return done()

  const path = normalisePath(body.path)
  if (isUntrackedPath(path)) return done()
  const landing = body.landing === true
  const ownHost = request.headers.get('host') || ''
  const country = (request.headers.get('x-vercel-ip-country') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2)
  await recordView({
    request,
    path,
    landing,
    source: landing ? classifySource({ referrer: String(body.ref || ''), utmSource: String(body.utm || ''), ownHost }) : null,
    country,
    device: deviceOf(ua),
  })
  return done()
}
