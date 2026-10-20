'use client'

/**
 * /admin — private status dashboard. Every report is on /admin/reports.
 *
 * Self-gating: the page shell is public, but every piece of data comes from
 * /api/admin/overview which is gated against ADMIN_CODE (see proxy.ts). On a 401
 * the page shows an inline admin-code form (POST /api/admin/login) and refetches.
 * Workbook health comes from /api/rates-check. The users list arrives with the
 * overview; after a change (invite, disable, set-password link) the Users panel
 * reloads it from /api/admin/users.
 */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card, Stat, Badge, SectionHeader } from '../components/ui'
import { Header, AdminLogin, Centered, Spinner, fmtDate } from './shared'

const CONFIG_LABELS = {
  aiKey:        'AI API key',
  ratesUrl:     'NRM1 rates URL',
  programmeUrl: 'Programme URL',
  procurementUrl: 'Procurement URL',
  kv:           'KV persistence',
  email:        'Account emails (Resend)',
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

// ─── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard({ data, health, onRefresh }) {
  const { config, counts, feedback, usage, visits, users, emailEnabled } = data
  return (
    <div className="rise rise-1">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div>
          <div className="eyebrow">Operations</div>
          <h1 style={{ fontSize: 28, margin: '6px 0 0', color: 'var(--ink)' }}>Dashboard</h1>
        </div>
        <button className="btn btn-ghost" onClick={onRefresh}>↻ Refresh</button>
      </div>

      {/* Visitors */}
      <SectionHeader number="1" title="Visitors — last 30 days" />
      <ExportBar />
      <VisitsPanel visits={visits} />

      {/* Usage counts */}
      <SectionHeader number="2" title="Reports and accounts" />
      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '-4px 0 12px' }}>
        <Link href="/admin/reports" className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: 13 }}>View all reports →</Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))', gap: 14, marginBottom: 32 }}>
        <Card style={{ padding: '18px 20px' }}><Stat value={counts.reports}       label="Reports completed" /></Card>
        <Card style={{ padding: '18px 20px' }}><Stat value={counts.reportsLast7d} label="Last 7 days" /></Card>
        <Card style={{ padding: '18px 20px' }}><Stat value={counts.users ?? '—'}  label="Accounts" /></Card>
        <Card style={{ padding: '18px 20px' }}><Stat value={counts.feedback}      label="Feedback flagged" /></Card>
      </div>
      {usage && <UsagePanel usage={usage} />}

      {/* System health */}
      <SectionHeader number="3" title="System health" />
      <HealthPanel config={config} health={health} />

      {/* Users */}
      <SectionHeader number="4" title="Users" />
      <UsersPanel initialUsers={users} initialEmailOn={emailEnabled} />

      {/* Feedback */}
      <SectionHeader number="5" title="Recent feedback" />
      <FeedbackList feedback={feedback} total={counts.feedback} />
    </div>
  )
}

// ─── System health ──────────────────────────────────────────────────────────
function HealthPanel({ config, health }) {
  // Version first, so the admin can see which issue of each workbook is live.
  const withVersion = (version, detail) => [version, detail].filter(Boolean).join(' · ')
  const rejected = health?.workbook?.rejectedUpdate
  const workbookRows = [
    { label: 'NRM1 rates workbook', ok: health?.ratesOk && !rejected, detail: health?.ratesOk ? withVersion(health.workbook?.version, `${health.itemCount} scope items`) + (rejected ? ' · newer upload rejected' : '') : (health?.errors?.[0] || 'not loaded') },
    { label: 'Programme workbook',  ok: health?.programmeOk, detail: health?.programmeOk ? withVersion(health.programmeVersion, `DS2·S3 sample ${health.sampleDuration_DS2_S3_mid}w`) : 'not loaded' },
    { label: 'Procurement workbook', ok: health?.procurementOk, detail: health?.procurementOk ? withVersion(health.procurement.version, `${health.procurement.options} options · ${health.procurement.contractRows} contracts`) : (health?.errors?.find(e => e.startsWith('Procurement')) || 'not loaded') },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 14, marginBottom: 32 }}>
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
        <span style={{ fontSize: 12, color: 'var(--text-mute)', textAlign: 'right' }}>{detail}</span>
        <span className={`rag ${ok ? 'rag-low' : 'rag-high'}`}>{ok ? 'OK' : 'OFF'}</span>
      </span>
    </div>
  )
}

