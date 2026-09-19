'use client'

/**
 * /sample — a public, fixed example of what the tool produces.
 *
 * The record in public/sample/report.json is a real generation for a fictional
 * project (same pipeline, same workbooks, same AI prose step), saved without
 * the .docx payload. It is served as a static file so this page needs no KV,
 * no API key and no access cookie — it is the one report a prospective user
 * can read before they have a code. Regenerate it whenever the report
 * structure changes: run the questionnaire locally, then save the record from
 * /api/reports/<id> (minus `docx`) over the file.
 */

import { useEffect, useState } from 'react'
import ReportRenderer from '../report/ReportRenderer'

export default function SamplePage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    fetch('/sample/report.json')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(d => { if (alive) setData(d) })
      .catch(() => { if (alive) setError('The sample report is not available right now.') })
    return () => { alive = false }
  }, [])

  if (error) {
    return (
      <div role="alert" style={{ maxWidth: 640, margin: '80px auto', padding: '0 24px', color: 'var(--ink)', fontFamily: 'var(--font-body)' }}>
        <p className="eyebrow">Sample report</p>
        <p style={{ fontSize: 16 }}>{error}</p>
      </div>
    )
  }
  if (!data) {
    return (
      <div role="status" aria-live="polite" style={{ maxWidth: 640, margin: '80px auto', padding: '0 24px', color: 'var(--text-mute)', fontFamily: 'var(--font-body)' }}>
        Loading the sample report…
      </div>
    )
  }
  return <ReportRenderer data={data} reportId={null} sample />
}
