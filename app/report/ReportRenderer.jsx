'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { track } from '@vercel/analytics'

// ─── Formatters ───────────────────────────────────────────────────────────────
const f1k  = n => `£${(Math.round((n || 0) / 1000) * 1000).toLocaleString('en-GB')}`
const f100 = n => `£${(Math.round((n || 0) / 100)  * 100).toLocaleString('en-GB')}`
const f    = n => `£${Math.round(n || 0).toLocaleString('en-GB')}`
const pct = n  => `${Math.round((n || 0) * 10) / 10}%`

// ─── Colours ─────────────────────────────────────────────────────────────────
const NAVY    = '#1A2E4A'
const NAVY_LT = '#9FB3CC'
const AMBER   = '#C4861A'
const GRAY    = '#9AA3AD'
const ALT_ROW = '#F4F1EA'   // warm alternating row tint
const BORDER  = '#D9D3C7'

// Document typography — Playfair for headings, DM Sans for body (web fonts
// loaded by the root layout; serif/sans-serif fallbacks for print).
const FONT_HEAD = "var(--font-playfair), 'Playfair Display', Georgia, serif"
const FONT_BODY = "var(--font-dm-sans), 'DM Sans', 'Segoe UI', sans-serif"

// ─── Group names ──────────────────────────────────────────────────────────────
const GROUP_NAMES = {
  0: 'GROUP 0 — FACILITATING WORKS',
  1: 'GROUP 1 — SUBSTRUCTURE',
  2: 'GROUP 2 — SUPERSTRUCTURE',
  3: 'GROUP 3 — INTERNAL FINISHES',
  4: 'GROUP 4 — FITTINGS, FURNISHINGS & EQUIPMENT',
  5: 'GROUP 5 — MECHANICAL & ELECTRICAL SERVICES',
  6: 'GROUP 6 — PREFABRICATED / MODULAR',
  7: 'GROUP 7 — WORK TO EXISTING BUILDINGS',
  8: 'GROUP 8 — EXTERNAL WORKS',
  99: 'PROVISIONAL SUMS & SPECIALIST SCOPE',
}

/**
 * ReportRenderer
 *
 * Props:
 *   data      — full report payload (cost, programme, aiProse, answers, docx, …)
 *   reportId  — 16-char hex string; if present the "Copy Link" button is shown
 */
