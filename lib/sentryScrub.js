/**
 * lib/sentryScrub.js
 *
 * Last-line-of-defence scrubber wired into every Sentry `init` as `beforeSend`.
 *
 * The primary control is at the call site — `scrubAnswers` in
 * app/api/generate-report/route.js sends an allowlisted projection rather than
 * the raw questionnaire. This exists because that only covers the errors we
 * capture deliberately: an unhandled exception, a breadcrumb, or a future
 * `captureException` written by someone who has not read this file can still
 * carry a request body or a URL query. Those paths go through `beforeSend`.
 *
 * It is intentionally blunt. Dropping a field that turns out to be harmless
 * costs a little debugging convenience; leaking a client's project details to a
 * third-party processor is not recoverable.
 */

// Answer keys that must never leave the system, matched case-insensitively
// anywhere in a key path. q1_0 project name, q1_1 postcode, q4_1 target date,
// q4_3 budget, and the three free-text fields.
const BANNED_KEY_RE =
  /(q1_0_|q1_1_|q4_1_|q4_3_|postcode|projectname|budget|objective|additionalcontext|instructions|_other$|email|address|phone)/i

// Query/body params worth removing wherever they appear in a URL.
const BANNED_PARAM_RE = /(^|[?&])(key|code|token|access[_-]?code)=[^&]*/gi

function scrubUrl(url) {
  if (typeof url !== 'string') return url
  return url.replace(BANNED_PARAM_RE, (_m, lead, name) => `${lead}${name}=[redacted]`)
}

function scrubValue(value, depth = 0) {
  if (depth > 6 || value == null) return value
  if (typeof value === 'string') return scrubUrl(value)
  if (Array.isArray(value)) return value.map(v => scrubValue(v, depth + 1))
  if (typeof value !== 'object') return value

  const out = {}
  for (const [k, v] of Object.entries(value)) {
    if (BANNED_KEY_RE.test(k)) { out[k] = '[redacted]'; continue }
    out[k] = scrubValue(v, depth + 1)
  }
  return out
}

/**
 * Sentry `beforeSend` / `beforeSendTransaction` hook.
 * Returns the event with sensitive fields replaced by '[redacted]'.
 */
export function scrubEvent(event) {
  if (!event) return event
  try {
    if (event.request) {
      if (event.request.url) event.request.url = scrubUrl(event.request.url)
      if (event.request.query_string) event.request.query_string = scrubValue(event.request.query_string)
      if (event.request.data) event.request.data = scrubValue(event.request.data)
      // Cookies carry the access token verbatim when COOKIE_SECRET is unset.
      delete event.request.cookies
      if (event.request.headers) {
        delete event.request.headers.cookie
        delete event.request.headers.Cookie
        delete event.request.headers.authorization
        delete event.request.headers.Authorization
      }
    }
    if (event.extra) event.extra = scrubValue(event.extra)
    if (event.contexts) event.contexts = scrubValue(event.contexts)
    if (Array.isArray(event.breadcrumbs)) {
      event.breadcrumbs = event.breadcrumbs.map(b => ({
        ...b,
        data: b?.data ? scrubValue(b.data) : b?.data,
        message: typeof b?.message === 'string' ? scrubUrl(b.message) : b?.message,
      }))
    }
    // The tool is behind a shared access code and has no user accounts, so there
    // is no user identity worth reporting — and IP is personal data.
    delete event.user
  } catch {
    // A scrubber that throws must not take the error report with it — but an
    // unscrubbed event is worse than no event, so drop it.
    return null
  }
  return event
}
