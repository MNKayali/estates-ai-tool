/**
 * Cookie HMAC helpers — edge + Node compatible (Web Crypto only).
 *
 * Used for the admin cookie (estate_admin) only since user accounts replaced the
 * shared ACCESS_CODE (September 2026; see lib/session.js). When COOKIE_SECRET is
 * set the cookie carries an expiry and an HMAC-SHA256 of the code and that
 * expiry, keyed with COOKIE_SECRET (`<exp>.<64 hex>` — see signAccessCode).
 * If COOKIE_SECRET is absent the functions fall back to the plain-text
 * comparison that existed before — so local dev without the var still works,
 * and production deployments that set COOKIE_SECRET get constant-time
 * verification with no raw access code in the cookie jar.
 */

const enc = new TextEncoder()

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign', 'verify']
  )
}

function toHex(ab) {
  return [...new Uint8Array(ab)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes.buffer
}

export const ADMIN_MAX_AGE = 60 * 60 * 24 * 30 // 30 days, the cookie's own maxAge

/**
 * Returns the value to store in the estate_admin cookie: `<exp>.<hex HMAC>`,
 * where the HMAC covers the admin code and the expiry (unix seconds). The
 * expiry is checked on the server, so a copied cookie stops working after
 * ADMIN_MAX_AGE even if the browser kept it (security review, October 2026 —
 * the token used to be a static HMAC of the code with no expiry). Changing
 * ADMIN_CODE or COOKIE_SECRET still invalidates every token at once.
 * Caller: the admin login route.
 */
export async function signAccessCode(code, maxAgeSeconds = ADMIN_MAX_AGE, now = Date.now()) {
  const secret = process.env.COOKIE_SECRET
  if (!secret) return code
  const exp = Math.floor(now / 1000) + maxAgeSeconds
  const key = await hmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`admin:${code}:${exp}`))
  return `${exp}.${toHex(sig)}`
}

/**
 * Returns true if cookieValue is a valid, unexpired token for code. A token
 * in the old format (a bare 64-char HMAC) is refused — the admin signs in once
 * more. Works in Edge runtime and Node (no Buffer, no node:crypto).
 */
export async function verifyAccessCode(cookieValue, code, now = Date.now()) {
  if (!cookieValue) return false
  const secret = process.env.COOKIE_SECRET
  if (!secret) return cookieValue === code
  const m = /^(\d{1,12})\.([0-9a-f]{64})$/.exec(cookieValue)
  if (!m) return false
  const exp = Number(m[1])
  if (exp * 1000 <= now) return false
  const key = await hmacKey(secret)
  try {
    return await crypto.subtle.verify('HMAC', key, fromHex(m[2]), enc.encode(`admin:${code}:${exp}`))
  } catch {
    return false
  }
}