export default function ReportRenderer({ data, reportId }) {
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

  function downloadDocx() {
    if (!data?.docx) {
      setDownloadError('Word document unavailable. Please regenerate the report.')
      return
    }
    setDownloading(true)
    setDownloadError('')
    try {
      const bytes = Uint8Array.from(atob(data.docx), c => c.charCodeAt(0))
      const blob  = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
      const url   = URL.createObjectURL(blob)
      const a     = document.createElement('a')
      a.href      = url
      a.download  = `${(data.projectName || 'Report').replace(/[^a-z0-9 _-]/gi, '_')}_Stage1_Report.docx`
      a.click()
      URL.revokeObjectURL(url)
      track('docx_downloaded', { reportId: reportId || 'unsaved' })
    } catch (e) {
      setDownloadError('Download failed: ' + e.message)
    }
    setDownloading(false)
  }

  async function downloadPdf() {
    track('pdf_downloaded', { reportId: reportId || 'unsaved' })
    // Saved reports → server-side Puppeteer PDF (real page numbers).
    // Unsaved reports (no id / KV off) → browser print fallback.
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
      // Fallback to browser print if the server route fails for any reason.
      window.print()
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

  const { cost, programme, aiProse, projectName, generatedAt, templateError, answers, budget } = data
  const grade      = aiProse?.confidenceScore  || 'B'
  const confLabel  = aiProse?.confidenceLabel  || 'Moderate Confidence'
  const riskLevel  = cost?.percentages?.riskLevel || 'Medium'
  const roi        = calcRoi(answers, cost)

  const dateStr = generatedAt
    ? new Date(generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  // ── Optional section flags ─────────────────────────────────────────────────
  const optSections = Array.isArray(answers?.q6_1_reportSections) && answers.q6_1_reportSections.length > 0
    ? answers.q6_1_reportSections
    : ['Order of Cost Estimate (NRM1)', 'ROI & Financial Case', 'Procurement Recommendation', 'Constraints Summary']
  const showCost = optSections.includes('Order of Cost Estimate (NRM1)')
  const showROI  = !!roi && optSections.includes('ROI & Financial Case')
  const showProc = optSections.includes('Procurement Recommendation')
  const showCon  = optSections.includes('Constraints Summary')

  // Dynamic section numbering
  let _sn = 4
  const snCost = showCost ? ++_sn : null
  const snROI  = showROI  ? ++_sn : null
  const snProc = showProc ? ++_sn : null
  const snCon  = showCon  ? ++_sn : null
  const snNext = ++_sn

  return (
    <>
      {/* ── Print rules ── */}
      <style>{`
        /* ── Single consolidated @page rule ──────────────────────────────────────
           - margin: 20mm top · 18mm sides · 15mm bottom — generous gutters so no
             content reaches the paper edge on any page.
           - @page :first: cover is full-bleed (zero margins). The cover is forced
             onto its own page (.report-cover { break-after: page }) so this rule
             can never strip margins from real body content.
           NOTE: the @top-left / @bottom-center margin boxes below (incl. the
           counter(page) page number) are a progressive enhancement. They render
           in dedicated print engines (Prince/WeasyPrint/paged.js) but NOT in
           browser "Print to PDF" — Chromium/Gecko/WebKit do not implement page
           margin-box generated content. For guaranteed page numbers from the
           browser, the user must tick "Headers and footers" in the print dialog,
           or we move export to a server-side renderer. */
        ${isPdf ? `
        /* PDF mode: Puppeteer owns margins + the "Page X of Y" footer, so the page
           CSS must not set @page margins. Cover prints as a normal margined page. */
        @page { size: A4; }
        ` : `
        @page {
          size: A4;
          margin: 20mm 18mm 15mm 18mm;
          @top-left {
            content: "RIBA Stage 0–1 Feasibility Report";
            font-size: 8pt;
            font-family: Arial, sans-serif;
            color: #444;
            border-bottom: 2px solid #2E75B6;
            padding-bottom: 2mm;
            vertical-align: bottom;
            width: 100%;
          }
          @bottom-center {
            content: "Page " counter(page) "  ·  Estates AI Tool  ·  Indicative only";
            font-size: 8pt;
            font-family: Arial, sans-serif;
            color: #666;
          }
        }
        @page :first {
          margin: 0;
          @top-left      { content: none; }
          @bottom-center { content: none; }
        }
        `}

        @media print {
          .no-print    { display: none !important; }
          body         { margin: 0; background: white !important; }
          *            { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

          /* Remove screen chrome from outer wrappers */
          .report-outer { background: white !important; padding: 0 !important; min-height: unset !important; overflow: visible !important; }
          .report-inner { box-shadow: none !important; max-width: 100% !important; overflow: visible !important; }

          /* Hide the screen running-header div — margin boxes replace it in print */
          .print-running-hdr { display: none !important; }

          /* Cover owns page 1 alone, so @page :first { margin: 0 } can't strip
             margins from real content that would otherwise share the page.
             Fill the page so the cover is a full branded page, not a navy band
             with a large empty white area beneath it. */
          .report-cover { break-after: page !important; min-height: 247mm; }
          .cover-footer { margin-top: auto; }

          /* Page-break rules */
          .page-break  { break-before: page !important; }
          .section-hdr { break-after: avoid !important; }
          table        { break-inside: avoid !important; }
          tr           { break-inside: avoid !important; }
          .avoid-break { break-inside: avoid !important; }
          .cost-works-table table { break-inside: auto !important; }

          /* Section page breaks */
          .report-section { break-before: page !important; }
          .report-section:first-of-type { break-before: auto !important; }

          /* Keep headings with their first content line */
          h2, h3 { break-after: avoid !important; }
          .cost-section-header { break-after: avoid !important; }

          /* Keep risk rows and programme rows intact */
          .risk-row { break-inside: avoid !important; }
          .programme-table tr { break-inside: avoid !important; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ── Toolbar (screen only) ── */}
      <div className="no-print" style={{ position: 'sticky', top: 0, zIndex: 20, background: 'linear-gradient(135deg, #1A2E4A 0%, #12233A 100%)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '10px 16px' }}>
        <div style={{ maxWidth: '880px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: '15px', fontFamily: FONT_HEAD, letterSpacing: '0.2px' }}>
            Estates AI — Report Preview
          </span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => router.push('/questionnaire')}
              style={btnStyle('outline')}>
              ← New Report
            </button>
            <button onClick={() => { setFbOpen(true); setFbStatus('idle'); setFbError('') }}
              style={btnStyle('outline')}>
              ⚑ Flag an issue
            </button>
            {reportId && (
              <button onClick={copyLink}
                style={btnStyle(copied ? 'copied' : 'link')}>
                {copied ? '✓ Copied!' : '🔗 Copy Link'}
              </button>
            )}
            <button onClick={downloadPdf} disabled={pdfLoading}
              style={btnStyle('gray', pdfLoading)}>
              {pdfLoading ? 'Preparing PDF…' : '⬇ Download PDF'}
            </button>
            <button onClick={downloadDocx} disabled={downloading}
              style={btnStyle('green', downloading)}>
              {downloading ? 'Downloading…' : '⬇ Download Word (.docx)'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Alerts ── */}
      <div className="no-print" style={{ maxWidth: '880px', margin: '0 auto', padding: '0 16px' }}>
        {templateError && (
          <div style={alertStyle('#FEF9C3', '#D97706')}>
            <strong style={{ color: '#92400E' }}>Note:</strong>
            <span style={{ color: '#92400E', fontSize: '13px' }}> {templateError}</span>
          </div>
        )}
        {downloadError && (
          <div style={alertStyle('#FEF2F2', '#C00000')}>
            <span style={{ color: '#C00000', fontSize: '13px' }}>{downloadError}</span>
          </div>
        )}
      </div>

      {/* ── Print running header (hidden on screen; fixed on every printed page) ──
           Page 1: covered by the navy cover div (zIndex: 1).
           Pages 2+: sits in the 15mm top margin created by @page. ── */}
      <div className="print-running-hdr" style={{ display: 'none' }}>
        <span style={{ fontWeight: 700, color: '#1A2E4A' }}>
          {projectName || 'Estates AI Tool'}
        </span>
        <span style={{ color: '#666' }}>
          RIBA Stage 0–1 Feasibility Report
          {reportId ? ` · Ref: ${reportId.slice(0, 8).toUpperCase()}` : ''}
          {' '}· {dateStr}
        </span>
      </div>

      {/* ── Document shell ── */}
      <div className="report-outer" style={{ background: '#EFEBE1', minHeight: '100vh', padding: '24px 16px 48px', fontFamily: FONT_BODY }}>
        <div className="report-inner" style={{ maxWidth: '880px', margin: '0 auto', background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>

          {/* ══ COVER ══ */}
          <div className="report-cover" style={{ background: `linear-gradient(160deg, ${NAVY} 0%, #12233A 70%, #0E1B2E 100%)`, padding: '52px 56px 64px', position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* Wordmark */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '48px' }}>
              <div style={{ background: AMBER, borderRadius: '3px', padding: '3px 7px', display: 'inline-flex', alignItems: 'center' }}>
                <span style={{ color: '#fff', fontWeight: 700, fontSize: '11px', fontFamily: FONT_BODY, letterSpacing: '1px' }}>AI</span>
              </div>
              <span style={{ color: 'rgba(255,255,255,0.88)', fontWeight: 600, fontSize: '14px', fontFamily: FONT_HEAD, letterSpacing: '0.5px' }}>Estates AI</span>
            </div>

            <p style={{ fontSize: '11px', letterSpacing: '3.5px', fontWeight: 600, color: '#D9A94F', margin: '0 0 18px', textTransform: 'uppercase', fontFamily: FONT_BODY }}>
              RIBA Stage 0–1 Feasibility Report
            </p>
            <h1 style={{ fontSize: '42px', fontWeight: 700, color: '#fff', margin: '0 0 18px', lineHeight: 1.18, fontFamily: FONT_HEAD, letterSpacing: '-0.2px' }}>
              {projectName}
            </h1>
            <div style={{ width: '56px', height: '3px', background: AMBER, margin: '0 0 28px' }} />
            <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#fff' }}>
              <span style={{ color: NAVY_LT }}>Date: </span>{dateStr}
              <span style={{ color: NAVY_LT, margin: '0 12px' }}>|</span>
              <span style={{ color: NAVY_LT }}>Confidence: </span>Grade {grade} — {confLabel}
              <span style={{ color: NAVY_LT, margin: '0 12px' }}>|</span>
              <span style={{ color: NAVY_LT }}>Cost Risk: </span>{riskLevel}
            </p>
            <p style={{ margin: '0 0 24px', fontSize: '13px', color: '#fff' }}>
              <span style={{ color: NAVY_LT }}>Total Cost Range: </span>
              <strong>{f1k(cost?.total?.low)} – {f1k(cost?.total?.high)}</strong>
              <span style={{ color: NAVY_LT }}> (excl. VAT)</span>
              <span style={{ color: NAVY_LT, margin: '0 12px' }}>|</span>
              <span style={{ color: NAVY_LT }}>Programme: </span>
              <strong>{programme?.totalWeeks} weeks</strong>
            </p>
            {/* Reference + bottom accent — pushed to the foot of the page in print/PDF */}
            <div className="cover-footer">
              {/* Project reference */}
              <p style={{ margin: '0 0 40px', fontSize: '10px', color: NAVY_LT, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                {reportId
                  ? `Ref: ${reportId.slice(0, 8).toUpperCase()}`
                  : 'Draft — not saved'}
              </p>
              {/* Bottom accent line */}
              <div style={{ height: '4px', background: AMBER, margin: '0 -56px' }} />
            </div>
          </div>

          {/* ══ CONTENT ══ */}
          <div style={{ padding: '32px 56px 48px' }}>

            {/* ── Info boxes ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '32px' }}>
              <InfoBox label="Total Project Cost Range"
                value={`${f1k(cost?.total?.low)} – ${f1k(cost?.total?.high)}`}
                note={`Excl. VAT  |  ${f1k(cost?.vat)} VAT at 20% (ref)`} />
              <InfoBox label="Programme"
                value={`${programme?.totalWeeks} weeks`}
                note={programme?.targetNote}
                noteColor={programme?.targetStatus === 'at-risk' ? '#C0392B' : '#2A7A4B'} />
              <InfoBox label="BCIS Region"
                value={cost?.bcisRegion || '—'}
                note={`Location factor: ${cost?.bcisFactor}`} />
            </div>

            {/* ── Section 1: Executive Summary ── */}
            <SecHdr number="1" title="Executive Summary" />
            <p style={bodyText}>{aiProse?.executiveSummary}</p>
            {aiProse?.keyFindings?.length > 0 && <>
              <SubHdr>Key Findings</SubHdr>
              <ol style={listStyle}>
                {aiProse.keyFindings.map((kf, i) => <li key={i} style={liStyle}>{kf}</li>)}
              </ol>
            </>}

            {/* ── Section 2: Scope of Works ── */}
            <SecHdr number="2" title="Scope of Works" />
            <SubHdr>Included Works</SubHdr>
            <ScopeText lineItems={cost?.lineItems} />

            <SubHdr>Exclusions</SubHdr>
            <p style={bodyText}>
              Loose furniture and fittings; IT and AV equipment (unless explicitly scoped); land acquisition, legal fees and stamp duty; VAT; asbestos removal beyond the risk allowance; party wall awards; unforeseen ground conditions.
            </p>

            <SubHdr>Scope Assumptions</SubHdr>
            {aiProse?.scopeAssumptions?.length > 0
              ? <ul style={listStyle}>{aiProse.scopeAssumptions.map((a, i) => <li key={i} style={liStyle}>{a}</li>)}</ul>
              : <p style={{ ...bodyText, fontStyle: 'italic', color: '#666' }}>Scope to be confirmed following completion of surveys and Stage 2 design.</p>
            }

            {/* ── Section 3: Risk Register ── */}
            <SecHdr number="3" title="Risk Register" pageBreak />
            {aiProse?.riskRegister?.length > 0
              ? <RiskTable risks={aiProse.riskRegister} />
              : <p style={{ ...bodyText, color: '#666' }}>No risk register data available.</p>
            }

            {/* ── Section 4: Programme ── */}
            <SecHdr number="4" title="High-Level Programme" pageBreak />
            <p style={{ ...bodyText, marginBottom: '8px' }}>
              <strong style={{ color: NAVY }}>Total programme:</strong> {programme?.totalWeeks} weeks
              <span style={{ color: GRAY, margin: '0 8px' }}>|</span>
              <strong style={{ color: NAVY }}>Procurement route:</strong> {programme?.procurementRoute}
            </p>
            {programme?.targetNote && (
              <p style={{ ...bodyText, fontWeight: 600, color: programme.targetStatus === 'at-risk' ? '#C0392B' : '#2A7A4B', marginBottom: '16px' }}>
                {programme.targetNote}
              </p>
            )}
            {programme?.stages?.length > 0 && (
              <ProgrammeTable stages={programme.stages} totalWeeks={programme.totalWeeks} />
            )}
            {programme?.milestones?.length > 0 && <>
              <SubHdr>Key Milestones</SubHdr>
              <ul style={listStyle}>{programme.milestones.map((m, i) => <li key={i} style={liStyle}>{m}</li>)}</ul>
              {programme?.stages?.length > 0 && (
                <GanttBar stages={programme.stages} totalWeeks={programme.totalWeeks} surveyWeeks={programme.surveyWeeks} />
              )}
            </>}
            {(programme?.assumptions || programme?.standardAssumptions)?.length > 0 && <>
              <SubHdr>Programme Assumptions</SubHdr>
              <ul style={listStyle}>
                {(programme.assumptions || programme.standardAssumptions).map((a, i) => <li key={i} style={liStyle}>{a}</li>)}
              </ul>
            </>}

            {/* ── Section 5: Cost Estimate (optional) ── */}
            {showCost && <><SecHdr number={snCost} title="Order of Cost Estimate (NRM1)" pageBreak />
            <p style={{ ...bodyText, fontSize: '13px', marginBottom: '12px' }}>
              <strong style={{ color: NAVY }}>GIFA:</strong> {cost?.gifa} m²
              <span style={{ color: GRAY, margin: '0 8px' }}>|</span>
              <strong style={{ color: NAVY }}>Region:</strong> {cost?.bcisRegion}
              <span style={{ color: GRAY, margin: '0 8px' }}>|</span>
              <strong style={{ color: NAVY }}>BCIS Factor:</strong> {cost?.bcisFactor}
              <span style={{ color: GRAY, margin: '0 8px' }}>|</span>
              <strong style={{ color: NAVY }}>Specification:</strong> {cost?.specLevel}
            </p>
            {aiProse?.costNarrative && <p style={{ ...bodyText, marginBottom: '20px' }}>{aiProse.costNarrative}</p>}

            <SubHdr>Estimate Basis</SubHdr>
            <ul style={listStyle}>
              {buildEstimateBasis(cost, programme, dateStr).map((b, i) => <li key={i} style={liStyle}>{b}</li>)}
            </ul>

            <div className="cost-works-table">
              <SubHdr>Section 1 — Works Cost</SubHdr>
              {cost?.lineItems?.length > 0
                ? <WorksTable lineItems={cost.lineItems} />
                : <p style={{ color: '#666', fontSize: '13px' }}>No line items available.</p>
              }
            </div>

            <div>
              <SubHdr>Section 2 — Construction Cost</SubHdr>
              <ConstructionTable cost={cost} />
            </div>

            <div>
              <SubHdr>Section 3 — Total Project Cost</SubHdr>
              <TotalCostTable cost={cost} />
            </div>

            <p style={{ fontWeight: 700, color: NAVY, margin: '12px 0 12px', fontSize: '14px' }}>
              Total Cost Range: {f1k(cost?.total?.low)} – {f1k(cost?.total?.high)} (excl. VAT)
              <span style={{ color: GRAY, margin: '0 10px' }}>|</span>
              Cost Risk: {riskLevel}
            </p>

            {budget && budget.status !== 'none' && (
              <p style={{ ...bodyText, margin: '0 0 20px', color: budget.status === 'insufficient' ? '#C0392B' : (budget.status === 'tight' ? '#92400E' : '#2A7A4B') }}>
                <strong style={{ color: NAVY }}>Budget check:</strong> {budget.note}
              </p>
            )}

            <SubHdr>Cost Assumptions</SubHdr>
            <ul style={listStyle}>
              {buildCostAssumptions(cost, answers).map((a, i) => <li key={i} style={liStyle}>{a}</li>)}
            </ul>

            <SubHdr>Cost Exclusions</SubHdr>
            <ul style={listStyle}>
              {costExclusions(cost).map((e, i) => <li key={i} style={liStyle}>{e}</li>)}
            </ul>

            {(cost?.excludedNoQuantity?.length > 0 || cost?.additionalScopeNote) && <>
              <SubHdr>Selected Items Not Costed</SubHdr>
              <ul style={listStyle}>
                {buildNotCosted(cost).map((e, i) => <li key={i} style={liStyle}>{e}</li>)}
              </ul>
            </>}
            </>}  {/* end showCost */}

            {/* ── Section 6: ROI (optional + data-conditional) ── */}
            {showROI && (
              <>
                <SecHdr number={snROI} title="ROI &amp; Financial Case" />
                <p style={{ ...bodyText, marginBottom: '12px' }}>
                  <strong style={{ color: NAVY }}>Benefit type:</strong> {Array.isArray(answers?.q5_1_financialBenefit) ? answers.q5_1_financialBenefit.join(' | ') : (answers?.q5_1_financialBenefit || '—')}
                  <span style={{ color: GRAY, margin: '0 8px' }}>|</span>
                  <strong style={{ color: NAVY }}>Annual benefit:</strong> {f(roi.annual)} per annum
                  <span style={{ color: GRAY, margin: '0 8px' }}>|</span>
                  <strong style={{ color: NAVY }}>Project cost (mid):</strong> {f1k(roi.mid)}
                  <span style={{ color: GRAY, margin: '0 8px' }}>|</span>
                  <strong style={{ color: NAVY }}>Simple payback:</strong> {roi.paybackYears} years
                </p>
                {aiProse?.roiNarrative && <p style={bodyText}>{aiProse.roiNarrative}</p>}
              </>
            )}

            {/* ── Section 7: Procurement (optional) ── */}
            {showProc && (
              <>
                <SecHdr number={snProc} title="Procurement Recommendation" />
                <p style={{ ...bodyText, marginBottom: '8px' }}>
                  <strong style={{ color: NAVY }}>Route:</strong> {aiProse?.procurementRoute}
                  <span style={{ color: GRAY, margin: '0 8px' }}>|</span>
                  <strong style={{ color: NAVY }}>Contract:</strong> {aiProse?.procurementContractForm}
                </p>
                <p style={{ ...bodyText, marginBottom: '16px' }}>
                  <strong style={{ color: NAVY }}>Design responsibility:</strong> {aiProse?.procurementDesignResp}
                  <span style={{ color: GRAY, margin: '0 8px' }}>|</span>
                  <strong style={{ color: NAVY }}>Tender type:</strong> {aiProse?.procurementTenderType}
                </p>
                <p style={{ ...bodyText, marginBottom: '16px' }}>{aiProse?.procurementNarrative}</p>
                {aiProse?.procurementConsiderations?.length > 0 && <>
                  <SubHdr>Commercial Considerations</SubHdr>
                  <ul style={listStyle}>
                    {aiProse.procurementConsiderations.map((c, i) => <li key={i} style={liStyle}>{c}</li>)}
                  </ul>
                </>}
                {aiProse?.procurementConflicts?.length > 0
                  ? <p style={{ color: '#C0392B', marginTop: '12px', fontSize: '13px' }}>
                      {aiProse.procurementConflicts.map(c => `⚠ ${c}`).join('  |  ')}
                    </p>
                  : <p style={{ color: '#666', marginTop: '12px', fontStyle: 'italic', fontSize: '13px' }}>No procurement conflicts identified.</p>
                }
              </>
            )}

            {/* ── Section 8: Constraints (optional + data-conditional) ── */}
            {showCon && aiProse?.constraints?.length > 0 && (
              <>
                <SecHdr number={snCon} title="Constraints Summary" />
                <ConstraintsTable constraints={aiProse.constraints} />
              </>
            )}

            {/* ── Section 9: Next Steps ── */}
            <SecHdr number={snNext} title="Recommendations &amp; Next Steps" />
            {aiProse?.nextSteps?.length > 0
              ? <ol style={listStyle}>{aiProse.nextSteps.map((s, i) => <li key={i} style={{ ...liStyle, marginBottom: '8px' }}>{s}</li>)}</ol>
              : <p style={bodyText}>Commission outstanding surveys and appoint design team to proceed to RIBA Stage 2.</p>
            }

            {/* ── Disclaimer ── */}
            <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: `1px solid ${BORDER}` }}>
              <p style={{ fontWeight: 700, color: NAVY, marginBottom: '8px', fontSize: '13px' }}>Disclaimer</p>
              <p style={{ fontStyle: 'italic', color: '#666', lineHeight: 1.7, fontSize: '12px' }}>
                This report has been produced at RIBA Stage 0–1 using benchmark cost and programme data from published industry sources (BCIS, RICS). All figures are indicative and subject to change following completion of surveys, design development, and competitive procurement. This report does not constitute a formal cost plan and should not be used as the basis for a financial commitment without review by a Chartered Quantity Surveyor. Programme durations are indicative and assume standard productivity and client decision-making within the gateway periods shown.
              </p>
              <p style={{ color: '#999', fontSize: '11px', marginTop: '10px' }}>
                Use of this tool is subject to our{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: NAVY, textDecoration: 'underline' }}>Terms of Use</a>
                {' '}and{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: NAVY, textDecoration: 'underline' }}>Privacy Notice</a>.
                Report generated by Estates AI — an indicative planning tool, not a substitute for professional advice.
              </p>
            </div>

            {/* ── Download CTA (screen only) ── */}
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
              {downloadError && <p style={{ color: '#C0392B', marginTop: '8px', fontSize: '12px' }}>{downloadError}</p>}
            </div>

          </div>
        </div>
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
  return (
    <div className="no-print" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(18,35,58,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', fontFamily: FONT_BODY }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: '440px', background: '#fff', borderRadius: '10px', boxShadow: '0 12px 40px rgba(0,0,0,0.28)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #12233A 100%)`, padding: '18px 22px' }}>
          <p style={{ margin: 0, color: '#fff', fontWeight: 700, fontSize: '16px', fontFamily: FONT_HEAD }}>Flag an issue</p>
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
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
              What kind of issue?
            </label>
            <select value={category} onChange={e => setCategory(e.target.value)} disabled={sending}
              style={{ width: '100%', padding: '9px 10px', fontSize: '13px', border: `1px solid ${BORDER}`, borderRadius: '6px', background: '#fff', color: '#333', fontFamily: FONT_BODY, marginBottom: '14px' }}>
              {FB_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
              Describe it
            </label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} disabled={sending}
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
const bodyText  = { color: '#333', lineHeight: 1.7, fontSize: '13px', margin: '0 0 12px' }
const listStyle = { paddingLeft: '20px', margin: '0 0 12px', display: 'flex', flexDirection: 'column', gap: '4px' }
const liStyle   = { color: '#333', lineHeight: 1.6, fontSize: '13px' }
const tblStyle  = { width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '0' }
const thStyle   = { padding: '9px 10px', color: '#fff', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', background: NAVY, whiteSpace: 'nowrap' }
const tdStyle   = { padding: '7px 10px', lineHeight: 1.5, verticalAlign: 'top', fontSize: '13px', color: '#333', wordBreak: 'break-word', overflowWrap: 'break-word' }

function btnStyle(variant, disabled = false) {
  const base = { padding: '8px 18px', border: '1px solid transparent', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1, fontFamily: 'var(--font-body)', lineHeight: 1 }
  if (variant === 'outline') return { ...base, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.22)', color: '#EAF0FA' }
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

function SecHdr({ number, title, pageBreak }) {
  return (
    <div className={['section-hdr', pageBreak ? 'page-break' : ''].filter(Boolean).join(' ')}
         style={{ borderLeft: `3px solid ${AMBER}`, padding: '2px 0 8px 16px', margin: '32px 0 16px', borderBottom: `1px solid ${BORDER}` }}>
      <p style={{ margin: '0 0 3px', fontSize: '10px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', color: GRAY }}>
        Section {number}
      </p>
      <h2 style={{ margin: 0, fontWeight: 700, color: NAVY, fontSize: '20px', fontFamily: FONT_HEAD, letterSpacing: '-0.1px', lineHeight: 1.25 }}>{title}</h2>
    </div>
  )
}

function SubHdr({ children }) {
  return <p style={{ fontWeight: 700, color: NAVY, fontSize: '13.5px', margin: '18px 0 6px', breakAfter: 'avoid' }}>{children}</p>
}

function InfoBox({ label, value, note, noteColor }) {
  return (
    <div style={{ background: ALT_ROW, border: `1px solid ${BORDER}`, borderTop: `2px solid ${NAVY}`, padding: '14px 16px' }}>
      <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 700, color: GRAY, margin: '0 0 6px' }}>{label}</p>
      <p style={{ fontSize: '17px', fontWeight: 700, color: NAVY, margin: '0 0 4px', fontFamily: FONT_HEAD }}>{value}</p>
      {note && <p style={{ fontSize: '11px', color: noteColor || '#666', margin: 0 }}>{note}</p>}
    </div>
  )
}

// ─── RAG badge ────────────────────────────────────────────────────────────────
function Rag({ val, filled = false }) {
  const bg      = { High: '#FEE2E2', Medium: '#FEF3C7', Low: '#DCFCE7' }
  const col     = { High: '#C0392B', Medium: '#92400E', Low: '#166534' }
  const solidBg = { High: '#C0392B', Medium: '#D97706', Low: '#70AD47' }
  const badgeBase = { display: 'inline-block', textAlign: 'center', whiteSpace: 'nowrap', minWidth: '54px', padding: '3px 8px', borderRadius: '3px', fontSize: '11px', fontWeight: 700 }
  if (filled) return <span style={{ ...badgeBase, color: '#fff', background: solidBg[val] || '#888' }}>{val}</span>
  return <span style={{ ...badgeBase, fontWeight: 600, background: bg[val] || '#F3F4F6', color: col[val] || '#374151' }}>{val}</span>
}

// ─── Scope text ───────────────────────────────────────────────────────────────
function ScopeText({ lineItems }) {
  if (!lineItems?.length) return <p style={{ ...bodyText, fontStyle: 'italic', color: '#666' }}>To be confirmed following completion of surveys and Stage 2 design.</p>
  const groups = {}
  for (const item of lineItems) {
    if (!groups[item.group]) groups[item.group] = []
    groups[item.group].push(item.description)
  }
  return (
    <div style={{ fontSize: '13px', marginBottom: '4px' }}>
      {Object.entries(groups).map(([grp, items]) => (
        <div key={grp} style={{ marginBottom: '10px' }}>
          <p style={{ fontWeight: 700, color: NAVY, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 4px' }}>
            {GROUP_NAMES[Number(grp)] || `Group ${grp}`}
          </p>
          <ul style={{ paddingLeft: '18px', margin: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {items.map((desc, i) => <li key={i} style={{ color: '#333' }}>{desc}</li>)}
          </ul>
        </div>
      ))}
    </div>
  )
}

// ─── Works cost table ─────────────────────────────────────────────────────────
function WorksTable({ lineItems }) {
  if (!lineItems?.length) return null
  const rows  = []
  let lastGrp = null, ri = 0
  const totalLow  = lineItems.reduce((s, i) => s + (i.lineLow  || 0), 0)
  const totalHigh = lineItems.reduce((s, i) => s + (i.lineHigh || 0), 0)

  for (const item of lineItems) {
    if (item.group !== lastGrp) {
      rows.push(
        <tr key={`g${item.group}`} style={{ background: '#2E4A6E' }}>
          <td colSpan={6} style={{ ...tdStyle, fontWeight: 700, fontSize: '11px', color: 'rgba(255,255,255,0.9)', textTransform: 'uppercase', letterSpacing: '0.3px', padding: '6px 10px' }}>
            {GROUP_NAMES[item.group] || `GROUP ${item.group}`}
          </td>
        </tr>
      )
      lastGrp = item.group
      ri = 0
    }
    const bg = ri % 2 === 0 ? ALT_ROW : '#fff'
    rows.push(
      <tr key={`r${item.group}_${ri}`} style={{ background: bg, borderBottom: `1px solid ${BORDER}` }}>
        <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '11px', color: '#5A6E88' }}>{item.code}</td>
        <td style={tdStyle}>{item.description}</td>
        <td style={{ ...tdStyle, textAlign: 'right' }}>{f(item.rateLow || 0)}</td>
        <td style={{ ...tdStyle, textAlign: 'right' }}>{f(item.rateHigh || 0)}</td>
        <td style={{ ...tdStyle, textAlign: 'right' }}>{f100(item.lineLow  || 0)}</td>
        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: NAVY }}>{f100(item.lineHigh || 0)}</td>
      </tr>
    )
    ri++
  }

  return (
    <>
      <div style={{ overflowX: 'auto', marginBottom: '4px' }}>
        <table style={tblStyle}>
          <thead>
            <tr>
              {[['Code', 'left'], ['Element', 'left'], ['Rate Low £/unit', 'right'], ['Rate High £/unit', 'right'], ['Total Low £', 'right'], ['Total High £', 'right']].map(([h, a]) => (
                <th key={h} style={{ ...thStyle, textAlign: a }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows}
            <tr style={{ background: NAVY }}>
              <td colSpan={4} style={{ ...tdStyle, fontWeight: 700, color: '#fff' }}>WORKS COST TOTAL</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#fff' }}>{f1k(totalLow)}</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#fff' }}>{f1k(totalHigh)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: '10px', color: '#888', margin: '4px 0 0', lineHeight: 1.5 }}>
        * Unit rates shown as a ±11% uncertainty range (low / high). Works cost totals are based on the mid rate. In accordance with NRM1, a Stage 0–1 order-of-cost estimate carries an inherent accuracy of ±15–25%. A formal cost plan should be prepared at RIBA Stage 2.
      </p>
    </>
  )
}

// ─── Construction cost table ──────────────────────────────────────────────────
function ConstructionTable({ cost }) {
  if (!cost) return null
  const p  = cost.percentages
  const wL = cost.works?.low  || 0
  const wH = cost.works?.high || 0
  const cL = cost.construction?.low  || 0
  const cH = cost.construction?.high || 0

  const rows = [
    ['Works Cost',                     '',                          wL,               wH,               false],
    [`Contractor's Preliminaries (A)`, `${pct(p.prelims)} of Works`, wL*p.prelims/100, wH*p.prelims/100, false],
    ['Overheads & Profit (B)',         `${pct(p.ohp)} of Works`,    wL*p.ohp/100,     wH*p.ohp/100,     false],
    ['CONSTRUCTION COST TOTAL',        '',                          cL,               cH,               true],
  ]

  return <CostTable4 rows={rows} />
}

// ─── Total project cost table ─────────────────────────────────────────────────
function TotalCostTable({ cost }) {
  if (!cost) return null
  const p  = cost.percentages
  const wL = cost.works?.low  || 0
  const wH = cost.works?.high || 0
  const cL = cost.construction?.low  || 0
  const cH = cost.construction?.high || 0
  const tL = cost.total?.low  || 0
  const tH = cost.total?.high || 0

  const rows = [
    ['Construction Cost',                '',                              cL,            cH,            false, false],
    ['Professional Fees (C)',            `${pct(p.fees)} of Construction`,cL*p.fees/100, cH*p.fees/100, false, false],
  ]
  if ((cost.breakdown?.devCosts || 0) > 0)
    rows.push(['Developer & Project Costs (D)', `${pct(p.devCosts)} of Construction`, cL*p.devCosts/100, cH*p.devCosts/100, false, false])
  rows.push(
    ['Risk Allowance (E)',       `${pct(p.risk)} of Works`,      wL*p.risk/100,      wH*p.risk/100,      false, false],
    ['Client Contingency (H)',   `${pct(p.contingency)} of Works`, wL*p.contingency/100, wH*p.contingency/100, false, false],
  )
  // Inflation is negligible on short programmes — only show the row when it rounds to a non-zero figure.
  if (Math.round((wH*p.inflation/100)/1000) > 0 || Math.round((wL*p.inflation/100)/1000) > 0)
    rows.push(['Inflation Allowance (F)', `${pct(p.inflation)} of Works`, wL*p.inflation/100, wH*p.inflation/100, false, false])
  rows.push(
    ['TOTAL PROJECT COST (excl. VAT)', '',                       tL,                 tH,                 true,  false],
    ['VAT @ 20% (reference — recoverability to be confirmed)', '20%', tL*0.20,       tH*0.20,            false, true ],
  )

  return <CostTable4 rows={rows} />
}

// ─── Shared 4-column cost table ───────────────────────────────────────────────
function CostTable4({ rows }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: '8px' }}>
      <table style={tblStyle}>
        <thead>
          <tr>
            {[['Item', 'left'], ['Rate', 'left'], ['Low £', 'right'], ['High £', 'right']].map(([h, a]) => (
              <th key={h} style={{ ...thStyle, textAlign: a }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([item, rate, low, high, isTotal, isVat], i) => (
            <tr key={i} style={{ background: isTotal ? NAVY : i % 2 === 0 ? ALT_ROW : '#fff', borderBottom: `1px solid ${BORDER}`, fontStyle: isVat ? 'italic' : 'normal' }}>
              <td style={{ ...tdStyle, fontWeight: isTotal ? 700 : 400, color: isTotal ? '#fff' : '#333' }}>{item}</td>
              <td style={{ ...tdStyle, color: isTotal ? '#ccc' : '#666' }}>{rate}</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: isTotal ? 700 : 400, color: isTotal ? '#fff' : '#333' }}>{f1k(low)}</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: isTotal ? 700 : 400, color: isTotal ? '#fff' : '#333' }}>{f1k(high)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Programme table ──────────────────────────────────────────────────────────
function ProgrammeTable({ stages, totalWeeks }) {
  const hasParallel = stages.some(s => s.parallel)
  return (
    <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
      <table style={tblStyle}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: 'left' }}>Stage</th>
            <th style={{ ...thStyle, textAlign: 'left' }}>Activity</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Weeks</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((s, i) => {
            const wks = s.weeks ?? s.durationWks ?? 0
            return (
              <tr key={i} style={{ background: i % 2 === 0 ? ALT_ROW : '#fff', borderBottom: `1px solid ${BORDER}` }}>
                <td style={{ ...tdStyle, fontWeight: 600, color: NAVY, whiteSpace: 'nowrap' }}>{s.stage}</td>
                <td style={tdStyle}>{s.activity}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: s.parallel ? GRAY : NAVY }}>{s.parallel ? `(${wks}) ∥` : wks}</td>
              </tr>
            )
          })}
          <tr style={{ background: NAVY }}>
            <td colSpan={2} style={{ ...tdStyle, fontWeight: 700, color: '#fff' }}>TOTAL</td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#fff' }}>{totalWeeks}</td>
          </tr>
        </tbody>
      </table>
      {hasParallel && (
        <p style={{ fontSize: '11px', color: GRAY, fontStyle: 'italic', margin: '4px 0 0' }}>
          ∥ Parallel activity — runs concurrently with the design stages and is excluded from the programme total.
        </p>
      )}
    </div>
  )
}

// ─── Indicative programme Gantt bar ──────────────────────────────────────────
// Surveys are excluded from the main bar and shown as a thin parallel track above,
// aligned to week 0 — reflecting that they run concurrently with Stage 2–3 design.
const GANTT_MAP = [
  { key: 'Tender',            test: s => /tender|procurement/i.test(s), color: '#5B7BA6' },
  { key: 'Construction',      test: s => /construction|phase/i.test(s), color: '#1A2E4A' },
  { key: 'Handover',          test: s => /handover/i.test(s),           color: '#4A5568' },
  { key: 'Governance',        test: s => /governance/i.test(s),         color: '#7B5113' },
  { key: 'Design & Approvals',test: () => true,                         color: '#3E5C84' },
]

function GanttBar({ stages, totalWeeks, surveyWeeks }) {
  if (!stages?.length || !totalWeeks) return null

  const sw = surveyWeeks || 0

  // Exclude every parallel activity (surveys, planning, building control) from the
  // main bar — they run concurrently and are excluded from the total, so stacking
  // them here would overflow the bar past totalWeeks. Surveys are shown in the
  // separate track above; the sequential "— wait" overrun rows are NOT parallel.
  const mainStages = stages.filter(s => !s.parallel)

  // Merge consecutive same-category main stages into buckets
  const buckets = []
  for (const s of mainStages) {
    const wks = s.weeks ?? s.durationWks ?? 0
    if (!wks) continue
    const cat  = GANTT_MAP.find(m => m.test(s.stage))
    const last = buckets[buckets.length - 1]
    if (last && last.key === cat.key) {
      last.weeks += wks
    } else {
      buckets.push({ key: cat.key, color: cat.color, weeks: wks })
    }
  }
  if (!buckets.length) return null

  const surveyPct = sw > 0 ? Math.min((sw / totalWeeks) * 100, 100) : 0

  return (
    <div className="avoid-break" style={{ margin: '14px 0 16px' }}>
      <p style={{ fontWeight: 600, fontSize: '11px', color: GRAY, textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 5px' }}>
        Indicative Programme Overview
      </p>

      {/* ── Survey parallel track (thin bar, starts at week 0 alongside Design) ── */}
      {sw > 0 && (
        <div style={{ marginBottom: '3px', height: '14px', position: 'relative' }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${surveyPct}%`,
            background: '#70AD47', borderRadius: '2px',
            display: 'flex', alignItems: 'center', overflow: 'hidden',
          }}>
            {surveyPct > 7 && (
              <span style={{ color: '#fff', fontSize: '8px', fontWeight: 700, padding: '0 5px', whiteSpace: 'nowrap' }}>
                Surveys ({sw}w)
              </span>
            )}
          </div>
          {/* Dotted line extending across the rest — signals these weeks are absorbed in design */}
          <div style={{
            position: 'absolute', left: `${surveyPct}%`, right: 0, top: '50%',
            borderTop: '1px dashed #C0CCD8', transform: 'translateY(-50%)',
          }} />
        </div>
      )}

      {/* ── Main programme bar ── */}
      <div style={{ display: 'flex', height: '24px', borderRadius: '3px', overflow: 'hidden', border: `1px solid ${BORDER}`, maxWidth: '100%' }}>
        {buckets.map((b, i) => {
          const pct = (b.weeks / totalWeeks) * 100
          return (
            <div key={i} style={{
              width: `${pct}%`,
              background: b.color,
              borderRight: i < buckets.length - 1 ? '1px solid rgba(255,255,255,0.35)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', flexShrink: 0,
            }}>
              {pct > 10 && (
                <span style={{ color: '#fff', fontSize: '9px', fontWeight: 700, whiteSpace: 'nowrap', padding: '0 3px', letterSpacing: '0.2px' }}>
                  {b.key}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Week counts centred under each segment */}
      <div style={{ display: 'flex', marginTop: '3px' }}>
        {buckets.map((b, i) => {
          const pct = (b.weeks / totalWeeks) * 100
          return (
            <div key={i} style={{ width: `${pct}%`, textAlign: 'center', fontSize: '9px', color: '#666', overflow: 'hidden', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {pct > 4 ? `${b.weeks}w` : ''}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: '8px' }}>
        {sw > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '9px', height: '9px', borderRadius: '1px', background: '#70AD47', flexShrink: 0 }} />
            <span style={{ fontSize: '10px', color: '#444' }}>Pre-Design Surveys — {sw}w (concurrent)</span>
          </div>
        )}
        {buckets.map((b, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '9px', height: '9px', borderRadius: '1px', background: b.color, flexShrink: 0 }} />
            <span style={{ fontSize: '10px', color: '#444' }}>{b.key} — {b.weeks}w</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Risk register table ──────────────────────────────────────────────────────
function RiskTable({ risks }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: '8px' }}>
      <table style={{ ...tblStyle, tableLayout: 'fixed', minWidth: '500px' }}>
        <colgroup>
          <col style={{ width: '50px' }} />
          <col style={{ width: '100px' }} />
          <col />
          <col style={{ width: '82px' }} />
          <col />
        </colgroup>
        <thead>
          <tr>
            {['Ref', 'Category', 'Description', 'Rating', 'Mitigation'].map(h => (
              <th key={h} style={{ ...thStyle, textAlign: 'left' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {risks.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? ALT_ROW : '#fff', borderBottom: `1px solid ${BORDER}` }}>
              <td style={{ ...tdStyle, fontWeight: 700, color: NAVY, fontFamily: 'monospace' }}>{r.ref}</td>
              <td style={tdStyle}>{r.category}</td>
              <td style={tdStyle}>{r.description}</td>
              <td style={{ ...tdStyle, textAlign: 'center' }}><Rag val={r.rating} filled /></td>
              <td style={tdStyle}>{r.mitigation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Constraints table ────────────────────────────────────────────────────────
function ConstraintsTable({ constraints }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: '8px' }}>
      <table style={tblStyle}>
        <thead>
          <tr>
            {['Category', 'Constraint', 'Impact'].map(h => (
              <th key={h} style={{ ...thStyle, textAlign: 'left' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {constraints.map((c, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? ALT_ROW : '#fff', borderBottom: `1px solid ${BORDER}` }}>
              <td style={{ ...tdStyle, fontWeight: 600, color: NAVY, whiteSpace: 'nowrap' }}>{c.category}</td>
              <td style={{ ...tdStyle, fontWeight: 600, color: '#333' }}>{c.title}</td>
              <td style={tdStyle}>{c.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Data builders ────────────────────────────────────────────────────────────
function calcRoi(answers, cost) {
  const annual = Number(answers?.q5_2_annualBenefit) || 0
  const low    = cost?.total?.low || 0
  const high   = cost?.total?.high || 0
  if (!annual || !low || !high) return null
  // Mid-point of the published cost range, so the figure shown here is consistent
  // with the headline range rather than the separately-rounded model mid.
  const mid = Math.round(((low + high) / 2) / 1000) * 1000
  return { annual, mid, paybackYears: Math.round((mid / annual) * 10) / 10 }
}

// Mirrors estimateBasisParas in lib/reportBuilder.js — keep the two in sync.
function buildEstimateBasis(cost, programme, dateStr) {
  if (!cost) return []
  const sources = [cost.workbookVersion, programme?.workbookVersion].filter(Boolean).join(' and ')
  return [
    `This is an NRM1 order of cost estimate prepared at RIBA Stage 0–1 from benchmark rates, not measured quantities. At this stage outturn costs typically vary by ±20–25% as the design develops; the range shown reflects benchmark rate uncertainty only.`,
    `Data sources: ${sources || 'Estates AI rates and programme workbooks'}. Report generated ${dateStr}; rates are current at the workbook issue date.`,
    `Location adjustment: BCIS factor ${cost.bcisFactor} (${cost.bcisRegion})${cost.bcisDefaulted ? ' — applied as a default because the postcode matched no BCIS region; verify the postcode before relying on location-adjusted rates' : ''}.`,
    `Inflation allowance (F) at ${cost.percentages?.inflation}% covers forecast tender and construction inflation over the ${programme?.totalWeeks ?? '—'}-week programme, measured from the estimate base date (the date of generation).`,
  ]
}

// Mirrors notCostedParas in lib/reportBuilder.js — keep the two in sync.
function buildNotCosted(cost) {
  if (!cost) return []
  return [
    ...(cost.excludedNoQuantity || []).map(e =>
      `${e.description} — selected in scope but excluded from the estimate pending a confirmed quantity.`),
    ...(cost.additionalScopeNote ? [cost.additionalScopeNote] : []),
  ]
}

function buildCostAssumptions(cost, answers) {
  if (!cost) return []
  return [
    `All rates are at Q2 2026 national mean (BCIS/RICS). BCIS location factor ${cost.bcisFactor} applied for ${cost.bcisRegion}.`,
    `GIFA of ${cost.gifa} m² used as the pricing quantity. Rates are £/m² unless stated.`,
    `Band position factor of ${cost.bandFactor} applied (${cost.interventionLevel}).`,
    `Professional fees at ${cost.percentages?.fees}% reflect the project being at RIBA Stage ${answers?.q4_5_designStage || '0–1'}.`,
    `Contingency fixed at 5% (RIBA Stage 0–1 standard). Survey uncertainty is captured in Risk Allowance (E).`,
    `VAT at 20% is shown for reference only. Recoverability to be confirmed by the client's Finance team.`,
    `This estimate has not been prepared from measured quantities. A formal cost plan by a Chartered Quantity Surveyor is required before any financial commitment.`,
  ]
}

const COST_EXCLUSIONS = [
  'VAT (unless stated above)',
  'Loose furniture, fittings and equipment (FF&E)',
  'IT and AV equipment (unless explicitly included in scope)',
  'Land acquisition, legal fees, and stamp duty',
  'Party wall awards and neighbourly matters',
  'Archaeological investigation',
  'Asbestos removal beyond the survey allowance in Risk Allowance (E)',
  'Costs arising from unforeseen ground conditions beyond the risk allowance',
]

// Groundworks-related caveats only apply where there is facilitating, substructure
// or external-works scope — drop them for pure internal refurbishments.
function costExclusions(cost) {
  const groups = new Set((cost?.lineItems || []).map(i => i.group))
  const hasGroundworks = groups.has(0) || groups.has(1) || groups.has(8)
  return COST_EXCLUSIONS.filter(e =>
    hasGroundworks || !/archaeolog|ground conditions/i.test(e))
}
