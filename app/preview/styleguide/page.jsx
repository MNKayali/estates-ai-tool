'use client'

/* Whole-site design showcase — every UI surface in the Modern/Technical style.
   Lets the new look be judged without forking the live questionnaire/report. */
import { useState } from 'react'
import Link from 'next/link'
import {
  Badge, Button, Card, Stat, SectionHeader, Field, Input, Textarea, Select,
  ControlGroup, ProgressBar, Rag,
} from '../ui'

const SWATCHES = [
  ['Ink navy', '#1A2E4A'], ['Deep navy', '#12233A'], ['Abyss', '#0E1B2E'],
  ['Electric', '#2F6BFF'], ['Blue soft', '#2E75B6'], ['Tint', '#F5F8FC'],
  ['Success', '#1E9E6A'], ['Warning', '#C9821A'], ['Danger', '#C0392B'],
]

const COST_ROWS = [
  ['1', 'Substructure', 'm²', '£186,000'],
  ['2', 'Superstructure', 'm²', '£540,000'],
  ['3', 'Internal finishes', 'm²', '£198,000'],
  ['5', 'Services (M&E)', 'm²', '£612,000'],
  ['5.20', 'Builder’s work in connection', 'Item', '£61,000'],
]

const RISKS = [
  ['R01', 'Planning', 'Listed-building consent may extend the pre-construction programme.', 'High', 'Engage conservation officer at pre-application stage.'],
  ['R02', 'Ground', 'Unknown ground conditions beneath the 1960s slab.', 'Medium', 'Commission intrusive site investigation in Stage 2.'],
  ['R03', 'Cost', 'M&E market volatility on switchgear lead times.', 'Medium', 'Carry inflation allowance; early contractor involvement.'],
  ['R04', 'Access', 'Live campus — phased possession required.', 'Low', 'Agree decant and phasing plan with faculty.'],
]

const GANTT = [
  ['Surveys', 14, '#2E75B6'],
  ['Design 2–4', 30, '#2F6BFF'],
  ['Planning', 18, '#C9821A'],
  ['Procurement', 8, '#5B6B86'],
  ['Construction', 34, '#1A2E4A'],
]

