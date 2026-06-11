'use client'

/**
 * /admin — private status dashboard + reports browser.
 *
 * Self-gating: the page shell is public, but every piece of data comes from
 * /api/admin/overview which is gated against ADMIN_CODE (see proxy.ts). On a 401
 * the page shows an inline admin-code form (POST /api/admin/login) and refetches.
 * Workbook health comes from the open /api/rates-check endpoint.
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, Stat, Badge, SectionHeader } from '../components/ui'

const f1k = n => (n == null ? '—' : `£${(Math.round(n / 1000) * 1000).toLocaleString('en-GB')}`)

const CONFIG_LABELS = {
  aiKey:        'AI API key',
  ratesUrl:     'NRM1 rates URL',
  programmeUrl: 'Programme URL',
  kv:           'KV persistence',
  accessCode:   'Access code',
  cookieSecret: 'Cookie secret',
  adminCode:    'Admin code',
  sentryDsn:    'Sentry (error capture)',
}

export default function AdminPage() {
  const [data, setData]       = useState(null)   // overview payload
  const [health, setHealth]   = useState(null)   // rates-check payload
  const [phase, setPhase]     = useState('loading') // loading | locked | ready | error
  const [errMsg, setErrMsg]   = useState('')

  const load = useCallback(async () => {
    setPhase('loading')
    setErrMsg('')
    try {
      const [ovRes, hcRes] = await Promise.all([
        fetch('/api/admin/overview'),
        fetch('/api/rates-check').catch(() => null),
      ])

      if (ovRes.status === 401) { setPhase('locked'); return }
      if (!ovRes.ok) { setErrMsg(`Overview failed (${ovRes.status}).`); setPhase('error'); return }

      setData(await ovRes.json())
      if (hcRes) { try { setHealth(await hcRes.json()) } catch { /* ignore */ } }
      setPhase('ready')
    } catch {
      setErrMsg('Network error loading the dashboard.')
      setPhase('error')
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div className="grid-bg" style={{ position: 'fixed', inset: 0, opacity: .35, pointerEvents: 'none' }} />
      <Header />
      <main style={{ maxWidth: 1040, margin: '0 auto', padding: '28px 24px 64px', position: 'relative' }}>
        {phase === 'loading' && <Centered><Spinner /></Centered>}
        {phase === 'locked'  && <AdminLogin onSuccess={load} />}
        {phase === 'error'   && (
          <Centered>
            <Card style={{ padding: 28, maxWidth: 440, textAlign: 'center' }}>
              <p style={{ color: 'var(--danger)', margin: '0 0 16px', fontSize: 14 }}>{errMsg}</p>
              <button className="btn btn-primary" onClick={load}>Retry</button>
            </Card>
          </Centered>
        )}
        {phase === 'ready' && data && (
          <Dashboard data={data} health={health} onRefresh={load} />
        )}
      </main>
    </div>
  )
}

// ─── Header ─────────────────────────────────────────────────────────────────
function Header() {
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(250,248,243,.82)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 7, display: 'grid', placeItems: 'center',
          background: 'linear-gradient(150deg, var(--navy), var(--ink-deep))', color: '#fff', fontWeight: 700,
          fontFamily: 'var(--font-mono)', fontSize: 13 }}>AI</div>
        <span className="display" style={{ fontWeight: 700, fontSize: 17, color: 'var(--ink)' }}>Estates AI</span>
        <Badge>Admin</Badge>
      </div>
    </header>
  )
}

// ─── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard({ data, health, onRefresh }) {
  const { config, counts, reports, feedback } = data
  return (
    <div className="rise rise-1">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div>
          <div className="eyebrow">Operations</div>
          <h1 style={{ fontSize: 28, margin: '6px 0 0', color: 'var(--ink)' }}>Dashboard</h1>
        </div>
        <button className="btn btn-ghost" onClick={onRefresh}>↻ Refresh</button>
      </div>

      {/* Usage counts */}
      <SectionHeader number="1" title="Usage" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 32 }}>
        <Card style={{ padding: '18px 20px' }}><Stat value={counts.reports}       label="Reports generated" /></Card>
        <Card style={{ padding: '18px 20px' }}><Stat value={counts.reportsLast7d} label="Last 7 days" /></Card>
        <Card style={{ padding: '18px 20px' }}><Stat value={counts.feedback}      label="Feedback flagged" /></Card>
      </div>

      {/* System health */}
      <SectionHeader number="2" title="System health" />
      <HealthPanel config={config} health={health} />

      {/* Reports browser */}
      <SectionHeader number="3" title="Reports" />
      <ReportsTable reports={reports} kvOn={config.kv} />

      {/* Feedback */}
      <SectionHeader number="4" title="Recent feedback" />
      <FeedbackList feedback={feedback} />
    </div>
  )
}

