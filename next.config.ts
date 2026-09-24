import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  // puppeteer is a devDependency, but app/api/report-pdf imports it at runtime on
  // the non-Vercel branch. Because `process.env.VERCEL` is only known at runtime
  // the bundler cannot eliminate that import, so it must be externalised too or
  // it gets traced into the production function.
  serverExternalPackages: ['xlsx', '@sparticuz/chromium', 'puppeteer-core', 'puppeteer'],
  // lib/docx/fonts.js reads the IBM Plex TTFs at runtime to embed them in the
  // Word report; files read with fs are not traced automatically. Keys are
  // route globs (picomatch), so '*' covers the [id] segment.
  outputFileTracingIncludes: {
    '/api/reports/*/docx': ['./assets/fonts/**/*'],
    '/api/generate-report': ['./assets/fonts/**/*'],
  },
}

// Apply the Sentry build plugin (source-map upload) only when SENTRY_AUTH_TOKEN
// is set — i.e. in Vercel CI. Locally without the token, runtime capture via
// instrumentation.ts / instrumentation-client.ts still works; source maps just
// aren't uploaded, so stack traces show minified names.
//
// This file previously assigned `module.exports` in both branches of an if/else
// AND ended with `export default nextConfig`. Next loads a .ts config as an ES
// module and reads the default export, so the unconditional `export default` won
// every time and the whole Sentry wrapper was dead code — no source-map upload,
// no hideSourceMaps, no disableLogger, despite the comment claiming otherwise.
// One conditional default export, no CJS/ESM mixing.
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, {
      org:       process.env.SENTRY_ORG     || '',
      project:   process.env.SENTRY_PROJECT || 'estates-ai-tool',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent:    true,              // no extra build output
      widenClientFileUpload: true,  // better stack traces from async chunks
      disableLogger:         true,  // trim Sentry logger from prod bundle
      automaticVercelMonitors: false,
      // Replaces the old `hideSourceMaps`, which no longer exists in SDK v10 —
      // and which never actually applied here, since the wrapper was dead code
      // and the `require()` import made the options object untyped. Upload the
      // maps to Sentry, then delete them from the build so they are not served
      // to users. (This is v10's default; stated explicitly because the intent
      // matters more than the default.)
      sourcemaps: { deleteSourcemapsAfterUpload: true },
    })
  : nextConfig
