'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'

const CONFIDENCE_CONFIG = {
  A: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300', label: 'High Confidence' },
  B: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300', label: 'Moderate Confidence' },
  C: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300', label: 'Limited Confidence' },
  D: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300', label: 'High Uncertainty' },
}

function ConfidenceBadge({ score }) {
  const config = CONFIDENCE_CONFIG[score] || CONFIDENCE_CONFIG['C']
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border ${config.bg} ${config.text} ${config.border}`}>
      <span className="w-5 h-5 rounded-full bg-current opacity-20 flex items-center justify-center font-bold text-xs">{score}</span>
      <span className="font-bold">{score}</span>
      <span>—</span>
      <span>{config.label}</span>
    </span>
  )
}

function markdownComponents(reportText) {
  return {
    h2: ({ children }) => (
      <h2 className="text-lg font-bold text-[#1F3864] mt-8 mb-4 pb-2 border-b-2 border-[#2E75B6] flex items-center gap-2">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-base font-semibold text-[#1F3864] mt-5 mb-2">{children}</h3>
    ),
    p: ({ children }) => (
      <p className="text-sm text-gray-700 leading-relaxed mb-3">{children}</p>
    ),
    ul: ({ children }) => (
      <ul className="mb-4 space-y-1.5 pl-4">{children}</ul>
    ),
    li: ({ children }) => (
      <li className="text-sm text-gray-700 flex items-start gap-2 before:content-['•'] before:text-[#2E75B6] before:font-bold before:flex-shrink-0">{children}</li>
    ),
    ol: ({ children }) => (
      <ol className="mb-4 space-y-1.5 pl-6 list-decimal">{children}</ol>
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto mb-6">
        <table className="w-full text-xs border-collapse border border-gray-200 rounded-lg overflow-hidden">{children}</table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-[#1F3864] text-white">{children}</thead>
    ),
    tbody: ({ children }) => (
      <tbody className="divide-y divide-gray-100">{children}</tbody>
    ),
    tr: ({ children }) => {
      return <tr className="odd:bg-white even:bg-gray-50 hover:bg-blue-50 transition-colors">{children}</tr>
    },
    th: ({ children }) => (
      <th className="px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap">{children}</th>
    ),
    td: ({ children }) => {
      const text = String(children || '')
      const isHigh = text === 'High' || text.includes('HIGH')
      const isMedium = text === 'Medium'
      const isLow = text === 'Low'
      return (
        <td className={`px-3 py-2 text-xs ${isHigh ? 'text-red-700 font-semibold' : isMedium ? 'text-amber-700 font-medium' : isLow ? 'text-green-700 font-medium' : 'text-gray-700'}`}>
          {children}
        </td>
      )
    },
    strong: ({ children }) => (
      <strong className="font-semibold text-gray-900">{children}</strong>
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-[#2E75B6] pl-4 my-4 italic text-gray-600 text-sm">{children}</blockquote>
    ),
    hr: () => <hr className="my-6 border-gray-200" />,
    code: ({ children }) => (
      <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono text-gray-800">{children}</code>
    ),
  }
}

export default function ReportPage() {
  const router = useRouter()
  const [data, setData] = useState(null)
  const [pdfGenerating, setPdfGenerating] = useState(false)
  const reportRef = useRef(null)

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('estatesAI_report')
      if (!stored) {
        router.push('/questionnaire')
        return
      }
      setData(JSON.parse(stored))
    } catch {
      router.push('/questionnaire')
    }
  }, [router])

  async function downloadPDF() {
    if (!reportRef.current) return
    setPdfGenerating(true)
    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: html2canvas } = await import('html2canvas')

      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const imgWidth = pageWidth - 20
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      const margin = 10

      let yOffset = 0
      while (yOffset < imgHeight) {
        if (yOffset > 0) pdf.addPage()
        pdf.addImage(imgData, 'PNG', margin, margin - yOffset, imgWidth, imgHeight)
        yOffset += pageHeight - margin * 2
      }

      const projectName = data?.projectName?.replace(/[^a-zA-Z0-9 ]/g, '') || 'Project'
      const date = new Date().toISOString().split('T')[0]
      pdf.save(`${projectName}_RIBA_Stage1_Report_${date}.pdf`)
    } catch (err) {
      alert('PDF generation failed. Please try again.')
    } finally {
      setPdfGenerating(false)
    }
  }

  if (!data) return null

  const meta = data.meta || {}
  const score = meta.confidenceScore || 'C'
  const generatedDate = meta.generatedAt ? new Date(meta.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('en-GB')

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-[#1F3864] text-white px-4 py-3 shadow sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#2E75B6] rounded flex items-center justify-center font-bold text-xs">AI</div>
            <span className="font-semibold text-sm">Estates AI Tool</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/questionnaire')}
              className="text-xs text-blue-300 hover:text-white transition-colors"
            >
              New Report
            </button>
            <button
              onClick={downloadPDF}
              disabled={pdfGenerating}
              className="flex items-center gap-1.5 bg-[#2E75B6] hover:bg-[#1F5C99] disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              {pdfGenerating ? (
                <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generating...</>
              ) : (
                <>Download as PDF</>
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Report document */}
        <div ref={reportRef} className="bg-white shadow-lg rounded-xl overflow-hidden">
          {/* Report header */}
          <div className="bg-[#1F3864] text-white px-8 py-8">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <p className="text-blue-300 text-xs font-medium uppercase tracking-widest mb-2">RIBA Stage 0–1 Feasibility Report</p>
                <h1 className="text-2xl font-bold leading-tight">
                  {data.projectName || 'Estates Project'}
                </h1>
                <p className="text-blue-200 text-sm mt-2">Generated: {generatedDate}</p>
                {meta.ratesSource && (
                  <p className="text-blue-300 text-xs mt-1">Cost data: {meta.ratesSource}</p>
                )}
              </div>
              <div className="flex flex-col items-start sm:items-end gap-2">
                <ConfidenceBadge score={score} />
                {meta.riskLevel && (
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    meta.riskLevel === 'High' ? 'bg-red-100 text-red-800' :
                    meta.riskLevel === 'Medium' ? 'bg-amber-100 text-amber-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {meta.riskLevel} Risk Project
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Report body */}
          <div className="px-8 py-8">
            <ReactMarkdown components={markdownComponents()}>
              {data.report}
            </ReactMarkdown>

            {/* Mandatory disclaimer */}
            <div className="mt-10 p-5 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Important Disclaimer</p>
              <p className="text-xs text-gray-500 leading-relaxed">
                This order of cost estimate is indicative only, produced at RIBA Stage 0–1 without measured quantities or detailed design information. Rates are based on BCIS £/m² benchmarks adjusted by regional location factor. This estimate should be reviewed and validated by a Chartered Quantity Surveyor before use in any business case, budget approval, or funding application. This report is not professional advice and does not constitute a commitment to any specific cost or programme outcome.
              </p>
            </div>

            {/* Report meta footer */}
            <div className="mt-6 pt-6 border-t border-gray-100 flex flex-wrap gap-4 text-xs text-gray-400">
              <span>Model: {meta.model || 'claude-sonnet-4-20250514'}</span>
              <span>Generated: {generatedDate}</span>
              {meta.contradictionsConfirmed && <span className="text-amber-500">Contradictions acknowledged by user</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
