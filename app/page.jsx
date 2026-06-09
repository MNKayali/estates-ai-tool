'use client'

import Link from 'next/link'

function BarChartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  )
}
function CalendarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}
function ShieldIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  )
}
function FileTextIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  )
}

const FEATURES = [
  {
    icon: <BarChartIcon />,
    title: 'NRM1 Cost Estimate',
    desc: 'Order-of-cost with low, mid and high ranges, derived from NRM1 v4.5 benchmark rates. Building-use specific scope items.',
  },
  {
    icon: <CalendarIcon />,
    title: 'RIBA Programme',
    desc: 'Stage-by-stage design and construction timeline, scaled to project size and adjusted for complexity modifiers.',
  },
  {
    icon: <ShieldIcon />,
    title: 'Risk Register',
    desc: 'Project-specific risk table with RAG ratings and mitigations, seeded deterministically from your inputs.',
  },
  {
    icon: <FileTextIcon />,
    title: 'Procurement Advice',
    desc: 'Contract form and procurement route recommendation based on your priorities, programme and project complexity.',
  },
]

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#F4F7FC' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header style={{ background: '#1A2E4A', padding: '0 32px', height: 60, display: 'flex', alignItems: 'center' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, background: '#2E75B6', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, letterSpacing: '0.5px' }}>AI</div>
            <span style={{ color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 17, letterSpacing: '-0.2px' }}>Estates AI</span>
          </div>
          <Link href="/questionnaire"
            style={{ background: '#2E75B6', color: '#fff', padding: '8px 20px', borderRadius: 6, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, letterSpacing: '-0.1px', boxShadow: '0 2px 10px rgba(46,117,182,0.4)' }}>
            Launch Tool →
          </Link>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section style={{ background: 'linear-gradient(150deg, #1A2E4A 0%, #1F3864 55%, #274e87 100%)', padding: '88px 32px 108px' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: 'rgba(46,117,182,0.2)', border: '1px solid rgba(46,117,182,0.4)', color: '#93C5E8', fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', padding: '5px 16px', borderRadius: 20, marginBottom: 32, fontFamily: 'var(--font-display)' }}>
            RIBA Stage 0–1 · Feasibility Reports
          </div>
          <h1 style={{ color: '#fff', fontSize: 'clamp(30px, 5vw, 54px)', fontFamily: 'var(--font-display)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-1.5px', margin: '0 0 22px' }}>
            Professional feasibility reports,<br />generated in minutes
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 17, lineHeight: 1.8, margin: '0 auto 44px', fontFamily: 'var(--font-body)', maxWidth: 540 }}>
            Answer a guided questionnaire. Get a complete NRM1 cost estimate, RIBA stage programme, and project risk register — ready for management or funder submission.
          </p>
          <Link href="/questionnaire"
            style={{ display: 'inline-block', background: '#2E75B6', color: '#fff', padding: '16px 44px', borderRadius: 8, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, boxShadow: '0 6px 28px rgba(46,117,182,0.5)', letterSpacing: '-0.3px' }}>
            Start Questionnaire
          </Link>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginTop: 16, fontFamily: 'var(--font-body)' }}>
            10–15 minutes · Progress auto-saved
          </p>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section style={{ padding: '72px 32px 80px', maxWidth: 1100, margin: '0 auto' }}>
        <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 11, fontWeight: 700, letterSpacing: '1.8px', textTransform: 'uppercase', marginBottom: 48, fontFamily: 'var(--font-display)' }}>
          What the report includes
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 20 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ background: '#fff', borderRadius: 12, padding: '28px 24px', border: '1px solid #E2E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ width: 46, height: 46, background: '#EBF3FA', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2E75B6', marginBottom: 18 }}>
                {f.icon}
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: '#1A2E4A', marginBottom: 8, letterSpacing: '-0.2px' }}>{f.title}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: '#6B7280', lineHeight: 1.65 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Trust bar ──────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid #E2E8F0', padding: '28px 32px', background: '#fff', textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#9CA3AF', maxWidth: 640, margin: '0 auto', lineHeight: 1.7 }}>
          Costs derived from <strong style={{ color: '#6B7280', fontWeight: 500 }}>NRM1 v4.5 benchmark data</strong>. All calculations are deterministic — no figures are generated by AI.
          Indicative at RIBA Stage 0–1 only. Always verify with a Chartered Quantity Surveyor.
        </p>
      </footer>

    </div>
  )
}
