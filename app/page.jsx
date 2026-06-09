'use client'

import Link from 'next/link'
import { Badge, Card, Stat } from './components/ui'

const INCLUDED = [
  { k: '01', t: 'NRM1 Cost Estimate', d: 'Order-of-cost with low, mid and high ranges, built deterministically from NRM1 benchmark rates, BCIS location factor, prelims, fees, risk and inflation. No figure is ever invented.' },
  { k: '02', t: 'RIBA Programme', d: 'Stage-by-stage design, surveys, planning and construction durations — size-banded and adjusted for complexity modifiers, with a Gantt overview.' },
  { k: '03', t: 'Risk Register', d: 'A project-specific risk table, RAG-rated and seeded deterministically from your inputs, with mitigations written in plain English.' },
  { k: '04', t: 'Procurement Advice', d: 'A recommended contract form and procurement route matched to your priorities, programme and project complexity.' },
]

export default function LandingPage() {
  return (
    <div>
      {/* ── Top bar ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 30, backdropFilter: 'blur(10px)',
        background: 'rgba(245,248,252,.72)', borderBottom: '1px solid var(--border)' }}>
        <div style={wrap(1120)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0' }}>
            <Brand />
            <Link href="/questionnaire" className="btn btn-primary">Launch tool ▸</Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="panel-dark" style={{ position: 'relative', overflow: 'hidden' }}>
        <div className="grid-bg" style={{ position: 'absolute', inset: 0, opacity: .25 }} />
        <div className="sheen" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
        <div style={{ ...wrap(1120), position: 'relative' }}>
          <div style={{ padding: '92px 0 88px', maxWidth: 760 }}>
            <div className="rise rise-1"><Badge dark>RIBA Stage 0–1 · Feasibility</Badge></div>
            <h1 className="rise rise-2" style={{ fontSize: 'clamp(38px, 6vw, 66px)', lineHeight: 1.04, margin: '20px 0 0', color: '#fff' }}>
              Feasibility intelligence<br />for university estates.
            </h1>
            <p className="rise rise-3" style={{ fontSize: 19, lineHeight: 1.6, color: '#AFC2DE', maxWidth: 560, margin: '22px 0 0' }}>
              Answer a guided questionnaire and get a complete NRM1 cost estimate, RIBA stage
              programme and risk register — a costed, programmed Stage&nbsp;1 report in minutes, not weeks.
            </p>
            <div className="rise rise-4" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 34 }}>
              <Link href="/questionnaire" className="btn btn-primary" style={{ fontSize: 16, padding: '14px 26px' }}>Start questionnaire ▸</Link>
            </div>
            <p className="rise rise-4 mono" style={{ marginTop: 18, fontSize: 12, color: '#7E92B4', letterSpacing: '.04em' }}>
              ~10–15 MIN · PROGRESS AUTO-SAVED · ON-SCREEN + .DOCX + PDF EXPORT
            </p>
          </div>
        </div>
      </section>

      {/* ── Stat strip ── */}
      <section style={{ ...wrap(1120), marginTop: -36, position: 'relative', zIndex: 5 }}>
        <Card className="rise rise-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 28, padding: '26px 30px' }}>
          <Stat value="NRM1" label="Cost methodology" />
          <Stat value="S1–S6" label="Programme size bands" />
          <Stat value="0" label="AI-invented figures" />
          <Stat value="90 days" label="Shareable report links" />
        </Card>
      </section>

      {/* ── What's included ── */}
      <section style={{ ...wrap(1120), padding: '72px 0 24px' }}>
        <div className="eyebrow">What the report includes</div>
        <h2 style={{ fontSize: 30, margin: '10px 0 28px', color: 'var(--ink)' }}>Every report, four deterministic pillars</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 18 }}>
          {INCLUDED.map((c, i) => (
            <Card key={c.k} lift className={`rise rise-${(i % 4) + 1}`} style={{ padding: '24px 22px' }}>
              <div className="mono" style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 700 }}>{c.k}</div>
              <h3 style={{ fontSize: 18, margin: '12px 0 8px', color: 'var(--ink)' }}>{c.t}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-soft)', margin: 0 }}>{c.d}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ── CTA band ── */}
      <section style={{ ...wrap(1120), padding: '40px 0 80px' }}>
        <Card className="panel-dark" style={{ padding: '48px 44px', border: 'none', display: 'flex',
          flexWrap: 'wrap', gap: 24, alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 28, margin: 0, color: '#fff' }}>Ready to scope a project?</h2>
            <p style={{ color: '#AFC2DE', margin: '10px 0 0', fontSize: 16 }}>Answer the questionnaire and download a board-ready report.</p>
          </div>
          <Link href="/questionnaire" className="btn btn-primary" style={{ fontSize: 16, padding: '14px 28px' }}>Begin assessment ▸</Link>
        </Card>
      </section>

      <Footer />
    </div>
  )
}

function Brand() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center',
        background: 'linear-gradient(135deg, var(--blue), #2350D6)', color: '#fff', fontWeight: 800,
        fontFamily: 'var(--font-mono)', fontSize: 13, boxShadow: '0 4px 12px rgba(47,107,255,.4)' }}>AI</div>
      <span className="display" style={{ fontWeight: 700, fontSize: 17, color: 'var(--ink)' }}>Estates AI</span>
    </div>
  )
}

function Footer() {
  return (
    <footer style={{ borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,.5)' }}>
      <div style={{ ...wrap(1120), padding: '26px 0', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <span className="mono" style={{ fontSize: 12, color: 'var(--text-mute)' }}>ESTATES AI · RIBA STAGE 0–1</span>
        <span style={{ fontSize: 12, color: 'var(--text-mute)', maxWidth: 620, textAlign: 'right' }}>
          Costs derived from NRM1 benchmark data — all calculations deterministic, no figures generated by AI.
          Indicative at Stage 0–1 only; always verify with a Chartered Quantity Surveyor.
        </span>
      </div>
    </footer>
  )
}

function wrap(max) { return { maxWidth: max, margin: '0 auto', padding: '0 24px' } }
