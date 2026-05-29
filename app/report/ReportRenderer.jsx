'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { track } from '@vercel/analytics'

// ─── Formatters ───────────────────────────────────────────────────────────────
const f1k = n  => `£${(Math.round((n || 0) / 1000) * 1000).toLocaleString('en-GB')}`
const f   = n  => `£${Math.round(n || 0).toLocaleString('en-GB')}`
const pct = n  => `${Math.round((n || 0) * 10) / 10}%`

// ─── Colours ─────────────────────────────────────────────────────────────────
const NAVY    = '#1A2E4A'
const NAVY_LT = '#9FB3CC'
const GRAY    = '#9AA3AD'
const ALT_ROW = '#F0F2F4'
const BORDER  = '#CCCCCC'

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
  const [downloading, setDownloading]   = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const [copied, setCopied]             = useState(false)

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

  function downloadPdf() {
    track('pdf_downloaded', { reportId: reportId || 'unsaved' })
    window.print()
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

  const { cost, programme, aiProse, projectName, generatedAt, templateError, answers } = data
  const grade      = aiProse?.confidenceScore  || 'B'
  const confLabel  = aiProse?.confidenceLabel  || 'Moderate Confidence'
  const riskLevel  = cost?.percentages?.riskLevel || 'Medium'
  const roi        = calcRoi(answers, cost)

  const dateStr = generatedAt
    ? new Date(generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <>
      {/* ── Print rules ── */}
      <style>{`
        /* Page setup — removes browser date/title headers; sets professional margins.
           @page :first gives the cover full-bleed (no white margins).
           Interior pages get 15mm top margin where the running header sits. */
        @page          { size: A4; margin: 15mm 18mm 18mm; }
        @page :first   { margin: 0; }

        @media print {
          .no-print    { display: none !important; }
          body         { margin: 0; background: white !important; }
          *            { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

          /* Remove screen chrome from outer wrappers */
          .report-outer { background: white !important; padding: 0 !important; min-height: unset !important; }
          .report-inner { box-shadow: none !important; max-width: 100% !important; }

          /* Page-break rules */
          .page-break  { break-before: page !important; }
          .section-hdr { break-after: avoid !important; }
          table        { break-inside: avoid !important; }
          tr           { break-inside: avoid !important; }
          .avoid-break { break-inside: avoid !important; }

          /* Running header — fixed at top of every page.
             On page 1 it sits behind the full-bleed navy cover (zIndex: 1 on cover div).
             On pages 2+ it occupies the 15mm top margin created by @page. */
          .print-running-hdr {
            display: flex !important;
            position: fixed;
            top: 0; left: 0; right: 0;
            height: 15mm;
            padding: 0 18mm;
            align-items: center;
            justify-content: space-between;
            background: white;
            border-bottom: 2px solid #2E75B6;
            font-size: 8.5pt;
            font-family: Arial, sans-serif;
            color: #444;
            z-index: 0;
          }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ── Toolbar (screen only) ── */}
      <div className="no-print" style={{ position: 'sticky', top: 0, zIndex: 20, background: NAVY, borderBottom: '1px solid #12233a', padding: '8px 16px' }}>
        <div style={{ maxWidth: '880px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '14px', fontFamily: 'Arial, sans-serif' }}>
            Estates AI — Report Preview
          </span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => router.push('/questionnaire')}
              style={btnStyle('outline')}>
              ← New Report
            </button>
            {reportId && (
              <button onClick={copyLink}
                style={btnStyle(copied ? 'copied' : 'link')}>
                {copied ? '✓ Copied!' : '🔗 Copy Link'}
              </button>
            )}
            <button onClick={downloadPdf}
              style={btnStyle('gray')}>
              ⬇ Download PDF
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
      <div className="report-outer" style={{ background: '#E8EAF0', minHeight: '100vh', padding: '24px 16px 48px', fontFamily: 'Arial, sans-serif' }}>
        <div className="report-inner" style={{ maxWidth: '880px', margin: '0 auto', background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>

          {/* ══ COVER ══ */}
          <div style={{ background: NAVY, padding: '48px 56px 0', position: 'relative', zIndex: 1 }}>
            {/* Wordmark */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '36px' }}>
              <div style={{ background: '#2E75B6', borderRadius: '3px', padding: '3px 7px', display: 'inline-flex', alignItems: 'center' }}>
                <span style={{ color: '#fff', fontWeight: 900, fontSize: '11px', fontFamily: 'Arial, sans-serif', letterSpacing: '1px' }}>AI</span>
              </div>
              <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700, fontSize: '13px', fontFamily: 'Arial, sans-serif', letterSpacing: '0.5px' }}>Estates AI</span>
            </div>

            <p style={{ fontSize: '11px', letterSpacing: '3px', fontWeight: 700, color: NAVY_LT, margin: '0 0 16px', textTransform: 'uppercase' }}>
              RIBA Stage 0–1 Feasibility Report
            </p>
            <h1 style={{ fontSize: '32px', fontWeight: 700, color: '#fff', margin: '0 0 24px', lineHeight: 1.2 }}>
              {projectName}
            </h1>
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
            {/* Project reference */}
            <p style={{ margin: '0 0 40px', fontSize: '10px', color: NAVY_LT, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              {reportId
                ? `Ref: ${reportId.slice(0, 8).toUpperCase()}`
                : 'Draft — not saved'}
            </p>
            {/* Bottom accent line */}
            <div style={{ height: '4px', background: '#2E75B6', margin: '0 -56px' }} />
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
                <GanttBar stages={programme.stages} totalWeeks={programme.totalWeeks} />
              )}
            </>}
            {(programme?.assumptions || programme?.standardAssumptions)?.length > 0 && <>
              <SubHdr>Programme Assumptions</SubHdr>
              <ul style={listStyle}>
                {(programme.assumptions || programme.standardAssumptions).map((a, i) => <li key={i} style={liStyle}>{a}</li>)}
              </ul>
            </>}

            {/* ── Section 5: Cost Estimate ── */}
            <SecHdr number="5" title="Order of Cost Estimate (NRM1)" pageBreak />
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

            <div className="avoid-break">
              <SubHdr>Section 1 — Works Cost</SubHdr>
              {cost?.lineItems?.length > 0
                ? <WorksTable lineItems={cost.lineItems} />
                : <p style={{ color: '#666', fontSize: '13px' }}>No line items available.</p>
              }
            </div>

            <div className="avoid-break">
              <SubHdr>Section 2 — Construction Cost</SubHdr>
              <ConstructionTable cost={cost} />
            </div>

            <div className="avoid-break">
              <SubHdr>Section 3 — Total Project Cost</SubHdr>
              <TotalCostTable cost={cost} />
            </div>

            <p style={{ fontWeight: 700, color: NAVY, margin: '12px 0 20px', fontSize: '14px' }}>
              Total Cost Range: {f1k(cost?.total?.low)} – {f1k(cost?.total?.high)} (excl. VAT)
              <span style={{ color: GRAY, margin: '0 10px' }}>|</span>
              Cost Risk: {riskLevel}
            </p>

            <SubHdr>Cost Assumptions</SubHdr>
            <ul style={listStyle}>
              {buildCostAssumptions(cost, answers).map((a, i) => <li key={i} style={liStyle}>{a}</li>)}
            </ul>

            <SubHdr>Cost Exclusions</SubHdr>
            <ul style={listStyle}>
              {COST_EXCLUSIONS.map((e, i) => <li key={i} style={liStyle}>{e}</li>)}
            </ul>

            {/* ── Section 6: ROI ── */}
            {roi && (
              <>
                <SecHdr number="6" title="ROI &amp; Financial Case" />
                <p style={{ ...bodyText, marginBottom: '12px' }}>
                  <strong style={{ color: NAVY }}>Benefit type:</strong> {answers?.q5_1_financialBenefit || '—'}
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

            {/* ── Section 7: Procurement ── */}
            {aiProse?.procurementNarrative && (
              <>
                <SecHdr number="7" title="Procurement Recommendation" />
                <p style={{ ...bodyText, marginBottom: '8px' }}>
                  <strong style={{ color: NAVY }}>Route:</strong> {aiProse.procurementRoute}
                  <span style={{ color: GRAY, margin: '0 8px' }}>|</span>
                  <strong style={{ color: NAVY }}>Contract:</strong> {aiProse.procurementContractForm}
                </p>
                <p style={{ ...bodyText, marginBottom: '16px' }}>
                  <strong style={{ color: NAVY }}>Design responsibility:</strong> {aiProse.procurementDesignResp}
                  <span style={{ color: GRAY, margin: '0 8px' }}>|</span>
                  <strong style={{ color: NAVY }}>Tender type:</strong> {aiProse.procurementTenderType}
                </p>
                <p style={{ ...bodyText, marginBottom: '16px' }}>{aiProse.procurementNarrative}</p>
                {aiProse.procurementConsiderations?.length > 0 && <>
                  <SubHdr>Commercial Considerations</SubHdr>
                  <ul style={listStyle}>
                    {aiProse.procurementConsiderations.map((c, i) => <li key={i} style={liStyle}>{c}</li>)}
                  </ul>
                </>}
                {aiProse.procurementConflicts?.length > 0
                  ? <p style={{ color: '#C0392B', marginTop: '12px', fontSize: '13px' }}>
                      {aiProse.procurementConflicts.map(c => `⚠ ${c}`).join('  |  ')}
                    </p>
                  : <p style={{ color: '#666', marginTop: '12px', fontStyle: 'italic', fontSize: '13px' }}>No procurement conflicts identified.</p>
                }
              </>
            )}

            {/* ── Section 8: Constraints ── */}
            {aiProse?.constraints?.length > 0 && (
              <>
                <SecHdr number="8" title="Constraints Summary" />
                <ConstraintsTable constraints={aiProse.constraints} />
              </>
            )}

            {/* ── Section 9: Next Steps ── */}
            <SecHdr number="9" title="Recommendations &amp; Next Steps" />
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
                <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#2E75B6', textDecoration: 'underline' }}>Terms of Use</a>
                {' '}and{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#2E75B6', textDecoration: 'underline' }}>Privacy Notice</a>.
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
                <button onClick={downloadPdf}
                  style={btnStyle('gray')}>
                  ⬇ Download PDF
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
    </>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const bodyText  = { color: '#333', lineHeight: 1.7, fontSize: '13px', margin: '0 0 12px' }
const listStyle = { paddingLeft: '20px', margin: '0 0 12px', display: 'flex', flexDirection: 'column', gap: '4px' }
const liStyle   = { color: '#333', lineHeight: 1.6, fontSize: '13px' }
const tblStyle  = { width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '0' }
const thStyle   = { padding: '8px 10px', color: '#fff', fontWeight: 600, fontSize: '12px', background: NAVY, whiteSpace: 'nowrap' }
const tdStyle   = { padding: '7px 10px', lineHeight: 1.5, verticalAlign: 'top', fontSize: '13px' }

function btnStyle(variant, disabled = false) {
  const base = { padding: '7px 18px', border: 'none', borderRadius: '4px', fontWeight: 700, fontSize: '13px', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.7 : 1, fontFamily: 'Arial, sans-serif' }
  if (variant === 'outline') return { ...base, background: 'transparent', border: '1px solid rgba(255,255,255,0.5)', color: '#fff' }
  if (variant === 'gray')    return { ...base, background: '#4A5568', color: '#fff' }
  if (variant === 'green')   return { ...base, background: '#2A7A4B', color: '#fff' }
  if (variant === 'link')    return { ...base, background: '#2E75B6', color: '#fff' }
  if (variant === 'copied')  return { ...base, background: '#2A7A4B', color: '#fff' }
  return base
}

function alertStyle(bg, borderColor) {
  return { margin: '12px 0', padding: '10px 16px', background: bg, border: `1px solid ${borderColor}`, borderRadius: '4px' }
}

// ─── Helper components ────────────────────────────────────────────────────────

function SecHdr({ number, title, pageBreak }) {
  return (
    <div className={['section-hdr', pageBreak ? 'page-break' : ''].filter(Boolean).join(' ')}
         style={{ display: 'flex', alignItems: 'stretch', margin: '28px 0 14px' }}>
      <div style={{ width: '36px', minHeight: '36px', background: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '14px' }}>{number}</span>
      </div>
      <div style={{ flex: 1, paddingLeft: '12px', borderBottom: `3px solid ${NAVY}`, display: 'flex', alignItems: 'center', paddingBottom: '4px' }}>
        <span style={{ fontWeight: 700, color: NAVY, fontSize: '15px' }} dangerouslySetInnerHTML={{ __html: title }} />
      </div>
    </div>
  )
}

function SubHdr({ children }) {
  return <p style={{ fontWeight: 700, color: NAVY, fontSize: '13px', margin: '16px 0 6px' }}>{children}</p>
}

function InfoBox({ label, value, note, noteColor }) {
  return (
    <div style={{ background: ALT_ROW, border: `1px solid ${BORDER}`, padding: '14px 16px' }}>
      <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 700, color: GRAY, margin: '0 0 6px' }}>{label}</p>
      <p style={{ fontSize: '16px', fontWeight: 700, color: NAVY, margin: '0 0 4px' }}>{value}</p>
      {note && <p style={{ fontSize: '11px', color: noteColor || '#666', margin: 0 }}>{note}</p>}
    </div>
  )
}

// ─── RAG badge ────────────────────────────────────────────────────────────────
function Rag({ val, filled = false }) {
  const bg      = { High: '#FEE2E2', Medium: '#FEF9C3', Low: '#DCFCE7' }
  const col     = { High: '#C0392B', Medium: '#92400E', Low: '#166534' }
  const solidBg = { High: '#C0392B', Medium: '#ED7D31', Low: '#70AD47' }
  if (filled) return <span style={{ padding: '2px 7px', borderRadius: '3px', fontSize: '11px', fontWeight: 700, color: '#fff', background: solidBg[val] || '#888' }}>{val}</span>
  return <span style={{ padding: '2px 7px', borderRadius: '3px', fontSize: '11px', background: bg[val] || '#F3F4F6', color: col[val] || '#374151' }}>{val}</span>
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
        <tr key={`g${item.group}`} style={{ background: '#2E4D7B' }}>
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
        <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '11px', color: '#2E75B6' }}>{item.code}</td>
        <td style={tdStyle}>{item.description}</td>
        <td style={{ ...tdStyle, textAlign: 'right' }}>{f(item.rateLow || 0)}</td>
        <td style={{ ...tdStyle, textAlign: 'right' }}>{f(item.rateHigh || 0)}</td>
        <td style={{ ...tdStyle, textAlign: 'right' }}>{f1k(item.lineLow  || 0)}</td>
        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: NAVY }}>{f1k(item.lineHigh || 0)}</td>
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
    ['Client Contingency (H)',   '5% of Works',                  wL*0.05,            wH*0.05,            false, false],
    ['Inflation Allowance (F)',  `${pct(p.inflation)} of Works`, wL*p.inflation/100, wH*p.inflation/100, false, false],
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
          {stages.map((s, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? ALT_ROW : '#fff', borderBottom: `1px solid ${BORDER}` }}>
              <td style={{ ...tdStyle, fontWeight: 600, color: NAVY, whiteSpace: 'nowrap' }}>{s.stage}</td>
              <td style={tdStyle}>{s.activity}</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: NAVY }}>{s.weeks ?? s.durationWks}</td>
            </tr>
          ))}
          <tr style={{ background: NAVY }}>
            <td colSpan={2} style={{ ...tdStyle, fontWeight: 700, color: '#fff' }}>TOTAL</td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#fff' }}>{totalWeeks}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ─── Indicative programme Gantt bar ──────────────────────────────────────────
// Simplified 5-bucket grouping so Planning/BC stages merge into Design & Approvals,
// giving a clean proportional bar: Pre-Design → Design & Approvals → Tender → Construction → H/O
const GANTT_MAP = [
  { key: 'Pre-Design',        test: s => /survey|ground investigation/i.test(s), color: '#70AD47' },
  { key: 'Tender',            test: s => /tender|procurement/i.test(s),          color: '#4472C4' },
  { key: 'Construction',      test: s => /construction|phase/i.test(s),          color: '#1A2E4A' },
  { key: 'Handover',          test: s => /handover/i.test(s),                    color: '#4A5568' },
  { key: 'Governance',        test: s => /governance/i.test(s),                  color: '#7B3F00' },
  { key: 'Design & Approvals',test: () => true,                                  color: '#2E75B6' },
]

function GanttBar({ stages, totalWeeks }) {
  if (!stages?.length || !totalWeeks) return null

  // Merge consecutive same-category stages into buckets
  const buckets = []
  for (const s of stages) {
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

  return (
    <div className="avoid-break" style={{ margin: '14px 0 16px' }}>
      <p style={{ fontWeight: 600, fontSize: '11px', color: GRAY, textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 6px' }}>
        Indicative Programme Overview
      </p>
      {/* Single-row proportional bar */}
      <div style={{ display: 'flex', height: '24px', borderRadius: '3px', overflow: 'hidden', border: `1px solid ${BORDER}` }}>
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
      {/* Legend — always shows all segments including narrow ones */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: '8px' }}>
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
      <table style={tblStyle}>
        <thead>
          <tr>
            {['Ref', 'Category', 'Description', 'L', 'I', 'Rating', 'Mitigation'].map(h => (
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
              <td style={{ ...tdStyle, textAlign: 'center' }}><Rag val={r.likelihood} /></td>
              <td style={{ ...tdStyle, textAlign: 'center' }}><Rag val={r.impact} /></td>
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
  const mid    = cost?.total?.mid || 0
  if (!annual || !mid) return null
  return { annual, mid, paybackYears: Math.round((mid / annual) * 10) / 10 }
}

function buildCostAssumptions(cost, answers) {
  if (!cost) return []
  return [
    `All rates are at Q2 2026 national mean (BCIS/RICS). BCIS location factor ${cost.bcisFactor} applied for ${cost.bcisRegion}.`,
    `GIFA of ${cost.gifa} m² used as the pricing quantity. Rates are £/m² unless stated.`,
    `Band position factor of ${cost.bandFactor} applied (${cost.interventionLevel}).`,
    `Professional fees at ${cost.percentages?.fees}% reflect the project being at RIBA Stage ${answers?.q4_6_designStage || '0–1'}.`,
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
