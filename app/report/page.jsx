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
      setData(JSON.parse(stored))
    } catch {
      router.push('/questionnaire')
    }
  }, [router])

  function downloadDocx() {
    if (!data?.docx) {
      setDownloadError('Word document is not available. The Word template may not yet be uploaded to GitHub. Please check /api/rates-check for status.')
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

  const confidenceBadgeColor = { A: '#375623', B: '#2E75B6', C: '#F4B942', D: '#C00000' }
  const grade = aiProse?.confidenceScore || 'B'

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F7F9FC' }}>
      {/* Header */}
      <header className="sticky top-0 z-10 px-4 py-3 shadow-sm print:hidden" style={{ backgroundColor: '#1F3864' }}>
        <div className="max-w-4xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div>
            <span className="font-bold text-white text-lg">Estates AI</span>
            <span className="text-white/60 ml-3 text-sm hidden sm:inline">RIBA Stage 1 Feasibility Report</span>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button onClick={() => router.push('/questionnaire')}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ border: '1px solid rgba(255,255,255,0.4)', color: '#FFF', backgroundColor: 'transparent' }}>
              New Report
            </button>
            <button onClick={downloadDocx} disabled={downloading}
              className="px-5 py-2 rounded-lg font-bold text-sm"
              style={{ backgroundColor: '#375623', color: '#FFF', opacity: downloading ? 0.7 : 1 }}>
              {downloading ? 'Downloading...' : 'Download Word Report (.docx)'}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* Template warning */}
        {templateError && (
          <div className="mb-6 p-4 rounded-lg" style={{ backgroundColor: '#FEF9C3', border: '1px solid #D97706' }}>
            <p className="font-bold" style={{ color: '#92400E' }}>Word template not available</p>
            <p className="text-sm mt-1" style={{ color: '#92400E' }}>
              The report data has been generated successfully below. To download the formatted Word document, the template file must be uploaded to GitHub.
              Run <code className="font-mono bg-yellow-200 px-1 rounded">node scripts/create-template.mjs</code>, push <code className="font-mono bg-yellow-200 px-1 rounded">Estates_AI_Report_Template.docx</code> to GitHub, and set the <code className="font-mono bg-yellow-200 px-1 rounded">TEMPLATE_FILE_URL</code> environment variable.
            </p>
            <p className="text-xs mt-1" style={{ color: '#92400E' }}>Error: {templateError}</p>
          </div>
        )}

        {downloadError && (
          <div className="mb-6 p-4 rounded-lg" style={{ backgroundColor: '#FEF2F2', border: '1px solid #C00000' }}>
            <p className="text-sm" style={{ color: '#C00000' }}>{downloadError}</p>
          </div>
        )}

        {/* Cover — navy with summary grid */}
        <div className="rounded-xl p-8 mb-8 text-white" style={{ backgroundColor: '#1F3864' }}>
          <p className="text-xs uppercase tracking-widest mb-2" style={{ opacity: 0.7 }}>RIBA Stage 1 Feasibility Report</p>
          <h1 className="font-bold mb-5" style={{ fontSize: '36px', lineHeight: '1.2' }}>{projectName}</h1>
          <div className="flex flex-wrap gap-2 mb-6">
            <span className="px-3 py-1 rounded text-xs font-semibold" style={{ background: 'rgba(255,255,255,0.15)' }}>
              Grade {grade} — {aiProse?.confidenceLabel || 'Moderate Confidence'}
            </span>
            <span className="px-3 py-1 rounded text-xs font-semibold" style={{
              background: cost?.percentages?.riskLevel === 'High' ? '#C00000' : cost?.percentages?.riskLevel === 'Low' ? '#375623' : '#D97706'
            }}>
              {cost?.percentages?.riskLevel || 'Medium'} Cost Risk
            </span>
            <span className="text-xs" style={{ opacity: 0.7, alignSelf: 'center' }}>
              Generated {new Date(generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
          {/* Summary grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1 p-5 rounded-lg" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ opacity: 0.7 }}>Total Project Cost Range</p>
              <p className="font-bold text-2xl">{f1k(cost?.total?.low)} – {f1k(cost?.total?.high)}</p>
              <p className="text-xs mt-1" style={{ opacity: 0.7 }}>Excl. VAT &nbsp;|&nbsp; {f1k(cost?.vat)} VAT at 20% (ref)</p>
            </div>
            <div className="p-5 rounded-lg" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ opacity: 0.7 }}>Programme</p>
              <p className="font-bold text-2xl">{programme?.totalWeeks} weeks</p>
              <p className="text-xs mt-1" style={{ color: programme?.targetStatus === 'at-risk' ? '#FF6B6B' : 'rgba(255,255,255,0.7)' }}>
                {programme?.targetStatus === 'achievable' ? '✓ Target date achievable'
                  : programme?.targetStatus === 'at-risk' ? '✕ Target date NOT achievable'
                  : 'No target date specified'}
              </p>
            </div>
            <div className="p-5 rounded-lg" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ opacity: 0.7 }}>BCIS Region</p>
              <p className="font-bold text-xl">{cost?.bcisRegion}</p>
              <p className="text-xs mt-1" style={{ opacity: 0.7 }}>Location factor: {cost?.bcisFactor}</p>
            </div>
          </div>
        </div>

        {/* ── Section 1: Executive Summary ─── */}
        <Section title="1. Executive Summary">
          <p style={{ color: '#333', lineHeight: '1.7' }}>{aiProse?.executiveSummary}</p>
          {aiProse?.keyFindings?.length > 0 && (
            <div className="mt-4">
              <p className="font-bold mb-2" style={{ color: '#1F3864' }}>Key Findings</p>
              <ol className="flex flex-col gap-2">
                {aiProse.keyFindings.map((f, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: '#2E75B6' }}>{i+1}</span>
                    <span style={{ color: '#333' }}>{f}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Section>

        {/* ── Section 2: Scope ─── */}
        <Section title="2. Scope of Works">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-4">
            {/* Included */}
            <div>
              <p className="font-bold mb-2" style={{ color: '#1F3864' }}>✓ Included</p>
              {cost?.lineItems && cost.lineItems.length > 0 ? (
                buildScopeGroupedList(cost.lineItems)
              ) : (
                <p style={{ color: '#555' }}>No scope items calculated. Please check your inputs.</p>
              )}
            </div>
            {/* Excluded */}
            <div>
              <p className="font-bold mb-2" style={{ color: '#1F3864' }}>✕ Excluded</p>
              <ul className="flex flex-col gap-1 text-sm" style={{ color: '#555' }}>
                {['Loose furniture, fittings and equipment (FF&E)',
                  'IT and AV equipment (unless explicitly scoped)',
                  'Land acquisition, legal fees and stamp duty',
                  'VAT (reference figure shown separately)',
                  'Asbestos removal beyond the risk allowance',
                  'Party wall awards and neighbourly matters',
                  'Unforeseen ground conditions beyond risk allowance',
                ].map((e, i) => <li key={i}>— {e}</li>)}
              </ul>
            </div>
          </div>
          {/* Works cost table — with Low/High columns */}
          {cost?.lineItems && cost.lineItems.length > 0 && (
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ backgroundColor: '#1F3864' }}>
                    {['Code', 'Element', 'Unit', 'Rate', 'Qty', 'Low £', 'High £'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-white font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {buildWorksTableRows(cost.lineItems)}
                </tbody>
              </table>
            </div>
          )}
          {aiProse?.scopeAssumptions?.length > 0 && (
            <div className="mt-4">
              <p className="font-bold mb-2" style={{ color: '#1F3864' }}>Scope Assumptions</p>
              <ul className="flex flex-col gap-1">
                {aiProse.scopeAssumptions.map((a, i) => <li key={i} style={{ color: '#333' }}>— {a}</li>)}
              </ul>
            </div>
          )}
        </Section>

        {/* ── Section 3: Risk Register ─── */}
        <Section title="3. Risk Register">
          {aiProse?.riskRegister?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ backgroundColor: '#1F3864' }}>
                    {['Ref', 'Category', 'Description', 'L', 'I', 'Rating', 'Mitigation'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-white font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {aiProse.riskRegister.map((r, i) => (
                    <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#F9FAFB' : '#FFF', borderBottom: '1px solid #E5E7EB' }}>
                      <td className="px-3 py-2 font-mono font-bold" style={{ color: '#1F3864' }}>{r.ref}</td>
                      <td className="px-3 py-2" style={{ color: '#555' }}>{r.category}</td>
                      <td className="px-3 py-2" style={{ color: '#333' }}>{r.description}</td>
                      <td className="px-3 py-2 text-center">{ratingBadge(r.likelihood)}</td>
                      <td className="px-3 py-2 text-center">{ratingBadge(r.impact)}</td>
                      <td className="px-3 py-2 text-center">{ratingBadge(r.rating, true)}</td>
                      <td className="px-3 py-2" style={{ color: '#333' }}>{r.mitigation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: '#555' }}>No risk register data available.</p>
          )}
        </Section>

        {/* ── Section 4: Programme ─── */}
        <Section title="4. High-Level Programme">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Surveys', val: `${programme?.surveyWeeks || 0} wks` },
              { label: 'Design (Stages 2–4)', val: `${programme?.designWeeks || 0} wks` },
              { label: 'Tender', val: `${programme?.tenderWeeks || 0} wks` },
              { label: 'Construction', val: `${programme?.constructionWeeks || 0} wks` },
            ].map(item => (
              <div key={item.label} className="rounded-lg p-3 text-center" style={{ backgroundColor: '#EEF4FA' }}>
                <p className="text-2xl font-bold" style={{ color: '#1F3864' }}>{item.val}</p>
                <p className="text-xs mt-1" style={{ color: '#555' }}>{item.label}</p>
              </div>
            ))}
          </div>
          <div className="mb-4 p-4 rounded-lg" style={{ backgroundColor: programme?.targetStatus === 'at-risk' ? '#FEF2F2' : '#F0FDF4', border: `1px solid ${programme?.targetStatus === 'at-risk' ? '#C00000' : '#86EFAC'}` }}>
            <p style={{ color: programme?.targetStatus === 'at-risk' ? '#C00000' : '#166534' }}>{programme?.targetNote}</p>
          </div>
          {programme?.stages?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ backgroundColor: '#1F3864' }}>
                    {['Stage', 'Activity', 'Weeks'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-white font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {programme.stages.map((s, i) => (
                    <tr key={i} style={{ backgroundColor: s.stage === 'Gateway' ? '#EEF4FA' : i % 2 === 0 ? '#F9FAFB' : '#FFF', borderBottom: '1px solid #E5E7EB' }}>
                      <td className="px-3 py-2 font-medium" style={{ color: s.stage === 'Gateway' ? '#2E75B6' : '#1F3864' }}>{s.stage}</td>
                      <td className="px-3 py-2" style={{ color: '#333' }}>{s.activity}</td>
                      <td className="px-3 py-2 font-bold" style={{ color: '#1F3864' }}>{s.weeks ?? s.durationWks}</td>
                    </tr>
                  ))}
                  <tr style={{ backgroundColor: '#1F3864' }}>
                    <td className="px-3 py-2 font-bold text-white" colSpan={2}>TOTAL</td>
                    <td className="px-3 py-2 font-bold text-white">{programme.totalWeeks}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {/* Programme milestones */}
          {programme?.milestones?.length > 0 && (
            <div className="mt-4">
              <p className="font-bold mb-2" style={{ color: '#1F3864' }}>Key Milestones</p>
              <ul className="flex flex-col gap-1 text-sm">
                {programme.milestones.map((m, i) => <li key={i} style={{ color: '#333' }}>— {m}</li>)}
              </ul>
            </div>
          )}
          {/* Programme assumptions */}
          {(programme?.assumptions || programme?.standardAssumptions)?.length > 0 && (
            <div className="mt-4 p-4 rounded-lg" style={{ backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB' }}>
              <p className="font-bold mb-2 text-sm" style={{ color: '#1F3864' }}>Programme Assumptions</p>
              <ol className="flex flex-col gap-1 text-sm" style={{ color: '#555' }}>
                {(programme.assumptions || programme.standardAssumptions).map((a, i) => (
                  <li key={i} className="flex gap-2">
                    <span style={{ color: '#2E75B6', fontWeight: 600, flexShrink: 0 }}>{i + 1}.</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Section>

        {/* ── Section 5: Cost Estimate ─── */}
        <Section title="5. Order of Cost Estimate (NRM1)">
          <p className="text-sm mb-4" style={{ color: '#555' }}>
            <strong>GIFA:</strong> {cost?.gifa} m² &nbsp;|&nbsp;
            <strong>Region:</strong> {cost?.bcisRegion} &nbsp;|&nbsp;
            <strong>BCIS Factor:</strong> {cost?.bcisFactor} &nbsp;|&nbsp;
            <strong>Specification:</strong> {cost?.specLevel} &nbsp;|&nbsp;
            <strong>Band factor:</strong> {cost?.bandFactor} ({cost?.interventionLevel})
          </p>
          {aiProse?.costNarrative && <p className="mb-4" style={{ color: '#333' }}>{aiProse.costNarrative}</p>}

          {/* Section 2 — Construction Cost */}
          <p className="font-bold mb-2" style={{ color: '#1F3864' }}>Construction Cost</p>
          <SimpleTable
            headers={['Item', 'Rate', 'Low (£)', 'High (£)']}
            rows={buildConstructionRows(cost)}
          />

          {/* Section 3 — Total Project Cost */}
          <p className="font-bold mb-2 mt-6" style={{ color: '#1F3864' }}>Total Project Cost</p>
          <SimpleTable
            headers={['Item', 'Rate', 'Low (£)', 'High (£)']}
            rows={buildTotalRows(cost)}
            highlightLast
          />

          <div className="mt-4 p-3 rounded-lg text-sm" style={{ backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB', color: '#555', fontStyle: 'italic' }}>
            This order of cost estimate is indicative only, produced at RIBA Stage 0–1 without measured quantities. Rates based on BCIS £/m² benchmarks adjusted for region (factor {cost?.bcisFactor}). Review by a Chartered Quantity Surveyor is required before use in any budget approval or funding application.
          </div>
        </Section>

        {/* ── Section 6: ROI ─── */}
        {aiProse?.roiNarrative && !aiProse.roiNarrative.includes('Not applicable') && (
          <Section title="6. ROI &amp; Financial Case">
            <p style={{ color: '#333' }}>{aiProse.roiNarrative}</p>
          </Section>
        )}

        {/* ── Section 7: Procurement ─── */}
        {aiProse?.procurementNarrative && (
          <Section title="7. Procurement Recommendation">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="p-3 rounded-lg" style={{ backgroundColor: '#EEF4FA' }}>
                <p className="text-xs font-medium mb-1" style={{ color: '#555' }}>Recommended Route</p>
                <p className="font-bold" style={{ color: '#1F3864' }}>{aiProse.procurementRoute}</p>
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: '#EEF4FA' }}>
                <p className="text-xs font-medium mb-1" style={{ color: '#555' }}>Contract Form</p>
                <p className="font-bold" style={{ color: '#1F3864' }}>{aiProse.procurementContractForm}</p>
              </div>
            </div>
            <p className="mb-3" style={{ color: '#333' }}>{aiProse.procurementNarrative}</p>
            {aiProse.procurementConsiderations?.length > 0 && (
              <ul className="flex flex-col gap-1">
                {aiProse.procurementConsiderations.map((c, i) => <li key={i} style={{ color: '#333' }}>— {c}</li>)}
              </ul>
            )}
          </Section>
        )}

        {/* ── Section 8: Constraints ─── */}
        {aiProse?.constraints?.length > 0 && (
          <Section title="8. Constraints Summary">
            <div className="flex flex-col gap-3">
              {aiProse.constraints.map((c, i) => (
                <div key={i} className="p-3 rounded-lg" style={{ backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                  <p className="text-xs font-medium mb-0.5" style={{ color: '#2E75B6' }}>{c.category} — {c.title}</p>
                  <p style={{ color: '#333', fontSize: '14px' }}>{c.text}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── Section 9: Next Steps ─── */}
        <Section title="9. Recommendations &amp; Next Steps">
          {aiProse?.nextSteps?.length > 0 ? (
            <ol className="flex flex-col gap-3">
              {aiProse.nextSteps.map((s, i) => (
                <li key={i} className="flex gap-3 items-start">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: '#1F3864' }}>{i+1}</span>
                  <span style={{ color: '#333', paddingTop: '2px' }}>{s}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p style={{ color: '#555' }}>Commission outstanding surveys and appoint design team to proceed to RIBA Stage 2.</p>
          )}
        </Section>

        {/* Disclaimer */}
        <div className="mt-8 p-4 rounded-lg text-sm" style={{ backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB', color: '#777', fontStyle: 'italic' }}>
          <strong style={{ color: '#555', fontStyle: 'normal' }}>Disclaimer:</strong> This report has been produced at RIBA Stage 0–1 using benchmark cost and programme data from published industry sources (BCIS, RICS, Cushman &amp; Wakefield UK Fit-Out Guide 2025). All figures are indicative and subject to change following completion of surveys, design development, and competitive procurement. This report does not constitute a formal cost plan and should not be used as the basis for a financial commitment without review by a Chartered Quantity Surveyor.
        </div>

        {/* Download CTA */}
        <div className="mt-8 p-6 rounded-xl text-center" style={{ backgroundColor: '#1F3864' }}>
          <p className="text-white font-bold text-lg mb-2">Download the formatted Word report</p>
          <p className="text-white/70 text-sm mb-4">Open in Microsoft Word and print to PDF for a professionally formatted document.</p>
          <button onClick={downloadDocx} disabled={downloading}
            className="px-8 py-3 rounded-lg font-bold text-lg"
            style={{ backgroundColor: '#375623', color: '#FFF', opacity: downloading ? 0.7 : 1 }}>
            {downloading ? 'Downloading...' : 'Download .docx Report'}
          </button>
          {downloadError && <p className="mt-3 text-sm" style={{ color: '#FCA5A5' }}>{downloadError}</p>}
        </div>
      </div>
    </div>
  )
}

// ─── Helper components ────────────────────────────────────────────────────────

function Section({ title, children }) {
  // Extract the number prefix from title like "1. Executive Summary"
  const match = title.match(/^(\d+)[.\s](.+)$/)
  const num = match ? match[1] : ''
  const label = match ? match[2] : title
  return (
    <div className="mb-8 rounded-xl overflow-hidden" style={{ backgroundColor: '#FFF', border: '1px solid #E5E7EB' }}>
      <div className="px-6 py-4 flex items-center gap-3" style={{ borderBottom: '2px solid #1F3864' }}>
        {num && (
          <div className="flex-shrink-0 flex items-center justify-center font-bold text-sm text-white rounded-full"
            style={{ width: '32px', height: '32px', backgroundColor: '#1F3864', fontSize: '14px' }}>
            {num}
          </div>
        )}
        <h2 className="text-lg font-semibold" style={{ color: '#1F3864', margin: 0 }}>{label}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

function SimpleTable({ headers, rows, highlightLast = false }) {
  return (
    <div className="overflow-x-auto mb-4">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr style={{ backgroundColor: '#1F3864' }}>
            {headers.map((h, hi) => (
              <th key={h} className={`px-3 py-2 text-white font-medium ${hi >= 2 ? 'text-right' : 'text-left'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isTotal = typeof row[0] === 'string' && (row[0].includes('TOTAL') || row[0].includes('COST'))
            const isVat   = typeof row[0] === 'string' && row[0].includes('VAT')
            return (
              <tr key={i} style={{
                backgroundColor: isTotal && !isVat ? '#1F3864' : isVat ? '#F9FAFB' : i % 2 === 0 ? '#F9FAFB' : '#FFF',
                borderBottom: '1px solid #E5E7EB',
                fontStyle: isVat ? 'italic' : 'normal',
              }}>
                {row.map((cell, j) => (
                  <td key={j} className={`px-3 py-2 ${j >= 2 ? 'text-right' : ''}`}
                    style={{ color: isTotal && !isVat ? '#FFF' : '#333', fontWeight: isTotal ? 'bold' : 'normal' }}>
                    {cell}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function buildWorksTableRows(lineItems) {
  if (!lineItems) return null
  const groupNames = {
    0: 'GROUP 0 — FACILITATING WORKS', 1: 'GROUP 1 — SUBSTRUCTURE', 2: 'GROUP 2 — SUPERSTRUCTURE',
    3: 'GROUP 3 — INTERNAL FINISHES', 4: 'GROUP 4 — FITTINGS, FURNISHINGS & EQUIPMENT',
    5: 'GROUP 5 — MECHANICAL & ELECTRICAL SERVICES', 6: 'GROUP 6 — PREFABRICATED',
    7: 'GROUP 7 — WORK TO EXISTING BUILDINGS', 8: 'GROUP 8 — EXTERNAL WORKS',
  }
  const rows = []
  let lastGroup = null
  lineItems.forEach((item, i) => {
    if (item.group !== lastGroup) {
      lastGroup = item.group
      rows.push(
        <tr key={`g${item.group}`} style={{ backgroundColor: '#1F3864' }}>
          <td colSpan={7} className="px-3 py-1.5 font-bold text-xs text-white/80">{groupNames[item.group] || `GROUP ${item.group}`}</td>
        </tr>
      )
    }
    rows.push(
      <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#F9FAFB' : '#FFF', borderBottom: '1px solid #E5E7EB' }}>
        <td className="px-3 py-2 font-mono text-xs" style={{ color: '#2E75B6' }}>{item.code}</td>
        <td className="px-3 py-2" style={{ color: '#333' }}>{item.description}</td>
        <td className="px-3 py-2 text-center" style={{ color: '#555' }}>{item.unit}</td>
        <td className="px-3 py-2 text-right" style={{ color: '#333' }}>{f(item.rate)}</td>
        <td className="px-3 py-2 text-right" style={{ color: '#555' }}>{item.qty}</td>
        <td className="px-3 py-2 text-right" style={{ color: '#666' }}>{f1k(item.lineLow)}</td>
        <td className="px-3 py-2 text-right font-medium" style={{ color: '#1F3864' }}>{f1k(item.lineHigh)}</td>
      </tr>
    )
  })
  const totalLow  = lineItems.reduce((s, i) => s + (i.lineLow  || 0), 0)
  const totalHigh = lineItems.reduce((s, i) => s + (i.lineHigh || 0), 0)
  rows.push(
    <tr key="works-total" style={{ backgroundColor: '#1F3864' }}>
      <td colSpan={5} className="px-3 py-2 font-bold text-white">WORKS COST TOTAL</td>
      <td className="px-3 py-2 font-bold text-white text-right">{f1k(totalLow)}</td>
      <td className="px-3 py-2 font-bold text-white text-right">{f1k(totalHigh)}</td>
    </tr>
  )
  return rows
}

// ─── Scope grouped list (for the two-column included/excluded layout) ──────────
function buildScopeGroupedList(lineItems) {
  if (!lineItems || lineItems.length === 0) return null
  const groupNames = {
    0: 'Group 0 — Facilitating Works',
    1: 'Group 1 — Substructure',
    2: 'Group 2 — Superstructure & Envelope',
    3: 'Group 3 — Internal Finishes',
    4: 'Group 4 — Fittings, Furnishings & Equipment',
    5: 'Group 5 — Mechanical & Electrical Services',
    6: 'Group 6 — Specialist Structures',
    7: 'Group 7 — Work to Existing Buildings',
    8: 'Group 8 — External Works',
  }
  const groups = {}
  for (const item of lineItems) {
    const grp = item.group
    if (!groups[grp]) groups[grp] = []
    groups[grp].push(item.description)
  }
  return (
    <div className="text-sm">
      {Object.entries(groups).map(([grp, items]) => (
        <div key={grp} className="mb-2">
          <p className="font-semibold mb-1" style={{ color: '#1F3864', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            {groupNames[Number(grp)] || `Group ${grp}`}
          </p>
          <ul className="flex flex-col gap-0.5">
            {items.map((desc, i) => <li key={i} style={{ color: '#333' }}>— {desc}</li>)}
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
    ['Works Cost', '', f1k(w?.low), f1k(w?.high)],
    [`Contractor's Preliminaries (A)`, `${pct(p?.prelims)} of Works`, f1k(w?.low * (p?.prelims || 0) / 100), f1k(w?.high * (p?.prelims || 0) / 100)],
    ['Overheads & Profit (B)', `${pct(p?.ohp)} of Works`, f1k(w?.low * (p?.ohp || 0) / 100), f1k(w?.high * (p?.ohp || 0) / 100)],
    ['CONSTRUCTION COST TOTAL', '', f1k(c?.low), f1k(c?.high)],
  ]
}

function buildTotalRows(cost) {
  if (!cost) return []
  const p = cost.percentages
  const c = cost.construction
  const w = cost.works
  const t = cost.total
  const rows = [
    ['Construction Cost', '', f1k(c?.low), f1k(c?.high)],
    ['Professional Fees (C)', `${pct(p?.fees)} of Construction`, f1k(c?.low * (p?.fees || 0) / 100), f1k(c?.high * (p?.fees || 0) / 100)],
  ]
  if ((cost.breakdown?.devCosts || 0) > 0) {
    rows.push(['Developer & Project Costs (D)', `${pct(p?.devCosts)} of Construction`, f1k(c?.low * (p?.devCosts || 0) / 100), f1k(c?.high * (p?.devCosts || 0) / 100)])
  }
  rows.push(
    ['Risk Allowance (E)', `${pct(p?.risk)} of Works`, f1k(w?.low * (p?.risk || 0) / 100), f1k(w?.high * (p?.risk || 0) / 100)],
    ['Client Contingency (H)', '5% of Works', f1k(w?.low * 0.05), f1k(w?.high * 0.05)],
    ['Inflation Allowance (F)', `${pct(p?.inflation)} of Works`, f1k(w?.low * (p?.inflation || 0) / 100), f1k(w?.high * (p?.inflation || 0) / 100)],
    ['TOTAL PROJECT COST (excl. VAT)', '', f1k(t?.low), f1k(t?.high)],
    ['VAT @ 20% (reference only)', '20%', f1k(t?.low * 0.20), f1k(t?.high * 0.20)],
  )
  return rows
}

function ratingBadge(val, bold = false) {
  // Solid RAG colours for ratings, lighter tones for likelihood/impact
  const solidColors = { High: '#C00000', Medium: '#ED7D31', Low: '#70AD47' }
  const lightColors = { High: { bg: '#FEE2E2', text: '#C00000' }, Medium: { bg: '#FEF9C3', text: '#92400E' }, Low: { bg: '#DCFCE7', text: '#166534' } }
  if (bold) {
    const bg = solidColors[val] || '#6B7280'
    return <span className="px-2 py-0.5 rounded text-xs font-bold text-white" style={{ backgroundColor: bg }}>{val}</span>
  }
  const c = lightColors[val] || { bg: '#F3F4F6', text: '#374151' }
  return <span className="px-2 py-0.5 rounded text-xs" style={{ backgroundColor: c.bg, color: c.text }}>{val}</span>
}
