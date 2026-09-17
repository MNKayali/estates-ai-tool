/**
 * app/not-found.tsx
 *
 * Renders for any unmatched route, and for an explicit notFound() call from a
 * route handler. A plain link-list is a poor first impression for a gated
 * professional tool, and the app had nothing here at all before this.
 */
import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '24px', fontFamily: 'var(--font-body)' }}>
      <div className="card" style={{ maxWidth: '440px', width: '100%', padding: '40px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '16px' }}>🔍</div>
        <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--navy)', fontSize: '20px', fontWeight: 700, margin: '0 0 12px' }}>
          Page not found
        </h2>
        <p style={{ color: 'var(--text-soft, #555)', fontSize: '14px', lineHeight: 1.6, margin: '0 0 24px' }}>
          That page doesn&apos;t exist, or the link may be out of date.
        </p>
        <Link href="/questionnaire" className="btn-primary" style={{ padding: '12px 28px', borderRadius: '6px', fontWeight: 700, fontSize: '14px', textDecoration: 'none', display: 'inline-block' }}>
          Start a feasibility report
        </Link>
      </div>
    </div>
  )
}
