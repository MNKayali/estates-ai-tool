'use client'

/**
 * The centred card every sign-in page shares (/login, /forgot-password,
 * /set-password) — the same frame the retired access-code page used.
 */
import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import Logo from './Logo'

export function AuthShell({ eyebrow, title, intro, children, footer }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="grid-bg" style={{ position: 'fixed', inset: 0, opacity: .5, pointerEvents: 'none' }} />
      <main className="card rise rise-1" style={{ width: '100%', maxWidth: 440, padding: '40px 34px', position: 'relative' }}>
        <Link href="/" aria-label={`${BRAND.name} home`} style={{ display: 'flex', alignItems: 'center', marginBottom: 26, textDecoration: 'none' }}>
          <Logo variant="navy" height={28} />
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
