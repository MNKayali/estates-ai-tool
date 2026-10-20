'use client'

/**
 * Pieces shared by the admin pages (/admin and /admin/reports): the header,
 * the inline admin-code form shown on a 401, and small formatters.
 */

import { useState } from 'react'
import Link from 'next/link'
import { Card, Badge } from '../components/ui'
import Logo from '../components/Logo'

export const f1k = n => (n == null ? '—' : `£${(Math.round(n / 1000) * 1000).toLocaleString('en-GB')}`)

// ─── Header ─────────────────────────────────────────────────────────────────
export function Header({ current = 'dashboard' }) {
  // The estate_admin cookie previously had no way to revoke short of clearing
  // browser data by hand — the more sensitive of the app's two cookies to
  // leave signed in on a shared machine.
  async function logout() {
    try { await fetch('/api/logout', { method: 'POST' }) } catch {}
    window.location.reload()
  }
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(250,248,243,.82)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Logo variant="navy" height={24} />
        <Badge>Admin</Badge>
        <nav aria-label="Admin" style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
          {[['dashboard', '/admin', 'Dashboard'], ['reports', '/admin/reports', 'All reports']].map(([key, href, label]) => (
            <Link key={key} href={href} className="btn btn-ghost" aria-current={current === key ? 'page' : undefined}
              style={{ padding: '6px 12px', fontSize: 13, fontWeight: current === key ? 600 : 400, color: current === key ? 'var(--ink)' : 'var(--text-mid)' }}>
              {label}
            </Link>
          ))}
        </nav>
        <button onClick={logout} className="btn btn-ghost" style={{ marginLeft: 'auto', padding: '6px 14px', fontSize: 13 }}>
          Log out
        </button>
      </div>
    </header>
  )
}

// ─── Admin login (inline, shown on 401) ─────────────────────────────────────
export function AdminLogin({ onSuccess }) {
  const [code, setCode]       = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!code.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })
      if (res.ok) { onSuccess() }
      else { setError('Incorrect admin code.'); setCode('') }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Centered>
      <Card className="rise rise-1" style={{ width: '100%', maxWidth: 420, padding: '36px 32px' }}>
        <div className="eyebrow">Restricted</div>
        <h1 style={{ fontSize: 24, margin: '8px 0 6px', color: 'var(--ink)' }}>Admin access</h1>
        <p style={{ fontSize: 14, color: 'var(--text-soft)', margin: '0 0 22px', lineHeight: 1.6 }}>
          Enter the admin code to manage accounts and view system status and all generated reports.
        </p>
        <form onSubmit={submit}>
          <label className="label">Admin code</label>
          <input
            className="field"
            type="password"
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="Enter admin code"
            autoFocus
            autoComplete="off"
            style={{ fontFamily: 'var(--font-mono)', letterSpacing: '.18em', borderColor: error ? 'var(--danger)' : undefined }}
          />
          {error && <p style={{ color: 'var(--danger)', fontSize: 13, margin: '8px 0 0' }}>{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={loading || !code.trim()}
            style={{ width: '100%', justifyContent: 'center', marginTop: 16, padding: 13 }}>
            {loading ? 'Verifying…' : 'Unlock ▸'}
          </button>
        </form>
      </Card>
    </Centered>
  )
}

// The report's own consistency checks (lib/consistency.js): text that
// contradicts the register, programme or budget. Advisory — nothing blocks a
// report — so they are listed here for whoever reviews reports.
export function Checks({ checks }) {
  if (!Array.isArray(checks)) return <span style={{ color: 'var(--text-mid)' }}>—</span>
  if (checks.length === 0) return <span style={{ color: 'var(--text-mid)' }}>No issues</span>
  return (
    <details>
      <summary style={{ cursor: 'pointer', color: 'var(--warn)', fontWeight: 600 }}>
        {checks.length} {checks.length === 1 ? 'warning' : 'warnings'}
      </summary>
      <ul style={{ margin: '6px 0 0', paddingLeft: 16, maxWidth: 360 }}>
        {checks.map((c, i) => <li key={i} style={{ marginBottom: 4 }}>{c.message}</li>)}
      </ul>
    </details>
  )
}

// ─── Small helpers ──────────────────────────────────────────────────────────
export function Centered({ children }) {
  return <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>{children}</div>
}

export function Spinner() {
  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ width: 34, height: 34, border: '4px solid var(--navy)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
    </>
  )
}

export function fmtDate(iso) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return '—'
  return new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
