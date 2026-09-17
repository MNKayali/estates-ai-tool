/**
 * Sentry browser initialisation.
 *
 * This file replaces sentry.client.config.ts, which was dead code. Next 16 uses
 * Turbopack by default for both `next dev` and `next build`, and under Turbopack
 * the Sentry SDK only injects into `instrumentation-client.*` and
 * `instrumentation.*` — the old `sentry.client.config.ts` is never loaded by
 * anything. Nothing imported it either, so the browser SDK was never initialised:
 * `Sentry.captureException` in app/global-error.tsx was a silent no-op, and the
 * "The issue has been logged automatically" line it shows users was false.
 *
 * No-ops gracefully when NEXT_PUBLIC_SENTRY_DSN is not set.
 */
import * as Sentry from '@sentry/nextjs'
import { scrubEvent } from '@/lib/sentryScrub'

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,

    // This app handles client project data. Do not let the SDK attach request
    // bodies, cookies or IPs, and scrub anything that slips through.
    sendDefaultPii: false,
    beforeSend: scrubEvent,

    // Session replay: only capture on errors (keeps quota low).
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,   // never capture typed text — the questionnaire is full of it
        blockAllMedia: true,
      }),
    ],
  })
}

// Required by the Sentry SDK to instrument App Router client-side navigations.
// Without it the SDK logs a warning and route transitions are untraced.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
