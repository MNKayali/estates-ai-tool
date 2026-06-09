'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

const NAVY = '#1A2E4A'
const BLUE = '#2E75B6'

function LockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  )
}

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
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={{ fontWeight: 700, color: NAVY, fontSize: '14px', fontFamily: 'var(--font-display)', letterSpacing: '-0.1px' }}>
        Access code
      </label>
      <input
        type="password"
        value={code}
        onChange={e => setCode(e.target.value)}
        placeholder="Enter your access code"
        autoFocus
        autoComplete="off"
        style={{
          border: error ? `1.5px solid #C8102E` : '1.5px solid #E2E8F0',
          borderRadius: '8px', padding: '12px 14px', fontSize: '16px',
          color: '#111827', outline: 'none', fontFamily: 'var(--font-body)',
          width: '100%', boxSizing: 'border-box', marginBottom: '4px',
          background: '#fff',
        }}
      />
      {error && (
        <p style={{ color: '#C8102E', fontSize: '13px', margin: '0 0 8px', fontFamily: 'var(--font-body)' }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={loading || !code.trim()}
        style={{
          padding: '13px', borderRadius: '8px', border: 'none', fontWeight: 700,
          fontSize: '15px', fontFamily: 'var(--font-display)', letterSpacing: '-0.1px',
          cursor: loading || !code.trim() ? 'default' : 'pointer',
          background: loading || !code.trim() ? '#9AAEC4' : NAVY,
          color: '#fff', marginTop: '10px',
          boxShadow: loading || !code.trim() ? 'none' : '0 2px 12px rgba(26,46,74,0.28)',
        }}
      >
        {loading ? 'Verifying…' : 'Continue →'}
      </button>
    </form>
  )
}

export default function AccessPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#F4F7FC', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <header style={{ background: NAVY, padding: '0 32px', height: 60, display: 'flex', alignItems: 'center' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
          <div style={{ width: '32px', height: '32px', background: BLUE, borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '12px', fontFamily: 'var(--font-display)', letterSpacing: '0.5px' }}>AI</div>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: '17px', fontFamily: 'var(--font-display)', letterSpacing: '-0.2px' }}>Estates AI</span>
        </div>
      </header>

      {/* Card */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px' }}>
        <div style={{ width: '100%', maxWidth: '400px', background: '#fff', borderRadius: '14px', padding: '44px 36px', boxShadow: '0 4px 24px rgba(0,0,0,0.09)', border: '1px solid #E2E8F0' }}>

          <div style={{ width: '48px', height: '48px', background: '#EBF3FA', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
            <LockIcon />
          </div>

          <h1 style={{ color: NAVY, fontSize: '22px', fontWeight: 800, margin: '0 0 8px', fontFamily: 'var(--font-display)', letterSpacing: '-0.5px' }}>
            Access required
          </h1>
          <p style={{ color: '#6B7280', fontSize: '14px', margin: '0 0 28px', lineHeight: 1.65, fontFamily: 'var(--font-body)' }}>
            This tool is available to authorised users only. Enter your access code to continue.
          </p>

          <Suspense fallback={<div style={{ color: '#888' }}>Loading…</div>}>
            <AccessForm />
          </Suspense>

          <p style={{ color: '#9CA3AF', fontSize: '11px', lineHeight: 1.6, margin: '20px 0 0', textAlign: 'center', fontFamily: 'var(--font-body)' }}>
            By entering your access code you agree to our{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: BLUE, textDecoration: 'underline' }}>Terms of Use</a>
            {' '}and acknowledge our{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: BLUE, textDecoration: 'underline' }}>Privacy Notice</a>.
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #E2E8F0', padding: '16px 24px', textAlign: 'center' }}>
        <p style={{ color: '#9CA3AF', fontSize: '12px', margin: 0, fontFamily: 'var(--font-body)' }}>
          Estates AI — RIBA Stage 0–1 Feasibility Reports
        </p>
      </footer>

    </div>
  )
}