// ─── System health ──────────────────────────────────────────────────────────
function HealthPanel({ config, health }) {
  const workbookRows = [
    { label: 'NRM1 rates workbook', ok: health?.ratesOk, detail: health?.ratesOk ? `${health.elementCount} elements` : (health?.errors?.[0] || 'not loaded') },
    { label: 'Programme workbook',  ok: health?.programmeOk, detail: health?.programmeOk ? `DS2·S3 sample ${health.sampleDuration_DS2_S3_mid}w` : 'not loaded' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 32 }}>
      <Card style={{ padding: '18px 20px' }}>
        <div className="stat-label" style={{ marginBottom: 12 }}>Data workbooks</div>
        {health
          ? workbookRows.map(r => <StatusRow key={r.label} label={r.label} ok={r.ok} detail={r.detail} />)
          : <p style={{ color: 'var(--text-mute)', fontSize: 13, margin: 0 }}>Health check unavailable.</p>}
      </Card>
      <Card style={{ padding: '18px 20px' }}>
        <div className="stat-label" style={{ marginBottom: 12 }}>Configuration</div>
        {Object.entries(CONFIG_LABELS).map(([k, label]) => (
          <StatusRow key={k} label={label} ok={config[k]} detail={config[k] ? 'set' : 'unset'} />
        ))}
      </Card>
    </div>
  )
}

function StatusRow({ label, ok, detail }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13.5, color: 'var(--text)' }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-mute)' }}>{detail}</span>
        <span className={`rag ${ok ? 'rag-low' : 'rag-high'}`}>{ok ? 'OK' : 'OFF'}</span>
      </span>
    </div>
  )
}

// ─── Reports table ──────────────────────────────────────────────────────────
function ReportsTable({ reports, kvOn }) {
  if (!reports?.length) {
    return (
      <Card style={{ padding: 24, marginBottom: 32 }}>
        <p style={{ color: 'var(--text-mute)', fontSize: 14, margin: 0 }}>
          {kvOn
            ? 'No reports generated yet. They will appear here as colleagues use the tool.'
            : 'Persistence (KV) is not configured, so reports are not indexed. Set KV_REST_API_URL / KV_REST_API_TOKEN to enable the reports browser.'}
        </p>
      </Card>
    )
  }
  return (
    <div className="tbl-wrap" style={{ marginBottom: 32 }}>
      <table className="tbl">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Project</th>
            <th style={{ textAlign: 'left' }}>Generated</th>
            <th style={{ textAlign: 'right' }}>Cost range (excl. VAT)</th>
            <th style={{ textAlign: 'right' }}>Weeks</th>
            <th style={{ textAlign: 'right' }}>Report</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r, i) => (
            <tr key={r.reportId || i}>
              <td style={{ fontWeight: 600 }}>{r.projectName || 'Untitled'}</td>
              <td style={{ whiteSpace: 'nowrap', color: 'var(--text-mid)' }}>{fmtDate(r.generatedAt)}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{f1k(r.totalLow)} – {f1k(r.totalHigh)}</td>
              <td style={{ textAlign: 'right' }}>{r.totalWeeks ?? '—'}</td>
              <td style={{ textAlign: 'right' }}>
                {r.reportId
                  ? <a className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }} href={`/report/${r.reportId}`} target="_blank" rel="noopener noreferrer">View ↗</a>
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Feedback list ──────────────────────────────────────────────────────────
function FeedbackList({ feedback }) {
  if (!feedback?.length) {
    return (
      <Card style={{ padding: 24 }}>
        <p style={{ color: 'var(--text-mute)', fontSize: 14, margin: 0 }}>No issues flagged yet.</p>
      </Card>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {feedback.map((fb, i) => (
        <Card key={i} style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <Badge>{fb.category || 'Other'}</Badge>
            <span style={{ fontSize: 12, color: 'var(--text-mute)' }}>{fmtDate(fb.submittedAt)}</span>
            {fb.reportId && (
              <a href={`/report/${fb.reportId}`} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: 'var(--navy)', fontFamily: 'var(--font-mono)' }}>
                {fb.projectName ? `${fb.projectName} · ` : ''}{String(fb.reportId).slice(0, 8)} ↗
              </a>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{fb.message}</p>
        </Card>
      ))}
    </div>
  )
}

// ─── Admin login (inline, shown on 401) ─────────────────────────────────────
function AdminLogin({ onSuccess }) {
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
          Enter the admin code to view system status and all generated reports.
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

// ─── Small helpers ──────────────────────────────────────────────────────────
function Centered({ children }) {
  return <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>{children}</div>
}

function Spinner() {
  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ width: 34, height: 34, border: '4px solid var(--navy)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
    </>
  )
}

function fmtDate(iso) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return '—'
  return new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
