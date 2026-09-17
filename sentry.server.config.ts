/**
 * Sentry server-side (Node.js) initialisation.
 * Loaded via instrumentation.ts → register().
 */
import * as Sentry from '@sentry/nextjs'
import { scrubEvent } from '@/lib/sentryScrub'

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    // This app handles client project data (postcodes, budgets, free text).
    // Never let the SDK attach request bodies, cookies or IPs on its own, and
    // scrub whatever does get through — see lib/sentryScrub.js.
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  })
}
