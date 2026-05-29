'use client'

/**
 * Next.js App Router global error boundary.
 * Captures unhandled render errors and forwards them to Sentry (if configured).
 */
import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.captureException(error)
    }
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'Arial, sans-serif', background: '#F7F9FC', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ maxWidth: '440px', width: '100%', background: '#fff', borderRadius: '8px', padding: '40px 32px', boxShadow: '0 2px 16px rgba(0,0,0,0.10)', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ color: '#1A2E4A', fontSize: '20px', fontWeight: 700, margin: '0 0 12px' }}>
            Something went wrong
          </h2>
          <p style={{ color: '#555', fontSize: '14px', lineHeight: 1.6, margin: '0 0 24px' }}>
            An unexpected error occurred. The issue has been logged automatically.
            Please try again, or start a new report.
          </p>
          <button
            onClick={reset}
            style={{ padding: '12px 28px', background: '#1A2E4A', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
