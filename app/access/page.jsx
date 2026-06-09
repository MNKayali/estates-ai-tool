'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function AccessForm() {
  const [code, setCode]       = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const from         = searchParams.get('from') || '/questionnaire'

  async function submit(e) {
    e.preventDefault()
    if (!code.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/check-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })
      if (res.ok) {
        window.location.href = from
      } else {
        setError('Incorrect access code. Please try again.')
        setCode('')
      }
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <label className="label">Access code</label>
      <input
        className="field"
        type="password"
        value={code}
        onChange={e => setCode(e.target.value)}
        placeholder="Enter your access code"
        autoFocus
        autoComplete="off"
        style={{ fontFamily: 'var(--font-mono)', letterSpacing: '.18em',
          borderColor: error ? 'var(--danger)' : undefined }}
      />
      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 13, margin: '8px 0 0' }}>{error}</p>
      )}
      <button
        type="submit"
        className="btn btn-primary"
        disabled={loading || !code.trim()}
        style={{ width: '100%', justifyContent: 'center', marginTop: 16, padding: '13px' }}
      >
        {loading ? 'Verifying…' : 'Unlock ▸'}
      </button>
    </form>
  )
}

export default function AccessPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="grid-bg" style={{ position: 'fixed', inset: 0, opacity: .5, pointerEvents: 'none' }} />
      <div className="card rise rise-1" style={{ width: '100%', maxWidth: 440, padding: '40px 34px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 26 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center',
            background: 'linear-gradient(135deg, var(--blue), #2350D6)', color: '#fff', fontWeight: 800,
            fontFamily: 'var(--font-mono)', fontSize: 14, boxShadow: '0 4px 12px rgba(47,107,255,.4)' }}>AI</div>
          <span className="display" style={{ fontWeight: 700, fontSize: 18, color: 'var(--ink)' }}>Estates AI</span>
        </div>

        <div className="eyebrow">Restricted access</div>
        <h1 style={{ fontSize: 26, margin: '8px 0 6px', color: 'var(--ink)' }}>Enter your access code</h1>
        <p style={{ fontSize: 14, color: 'var(--text-soft)', margin: '0 0 22px', lineHeight: 1.6 }}>
          This tool is available to authorised estates teams. Enter the code shared with you to continue.
        </p>

        <Suspense fallback={<div style={{ color: 'var(--text-mute)' }}>Loading…</div>}>
          <AccessForm />
        </Suspense>

        <p style={{ fontSize: 12, color: 'var(--text-mute)', textAlign: 'center', marginTop: 22, lineHeight: 1.6 }}>
          By entering your access code you agree to our{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)' }}>Terms of Use</a>
          {' '}and acknowledge our{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)' }}>Privacy Notice</a>.
        </p>
      </div>
    </div>
  )
}
