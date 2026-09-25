'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { track } from '@vercel/analytics'
import ReportDocument from './doc/ReportDocument'

// ─── Screen chrome only ───────────────────────────────────────────────────────
// The report itself (every page, colour and size) lives in app/report/doc and
// lib/reportStyle.js. What remains here is the toolbar, alerts, the scenario
// comparison panel and the feedback modal, which are never part of the report.
const f1k = n => `£${(Math.round((n || 0) / 1000) * 1000).toLocaleString('en-GB')}`

const NAVY    = '#1A2E4A'
const NAVY_LT = '#9FB3CC'
const GRAY    = '#9AA3AD'
const ALT_ROW = '#F4F1EA'
const BORDER  = '#D9D3C7'
const FONT_HEAD = "var(--font-playfair), 'Playfair Display', Georgia, serif"
const FONT_BODY = "var(--font-dm-sans), 'DM Sans', 'Segoe UI', sans-serif"

/**
 * ReportRenderer
 *
 * Props:
 *   data      — full report payload (cost, programme, aiProse, answers, docx, …)
 *   reportId  — 16-char hex string; if present the "Copy Link" button is shown
 */
// `sample` — rendering the public /sample page: a fixed, fictional report used
// to show what the tool produces. Hides every action that needs a real saved
// report (download, PDF, share link, flag an issue) and shows a banner instead.
export default function ReportRenderer({ data, reportId, sample = false }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isPdf = searchParams?.get('pdf') === '1'   // server-side Puppeteer render
  const [downloading, setDownloading]   = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const [copied, setCopied]             = useState(false)
  const [pdfLoading, setPdfLoading]     = useState(false)

  // ── Feedback ("Flag an issue") modal state ──────────────────────────────────
  const [fbOpen, setFbOpen]       = useState(false)
  const [fbCategory, setFbCategory] = useState('Wrong numbers')
  const [fbMessage, setFbMessage] = useState('')
  const [fbStatus, setFbStatus]   = useState('idle')  // idle | sending | sent | error
  const [fbError, setFbError]     = useState('')

  async function submitFeedback() {
    if (!fbMessage.trim()) { setFbError('Please describe the issue.'); return }
    setFbStatus('sending')
    setFbError('')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: reportId || null,
          projectName: data?.projectName || null,
          category: fbCategory,
          message: fbMessage.trim(),
          url: typeof window !== 'undefined' ? window.location.href : null,
        }),
      })
      if (!res.ok) throw new Error('Request failed')
      track('feedback_flagged', { reportId: reportId || 'unsaved', category: fbCategory })
      setFbStatus('sent')
      setFbMessage('')
      setTimeout(() => { setFbOpen(false); setFbStatus('idle') }, 1800)
    } catch {
      setFbStatus('error')
      setFbError('Could not send — please try again.')
    }
  }

  // Saved reports: the server builds the Word file on download
  // (/api/reports/[id]/docx), so it always carries the current design.
  // Unsaved reports (no KV, local only) still carry it inline as data.docx.
  async function downloadDocx() {
    setDownloading(true)
    setDownloadError('')
    try {
      let blob
      if (reportId) {
        const res = await fetch(`/api/reports/${reportId}/docx`)
        if (!res.ok) throw new Error('docx service unavailable')
        blob = await res.blob()
      } else if (data?.docx) {
        const bytes = Uint8Array.from(atob(data.docx), c => c.charCodeAt(0))
        blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
      } else {
        throw new Error('no Word file')
      }
      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `${(data.projectName || 'Report').replace(/[^a-z0-9 _-]/gi, '_')}_Stage1_Report.docx`
      a.click()
      URL.revokeObjectURL(url)
      track('docx_downloaded', { reportId: reportId || 'unsaved' })
    } catch {
      setDownloadError('The Word file could not be created. Please try again in a moment.')
    }
    setDownloading(false)
  }

  async function downloadPdf() {
    track('pdf_downloaded', { reportId: reportId || 'unsaved' })
    // Saved reports → server-side Puppeteer PDF of the same A4 pages.
    // Unsaved reports (no id / KV off, local only) → browser print, whose
    // print CSS produces the same pages.
    if (!reportId) { window.print(); return }
    setPdfLoading(true)
    setDownloadError('')
    try {
      const res = await fetch(`/api/report-pdf/${reportId}`)
      if (!res.ok) throw new Error('PDF service unavailable')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${(data.projectName || 'Report').replace(/[^a-z0-9 _-]/gi, '_')}_Stage1_Report.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // No silent fallback to browser print: that produced an off-spec PDF
      // (browser margins, no fonts check) that looked like a real export.
      setDownloadError('The PDF could not be created. Please try again in a moment.')
    }
    setPdfLoading(false)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
      track('link_copied', { reportId: reportId || 'unsaved' })
    } catch {
      // Fallback: do nothing — clipboard may be blocked
    }
  }

  const { cost, templateError, answers, status, prosePending } = data
  // `status` is only present on a record from the two-phase pipeline; a record
  // with no status at all is a legacy one generated in a single shot and is
  // always complete. Everything the document shows (cover, section numbers,
  // page map) is decided in lib/reportContent.js and rendered by
  // app/report/doc/ReportDocument.jsx.
  const isPending  = status && status !== 'complete'

  return (
    <>
      {/* ── Toolbar (screen only) ── */}
      <div className="no-print" style={{ position: 'sticky', top: 0, zIndex: 20, background: 'linear-gradient(135deg, #1A2E4A 0%, #12233A 100%)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '10px 16px' }}>
        <div style={{ maxWidth: '880px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: '15px', fontFamily: FONT_HEAD, letterSpacing: '0.2px' }}>
            {sample ? 'Estates AI — Sample Report' : 'Estates AI — Report Preview'}
          </span>
          {sample ? (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button onClick={() => router.push('/questionnaire')} style={btnStyle('green')}>
                Start your own report →
              </button>
            </div>
          ) : (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => router.push('/reports')} style={btnStyle('outline')}>
              My reports
            </button>
            <button onClick={() => {
              // Without this, "New Report" landed on a form silently
              // pre-filled with this project's answers — there was no
              // removeItem anywhere in the app. A colleague starting their
              // next project expects a blank form, not a resumed draft.
              try { localStorage.removeItem('estatesAI_v4_answers') } catch {}
              router.push('/questionnaire')
            }} style={btnStyle('outline')}>
              ← New Report
            </button>
            <button onClick={() => { setFbOpen(true); setFbStatus('idle'); setFbError('') }}
              style={btnStyle('outline')}>
              ⚑ Flag an issue
            </button>
            {reportId && (
              <button onClick={copyLink}
                title="Opens this report on any device where you are signed in"
                style={btnStyle(copied ? 'copied' : 'link')}>
                {copied ? '✓ Copied!' : '🔗 Copy Link'}
              </button>
            )}
            <button onClick={downloadPdf} disabled={pdfLoading || isPending}
              title={isPending ? 'Available once the narrative sections finish generating' : undefined}
              style={btnStyle('gray', pdfLoading || isPending)}>
              {pdfLoading ? 'Preparing PDF…' : '⬇ Download PDF'}
            </button>
            <button onClick={downloadDocx} disabled={downloading || isPending}
              title={isPending ? 'Available once the narrative sections finish generating' : undefined}
              style={btnStyle('green', downloading || isPending)}>
              {downloading ? 'Downloading…' : '⬇ Download Word (.docx)'}
            </button>
          </div>
          )}
        </div>
      </div>

      {/* ── Alerts ── */}
      <div className="no-print" style={{ maxWidth: '880px', margin: '0 auto', padding: '0 16px' }}>
        {sample && (
          <div role="status" style={{ ...alertStyle('#FFF8E8', '#C4861A'), marginTop: '12px' }}>
            <strong>This is a sample.</strong> A fictional project, generated by the tool exactly as your own report would be: every figure from the NRM1 and programme workbooks, the narrative written by AI around those fixed figures. Numbers are illustrative only.
          </div>
        )}
        {isPending && (
          <div role="status" aria-live="polite" style={alertStyle('#EFF6FF', '#1D4ED8')}>
            <span aria-hidden="true" style={{ display: 'inline-block', width: 12, height: 12, marginRight: 8, verticalAlign: 'middle', border: '2px solid #1D4ED8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <strong style={{ color: '#1D4ED8' }}>Cost and programme are final.</strong>
            <span style={{ color: '#1D4ED8', fontSize: '13px' }}>
              {' '}Generating the executive summary, risk register and procurement narrative
              {prosePending && (prosePending.narrative === false || prosePending.risk === false)
                ? ' — almost there' : ''}. This page updates automatically; no need to refresh.
            </span>
          </div>
        )}
        {templateError && (
          <div role="alert" style={alertStyle('#FEF9C3', '#D97706')}>
            <strong style={{ color: '#92400E' }}>Note:</strong>
            <span style={{ color: '#92400E', fontSize: '13px' }}> {templateError}</span>
          </div>
        )}
        {downloadError && (
          <div role="alert" style={alertStyle('#FEF2F2', '#C00000')}>
            <span style={{ color: '#C00000', fontSize: '13px' }}>{downloadError}</span>
          </div>
        )}
      </div>

      {/* ── The report: A4 pages (app/report/doc) — screen, PDF and Word share one design ── */}
      <div className="report-outer" style={{ padding: isPdf ? 0 : '24px 16px 48px' }}>
        <ReportDocument data={data} reportId={reportId} isPdf={isPdf} isPending={isPending} />

        {/* Scenario comparison — screen only. Deterministic re-runs of the same
            answers with one input varied (POST /api/compare); a what-if tool,
            not part of the report of record, so never in the PDF or .docx. */}
        {!isPdf && !sample && answers && cost && (
          <div className="no-print" style={{ maxWidth: 794, margin: '24px auto 0' }}>
            <ComparePanel answers={answers} currentTotal={cost.total} />
          </div>
        )}

        {!isPdf && (
          <div style={{ maxWidth: 794, margin: '0 auto' }}>
              {sample ? (
                <div className="no-print" style={{ marginTop: '40px', padding: '20px 24px', background: ALT_ROW, border: `1px solid ${BORDER}`, borderRadius: '4px', textAlign: 'center' }}>
                  <p style={{ fontWeight: 700, color: NAVY, marginBottom: '6px', fontSize: '14px' }}>Ready to scope your own project?</p>
                  <p style={{ color: '#666', fontSize: '12px', marginBottom: '14px' }}>A real report takes about ten minutes of questions and comes with a Word document and PDF.</p>
                  <button onClick={() => router.push('/questionnaire')} style={btnStyle('green')}>Start the questionnaire →</button>
                </div>
              ) : (
              <div className="no-print" style={{ marginTop: '40px', padding: '20px 24px', background: ALT_ROW, border: `1px solid ${BORDER}`, borderRadius: '4px', textAlign: 'center' }}>
                <p style={{ fontWeight: 700, color: NAVY, marginBottom: '6px', fontSize: '14px' }}>Download this report</p>
                <p style={{ color: '#666', fontSize: '12px', marginBottom: '14px' }}>
                  Word document (.docx) for editing and sharing · PDF for print-ready archive
                </p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button onClick={downloadPdf} disabled={pdfLoading}
                    style={btnStyle('gray', pdfLoading)}>
                    {pdfLoading ? 'Preparing PDF…' : '⬇ Download PDF'}
                  </button>
                  <button onClick={downloadDocx} disabled={downloading}
                    style={btnStyle('green', downloading)}>
                    {downloading ? 'Downloading…' : '⬇ Download Word (.docx)'}
                  </button>
                  {reportId && (
                    <button onClick={copyLink}
                      style={btnStyle(copied ? 'copied' : 'link')}>
                      {copied ? '✓ Copied!' : '🔗 Copy shareable link'}
                    </button>
                  )}
                </div>
                {downloadError && <p role="alert" style={{ color: '#C0392B', marginTop: '8px', fontSize: '12px' }}>{downloadError}</p>}
              </div>
              )}
          </div>
        )}
      </div>

      {/* ── Flag-an-issue modal (screen only) ── */}
      {fbOpen && (
        <FeedbackModal
          category={fbCategory} setCategory={setFbCategory}
          message={fbMessage} setMessage={setFbMessage}
          status={fbStatus} error={fbError}
          onSubmit={submitFeedback}
          onClose={() => { if (fbStatus !== 'sending') setFbOpen(false) }}
        />
      )}
    </>
  )
}

// ─── Feedback modal ───────────────────────────────────────────────────────────
const FB_CATEGORIES = ['Wrong numbers', 'Odd programme', 'Missing scope', 'Confusing UX', 'Other']

function FeedbackModal({ category, setCategory, message, setMessage, status, error, onSubmit, onClose }) {
  const sending = status === 'sending'
  const sent    = status === 'sent'

  // Escape-to-close: previously the only way out was clicking the backdrop
  // or the Cancel button, both mouse-first affordances for a keyboard user
  // who has just tabbed all the way into the dialog.
  useEffect(() => {
    const onKeyDown = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="no-print" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(18,35,58,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', fontFamily: FONT_BODY }}>
      <div role="dialog" aria-modal="true" aria-labelledby="feedback-modal-title" onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: '440px', background: '#fff', borderRadius: '10px', boxShadow: '0 12px 40px rgba(0,0,0,0.28)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #12233A 100%)`, padding: '18px 22px' }}>
          <p id="feedback-modal-title" style={{ margin: 0, color: '#fff', fontWeight: 700, fontSize: '16px', fontFamily: FONT_HEAD }}>Flag an issue</p>
          <p style={{ margin: '3px 0 0', color: NAVY_LT, fontSize: '12px' }}>
            Spotted something off in this report? Tell us — it helps us fix it.
          </p>
        </div>

        {sent ? (
          <div style={{ padding: '32px 22px', textAlign: 'center' }}>
            <div style={{ fontSize: '30px', marginBottom: '8px' }}>✓</div>
            <p style={{ margin: 0, color: NAVY, fontWeight: 700, fontSize: '15px' }}>Thanks — noted.</p>
            <p style={{ margin: '6px 0 0', color: '#666', fontSize: '13px' }}>Your report reference was captured so we can reproduce it.</p>
          </div>
        ) : (
          <div style={{ padding: '20px 22px' }}>
            <label htmlFor="fb-category" style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
              What kind of issue?
            </label>
            <select id="fb-category" value={category} onChange={e => setCategory(e.target.value)} disabled={sending}
              style={{ width: '100%', padding: '9px 10px', fontSize: '13px', border: `1px solid ${BORDER}`, borderRadius: '6px', background: '#fff', color: '#333', fontFamily: FONT_BODY, marginBottom: '14px' }}>
              {FB_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <label htmlFor="fb-message" style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
              Describe it
            </label>
            <textarea id="fb-message" value={message} onChange={e => setMessage(e.target.value)} disabled={sending}
              rows={4} maxLength={4000}
              placeholder="e.g. The construction cost looks far too high for a 200 m² refurb…"
              style={{ width: '100%', padding: '10px', fontSize: '13px', border: `1px solid ${BORDER}`, borderRadius: '6px', resize: 'vertical', fontFamily: FONT_BODY, color: '#333', lineHeight: 1.5, boxSizing: 'border-box' }} />

            {error && <p style={{ color: '#C0392B', fontSize: '12px', margin: '8px 0 0' }}>{error}</p>}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button onClick={onClose} disabled={sending}
                style={{ padding: '9px 16px', fontSize: '13px', fontWeight: 600, border: `1px solid ${BORDER}`, borderRadius: '8px', background: '#fff', color: '#555', cursor: sending ? 'default' : 'pointer', fontFamily: FONT_BODY }}>
                Cancel
              </button>
              <button onClick={onSubmit} disabled={sending}
                style={{ padding: '9px 18px', fontSize: '13px', fontWeight: 700, border: 'none', borderRadius: '8px', background: 'linear-gradient(150deg, #C4861A 0%, #A86F12 100%)', color: '#fff', cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.65 : 1, fontFamily: FONT_BODY }}>
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const tblStyle  = { width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '0' }

const thStyle   = { padding: '9px 10px', color: '#fff', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', background: NAVY, whiteSpace: 'nowrap' }

const tdStyle   = { padding: '7px 10px', lineHeight: 1.5, verticalAlign: 'top', fontSize: '13px', color: '#333', wordBreak: 'break-word', overflowWrap: 'break-word' }

function btnStyle(variant, disabled = false) {
  const base = { padding: '8px 18px', border: '1px solid transparent', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1, fontFamily: 'var(--font-body)', lineHeight: 1 }
  if (variant === 'outline') return { ...base, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.22)', color: '#EAF0FA' }
  // For light backgrounds (the on-page compare panel), not the navy toolbar.
  if (variant === 'outline-dark') return { ...base, background: '#fff', border: `1px solid ${BORDER}`, color: NAVY }
  if (variant === 'gray')    return { ...base, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.16)', color: '#EAF0FA' }
  if (variant === 'green')   return { ...base, background: 'linear-gradient(150deg, #C4861A 0%, #A86F12 100%)', color: '#fff', boxShadow: '0 4px 14px rgba(196,134,26,0.4)' }
  if (variant === 'link')    return { ...base, background: 'rgba(255,255,255,0.92)', color: NAVY, border: '1px solid rgba(255,255,255,0.4)' }
  if (variant === 'copied')  return { ...base, background: 'linear-gradient(150deg, #1E7A55 0%, #156244 100%)', color: '#fff' }
  return base
}

function alertStyle(bg, borderColor) {
  return { margin: '12px 0', padding: '10px 16px', background: bg, border: `1px solid ${borderColor}`, borderRadius: '4px' }
}

// ─── Helper components ────────────────────────────────────────────────────────

// ─── Scenario comparison panel (screen only) ─────────────────────────────────
const COMPARE_AXES = [
  { id: 'spec',         label: 'Specification level' },
  { id: 'intervention', label: 'Level of intervention' },
]

function ComparePanel({ answers, currentTotal }) {
  const [axis, setAxis] = useState('spec')
  const [state, setState] = useState({ status: 'idle', data: null, error: '' })

  async function run(nextAxis) {
    const a = nextAxis || axis
    setAxis(a)
    setState({ status: 'loading', data: null, error: '' })
    try {
      const res = await fetch('/api/compare', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, axis: a }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Comparison failed (${res.status}).`)
      setState({ status: 'ready', data: body, error: '' })
    } catch (e) {
      setState({ status: 'error', data: null, error: e.message })
    }
  }

  const rows = state.data?.scenarios || []
  const base = currentTotal?.mid || 0
  return (
    <div className="no-print avoid-break" style={{ marginTop: '28px', padding: '18px 20px', background: ALT_ROW, border: `1px solid ${BORDER}`, borderRadius: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p style={{ fontWeight: 700, color: NAVY, margin: 0, fontSize: '14px' }}>Compare scenarios</p>
          <p style={{ color: '#666', fontSize: '12px', margin: '2px 0 0' }}>Re-runs the estimate with one answer changed. Deterministic, instant, not part of the saved report.</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Comparison axis">
          {COMPARE_AXES.map(a => (
            <button key={a.id} type="button" onClick={() => run(a.id)} aria-pressed={axis === a.id && state.status !== 'idle'}
              style={btnStyle(axis === a.id && state.status !== 'idle' ? 'green' : 'outline-dark', state.status === 'loading')} disabled={state.status === 'loading'}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
      {state.status === 'loading' && <p role="status" aria-live="polite" style={{ color: '#666', fontSize: '13px', marginTop: 12 }}>Running scenarios…</p>}
      {state.status === 'error' && <p role="alert" style={{ color: '#C0392B', fontSize: '13px', marginTop: 12 }}>{state.error}</p>}
      {state.status === 'ready' && rows.length === 0 && (
        <p style={{ color: '#666', fontSize: '13px', marginTop: 12 }}>{state.data?.note || 'Nothing to compare on this axis for this project type.'}</p>
      )}
      {state.status === 'ready' && rows.length > 0 && (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table style={tblStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'left' }}>{state.data.label}</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Works £/m²</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Total low – high</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Mid vs this report</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Programme</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Grade</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                if (r.error) return (
                  <tr key={r.value}><td style={tdStyle}>{r.value}</td><td colSpan={5} style={{ ...tdStyle, color: '#C0392B' }}>{r.error}</td></tr>
                )
                const delta = r.total.mid - base
                const deltaPct = base ? Math.round((delta / base) * 100) : 0
                return (
                  <tr key={r.value} style={{ background: r.isCurrent ? 'rgba(26,46,74,.08)' : i % 2 === 0 ? '#fff' : ALT_ROW, borderBottom: `1px solid ${BORDER}` }}>
                    <td style={{ ...tdStyle, fontWeight: r.isCurrent ? 700 : 500, color: NAVY }}>{r.value}{r.isCurrent ? ' (this report)' : ''}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>£{r.costPerSqm.toLocaleString('en-GB')}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>{f1k(r.total.low)} – {f1k(r.total.high)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: delta > 0 ? '#C0392B' : delta < 0 ? '#2A7A4B' : '#666' }}>
                      {r.isCurrent ? '—' : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${f1k(Math.abs(delta))} (${deltaPct > 0 ? '+' : deltaPct < 0 ? '−' : ''}${Math.abs(deltaPct)}%)`}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{r.totalWeeks} wks</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{r.confidence}{r.excludedCount > 0 ? ` (${r.excludedCount} unpriced)` : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p style={{ fontSize: '11px', color: GRAY, fontStyle: 'italic', margin: '6px 0 0' }}>
            Same postcode, scope, condition and programme inputs; only the highlighted answer changes. Totals exclude VAT.
          </p>
        </div>
      )}
    </div>
  )
}
