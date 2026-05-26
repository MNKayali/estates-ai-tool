'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const f1k = n => `£${(Math.round((n || 0) / 1000) * 1000).toLocaleString('en-GB')}`
const f   = n => `£${Math.round(n || 0).toLocaleString('en-GB')}`
const pct = n => `${Math.round((n || 0) * 10) / 10}%`

export default function ReportPage() {
  const router = useRouter()
  const [data, setData] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('estatesAI_result')
      if (!stored) { router.push('/questionnaire'); return }
      const result = JSON.parse(stored)
      // Also load questionnaire answers for ROI labels and cost assumption text
      const answersRaw = localStorage.getItem('estatesAI_v4_answers')
      const answers = answersRaw ? JSON.parse(answersRaw) : {}
      setData({ ...result, answers })
    } catch {
      router.push('/questionnaire')
    }
  }, [router])

  function downloadDocx() {
    if (!data?.docx) {
      setDownloadError('Word document is not available. The Word template may not yet be uploaded to GitHub.')
      return
    }
    setDownloading(true)
    setDownloadError('')
    try {
      const bytes = Uint8Array.from(atob(data.docx), c => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const name = (data.projectName || 'Report').replace(/[^a-z0-9 _-]/gi, '_')
      a.href = url
      a.download = `${name}_Stage1_Report.docx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setDownloadError('Download failed: ' + e.message)
    }
    setDownloading(false)
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F7F9FC' }}>
        <div className="w-8 h-8 border-4 border-[#2E75B6] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const { cost, programme, aiProse, projectName, generatedAt, templateError } = data
  const grade = aiProse?.confidenceScore || 'B'
  const confidenceLabel = aiProse?.confidenceLabel || 'Moderate Confidence'
  const riskLevel = cost?.percentages?.riskLevel || 'Medium'
  const formattedDate = generatedAt
    ? new Date(generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div style={{ backgroundColor: '#F0F0F0', minHeight: '100vh' }}>

      {/* Toolbar — screen only */}
      <div className="print:hidden sticky top-0 z-10 px-4 py-2" style={{ backgroundColor: '#1F3864', borderBottom: '1px solid #17305a' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ color: '#FFF', fontWeight: 700, fontSize: '15px' }}>Estates AI — Report Preview</span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => router.push('/questionnaire')}
              style={{ padding: '6px 16px', border: '1px solid rgba(255,255,255,0.45)', color: '#FFF', background: 'transparent', borderRadius: '4px', fontSize: '13px', cursor: 'pointer' }}>
              New Report
            </button>
            <button onClick={downloadDocx} disabled={downloading}
              style={{ padding: '6px 16px', background: '#375623', color: '#FFF', border: 'none', borderRadius: '4px', fontWeight: 700, fontSize: '13px', cursor: downloading ? 'default' : 'pointer', opacity: downloading ? 0.7 : 1 }}>
              {downloading ? 'Downloading…' : '⬇ Download Word (.docx)'}
            </button>
          </div>
        </div>
      </div>

      {/* Alerts */}
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '0 16px' }}>
        {templateError && (
          <div style={{ margin: '12px 0', padding: '12px 16px', background: '#FEF9C3', border: '1px solid #D97706', borderRadius: '4px' }}>
            <strong style={{ color: '#92400E' }}>Word template not available.</strong>
            <span style={{ color: '#92400E', fontSize: '13px' }}> The HTML preview below is complete. Upload the template to GitHub to enable Word downloads.</span>
          </div>
        )}
        {downloadError && (
          <div style={{ margin: '12px 0', padding: '10px 16px', background: '#FEF2F2', border: '1px solid #C00000', borderRadius: '4px', color: '#C00000', fontSize: '13px' }}>
            {downloadError}
          </div>
        )}
      </div>

      {/* ── Document shell ── */}
      <div style={{ maxWidth: '860px', margin: '16px auto 40px', padding: '0 16px' }}>
        <div style={{ background: '#FFFFFF', boxShadow: '0 1px 8px rgba(0,0,0,0.15)', padding: '56px 64px' }}>

          {/* ══════════════ COVER ══════════════ */}
          <div style={{ textAlign: 'center', paddingBottom: '40px', marginBottom: '40px', borderBottom: '3px solid #1F3864' }}>
            <p style={{ fontSize: '11px', letterSpacing: '3px', textTransform: 'uppercase', color: '#888', marginBottom: '16px' }}>
              RIBA Stage 1 Feasibility Report
            </p>
            <h1 style={{ fontSize: '34px', fontWeight: 700, color: '#1F3864', margin: '0 0 20px' }}>{projectName}</h1>
            <p style={{ color: '#444', marginBottom: '6px', fontSize: '14px' }}>
              <strong>Date:</strong> {formattedDate}
            </p>
            <p style={{ color: '#444', fontSize: '14px' }}>
              <strong>Confidence Grade:</strong> Grade {grade} — {confidenceLabel}
              &nbsp;|&nbsp;
              <strong>Risk:</strong> {riskLevel} Cost Risk
            </p>

            {/* Summary info box */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginTop: '28px', textAlign: 'left' }}>
              <SummaryBox
                label="Total Project Cost Range"
                value={`${f1k(cost?.total?.low)} – ${f1k(cost?.total?.high)}`}
                sub={`Excl. VAT  |  ${f1k(cost?.vat)} VAT at 20% (ref)`}
              />
              <SummaryBox
                label="Programme"
                value={`${programme?.totalWeeks} weeks`}
                sub={programme?.targetStatus === 'achievable'
                  ? '✓ Target date achievable'
                  : programme?.targetStatus === 'at-risk'
                    ? '✕ Target date NOT achievable'
                    : 'No target date specified'}
                subColor={programme?.targetStatus === 'at-risk' ? '#C00000' : '#166534'}
              />
              <SummaryBox
                label="BCIS Region"
                value={cost?.bcisRegion}
                sub={`Location factor: ${cost?.bcisFactor}`}
              />
            </div>
          </div>

          {/* ══════════════ SECTION 1 — Executive Summary ══════════════ */}
          <DocSection number="1" title="Executive Summary">
            <p style={{ color: '#333', lineHeight: 1.7, marginBottom: '16px' }}>{aiProse?.executiveSummary}</p>
            {aiProse?.keyFindings?.length > 0 && (
              <>
                <SubHeading>Key Findings</SubHeading>
                <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {aiProse.keyFindings.map((kf, i) => (
                    <li key={i} style={{ color: '#333', lineHeight: 1.6 }}>{kf}</li>
                  ))}
                </ol>
              </>
            )}
          </DocSection>

          {/* ══════════════ SECTION 2 — Scope of Works ══════════════ */}
          <DocSection number="2" title="Scope of Works">
            <SubHeading>Included Works</SubHeading>
            {cost?.lineItems?.length > 0
              ? buildScopeText(cost.lineItems)
              : <p style={{ color: '#555' }}>To be confirmed following completion of surveys and Stage 2 design.</p>
            }

            <SubHeading>Exclusions</SubHeading>
            <p style={{ color: '#333', lineHeight: 1.7 }}>
              Loose furniture, fittings and equipment (FF&amp;E); IT and AV equipment (unless explicitly scoped); land acquisition, legal fees and stamp duty; VAT; asbestos removal beyond the risk allowance; party wall awards and neighbourly matters; unforeseen ground conditions beyond risk allowance.
            </p>

            <SubHeading>Scope Assumptions</SubHeading>
            {aiProse?.scopeAssumptions?.length > 0
              ? <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {aiProse.scopeAssumptions.map((a, i) => <li key={i} style={{ color: '#333', lineHeight: 1.6 }}>{a}</li>)}
                </ul>
              : <p style={{ color: '#555' }}>Scope to be confirmed following completion of surveys and Stage 2 design.</p>
            }

            {/* Works cost detail table */}
            {cost?.lineItems?.length > 0 && (
              <>
                <SubHeading>Works Cost — Line Items</SubHeading>
                <div style={{ overflowX: 'auto' }}>
                  <table style={tblStyle}>
                    <thead>
                      <tr style={{ backgroundColor: '#1F3864' }}>
                        {['Code', 'Element', 'Unit', 'Rate (£)', 'Qty', 'Total (£)'].map(h => (
                          <th key={h} style={{ ...thStyle, textAlign: ['Rate (£)', 'Qty', 'Total (£)'].includes(h) ? 'right' : 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>{buildWorksRows(cost.lineItems)}</tbody>
                  </table>
                </div>
              </>
            )}
          </DocSection>

          {/* ══════════════ SECTION 3 — Risk Register ══════════════ */}
          <DocSection number="3" title="Risk Register">
            {aiProse?.riskRegister?.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={tblStyle}>
                  <thead>
                    <tr style={{ backgroundColor: '#1F3864' }}>
                      {['Ref', 'Category', 'Description', 'L', 'I', 'Rating', 'Mitigation'].map(h => (
                        <th key={h} style={{ ...thStyle, textAlign: 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {aiProse.riskRegister.map((r, i) => (
                      <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#F5F8FC' : '#FFFFFF', borderBottom: '1px solid #D9E1EB' }}>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 700, color: '#1F3864' }}>{r.ref}</td>
                        <td style={tdStyle}>{r.category}</td>
                        <td style={tdStyle}>{r.description}</td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{ragBadge(r.likelihood)}</td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{ragBadge(r.impact)}</td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{ragBadge(r.rating, true)}</td>
                        <td style={tdStyle}>{r.mitigation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p style={{ color: '#555' }}>No risk register data available.</p>}
          </DocSection>

          {/* ══════════════ SECTION 4 — Programme ══════════════ */}
          <DocSection number="4" title="High-Level Programme">
            <p style={{ color: '#333', marginBottom: '12px' }}>
              <strong>Total programme:</strong> {programme?.totalWeeks} weeks &nbsp;|&nbsp;
              <strong>Procurement route:</strong> {programme?.procurementRoute}
            </p>
            <p style={{ color: programme?.targetStatus === 'at-risk' ? '#C00000' : '#166534', marginBottom: '16px', fontWeight: 600 }}>
              {programme?.targetNote}
            </p>

            {programme?.stages?.length > 0 && (
              <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
                <table style={tblStyle}>
                  <thead>
                    <tr style={{ backgroundColor: '#1F3864' }}>
                      {['Stage', 'Activity', 'Duration (weeks)'].map(h => (
                        <th key={h} style={{ ...thStyle, textAlign: h === 'Duration (weeks)' ? 'right' : 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {programme.stages.map((s, i) => (
                      <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#F5F8FC' : '#FFFFFF', borderBottom: '1px solid #D9E1EB' }}>
                        <td style={{ ...tdStyle, fontWeight: 600, color: '#1F3864' }}>{s.stage}</td>
                        <td style={tdStyle}>{s.activity}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{s.weeks ?? s.durationWks}</td>
                      </tr>
                    ))}
                    <tr style={{ backgroundColor: '#1F3864' }}>
                      <td style={{ ...tdStyle, color: '#FFF', fontWeight: 700 }} colSpan={2}>TOTAL</td>
                      <td style={{ ...tdStyle, color: '#FFF', fontWeight: 700, textAlign: 'right' }}>{programme.totalWeeks}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {programme?.milestones?.length > 0 && (
              <>
                <SubHeading>Milestones</SubHeading>
                <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
                  {programme.milestones.map((m, i) => <li key={i} style={{ color: '#333', lineHeight: 1.6 }}>{m}</li>)}
                </ul>
              </>
            )}

            {(programme?.assumptions || programme?.standardAssumptions)?.length > 0 && (
              <>
                <SubHeading>Programme Assumptions</SubHeading>
                <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {(programme.assumptions || programme.standardAssumptions).map((a, i) => (
                    <li key={i} style={{ color: '#333', lineHeight: 1.6 }}>{a}</li>
                  ))}
                </ol>
              </>
            )}
          </DocSection>

          {/* ══════════════ SECTION 5 — Cost Estimate ══════════════ */}
          <DocSection number="5" title="Order of Cost Estimate (NRM1)">
            <p style={{ color: '#444', marginBottom: '12px', fontSize: '13px' }}>
              <strong>GIFA:</strong> {cost?.gifa} m² &nbsp;|&nbsp;
              <strong>Region:</strong> {cost?.bcisRegion} &nbsp;|&nbsp;
              <strong>BCIS Factor:</strong> {cost?.bcisFactor} &nbsp;|&nbsp;
              <strong>Specification:</strong> {cost?.specLevel}
            </p>
            {aiProse?.costNarrative && (
              <p style={{ color: '#333', lineHeight: 1.7, marginBottom: '20px' }}>{aiProse.costNarrative}</p>
            )}

            {/* Section 1 — Works Cost */}
            <SubHeading>Section 1 — Works Cost</SubHeading>
            <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
              <table style={tblStyle}>
                <thead>
                  <tr style={{ backgroundColor: '#1F3864' }}>
                    {['Code', 'Element', 'Unit', 'Rate (£)', 'Qty', 'Total (£)'].map(h => (
                      <th key={h} style={{ ...thStyle, textAlign: ['Rate (£)', 'Qty', 'Total (£)'].includes(h) ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>{cost?.lineItems ? buildWorksRows(cost.lineItems) : null}</tbody>
              </table>
            </div>

            {/* Section 2 — Construction Cost */}
            <SubHeading>Section 2 — Construction Cost</SubHeading>
            <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
              <table style={tblStyle}>
                <thead>
                  <tr style={{ backgroundColor: '#1F3864' }}>
                    {['Item', 'Rate', 'Amount (£)'].map(h => (
                      <th key={h} style={{ ...thStyle, textAlign: h === 'Amount (£)' ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {buildConstructionRows(cost).map((row, i) => {
                    const isTotal = row[0].includes('TOTAL') || row[0].includes('COST')
                    return (
                      <tr key={i} style={{ backgroundColor: isTotal ? '#1F3864' : i % 2 === 0 ? '#F5F8FC' : '#FFF', borderBottom: '1px solid #D9E1EB' }}>
                        <td style={{ ...tdStyle, color: isTotal ? '#FFF' : '#333', fontWeight: isTotal ? 700 : 400 }}>{row[0]}</td>
                        <td style={{ ...tdStyle, color: isTotal ? '#FFF' : '#555' }}>{row[1]}</td>
                        <td style={{ ...tdStyle, color: isTotal ? '#FFF' : '#333', fontWeight: isTotal ? 700 : 400, textAlign: 'right' }}>{row[2]}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Section 3 — Total Project Cost */}
            <SubHeading>Section 3 — Total Project Cost</SubHeading>
            <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
              <table style={tblStyle}>
                <thead>
                  <tr style={{ backgroundColor: '#1F3864' }}>
                    {['Item', 'Rate', 'Amount (£)'].map(h => (
                      <th key={h} style={{ ...thStyle, textAlign: h === 'Amount (£)' ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {buildTotalRows(cost).map((row, i) => {
                    const isTotal = row[0].includes('TOTAL')
                    const isVat   = row[0].includes('VAT')
                    return (
                      <tr key={i} style={{ backgroundColor: isTotal ? '#1F3864' : isVat ? '#F5F8FC' : i % 2 === 0 ? '#F5F8FC' : '#FFF', borderBottom: '1px solid #D9E1EB', fontStyle: isVat ? 'italic' : 'normal' }}>
                        <td style={{ ...tdStyle, color: isTotal ? '#FFF' : '#333', fontWeight: isTotal ? 700 : 400 }}>{row[0]}</td>
                        <td style={{ ...tdStyle, color: isTotal ? '#FFF' : '#555' }}>{row[1]}</td>
                        <td style={{ ...tdStyle, color: isTotal ? '#FFF' : '#333', fontWeight: isTotal ? 700 : 400, textAlign: 'right' }}>{row[2]}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <p style={{ color: '#333', marginBottom: '20px', fontWeight: 600 }}>
              Total Cost Range: {f1k(cost?.total?.low)} – {f1k(cost?.total?.high)} (excl. VAT) &nbsp;|&nbsp; Cost Risk: {riskLevel}
            </p>

            <SubHeading>Cost Assumptions</SubHeading>
            <p style={{ color: '#333', lineHeight: 1.7, whiteSpace: 'pre-line', marginBottom: '16px' }}>
              {buildCostAssumptions(cost, data.answers)}
            </p>

            <SubHeading>Cost Exclusions</SubHeading>
            <p style={{ color: '#333', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
              {COST_EXCLUSIONS}
            </p>
          </DocSection>

          {/* ══════════════ SECTION 6 — ROI ══════════════ */}
          {aiProse?.roiNarrative && !aiProse.roiNarrative.includes('Not applicable') && (
            <DocSection number="6" title="ROI &amp; Financial Case">
              <p style={{ color: '#333', marginBottom: '12px' }}>
                <strong>Benefit type:</strong> {data.answers?.q5_1_financialBenefit || '—'}
                &emsp;<strong>Annual benefit:</strong> {data.answers?.q5_2_annualBenefit ? f(data.answers.q5_2_annualBenefit) + ' per annum' : '—'}
                &emsp;<strong>Project cost (mid):</strong> {f1k(cost?.total?.mid)}
                &emsp;<strong>Simple payback:</strong> {calcPayback(data.answers, cost)}
              </p>
              <p style={{ color: '#333', lineHeight: 1.7 }}>{aiProse.roiNarrative}</p>
            </DocSection>
          )}

          {/* ══════════════ SECTION 7 — Procurement ══════════════ */}
          {aiProse?.procurementNarrative && (
            <DocSection number="7" title="Procurement Recommendation">
              <p style={{ color: '#333', marginBottom: '12px' }}>
                <strong>Route:</strong> {aiProse.procurementRoute}
                &emsp;<strong>Contract:</strong> {aiProse.procurementContractForm}
              </p>
              <p style={{ color: '#333', marginBottom: '4px' }}>
                <strong>Design responsibility:</strong> {aiProse.procurementDesignResp}
                &emsp;<strong>Tender type:</strong> {aiProse.procurementTenderType}
              </p>
              <p style={{ color: '#333', lineHeight: 1.7, marginTop: '12px', marginBottom: '12px' }}>{aiProse.procurementNarrative}</p>
              {aiProse.procurementConsiderations?.length > 0 && (
                <>
                  <SubHeading>Commercial Considerations</SubHeading>
                  <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {aiProse.procurementConsiderations.map((c, i) => <li key={i} style={{ color: '#333', lineHeight: 1.6 }}>{c}</li>)}
                  </ul>
                </>
              )}
              {aiProse.procurementConflicts?.length > 0 && (
                <p style={{ color: '#C00000', marginTop: '12px' }}>
                  {aiProse.procurementConflicts.map(c => `⚠ ${c}`).join('  ')}
                </p>
              )}
              {(!aiProse.procurementConflicts || aiProse.procurementConflicts.length === 0) && (
                <p style={{ color: '#555', marginTop: '12px', fontStyle: 'italic' }}>No procurement conflicts identified.</p>
              )}
            </DocSection>
          )}

          {/* ══════════════ SECTION 8 — Constraints ══════════════ */}
          {aiProse?.constraints?.length > 0 && (
            <DocSection number="8" title="Constraints Summary">
              <div style={{ overflowX: 'auto' }}>
                <table style={tblStyle}>
                  <thead>
                    <tr style={{ backgroundColor: '#1F3864' }}>
                      {['Category', 'Constraint', 'Impact'].map(h => (
                        <th key={h} style={{ ...thStyle, textAlign: 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {aiProse.constraints.map((c, i) => (
                      <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#F5F8FC' : '#FFFFFF', borderBottom: '1px solid #D9E1EB' }}>
                        <td style={{ ...tdStyle, fontWeight: 600, color: '#1F3864', whiteSpace: 'nowrap' }}>{c.category}</td>
                        <td style={{ ...tdStyle, fontWeight: 600, color: '#333' }}>{c.title}</td>
                        <td style={tdStyle}>{c.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DocSection>
          )}

          {/* ══════════════ SECTION 9 — Next Steps ══════════════ */}
          <DocSection number="9" title="Recommendations &amp; Next Steps">
            {aiProse?.nextSteps?.length > 0 ? (
              <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {aiProse.nextSteps.map((s, i) => (
                  <li key={i} style={{ color: '#333', lineHeight: 1.7 }}>{s}</li>
                ))}
              </ol>
            ) : (
              <p style={{ color: '#555' }}>Commission outstanding surveys and appoint design team to proceed to RIBA Stage 2.</p>
            )}
          </DocSection>

          {/* ══════════════ DISCLAIMER ══════════════ */}
          <div style={{ marginTop: '32px', paddingTop: '20px', borderTop: '1px solid #CCC' }}>
            <p style={{ fontWeight: 700, color: '#333', marginBottom: '8px', fontSize: '14px' }}>Disclaimer</p>
            <p style={{ fontStyle: 'italic', color: '#555', lineHeight: 1.7, fontSize: '13px' }}>
              This report has been produced at RIBA Stage 0–1 using benchmark cost and programme data from published industry sources (BCIS, RICS, Cushman &amp; Wakefield). All figures are indicative and subject to change following completion of surveys, design development, and competitive procurement. This report does not constitute a formal cost plan and should not be used as the basis for a financial commitment without review by a Chartered Quantity Surveyor. Programme durations are indicative and assume standard productivity and client decision-making within the gateway periods shown.
            </p>
          </div>

          {/* Download CTA — screen only */}
          <div className="print:hidden" style={{ marginTop: '40px', padding: '20px', background: '#F5F8FC', border: '1px solid #D9E1EB', borderRadius: '4px', textAlign: 'center' }}>
            <p style={{ fontWeight: 700, color: '#1F3864', marginBottom: '8px' }}>Download the formatted Word report</p>
            <p style={{ color: '#555', fontSize: '13px', marginBottom: '12px' }}>Open in Microsoft Word for a fully formatted document matching this layout.</p>
            <button onClick={downloadDocx} disabled={downloading}
              style={{ padding: '10px 28px', background: '#375623', color: '#FFF', border: 'none', borderRadius: '4px', fontWeight: 700, fontSize: '14px', cursor: downloading ? 'default' : 'pointer', opacity: downloading ? 0.7 : 1 }}>
              {downloading ? 'Downloading…' : '⬇ Download .docx Report'}
            </button>
            {downloadError && <p style={{ color: '#C00000', marginTop: '8px', fontSize: '13px' }}>{downloadError}</p>}
          </div>

        </div>
      </div>
    </div>
  )
}

// ─── Shared table styles ───────────────────────────────────────────────────────
const tblStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '13px',
}
const thStyle = {
  padding: '8px 10px',
  color: '#FFFFFF',
  fontWeight: 600,
  fontSize: '12px',
}
const tdStyle = {
  padding: '7px 10px',
  color: '#333',
  lineHeight: 1.5,
  verticalAlign: 'top',
}

// ─── Helper components ─────────────────────────────────────────────────────────

function DocSection({ number, title, children }) {
  return (
    <div style={{ marginBottom: '36px' }}>
      <h2 style={{
        fontSize: '17px',
        fontWeight: 700,
        fontStyle: 'italic',
        color: '#1F3864',
        borderBottom: '2px solid #1F3864',
        paddingBottom: '5px',
        marginBottom: '16px',
      }}>
        {number}. <span dangerouslySetInnerHTML={{ __html: title }} />
      </h2>
      {children}
    </div>
  )
}

function SubHeading({ children }) {
  return (
    <p style={{ fontWeight: 700, color: '#1F3864', margin: '16px 0 6px', fontSize: '13px' }}>
      {children}
    </p>
  )
}

function SummaryBox({ label, value, sub, subColor }) {
  return (
    <div style={{ border: '1px solid #C5D3E8', borderRadius: '4px', padding: '14px 16px', backgroundColor: '#F5F8FC' }}>
      <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: '#666', marginBottom: '6px' }}>{label}</p>
      <p style={{ fontSize: '20px', fontWeight: 700, color: '#1F3864', marginBottom: '4px' }}>{value}</p>
      <p style={{ fontSize: '11px', color: subColor || '#666' }}>{sub}</p>
    </div>
  )
}

// ─── RAG badges ───────────────────────────────────────────────────────────────
function ragBadge(val, bold = false) {
  const solidBg = { High: '#C00000', Medium: '#ED7D31', Low: '#70AD47' }
  const lightBg = { High: '#FEE2E2', Medium: '#FEF9C3', Low: '#DCFCE7' }
  const lightTx = { High: '#C00000', Medium: '#92400E', Low: '#166534' }
  if (bold) {
    return <span style={{ padding: '2px 7px', borderRadius: '3px', fontSize: '11px', fontWeight: 700, color: '#FFF', backgroundColor: solidBg[val] || '#6B7280' }}>{val}</span>
  }
  return <span style={{ padding: '2px 7px', borderRadius: '3px', fontSize: '11px', backgroundColor: lightBg[val] || '#F3F4F6', color: lightTx[val] || '#374151' }}>{val}</span>
}

// ─── Data builders ─────────────────────────────────────────────────────────────

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

function buildWorksRows(lineItems) {
  if (!lineItems) return null
  const rows = []
  let lastGroup = null
  let rowIdx = 0
  lineItems.forEach(item => {
    if (item.group !== lastGroup) {
      lastGroup = item.group
      rows.push(
        <tr key={`g${item.group}`} style={{ backgroundColor: '#2E4D7B' }}>
          <td colSpan={6} style={{ ...tdStyle, fontWeight: 700, fontSize: '11px', color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            {GROUP_NAMES[item.group] || `GROUP ${item.group}`}
          </td>
        </tr>
      )
    }
    const stripe = rowIdx % 2 === 0
    rows.push(
      <tr key={rowIdx} style={{ backgroundColor: stripe ? '#F5F8FC' : '#FFFFFF', borderBottom: '1px solid #D9E1EB' }}>
        <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '11px', color: '#2E75B6' }}>{item.code}</td>
        <td style={tdStyle}>{item.description}</td>
        <td style={{ ...tdStyle, textAlign: 'center', color: '#555' }}>{item.unit}</td>
        <td style={{ ...tdStyle, textAlign: 'right', color: '#333' }}>{f(item.rate)}</td>
        <td style={{ ...tdStyle, textAlign: 'right', color: '#555' }}>{item.qty}</td>
        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#1F3864' }}>{f1k(item.lineMid)}</td>
      </tr>
    )
    rowIdx++
  })
  const totalMid = lineItems.reduce((s, i) => s + (i.lineMid || 0), 0)
  rows.push(
    <tr key="works-total" style={{ backgroundColor: '#1F3864' }}>
      <td colSpan={5} style={{ ...tdStyle, fontWeight: 700, color: '#FFF' }}>WORKS COST TOTAL</td>
      <td style={{ ...tdStyle, fontWeight: 700, color: '#FFF', textAlign: 'right' }}>{f1k(totalMid)}</td>
    </tr>
  )
  return rows
}

function buildScopeText(lineItems) {
  if (!lineItems || lineItems.length === 0) return null
  const groups = {}
  for (const item of lineItems) {
    if (!groups[item.group]) groups[item.group] = []
    groups[item.group].push(item.description)
  }
  return (
    <div style={{ fontSize: '13px', marginBottom: '4px' }}>
      {Object.entries(groups).map(([grp, items]) => (
        <div key={grp} style={{ marginBottom: '10px' }}>
          <p style={{ fontWeight: 700, color: '#1F3864', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>
            {GROUP_NAMES[Number(grp)] || `Group ${grp}`}
          </p>
          <ul style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {items.map((desc, i) => <li key={i} style={{ color: '#333' }}>{desc}</li>)}
          </ul>
        </div>
      ))}
    </div>
  )
}

function buildConstructionRows(cost) {
  if (!cost) return []
  const p = cost.percentages
  const w = cost.works
  const c = cost.construction
  return [
    ['Works Cost', '', f1k(w?.mid)],
    [`Contractor's Preliminaries (A)`, `${pct(p?.prelims)} of Works`, f1k(w?.mid * (p?.prelims || 0) / 100)],
    ['Overheads & Profit (B)', `${pct(p?.ohp)} of Works`, f1k(w?.mid * (p?.ohp || 0) / 100)],
    ['CONSTRUCTION COST TOTAL', '', f1k(c?.mid)],
  ]
}

function buildTotalRows(cost) {
  if (!cost) return []
  const p = cost.percentages
  const c = cost.construction
  const w = cost.works
  const t = cost.total
  const rows = [
    ['Construction Cost', '', f1k(c?.mid)],
    ['Professional Fees (C)', `${pct(p?.fees)} of Construction`, f1k(c?.mid * (p?.fees || 0) / 100)],
  ]
  if ((cost.breakdown?.devCosts || 0) > 0) {
    rows.push(['Developer & Project Costs (D)', `${pct(p?.devCosts)} of Construction`, f1k(c?.mid * (p?.devCosts || 0) / 100)])
  }
  rows.push(
    ['Risk Allowance (E)', `${pct(p?.risk)} of Works`, f1k(w?.mid * (p?.risk || 0) / 100)],
    ['Client Contingency (H)', '5% of Works', f1k(w?.mid * 0.05)],
    ['Inflation Allowance (F)', `${pct(p?.inflation)} of Works`, f1k(w?.mid * (p?.inflation || 0) / 100)],
    ['TOTAL PROJECT COST (excl. VAT)', '', f1k(t?.mid)],
    ['VAT @ 20% (reference — recoverability to be confirmed)', '20%', f1k(t?.mid * 0.20)],
  )
  return rows
}

function buildCostAssumptions(cost, answers) {
  if (!cost) return ''
  return [
    `All rates are at Q2 2026 national mean (BCIS/RICS). BCIS location factor ${cost.bcisFactor} applied for ${cost.bcisRegion}.`,
    `GIFA of ${cost.gifa} m² used as the pricing quantity. Rates are £/m² unless stated.`,
    `Band position factor of ${cost.bandFactor} applied (${cost.interventionLevel}).`,
    `Professional fees at ${cost.percentages?.fees}% reflect the project being at RIBA Stage ${answers?.q4_6_designStage || '0–1'}.`,
    `Contingency fixed at 5% (RIBA Stage 0–1 standard). Survey uncertainty is captured in Risk Allowance (E).`,
    `VAT at 20% is shown for reference only. Recoverability to be confirmed by the client's Finance team.`,
    `This estimate has not been prepared from measured quantities. A formal cost plan by a Chartered Quantity Surveyor is required before any financial commitment.`,
  ].map(a => `— ${a}`).join('\n')
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
].map(e => `— ${e}`).join('\n')

function calcPayback(answers, cost) {
  const annual = Number(answers?.q5_2_annualBenefit) || 0
  const mid = cost?.total?.mid || 0
  if (!annual || !mid) return '—'
  return `${Math.round((mid / annual) * 10) / 10} years (simple payback)`
}
