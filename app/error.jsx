'use client'

/**
 * app/error.jsx
 *
 * Next.js route-segment error boundary — catches an unhandled error thrown
 * anywhere under the root layout (a page, a component, a client-side effect)
 * WITHOUT discarding that layout, unlike app/global-error.tsx, which only
 * fires for an error in the root layout itself and replaces the entire
 * document (fonts, header, everything). Until this file existed, every other
 * error had nowhere to land but global-error, so a single component throwing
 * took the whole app down harder than it needed to.
 */
import { useEffect } from 'react'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'

export default function Error({ error, reset }) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) Sentry.captureException(error)
  }, [error])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '24px', fontFamily: 'var(--font-body)' }}>
      <div className="card" style={{ maxWidth: '440px', width: '100%', padding: '40px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '16px' }}>⚠️</div>
        <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--navy)', fontSize: '20px', fontWeight: 700, margin: '0 0 12px' }}>
          Something went wrong
        </h2>
        <p style={{ color: 'var(--text-soft, #555)', fontSize: '14px', lineHeight: 1.6, margin: '0 0 24px' }}>
          An unexpected error occurred{process.env.NEXT_PUBLIC_SENTRY_DSN ? ' and has been logged automatically' : ''}. Your answers are saved in this browser, so trying again shouldn&apos;t lose your work.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={reset} className="btn-primary" style={{ padding: '12px 28px', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
            Try again
          </button>
          <Link href="/questionnaire" className="btn-ghost" style={{ padding: '12px 28px', borderRadius: '6px', fontWeight: 700, fontSize: '14px', textDecoration: 'none', display: 'inline-block' }}>
            Back to questionnaire
          </Link>
        </div>
      </div>
    </div>
  )
}
