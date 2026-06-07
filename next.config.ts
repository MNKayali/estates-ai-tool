import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['xlsx', '@sparticuz/chromium', 'puppeteer-core'],
}

// Apply Sentry Webpack plugin (source-map upload) only when SENTRY_AUTH_TOKEN
// is set — i.e. in Vercel CI/production. In local dev without the token,
// runtime error capture via sentry.*.config.ts still works; source maps just
// won't be uploaded to Sentry (stack traces will show minified names locally).
if (process.env.SENTRY_AUTH_TOKEN) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { withSentryConfig } = require('@sentry/nextjs')
  module.exports = withSentryConfig(nextConfig, {
    org:       process.env.SENTRY_ORG     || '',
    project:   process.env.SENTRY_PROJECT || 'estates-ai-tool',
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent:    true,              // no extra build output
    widenClientFileUpload: true,  // better stack traces from async chunks
    hideSourceMaps:        true,  // don't ship source maps to users
    disableLogger:         true,  // trim Sentry logger from prod bundle
    automaticVercelMonitors: false,
  })
} else {
  module.exports = nextConfig
}

export default nextConfig
