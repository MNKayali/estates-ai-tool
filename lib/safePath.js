/**
 * lib/safePath.js — pure, safe in the browser.
 */

/**
 * A post-login destination from a `from` query parameter, restricted to a path
 * on this site — never `//evil.example` or `https://…` (an open redirect).
 */
export function safeNextPath(from, fallback = '/reports') {
  if (typeof from !== 'string') return fallback
  if (!from.startsWith('/') || from.startsWith('//') || from.startsWith('/\\')) return fallback
  return from
}