export default function StyleGuide() {
  const [text, setText] = useState('')
  const [radio, setRadio] = useState('Finishes with minor services')
  const [checks, setChecks] = useState(['Emergency lighting'])
  const total = GANTT.reduce((s, g) => s + g[1], 0)

  return (
    <div>
      <TopNav />
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 24px 96px' }}>
        <Badge>Design system</Badge>
        <h1 style={{ fontSize: 'clamp(30px,5vw,46px)', margin: '14px 0 6px', color: 'var(--ink)' }}>
          Modern / Technical — style guide
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-soft)', maxWidth: 620, margin: '0 0 8px' }}>
          Every surface the live site uses, rendered in the new direction. Live pages are untouched.
        </p>

        {/* Typography */}
        <Block n="A" title="Typography">
          <Card style={{ padding: 28 }}>
            <div className="eyebrow">Eyebrow · mono caps</div>
            <h1 style={{ fontSize: 48, margin: '6px 0', color: 'var(--ink)' }}>Display H1 — Space Grotesk</h1>
            <h2 style={{ fontSize: 30, margin: '6px 0', color: 'var(--ink)' }}>Section H2 — Space Grotesk</h2>
            <h3 style={{ fontSize: 20, margin: '6px 0', color: 'var(--ink)' }}>Subhead H3</h3>
            <p style={{ fontSize: 16, lineHeight: 1.7, color: 'var(--text-soft)', maxWidth: 640, margin: '10px 0 0' }}>
              Body copy is set in Geist — a clean neutral grotesque chosen for long-form readability.
              Figures and references use a monospaced face: <span className="mono">£1,597,000 · S4 · BCIS 1.04</span>.
            </p>
          </Card>
        </Block>

        {/* Colour */}
        <Block n="B" title="Colour tokens">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 12 }}>
            {SWATCHES.map(([name, hex]) => (
              <Card key={hex} style={{ overflow: 'hidden' }}>
                <div style={{ height: 64, background: hex }} />
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{name}</div>
                  <div className="mono" style={{ fontSize: 12, color: 'var(--text-mute)' }}>{hex}</div>
                </div>
              </Card>
            ))}
          </div>
        </Block>

        {/* Buttons & badges */}
        <Block n="C" title="Buttons · badges · stats">
          <Card style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Button>Primary action ▸</Button>
              <Button variant="ghost">Secondary</Button>
              <Button variant="primary" disabled style={{ opacity: .55 }}>Disabled</Button>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Badge>RIBA Stage 1</Badge><Badge>NRM1</Badge><Rag level="High" /><Rag level="Medium" /><Rag level="Low" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 20 }}>
              <Stat value="£1.60m" label="Cost mid-point" /><Stat value="104 wks" label="Programme" />
              <Stat value="Grade B" label="Confidence" /><Stat value="1.04" label="BCIS factor" />
            </div>
          </Card>
        </Block>

        {/* Form primitives */}
        <Block n="D" title="Form controls">
          <Card style={{ padding: 28, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 22 }}>
            <Field label="Project name" help="As it should appear on the report cover.">
              <Input placeholder="e.g. Library refurbishment, Block C" />
            </Field>
            <Field label="GIFA (m²)" help="Primary pricing quantity.">
              <Input type="number" placeholder="500" />
            </Field>
            <Field label="Building use">
              <Select defaultValue="">
                <option value="" disabled>Select building use…</option>
                <option>Student accommodation (PBSA / halls)</option>
                <option>Commercial offices</option>
                <option>Education</option>
              </Select>
            </Field>
            <Field label="Objective" help="What you are trying to achieve.">
              <Textarea rows={3} value={text} onChange={e => setText(e.target.value)} placeholder="Describe the project objective…" />
            </Field>
            <Field label="Level of intervention">
              <ControlGroup name="lvl" value={radio} onChange={setRadio}
                options={['Fabric and finishes only', 'Finishes with minor services', 'Full systems replacement']} />
            </Field>
            <Field label="Scope items">
              <ControlGroup type="checkbox" values={checks}
                onChange={o => setChecks(c => c.includes(o) ? c.filter(x => x !== o) : [...c, o])}
                options={['Emergency lighting', 'IT / data cabling', 'Access control']} />
            </Field>
          </Card>
        </Block>

        {/* Progress */}
        <Block n="E" title="Questionnaire progress">
          <Card style={{ padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span className="mono" style={{ fontSize: 12, color: 'var(--text-mute)' }}>SECTION 4 OF 6</span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--blue)' }}>67%</span>
            </div>
            <ProgressBar value={67} />
          </Card>
        </Block>

        {/* Report cover */}
        <Block n="F" title="Report cover">
          <Card className="panel-dark" style={{ padding: '40px 38px', border: 'none', overflow: 'hidden', position: 'relative' }}>
            <div className="grid-bg" style={{ position: 'absolute', inset: 0, opacity: .2 }} />
            <div style={{ position: 'relative' }}>
              <Badge dark>RIBA Stage 0–1 Feasibility Report</Badge>
              <h2 style={{ fontSize: 38, color: '#fff', margin: '18px 0 14px', lineHeight: 1.1 }}>Library Refurbishment — Block C</h2>
              <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', color: '#AFC2DE', fontSize: 14 }}>
                <span><b style={{ color: '#fff' }}>£1.42m – £1.78m</b> excl. VAT</span>
                <span>Programme <b style={{ color: '#fff' }}>104 weeks</b></span>
                <span>Confidence <b style={{ color: '#fff' }}>Grade B</b></span>
              </div>
            </div>
          </Card>
        </Block>

        {/* Cost table */}
        <Block n="G" title="Cost estimate (NRM1)">
          <Card style={{ overflow: 'hidden' }}>
            <div className="tbl-wrap"><table className="tbl" style={{ minWidth: 460 }}>
              <thead><tr><th>Code</th><th>Element</th><th>Unit</th><th style={{ textAlign: 'right' }}>Mid</th></tr></thead>
              <tbody>
                {COST_ROWS.map(r => (
                  <tr key={r[0]}>
                    <td className="mono" style={{ color: 'var(--blue)', fontWeight: 700 }}>{r[0]}</td>
                    <td>{r[1]}</td><td>{r[2]}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{r[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </Card>
        </Block>

        {/* Risk register */}
        <Block n="H" title="Risk register">
          <Card style={{ overflow: 'hidden' }}>
            <div className="tbl-wrap"><table className="tbl" style={{ minWidth: 640 }}>
              <thead><tr><th>Ref</th><th>Category</th><th>Description</th><th>Rating</th><th>Mitigation</th></tr></thead>
              <tbody>
                {RISKS.map(r => (
                  <tr key={r[0]}>
                    <td className="mono" style={{ color: 'var(--ink)', fontWeight: 700 }}>{r[0]}</td>
                    <td>{r[1]}</td><td>{r[2]}</td><td><Rag level={r[3]} /></td><td>{r[4]}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </Card>
        </Block>

        {/* Gantt */}
        <Block n="I" title="Programme overview">
          <Card style={{ padding: 28 }}>
            <div style={{ display: 'flex', height: 28, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
              {GANTT.map(([label, wks, color]) => (
                <div key={label} title={`${label} — ${wks}w`} style={{ width: `${(wks / total) * 100}%`, background: color,
                  display: 'grid', placeItems: 'center', borderRight: '1px solid rgba(255,255,255,.25)' }}>
                  {(wks / total) > 0.12 && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{wks}w</span>}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14 }}>
              {GANTT.map(([label, , color]) => (
                <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--text-soft)' }}>
                  <span style={{ width: 11, height: 11, borderRadius: 3, background: color }} /> {label}
                </span>
              ))}
            </div>
          </Card>
        </Block>
      </div>
    </div>
  )
}

function Block({ n, title, children }) {
  return (
    <section className="rise rise-1" style={{ marginTop: 44 }}>
      <SectionHeader number={n} title={title} />
      {children}
    </section>
  )
}

function TopNav() {
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 30, backdropFilter: 'blur(10px)',
      background: 'rgba(245,248,252,.72)', borderBottom: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href="/preview" className="display" style={{ fontWeight: 700, color: 'var(--ink)', textDecoration: 'none' }}>← Estates AI preview</Link>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/preview" className="btn btn-ghost hide-sm">Landing</Link>
          <Link href="/preview/access" className="btn btn-ghost">Access</Link>
        </div>
      </div>
    </header>
  )
}
