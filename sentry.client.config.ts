/**
 * Sentry client-side initialisation.
 * Loaded automatically by Next.js via instrumentation hooks.
 * No-ops gracefully when NEXT_PUBLIC_SENTRY_DSN is not set.
 */
import * as Sentry from '@sentry/nextjs'

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,

    // Session replay: only capture on errors (keeps quota low)
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,   // never capture typed text
        blockAllMedia: true,
      }),
    ],
  })
}
