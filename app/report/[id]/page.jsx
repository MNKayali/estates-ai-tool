'use client'

/**
 * /report/[id]  — canonical, shareable report URL
 *
 * Now also the Phase 2 driver. generate-report (Phase 1) returns in a few
 * seconds with the deterministic cost/programme data and status
 * 'deterministic' — no AI prose yet. This page loads that record, renders it
 * immediately (ReportRenderer shows pending placeholders for anything AI-only),
 * and repeatedly calls POST /api/reports/[id]/prose until status flips to
 * 'complete'. Each call gets a brand-new 60s ceiling, so a slow API day costs
 * extra round trips rather than a lost, already-paid-for report.
 *
 * Any tab showing an unfinished report drives it (September 2026, owner-only
 * reports): a second tab is the same person reopening it, and the per-half
 * locks stop two tabs paying for the same half — a tab that finds both halves
 * locked gets 409 and simply waits. Before reports were owner-only, a tab
 * opened from a shared link only polled /status, which left a report whose
 * generating tab had been closed unfinished for good.
 *
 * Loading strategy for the initial record (unchanged two-tier):
 *   1. sessionStorage — avoids a network round-trip when this tab is the one
 *      that just generated the report.
 *   2. GET /api/reports/[id] — the path a shared link / different tab takes.
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { track } from '@vercel/analytics'
import ReportRenderer from '../ReportRenderer'

const NAVY = '#1A2E4A'

// If prose generation hasn't completed after this many consecutive rounds with
// no forward progress, stop looping and show a manual retry rather than
// spinning forever — most likely cause at that point is a hard failure (e.g.
// a bad or exhausted API key), not ordinary latency.
const MAX_STALLED_ROUNDS = 8
const POLL_INTERVAL_MS = 3_000

export default function ReportByIdPage() {
  const { id }  = useParams()
  const router  = useRouter()
  const [data,  setData]  = useState(null)
  const [error, setError] = useState('')
  const [signInHint, setSignInHint] = useState(false)
  const [stalled, setStalled] = useState(false)
  // `{ user, trial, admin }` — decides whether downloads need sign-up.
  const [viewer, setViewer] = useState(null)
  const drivingRef = useRef(false)

  useEffect(() => {
    let alive = true
    fetch('/api/auth/status').then(r => r.json()).then(d => { if (alive) setViewer(d) }).catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    let cancelled = false

    async function load() {
      // ── Tier 1: sessionStorage (same-tab, fresh generation) ──────────────────
      try {
        const stored = sessionStorage.getItem('estatesAI_result')
        if (stored) {
          const result = JSON.parse(stored)
          if (result.reportId === id) {
            // `result.answers` is exactly what was submitted for this report —
            // the questionnaire writes it into this same sessionStorage entry
            // at submit time (see submit() in app/questionnaire/page.jsx). It
            // used to be overwritten here with the *current* localStorage
            // draft, which is the questionnaire's live, ongoing state — if the
            // user went back to the questionnaire and changed anything (or
            // started a second report) without generating again, navigating
            // back to this report would then render its stored costs and
            // programme against a different project's answers. There is
            // nothing to merge: use what was actually submitted.
            if (!cancelled) setData(result)
            return result
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
          if (!cancelled) {
            setError(body.error || 'Report not found.')
            setSignInHint(!!body.signIn)
          }
          return null
        }
        const result = await res.json()
        if (!cancelled) setData(result)
        track('report_shared_viewed', { reportId: id })
        return result
      } catch {
        if (!cancelled) setError('Network error — could not load report. Please check your connection.')
        return null
      }
    }

    async function sleep(ms) {
      await new Promise(resolve => setTimeout(resolve, ms))
    }

    // The tab that just generated the report drives Phase 2 by repeatedly
    // calling POST /prose (each call a fresh 60s) until status is 'complete'.
    async function driveProse(initial) {
      if (drivingRef.current) return
      drivingRef.current = true
      let record = initial
      let stalledRounds = 0

      while (!cancelled && record?.status && record.status !== 'complete') {
        let res
        try {
          res = await fetch(`/api/reports/${id}/prose`, { method: 'POST', signal: controller.signal })
        } catch {
          if (cancelled) return
          stalledRounds++
          if (stalledRounds >= MAX_STALLED_ROUNDS) { setStalled(true); return }
          await sleep(POLL_INTERVAL_MS)
          continue
        }

        if (res.status === 409) {
          await sleep(POLL_INTERVAL_MS)
          continue
        }

        const body = await res.json().catch(() => ({}))
        if (cancelled) return

        if (!res.ok) {
          stalledRounds++
          if (stalledRounds >= MAX_STALLED_ROUNDS) { setStalled(true); return }
          await sleep(POLL_INTERVAL_MS)
          continue
        }

        record = body
        setData(prev => ({ ...prev, ...body }))

        if (body.status === 'complete') {
          track('report_generation_complete', { reportId: id })
          return
        }

        // Made a round trip but not complete — either genuine progress (one
        // half landed) or a transient failure on this attempt. Either way the
        // next call gets a fresh 60s; only bail out after many rounds with no
        // sign of life at all.
        const progressed = body.prose?.narrative || body.prose?.risk
        stalledRounds = progressed ? 0 : stalledRounds + 1
        if (stalledRounds >= MAX_STALLED_ROUNDS) { setStalled(true); return }
      }
    }

    // Every tab drives an unfinished report, not only the one that generated
    // it: reports are owner-only, so another tab is the same person (or the
    // admin) reopening it — from "My reports" after closing the original tab,
    // say — and a passive watcher would then wait forever for text nobody was
    // generating. The per-half KV locks keep two tabs from paying twice; the
    // loser gets 409 and waits (see driveProse).
    load().then(result => {
      if (cancelled || !result) return
      if (result.status && result.status !== 'complete') driveProse(result)
    })

    return () => { cancelled = true; controller.abort() }
  }, [id])

  if (error)  return <ErrorView error={error} signInHref={signInHint ? `/login?from=/report/${id}` : null} onBack={() => router.push('/questionnaire')} />
  if (!data)  return <Spinner />
  if (stalled && data.status !== 'complete') {
    return <StalledView onRetry={() => { setStalled(false); drivingRef.current = false; router.refresh() }} />
  }
  return (
    <ReportRenderer data={data} reportId={id}
      signedIn={!viewer || !!viewer.user}
      accountRequired={!!viewer && !viewer.user && !viewer.admin}
      onAccountCreated={() => setViewer(v => ({ ...v, user: {}, trial: null }))} />
  )
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
function ErrorView({ error, signInHref, onBack }) {
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
        {signInHref && (
          <p style={{ fontSize: '14px', margin: '0 0 20px' }}>
            <a href={signInHref} style={{ color: NAVY, fontWeight: 700, textDecoration: 'underline' }}>Sign in to open your report</a>
          </p>
        )}
        <button
          onClick={onBack}
          style={{ padding: '12px 28px', background: NAVY, color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          ← Generate a new report
        </button>
      </div>
    </div>
  )
}

// ─── Stalled generation — manual retry ─────────────────────────────────────────
function StalledView({ onRetry }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#EFEBE1', padding: '24px', fontFamily: 'var(--font-body)' }}>
      <div style={{ maxWidth: '440px', width: '100%', background: '#fff', borderRadius: '8px', padding: '40px 32px', boxShadow: '0 2px 16px rgba(0,0,0,0.10)', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '16px' }}>⏳</div>
        <h2 style={{ color: NAVY, fontSize: '20px', fontWeight: 700, margin: '0 0 12px' }}>
          Still working on it
        </h2>
        <p style={{ color: '#555', fontSize: '14px', lineHeight: 1.6, margin: '0 0 24px' }}>
          The cost and programme figures below are ready, but the narrative sections are taking longer than usual to generate. Your progress is saved — try again in a moment.
        </p>
        <button
          onClick={onRetry}
          style={{ padding: '12px 28px', background: NAVY, color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          Try again
        </button>
      </div>
    </div>
  )
}
