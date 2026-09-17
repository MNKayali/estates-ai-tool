'use client'

/**
 * app/questionnaire/error.jsx
 *
 * Route-segment error boundary scoped to the questionnaire. Falls back to
 * app/error.jsx's generic copy for every other page; this one exists because
 * the questionnaire is where an in-progress draft lives, and a user hitting
 * an error here needs to know specifically that their answers are still in
 * localStorage (see the autosave guard in app/questionnaire/page.jsx) before
 * they retry — the generic message doesn't know that.
 */
import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function QuestionnaireError({ error, reset }) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) Sentry.captureException(error)
  }, [error])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '24px', fontFamily: 'var(--font-body)' }}>
      <div className="card" style={{ maxWidth: '440px', width: '100%', padding: '40px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '16px' }}>⚠️</div>
        <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--navy)', fontSize: '20px', fontWeight: 700, margin: '0 0 12px' }}>
          The questionnaire hit a snag
        </h2>
        <p style={{ color: 'var(--text-soft, #555)', fontSize: '14px', lineHeight: 1.6, margin: '0 0 24px' }}>
          Your answers are saved in this browser and will still be there when you continue{process.env.NEXT_PUBLIC_SENTRY_DSN ? ' — the issue has been logged automatically' : ''}.
        </p>
        <button onClick={reset} className="btn-primary" style={{ padding: '12px 28px', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
          Continue
        </button>
      </div>
    </div>
  )
}
