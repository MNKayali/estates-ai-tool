'use client'

/* Visual preview of the access gate — no real auth side effects. */
import { useState } from 'react'
import Link from 'next/link'

export default function PreviewAccess() {
  const [code, setCode] = useState('')
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
          This tool is provided to authorised estates teams. Enter the code shared with you to continue.
        </p>

        <form onSubmit={e => e.preventDefault()}>
          <label className="label">Access code</label>
          <input
            className="field"
            type="password"
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="••••••••"
            style={{ fontFamily: 'var(--font-mono)', letterSpacing: '.18em' }}
          />
          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 16, padding: '13px' }}>
            Unlock ▸
          </button>
        </form>

        <p style={{ fontSize: 12, color: 'var(--text-mute)', textAlign: 'center', marginTop: 22, lineHeight: 1.6 }}>
          By continuing you agree to our{' '}
          <Link href="/preview" style={{ color: 'var(--blue)' }}>Terms</Link> and{' '}
          <Link href="/preview" style={{ color: 'var(--blue)' }}>Privacy Notice</Link>.
        </p>
      </div>
    </div>
  )
}
