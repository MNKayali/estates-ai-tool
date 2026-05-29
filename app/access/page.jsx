'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const NAVY = '#1F3864'
const BLUE = '#2E75B6'

function AccessForm() {
  const [code, setCode]       = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const router       = useRouter()
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
        router.push(from)
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
      <label style={{ fontWeight: 700, color: NAVY, fontSize: '14px', fontFamily: 'Arial, sans-serif' }}>
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
          border: error ? '1px solid #C00000' : '1px solid #CCC',
          borderRadius: '6px', padding: '12px 14px', fontSize: '16px',
          color: '#1A1A1A', outline: 'none', fontFamily: 'Arial, sans-serif',
          width: '100%', boxSizing: 'border-box', marginBottom: '4px',
        }}
      />
      {error && (
        <p style={{ color: '#C00000', fontSize: '13px', margin: '0 0 8px', fontFamily: 'Arial, sans-serif' }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={loading || !code.trim()}
        style={{
          padding: '13px', borderRadius: '6px', border: 'none', fontWeight: 700,
          fontSize: '15px', fontFamily: 'Arial, sans-serif', cursor: loading || !code.trim() ? 'default' : 'pointer',
          background: loading || !code.trim() ? '#9AAEC4' : NAVY,
          color: '#fff', marginTop: '8px',
        }}
      >
        {loading ? 'Verifying…' : 'Continue →'}
      </button>
    </form>
  )
}

export default function AccessPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#F7F9FC', display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif' }}>

      {/* Header */}
      <header style={{ background: NAVY, padding: '12px 24px' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px', height: '32px', background: BLUE, borderRadius: '4px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: '13px',
          }}>AI</div>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: '16px' }}>Estates AI Tool</span>
        </div>
      </header>

      {/* Card */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
        <div style={{
          width: '100%', maxWidth: '400px', background: '#fff', borderRadius: '8px',
          padding: '40px 32px', boxShadow: '0 2px 16px rgba(0,0,0,0.10)',
        }}>
          {/* Icon */}
          <div style={{
            width: '48px', height: '48px', background: '#EEF4FA', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '22px', marginBottom: '20px',
          }}>🔒</div>

          <h1 style={{ color: NAVY, fontSize: '22px', fontWeight: 700, margin: '0 0 8px' }}>
            Access required
          </h1>
          <p style={{ color: '#555', fontSize: '14px', margin: '0 0 28px', lineHeight: 1.6 }}>
            This tool is available to authorised users only.
            Enter your access code to continue.
          </p>

          <Suspense fallback={<div style={{ color: '#888' }}>Loading…</div>}>
            <AccessForm />
          </Suspense>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #E5E7EB', padding: '12px 24px', textAlign: 'center' }}>
        <p style={{ color: '#999', fontSize: '12px', margin: 0 }}>
          Estates AI Tool — RIBA Stage 0–1 Feasibility Reports
        </p>
      </footer>

    </div>
  )
}
