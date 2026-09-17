/**
 * lib/rateLimit.js
 *
 * Sliding-window rate limiting on top of the same Vercel KV store everything
 * else in the app already uses — see lib/kv.js. Before this, the only
 * brute-force control anywhere was a 600ms artificial delay on a failed
 * /api/check-access attempt, which is itself a cheap way for an anonymous
 * caller to hold a function open; nothing bounded repeated attempts at all on
 * /api/admin/login, and nothing bounded call *volume* (as opposed to a single
 * call's duration) on the AI-calling routes, which is where real money is at
 * stake per request.
 *
 * Fails OPEN, not closed: if KV/the rate limiter itself is unavailable (no
 * env vars in local dev, a transient KV outage), every check here returns
 * `allowed: true` rather than throwing or blocking. The alternative — failing
 * closed — would mean a KV hiccup takes down both persistence AND all API
 * access at once, which is a worse outcome than temporarily having no rate
 * limiting. This mirrors the graceful-degradation posture lib/kv.js already
 * uses throughout.
 */
import { Ratelimit } from '@upstash/ratelimit'
import { kv } from '@vercel/kv'

// One Ratelimit instance per named policy, created lazily and cached — a
// fresh instance per request would still work correctly (the sliding-window
// state lives in KV, not in the instance) but there's no reason to pay for it
// on every call.
const limiters = new Map()

function getLimiter(name, requests, window) {
  let limiter = limiters.get(name)
  if (!limiter) {
    limiter = new Ratelimit({
      redis: kv,
      limiter: Ratelimit.slidingWindow(requests, window),
      analytics: false,
      // Namespaced per policy so the same caller's budget on one route can
      // never bleed into another's — a burst against /api/generate-report
      // doesn't cost anything against /api/feedback's separate allowance.
      prefix: `ratelimit:${name}`,
    })
    limiters.set(name, limiter)
  }
  return limiter
}

// Best-effort caller identity. On Vercel, requests arrive through their proxy
// with x-forwarded-for already set to the real client IP; locally (and behind
// any proxy that doesn't set it) every caller collapses to one shared bucket,
// which is a acceptable degradation for a single-developer dev server.
function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}

/**
 * Returns { allowed, retryAfterSeconds }. Never throws — see file header for
 * why a failure here means "allow", not "block".
 *
 * @param {string} name - policy name, becomes both the KV key prefix and part
 *   of the per-caller key, so the same IP is tracked independently per route.
 * @param {Request} request
 * @param {{requests: number, window: string}} opts - e.g. {requests: 10, window: '10 m'}
 *   (window syntax: "<number> <ms|s|m|h|d>", per @upstash/ratelimit).
 */
export async function checkRateLimit(name, request, { requests, window }) {
  try {
    const limiter = getLimiter(name, requests, window)
    const ip = clientIp(request)
    const { success, reset } = await limiter.limit(ip)
    return {
      allowed: success,
      retryAfterSeconds: success ? 0 : Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
    }
  } catch (e) {
    console.warn(`[rateLimit] ${name} check failed (failing open):`, e.message)
    return { allowed: true, retryAfterSeconds: 0 }
  }
}

/** Standard 429 response for a route that failed checkRateLimit(). */
export function rateLimitedResponse(retryAfterSeconds) {
  return Response.json(
    { error: 'Too many requests. Please wait a moment and try again.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
  )
}
