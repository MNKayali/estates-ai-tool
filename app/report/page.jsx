'use client'

/**
 * /report  (legacy entry point)
 *
 * Reads the report payload from sessionStorage (written by the questionnaire
 * immediately after generation) and renders it via ReportRenderer.
 *
 * Under normal flow the questionnaire now navigates to /report/[id] directly,
 * so this page only runs if reportId was not returned (KV not configured) or
 * if the user somehow lands here with data in sessionStorage.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ReportRenderer from './ReportRenderer'

const NAVY = '#1A2E4A'

export default function ReportPage() {
  const router = useRouter()
  const [data, setData] = useState(null)

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('estatesAI_result')
      if (!stored) { router.push('/questionnaire'); return }
      const result = JSON.parse(stored)

      // If the result already carries a reportId, redirect to the canonical URL
      if (result.reportId) {
        router.replace(`/report/${result.reportId}`)
        return
      }

      // Merge answers from localStorage for cost assumptions / ROI display
      const answersRaw = localStorage.getItem('estatesAI_v4_answers')
      const answers = answersRaw ? JSON.parse(answersRaw) : (result.answers || {})
      setData({ ...result, answers })
    } catch {
      router.push('/questionnaire')
    }
  }, [router])

  if (!data) return <Spinner />
  return <ReportRenderer data={data} />
}

function Spinner() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F0F2F4' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ width: '36px', height: '36px', border: `4px solid ${NAVY}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )
}
