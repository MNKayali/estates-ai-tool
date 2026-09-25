'use client'

/**
 * /reports — the signed-in user's report history, plus a password change.
 *
 * Lists the summaries written at finalise (lib/kv.js listUserReports), newest
 * first. A report only appears here once its AI text has finished; reports are
 * kept until their owner deletes them.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, Badge, SectionHeader } from '../components/ui'
import { FormError, FormNote } from '../components/AuthShell'
import { BRAND } from '@/lib/brand'
import Logo from '../components/Logo'

const f1k = n => (n == null ? '—' : `£${(Math.round(n / 1000) * 1000).toLocaleString('en-GB')}`)

function fmtDate(iso) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return '—'
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function MyReportsPage() {
  const [user, setUser]       = useState(null)
  const [reports, setReports] = useState(null)
  const [error, setError]     = useState('')
  const [deleting, setDeleting] = useState(null)

  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    Promise.all([fetch('/api/auth/me'), fetch('/api/my-reports')])
      .then(async ([me, list]) => {
        if (cancelled) return
        if (me.status === 401 || list.status === 401) { router.replace('/login?from=/reports'); return }
        const [meData, listData] = await Promise.all([me.json(), list.json()])
        if (cancelled) return
        setUser(meData.user)
        setReports(listData.reports || [])
      })
      .catch(() => {
        if (cancelled) return
        setError('Your reports could not be loaded. Check your connection and refresh the page.')
        setReports([])
      })
    return () => { cancelled = true }
  }, [router])

  async function remove(r) {
    if (!window.confirm(`Delete “${r.projectName || 'Untitled'}”? The report and its share link will stop working. This cannot be undone.`)) return
    setDeleting(r.reportId)
    setError('')
    try {
      const res = await fetch(`/api/reports/${r.reportId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setError(data.error || 'The report could not be deleted.')
      else setReports(list => list.filter(x => x.reportId !== r.reportId))
    } catch {
      setError('Network error. The report was not deleted.')
    } finally {
      setDeleting(null)
    }
  }

  async function logout() {
    try { await fetch('/api/logout', { method: 'POST' }) } catch {}
    router.replace('/login')
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div className="grid-bg" style={{ position: 'fixed', inset: 0, opacity: .35, pointerEvents: 'none' }} />
      <header style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(250,248,243,.82)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/" aria-label={`${BRAND.name} home`} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <Logo variant="navy" height={24} compactBelow360 />
          </Link>
          <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-soft)' }}>{user?.name || user?.email || ''}</span>
          <button onClick={logout} className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: 13 }}>Sign out</button>
        </div>
      </header>

      <main style={{ maxWidth: 1040, margin: '0 auto', padding: '28px 24px 64px', position: 'relative' }}>
        <div className="rise rise-1" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          <div>
            <div className="eyebrow">Your account</div>
            <h1 style={{ fontSize: 28, margin: '6px 0 0', color: 'var(--ink)' }}>My reports</h1>
          </div>
          <Link href="/questionnaire" className="btn btn-primary">New report ▸</Link>
        </div>

        {error && (
          <div role="alert" style={{ marginBottom: 18, padding: '12px 16px', borderRadius: 8, border: '1px solid var(--danger)', color: 'var(--danger)', background: 'var(--surface)', fontSize: 14 }}>
            {error}
          </div>
        )}

        <SectionHeader number="1" title="Reports" />
        <ReportList reports={reports} deleting={deleting} onDelete={remove} />

        <SectionHeader number="2" title="Password" />
        <ChangePassword />
      </main>
    </div>
  )
}

function ReportList({ reports, deleting, onDelete }) {
  if (reports === null) return <p role="status" style={{ color: 'var(--text-mute)', fontSize: 14, marginBottom: 32 }}>Loading your reports…</p>
  if (!reports.length) {
    return (
      <Card style={{ padding: 24, marginBottom: 32 }}>
        <p style={{ color: 'var(--text-soft)', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
          No reports yet. Reports you generate are saved here automatically once they finish.{' '}
          <Link href="/questionnaire" style={{ color: 'var(--navy)' }}>Start your first report</Link>.
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
            <th className="hide-sm" style={{ textAlign: 'left' }}>Created</th>
            <th className="hide-sm" style={{ textAlign: 'right' }}>Cost range (excl. VAT)</th>
            <th className="hide-sm" style={{ textAlign: 'right' }}>Weeks</th>
            <th style={{ textAlign: 'right' }}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {reports.map(r => (
            <tr key={r.reportId}>
              <td>
                <div style={{ fontWeight: 600 }}>{r.projectName || 'Untitled'}</div>
                <div className="only-sm" style={{ fontSize: 12.5, color: 'var(--text-mid)', marginTop: 4, lineHeight: 1.5 }}>
                  {fmtDate(r.generatedAt)} · {f1k(r.totalLow)} – {f1k(r.totalHigh)} excl. VAT{r.totalWeeks != null ? ` · ${r.totalWeeks} weeks` : ''}
                </div>
                {r.projectType && <div style={{ marginTop: 4 }}><Badge>{r.projectType}</Badge></div>}
              </td>
              <td className="hide-sm" style={{ whiteSpace: 'nowrap', color: 'var(--text-mid)' }}>{fmtDate(r.generatedAt)}</td>
              <td className="hide-sm" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{f1k(r.totalLow)} – {f1k(r.totalHigh)}</td>
              <td className="hide-sm" style={{ textAlign: 'right' }}>{r.totalWeeks ?? '—'}</td>
              <td style={{ textAlign: 'right' }}>
                <Link className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }} href={`/report/${r.reportId}`}>Open</Link>{' '}
                <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12, color: 'var(--danger)' }}
                  disabled={deleting === r.reportId} onClick={() => onDelete(r)}
                  aria-label={`Delete ${r.projectName || 'Untitled'}`}>
                  {deleting === r.reportId ? 'Deleting…' : 'Delete'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ChangePassword() {
  const [open, setOpen]       = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext]       = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError]     = useState('')
  const [done, setDone]       = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (next !== confirm) { setError('The two new passwords do not match.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'The password could not be changed.'); return }
      setDone('Password changed. Any other devices signed in to your account have been signed out.')
      setCurrent(''); setNext(''); setConfirm(''); setOpen(false)
    } catch {
      setError('Network error. Your password was not changed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card style={{ padding: 24, maxWidth: 480 }}>
      <FormNote>{done}</FormNote>
      {!open ? (
        <button className="btn btn-ghost" onClick={() => { setOpen(true); setDone('') }} aria-expanded={false}
          style={{ marginTop: done ? 12 : 0 }}>Change password</button>
      ) : (
        <form onSubmit={submit} noValidate>
          <label className="label" htmlFor="cp-current">Current password</label>
          <input id="cp-current" className="field" type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} />
          <label className="label" htmlFor="cp-new" style={{ marginTop: 14 }}>New password</label>
          <input id="cp-new" className="field" type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} aria-describedby="cp-help" />
          <p id="cp-help" className="help">At least 10 characters.</p>
          <label className="label" htmlFor="cp-confirm" style={{ marginTop: 14 }}>Confirm new password</label>
          <input id="cp-confirm" className="field" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} />
          <FormError>{error}</FormError>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button type="submit" className="btn btn-primary" disabled={loading || !current || !next || !confirm}>
              {loading ? 'Saving…' : 'Save password'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { setOpen(false); setError('') }} aria-expanded>Cancel</button>
          </div>
        </form>
      )}
    </Card>
  )
}
