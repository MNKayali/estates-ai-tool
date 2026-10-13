'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge, Card, Stat } from './components/ui'
import Logo from './components/Logo'
import { BRAND } from '@/lib/brand'
import { SiteNotice } from './components/SiteFooter'

const INCLUDED = [
  { k: '01', t: 'Cost estimate', d: 'An NRM1 order-of-cost estimate with low, mid and high figures: building works, preliminaries, fees, risk, inflation and VAT, adjusted for your region.' },
  { k: '02', t: 'Programme', d: 'A RIBA Plan of Work programme from brief to handover: design, surveys, planning, tender and construction, with dates and a Gantt chart.' },
  { k: '03', t: 'Risk register', d: 'The risks your answers point to, rated High, Medium or Low, each with a practical mitigation.' },
  { k: '04', t: 'Procurement suggestion', d: 'A preferred and an alternative procurement route and contract, matched to the project\'s value, programme, risks and priorities. For guidance, to be developed with a procurement professional or QS.' },
]

const STEPS = [
  { k: '1', t: 'Answer the questions', d: 'Project, scope, condition and programme: about 15 minutes, saved as you go.' },
  { k: '2', t: 'Review the report', d: 'Cost, programme, risks and procurement on screen, with the basis of every figure shown.' },
  { k: '3', t: 'Download and share', d: 'A formatted PDF or Word report for an options appraisal, a funding bid or a project board.' },
]

const h2 = { fontSize: 32, margin: '12px 0 30px', color: 'var(--ink)', fontWeight: 700 }
const cardH3 = { fontSize: 19, margin: '0 0 8px', color: 'var(--ink)', fontWeight: 700 }
const cardP = { fontSize: 14.5, lineHeight: 1.65, color: 'var(--text-soft)', margin: 0 }