// ─── Usage over time ─────────────────────────────────────────────────────────
// Sign-ups per week, reports per week (account holders vs free-trial visitors)
// and the free trial's conversion: visitors refused at the limit, and how many
// of them then created an account. Weekly report counts start when this
// release went live; earlier weeks show 0.
function UsagePanel({ usage }) {
  const { weeks = [], trial = { limitHit: 0, converted: 0 } } = usage
  const rate = trial.limitHit ? Math.round((trial.converted / trial.limitHit) * 100) : null
  const recent = [...weeks].reverse()
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))', gap: 14, marginBottom: 14 }}>
        <Card style={{ padding: '18px 20px' }}><Stat value={trial.limitHit} label="Trial visitors who hit the limit" /></Card>
        <Card style={{ padding: '18px 20px' }}><Stat value={trial.converted} label="…who then signed up" /></Card>
        <Card style={{ padding: '18px 20px' }}><Stat value={rate == null ? '—' : `${rate}%`} label="Trial conversion" /></Card>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <caption className="sr-only">Sign-ups and reports per week, most recent first</caption>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Week</th>
              <th style={{ textAlign: 'right' }}>Sign-ups</th>
              <th style={{ textAlign: 'right' }}>Reports (accounts)</th>
              <th style={{ textAlign: 'right' }}>Reports (free trial)</th>
            </tr>
          </thead>
          <tbody>
            {recent.map(w => (
              <tr key={w.week}>
                <td className="mono" style={{ fontSize: 12.5 }}>{w.week}</td>
                <td style={{ textAlign: 'right' }}>{w.signups}</td>
                <td style={{ textAlign: 'right' }}>{w.userReports}</td>
                <td style={{ textAlign: 'right' }}>{w.trialReports}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Visitors ────────────────────────────────────────────────────────────────
// The site's own cookieless counts (lib/visits.js): unique visitors per day,
// visits (arrivals from outside the site), time on screen, where visits came
// from and which sources turned into sign-ups. Counting started with this
// release; earlier days show 0.
function fmtDuration(s) {
  if (s == null) return '—'
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '—')

function VisitsPanel({ visits }) {
  if (!visits) {
    return (
      <Card style={{ padding: 20, marginBottom: 32 }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-mid)' }}>Visitor figures need KV and appear once the first visits are counted.</p>
      </Card>
    )
  }
  const t = visits.totals
  const t7 = visits.totals7
  const funnel = [
    ['Visitors', t.visitors],
    ['Opened the questionnaire', t.questionnaireVisitors],
    ['Reports created', t.reports],
    ['Sign-ups', t.signups],
  ]
  const recent = [...visits.daily].reverse().slice(0, 14)
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 14, marginBottom: 14 }}>
        <Card style={{ padding: '18px 20px' }}><Stat value={t.visitors} label={`Visitors (${t7.visitors} in 7 days)`} /></Card>
        <Card style={{ padding: '18px 20px' }}><Stat value={t.visits} label={`Visits (${t7.visits} in 7 days)`} /></Card>
        <Card style={{ padding: '18px 20px' }}><Stat value={fmtDuration(t.avgVisitSeconds)} label="Average time per visit" /></Card>
        <Card style={{ padding: '18px 20px' }}><Stat value={t.pagesPerVisit ?? '—'} label="Pages per visit" /></Card>
        <Card style={{ padding: '18px 20px' }}><Stat value={t.signupRate == null ? '—' : `${t.signupRate}%`} label="Visitors who signed up" /></Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 14, marginBottom: 14 }}>
        <Card style={{ padding: 0 }}>
          <MiniTable caption="Where visits came from" head={['Source', 'Visits', 'Sign-ups']}
            rows={visits.sources.map(r => [r.name, r.count, r.signups])} empty="No visits counted yet." />
        </Card>
        <Card style={{ padding: 0 }}>
          <MiniTable caption="Journey (30 days)" head={['Step', 'People', 'Of visitors']}
            rows={funnel.map(([label, n]) => [label, n, pct(n, t.visitors)])} />
        </Card>
        <Card style={{ padding: 0 }}>
          <MiniTable caption="Most viewed pages" head={['Page', 'Views']}
            rows={visits.pages.map(r => [<span key="p" className="mono" style={{ fontSize: 12.5 }}>{r.name}</span>, r.count])} empty="No page views yet." />
        </Card>
        <Card style={{ padding: 0 }}>
          <MiniTable caption="Countries and devices" head={['Country / device', 'Visits']}
            rows={[...visits.countries.map(r => [r.name, r.count]), ...visits.devices.map(r => [r.name, r.count])]} empty="No visits counted yet." />
        </Card>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <caption className="sr-only">Visitors per day, most recent first</caption>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Day</th>
              <th style={{ textAlign: 'right' }}>Visitors</th>
              <th style={{ textAlign: 'right' }}>Visits</th>
              <th style={{ textAlign: 'right' }}>Page views</th>
              <th style={{ textAlign: 'right' }}>Reports</th>
              <th style={{ textAlign: 'right' }}>Sign-ups</th>
            </tr>
          </thead>
          <tbody>
            {recent.map(d => (
              <tr key={d.date}>
                <td className="mono" style={{ fontSize: 12.5 }}>{d.date}</td>
                <td style={{ textAlign: 'right' }}>{d.visitors}</td>
                <td style={{ textAlign: 'right' }}>{d.visits}</td>
                <td style={{ textAlign: 'right' }}>{d.views}</td>
                <td style={{ textAlign: 'right' }}>{d.reports}</td>
                <td style={{ textAlign: 'right' }}>{d.signups}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Downloads the usage data to keep, or to hand to an AI for ideas: the JSON
// explains every figure and is anonymised (/api/admin/export).
function ExportBar() {
  const [days, setDays] = useState(90)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, margin: '-4px 0 16px' }}>
      <label htmlFor="export-days" style={{ fontSize: 13, color: 'var(--text-mid)' }}>Export</label>
      <select id="export-days" value={days} onChange={e => setDays(Number(e.target.value))}
        style={{ padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--tint)' }}>
        <option value={30}>Last 30 days</option>
        <option value={90}>Last 90 days</option>
        <option value={365}>Last 12 months</option>
      </select>
      <a className="btn btn-primary" style={{ padding: '6px 14px', fontSize: 13 }} href={`/api/admin/export?days=${days}`} download>
        Download for AI (JSON)
      </a>
      <a className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: 13 }} href={`/api/admin/export?days=${days}&format=csv`} download>
        Daily figures (CSV)
      </a>
    </div>
  )
}

