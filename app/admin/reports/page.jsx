'use client'

/**
 * /admin/reports — every report in the admin index, 50 to a page, filtered by
 * who made it (account / free trial / access-code era) and searchable by
 * project, type, use or owner email. Reports can be deleted one by one, as a
 * ticked selection, or — for the access-code era — all at once.
 *
 * Self-gating like /admin: data comes from /api/admin/reports (gated by
 * proxy.ts); a 401 shows the admin-code form.
 */

import { useState, useEffect, useCallback } from 'react'
import { Card } from '../../components/ui'
import { Header, AdminLogin, Centered, Spinner, Checks, fmtDate, f1k } from '../shared'

const KINDS = [
  ['all', 'All'],
  ['account', 'Accounts'],
  ['trial', 'Free trial'],
  ['legacy', 'Access code (old)'],
]
const KIND_LABEL = { account: 'Account', trial: 'Free trial', legacy: 'Access code (old)' }

async function fetchReports({ kind, page, search }) {
  try {
    const params = new URLSearchParams({ kind, page: String(page) })
    if (search) params.set('q', search)
    const res = await fetch(`/api/admin/reports?${params}`)
    return { status: res.status, data: res.ok ? await res.json() : null }
  } catch {
    return { status: 0, data: null }
  }
}

export default function AdminReportsPage() {
  const [kind, setKind]       = useState('all')
  const [query, setQuery]     = useState('')
  const [search, setSearch]   = useState('')  // the query actually sent
  const [page, setPage]       = useState(1)
  const [data, setData]       = useState(null)
  const [phase, setPhase]     = useState('loading') // loading | locked | ready | error
  const [selected, setSelected] = useState(() => new Set())
  const [busy, setBusy]       = useState(false)
  const [message, setMessage] = useState('')

  const apply = useCallback(r => {
    if (r.status === 401) setPhase('locked')
    else if (!r.data) setPhase('error')
    else { setData(r.data); setPhase('ready') }
  }, [])
  const load = useCallback(() => fetchReports({ kind, page, search }).then(apply), [kind, page, search, apply])

  useEffect(() => {
    let cancelled = false
    fetchReports({ kind, page, search }).then(r => { if (!cancelled) apply(r) })
    return () => { cancelled = true }
  }, [kind, page, search, apply])

  // A new filter, search or page starts with nothing ticked.
  function go(next) {
    setSelected(new Set())
    setMessage('')
    if ('kind' in next) setKind(next.kind)
    if ('search' in next) setSearch(next.search)
    setPage(next.page ?? 1)
  }

  async function remove(body, confirmText) {
    if (!window.confirm(confirmText)) return
    setBusy(true); setMessage('')
    try {
      const res = await fetch('/api/admin/reports', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setMessage(out.error || 'Nothing was deleted.'); return }
      setMessage(`${out.deleted} ${out.deleted === 1 ? 'report' : 'reports'} deleted` +
        (out.skipped ? ` · ${out.skipped} kept (now owned by an account or a trial visitor)` : '') + '.')
      setSelected(new Set())
      await load()
    } catch {
      setMessage('Network error. Some reports may not have been deleted — refresh to check.')
    } finally {
      setBusy(false)
    }
  }

  const reports = data?.reports || []
  const allTicked = reports.length > 0 && reports.every(r => selected.has(r.reportId))
  const toggle = id => setSelected(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  const toggleAll = () => setSelected(allTicked ? new Set() : new Set(reports.map(r => r.reportId)))

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div className="grid-bg" style={{ position: 'fixed', inset: 0, opacity: .35, pointerEvents: 'none' }} />
      <Header current="reports" />
      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 24px 64px', position: 'relative' }}>
        {phase === 'loading' && <Centered><Spinner /></Centered>}
        {phase === 'locked' && <AdminLogin onSuccess={load} />}
        {phase === 'error' && (
          <Centered>
            <Card style={{ padding: 28, maxWidth: 440, textAlign: 'center' }}>
              <p style={{ color: 'var(--danger)', margin: '0 0 16px', fontSize: 14 }}>The reports could not be loaded.</p>
              <button className="btn btn-primary" onClick={load}>Retry</button>
            </Card>
          </Centered>
        )}
        {phase === 'ready' && data && (
          <div className="rise rise-1">
            <div style={{ marginBottom: 20 }}>
              <div className="eyebrow">Operations</div>
              <h1 style={{ fontSize: 28, margin: '6px 0 0', color: 'var(--ink)' }}>All reports</h1>
            </div>

            {data.counts.legacy > 0 && (
              <Card style={{ padding: '16px 20px', marginBottom: 18, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--text)', flex: '1 1 320px' }}>
                  <strong>{data.counts.legacy}</strong> {data.counts.legacy === 1 ? 'report was' : 'reports were'} made with the old access code, before accounts.
                  Since the site went public only the admin can open them.
                </p>
                <button className="btn btn-ghost" style={{ color: 'var(--danger)', padding: '6px 14px', fontSize: 13 }} disabled={busy}
                  onClick={() => remove({ kind: 'legacy' }, `Delete all ${data.counts.legacy} access-code reports? This cannot be undone.`)}>
                  Delete all old reports
                </button>
              </Card>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div role="group" aria-label="Show" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {KINDS.map(([key, label]) => (
                  <button key={key} type="button" className="btn btn-ghost" aria-pressed={kind === key} onClick={() => go({ kind: key })}
                    style={{ padding: '6px 12px', fontSize: 13, fontWeight: kind === key ? 600 : 400, background: kind === key ? 'var(--tint-2)' : undefined }}>
                    {label} ({data.counts[key]})
                  </button>
                ))}
              </div>
              <form onSubmit={e => { e.preventDefault(); go({ search: query.trim() }) }} style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                <label htmlFor="report-search" className="sr-only">Search reports</label>
                <input id="report-search" className="field" value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Project, type or email" style={{ padding: '6px 10px', fontSize: 13, width: 220 }} />
                <button type="submit" className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }}>Search</button>
              </form>
            </div>

            {(selected.size > 0 || message) && (
              <div role="status" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 12, fontSize: 13 }}>
                {selected.size > 0 && (
                  <button className="btn btn-ghost" style={{ color: 'var(--danger)', padding: '6px 14px', fontSize: 13 }} disabled={busy}
                    onClick={() => remove({ ids: [...selected] }, `Delete ${selected.size} selected ${selected.size === 1 ? 'report' : 'reports'}? Their owners lose them too. This cannot be undone.`)}>
                    {busy ? 'Deleting…' : `Delete ${selected.size} selected`}
                  </button>
                )}
                {message && <span style={{ color: 'var(--text-mid)' }}>{message}</span>}
              </div>
            )}

            {reports.length === 0 ? (
              <Card style={{ padding: 24 }}>
                <p style={{ color: 'var(--text-mute)', fontSize: 14, margin: 0 }}>No reports match.</p>
              </Card>
            ) : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <caption className="sr-only">Reports, newest first</caption>
                  <thead>
                    <tr>
                      <th style={{ width: 32 }}>
                        <input type="checkbox" checked={allTicked} onChange={toggleAll} aria-label="Select every report on this page" />
                      </th>
                      <th style={{ textAlign: 'left' }}>Project</th>
                      <th style={{ textAlign: 'left' }}>Created by</th>
                      <th style={{ textAlign: 'left' }}>Generated</th>
                      <th style={{ textAlign: 'right' }}>Cost range (excl. VAT)</th>
                      <th style={{ textAlign: 'right' }}>Weeks</th>
                      <th style={{ textAlign: 'left' }}>Checks</th>
                      <th style={{ textAlign: 'right' }}>Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map(r => (
                      <tr key={r.reportId}>
                        <td>
                          <input type="checkbox" checked={selected.has(r.reportId)} onChange={() => toggle(r.reportId)}
                            aria-label={`Select ${r.projectName || 'Untitled'}`} />
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.projectName || 'Untitled'}</div>
                          {(r.projectType || r.buildingUse) && (
                            <div style={{ fontSize: 12, color: 'var(--text-mid)' }}>{[r.projectType, r.buildingUse].filter(Boolean).join(' · ')}</div>
                          )}
                        </td>
                        <td style={{ color: 'var(--text-mid)', fontSize: 13 }}>
                          {r.kind === 'account' ? (r.ownerEmail || 'Account (deleted?)') : KIND_LABEL[r.kind]}
                        </td>
                        <td style={{ whiteSpace: 'nowrap', color: 'var(--text-mid)' }}>{fmtDate(r.generatedAt)}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{f1k(r.totalLow)} – {f1k(r.totalHigh)}</td>
                        <td style={{ textAlign: 'right' }}>{r.totalWeeks ?? '—'}</td>
                        <td style={{ fontSize: 13 }}><Checks checks={r.checks} /></td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <a className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }} href={`/report/${r.reportId}`} target="_blank" rel="noopener noreferrer">View ↗</a>{' '}
                          <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12, color: 'var(--danger)' }} disabled={busy}
                            aria-label={`Delete ${r.projectName || 'Untitled'}`}
                            onClick={() => remove({ ids: [r.reportId] }, `Delete “${r.projectName || 'Untitled'}”? Its owner loses it too. This cannot be undone.`)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data.pages > 1 && (
              <nav aria-label="Pages" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 18, fontSize: 13 }}>
                <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} disabled={page <= 1} onClick={() => go({ page: page - 1 })}>← Newer</button>
                <span style={{ color: 'var(--text-mid)' }}>Page {data.page} of {data.pages} · {data.total} reports</span>
                <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} disabled={page >= data.pages} onClick={() => go({ page: page + 1 })}>Older →</button>
              </nav>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
