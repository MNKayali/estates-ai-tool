/**
 * Sentry Edge runtime initialisation.
 * Loaded via instrumentation.ts → register().
 */
import * as Sentry from '@sentry/nextjs'
import { scrubEvent } from '@/lib/sentryScrub'

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    // See lib/sentryScrub.js. The edge runtime is where proxy.ts runs, so this
    // is the path most likely to carry the access cookie.
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  })
}