function MiniTable({ caption, head, rows, empty }) {
  return (
    <table className="tbl" style={{ margin: 0 }}>
      <caption style={{ textAlign: 'left', padding: '12px 14px 4px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{caption}</caption>
      <thead>
        <tr>{head.map((h, i) => <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.length === 0 && empty && (
          <tr><td colSpan={head.length} style={{ color: 'var(--text-mid)', fontSize: 13 }}>{empty}</td></tr>
        )}
        {rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j} style={{ textAlign: j === 0 ? 'left' : 'right', fontSize: 13 }}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── Users ───────────────────────────────────────────────────────────────────
async function fetchUsers() {
  try {
    const res = await fetch('/api/admin/users')
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) }
  } catch {
    return { ok: false, status: 0, data: { error: 'Network error loading users.' } }
  }
}

const STATUS_LABEL = { active: 'Active', invited: 'Invited', disabled: 'Disabled' }

function UsersPanel({ initialUsers, initialEmailOn }) {
  const [users, setUsers]   = useState(initialUsers ?? null)
  const [emailOn, setEmailOn] = useState(!!initialEmailOn)
  const [name, setName]     = useState('')
  const [email, setEmail]   = useState('')
  const [busy, setBusy]     = useState('')
  const [error, setError]   = useState('')
  const [link, setLink]     = useState(null) // { email, url, emailed, kind }
  const [copied, setCopied] = useState(false)

  const apply = useCallback(({ ok, status, data }) => {
    if (!ok) { setError(data.error || `Users could not be loaded (${status || 'network error'}).`); setUsers([]); return }
    setUsers(data.users || [])
    setEmailOn(!!data.emailEnabled)
  }, [])
  const load = useCallback(() => fetchUsers().then(apply), [apply])

  async function invite(e) {
    e.preventDefault()
    setBusy('invite'); setError(''); setLink(null); setCopied(false)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'The invitation could not be created.'); return }
      setLink({ email: data.user.email, url: data.link, emailed: data.emailed, kind: 'invite' })
      setName(''); setEmail('')
      await load()
    } catch {
      setError('Network error. No invitation was created.')
    } finally {
      setBusy('')
    }
  }

  async function act(u, action) {
    if (action === 'disable' && !window.confirm(`Disable ${u.email}? They will be signed out and cannot sign in until you enable the account again. Their reports are kept.`)) return
    if (action === 'delete' && !window.confirm(`Delete ${u.email}? The account, all ${u.reportCount ?? 0} of their reports and every signed-in session are removed at once. This cannot be undone.`)) return
    let extra = {}
    if (action === 'tier') {
      const tier = window.prompt(`Tier for ${u.email} (one word, e.g. free). Nothing reads the tier yet.`, u.tier || 'free')
      if (tier == null) return
      extra = { tier }
    }
    setBusy(u.uid + action); setError(''); setLink(null); setCopied(false)
    try {
      const res = await fetch(`/api/admin/users/${u.uid}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'The change could not be saved.'); return }
      if (action === 'link') setLink({ email: u.email, url: data.link, emailed: data.emailed, kind: data.kind })
      await load()
    } catch {
      setError('Network error. Nothing was changed.')
    } finally {
      setBusy('')
    }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(link.url); setCopied(true) } catch { /* the link is selectable below */ }
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <Card style={{ padding: '18px 20px', marginBottom: 14 }}>
        <div className="stat-label" style={{ marginBottom: 12 }}>Invite someone</div>
        <form onSubmit={invite} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 10, alignItems: 'end' }}>
          <div>
            <label className="label" htmlFor="inv-name">Name</label>
            <input id="inv-name" className="field" value={name} onChange={e => setName(e.target.value)} autoComplete="off" />
          </div>
          <div>
            <label className="label" htmlFor="inv-email">Email</label>
            <input id="inv-email" className="field" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy === 'invite' || !name.trim() || !email.trim()}>
            {busy === 'invite' ? 'Creating…' : 'Send invitation'}
          </button>
        </form>
        <p className="help" style={{ marginTop: 10 }}>
          {emailOn
            ? 'The person is emailed a link to set their password (valid 7 days). The link is also shown here.'
            : 'Account emails are not set up (RESEND_API_KEY / EMAIL_FROM), so copy the link shown after inviting and send it to the person yourself. It is valid for 7 days and works once.'}
        </p>
        {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 13, margin: '10px 0 0' }}>{error}</p>}
        {link && (
          <div role="status" style={{ marginTop: 14, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--tint)' }}>
            <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 8 }}>
              {link.kind === 'reset' ? 'Password reset link' : 'Set-up link'} for <strong>{link.email}</strong>
              {link.emailed ? ' — emailed to them.' : ' — not emailed; send it to them yourself.'}
              {link.kind === 'reset' ? ' Valid for 1 hour.' : ' Valid for 7 days.'}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <code style={{ fontSize: 12, wordBreak: 'break-all', flex: '1 1 260px', userSelect: 'all' }}>{link.url}</code>
              <button type="button" className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }} onClick={copy}>
                {copied ? '✓ Copied' : 'Copy link'}
              </button>
            </div>
          </div>
        )}
      </Card>

      {users === null ? (
        <p role="status" style={{ color: 'var(--text-mute)', fontSize: 14 }}>Loading users…</p>
      ) : !users.length ? (
        <Card style={{ padding: 24 }}>
          <p style={{ color: 'var(--text-mute)', fontSize: 14, margin: 0 }}>No accounts yet. Anyone can sign up at /signup; you can also invite someone above.</p>
        </Card>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Name</th>
                <th style={{ textAlign: 'left' }}>Email</th>
                <th style={{ textAlign: 'left' }}>Status</th>
                <th style={{ textAlign: 'left' }}>Tier</th>
                <th style={{ textAlign: 'left' }}>Came from</th>
                <th style={{ textAlign: 'right' }}>Reports</th>
                <th style={{ textAlign: 'left' }}>Joined</th>
                <th style={{ textAlign: 'left' }}>Last active</th>
                <th style={{ textAlign: 'right' }}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.uid}>
                  <td style={{ fontWeight: 600 }}>{u.name || '—'}</td>
                  <td style={{ fontSize: 13 }}>{u.email}</td>
                  <td><span className={`rag ${u.status === 'active' ? 'rag-low' : u.status === 'invited' ? 'rag-med' : 'rag-high'}`}>{STATUS_LABEL[u.status] || u.status}</span></td>
                  <td style={{ fontSize: 13 }}>{u.tier || 'free'}</td>
                  <td style={{ fontSize: 13 }}>{u.source || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{u.reportCount ?? '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--text-mid)', fontSize: 13 }}>{fmtDate(u.createdAt)}</td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--text-mid)', fontSize: 13 }}>{u.lastActiveAt ? fmtDate(u.lastActiveAt) : '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {u.status !== 'disabled' && (
                      <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }} disabled={!!busy} onClick={() => act(u, 'link')}>
                        {u.status === 'invited' ? 'New set-up link' : 'Reset link'}
                      </button>
                    )}{' '}
                    <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12, color: u.status === 'disabled' ? undefined : 'var(--danger)' }}
                      disabled={!!busy} onClick={() => act(u, u.status === 'disabled' ? 'enable' : 'disable')}>
                      {u.status === 'disabled' ? 'Enable' : 'Disable'}
                    </button>{' '}
                    <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }} disabled={!!busy} onClick={() => act(u, 'tier')}
                      aria-label={`Change tier for ${u.email}`}>
                      Tier
                    </button>{' '}
                    <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12, color: 'var(--danger)' }} disabled={!!busy} onClick={() => act(u, 'delete')}
                      aria-label={`Delete ${u.email}`}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Feedback list ──────────────────────────────────────────────────────────
function FeedbackList({ feedback, total }) {
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
      {total > feedback.length && (
        <p className="help" style={{ margin: 0 }}>
          The latest {feedback.length} of {total}. Every item is in the “Download for AI (JSON)” export.
        </p>
      )}
    </div>
  )
}

