'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ContradictionPage() {
  const router = useRouter()
  const [data, setData] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('estatesAI_contradictions')
      if (!stored) {
        router.push('/questionnaire')
        return
      }
      setData(JSON.parse(stored))
    } catch {
      router.push('/questionnaire')
    }
  }, [router])

  if (!data) return null

  const blockers = data.contradictions.filter(c => c.severity === 'blocker')
  const warnings = data.contradictions.filter(c => c.severity === 'warning')
  const hasBlockers = blockers.length > 0

  async function proceedAnyway() {
    setSubmitting(true)
    try {
      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: data.answers,
          sections: data.sections,
          confirmedContradictions: true,
        }),
      })
      const result = await res.json()
      if (result.success) {
        sessionStorage.setItem('estatesAI_report', JSON.stringify({
          reportText: result.report,
          intel: result.intel,
          answers: data.answers,
          reportSections: data.sections,
          meta: result.meta,
        }))
        sessionStorage.removeItem('estatesAI_contradictions')
        router.push('/report')
      } else {
        alert(`Error: ${result.error || 'Report generation failed.'}`)
        setSubmitting(false)
      }
    } catch {
      alert('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#1F3864] text-white px-4 py-3 shadow">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <div className="w-7 h-7 bg-[#2E75B6] rounded flex items-center justify-center text-white font-bold text-xs">AI</div>
          <span className="font-semibold text-sm">Estates AI Tool</span>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-[#1F3864]">Review Before Generating</h1>
          <p className="text-sm text-gray-500 mt-1">Our AI has flagged some points to review before generating your report.</p>
        </div>

        {/* Blockers */}
        {blockers.length > 0 && (
          <div className="mb-5 bg-red-50 border border-red-300 rounded-xl p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0 text-red-600 font-bold text-sm">✕</div>
              <div>
                <h2 className="font-semibold text-red-800">Please correct the following before generating your report</h2>
                <p className="text-sm text-red-600 mt-1">These issues will produce an unreliable report if not resolved.</p>
              </div>
            </div>
            <ul className="flex flex-col gap-3">
              {blockers.map((c, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-red-200 text-red-700 text-xs flex items-center justify-center flex-shrink-0 font-bold">{c.code}</span>
                  <span className="text-sm text-red-700">{c.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="mb-5 bg-amber-50 border border-amber-300 rounded-xl p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0 text-amber-600 font-bold text-sm">!</div>
              <div>
                <h2 className="font-semibold text-amber-800">We noticed the following — please review before proceeding</h2>
                <p className="text-sm text-amber-600 mt-1">These are advisory — you can still generate the report, but be aware of these points.</p>
              </div>
            </div>
            <ul className="flex flex-col gap-3">
              {warnings.map((c, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-amber-200 text-amber-700 text-xs flex items-center justify-center flex-shrink-0 font-bold">{c.code}</span>
                  <span className="text-sm text-amber-700">{c.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <button
            onClick={() => router.push('/questionnaire')}
            className="flex-1 px-5 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors text-center"
          >
            Go Back and Edit Answers
          </button>

          {!hasBlockers && (
            <button
              onClick={proceedAnyway}
              disabled={submitting}
              className="flex-1 px-5 py-3 bg-[#2E75B6] hover:bg-[#1F5C99] text-white rounded-lg text-sm font-semibold transition-colors text-center disabled:opacity-60"
            >
              {submitting ? 'Generating...' : 'I understand — Generate Report Anyway'}
            </button>
          )}
        </div>

        {hasBlockers && (
          <p className="mt-4 text-sm text-gray-500 text-center">Resolve the blockers above before generating your report.</p>
        )}
      </div>
    </div>
  )
}
