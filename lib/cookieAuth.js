/**
 * Cookie HMAC helpers — edge + Node compatible (Web Crypto only).
 *
 * When COOKIE_SECRET is set the access cookie carries
 * HMAC-SHA256(ACCESS_CODE, COOKIE_SECRET) as a 64-char hex string.
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

/**
 * Returns the value to store in the estate_access cookie.
 * Callers: check-access route (on login) and report-pdf route (for Puppeteer).
 */
export async function signAccessCode(code) {
  const secret = process.env.COOKIE_SECRET
  if (!secret) return code
  const key = await hmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(code))
  return toHex(sig)
}

/**
 * Returns true if cookieValue is a valid token for code.
 * Works in Edge runtime and Node (no Buffer, no node:crypto).
 */
export async function verifyAccessCode(cookieValue, code) {
  if (!cookieValue) return false
  const secret = process.env.COOKIE_SECRET
  if (!secret) return cookieValue === code
  if (!/^[0-9a-f]{64}$/.test(cookieValue)) return false
  const key = await hmacKey(secret)
  try {
    return await crypto.subtle.verify('HMAC', key, fromHex(cookieValue), enc.encode(code))
  } catch {
    return false
  }
}
