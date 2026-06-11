'use client'

/**
 * /report/[id]  — canonical, shareable report URL
 *
 * Loading strategy (two-tier):
 *   1. Check sessionStorage for a freshly generated report matching this ID.
 *      This avoids an extra network round-trip when the user has just generated
 *      the report in the same browser tab.
 *   2. Fall back to GET /api/reports/[id] which fetches from Vercel KV.
 *      This is the path taken by teammates accessing a shared link.
 *
 * The "🔗 Copy Link" button in ReportRenderer copies window.location.href,
 * which is this URL — making it trivial to share with the rest of the team.
 */

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { track } from '@vercel/analytics'
import ReportRenderer from '../ReportRenderer'

const NAVY = '#1A2E4A'

export default function ReportByIdPage() {
  const { id }  = useParams()
  const router  = useRouter()
  const [data,  setData]  = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return

    async function load() {
      // ── Tier 1: sessionStorage (same-tab, fresh generation) ──────────────────
      try {
        const stored = sessionStorage.getItem('estatesAI_result')
        if (stored) {
          const result = JSON.parse(stored)
          if (result.reportId === id) {
            // Merge answers from localStorage (richer than what's in sessionStorage)
            const answersRaw = localStorage.getItem('estatesAI_v4_answers')
            const answers = answersRaw ? JSON.parse(answersRaw) : (result.answers || {})
            setData({ ...result, answers })
            return
          }
        }
      } catch {
        // sessionStorage unavailable or corrupted — fall through to API
      }

      // ── Tier 2: KV via API (shared link / different tab / page refresh) ──────
      try {
        const res = await fetch(`/api/reports/${id}`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setError(body.error || 'Report not found.')
          return
        }
        const result = await res.json()
        setData(result)
        track('report_shared_viewed', { reportId: id })
      } catch {
        setError('Network error — could not load report. Please check your connection.')
      }
    }

    load()
  }, [id])

  if (error)  return <ErrorView error={error} onBack={() => router.push('/questionnaire')} />
  if (!data)  return <Spinner />
  return <ReportRenderer data={data} reportId={id} />
}

// ─── Loading spinner ──────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#EFEBE1' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ width: '36px', height: '36px', border: `4px solid ${NAVY}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )
}

// ─── Error state ──────────────────────────────────────────────────────────────
function ErrorView({ error, onBack }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#EFEBE1', padding: '24px', fontFamily: 'var(--font-body)' }}>
      <div style={{ maxWidth: '440px', width: '100%', background: '#fff', borderRadius: '8px', padding: '40px 32px', boxShadow: '0 2px 16px rgba(0,0,0,0.10)', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '16px' }}>📄</div>
        <h2 style={{ color: NAVY, fontSize: '20px', fontWeight: 700, margin: '0 0 12px' }}>
          Report not available
        </h2>
        <p style={{ color: '#555', fontSize: '14px', lineHeight: 1.6, margin: '0 0 24px' }}>
          {error}
        </p>
        <button
          onClick={onBack}
          style={{ padding: '12px 28px', background: NAVY, color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          ← Generate a new report
        </button>
      </div>
    </div>
  )
}
