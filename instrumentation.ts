/**
 * Next.js instrumentation hook — wires up Sentry for server + edge runtimes.
 * The browser half lives in instrumentation-client.ts.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Required since Next 15 to capture server-side request errors — errors thrown
// inside nested React Server Components and route handlers do not reach the
// SDK's global handlers without it. Missing this meant server error coverage was
// partial in exactly the places hardest to reproduce.
export const onRequestError = Sentry.captureRequestError