export default function LandingPage() {
  // Signed in → "My reports"; otherwise "Sign in". Nothing until it loads.
  const [signedIn, setSignedIn] = useState(null)
  useEffect(() => {
    let alive = true
    fetch('/api/auth/status').then(r => r.json()).then(d => { if (alive) setSignedIn(!!d.user) }).catch(() => {})
    return () => { alive = false }
  }, [])

  return (
    <div>
      {/* ── Top bar ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 30, backdropFilter: 'blur(10px)',
        background: 'rgba(250,248,243,.78)', borderBottom: '1px solid var(--border)' }}>
        <div style={wrap(1120)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0' }}>
            <Brand />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {signedIn === true && <Link href="/reports" className="btn btn-ghost">My reports</Link>}
              {signedIn === false && <Link href="/login" className="btn btn-ghost">Sign in</Link>}
              <Link href="/questionnaire" className="btn btn-primary">{signedIn ? 'New report ▸' : 'Try it free ▸'}</Link>
            </div>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="panel-dark" style={{ position: 'relative', overflow: 'hidden' }}>
        <div className="grid-bg" style={{ position: 'absolute', inset: 0, opacity: .25 }} />
        <div className="sheen" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
        <div style={{ ...wrap(1120), position: 'relative' }}>
          <div style={{ paddingTop: 96, paddingBottom: 92, maxWidth: 780 }}>
            <div className="rise rise-1"><Badge dark>RIBA Stage 0–1 · Feasibility</Badge></div>
            <h1 className="rise rise-2" style={{ fontSize: 'clamp(38px, 6vw, 64px)', lineHeight: 1.12, margin: '22px 0 0', color: '#fff', fontWeight: 700, fontFamily: 'var(--font-body)' }}>
              Stage 0–1 feasibility,<br />in minutes not weeks.
            </h1>
            <div className="rise rise-2" style={{ width: 64, height: 3, background: 'var(--amber)', margin: '26px 0 0' }} />
            <p className="rise rise-3" style={{ fontSize: 18, lineHeight: 1.65, color: '#B7C3D8', maxWidth: 560, margin: '24px 0 0' }}>
              Answer a guided questionnaire and get a costed, programmed feasibility report for your
              capital project: NRM1 cost range, RIBA stage programme, risk register and procurement suggestion.
            </p>
            <div className="rise rise-4" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 36 }}>
              <Link href="/questionnaire" className="btn btn-accent" style={{ fontSize: 16, padding: '14px 26px' }}>{signedIn ? 'Start a new report ▸' : 'Try it free ▸'}</Link>
              {/* Explicit background and a visible border: with only a ghost
                  border over the navy hero this read as a disabled control. */}
              <Link href="/sample" className="btn" style={{ fontSize: 16, padding: '14px 26px', color: '#fff', background: 'rgba(255,255,255,.10)', border: '1.5px solid rgba(255,255,255,.55)' }}>See a sample report</Link>
            </div>
            <p className="rise rise-4 mono" style={{ marginTop: 18, fontSize: 12, color: '#7E8DA8', letterSpacing: '.08em' }}>
              {signedIn
                ? '~10–15 MIN · PROGRESS AUTO-SAVED · ON-SCREEN + .DOCX + PDF EXPORT'
                : '3 FREE REPORTS · NO SIGN-UP TO START · FREE ACCOUNT FOR PDF + .DOCX'}
            </p>
          </div>
        </div>
      </section>

      {/* ── Stat strip ── */}
      <section style={{ ...wrap(1120), marginTop: -36, position: 'relative', zIndex: 5 }}>
        <Card className="rise rise-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 28, padding: '26px 30px', borderTop: '3px solid var(--amber)' }}>
          <Stat value="NRM1" label="Cost estimate structure" />
          <Stat value="RIBA" label="Plan of Work 2020 stages" />
          <Stat value="100%" label="Figures calculated, not written" />
          <Stat value="PDF + Word" label="Report formats" />
        </Card>
      </section>

      {/* ── How it works ── (vertical padding only: a `padding` shorthand
          here would wipe wrap()'s side gutter, as it once did on phones) */}
      <section style={{ ...wrap(1120), paddingTop: 76 }}>
        <div className="eyebrow">How it works</div>
        <h2 style={h2}>Three steps to a feasibility report</h2>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(250px, 100%), 1fr))', gap: 22 }}>
          {STEPS.map(s => (
            <li key={s.k} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span aria-hidden="true" className="mono" style={{ flex: '0 0 auto', width: 34, height: 34, borderRadius: '50%', background: 'var(--navy)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 14 }}>{s.k}</span>
              <div>
                <h3 style={{ ...cardH3, fontSize: 17, margin: '6px 0 6px' }}>{s.t}</h3>
                <p style={{ ...cardP, fontSize: 14 }}>{s.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── What's included ── */}
      <section style={{ ...wrap(1120), paddingTop: 72, paddingBottom: 24 }}>
        <div className="eyebrow">What the report includes</div>
        <h2 style={h2}>Four sections, one consistent report</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(250px, 100%), 1fr))', gap: 18 }}>
          {INCLUDED.map((c, i) => (
            <Card key={c.k} lift className={`rise rise-${(i % 4) + 1}`} style={{ padding: '26px 24px' }}>
              <div className="mono" style={{ fontSize: 13, color: 'var(--amber)', fontWeight: 500 }}>{c.k}</div>
              <h3 style={{ fontSize: 19, margin: '14px 0 8px', color: 'var(--ink)', fontWeight: 700 }}>{c.t}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--text-soft)', margin: 0 }}>{c.d}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ── How AI is used ── keep this in step with what the engine does:
          figures come only from the calculators; the model writes prose and
          assertNoLeakedFigures() in lib/prose.js rejects any £ or week figure
          not in its prompt. */}
      <section style={{ ...wrap(1120), paddingTop: 56 }} aria-labelledby="ai-heading">
        <div className="eyebrow">How {BRAND.name} uses AI</div>
        <h2 id="ai-heading" style={h2}>Calculated first, then explained</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 18 }}>
          <Card style={{ padding: '26px 24px', borderTop: '3px solid var(--navy)' }}>
            <h3 style={cardH3}>The figures are calculated</h3>
            <p style={cardP}>
              Every cost, duration and date comes from {BRAND.name}&apos;s own calculation engine: NRM1 cost rates
              checked against real UK tender returns and published price books, regional cost factors, RIBA Plan
              of Work stages and a procurement reference. The same answers always give the same figures.
            </p>
          </Card>
          <Card style={{ padding: '26px 24px', borderTop: '3px solid var(--amber)' }}>
            <h3 style={cardH3}>The wording is drafted with AI assistance</h3>
            <p style={cardP}>
              AI helps write the narrative around those fixed figures: the summary, key findings and risk
              descriptions. It cannot set or change a figure. Every cost and duration in the text is checked
              against the calculation before the report is released.
            </p>
          </Card>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-mute)', margin: '14px 0 0' }}>
          Reports are indicative at RIBA Stage 0–1. Have the figures reviewed by a Chartered Quantity Surveyor before relying on them.
        </p>
      </section>

      {/* ── CTA band ── */}
      <section style={{ ...wrap(1120), paddingTop: 56, paddingBottom: 80 }}>
        <Card className="panel-dark" style={{ padding: '48px 44px', border: 'none', display: 'flex',
          flexWrap: 'wrap', gap: 24, alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 30, margin: 0, color: '#fff', fontWeight: 700 }}>Ready to scope a project?</h2>
            <p style={{ color: '#B7C3D8', margin: '10px 0 0', fontSize: 16 }}>Answer the questionnaire and download a formatted feasibility report. Your first three are free, no account needed.</p>
          </div>
          <Link href="/questionnaire" className="btn btn-accent" style={{ fontSize: 16, padding: '14px 28px' }}>{signedIn ? 'Begin assessment ▸' : 'Try it free ▸'}</Link>
        </Card>
      </section>

      <Footer />
    </div>
  )
}

function Brand() {
  return (
    <Link href="/" aria-label={`${BRAND.name} home`} style={{ display: 'flex', alignItems: 'center' }}>
      <Logo variant="navy" height={26} compactBelow360 />
    </Link>
  )
}

function Footer() {
  return (
    <footer style={{ borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,.5)' }}>
      <div style={{ ...wrap(1120), padding: '26px 0', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <span className="mono" style={{ fontSize: 12, color: 'var(--text-mute)' }}>{BRAND.name.toUpperCase()} · {BRAND.tagline.toUpperCase()}</span>
        <span style={{ fontSize: 12, color: 'var(--text-mute)', maxWidth: 620, textAlign: 'right' }}>
          Every figure is calculated from NRM1 benchmark data and traceable to its source; AI assists with the written narrative only.
          Indicative at Stage 0–1; always verify with a Chartered Quantity Surveyor.
        </span>
      </div>
      <div style={{ ...wrap(1120), paddingBottom: 26 }}>
        <SiteNotice />
      </div>
    </footer>
  )
}

function wrap(max) { return { maxWidth: max, margin: '0 auto', padding: '0 24px' } }
