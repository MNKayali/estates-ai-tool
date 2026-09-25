/**
 * lib/session.js — signed session cookie for signed-in users.
 *
 * Replaces the shared ACCESS_CODE cookie (September 2026). The cookie carries
 * `<base64url(JSON {uid, ver, exp})>.<hex HMAC-SHA256>` signed with
 * COOKIE_SECRET. It is not a session ID: nothing is stored per session. Revocation
 * works through `ver`, the user's sessionVersion in KV — changing a password or
 * disabling an account bumps it, and every token carrying the old number stops
 * verifying in lib/auth.js's getSessionUser().
 *
 * Web Crypto only (no node:crypto), so the same code runs in proxy.ts and in
 * route handlers.
 *
 * FAILS CLOSED: in production with no COOKIE_SECRET every token is rejected and
 * none can be issued. Off production a fixed development secret is used so a
 * local server works without the variable.
 */

export const SESSION_COOKIE = 'projento_session'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

const DEV_SECRET = 'development-only-session-secret'
const enc = new TextEncoder()

function secret() {
  const s = process.env.COOKIE_SECRET
  if (s) return s
  return process.env.NODE_ENV === 'production' ? null : DEV_SECRET
}

async function hmacKey(s) {
  return crypto.subtle.importKey('raw', enc.encode(s), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

function toHex(ab) {
  return [...new Uint8Array(ab)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

function b64urlEncode(str) {
  const bytes = enc.encode(str)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(str) {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))
}

/**
 * Sign a session token for a user. Returns null when no secret is available
 * (production without COOKIE_SECRET) — the caller must then refuse the login.
 */
export async function createSessionToken({ uid, ver }, maxAgeSeconds = SESSION_MAX_AGE, now = Date.now()) {
  const s = secret()
  if (!s || !uid) return null
  const body = b64urlEncode(JSON.stringify({ uid, ver: ver ?? 0, exp: Math.floor(now / 1000) + maxAgeSeconds }))
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(s), enc.encode(body))
  return `${body}.${toHex(sig)}`
}

/**
 * Verify a token's signature and expiry. Returns `{ uid, ver, exp }` or null.
 * Does not check the user still exists or is active — see lib/auth.js.
 */
export async function verifySessionToken(token, now = Date.now()) {
  const s = secret()
  if (!s || typeof token !== 'string') return null
  const dot = token.indexOf('.')
  if (dot < 1) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  if (!/^[0-9a-f]{64}$/.test(sig)) return null
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(s), fromHex(sig), enc.encode(body))
    if (!ok) return null
    const payload = JSON.parse(b64urlDecode(body))
    if (!payload?.uid || typeof payload.exp !== 'number') return null
    if (payload.exp * 1000 <= now) return null
    return payload
  } catch {
    return null
  }
}

/** Cookie attributes shared by every place that sets or clears the session. */
export function sessionCookieOptions(maxAge = SESSION_MAX_AGE) {
  return {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
  }
}
