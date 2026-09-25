'use client'

/**
 * The centred card every sign-in page shares (/login, /forgot-password,
 * /set-password) — the same frame the retired access-code page used.
 */
import Link from 'next/link'
import { BRAND } from '@/lib/reportStyle'

export function AuthShell({ eyebrow, title, intro, children, footer }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="grid-bg" style={{ position: 'fixed', inset: 0, opacity: .5, pointerEvents: 'none' }} />
      <main className="card rise rise-1" style={{ width: '100%', maxWidth: 440, padding: '40px 34px', position: 'relative' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 26, textDecoration: 'none' }}>
          <div style={{ width: 34, height: 34, borderRadius: 7, display: 'grid', placeItems: 'center',
            background: 'linear-gradient(150deg, var(--navy), var(--ink-deep))', color: '#fff', fontWeight: 700,
            fontFamily: 'var(--font-mono)', fontSize: 14, border: '1px solid var(--navy-light)',
            boxShadow: '0 4px 12px rgba(26,46,74,.3)' }}>{BRAND.mark}</div>
          <span className="display" style={{ fontWeight: 700, fontSize: 18, color: 'var(--ink)' }}>{BRAND.name}</span>
        </Link>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 style={{ fontSize: 26, margin: '8px 0 6px', color: 'var(--ink)' }}>{title}</h1>
        {intro && <p style={{ fontSize: 14, color: 'var(--text-soft)', margin: '0 0 22px', lineHeight: 1.6 }}>{intro}</p>}
        {children}
        {footer}
      </main>
    </div>
  )
}

export function FormError({ children }) {
  if (!children) return null
  return <p role="alert" style={{ color: 'var(--danger)', fontSize: 13, margin: '10px 0 0', lineHeight: 1.5 }}>{children}</p>
}

export function FormNote({ children }) {
  if (!children) return null
  return <p role="status" style={{ color: 'var(--text)', fontSize: 14, margin: '10px 0 0', lineHeight: 1.6 }}>{children}</p>
}

export function SubmitButton({ loading, disabled, children, loadingText }) {
  return (
    <button type="submit" className="btn btn-primary" disabled={loading || disabled}
      style={{ width: '100%', justifyContent: 'center', marginTop: 18, padding: '13px' }}>
      {loading ? loadingText : children}
    </button>
  )
}

export const linkStyle = { color: 'var(--navy)', textDecoration: 'underline' }
